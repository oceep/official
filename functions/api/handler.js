// functions/api/handler.js
// Handler (Pro) — Rewritten with Fact-Guard (Decision -> Search -> Guard -> Model Call)
// Requirements (env):
//   - DECIDE_API_KEY (optional; used by decision router)
//   - SERPAPI_KEY
//   - MINI_API_KEY / SMART_API_KEY / NERD_API_KEY (depending on modelName input)
// Notes:
//   - This worker expects request.json() with { modelName, messages }
//   - modelName keys supported: Mini, Smart, Nerd (configurable below)
//   - Returns JSON: { content, toolUsed, sources: [...], debug: { steps: [...] } }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search.json';

// ---------- Helpers ----------
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
  cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "");
  return cleaned.trim();
}

function extractDomain(url = "") {
  try {
    if (!url) return "";
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    // fallback: try split
    const chunk = (url || "").split('/')[2] || (url || "").split('/')[0];
    return (chunk || "").replace(/^www\./, '').toLowerCase();
  }
}

function containsNumericClaim(text = "") {
  if (!text) return false;
  // numbers, years, times, percentages, prices, phone-like patterns
  return /\b\d{1,4}([.,]\d+)?\b/.test(text)
    || /\b(AM|PM|:\d{2})\b/i.test(text)
    || /\b\d{4}\b/.test(text)
    || /\b(đồng|VND|USD|€|\$)\b/i.test(text)
    || /\b\d{1,3}%\b/.test(text);
}

function looksLikeAddressVN(text = "") {
  if (!text) return false;
  // simple heuristics for Vietnamese address: number + street (đường, phố, quận, p., phường, đường, Tống, Nguyễn, Lê)
  return /\b\d+\s+(đường|phố|ngõ|hẻm|phường|p\.|xã|quận|q\.|tỉnh|thành phố|TT\.)/i.test(text)
    || /\b(đường|phố|tầng|Tầng|lầu|số)\b/i.test(text) && /\b(Hà Nội|Hồ Chí Minh|TP HCM|Đà Nẵng|Hải Phòng)\b/i.test(text);
}

function isCredibleDomain(domain) {
  if (!domain) return false;
  const whitelist = [
    'wikipedia.org', 'gov.vn', 'gov.uk', 'who.int', 'un.org',
    'ncbi.nlm.nih.gov', 'nih.gov', 'weather.gov', 'metoffice.gov.uk',
    'bbc.com', 'reuters.com', 'apnews.com', 'cnn.com', 'nytimes.com',
    'theguardian.com', 'sciencedaily.com', 'nature.com', 'sciencemag.org',
    'imdb.com', 'airportia.com', 'tripadvisor.com', 'zomato.com', 'foody.vn',
    'google.com' // allow google.com for maps/place (we still prefer real site)
  ];
  return whitelist.some(w => domain.endsWith(w));
}

function preferRealLink(block, organicResults = []) {
  // Try to extract a real link associated with this block
  // 1) Check snippet_links and avoid "google.com/viewer" redirects
  if (Array.isArray(block.snippet_links) && block.snippet_links.length > 0) {
    for (const s of block.snippet_links) {
      if (!s || !s.link) continue;
      const d = extractDomain(s.link || '');
      // If snippet link is google viewer, skip (not real content)
      if (d && !d.includes('google.com') && !d.includes('gstatic.com')) {
        return s.link;
      }
    }
  }

  // 2) Try to match reference_indexes to organic_results if provided
  if (Array.isArray(block.reference_indexes) && Array.isArray(organicResults)) {
    for (const idx of block.reference_indexes) {
      const r = organicResults[idx];
      if (r && r.link) return r.link;
    }
  }

  // 3) Fallback: any organic result that mentions title/text
  if (Array.isArray(organicResults) && organicResults.length > 0) {
    // crude heuristic: return first organic result with link
    for (const r of organicResults) {
      if (r && r.link) {
        // avoid Google viewer links here too
        const d = extractDomain(r.link || '');
        if (d && !d.includes('google.com')) return r.link;
      }
    }
  }

  // last resort: return first snippet_link anyway
  if (Array.isArray(block.snippet_links) && block.snippet_links.length > 0) {
    return block.snippet_links[0].link || "";
  }

  return "";
}

