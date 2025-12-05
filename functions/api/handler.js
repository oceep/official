// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const SEARCH_TIMEOUT_MS = 15000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free'; // Model nhỏ để sửa từ khóa search

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
// 1) QUERY REFINER ("The SEO Expert")
// ----------------------------
async function refineSearchQuery(userPrompt, apiKey, debugSteps) {
  // Nếu không có key thì dùng nguyên văn câu hỏi của user
  if (!apiKey) return { needed: true, query: userPrompt };

  try {
    const systemPrompt = `You are a Search Engine Expert. 
    Task: Convert the User's Message into the BEST keyword phrase for DuckDuckGo Search.
    
    Rules:
    1. If the user asks for real-time info (news, price, code docs, events), output the optimized search keywords.
    2. If the user just says "Hi" or "Write code", output "SKIP".
    3. Output ONLY the keywords or "SKIP". Do not explain.`;

    const payload = {
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 30, // Chỉ cần ngắn gọn
      temperature: 0.1
    };
    
    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 4000);
    
    if (!res.ok) throw new Error('Refiner Failed');
    
    const data = await res.json();
    const output = data?.choices?.[0]?.message?.content?.trim() || 'SKIP';

    if (output === 'SKIP' || output.length < 2) {
        debugSteps.push({ step: 'refiner', result: 'skip_search' });
        return { needed: false, query: '' };
    }

    debugSteps.push({ step: 'refiner', original: userPrompt, optimized: output });
    return { needed: true, query: output };

  } catch (e) {
    // Lỗi thì cứ search đại bằng prompt gốc cho chắc
    return { needed: true, query: userPrompt };
  }
}

// ----------------------------
// 2) SEARCH LAYER (DuckDuckGo Lite Scraper)
// ----------------------------
async function searchDDGLite(query, debugSteps) {
    try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        
        const res = await safeFetch(url, {
            headers: { 
                // Giả lập trình duyệt để tránh bị chặn
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' // Ưu tiên tiếng Việt
            }
        }, 10000);

        if (!res.ok) {
            debugSteps.push({ ddg_status: res.status });
            return null;
        }

        const html = await res.text();

        // Regex để "cào" dữ liệu từ HTML của DuckDuckGo Lite
        const results = [];
        // Pattern: Tìm thẻ <a> có class 'result-link' và thẻ <td> có class 'result-snippet'
        const regex = /<a[^>]*class="result-link"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
        
        let match;
        // Lấy 5 kết quả đầu tiên
        while ((match = regex.exec(html)) !== null && results.length < 5) {
            results.push({
                link: match[1],
                title: match[2].replace(/<[^>]+>/g, '').trim(), // Xóa thẻ HTML thừa
                snippet: match[3].replace(/<[^>]+>/g, '').trim()
            });
        }
        
        return results.length ? results : null;

    } catch (e) {
        debugSteps.push({ ddg_error: String(e) });
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

    // Validate Config
    const apiConfig = {
      Mini: { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
      Smart: { key: env.SMART_API_KEY, model: 'z-ai/glm-4.5-air:free' },
      Nerd: { key: env.NERD_API_KEY, model: 'amazon/nova-2-lite-v1:free' }
    };
    const config = apiConfig[modelName];
    if (!config) return new Response(JSON.stringify({ error: 'Invalid modelName' }), { status: 400, headers: corsHeaders });
    
    if (!messages.length) return new Response(JSON.stringify({ error: 'No messages' }), { status: 400, headers: corsHeaders });

    const lastMsg = messages[messages.length - 1].content || '';
    let toolUsed = 'Internal Knowledge';
    let searchContext = '';

    // --- STEP 1: REFINE QUERY ---
    // Dùng key DECIDE hoặc SMART để chạy bước này
    const refinerKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const decision = await refineSearchQuery(lastMsg, refinerKey, debug.steps);

    // --- STEP 2: SEARCH (DuckDuckGo) ---
    if (decision.needed) {
        const results = await searchDDGLite(decision.query, debug.steps);
        
        if (results && results.length > 0) {
            toolUsed = 'WebSearch (DuckDuckGo)';
            searchContext = results.map((r, i) => 
                `[${i+1}] Title: ${r.title}\n   Source: ${r.link}\n   Content: ${r.snippet}`
            ).join('\n\n');
        } else {
            toolUsed = 'WebSearch (No Results)';
            debug.steps.push({ msg: 'Search ran but found nothing' });
        }
    }

    // --- STEP 3: ANSWER ---
    const finalMessages = [...messages];

    if (searchContext) {
        // Chiến thuật: Nhét kết quả vào tin nhắn của User.
        // Điều này khiến Model buộc phải đọc nó.
        const lastIdx = finalMessages.length - 1;
        finalMessages[lastIdx].content = `
User's Question: "${lastMsg}"

---
SYSTEM NOTIFICATION:
I found these search results on DuckDuckGo for query: "${decision.query}"

${searchContext}

INSTRUCTION: 
Using the search results above, answer the User's Question. 
- Answer naturally in the user's language.
- Do NOT output raw JSON or code blocks.
- If the results are irrelevant, ignore them.
---
`;
    }

    // System Prompt nhẹ nhàng
    const systemPrompt = {
        role: 'system',
        content: `You are Oceep. You are a helpful assistant.
        Your goal is to provide accurate answers based on the provided context.`
    };
    const cleanMessages = finalMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift(systemPrompt);

    // Call Model
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

    // Safeguard: Nếu lỡ nó vẫn in JSON (hiếm), trả về text báo lỗi
    if (answer.trim().startsWith('{') && answer.includes('"query"')) {
       answer = "Tôi đã tìm thấy thông tin nhưng gặp lỗi hiển thị dữ liệu. Vui lòng hỏi lại.";
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
