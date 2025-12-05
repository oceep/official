// functions/api/handler.js

/**
 * handler.js — "Brave Search Agent"
 *
 * WORKFLOW:
 * 1. THE MIND (Query Gen): Uses 'arcee-ai/trinity-mini' to decide IF and WHAT to search.
 * 2. THE HANDS (Search): Uses Brave Search (Public JSON Endpoint) for cleaner results.
 * 3. THE MOUTH (Answer): Uses your Main Model to answer.
 *
 * REQUIRED VARS:
 * - DECIDE_API_KEY (for Trinity)
 * - MINI_API_KEY / SMART_API_KEY (for Chat)
 */

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
// 1) QUERY GENERATOR ("The Mind")
// ----------------------------
async function generateSearchQuery(userPrompt, apiKey, debugSteps) {
  if (!apiKey) return { needed: true, query: userPrompt }; 

  try {
    const systemPrompt = `You are a Search Optimizer.
    Analyze the user's request.
    1. DECIDE: Does this need external/real-time info? (True/False)
    2. QUERY: If True, write the BEST search query (in user's language).
    
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
    try { 
        parsed = JSON.parse(content); 
    } catch (e) { 
        const needed = content.toLowerCase().includes('true');
        parsed = { needed, query: userPrompt };
    }

    debugSteps.push({ step: 'query_gen', output: parsed });
    return parsed;

  } catch (e) {
    debugSteps.push({ query_gen_error: String(e) });
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) SEARCH LAYER (Brave Search)
// ----------------------------
async function searchBrave(query, debugSteps) {
  try {
    // Brave Search Public Endpoint
    const url = `https://search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json' // Request JSON specifically
      }
    }, SEARCH_TIMEOUT_MS);

    if (!res.ok) {
      debugSteps.push({ brave_error: res.status });
      return null;
    }

    const data = await res.json();
    
    // Parse Brave JSON Structure
    if (!data || !data.web || !data.web.results) {
      debugSteps.push({ brave_warning: 'no_web_results_in_json' });
      return null;
    }

    const results = data.web.results.map(r => ({
      title: r.title || 'No Title',
      link: r.url || r.source || '',
      snippet: r.description || ''
    }));

    debugSteps.push({ brave_found: results.length });
    return results;

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

    // Config Model
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
    const queryKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await generateSearchQuery(lastMsg, queryKey, debug.steps);

    // --- STEP 2: SEARCH (Brave) ---
    if (decision.needed) {
        const results = await searchBrave(decision.query, debug.steps);
        
        if (results && results.length > 0) {
            toolUsed = 'WebSearch (Brave)';
            
            const context = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\nSource: ${r.link}\nSummary: ${r.snippet}`
            ).join('\n\n');

            injectionData = `
==========
SYSTEM NOTE: WEB SEARCH RESULTS ACQUIRED.
User Query: "${decision.query}"
Brave Search Results:
${context}
==========
`;
        } else {
            toolUsed = 'WebSearch (Failed/No Results)';
            debug.steps.push({ msg: 'Brave returned no data' });
        }
    }

    // --- STEP 3: ANSWER (Strict Prompt) ---
    const finalMessages = [...messages];

    const systemPrompt = {
        role: 'system',
        content: `You are Oceep, a helpful AI assistant.
        
        INSTRUCTIONS:
        1. Context: I have ALREADY performed a Brave web search. Results are above (SYSTEM NOTE).
        2. Action: Read the results and answer the user naturally.
        3. Prohibition: DO NOT output JSON, code blocks, or internal debug info.
        4. Citation: Use [1], [2] to cite sources.
        5. Fallback: If results are empty, use internal knowledge.
        6. Language: Answer in the same language as the user.
        
        ${injectionData}`
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