// ---------- Decision Router (same idea but simplified) ----------
const DECISION_MODEL = 'arcee-ai/trinity-mini:free';
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ router: 'no_decision_key', msg: 'No DECIDE_API_KEY provided, defaulting to internal rules' });
    // fallback simple heuristic: if user asks for address, price, today/tomorrow, news -> need search
    const needSearch = /\b(địa chỉ|ở đâu|mở cửa|giá|hôm nay|hôm qua|bây giờ|hiện tại|tin tức|news|flight|bay)\b/i.test(userPrompt);
    return { needed: needSearch, query: userPrompt };
  }

  try {
    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: `You are a Search Decision tool. Output JSON ONLY: { "needed": boolean, "query": "string" }` },
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
    debugSteps.push({ router: 'error_fallback', error: String(e) });
    return { needed: false, query: userPrompt };
  }
}

// ---------- Search Layer: Google AI Overview (SerpAPI) ----------
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

    const res = await safeFetch(`${SERPAPI_URL}?${params.toString()}`, {}, 12000);
    if (!res.ok) {
      const txt = await res.text();
      debugSteps.push({ serp_fail: res.status, msg: txt });
      return null;
    }

    const data = await res.json();
    debugSteps.push({ search_engine: 'google_ai_overview', query });

    const results = [];

    // 1) AI overview snippet/answer
    if (data.ai_overview) {
      const ao = data.ai_overview;
      if (ao.snippet && ao.snippet.trim().length > 0) {
        results.push({
          title: "AI Overview Answer",
          link: "",
          content: ao.snippet.trim(),
          raw: ao
        });
      } else if (ao.answer && ao.answer.trim().length > 0) {
        results.push({
          title: "AI Overview Answer",
          link: "",
          content: ao.answer.trim(),
          raw: ao
        });
      }

      if (Array.isArray(ao.text_blocks)) {
        for (let i = 0; i < ao.text_blocks.length && results.length < 10; i++) {
          const block = ao.text_blocks[i];
          const txt = (block.snippet || block.text || "").trim();
          if (!txt || txt.length < 30) continue;
          const realLink = preferRealLink(block, data.organic_results || []);
          results.push({
            title: block.title || `Block ${i+1}`,
            link: realLink,
            content: txt,
            rawBlock: block
          });
        }
      }

      // sources from ai_overview
      if (Array.isArray(ao.sources)) {
        for (let s of ao.sources) {
          if (!s) continue;
          results.push({
            title: s.title || s.name || "Source",
            link: s.link || s.url || "",
            content: s.snippet || s.description || ""
          });
        }
      }
    }

    // 2) fallback answer_box
    if (results.length === 0 && data.answer_box) {
      const answer = data.answer_box.snippet || data.answer_box.answer || data.answer_box.result;
      if (answer) {
        results.push({
          title: "Answer Box",
          link: data.answer_box.link || "",
          content: (answer || "").trim()
        });
      }
    }

    // 3) knowledge_graph fallback
    if (results.length === 0 && data.knowledge_graph) {
      results.push({
        title: data.knowledge_graph.title || "Knowledge",
        link: data.knowledge_graph.source?.link || "",
        content: data.knowledge_graph.description || ""
      });
    }

    // 4) organic results fallback
    if (results.length === 0 && Array.isArray(data.organic_results) && data.organic_results.length > 0) {
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

    if (results.length === 0) {
      debugSteps.push({ serp_info: 'no_results' });
      return null;
    }

    return { raw: data, results };
  } catch (e) {
    debugSteps.push({ serp_exception: String(e) });
    return null;
  }
}

