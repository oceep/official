// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const SEARCH_TIMEOUT_MS = 10000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 

// ----------------------------
// Helpers
// ----------------------------
function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function safeFetch(url, opts = {}, ms = 10000) {
  const t = timeoutSignal(ms);
  try {
    const res = await fetch(url, { ...opts, signal: t.signal });
    t.clear();
    return res;
  } catch (e) {
    t.clear();
    throw e;
  }
}

// ----------------------------
// 1) QUERY GENERATOR
// ----------------------------
async function generateSearchQuery(userPrompt, apiKey, debugSteps) {
  if (!apiKey) return { needed: true, query: userPrompt };

  try {
    const systemPrompt = `You are a Search Optimizer.
    Analyze the user's request.
    1. DECIDE: Does this need external info? (True/False)
    2. QUERY: If True, write the BEST search query.
    RETURN JSON ONLY: { "needed": boolean, "query": "string" }`;

    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 60,
      temperature: 0.1
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 4000);
    
    if (!res.ok) throw new Error('Query Gen Failed');
    
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { 
        const needed = content.toLowerCase().includes('true');
        parsed = { needed, query: userPrompt };
    }
    debugSteps.push({ step: 'query_gen', output: parsed });
    return parsed;
  } catch (e) {
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) SEARCH LAYER (Brave Search)
// ----------------------------
async function searchBrave(query, debugSteps) {
  try {
    const url = `https://search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    }, SEARCH_TIMEOUT_MS);

    if (!res.ok) {
      debugSteps.push({ brave_error: res.status });
      return null;
    }
    const data = await res.json();
    if (!data || !data.web || !data.web.results) return null;

    return data.web.results.map(r => ({
      title: r.title || 'No Title',
      link: r.url || r.source || '',
      snippet: r.description || ''
    }));
  } catch (e) {
    debugSteps.push({ brave_exception: String(e) });
    return null;
  }
}

// ----------------------------
// 3) MAIN WORKER
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

    // Config
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

    // --- STEP 1 & 2: Search ---
    const queryKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await generateSearchQuery(lastMsg, queryKey, debug.steps);

    if (decision.needed) {
        const results = await searchBrave(decision.query, debug.steps);
        if (results && results.length > 0) {
            toolUsed = 'WebSearch (Brave)';
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Source: ${r.link}\n   Summary: ${r.snippet}`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (No Results)';
        }
    }

    // --- STEP 3: ANSWER (Chiến thuật mới) ---
    const finalMessages = [...messages];

    // Thay vì dùng System Prompt, ta "nhét" kết quả vào thẳng tin nhắn cuối cùng của User.
    // Điều này ép Model phải đọc nó như một phần của câu hỏi.
    if (searchContext) {
        const lastUserIndex = finalMessages.length - 1;
        
        // Tạo một nội dung User mới: "Câu hỏi cũ" + "Dữ liệu tìm được"
        finalMessages[lastUserIndex].content = `
User Question: "${lastMsg}"

Below is real-time information I found on the web. Use it to answer the question above.
[START WEB DATA]
${searchContext}
[END WEB DATA]

IMPORTANT: Answer naturally in the user's language. Do NOT output JSON code. Do NOT output "query": "...". Just speak.
`;
    }

    // System Prompt chỉ dùng để định hình tính cách
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep. You are a helpful assistant.
        Refuse to act as a search engine. Do NOT output JSON. Do NOT output code blocks.
        Simply answer the user's question using the provided text.`
    };
    
    // Đảm bảo System Prompt nằm đầu
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

    // --- FINAL SAFEGUARD (Bộ lọc cuối cùng) ---
    // Nếu nó vẫn ngoan cố trả về JSON, ta sẽ "ép" nó thành text
    if (answer.trim().startsWith('{') && answer.includes('"query"')) {
        answer = "Xin lỗi, tôi đã tìm thấy thông tin nhưng gặp lỗi hiển thị. (Error: JSON Output Detected). Hãy hỏi lại cụ thể hơn.";
        // Hoặc bạn có thể tự parse JSON đó nếu muốn, nhưng tốt nhất là báo lỗi.
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
