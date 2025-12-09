// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search.json';

// Sử dụng model thông minh và miễn phí để làm "Decision Maker"
// Gemini Flash 2.0 Exp rất giỏi trong việc trả về JSON chuẩn xác
const DECISION_MODEL = 'google/gemini-2.0-flash-exp:free'; 

// ----------------------------
// Helpers
// ----------------------------
async function safeFetch(url, opts = {}, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function cleanResponse(text) {
    if (!text) return "";
    let cleaned = text.replace(/<\|.*?\|>/g, ""); 
    cleaned = cleaned.replace(/\{"query":.*?\}/g, "");
    cleaned = cleaned.replace(/```json/g, "").replace(/```/g, ""); // Clean markdown code blocks if any
    return cleaned.trim();
}

// ----------------------------
// 1. SMART ROUTER (Decision Layer)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  const lower = userPrompt.toLowerCase();

  // 1.1 SKIP RULES (Tuyệt đối không tìm kiếm với các tác vụ này)
  const skipTriggers = [
      'viết', 'write', 'dịch', 'translate', 'code', 'lập trình', 'tính', 'calculate', 
      'giải', 'solve', 'tạo', 'create', 'sáng tác', 'compose', 'check', 'kiểm tra lỗi',
      'viet', 'dich', 'lap trinh', 'tinh', 'giai', 'tao', 'sang tac', 'kiem tra', 'sua loi',
      'fix', 'debug', 'html', 'css', 'javascript', 'python'
  ];
  if (skipTriggers.some(w => lower.startsWith(w))) {
      debugSteps.push({ router: 'skip_rule', msg: 'Skipping search (Creative/Coding task)' });
      return { needed: false, query: '' };
  }

  // 1.2 FORCE RULES (Bắt buộc tìm kiếm với các từ khóa này)
  const forceTriggers = [
      'thời tiết', 'weather', 'giá', 'price', 'tin tức', 'news', 'sự kiện', 'event',
      'tỷ số', 'score', 'lịch thi đấu', 'schedule', 'kết quả', 'result',
      'ở đâu', 'location', 'địa chỉ', 'address', 'review', 'đánh giá',
      'hom nay', 'hôm nay', 'moi nhat', 'mới nhất', 'bao nhieu', 'ty gia',
      'ai la', 'who is', 'cai gi', 'what is'
  ];

  if (forceTriggers.some(w => lower.includes(w))) {
      debugSteps.push({ router: 'force_rule', msg: 'Forcing search (Info keyword detected)' });
      return { needed: true, query: userPrompt };
  }

  // 1.3 AI DECISION (Dùng AI để phán đoán)
  if (!apiKey) return { needed: false, query: '' };

  try {
    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" }, // Yêu cầu trả về JSON
      messages: [
        { 
            role: 'system', 
            content: `You are a Search Decision Agent. Analyze the user prompt.
            Return JSON: { "needed": boolean, "query": "string" }
            - "needed": true if the user asks for real-time information, news, weather, facts, prices, or external data.
            - "needed": false if the user asks for coding, creative writing, translation, chit-chat, or general knowledge.
            - "query": optimize the search query for Google if needed.
            Example: User "Ai thắng trận MU hôm qua?" -> {"needed": true, "query": "Manchester United result yesterday"}
            Example: User "Viết code web" -> {"needed": false, "query": ""}`
        },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 5000); // 5s Timeout cho việc quyết định
    
    if (!res.ok) throw new Error('Router API failed');
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    
    let parsed;
    try { 
        parsed = JSON.parse(content); 
    } catch (e) { 
        // Nếu AI trả về định dạng sai, coi như không tìm kiếm
        parsed = { needed: false, query: userPrompt }; 
    }

    debugSteps.push({ router: 'ai_decision', output: parsed });
    return parsed;

  } catch (e) {
    // 1.4 ERROR FALLBACK (Yêu cầu của bạn: Lỗi -> Mặc định KHÔNG tìm kiếm)
    debugSteps.push({ router: 'error_fallback', error: e.message, msg: 'Defaulting to FALSE' });
    return { needed: false, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER (SerpAPI - Google)
// ----------------------------
async function searchSerpApi(query, apiKey, debugSteps) {
    if (!apiKey) {
        debugSteps.push({ serp_error: 'MISSING_API_KEY' });
        return null;
    }

    try {
        // Construct URL with query parameters
        const params = new URLSearchParams({
            engine: "google",
            q: query,
            api_key: apiKey,
            num: "5", // Lấy top 5 kết quả
            hl: "vi", // Ưu tiên ngôn ngữ Việt (hoặc 'en' tùy bạn)
            gl: "vn"  // Ưu tiên vị trí Việt Nam
        });

        const res = await safeFetch(`${SERPAPI_URL}?${params.toString()}`, {
            method: 'GET'
        }, 15000);

        if (!res.ok) {
            const txt = await res.text();
            debugSteps.push({ serp_fail: res.status, msg: txt });
            return null;
        }

        const data = await res.json();
        let results = [];

        // 2.1 Ưu tiên Answer Box (Câu trả lời trực tiếp của Google)
        if (data.answer_box) {
            let answer = "";
            if (data.answer_box.snippet) answer = data.answer_box.snippet;
            else if (data.answer_box.answer) answer = data.answer_box.answer;
            else if (data.answer_box.result) answer = data.answer_box.result; // Cho các phép tính/tỷ giá

            if (answer) {
                results.push({
                    title: "Google Direct Answer",
                    link: data.answer_box.link || "Google Search",
                    content: `[Direct Answer]: ${answer}`
                });
            }
        }

        // 2.2 Knowledge Graph (Bảng thông tin bên phải)
        if (data.knowledge_graph) {
            results.push({
                title: data.knowledge_graph.title || "Knowledge Graph",
                link: data.knowledge_graph.source?.link || "",
                content: data.knowledge_graph.description || ""
            });
        }

        // 2.3 Organic Results (Kết quả tìm kiếm tự nhiên)
        if (data.organic_results && Array.isArray(data.organic_results)) {
            data.organic_results.forEach(r => {
                results.push({
                    title: r.title,
                    link: r.link,
                    content: r.snippet || "No description available."
                });
            });
        }

        if (results.length > 0) return results;
        return null;

    } catch (e) {
        debugSteps.push({ serp_exception: String(e) });
        return null;
    }
}

// ----------------------------
// 3. MAIN WORKER
// ----------------------------
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const { modelName = 'Smart', messages = [] } = body;
    const debug = { steps: [] };

    // --- CONFIG MODEL ---
    const apiConfig = {
      Mini: { 
          key: env.MINI_API_KEY, 
          model: 'qwen/qwen-2.5-7b-instruct:free' 
      },
      Smart: { 
          key: env.SMART_API_KEY, 
          model: 'google/gemini-2.0-flash-exp:free' 
      },
      Nerd: { 
          key: env.NERD_API_KEY, 
          model: 'thudm/glm-4-9b-chat:free' 
      }
    };

    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- B1: PHÂN TÍCH (ROUTER) ---
    // Sử dụng Smart Key hoặc một key riêng cho Router
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY; 
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- B2: GỌI SERPAPI (GOOGLE) ---
    if (analysis.needed) {
        // Lưu ý: Cần thêm biến môi trường SERPAPI_KEY
        const results = await searchSerpApi(analysis.query, env.SERPAPI_KEY, debug.steps);
        if (results) {
            toolUsed = 'Google Search (SerpAPI)';
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Source: ${r.link}\n   Content: ${r.content}`
            ).join('\n\n');
        } else {
            toolUsed = 'Search Failed (Internal Only)';
        }
    }

    // --- B3: CHUẨN BỊ CONTEXT CHO AI ---
    const finalMessages = [...messages];

    if (searchContext) {
        const lastIdx = finalMessages.length - 1;
        finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: GOOGLE SEARCH RESULTS]
${searchContext}

[INSTRUCTION]
Answer the user's query using the information above. 
If the search results answer the question, cite the source number like [1] or [2].
If the search results are irrelevant, ignore them and answer with your internal knowledge.
Current Date: ${new Date().toLocaleDateString('vi-VN')}
`;
    }

    // Clean System Prompt
    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: 'You are Oceep. Helpful, direct and accurate.' });

    // --- B4: GỌI MODEL TRẢ LỜI ---
    const modelRes = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
          model: config.model,
          messages: cleanMessages,
          max_tokens: 2000
      })
    }, 45000);

    if (!modelRes.ok) {
        const errorText = await modelRes.text();
        try {
            const errJson = JSON.parse(errorText);
            const msg = errJson.error?.message || errorText;
            throw new Error(`OpenRouter Error (${config.model}): ${msg}`);
        } catch (e) {
            throw new Error(`OpenRouter Failed ${modelRes.status}: ${errorText}`);
        }
    }

    const data = await modelRes.json();
    let answer = data?.choices?.[0]?.message?.content || '';
    answer = cleanResponse(answer);

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ 
        error: err.message, 
        stack: err.stack 
    }), { status: 500, headers: corsHeaders });
  }
}
