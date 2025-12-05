// functions/api/handler.js

/**
 * handler.js — "Lite Search Agent" (Final Version)
 *
 * WORKFLOW:
 * 1. THE MIND (Query Gen): Dùng 'arcee-ai/trinity-mini' (hoặc model nhỏ) để quyết định có search không.
 * 2. THE HANDS (Search): Dùng DuckDuckGo Lite (Miễn phí, HTML Parsing) để tìm tin tức.
 * 3. THE MOUTH (Answer): Dùng Model chính để trả lời dựa trên kết quả tìm được.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CẤU HÌNH ---
const SEARCH_TIMEOUT_MS = 10000; // 10 giây cho search
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; // Model nhỏ, nhanh để tạo query

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
  if (!apiKey) return { needed: true, query: userPrompt }; // Mất key thì cứ search đại

  try {
    const systemPrompt = `You are a Search Optimizer.
    Analyze the user's request.
    1. DECIDE: Does this need external/real-time info? (True/False)
    2. QUERY: If True, write the BEST Google search query (in user's language).
    
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
        // Fallback nếu model trả về text thường
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
// 2) SEARCH LAYER (DuckDuckGo Lite)
// ----------------------------
async function searchDDGLite(query, debugSteps) {
    try {
        // Dùng DuckDuckGo Lite (bản nhẹ, dễ parse HTML)
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        
        const res = await safeFetch(url, {
            headers: { 
                // Giả danh Browser cũ để lấy HTML đơn giản
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html' 
            }
        }, 8000);

        if (!res.ok) {
            debugSteps.push({ ddg_error: res.status });
            return null;
        }

        const html = await res.text();

        // Regex đơn giản để lấy kết quả từ HTML của DDG Lite
        // Cấu trúc thường là: <a class="result-link">Title</a> ... <td class="result-snippet">Snippet</td>
        const results = [];
        const regex = /<a class="result-link" href="(.*?)">(.*?)<\/a>[\s\S]*?<td class="result-snippet">(.*?)<\/td>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
            results.push({
                link: match[1],
                title: match[2].replace(/<[^>]+>/g, '').trim(), // Xóa thẻ HTML thừa
                snippet: match[3].replace(/<[^>]+>/g, '').trim()
            });
        }
        
        debugSteps.push({ ddg_found: results.length });
        return results.length ? results : null;

    } catch (e) {
        debugSteps.push({ ddg_exception: String(e) });
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
      Mini: { key: env.MINI_API_KEY, model: 'tngtech/tng-r1t-chimera:free' },
      Smart: { key: env.SMART_API_KEY, model: 'qwen/qwen3-4b:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let injectionData = '';

    // --- STEP 1: GENERATE QUERY ---
    // Ưu tiên dùng DECIDE_KEY, nếu không có thì dùng ké SMART_KEY
    const queryKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await generateSearchQuery(lastMsg, queryKey, debug.steps);

    // --- STEP 2: SEARCH (DuckDuckGo Lite Only) ---
    if (decision.needed) {
        const results = await searchDDGLite(decision.query, debug.steps);
        
        if (results) {
            toolUsed = 'WebSearch (DuckDuckGo)';
            
            // Format dữ liệu để nhét vào Prompt
            const context = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\nSource: ${r.link}\nSummary: ${r.snippet}`
            ).join('\n\n');

            injectionData = `
==========
SYSTEM NOTE: WEB SEARCH RESULTS ACQUIRED.
User Query: "${decision.query}"
Search Results:
${context}
==========
`;
        } else {
            toolUsed = 'WebSearch (Failed/No Results)';
            debug.steps.push({ msg: 'DDG returned no data' });
        }
    }

    // --- STEP 3: ANSWER (Strict Prompt) ---
    const finalMessages = [...messages];

    // System Prompt này được viết để "ép" model trả lời tự nhiên
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep, a helpful and smart AI assistant.
        
        INSTRUCTIONS:
        1. Context: I have ALREADY performed a web search for you. The results are attached above (SYSTEM NOTE).
        2. Action: Read the "Search Results" and answer the user's question directly and naturally.
        3. Prohibition: DO NOT output JSON, XML, or debug information. DO NOT say "I will search for...".
        4. Citation: Use [1], [2] to cite sources if you use the information.
        5. Fallback: If search results are empty or irrelevant, use your own knowledge but admit that real-time info might be missing.
        6. Language: Always answer in the same language as the user (Vietnamese/English).
        
        ${injectionData}`
    };

    // Đẩy System Prompt lên đầu list (Xóa system cũ nếu có để tránh nhiễu)
    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift(systemPrompt);

    // Gọi Model trả lời
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

    // Trả về JSON chuẩn
    return new Response(JSON.stringify({
      content: answer,
      toolUsed,
      debug
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: corsHeaders });
  }
}
