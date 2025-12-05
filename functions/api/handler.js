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
async function safeFetch(url, opts = {}, ms = 25000) {
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

// Helper lấy tên miền đẹp (vd: vnexpress.net -> Vnexpress)
function getDomainName(url) {
    try {
        const hostname = new URL(url).hostname;
        let name = hostname.replace('www.', '');
        name = name.split('.')[0]; 
        return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
        return "Source";
    }
}

// ----------------------------
// 1. SMART ROUTER (Bộ lọc thông minh)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  const lower = userPrompt.toLowerCase();

  // SKIP RULES (Né Search)
  const skipTriggers = [
      'viết', 'write', 'dịch', 'translate', 'code', 'lập trình', 'tính', 'calculate', 
      'giải', 'solve', 'tạo', 'create', 'sáng tác', 'compose', 'check', 'kiểm tra lỗi',
      'viet', 'dich', 'lap trinh', 'tinh', 'giai', 'tao', 'sang tac', 'kiem tra', 'sua loi',
      'html', 'css', 'javascript', 'python', 'fix bug'
  ];
  if (skipTriggers.some(w => lower.startsWith(w) || lower.includes(` ${w} `))) {
      debugSteps.push({ router: 'skip_rule', msg: 'Skipping search' });
      return { needed: false, query: '' };
  }

  // FORCE RULES (Ép Search)
  const forceTriggers = [
      'address', 'location', 'weather', 'price', 'news', 'latest', 'who is', 'what is', 'review',
      'địa chỉ', 'ở đâu', 'chỗ nào', 'thời tiết', 'giá', 'tin tức', 'sự kiện', 'hôm nay', 
      'mới nhất', 'là gì', 'bao nhiêu', 'tỷ giá', 'kết quả', 'lịch thi đấu',
      'dia chi', 'o dau', 'cho nao', 'thoi tiet', 'gia', 'tin tuc', 'su kien', 'hom nay', 'hnay',
      'moi nhat', 'la gi', 'bao nhieu', 'ty gia', 'ket qua', 'lich thi dau', 'review'
  ];

  if (forceTriggers.some(w => lower.includes(w))) {
      debugSteps.push({ router: 'force_rule', msg: 'Forcing search' });
      return { needed: true, query: userPrompt };
  }

  // AI DECISION
  if (!apiKey) return { needed: false, query: '' };

  try {
    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: 'Return JSON { "needed": boolean, "query": "string" }. True for Real-Time Facts/News/Weather. False for Chat/Code/Math.' },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 50,
      temperature: 0
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 4000);
    
    if (!res.ok) throw new Error('Router API failed');
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { parsed = { needed: false, query: userPrompt }; }
    debugSteps.push({ router: 'ai_decision', output: parsed });
    return parsed;
  } catch (e) {
    return { needed: false, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER (Exa.ai)
// ----------------------------
async function searchExa(query, apiKey, debugSteps) {
    if (!apiKey) {
        debugSteps.push({ exa_error: 'MISSING_API_KEY' });
        return null;
    }

    try {
        const payload = {
            query: query,
            type: "neural",
            useAutoprompt: true,
            numResults: 2, 
            contents: { text: { maxCharacters: 1200 } }
        };

        const res = await safeFetch(EXA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify(payload)
        }, 15000);

        if (!res.ok) {
            const txt = await res.text();
            debugSteps.push({ exa_fail: res.status, msg: txt });
            return null;
        }

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
        debugSteps.push({ exa_exception: String(e) });
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

    // --- CẤU HÌNH MODEL (THEO YÊU CẦU CỦA BẠN) ---
    const apiConfig = {
      Mini: { 
          key: env.MINI_API_KEY, 
          model: 'qwen/qwen3-4b:free' 
      },
      Smart: { 
          key: env.SMART_API_KEY, 
          model: 'mistralai/mistral-small-3.1-24b-instruct:free' 
      },
      Nerd: { 
          key: env.NERD_API_KEY, 
          model: 'z-ai/glm-4.5-air:free' 
      }
    };

    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- B1: PHÂN TÍCH ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- B2: GỌI EXA ---
    if (analysis.needed) {
        const results = await searchExa(analysis.query, env.EXA_API_KEY, debug.steps);
        if (results) {
            toolUsed = 'WebSearch (Exa.ai)';
            searchContext = results.map((r, i) => 
                `[${i+1}] SOURCE_NAME: "${r.sourceName}"\n   LINK: ${r.link}\n   CONTENT: ${r.content.replace(/\n+/g, ' ').slice(0, 1000)}...`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (Exa Failed)';
        }
    }

    // --- B3: TRẢ LỜI ---
    const finalMessages = [...messages];

    if (searchContext) {
        const lastIdx = finalMessages.length - 1;
        
        // INJECT DATA + INSTRUCTION CHO PILL FORMAT
        finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: REAL-TIME SEARCH RESULTS]
${searchContext}

[CRITICAL INSTRUCTION]
1. Answer the user's query based ONLY on the search results above.
2. CITATION FORMAT: You MUST use Markdown Links for citations.
   Format: **[Source Name](URL)**
   Example: "Giá vé là 2 triệu **[VietnamAirlines](https://.../ve-may-bay)**"
   Place the citation immediately after the relevant fact.
3. LANGUAGE: Answer in the SAME LANGUAGE as the User's Query (Vietnamese/English).
`;
    }

    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ 
        role: 'system', 
        content: 'You are Oceep. Always cite sources using Markdown links: **[Source](Link)**.' 
    });

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
        throw new Error(`OpenRouter Failed: ${errorText}`);
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
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
