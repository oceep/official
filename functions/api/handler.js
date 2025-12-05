// functions/api/handler.js

/**
 * handler.js — "DuckDuckGo VQD JSON Search"
 *
 * CƠ CHẾ "COOK" DỮ LIỆU:
 * 1. THE MIND: Tối ưu từ khóa search.
 * 2. THE HANDS: Thực hiện quy trình VQD Auth để lấy JSON sạch từ DuckDuckGo (Bypass HTML scraping).
 * 3. THE MOUTH: Trả lời tự nhiên.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; 

// Fake User Agent để DuckDuckGo không chặn
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
// 1) QUERY REFINER
// ----------------------------
async function refineSearchQuery(userPrompt, apiKey, debugSteps) {
  if (!apiKey) return { needed: true, query: userPrompt };

  try {
    const systemPrompt = `You are a Search Expert.
    Task: Convert User Input -> Best DuckDuckGo Search Query.
    Rules:
    - If user asks for real-time info/code/news -> Output optimized keywords.
    - If user says Hi/Write Code/Math -> Output "SKIP".
    - Output ONLY the keywords or "SKIP".`;

    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 40,
      temperature: 0.1
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 5000);
    
    if (!res.ok) throw new Error('Refiner failed');
    const data = await res.json();
    const output = data?.choices?.[0]?.message?.content?.trim() || 'SKIP';

    if (output === 'SKIP' || output.length < 2) return { needed: false, query: '' };
    
    debugSteps.push({ step: 'refiner', original: userPrompt, optimized: output });
    return { needed: true, query: output };

  } catch (e) {
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) DUCKDUCKGO VQD SEARCH (The "Secret" API)
// ----------------------------
async function getVQDToken(query, debugSteps) {
    try {
        // Gọi trang chủ để lấy token VQD ẩn trong HTML hoặc Header
        const res = await safeFetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`, {
            headers: { 'User-Agent': USER_AGENT }
        }, 5000);
        
        const text = await res.text();
        
        // Regex tìm token vqd='4-123456789...'
        const vqdMatch = text.match(/vqd=['"]?([0-9-]+)['"]?/);
        
        if (vqdMatch && vqdMatch[1]) {
            return vqdMatch[1];
        }
        
        debugSteps.push({ vqd_error: 'Token not found in HTML' });
        return null;
    } catch (e) {
        debugSteps.push({ vqd_exception: String(e) });
        return null;
    }
}

async function searchDDG_JSON(query, debugSteps) {
    // Bước 1: Lấy vé (VQD)
    const vqd = await getVQDToken(query, debugSteps);
    if (!vqd) {
        debugSteps.push({ msg: 'Failed to get VQD token, cannot search.' });
        return null;
    }

    // Bước 2: Gọi API ẩn (links.duckduckgo.com/d.js)
    // d.js trả về JSON sạch
    const apiUrl = `https://links.duckduckgo.com/d.js?q=${encodeURIComponent(query)}&vqd=${vqd}&l=us-en&p=1&s=0&df=`;
    
    try {
        const res = await safeFetch(apiUrl, {
            headers: { 'User-Agent': USER_AGENT }
        }, 8000);

        if (!res.ok) return null;
        
        const data = await res.json();
        
        // Data trả về có dạng { results: [ {t: title, u: url, a: snippet}, ... ] }
        if (data && data.results) {
             // Lọc và map dữ liệu
             return data.results.slice(0, 5).map(r => ({
                 title: r.t || 'No Title',
                 link: r.u || '',
                 snippet: r.a || '' // 'a' là snippet trong internal api của DDG
             }));
        }
        return null;

    } catch (e) {
        debugSteps.push({ search_api_error: String(e) });
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

    // Validate
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- EXECUTION ---
    // 1. Refine Query
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await refineSearchQuery(lastMsg, decisionKey, debug.steps);

    // 2. Search (VQD Method)
    if (decision.needed) {
        const results = await searchDDG_JSON(decision.query, debug.steps);
        
        if (results && results.length > 0) {
            toolUsed = 'WebSearch (DuckDuckGo JSON)';
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Link: ${r.link}\n   Info: ${r.snippet}`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (No Results/Block)';
            debug.steps.push({ msg: 'DDG API returned empty' });
        }
    }

    // 3. Answer
    const finalMessages = [...messages];

    if (searchContext) {
        // INJECT DATA DIRECTLY INTO USER PROMPT (Best for instruction following)
        const lastIdx = finalMessages.length - 1;
        finalMessages[lastIdx].content = `
User Question: "${lastMsg}"

---
[SYSTEM DATA: REAL-TIME SEARCH RESULTS]
Query Used: "${decision.query}"

${searchContext}

[INSTRUCTION]
Based ONLY on the search results above (and your knowledge if needed), answer the user's question.
- Answer in the user's language.
- Cite sources as [1], [2].
- NO JSON. NO CODE BLOCKS (unless requested).
---
`;
    }

    // System Prompt
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep. You are a helpful AI assistant. 
        Your goal is to provide accurate answers using provided search data.
        Refuse to output debug data or JSON commands.`
    };
    
    // Clean old system prompts
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

    // Fallback safeguard
    if (answer.trim().startsWith('{')) {
        answer = "Tôi đã tìm thấy thông tin nhưng gặp lỗi hiển thị (JSON Error). Vui lòng hỏi lại.";
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
