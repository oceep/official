// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search.json';
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

function extractDomain(url = "") {
  try {
    if (!url) return "";
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return url.split('/')[0].replace(/^www\./, '').toLowerCase();
  }
}

function containsNumericClaim(text = "") {
  // Phát hiện nếu câu trả lời có chứa số, năm, giờ, phần trăm, v.v.
  return /\b\d{1,4}(\.\d+)?\b/.test(text) || /\b(%)\b/.test(text) || /\b(AM|PM|:)\b/i.test(text);
}

function isCredibleDomain(domain) {
  // Danh sách whitelist domain đáng tin cậy (có thể mở rộng)
  const whitelist = [
    'wikipedia.org', 'gov.vn', 'gov.uk', 'gov', 'who.int', 'un.org',
    'ncbi.nlm.nih.gov', 'nih.gov', 'weather.gov', 'metoffice.gov.uk',
    'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com',
    'cnn.com', 'nytimes.com', 'theguardian.com', 'sciencedaily.com',
    'nature.com', 'sciencemag.org', 'imdb.com', 'airportia.com'
  ];
  if (!domain) return false;
  return whitelist.some(w => domain.endsWith(w));
}

// ----------------------------
// 1. SMART ROUTER (Decision Layer)
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
- needed: true if user asks for Real-time Info, Address, Weather, News, Facts.
- needed: false for Chat, Code, Creative Writing.
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
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      parsed = JSON.parse(jsonStr);
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
// 2. SEARCH LAYER (Google AI Mode via SerpAPI) - PRO MAX
// ----------------------------
// Tối ưu:
// - Ưu tiên ai_overview.snippet
// - Lọc text_blocks rác (độ dài, loại)
// - Gom sources xuống cuối (giống Google AI)
// - Hallucination Guard: nếu câu trả lời có số/địa chỉ nhưng không có nguồn đáng tin -> reject
// - Giới hạn số block để giảm payload
async function searchGoogleAIMode(query, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ serp_error: 'MISSING_SERPAPI_KEY' });
    return null;
  }

  try {
    const params = new URLSearchParams({
      engine: "google_ai_overview",
      q: query,
      api_key: apiKey,
      hl: "vi",
      gl: "vn"
    });

    // slightly shorter timeout for search layer to fail fast
    const res = await safeFetch(`${SERPAPI_URL}?${params.toString()}`, {
      method: 'GET'
    }, 12000);

    if (!res.ok) {
      const txt = await res.text();
      debugSteps.push({ serp_fail: res.status, msg: txt });
      return null;
    }

    const data = await res.json();
    let results = [];
    debugSteps.push({ search_engine: 'google_ai_overview', query });

    // If ai_overview exists, parse carefully
    if (data.ai_overview) {
      const ao = data.ai_overview;

      // 1) Primary snippet/answer - đặt lên đầu (Google AI style)
      if (ao.snippet && typeof ao.snippet === 'string' && ao.snippet.trim().length > 0) {
        results.push({
          title: "Google AI Overview Answer",
          link: "",
          content: ao.snippet.trim()
        });
      } else if (ao.answer && typeof ao.answer === 'string' && ao.answer.trim().length > 0) {
        results.push({
          title: "Google AI Overview Answer",
          link: "",
          content: ao.answer.trim()
        });
      }

      // 2) Text blocks (filtered)
      const blocks = Array.isArray(ao.text_blocks) ? ao.text_blocks : [];
      const filteredBlocks = [];
      for (let i = 0; i < blocks.length && filteredBlocks.length < 5; i++) {
        const block = blocks[i];
        // normalize fields
        const txt = (block.snippet || block.text || "").trim();
        const title = (block.title || "").trim();
        const link = block.link || "";

        // filters:
        // - must have meaningful text length
        // - skip if looks like media-only (video/image) by checking type or lack of words
        // - skip if it's just a one-liner (<= 30 chars)
        if (!txt || txt.length < 40) continue;
        // skip if contains 'video' or 'hình ảnh' signals (korean/vn/us heuristics)
        const low = txt.toLowerCase();
        if (low.includes('video') || low.includes('hình ảnh') || low.includes('ảnh') || low.includes('youtube.com')) continue;

        filteredBlocks.push({
          title: title || `AI Overview Block ${i + 1}`,
          link,
          content: txt
        });
      }

      // append filtered blocks after primary answer
      results.push(...filteredBlocks);

      // 3) Sources - collect separately then append last (max 6)
      const sourceList = [];
      if (Array.isArray(ao.sources)) {
        for (let i = 0; i < ao.sources.length && sourceList.length < 6; i++) {
          const s = ao.sources[i];
          const title = s.title || s.name || "Source";
          const link = s.link || s.url || "";
          const snippet = s.snippet || s.description || "";
          sourceList.push({
            title,
            link,
            content: (snippet || "").trim()
          });
        }
      }

      // If we have no results but answer_box exists later, we let fallbacks handle
      // Append sources to results (after blocks), but keep them flagged
      if (sourceList.length > 0) {
        // mark them as sources so consumer can treat them differently
        sourceList.forEach((src, idx) => {
          results.push({
            title: `[Source ${idx + 1}] ${src.title}`,
            link: src.link,
            content: src.content
          });
        });
      }
    }

    // Fallbacks if still empty or partial
    if ((!results || results.length === 0) && data.answer_box) {
      const answer = data.answer_box.snippet || data.answer_box.answer || data.answer_box.result;
      if (answer) {
        results.push({
          title: "Google Answer",
          link: data.answer_box.link || "",
          content: (answer || "").trim()
        });
      }
    }

    if ((!results || results.length === 0) && data.knowledge_graph) {
      results.push({
        title: data.knowledge_graph.title || "Knowledge",
        link: data.knowledge_graph.source?.link || "",
        content: data.knowledge_graph.description || ""
      });
    }

    if ((!results || results.length === 0) && Array.isArray(data.organic_results) && data.organic_results.length > 0) {
      // take top 5 organic results but keep content minimal
      data.organic_results.slice(0, 5).forEach(r => {
        let text = r.snippet || "";
        if (r.address) text += ` Address: ${r.address}`;
        results.push({
          title: r.title || "Result",
          link: r.link || "",
          content: text
        });
      });
    }

    // If still nothing, return null
    if (!results || results.length === 0) {
      debugSteps.push({ serp_info: 'no_results' });
      return null;
    }

    // -------------------------
    // Hallucination Guard (PRO)
    // - Nếu primary answer có các claim số/địa chỉ/ngày/giờ/giá cả...
    // - Nhưng sources không chứa domain đáng tin cậy => REJECT (return null)
    // This prevents feeding the model with an unverified numeric claim.
    // -------------------------
    const primary = results[0];
    const primaryText = (primary && primary.content) ? primary.content : "";
    const hasNumeric = containsNumericClaim(primaryText);

    // collect domains from any sources/results
    const domains = new Set();
    for (const r of results) {
      if (r.link) {
        const d = extractDomain(r.link);
        if (d) domains.add(d);
      }
    }

    // check credibility
    let credibleCount = 0;
    for (const d of Array.from(domains)) {
      if (isCredibleDomain(d)) credibleCount++;
    }

    // If primary claims numeric facts but credibleCount === 0, we consider it unsafe
    if (hasNumeric && credibleCount === 0) {
      debugSteps.push({
        hallucination_guard: 'reject_primary_numeric_without_credible_source',
        primary_excerpt: primaryText.slice(0, 300),
        domains: Array.from(domains)
      });
      // Return null so upper layer will fallback to internal knowledge or signal search failure
      return null;
    }

    // If there are sources but none credible, still allow but mark in debug
    if (domains.size > 0 && credibleCount === 0) {
      debugSteps.push({ serp_info: 'sources_present_but_no_whitelisted_domains', domains: Array.from(domains) });
    }

    // Limit result size to reasonable number for context insertion
    const maxResultsToReturn = 8;
    const finalResults = results.slice(0, maxResultsToReturn);

    return finalResults;

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

    // --- CONFIG MODEL ---
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
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be non-empty array' }), { status: 400, headers: corsHeaders });
    }

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- B1: PHÂN TÍCH (ROUTER) ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- B2: TÌM KIẾM (Google AI Mode) ---
    if (analysis.needed) {
      const results = await searchGoogleAIMode(analysis.query, env.SERPAPI_KEY, debug.steps);
      if (results) {
        toolUsed = 'Google AI Mode (SerpAPI)';
        // Build concise searchContext (indexed)
        searchContext = results.map((r, i) =>
          `[${i + 1}] Title: ${r.title}\n   Source: ${r.link}\n   Content: ${r.content}`
        ).join('\n\n');
      } else {
        toolUsed = 'Search Failed (Internal Only)';
      }
    }

    // --- B3: CHUẨN BỊ CONTEXT ---
    const finalMessages = [...messages];

    if (searchContext) {
      const lastIdx = finalMessages.length - 1;
      finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: GOOGLE AI MODE RESULTS]
${searchContext}

[INSTRUCTION]
Answer using the search results above.
Cite sources like [1].
Current Date: ${new Date().toLocaleDateString('vi-VN')}
`;
    } else if (analysis.needed && !searchContext) {
      const lastIdx = finalMessages.length - 1;
      finalMessages[lastIdx].content = `
User Query: "${lastMsg}"
[SYSTEM NOTE]
Search engines found no reliable results. Use internal knowledge but DO NOT hallucinate addresses, numeric facts, or make up sources.
`;
    }

    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: 'You are Oceep. Helpful, direct and accurate.' });

    // --- B4: GỌI MODEL TRẢ LỜI ---
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
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson.error?.message || errorText;
        throw new Error(`OpenRouter Error (${config.model}): ${msg}`);
      } catch (e) {
        throw new Error(`OpenRouter Failed ${modelRes.status}: ${errorText}`);
      }
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
