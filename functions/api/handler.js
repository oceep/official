// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CẤU HÌNH ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EXA_API_URL = 'https://api.exa.ai/search';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 

// ----------------------------
// Helpers
// ----------------------------
async function safeFetch(url, opts = {}, ms = 30000) {
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
    return cleaned.trim();
}

function getDomainName(url) {
    try {
        const hostname = new URL(url).hostname;
        let name = hostname.replace('www.', '').split('.')[0]; 
        return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) { return "Source"; }
}

// ----------------------------
// 1. SMART ROUTER (Đã tăng thời gian suy nghĩ)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  const lower = userPrompt.toLowerCase();

  // 1. SKIP RULES (Nhanh - Không cần AI)
  const skipTriggers = [
      'viết', 'write', 'dịch', 'translate', 'code', 'lập trình', 'tính', 'calculate', 
      'giải', 'solve', 'tạo', 'create', 'sáng tác', 'compose', 'check', 'kiểm tra lỗi',
      'viet', 'dich', 'lap trinh', 'tinh', 'giai', 'tao', 'sang tac', 'kiem tra', 'sua loi',
      'html', 'css', 'javascript', 'python', 'fix bug', 'chào', 'hello', 'hi', 'là ai', 'tên gì'
  ];
  if (skipTriggers.some(w => lower.startsWith(w) || lower.includes(` ${w} `))) {
      return { needed: false, query: '' };
  }

  // 2. FORCE RULES (Nhanh - Không cần AI)
  const forceTriggers = [
      'address', 'location', 'weather', 'price', 'news', 'latest', 'what is', 'review',
      'địa chỉ', 'ở đâu', 'chỗ nào', 'thời tiết', 'giá', 'tin tức', 'sự kiện', 'hôm nay', 
      'mới nhất', 'là gì', 'bao nhiêu', 'tỷ giá', 'kết quả', 'lịch thi đấu',
      'dia chi', 'o dau', 'cho nao', 'thoi tiet', 'gia', 'tin tuc', 'su kien', 'hom nay', 'hnay',
      'moi nhat', 'la gi', 'bao nhieu', 'ty gia', 'ket qua', 'lich thi dau'
  ];

  if (forceTriggers.some(w => lower.includes(w))) {
      return { needed: true, query: userPrompt };
  }

  // 3. AI DECISION
  if (!apiKey) return { needed: false, query: '' };

  try {
    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: 'Return JSON { "needed": boolean, "query": "string" }. True for Real-Time Facts/News. False for Chat/Code.' },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 40,
      temperature: 0
    };
    
    // --- THAY ĐỔI Ở ĐÂY: Tăng lên 7500ms (7.5s) ---
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 7500); 
    
    if (!res.ok) return { needed: false, query: userPrompt };
    
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch (e) {
    // Nếu vẫn timeout thì bỏ qua search để trả lời luôn
    return { needed: false, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER
// ----------------------------
async function searchExa(query, apiKey, debugSteps) {
    if (!apiKey) return null;
    try {
        const payload = {
            query: query,
            type: "neural",
            useAutoprompt: true,
            numResults: 2, 
            contents: { text: { maxCharacters: 1000 } }
        };
        // Timeout 12s cho search
        const res = await safeFetch(EXA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify(payload)
        }, 12000);

        if (!res.ok) return null;
        const data = await res.json();
        
        if (data && data.results && data.results.length > 0) {
            return data.results.map(r => ({
                title: r.title || 'No Title',
                link: r.url || '',
                sourceName: getDomainName(r.url || ''),
                content: (r.highlights && r.highlights[0]) ? r.highlights[0] : (r.text || '')
            }));
        }
        return null;
    } catch (e) {
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

    // --- MODEL CONFIG ---
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'qwen/qwen3-4b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'mistralai/mistral-small-3.1-24b-instruct:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'z-ai/glm-4.5-air:free' }
    };

    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- B1: PHÂN TÍCH (7.5s Timeout) ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- B2: TÌM KIẾM ---
    if (analysis.needed) {
        const results = await searchExa(analysis.query, env.EXA_API_KEY, debug.steps);
        if (results) {
            toolUsed = 'WebSearch (Exa.ai)';
            searchContext = results.map((r, i) => 
                `[${i+1}] SOURCE: "${r.sourceName}"\n   LINK: ${r.link}\n   INFO: ${r.content.replace(/\n+/g, ' ').slice(0, 800)}`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (Exa Failed)';
        }
    }

    // --- B3: TRẢ LỜI ---
    const finalMessages = [...messages];
    if (searchContext) {
        finalMessages[finalMessages.length - 1].content = `
User Query: "${lastMsg}"

[SEARCH RESULTS]
${searchContext}

[INSTRUCTION]
Answer using the search results.
CITATION FORMAT: **[Source Name](URL)**
LANGUAGE: Answer in the User's Language.
`;
    }

    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: 'You are Oceep. Cite sources as **[Source](Link)**.' });

    const modelRes = await safeFetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, messages: cleanMessages, max_tokens: 2000 })
    }, 45000); // 45s Timeout cho trả lời

    if (!modelRes.ok) {
        const errText = await modelRes.text();
        throw new Error(`OpenRouter Error: ${modelRes.status} - ${errText}`);
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