// ---------- Fact-Guard (3 Tiers) ----------
function runFactGuard(results, debugSteps) {
  // results: array of {title, link, content, rawBlock?}
  // Returns: { safe: boolean, reason: string|null, approvedSources: [], primaryText: "" }
  if (!Array.isArray(results) || results.length === 0) {
    return { safe: false, reason: 'no_results', approvedSources: [], primaryText: '' };
  }

  // Primary candidate is the first result
  const primary = results[0];
  const primaryText = primary.content || "";

  // 1) Collect domains
  const domains = new Set();
  results.forEach(r => {
    if (r.link) {
      const d = extractDomain(r.link || '');
      if (d) domains.add(d);
    } else if (r.rawBlock && Array.isArray(r.rawBlock.snippet_links) && r.rawBlock.snippet_links.length > 0) {
      const d = extractDomain(r.rawBlock.snippet_links[0].link || '');
      if (d) domains.add(d);
    }
  });
  const domainList = Array.from(domains);

  // 2) Credibility check
  let credibleCount = 0;
  for (const d of domainList) {
    if (isCredibleDomain(d)) credibleCount++;
  }

  // 3) Numeric/address guard
  const hasNumeric = containsNumericClaim(primaryText);
  const hasAddressLike = looksLikeAddressVN(primaryText);

  // If primary has numeric/address but no credible source -> reject
  if ((hasNumeric || hasAddressLike) && credibleCount === 0) {
    debugSteps.push({
      guard: 'reject_numeric_or_address_without_credible_source',
      primary_excerpt: primaryText.slice(0, 300),
      domains: domainList
    });
    return { safe: false, reason: 'numeric_or_address_without_credible_source', approvedSources: [], primaryText };
  }

  // If there are sources but none credible, still allow but mark as low_cred
  const approvedSources = [];
  for (const r of results) {
    const link = r.link || (r.rawBlock && r.rawBlock.snippet_links && r.rawBlock.snippet_links[0] && r.rawBlock.snippet_links[0].link) || "";
    if (link) {
      approvedSources.push({ title: r.title, link, excerpt: (r.content || "").slice(0, 300) });
    }
  }

  return { safe: true, reason: null, approvedSources, primaryText };
}

// ---------- Build Evidence-Only Prompt ----------
function buildEvidencePrompt(userPrompt, approvedSources, options = {}) {
  // approvedSources: array of { title, link, excerpt }
  // options: { currentDate }
  const currentDate = options.currentDate || new Date().toLocaleDateString('vi-VN');
  const sourcesText = (approvedSources || []).map((s, i) => {
    return `[${i+1}] ${s.title}\nURL: ${s.link}\nExcerpt: ${s.excerpt}\n`;
  }).join("\n");

  const rules = `
STRICT EVIDENCE-ONLY MODE:
1) You MUST answer only using the provided excerpts above. Do NOT invent, infer, expand, or guess.
2) For any factual claim (address, price, date, phone, hours) you must include a citation marker like [1]. The marker must match the index from the provided list.
3) If the answer cannot be produced EXACTLY from the excerpts, reply exactly: "Không có dữ liệu trong kết quả tìm kiếm."
4) Keep the answer concise (<= 200 words). If quoting verbatim from an excerpt, wrap in quotes and include citation.
5) Do NOT create new phone numbers, dates, addresses, or website domains.
6) If multiple sources conflict, state the conflict and cite sources.
`;

  const assistantInstruction = `
User Query: ${userPrompt}

[SOURCES]
${sourcesText || "No sources provided."}

${rules}
Current Date: ${currentDate}
`;

  return assistantInstruction;
}

