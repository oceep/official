// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search';   // <-- FIXED (AI Mode endpoint)
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
  cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "");
  return cleaned.trim();
}

// ----------------------------
// 1. SMART ROUTER (AI)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ router: 'missing_key', msg: 'No DECIDE_API_KEY provided' });
    return { needed: false, query: '' };
  }

  try {
    const payload = {
      model: DECISION_MODEL,
      messages: [
        { 
          role: 'system', 
          content: `You are a Search Decision tool.
          Output JSON ONLY: { "needed": boolean, "query": "string" }
          - needed: true if user asks for Real-time Info, Weather, News, Address, Facts.
          - needed: false for Chat, Code, Creative content.
          Query: keyword for Google.`
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      parsed = { needed: false, query: userPrompt };
    }

    debugSteps.push({ router: 'ai_decision', output: parsed });
    return parsed;

  } catch (e) {
    debugSteps.push({ router: 'error_fallback', error: e.message });
    return { needed: false, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER — GOOGLE AI MODE
// ----------------------------
async function searchSerpApi(query, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ serp_error: 'MISSING_SERPAPI_KEY' });
    return null;
  }

  try {
    const params = new URLSearchParams({
      engine: "google_ai_mode",   // <-- FIXED
      q: query,
      api_key: apiKey,
      hl: "vi",
      gl: "vn"
    });

    const res = await safeFetch(`${SERPAPI_URL}?${params.toString()}`, {
      method: 'GET'
    }, 20000);

    if (!res.ok) {
      const txt = await res.text();
      debugSteps.push({ serp_fail: res.status, msg: txt });
      return null;
    }

    const data = await res.json();
    debugSteps.push({ serp_data: data });

    let results = [];

    // AI MODE: answer + text + blocks
    if (data.answer) {
      results.push({
        title: "AI Answer",
        link: data.answer?.source_links?.[0]?.link || "",
        content: data.answer.text || ""
      });
    }

    if (data.text_blocks && Array.isArray(data.text_blocks)) {
      data.text_blocks.forEach(b => {
        if (b.text) {
          results.push({
            title: b.title || "AI Block",
            link: b.source_links?.[0]?.link || "",
            content: b.text
          });
        }
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

    // MODEL CONFIG
    const apiConfig = {
      Mini: { 
          key: env.MINI_API_KEY, 
          model: 'z-ai/glm-4.5-air:free'
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
    if (!config)
      return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- DECISION ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- SEARCH ---
    if (analysis.needed) {
      const results = await searchSerpApi(analysis.query, env.SERPAPI_KEY, debug.steps);
      if (results) {
        toolUsed = 'Google AI Mode (SerpAPI)';
        searchContext = results
          .map((r, i) => 
            `[${i+1}] Title: ${r.title}\n   Source: ${r.link}\n   Content: ${r.content}`
          ).join('\n\n');
      } else {
        toolUsed = 'Search Failed (Internal Only)';
      }
    }

    // --- INSERT SEARCH CONTEXT ---
    const finalMessages = [...messages];

    if (searchContext) {
      const lastIdx = finalMessages.length - 1;
      finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: GOOGLE AI MODE RESULTS]
${searchContext}

[INSTRUCTION]
Answer using the search results above. 
Cite as [1], [2], etc.
Current Date: ${new Date().toLocaleDateString('vi-VN')}
`;
    }

    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: 'You are Oceep. Helpful and accurate.' });

    // --- CALL MODEL ---
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
      const txt = await modelRes.text();
      throw new Error(`OpenRouter Error: ${txt}`);
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
