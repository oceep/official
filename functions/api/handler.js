// functions/api/handler.js

/**
 * Full handler.js — "Search Agent" Architecture
 *
 * WORKFLOW:
 * 1. THE MIND (Decision): Uses 'arcee-ai/trinity-mini:free' with DECIDE_API_KEY.
 * - Prompt: "Does this need search? True/False"
 * - Fallback: If model fails/timeouts, DEFAULT TO TRUE (Search).
 * 2. THE HANDS (Search): If True, uses ScraperX (SCRAPERX_API_KEY).
 * 3. THE MOUTH (Answer): Uses the user's selected model (Smart/Mini) to answer.
 *
 * REQUIRED WORKER VARIABLES:
 * - DECIDE_API_KEY   (For Arcee Trinity)
 * - SCRAPERX_API_KEY (For ScraperX)
 * - MINI_API_KEY, SMART_API_KEY, NERD_API_KEY (For Chat)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const DEFAULT_SEARCH_COUNT = 5;
const SEARCH_TIMEOUT_MS = 20000; // 20s (Scrapers can be slow)
const DECISION_TIMEOUT_MS = 4000; // 4s (Decision must be fast)
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free';

// !IMPORTANT: Check if ScraperX uses 'api.scraperx.com' or another URL.
// Standard pattern for scraper APIs is usually: https://api.scraperx.com/
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
// 1) DECISION LAYER ("THE MIND")
// ----------------------------
async function decideIfSearchNeeded(query, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ decision: 'no_key_defaulting_true' });
    return true; // No key? Default to Search.
  }

  try {
    // Strict prompt to force a boolean answer
    const systemPrompt = `You are a Search Decision Bot. 
    Analyze the user Query.
    - If it asks for real-time info (News, Weather, Sports, Stock, "Who is", Events 2024-2025), output "True".
    - If it is static (Math, Code, Translate, Greeting), output "False".
    - Output ONLY "True" or "False".`;

    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      max_tokens: 5,
      temperature: 0.0 // Strict
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, DECISION_TIMEOUT_MS);
    
    if (!res.ok) {
        debugSteps.push({ decision_error: `status_${res.status}` });
        return true; // API Error? Default to Search.
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || '';
    debugSteps.push({ decision_raw_output: answer });

    if (answer.toLowerCase().includes('true')) return true;
    if (answer.toLowerCase().includes('false')) return false;
    
    // If model says something weird ("I think so"), default to True.
    return true; 

  } catch (e) {
    debugSteps.push({ decision_exception: String(e) });
    return true; // Exception? Default to Search.
  }
}

// ----------------------------
// 2) SEARCH LAYER (ScraperX)
// ----------------------------
async function searchScraperX(query, apiKey, count = DEFAULT_SEARCH_COUNT, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ search_error: 'missing_scraperx_key' });
    return null;
  }

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=vi&gl=vn&num=${count + 2}`;
  
  // Construct API URL
  const apiUrl = new URL(SCRAPERX_ENDPOINT);
  apiUrl.searchParams.set('api_key', apiKey);
  apiUrl.searchParams.set('url', googleUrl);
  apiUrl.searchParams.set('autoparse', 'true'); // Essential for JSON results

  try {
    const res = await safeFetch(apiUrl.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, SEARCH_TIMEOUT_MS);

    if (!res.ok) {
        debugSteps.push({ search_status: res.status, msg: 'scraper_failed' });
        return null;
    }
    
    // Attempt to parse JSON
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      
      // Check for common Scraper API result shapes
      const organic = data.organic_results || data.organic || data.results || [];
      
      if (Array.isArray(organic) && organic.length > 0) {
         return organic.slice(0, count).map(r => ({
           title: r.title || 'No Title',
           link: r.link || r.url || '#',
           snippet: r.snippet || r.description || ''
         }));
      } else {
         debugSteps.push({ search_warning: 'json_returned_but_empty_array', data_preview: JSON.stringify(data).slice(0, 100) });
      }
    } else {
        debugSteps.push({ search_warning: 'response_was_not_json', type: contentType });
    }
    return null;

  } catch (e) {
    debugSteps.push({ search_exception: String(e) });
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
  }, 40000); 
  
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

    // Config
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });
    if (!messages.length) return new Response(JSON.stringify({ error: 'Empty messages' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let injectionData = '';
    const debug = { steps: [] };

    // --- STEP 1: DECIDE ---
    debug.steps.push({ step: '1_decision', model: DECISION_MODEL });
    const needSearch = await decideIfSearchNeeded(lastMsg, env.DECIDE_API_KEY, debug.steps);
    debug.steps.push({ decision_final: needSearch });

    // --- STEP 2: SEARCH (If Needed) ---
    if (needSearch) {
      debug.steps.push({ step: '2_searching', provider: 'scraperx' });
      
      const searchResults = await searchScraperX(lastMsg, env.SCRAPERX_API_KEY, DEFAULT_SEARCH_COUNT, debug.steps);
      
      if (searchResults && searchResults.length > 0) {
        toolUsed = 'WebSearch (ScraperX)';
        const contextString = searchResults.map((item, idx) => 
            `[${idx+1}] ${item.title}\nLINK: ${item.link}\nDESC: ${item.snippet}`
        ).join('\n\n');

        injectionData = `\n\n[LIVE WEB SEARCH RESULTS]\n${contextString}\n[END RESULTS]\n\n`;
      } else {
        toolUsed = 'WebSearch (Empty/Failed)';
        debug.steps.push({ msg: 'Search logic ran but returned no results.' });
      }
    } else {
      debug.steps.push({ step: '2_skipped_search' });
    }

    // --- STEP 3: ANSWER ---
    const finalMessages = [...messages];
    
    // Inject the Search Results into the System Prompt or the User Message
    // Putting it in System Prompt is usually more reliable for instruction following.
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep.
        
        CRITICAL INSTRUCTION:
        1. I have performed a live Google search for you. The results are attached below.
        2. IF "LIVE WEB SEARCH RESULTS" exist: You MUST use them to answer the user. Cite them as [Title](Link).
        3. IF results are missing or irrelevant: Use your internal knowledge but mention you couldn't find live info.
        4. Answer in the same language as the user (Vietnamese/English).
        
        ${injectionData}`
    };

    // Ensure system prompt is first
    finalMessages.unshift(systemPrompt);

    const modelRes = await callOpenRouterChat(config.model, config.key, finalMessages, 3000).catch(err => {
        debug.model_error = String(err);
        return null;
    });

    const answer = modelRes?.choices?.[0]?.message?.content || 'Error: No response from model.';

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug // Check this in your frontend console if it fails again!
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
