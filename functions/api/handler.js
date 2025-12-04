// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. TOOL: AI DECISION MAKER (Hidden Thought)
// ==========================================
async function decideToSearch(query, apiKey) {
    // Nếu chưa cấu hình Key này thì mặc định luôn Search để tránh lỗi
    if (!apiKey) {
        console.warn("Missing SEARCH_API_KEY, defaulting to TRUE");
        return true; 
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Dùng SEARCH_API_KEY riêng biệt
                'HTTP-Referer': 'https://oceep.pages.dev/',
                'X-Title': 'Oceep Hidden Classifier'
            },
            body: JSON.stringify({
                model: 'arcee-ai/trinity-mini:free', 
                messages: [
                    {
                        role: "system",
                        content: `Analyze the user query. Does it require external real-time information (news, weather, stock prices, facts about specific people/events) to answer correctly?
- Reply "true" if YES.
- Reply "false" if NO (e.g. coding, math, greetings, translation, creative writing).
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
        
        // Chỉ trả về True/False, người dùng không hề biết bước này diễn ra
        return decision.includes("true");
    } catch (e) {
        console.error("Decision Error:", e);
        return true; // Fallback an toàn
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        const linkPattern = /<a class="result__url" href="(http[^"]+)"/g;
        let match;
        const results = [];
        let count = 0;

        while ((match = linkPattern.exec(html)) !== null && count < 3) { 
            const link = match[1];
            if (!link.includes('qwant.com') && !link.includes('ad.') && !link.includes('javascript:')) {
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
                    "headers": ["User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/98.0.4758.102"],
                    "render_js": false, 
                    "text_content_only": true 
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            let content = data.body || "";
            content = content.replace(/\s+/g, ' ').trim().slice(0, 1500);
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

        // Config API Keys cho Model chính
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'meta-llama/llama-3.3-70b-instruct:free' }, 
            'Smart': { key: env.SMART_API_KEY, model: 'amazon/nova-2-lite-v1:free' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content; 
        let injectionData = "";
        let toolUsed = null;

        // [BƯỚC 1]: Suy nghĩ trong "tri thức ẩn" (Hidden Thought)
        // Sử dụng SEARCH_API_KEY riêng biệt
        const shouldSearch = await decideToSearch(lastMsg, env.SEARCH_API_KEY);

        if (shouldSearch) {
            // [BƯỚC 2]: Qwant Search
            const urls = await searchQwantLite(lastMsg);

            if (urls && urls.length > 0) {
                // [BƯỚC 3]: ScrapeNinja đọc nội dung
                const scrapedContent = await scrapeWithNinja(urls, env.RAPIDAPI_KEY);
                
                if (scrapedContent) {
                    injectionData += `[REAL-TIME SEARCH RESULTS]\n${scrapedContent}\n\n`;
                    toolUsed = "Smart Search (Active)";
                } else {
                    toolUsed = "Smart Search (Source Protected)";
                }
            } else {
                toolUsed = "Smart Search (No Results)";
            }
        } else {
            // Nếu AI "nhỏ" bảo không cần search, AI chính sẽ trả lời bằng kiến thức nội tại
            toolUsed = "Internal Knowledge"; 
        }

        let finalMessages = [...messages];
        if (injectionData) {
            finalMessages.push({ 
                role: "system", 
                content: `
You are Oceep. You MUST prioritize the following SEARCH RESULTS to answer the user's request.
Cite the SOURCE url when using external info.

${injectionData}

Answer in Vietnamese.` 
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
                temperature: 0.5 
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
