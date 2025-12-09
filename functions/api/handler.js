// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search.json';

// Đã đổi về model arcee-ai/trinity-mini:free theo yêu cầu
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 

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
    cleaned = cleaned.replace(/```json/g, "").replace(/```/g, ""); // Xóa markdown code block
    return cleaned.trim();
}

// ----------------------------
// 1. SMART ROUTER (Decision Layer)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  const lower = userPrompt.toLowerCase();

  // 1.1 SKIP RULES (Tuyệt đối không tìm kiếm)
  const skipTriggers = [
      'viết', 'write', 'dịch', 'translate', 'code', 'lập trình', 'tính', 'calculate', 
      'giải', 'solve', 'tạo', 'create', 'sáng tác', 'compose', 'check', 'kiểm tra lỗi',
      'viet', 'dich', 'lap trinh', 'tinh', 'giai', 'tao', 'sang tac', 'kiem tra', 'sua loi',
      'fix', 'debug', 'html', 'css', 'javascript', 'python'
  ];
  if (skipTriggers.some(w => lower.startsWith(w))) {
      debugSteps.push({ router: 'skip_rule', msg: 'Skipping search' });
      return { needed: false, query: '' };
  }

  // 1.2 FORCE RULES (Bắt buộc tìm kiếm)
  const forceTriggers = [
      'thời tiết', 'weather', 'giá', 'price', 'tin tức', 'news', 'sự kiện', 'event',
      'tỷ số', 'score', 'lịch thi đấu', 'schedule', 'kết quả', 'result',
      'ở đâu', 'location', 'địa chỉ', 'address', 'review', 'đánh giá',
      'hom nay', 'hôm nay', 'moi nhat', 'mới nhất', 'bao nhieu', 'ty gia',
      'ai la', 'who is', 'cai gi', 'what is'
  ];

  if (forceTriggers.some(w => lower.includes(w))) {
      debugSteps.push({ router: 'force_rule', msg: 'Forcing search' });
      return { needed: true, query: userPrompt };
  }

  // 1.3 AI DECISION (Trinity Mini)
  if (!apiKey) return { needed: false, query: '' };

  try {
    const payload = {
      model: DECISION_MODEL,
      // Trinity Mini đôi khi không hỗ trợ json_object mode chuẩn, nên ta bỏ response_format
      // và dùng prompt engineering mạnh hơn để ép trả về JSON.
      messages: [
        { 
            role: 'system', 
            content: `You are a Search Decision tool.
            Output ONLY valid JSON: { "needed": boolean, "query": "string" }
            - "needed": true for real-time news, weather, prices, facts.
            - "needed": false for chat, coding, translation.
            - "query": simple keyword for Google.
            DO NOT explain.`
        },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 60,
      temperature: 0
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 5000); 
    
    if (!res.ok) throw new Error('Router API failed');
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    
    let parsed;
    try { 
        // Trinity Mini có thể trả về text thừa, cố gắng tìm chuỗi JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        parsed = JSON.parse(jsonStr); 
    } catch (e) { 
        // Lỗi parse JSON -> mặc định FALSE
        parsed = { needed: false, query: userPrompt }; 
    }

    debugSteps.push({ router: 'ai_decision', output: parsed });
    return parsed;

  } catch (e) {
    // 1.4 ERROR FALLBACK (Lỗi -> Mặc định KHÔNG tìm kiếm)
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
        const params = new URLSearchParams({
            engine: "google",
            q: query,
            api_key: apiKey,
            num: "5", 
            hl: "vi", 
            gl: "vn"
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

        // 2.1 Ưu tiên Answer Box
        if (data.answer_box) {
            let answer = "";
            if (data.answer_box.snippet) answer = data.answer_box.snippet;
            else if (data.answer_box.answer) answer = data.answer_box.answer;
            else if (data.answer_box.result) answer = data.answer_box.result;

            if (answer) {
                results.push({
                    title: "Google Direct Answer",
                    link: data.answer_box.link || "Google Search",
                    content: `[Direct Answer]: ${answer}`
                });
            }
        }

        // 2.2 Knowledge Graph
        if (data.knowledge_graph) {
            results.push({
                title: data.knowledge_graph.title || "Knowledge Graph",
                link: data.knowledge_graph.source?.link || "",
                content: data.knowledge_graph.description || ""
            });
        }

        // 2.3 Organic Results
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
          model: 'openai/gpt-oss-20b:free' 
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

    // --- B3: CHUẨN BỊ CONTEXT ---
    const finalMessages = [...messages];

    if (searchContext) {
        const lastIdx = finalMessages.length - 1;
        finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: GOOGLE SEARCH RESULTS]
${searchContext}

[INSTRUCTION]
Answer using the search results above.
Cite sources like [1].
Current Date: ${new Date().toLocaleDateString('vi-VN')}
`;
    }

    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: 'You are Oceep. Helpful and accurate.' });

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
