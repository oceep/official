// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. TOOL: AI DECISION MAKER (Aggressive Mode)
// ==========================================
async function decideToSearch(query, apiKey) {
    if (!apiKey) {
        // Nếu không có key, mặc định SEARCH luôn cho chắc
        return true; 
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://oceep.pages.dev/',
                'X-Title': 'Oceep Classifier'
            },
            body: JSON.stringify({
                model: 'arcee-ai/trinity-mini:free', 
                messages: [
                    {
                        role: "system",
                        // Prompt này ép AI phải "nghi ngờ" kiến thức của chính nó
                        content: `You are a search decision engine.
Analyze the user query. Does it involve:
1. Recent events, news, or weather?
2. Prices, products, or stock markets?
3. Specific facts about people, places, or technology?
4. Anything that might have changed since 2023?

If ANY of the above is YES, output "true".
Only output "false" for generic greetings, simple math, code, or translations.
Output ONLY "true" or "false".`
                    },
                    { role: "user", content: query }
                ],
                max_tokens: 5, 
                temperature: 0
            })
        });

        const data = await response.json();
        const decision = data.choices?.[0]?.message?.content?.trim().toLowerCase() || "true";
        
        console.log(`[Decision] Query: "${query}" -> Need Search? ${decision}`);
        
        return decision.includes("true");
    } catch (e) {
        console.error("Decision Error, defaulting to TRUE:", e);
        return true; // Thà search thừa còn hơn bỏ sót
    }
}

// ==========================================
// 2. TOOL: QWANT LITE SEARCH
// ==========================================
async function searchQwantLite(query) {
    try {
        const url = `https://lite.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
        const res = await fetch(url, {
            headers: {
                // User-Agent mới nhất để tránh bị chặn
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        
        // Regex bắt link (chặt chẽ hơn)
        const linkPattern = /<a class="result__url" href="(http[^"]+)"/g;
        let match;
        const results = [];
        let count = 0;

        while ((match = linkPattern.exec(html)) !== null && count < 3) { 
            const link = match[1];
            // Lọc kỹ rác
            if (!link.includes('qwant.com') && !link.includes('ad.') && !link.includes('javascript:') && !link.startsWith('/')) {
                results.push(link);
                count++;
            }
        }
        return results.length > 0 ? results : null;
    } catch (e) { return null; }
}

// ==========================================
// 3. TOOL: SCRAPE NINJA
// ==========================================
async function scrapeWithNinja(urls, rapidApiKey) {
    if (!rapidApiKey || urls.length === 0) return "";
    const selectedUrls = urls.slice(0, 2); 
    const promises = selectedUrls.map(async (url) => {
        try {
            const response = await fetch('https://scrapeninja.p.rapidapi.com/scrape', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'X-RapidAPI-Key': rapidApiKey,
                    'X-RapidAPI-Host': 'scrapeninja.p.rapidapi.com'
                },
                body: JSON.stringify({
                    "url": url,
                    "headers": ["User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"],
                    "render_js": false, 
                    "text_content_only": true 
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            let content = data.body || "";
            // Tăng giới hạn đọc lên 2000 ký tự để AI có nhiều context hơn
            content = content.replace(/\s+/g, ' ').trim().slice(0, 2000);
            if (content.length < 50) return null;
            return `SOURCE: ${url}\nCONTENT: ${content}\n`;
        } catch (e) { return null; }
    });
    const contents = await Promise.all(promises);
    return contents.filter(c => c !== null).join("\n---\n");
}

// ==========================================
// 4. MAIN HANDLER
// ==========================================
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages } = await request.json();

        // Config API Keys
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'kwaipilot/kat-coder-pro:free' }, 
            'Smart': { key: env.SMART_API_KEY, model: 'amazon/nova-2-lite-v1:free' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content; 
        let injectionData = "";
        let toolUsed = null;

        // [BƯỚC 1]: Hỏi AI Classifier (Với prompt "Aggressive")
        const shouldSearch = await decideToSearch(lastMsg, env.SEARCH_API_KEY);

        if (shouldSearch) {
            // [BƯỚC 2]: Tìm kiếm
            const urls = await searchQwantLite(lastMsg);

            if (urls && urls.length > 0) {
                // [BƯỚC 3]: Đọc nội dung
                const scrapedContent = await scrapeWithNinja(urls, env.RAPIDAPI_KEY);
                
                if (scrapedContent) {
                    injectionData += `
=== REAL-TIME SEARCH RESULTS (IGNORE INTERNAL KNOWLEDGE) ===
The following information comes from live web searches performed just now.
${scrapedContent}
============================================================
`;
                    toolUsed = "Smart Search (Active)";
                } else {
                    toolUsed = "Smart Search (Source Protected)";
                }
            } else {
                toolUsed = "Smart Search (No Results)";
            }
        } else {
            toolUsed = "Internal Knowledge"; 
        }

        let finalMessages = [...messages];
        if (injectionData) {
            // System Prompt này cực gắt để "tẩy não" AI quên kiến thức cũ
            finalMessages.push({ 
                role: "system", 
                content: `
CRITICAL INSTRUCTION:
You are Oceep. You have NO internal knowledge of events, prices, or facts after 2023.
You MUST rely ENTIRELY on the provided "REAL-TIME SEARCH RESULTS" above to answer.
- If the search results contradict what you "know", TRUST THE SEARCH RESULTS.
- Cite the [SOURCE: url] for every fact you state.
- Answer in Vietnamese.
` 
            });
        }

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'HTTP-Referer': 'https://oceep.pages.dev/',
                'X-Title': 'Oceep'
            },
            body: JSON.stringify({
                model: config.model,
                messages: finalMessages,
                stream: false, 
                max_tokens: 2500, 
                temperature: 0.3 // Giảm nhiệt độ để AI bớt "sáng tạo" và bám sát context hơn
            }),
        });

        const data = await res.json();
        return new Response(JSON.stringify({ 
            content: data.choices?.[0]?.message?.content || "",
            toolUsed: toolUsed 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
}
