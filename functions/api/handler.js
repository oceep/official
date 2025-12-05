// functions/api/handler.js

/**
 * handler.js — "LLM Web Search" (Strict Answer Mode)
 * FIX: Ngăn chặn Model in ra JSON/Code search. Bắt buộc trả lời bằng lời nói.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const SEARCH_TIMEOUT_MS = 15000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 
const SCRAPERX_ENDPOINT = 'https://api.scraperx.com/'; 

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
    2. QUERY: If True, write the BEST Google search query.
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
    }, 5000);
    
    if (!res.ok) throw new Error('Query Gen Failed');
    
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { parsed = { needed: true, query: userPrompt }; }

    debugSteps.push({ step: 'query_gen', output: parsed });
    return parsed;
  } catch (e) {
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) SEARCH LAYER
// ----------------------------
async function searchDDGLite(query) {
    try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const res = await safeFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
        }, 8000);
        if (!res.ok) return null;
        const html = await res.text();
        const results = [];
        const regex = /<a class="result-link" href="(.*?)">(.*?)<\/a>[\s\S]*?<td class="result-snippet">(.*?)<\/td>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
            results.push({
                link: match[1],
                title: match[2].replace(/<[^>]+>/g, ''),
                snippet: match[3].replace(/<[^>]+>/g, '')
            });
        }
        return results.length ? results : null;
    } catch (e) { return null; }
}

async function searchScraperX(query, apiKey, debugSteps) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=vi&gl=vn`;
  const apiUrl = new URL(SCRAPERX_ENDPOINT);
  apiUrl.searchParams.set('api_key', apiKey);
  apiUrl.searchParams.set('url', googleUrl);
  apiUrl.searchParams.set('autoparse', 'true');

  try {
    const res = await safeFetch(apiUrl.toString(), { method: 'GET' }, SEARCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.organic_results || data.organic || data.results || [];
    return results.length ? results.slice(0, 5) : null;
  } catch (e) { return null; }
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

    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let injectionData = '';

    // --- STEP 1: QUERY GEN ---
    const queryKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await generateSearchQuery(lastMsg, queryKey, debug.steps);

    // --- STEP 2: SEARCH ---
    if (decision.needed) {
        let results = null;
        if (env.SCRAPERX_API_KEY) {
            results = await searchScraperX(decision.query, env.SCRAPERX_API_KEY, debug.steps);
            if (results) toolUsed = 'WebSearch (ScraperX)';
        }
        if (!results) {
            results = await searchDDGLite(decision.query);
            if (results) toolUsed = 'WebSearch (DDG Lite)';
        }

        if (results) {
            const context = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\nSource: ${r.link}\nSummary: ${r.snippet}`
            ).join('\n\n');

            // Cập nhật Prompt Inject để Model hiểu rõ hơn
            injectionData = `
==========
SYSTEM NOTE: WEB SEARCH RESULTS ACQUIRED.
The user asked: "${lastMsg}"
Real-time Search Results are below:
${context}
==========
`;
        } else {
            toolUsed = 'WebSearch (Failed)';
        }
    }

    // --- STEP 3: ANSWER (FIXED PROMPT) ---
    const finalMessages = [...messages];
    
    // Prompt cực kỳ nghiêm ngặt để cấm JSON/Code
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep, a helpful AI assistant.
        
        STRICT INSTRUCTIONS:
        1. I have ALREADY performed the web search for you. The results are attached above (SYSTEM NOTE).
        2. DO NOT output JSON, XML, or Search Commands (like "topn", "query").
        3. DO NOT output code blocks unless the user explicitly asked for programming code.
        4. YOUR TASK: Read the "Search Results" and write a DIRECT, NATURAL answer to the user.
        5. Answer in the same language as the user (Vietnamese/English).
        6. Cite sources using [1], [2].
        
        ${injectionData}`
    };

    // Đưa System Prompt lên đầu
    // Xóa các system prompt cũ nếu có để tránh conflict
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
    const answer = data?.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
