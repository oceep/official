// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CẤU HÌNH ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ----------------------------
// Helpers
// ----------------------------
async function safeFetch(url, opts = {}, ms = 10000) {
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

// Hàm dọn dẹp tin rác (Tool Calls) từ Model
function cleanResponse(text) {
    if (!text) return "";
    // Xóa các thẻ dạng <|start|>...<|end|> hoặc <|call|> thường thấy ở các model Command-R/Qwen
    let cleaned = text.replace(/<\|.*?\|>/g, ""); 
    // Xóa các dòng chứa JSON query nếu còn sót
    cleaned = cleaned.replace(/\{"query":.*?\}/g, "");
    return cleaned.trim();
}

// ----------------------------
// 1. QUERY REFINER
// ----------------------------
async function refineSearchQuery(userPrompt, apiKey, debugSteps) {
  if (!apiKey) return { needed: true, query: userPrompt };

  try {
    const systemPrompt = `You are a Search Optimizer.
    Analyze the user's request.
    1. DECIDE: Does this need external info? (True/False)
    2. QUERY: If True, write the BEST DuckDuckGo search query.
    Rules: Output ONLY the keywords or "SKIP". No JSON.`;

    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 40,
      temperature: 0.1
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 5000);
    
    if (!res.ok) throw new Error('Refiner failed');
    const data = await res.json();
    const output = data?.choices?.[0]?.message?.content?.trim() || 'SKIP';

    if (output === 'SKIP' || output.length < 2) return { needed: false, query: '' };
    
    debugSteps.push({ step: 'refiner', query: output });
    return { needed: true, query: output };

  } catch (e) {
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER (DuckDuckGo VQD)
// ----------------------------
async function getVQDToken(query) {
    try {
        const res = await safeFetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`, {
            headers: { 'User-Agent': USER_AGENT }
        }, 5000);
        const text = await res.text();
        const match = text.match(/vqd=['"]?([0-9-]+)['"]?/);
        return match ? match[1] : null;
    } catch (e) { return null; }
}

async function searchDDG(query, debugSteps) {
    const vqd = await getVQDToken(query);
    if (!vqd) return null;

    const apiUrl = `https://links.duckduckgo.com/d.js?q=${encodeURIComponent(query)}&vqd=${vqd}&l=us-en&p=1&s=0&df=`;
    try {
        const res = await safeFetch(apiUrl, { headers: { 'User-Agent': USER_AGENT } }, 8000);
        if (!res.ok) return null;
        const data = await res.json();
        
        if (data && data.results) {
             const items = data.results.slice(0, 5).map(r => ({
                 title: r.t || 'No Title',
                 link: r.u || '',
                 snippet: r.a || ''
             }));
             debugSteps.push({ search_results: items.length });
             return items;
        }
        return null;
    } catch (e) { return null; }
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

    // Validate Config
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- SEARCH ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await refineSearchQuery(lastMsg, decisionKey, debug.steps);

    if (decision.needed) {
        const results = await searchDDG(decision.query, debug.steps);
        if (results) {
            toolUsed = 'WebSearch (DDG)';
            searchContext = results.map((r, i) => 
                `[${i+1}] ${r.title}\n   ${r.snippet}`
            ).join('\n\n');
        }
    }

    // --- ANSWER ---
    const finalMessages = [...messages];

    if (searchContext) {
        // Ép dữ liệu vào prompt người dùng để tránh hallucination
        const lastIdx = finalMessages.length - 1;
        finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: SEARCH RESULTS]
Query: "${decision.query}"
${searchContext}

[INSTRUCTION]
Answer the User Query using the Search Results. 
- Answer naturally in the user's language.
- DO NOT use XML tags like <|start|>.
- DO NOT generate tool calls. Just write the text response.
`;
    }

    const systemPrompt = {
        role: 'system',
        content: `You are Oceep. Provide helpful, direct answers. Do not act as a tool user.`
    };
    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift(systemPrompt);

    const modelRes = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
          model: config.model,
          messages: cleanMessages,
          max_tokens: 2000
      })
    }, 40000);

    if (!modelRes.ok) throw new Error('Model API failed');
    const data = await modelRes.json();
    let answer = data?.choices?.[0]?.message?.content || '';

    // --- BƯỚC QUAN TRỌNG: LÀM SẠCH OUTPUT ---
    // Loại bỏ các thẻ <|...|> hoặc JSON nếu model vẫn cố tình sinh ra
    answer = cleanResponse(answer);

    if (answer.length < 5) {
        answer = "Xin lỗi, tôi đã tìm thấy thông tin nhưng không thể hiển thị câu trả lời phù hợp. (Lỗi: Model Output Format).";
    }

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
