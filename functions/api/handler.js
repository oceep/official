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
// 2. SEARCH LAYER (Google AI Mode via SerpAPI)
// ----------------------------
async function searchGoogleAIMode(query, apiKey, debugSteps) {
    if (!apiKey) {
        debugSteps.push({ serp_error: 'MISSING_SERPAPI_KEY' });
        return null;
    }

    try {
        const params = new URLSearchParams({
            engine: "google_ai_overview",  // Google AI Mode
            q: query,
            api_key: apiKey,
            hl: "vi", 
            gl: "vn"
        });

        const res = await safeFetch(`${SERPAPI_URL}?${params.toString()}`, {
            method: 'GET'
        }, 15000);

        if (!res.ok) {
            const txt = await res.text();
            debugSteps.push({ serp_fail: res.status, msg: txt });
            return null;
        }

        const data = await res.json();
        let results = [];

        debugSteps.push({ search_engine: 'google_ai_overview', query: query });

        // 2.1 AI Overview (Main content from Google AI Mode)
        if (data.ai_overview) {
            // Text blocks from AI Overview
            if (data.ai_overview.text_blocks && Array.isArray(data.ai_overview.text_blocks)) {
                data.ai_overview.text_blocks.forEach((block, idx) => {
                    if (block.snippet || block.text) {
                        results.push({
                            title: `AI Overview ${idx + 1}`,
                            link: block.link || "",
                            content: block.snippet || block.text || ""
                        });
                    }
                });
            }
            
            // Direct snippet/answer from AI Overview
            if (data.ai_overview.snippet || data.ai_overview.answer) {
                results.push({
                    title: "Google AI Answer",
                    link: "",
                    content: data.ai_overview.snippet || data.ai_overview.answer
                });
            }

            // Sources from AI Overview
            if (data.ai_overview.sources && Array.isArray(data.ai_overview.sources)) {
                data.ai_overview.sources.slice(0, 3).forEach(src => {
                    results.push({
                        title: src.title || "Source",
                        link: src.link || "",
                        content: src.snippet || src.description || ""
                    });
                });
            }
        }

        // 2.2 Answer Box (fallback)
        if (data.answer_box && results.length === 0) {
            let answer = data.answer_box.snippet || data.answer_box.answer || data.answer_box.result;
            if (answer) {
                results.push({
                    title: "Google Answer",
                    link: data.answer_box.link || "",
                    content: answer
                });
            }
        }

        // 2.3 Knowledge Graph (fallback)
        if (data.knowledge_graph && results.length === 0) {
             results.push({
                title: data.knowledge_graph.title || "Info",
                link: data.knowledge_graph.source?.link || "",
                content: data.knowledge_graph.description || ""
            });
        }

        // 2.4 Organic Results (fallback)
        if (data.organic_results && Array.isArray(data.organic_results) && results.length === 0) {
            data.organic_results.forEach(r => {
                let text = r.snippet || "";
                if (r.address) text += ` Address: ${r.address}`;
                results.push({
                    title: r.title,
                    link: r.link,
                    content: text
                });
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

    // --- CONFIG MODEL ---
    const apiConfig = {
      Mini: { 
          key: env.MINI_API_KEY, 
          model: 'meta-llama/llama-3.3-70b-instruct:free'
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
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Source: ${r.link}\n   Content: ${r.content}`
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
Search engines found no results. Use internal knowledge but DO NOT hallucinate addresses or fake facts.
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
