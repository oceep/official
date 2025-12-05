// functions/api/handler.js

/**
 * Full handler.js — "Search Agent" Architecture
 *
 * WORKFLOW:
 * 1. THE MIND (Decision): Uses 'arcee-ai/trinity-mini:free' with DECIDE_API_KEY.
 * - Prompt: "Does this need search? True/False"
 * 2. THE HANDS (Search): If True, uses ScraperX with SCRAPERX_API_KEY.
 * 3. THE MOUTH (Answer): Uses the user's selected model (Smart/Mini) to generate the final response.
 *
 * REQUIRED WORKER VARIABLES:
 * - DECIDE_API_KEY   (For Arcee Trinity - The Decision Maker)
 * - SCRAPERX_API_KEY (For searching Google)
 * - MINI_API_KEY     (For Chat Model)
 * - SMART_API_KEY    (For Chat Model)
 * - NERD_API_KEY     (For Chat Model)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const DEFAULT_SEARCH_COUNT = 5;
const SEARCH_TIMEOUT_MS = 15000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; // Fast & Free
const SCRAPERX_ENDPOINT = 'https://api.scraperx.com/'; // Verify this URL in your dashboard

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
// 1) DECISION LAYER ("THE MIND")
// ----------------------------
async function decideIfSearchNeeded(query, apiKey) {
  if (!apiKey) return null; // If no key, we can't decide, usually default to false or heuristic
  
  try {
    // strict "Train Prompt" to force True/False
    const systemPrompt = `You are a Search Decision Bot. Your ONLY job is to determine if a query needs real-time Google Search.
    
    RULES:
    - If the user asks for: Weather, Stock Prices, News, "Who is [person]", Sports Scores, Exchange Rates, or recent events (2024-2025) -> ANSWER: "True"
    - If the user asks for: Coding help, Translations, Math, Greetings, General Knowledge, Creative Writing -> ANSWER: "False"
    
    OUTPUT FORMAT:
    Just the word "True" or "False". Do not explain.`;

    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      max_tokens: 5, // We only need 1 word
      temperature: 0.0 // Zero temperature for maximum determinism
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 5000); // 5s timeout is plenty for Trinity
    
    if (!res.ok) return null;
    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse the strict output
    if (answer.toLowerCase().includes('true')) return true;
    if (answer.toLowerCase().includes('false')) return false;
    
    return null; // Fallback if model hallucinates
  } catch (e) {
    // console.error("Decision model failed", e);
    return null; 
  }
}

// ----------------------------
// 2) SEARCH LAYER (ScraperX)
// ----------------------------
async function searchScraperX(query, apiKey, count = DEFAULT_SEARCH_COUNT) {
  // Construct Google Search URL (Vietnam localized for better local results)
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=vi&gl=vn&num=${count + 2}`;
  
  // Call ScraperX
  const apiUrl = new URL(SCRAPERX_ENDPOINT);
  apiUrl.searchParams.set('api_key', apiKey);
  apiUrl.searchParams.set('url', googleUrl);
  apiUrl.searchParams.set('autoparse', 'true'); // We want JSON back

  try {
    const res = await safeFetch(apiUrl.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, SEARCH_TIMEOUT_MS);

    if (!res.ok) return null;
    
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
        // If they send back HTML string even with autoparse
        // We might need to implement a parser here, but usually autoparse works.
        return null; 
    }

    // Map common ScraperX / ScraperAPI JSON shapes
    // Usually found in 'organic_results' or 'organic'
    const results = data.organic_results || data.organic || data.results || [];
    
    if (Array.isArray(results) && results.length > 0) {
      return results.slice(0, count).map(r => ({
        title: r.title || '',
        link: r.link || r.url || '',
        snippet: r.snippet || r.description || ''
      }));
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ----------------------------
// 3) CHAT MODEL LAYER
// ----------------------------
async function callOpenRouterChat(model, apiKey, messages, max_tokens = 2000) {
  if (!apiKey) throw new Error('Missing API key for model');
  const payload = {
    model,
    messages,
    max_tokens,
    temperature: 0.7,
    stream: false
  };
  const res = await safeFetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://oceep.pages.dev/',
      'X-Title': 'Oceep'
    },
    body: JSON.stringify(payload)
  }, 30000); 
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Model call failed ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data;
}

// ----------------------------
// 4) MAIN WORKER
// ----------------------------
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const { modelName = 'Smart', messages = [] } = body;

    // Validate main chat model config
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' }, 
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) {
      return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), { status: 400, headers: corsHeaders });
    }

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let injectionData = '';
    const debug = { steps: [] };

    // --- STEP 1: DECIDE (The Mind) ---
    // We use DECIDE_API_KEY. If not set, we skip search or default to heuristic.
    let needSearch = null;
    if (env.DECIDE_API_KEY) {
        debug.steps.push({ action: 'checking_intent', model: DECISION_MODEL });
        needSearch = await decideIfSearchNeeded(lastMsg, env.DECIDE_API_KEY);
        debug.steps.push({ intent_result: needSearch });
    } else {
        debug.steps.push({ error: 'DECIDE_API_KEY_missing' });
        // Optional: fallback to heuristic if key missing
        // needSearch = true; 
    }

    // --- STEP 2: EXECUTE (The Hands) ---
    if (needSearch === true && env.SCRAPERX_API_KEY) {
      debug.steps.push({ action: 'searching_scraperx' });
      
      const searchResults = await searchScraperX(lastMsg, env.SCRAPERX_API_KEY, DEFAULT_SEARCH_COUNT);
      
      if (searchResults && searchResults.length > 0) {
        toolUsed = 'WebSearch (ScraperX)';
        debug.steps.push({ search_count: searchResults.length });

        // Format results for the final model
        const contextString = searchResults.map((item, idx) => 
            `[${idx+1}] Title: ${item.title}\n    Link: ${item.link}\n    Snippet: ${item.snippet}`
        ).join('\n\n');

        injectionData = `
=== LIVE WEB SEARCH RESULTS ===
${contextString}
=== END RESULTS ===
`;
      } else {
        toolUsed = 'WebSearch (Empty)';
        debug.steps.push({ search: 'no_results' });
      }
    }

    // --- STEP 3: ANSWER (The Mouth) ---
    const finalMessages = [...messages];

    // Inject System Instruction
    const systemInstruction = {
        role: 'system',
        content: `You are "Oceep".
        
        INSTRUCTIONS:
        1. If "LIVE WEB SEARCH RESULTS" are provided, you MUST use them to answer.
        2. If the decision model said "True" (Search Needed) but results are empty, say "I tried to search but found no results."
        3. If no search results are provided, use your internal knowledge.
        4. Answer in the same language as the user.
        
        ${injectionData}`
    };

    finalMessages.unshift(systemInstruction);

    const modelRes = await callOpenRouterChat(config.model, config.key, finalMessages, 2000).catch(err => {
        debug.model_error = String(err);
        return null;
    });

    const answer = modelRes?.choices?.[0]?.message?.content || null;

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
