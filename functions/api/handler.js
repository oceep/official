// functions/api/handler.js

/**
 * Full handler.js — "Search Agent" clone 1:1
 * - Mini:  openai/gpt-oss-20b:free    -> env.MINI_API_KEY
 * - Smart: z-ai/glm-4.5-air:free      -> env.SMART_API_KEY
 * - Nerd:  amazon/nova-2-lite-v1:free -> env.NERD_API_KEY
 *
 * Search strategy:
 * 1) Try Serper.dev (if SERPER_API_KEY present)
 * 2) Fallback Brave Search JSON (no key)
 *
 * Crawler:
 * - Try ScrapeNinja (if SCRAPENINJA_KEY present)
 * - Else: use snippet returned by search
 *
 * Decision maker:
 * - If SEARCH_API_KEY present -> call OpenRouter classifier
 * - Else -> basic heuristic
 *
 * Notes: optimized for Cloudflare Pages (short timeouts, minimal HTML parsing).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

const DEFAULT_SEARCH_COUNT = 4; // number of search results to request
const SCRAPE_TIMEOUT_MS = 3000; // max time to wait scraping a page (ms)
const SEARCH_TIMEOUT_MS = 4000; // timeout for search calls
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ----------------------------
// Helpers
// ----------------------------
function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function safeFetch(url, opts = {}, ms = 4000) {
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

function jsonSafe(res) {
  return res && res.json ? res.json().catch(() => null) : null;
}

// ----------------------------
// 1) SEARCH LAYER
// Try Serper.dev (if key) else Brave Search (no key)
// ----------------------------
async function searchSerper(query, apiKey, count = DEFAULT_SEARCH_COUNT) {
  if (!apiKey) return null;
  try {
    const url = `https://google.serper.dev/search`;
    const body = { q: query, num: count };
    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify(body)
    }, SEARCH_TIMEOUT_MS);

    if (!res.ok) return null;
    const data = await res.json();
    // Serper shape varies; map to common format
    const items = [];
    if (data && data.organic) {
      for (const it of data.organic.slice(0, count)) {
        items.push({
          title: it.title || it.snippet || '',
          link: it.link || it.source || '',
          snippet: it.snippet || it.description || ''
        });
      }
    }
    return items.length ? items : null;
  } catch (e) {
    // console.error('Serper error', e);
    return null;
  }
}

async function searchBrave(query, count = DEFAULT_SEARCH_COUNT) {
  try {
    const url = `https://search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const res = await safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }, SEARCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.web?.results) return null;
    return data.web.results.slice(0, count).map(r => ({
      title: r.title || '',
      link: r.url || r.canonical || r.source || '',
      snippet: r.description || ''
    }));
  } catch (e) {
    // console.error('Brave search error', e);
    return null;
  }
}

async function webSearch(query, env) {
  // try Serper first if key present
  const serperKey = env.SERPER_API_KEY;
  let results = null;
  if (serperKey) {
    results = await searchSerper(query, serperKey, DEFAULT_SEARCH_COUNT);
    if (results) return { provider: 'serper', results };
  }
  // fallback -> Brave
  results = await searchBrave(query, DEFAULT_SEARCH_COUNT);
  if (results) return { provider: 'brave', results };
  return null;
}

// ----------------------------
// 2) CRAWLER LAYER (lightweight)
// - Use ScrapeNinja if key available, else skip full scrape
// - We intentionally avoid heavy HTML parsing: return text snippet only
// ----------------------------
async function scrapeWithScrapeNinja(url, key) {
  if (!key) return null;
  try {
    const apiUrl = `https://api.scrapeninja.net/raw?token=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`;
    const res = await safeFetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, SCRAPE_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.text();
    // very light cleanup: remove scripts/styles tags quickly
    const cleaned = data
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 1500);
  } catch (e) {
    return null;
  }
}

// ----------------------------
// 3) DECISION MAKER
// - If SEARCH_API_KEY set: call OpenRouter classifier
// - Else: simple heuristic (questions with keywords real-time: price, hôm nay, weather, giá..., tin tức, flight, chuyến bay, giờ...)
// ----------------------------
async function callOpenRouterClassifier(query, key) {
  if (!key) return null;
  try {
    const payload = {
      model: 'arcee-ai/trinity-mini:free',
      messages: [
        { role: 'system', content: 'Return ONLY "true" or "false". "true" when the query requires real-time external info (news, prices, weather, flight status). "false" otherwise.' },
        { role: 'user', content: query }
      ],
      max_tokens: 5,
      temperature: 0
    };
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload)
    }, 3000);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.toLowerCase() || '';
    return text.includes('true');
  } catch (e) {
    return null;
  }
}

function heuristicNeedSearch(query) {
  const q = query.toLowerCase();
  const keywords = ['hôm nay', 'giá', 'price', 'giờ', 'thời tiết', 'weather', 'tin tức', 'tình trạng', 'chuyến bay', 'flight', 'tỷ giá', 'crypto', 'bitcoin', 'btc', 'bnb', 'eth'];
  for (const k of keywords) if (q.includes(k)) return true;
  // questions that are clearly static:
  const staticHints = ['how to', 'làm sao', 'tutorial', 'code', 'phiên dịch', 'translate', 'dịch', 'bài tập', 'proof', 'chứng minh'];
  for (const s of staticHints) if (q.includes(s)) return false;
  // default: true (safer)
  return true;
}

// ----------------------------
// 4) MODEL CALL (OpenRouter chat completions)
// ----------------------------
async function callOpenRouterChat(model, apiKey, messages, max_tokens = 2000) {
  if (!apiKey) throw new Error('Missing API key for model');
  const payload = {
    model,
    messages,
    max_tokens,
    temperature: 0.5,
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
  }, 20000); // allow longer for model
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Model call failed ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data;
}

// ----------------------------
// 5) MAIN HANDLER
// ----------------------------
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const { modelName = 'Smart', messages = [] } = body;

    // Validate model mapping
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) {
      return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });
    }

    // Basic input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), { status: 400, headers: corsHeaders });
    }

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let injectionData = '';
    const debug = { steps: [] };

    // Decide whether to search
    let needSearch = null;
    if (env.SEARCH_API_KEY) {
      try {
        const r = await callOpenRouterClassifier(lastMsg, env.SEARCH_API_KEY);
        if (typeof r === 'boolean') {
          needSearch = r;
          debug.steps.push({ classifier: 'openrouter', result: r });
        }
      } catch (e) {
        debug.steps.push({ classifier_error: String(e) });
      }
    }
    if (needSearch === null) {
      needSearch = heuristicNeedSearch(lastMsg);
      debug.steps.push({ classifier: 'heuristic', result: needSearch });
    }

    if (needSearch) {
      // Perform web search
      const searchRes = await webSearch(lastMsg, env);
      if (searchRes && searchRes.results && searchRes.results.length > 0) {
        toolUsed = `WebSearch (${searchRes.provider})`;
        debug.steps.push({ search: { provider: searchRes.provider, count: searchRes.results.length } });

        // For each top candidate, optionally try light scrape (only if SCRAPENINJA_KEY present)
        const scraped = [];
        const snKey = env.SCRAPENINJA_KEY;
        for (let i = 0; i < Math.min(2, searchRes.results.length); i++) {
          const it = searchRes.results[i];
          let content = null;
          if (snKey && it.link) {
            try {
              content = await scrapeWithScrapeNinja(it.link, snKey);
              debug.steps.push({ scrape: { link: it.link, ok: !!content } });
            } catch (e) {
              debug.steps.push({ scrape_error: String(e) });
              content = null;
            }
          }
          scraped.push({
            title: it.title,
            link: it.link,
            snippet: it.snippet,
            content: content // can be null -> model will fallback to snippet
          });
        }

        injectionData = `[LIVE WEB SEARCH RESULTS]\nProvider: ${searchRes.provider}\n${JSON.stringify(scraped, null, 2)}\n\n`;
      } else {
        toolUsed = 'WebSearch (No Results)';
        debug.steps.push({ search: 'no-results' });
      }
    } else {
      debug.steps.push({ search: 'skipped by classifier' });
    }

    // Build final messages to the model
    const finalMessages = [...messages];

    if (injectionData) {
      finalMessages.push({
        role: 'system',
        content: `CRITICAL: You are "Oceep". You have NO internal knowledge after 2023. Use the LIVE WEB SEARCH RESULTS below when answering. Cite sources in the format [Title](Link). If data missing, say "không có thông tin". Answer in Vietnamese.\n\n${injectionData}`
      });
    } else {
      finalMessages.push({
        role: 'system',
        content: `CRITICAL: You are "Oceep". If the user asks for real-time info and you don't have it, say "không có thông tin". Answer in Vietnamese.`
      });
    }

    // Call model on OpenRouter
    const modelRes = await callOpenRouterChat(config.model, config.key, finalMessages, 2000).catch(err => {
      debug.model_error = String(err);
      return null;
    });

    const answer = modelRes?.choices?.[0]?.message?.content || null;

    // Return result
    const out = {
      content: answer,
      toolUsed,
      debug
    };

    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
