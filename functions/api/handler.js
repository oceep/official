// functions/api/handler.js

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Title"
};

// -----------------------------------------------------------
// 1. SUPER FAST SEARCH (BRAVE)
// -----------------------------------------------------------
async function webSearch(query) {
    try {
        const url = `https://search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data.web?.results || null;
    } catch {
        return null;
    }
}

// -----------------------------------------------------------
// 2. SHOULD SEARCH?
// -----------------------------------------------------------
async function shouldSearchQuery(query, key) {
    if (!key) return true;
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
                model: "arcee-ai/trinity-mini:free",
                messages: [
                    { role: "system", content: "Return true if real-time info is required. Else return false. Only true/false." },
                    { role: "user", content: query }
                ],
                max_tokens: 5,
                temperature: 0
            })
        });

        const data = await res.json();
        return (data.choices?.[0]?.message?.content || "").toLowerCase().includes("true");
    } catch {
        return true;
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

// -----------------------------------------------------------
// 3. MAIN HANDLER — FAST + STABLE
// -----------------------------------------------------------
export async function onRequestPost(ctx) {
    const { request, env } = ctx;

    try {
        const { modelName, messages } = await request.json();

        const apiConfig = {
            Mini:  { key: env.MINI_API_KEY,  model: "kwaipilot/kat-coder-pro:free" },
            Smart: { key: env.SMART_API_KEY, model: "amazon/nova-2-lite-v1:free" },
            Nerd:  { key: env.NERD_API_KEY,  model: "x-ai/grok-4.1-fast:free" }
        };

        const config = apiConfig[modelName];
        if (!config) {
            return new Response(JSON.stringify({ error: "invalid modelName" }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const lastMsg = messages[messages.length - 1].content;

        let injected = "";
        let toolUsed = "Internal Knowledge";

        // Decide search
        if (await shouldSearchQuery(lastMsg, env.SEARCH_API_KEY)) {
            const results = await webSearch(lastMsg);

            if (results) {
                toolUsed = "Brave Web Search";

                injected = `[WEB SEARCH RESULTS]\n${JSON.stringify(results, null, 2)}\n\n`;
            } else {
                toolUsed = "Search Failed";
            }
        }

        const finalMessages = [...messages];
        if (injected) {
            finalMessages.push({
                role: "system",
                content: `
Bạn **phải sử dụng dữ liệu tìm kiếm trực tiếp dưới đây bằng tiếng Việt**.
Nếu dữ liệu thiếu → phải nói "không có thông tin".

${injected}
                `
            });
        }

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
                max_tokens: 2000,
                temperature: 0.5
            })
        });

        const data = await res.json();

        return new Response(JSON.stringify({
            content: data.choices?.[0]?.message?.content || "",
            toolUsed
        }), { headers: corsHeaders });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
