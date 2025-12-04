// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. TOOL: DUCKDUCKGO SEARCH (HTML Version)
// ==========================================
async function searchDuckDuckGo(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const html = await res.text();

        const results = [];
        const regex = /<div class="result__body">[\s\S]*?<a class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

        let match, count = 0;

        while ((match = regex.exec(html)) !== null && count < 3) {
            let link = match[1];
            let title = match[2].replace(/<[^>]*>/g, '').trim();
            let snippet = match[3].replace(/<[^>]*>/g, '').trim();

            if (link.startsWith('//duckduckgo.com/l/?uddg=')) {
                link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
            }

            if (link && !link.includes('ad_provider')) {
                results.push({ link, title, snippet });
                count++;
            }
        }

        return results.length > 0 ? results : null;

    } catch (e) {
        console.error("DDG Error:", e);
        return null;
    }
}

// ==========================================
// 2. TOOL: NATIVE SCRAPER (FREE)
// ==========================================
async function scrapeContentFree(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        clearTimeout(timeoutId);

        if (!res.ok) return null;

        let html = await res.text();

        // Xóa script/style
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "");
        html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "");
        html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gmi, "");
        html = html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gmi, "");
        html = html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gmi, "");

        // ❗ FIXED: Xóa comment HTML (bug lúc trước)
        html = html.replace(/<!--[\s\S]*?-->/g, "");

        // Xóa thẻ HTML giữ lại text
        let text = html.replace(/<[^>]+>/g, " ");

        // Xóa khoảng trắng dư
        text = text.replace(/\s+/g, " ").trim();

        return text.slice(0, 1500);

    } catch (e) {
        return null;
    }
}

// ==========================================
// 3. AI DECISION MAKER
// ==========================================
async function decideToSearch(query, apiKey) {
    if (!apiKey) return true;

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
                        content: `Does the query need real-time external info (news, facts, prices, weather)? Reply "true" or "false".`
                    },
                    { role: "user", content: query }
                ],
                max_tokens: 5,
                temperature: 0
            })
        });

        const data = await response.json();
        const decision = data.choices?.[0]?.message?.content?.toLowerCase() || "true";
        return decision.includes("true");

    } catch (e) { 
        return true; 
    }
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

        const apiConfig = {
            'Mini':  { key: env.MINI_API_KEY,  model: 'kwaipilot/kat-coder-pro:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'amazon/nova-2-lite-v1:free' },
            'Nerd':  { key: env.NERD_API_KEY,  model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];

        const lastMsg = messages[messages.length - 1].content;

        let injectionData = "";
        let toolUsed = null;

        // AI quyết định có search hay không
        const shouldSearch = await decideToSearch(lastMsg, env.SEARCH_API_KEY);

        if (shouldSearch) {
            const ddgResults = await searchDuckDuckGo(lastMsg);

            if (ddgResults && ddgResults.length > 0) {

                const scrapePromises = ddgResults.slice(0, 2).map(async (item) => {
                    const content = await scrapeContentFree(item.link);

                    if (content && content.length > 100) {
                        return `TITLE: ${item.title}\nLINK: ${item.link}\nCONTENT: ${content}\n`;
                    }

                    return `TITLE: ${item.title}\nLINK: ${item.link}\nSUMMARY: ${item.snippet}\n`;
                });

                const scrapedData = await Promise.all(scrapePromises);

                injectionData = `[LIVE WEB SEARCH RESULTS - DUCKDUCKGO]\n${scrapedData.join("\n---\n")}\n\n`;
                toolUsed = "Web Search (DDG + Native Scraper)";

            } else {
                toolUsed = "Web Search (No Results)";
            }

        } else {
            toolUsed = "Internal Knowledge";
        }

        let finalMessages = [...messages];

        if (injectionData) {
            finalMessages.push({
                role: "system",
                content: `
CRITICAL: You are Oceep. You possess NO internal knowledge after 2023.
You MUST rely on the [LIVE WEB SEARCH RESULTS] above.
- Cite sources as [Title](Link).
- If data missing, say "không đủ dữ liệu".
- Always answer in Vietnamese.

${injectionData}`
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
            toolUsed
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
