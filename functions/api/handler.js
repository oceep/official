// functions/api/handler.js

// ----------------------------
// CORS
// ----------------------------
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ----------------------------
// 1. WORKING SEARCH ENGINE (BRAVE SEARCH – FREE, NO API KEY)
// ----------------------------
async function webSearch(query) {
    try {
        const url = `https://search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            }
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (!data.web || !data.web.results) return null;

        return data.web.results.map(r => ({
            title: r.title,
            link: r.url,
            snippet: r.description
        }));

    } catch (e) {
        console.error("Brave Search Error:", e);
        return null;
    }
}

// ----------------------------
// 2. SIMPLE SCRAPER (SAFE)
// ----------------------------
async function scrapePage(url) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        if (!res.ok) return null;
        let html = await res.text();

        html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
        html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
        html = html.replace(/<[^>]+>/g, " ");
        html = html.replace(/\s+/g, " ").trim();

        return html.slice(0, 1500);
    } catch {
        return null;
    }
}

// ----------------------------
// 3. AI DECISION MAKER
// ----------------------------
async function shouldSearchQuery(query, apiKey) {
    if (!apiKey) return true;

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "arcee-ai/trinity-mini:free",
                messages: [
                    { role: "system", content: "Output true if the question needs real-time info. Output false otherwise. ONLY return true/false." },
                    { role: "user", content: query }
                ],
                max_tokens: 5,
                temperature: 0
            })
        });

        const data = await res.json();
        const t = data.choices?.[0]?.message?.content?.toLowerCase() || "";
        return t.includes("true");
    } catch {
        return true;
    }
}

// ----------------------------
// 4. OPTIONS
// ----------------------------
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

// ----------------------------
// 5. MAIN HANDLER
// ----------------------------
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages } = await request.json();

        // ========= MODEL CONFIG =========
        const apiConfig = {
            "Mini":  { key: env.MINI_API_KEY,  model: "kwaipilot/kat-coder-pro:free" },
            "Smart": { key: env.SMART_API_KEY, model: "amazon/nova-2-lite-v1:free" },
            "Nerd":  { key: env.NERD_API_KEY,  model: "x-ai/grok-4.1-fast:free" }
        };

        const config = apiConfig[modelName];
        if (!config) {
            return new Response(JSON.stringify({ error: "Invalid modelName" }), { status: 400 });
        }

        const lastMsg = messages[messages.length - 1].content;
        let injected = "";
        let toolUsed = "Internal Knowledge";

        // ========= DECIDE: NEED SEARCH OR NOT =========
        const needSearch = await shouldSearchQuery(lastMsg, env.SEARCH_API_KEY);

        if (needSearch) {
            const results = await webSearch(lastMsg);

            if (results && results.length > 0) {
                toolUsed = "Web Search";

                const scraped = await Promise.all(
                    results.slice(0, 2).map(async (r) => {
                        const content = await scrapePage(r.link);
                        return {
                            title: r.title,
                            link: r.link,
                            summary: r.snippet,
                            content: content || null
                        };
                    })
                );

                injected += `[WEB SEARCH RESULTS]\n${JSON.stringify(scraped, null, 2)}\n\n`;
            } else {
                toolUsed = "Web Search (No Results)";
            }
        }

        // ========= BUILD FINAL PROMPT =========
        const finalMessages = [...messages];

        if (injected) {
            finalMessages.push({
                role: "system",
                content: `
You MUST use the following live web results to answer.
If the info is missing, SAY YOU DON'T KNOW.
Always answer in Vietnamese.

${injected}
                `
            });
        }

        // ========= CALL OPENROUTER =========
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.key}`,
                "HTTP-Referer": "https://oceep.pages.dev/",
                "X-Title": "Oceep"
            },
            body: JSON.stringify({
                model: config.model,
                messages: finalMessages,
                max_tokens: 2500,
                temperature: 0.5
            })
        });

        const data = await res.json();

        return new Response(JSON.stringify({
            content: data.choices?.[0]?.message?.content || "",
            toolUsed
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