// ---------- Main Worker ----------
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const debug = { steps: [] };

  try {
    const body = await request.json().catch(() => ({}));
    const { modelName = 'Smart', messages = [] } = body;

    // --- Model config (set keys/models here) ---
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
    if (!config) {
      return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be non-empty array' }), { status: 400, headers: corsHeaders });
    }

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let sources = [];

    // --- Router decision ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- If search needed, call SerpAPI ---
    let searchResults = null;
    if (analysis.needed) {
      const sr = await searchGoogleAIMode(analysis.query, env.SERPAPI_KEY, debug.steps);
      if (sr && sr.results) {
        searchResults = sr.results;
        toolUsed = 'Google AI Mode (SerpAPI)';
      } else {
        toolUsed = 'Search Failed (Internal Only)';
        debug.steps.push({ search: 'failed_or_no_results' });
      }
    } else {
      debug.steps.push({ search: 'not_needed_by_router' });
    }

    // --- If have searchResults, run Fact-Guard ---
    let guardResult = { safe: false, reason: 'no_search' };
    if (searchResults) {
      guardResult = runFactGuard(searchResults, debug.steps);
    }

    // If guard fails, we will instruct model to refuse to invent
    if (!guardResult.safe) {
      // If search was needed but guard rejects numeric/address claims -> respond with refusal OR fallback to internal without numbers
      const refusalText = 'Không có dữ liệu trong kết quả tìm kiếm.';
      // Build a minimal answer using internal knowledge but explicitly forbidding numeric/address invention
      const fallbackMessages = [
        { role: 'system', content: 'You are Oceep. Helpful, direct and accurate. DO NOT INVENT facts or addresses.' },
        { role: 'user', content: `${lastMsg}\n\nSearch results were found but the Fact-Guard rejected them because they contained numeric/address claims with no credible sources. You must NOT invent any numbers, addresses, or dates. If you cannot answer exactly, reply: "Không có dữ liệu trong kết quả tìm kiếm."` }
      ];

      // Call model to produce the refusal or safe answer
      try {
        const modelRes = await safeFetch(OPENROUTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
          body: JSON.stringify({
            model: config.model,
            messages: fallbackMessages,
            max_tokens: 400,
            temperature: 0
          })
        }, 20000);

        if (!modelRes.ok) {
          const errText = await modelRes.text();
          throw new Error(`OpenRouter Error (${config.model}): ${errText}`);
        }
        const data = await modelRes.json();
        let answer = data?.choices?.[0]?.message?.content || refusalText;
        answer = cleanResponse(answer);
        // If model tries to answer with something other than refusal, ensure it contains "Không có dữ liệu..." — otherwise force it
        if (!/Không có dữ liệu trong kết quả tìm kiếm/i.test(answer)) {
          answer = refusalText;
        }

        return new Response(JSON.stringify({
          content: answer,
          toolUsed,
          sources: [],
          debug
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (err) {
        return new Response(JSON.stringify({
          error: 'Model call failed during refusal flow',
          detail: String(err),
          debug
        }), { status: 500, headers: corsHeaders });
      }
    }

    // --- If guard safe: prepare evidence prompt & call model in EVIDENCE-ONLY mode ---
    const approved = guardResult.approvedSources || [];
    // Build a condensed approvedSources array to return to user and use in prompt
    const approvedForPrompt = approved.slice(0, 6).map((s, i) => {
      return { title: s.title || `Source ${i+1}`, link: s.link || '', excerpt: (s.excerpt || s.content || '').slice(0, 400) };
    });

    // Build system/user messages for evidence-only instruction
    const evidenceInstruction = buildEvidencePrompt(lastMsg, approvedForPrompt, { currentDate: new Date().toLocaleDateString('vi-VN') });

    const cleanMessages = [
      { role: 'system', content: 'You are Oceep. Helpful, direct and accurate. Follow the evidence-only rules strictly.' },
      { role: 'user', content: evidenceInstruction }
    ];

    // Also include earlier conversation messages (excluding original system)
    // attach a brief context: the last user message for relevance
    // (Don't include huge history to avoid context bloat)
    cleanMessages.push({ role: 'user', content: `Conversation context (last user message): ${lastMsg}` });

    // Call model
    try {
      const modelRes = await safeFetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({
          model: config.model,
          messages: cleanMessages,
          max_tokens: 700,
          temperature: 0
        })
      }, 40000);

      if (!modelRes.ok) {
        const errText = await modelRes.text();
        try {
          const errJson = JSON.parse(errText);
          const msg = errJson.error?.message || errText;
          throw new Error(`OpenRouter Error (${config.model}): ${msg}`);
        } catch (e) {
          throw new Error(`OpenRouter Failed ${modelRes.status}: ${errText}`);
        }
      }

      const data = await modelRes.json();
      let answer = data?.choices?.[0]?.message?.content || '';
      answer = cleanResponse(answer);

      // Ensure the model didn't hallucinate: if answer contains numbers/addresses, it must contain citation markers [n]
      const risky = containsNumericClaim(answer) || looksLikeAddressVN(answer);
      if (risky && !/\[\d+\]/.test(answer)) {
        // Force refusal — safer than returning a potential hallucination
        debug.steps.push({ postcheck: 'model_returned_risky_without_citation', answer_excerpt: answer.slice(0,200) });
        return new Response(JSON.stringify({
          content: 'Không có dữ liệu trong kết quả tìm kiếm.',
          toolUsed,
          sources: approvedForPrompt,
          debug
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Build sources list to return
      const sourcesReturn = approvedForPrompt.map((s, i) => ({ index: i+1, title: s.title, link: s.link }));

      return new Response(JSON.stringify({
        content: answer,
        toolUsed,
        sources: sourcesReturn,
        debug
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
      return new Response(JSON.stringify({
        error: `Model call failed: ${String(err)}`,
        debug
      }), { status: 500, headers: corsHeaders });
    }

  } catch (err) {
    return new Response(JSON.stringify({
      error: String(err),
      stack: err.stack,
      debug
    }), { status: 500, headers: corsHeaders });
  }
}
