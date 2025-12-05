// functions/api/handler.js

/**
 * handler.js — "LLM Web Search" (OpenWebUI Style)
 * * WORKFLOW:
 * 1. QUERY GEN (The Mind): Uses 'arcee-ai/trinity-mini' to Generate the perfect search query.
 * 2. SEARCH (The Hands): 
 * - Tries ScraperX (API Key).
 * - IF FAILS: Falls back to DuckDuckGo Lite (Free, HTML-only).
 * 3. ANSWER (The Mouth): RAG response using the found data.
 *
 * REQUIRED VARS:
 * - DECIDE_API_KEY   (for Trinity - Query Gen)
 * - SCRAPERX_API_KEY (for ScraperX)
 * - MINI_API_KEY, SMART_API_KEY, etc.
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
// 1) QUERY GENERATOR ("LLM Web Search" Logic)
// ----------------------------
async function generateSearchQuery(userPrompt, apiKey, debugSteps) {
  if (!apiKey) return { needed: true, query: userPrompt }; // Fallback

  try {
    // This prompt mimics OpenWebUI's query generation
    const systemPrompt = `You are a Search Optimizer.
    Analyze the user's request.
    1. DECIDE: Does this need external info? (True/False)
    2. QUERY: If True, write the BEST Google search query for it. If False, leave empty.
    
    RETURN JSON ONLY:
    { "needed": boolean, "query": "string" }`;

    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" }, // Try to force JSON
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 50,
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
    
    // Attempt parse
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        // Fallback if model output raw text
        const needed = content.toLowerCase().includes('true');
        parsed = { needed, query: userPrompt };
    }

    debugSteps.push({ step: 'query_gen', output: parsed });
    return parsed;

  } catch (e) {
    debugSteps.push({ query_gen_error: String(e) });
    // Default to searching the raw prompt if generation fails
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) SEARCH LAYER (Dual Engine)
// ----------------------------

// A. DuckDuckGo Lite (Fallback - No Key Needed)
async function searchDDGLite(query) {
    try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const res = await safeFetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html' 
            }
        }, 8000);
        if (!res.ok) return null;
        const html = await res.text();

        // Simple Regex Scraping for DDG Lite
        const results = [];
        const regex = /<a class="result-link" href="(.*?)">(.*?)<\/a>[\s\S]*?<td class="result-snippet">(.*?)<\/td>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
            results.push({
                link: match[1],
                title: match[2].replace(/<[^>]+>/g, ''), // strip tags
                snippet: match[3].replace(/<[^>]+>/g, '')
            });
        }
        return results.length ? results : null;
    } catch (e) {
        return null;
    }
}

// B. ScraperX (Primary)
async function searchScraperX(query, apiKey, debugSteps) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
  const apiUrl = new URL(SCRAPERX_ENDPOINT);
  apiUrl.searchParams.set('api_key', apiKey);
  apiUrl.searchParams.set('url', googleUrl);
  apiUrl.searchParams.set('autoparse', 'true');

  try {
    const res = await safeFetch(apiUrl.toString(), { method: 'GET' }, SEARCH_TIMEOUT_MS);
    if (!res.ok) {
        debugSteps.push({ scraperx_fail: res.status });
        return null;
    }
    const data = await res.json();
    const results = data.organic_results || data.organic || data.results || [];
    return results.length ? results.slice(0, 5) : null;
  } catch (e) {
    debugSteps.push({ scraperx_error: String(e) });
    return null;
  }
}

// Main Search Router
async function performWebSearch(query, env, debugSteps) {
    let results = null;

    // 1. Try ScraperX
    if (env.SCRAPERX_API_KEY) {
        debugSteps.push({ action: 'trying_scraperx' });
        results = await searchScraperX(query, env.SCRAPERX_API_KEY, debugSteps);
        if (results) return { provider: 'ScraperX', results };
    }

    // 2. Fallback to DDG Lite
    debugSteps.push({ action: 'trying_ddg_fallback' });
    results = await searchDDGLite(query);
    if (results) return { provider: 'DuckDuckGo (Lite)', results };

    return null;
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
    let injectionData = '';

    // --- STEP 1: GENERATE QUERY ---
    // Use DECIDE key, or fall back to SMART key
    const queryKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await generateSearchQuery(lastMsg, queryKey, debug.steps);

    // --- STEP 2: EXECUTE SEARCH ---
    if (decision.needed) {
        const searchData = await performWebSearch(decision.query, env, debug.steps);
        
        if (searchData && searchData.results) {
            toolUsed = `WebSearch (${searchData.provider})`;
            
            // Format for RAG
            const context = searchData.results.map((r, i) => 
                `[${i+1}] ${r.title}\nSource: ${r.link}\nSummary: ${r.snippet}`
            ).join('\n\n');

            injectionData = `\n\n=== LIVE SEARCH RESULTS (${searchData.provider}) ===\nQuery: "${decision.query}"\n\n${context}\n\n=== END RESULTS ===\n`;
        } else {
            toolUsed = 'WebSearch (Failed/No Results)';
            debug.steps.push({ msg: 'All search providers failed' });
        }
    }

    // --- STEP 3: ANSWER ---
    const finalMessages = [...messages];
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep.
        
        INSTRUCTIONS:
        1. Use the "LIVE SEARCH RESULTS" below to answer the user's question if present.
        2. Cite sources as [1], [2], etc.
        3. If results are missing, use your internal knowledge.
        4. Always answer in the user's language.
        
        ${injectionData}`
    };
    finalMessages.unshift(systemPrompt);

    const modelRes = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
          model: config.model,
          messages: finalMessages,
          max_tokens: 2000
      })
    }, 30000);

    if (!modelRes.ok) throw new Error('Model API failed');
    const data = await modelRes.json();
    const answer = data?.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
