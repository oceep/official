// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EXA_API_URL = 'https://api.exa.ai/search';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 

// ----------------------------
// Helpers
// ----------------------------
async function safeFetch(url, opts = {}, ms = 15000) {
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
    return cleaned.trim();
}

// ----------------------------
// 1. INTELLIGENT ROUTER (Quyết định Search)
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  // HARD RULES: Ép search nếu có từ khóa địa điểm/thời gian thực
  const lower = userPrompt.toLowerCase();
  const triggerWords = ['địa chỉ', 'ở đâu', 'chỗ nào', 'là gì', 'address', 'location', 'review', 'giá', 'mới nhất', 'hôm nay', 'tại hà nội', 'tại hcm', 'thời tiết'];
  
  if (triggerWords.some(w => lower.includes(w)) || userPrompt.split(' ').length < 10) {
      debugSteps.push({ router: 'hard_rule_trigger', msg: 'Forcing search due to keywords' });
      return { needed: true, query: userPrompt };
  }

  if (!apiKey) return { needed: true, query: userPrompt };

  try {
    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: 'Output JSON: { "needed": boolean, "query": "string" }. If querying real-world entities, places, or facts, needed must be true.' },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 50,
      temperature: 0
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 4000);
    
    if (!res.ok) throw new Error('Router API failed');
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { 
        parsed = { needed: true, query: userPrompt };
    }
    debugSteps.push({ router: 'ai_decision', output: parsed });
    return parsed;

  } catch (e) {
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2. SEARCH LAYER (Exa.ai Neural Search)
// ----------------------------
async function searchExa(query, apiKey, debugSteps) {
    if (!apiKey) {
        debugSteps.push({ exa_error: 'MISSING_API_KEY' });
        return null;
    }

    try {
        const payload = {
            query: query,
            type: "neural", 
            useAutoprompt: true,
            numResults: 3, 
            contents: {
                text: { maxCharacters: 1500 }
            }
        };

        const res = await safeFetch(EXA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        }, 12000);

        if (!res.ok) {
            const errText = await res.text();
            debugSteps.push({ exa_fail: res.status, details: errText });
            return null;
        }

        const data = await res.json();
        
        if (data && data.results && data.results.length > 0) {
            return data.results.map(r => ({
                title: r.title || 'No Title',
                link: r.url || '',
                content: (r.highlights && r.highlights[0]) ? r.highlights[0] : (r.text || '')
            }));
        }
        
        debugSteps.push({ exa_warning: '0 results found' });
        return null;

    } catch (e) {
        debugSteps.push({ exa_exception: String(e) });
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

    // --- CẬP NHẬT MODEL THEO YÊU CẦU ---
    const apiConfig = {
      Mini: { 
          key: env.MINI_API_KEY, 
          model: 'qwen/qwen3-4b:free' // Lưu ý: Nếu OpenRouter chưa có Qwen3, hãy đổi thành 'qwen/qwen-2.5-7b-instruct:free'
      },
      Smart: { 
          key: env.SMART_API_KEY, 
          model: 'mistralai/mistral-small-3.1-24b-instruct:free' 
      },
      Nerd: { 
          key: env.NERD_API_KEY, 
          model: 'amazon/nova-2-lite-v1:free' 
      }
    };

    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- B1: PHÂN TÍCH ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- B2: GỌI EXA ---
    if (analysis.needed) {
        const results = await searchExa(analysis.query, env.EXA_API_KEY, debug.steps);
        
        if (results) {
            toolUsed = 'WebSearch (Exa.ai)';
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Link: ${r.link}\n   Info: ${r.content.replace(/\n+/g, ' ').slice(0, 1000)}...`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (Exa Failed)';
        }
    }

    // --- B3: TRẢ LỜI ---
    const finalMessages = [...messages];

    if (searchContext) {
        const lastIdx = finalMessages.length - 1;
        // Inject Search Data
        finalMessages[lastIdx].content = `
User Query: "${lastMsg}"

[SYSTEM DATA: EXA SEARCH RESULTS]
${searchContext}

[INSTRUCTION]
Answer the user query based ONLY on the search results above.
- Cite sources as [1], [2].
- If info is missing, say so.
- Do NOT hallucinate.
`;
    } else if (analysis.needed && toolUsed.includes('Failed')) {
        finalMessages.push({
            role: 'system',
            content: 'Note: Search failed. Answer based on internal knowledge but mention that live data is unavailable.'
        });
    }

    const systemPrompt = {
        role: 'system',
        content: `You are Oceep. Answer accurately. Do not fake tool outputs.`
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
    let answer = data?.choices?.[0]?.message?.content || '';

    // Cleanup Output
    answer = cleanResponse(answer);

    if (answer.startsWith('{')) {
        answer = "Lỗi hiển thị dữ liệu (JSON Error). Vui lòng thử lại.";
    }

    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
