// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. TOOL: QWANT LITE SEARCH (HTML Lite)
// ==========================================
async function searchQwantLite(query) {
    try {
        const url = `https://lite.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
        const res = await fetch(url, {
            headers: {
                // Fake User-Agent giống thật để không bị Qwant chặn
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();

        // Regex bắt link
        const linkPattern = /<a class="result__url" href="(http[^"]+)"/g;
        let match;
        const results = [];
        let count = 0;

        while ((match = linkPattern.exec(html)) !== null && count < 3) { 
            const link = match[1];
            // Lọc bỏ quảng cáo và link rác của Qwant
            if (!link.includes('qwant.com') && !link.includes('ad.') && !link.includes('javascript:')) {
                results.push(link);
                count++;
            }
        }
        return results.length > 0 ? results : null;
    } catch (e) {
        return null;
    }
}

// ==========================================
// 2. TOOL: SCRAPE NINJA (Bypass Cloudflare)
// ==========================================
async function scrapeWithNinja(urls, rapidApiKey) {
    if (!rapidApiKey || urls.length === 0) return "";
    
    // Chỉ lấy tối đa 2 URL để đảm bảo tốc độ
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
            // Cắt gọn còn 1500 ký tự mỗi trang để AI không bị quá tải
            content = content.replace(/\s+/g, ' ').trim().slice(0, 1500);
            
            if (content.length < 50) return null; // Nội dung quá ngắn thì bỏ qua

            return `SOURCE: ${url}\nCONTENT: ${content}\n`;
        } catch (e) {
            return null;
        }
    });

    const contents = await Promise.all(promises);
    return contents.filter(c => c !== null).join("\n---\n");
}

// ==========================================
// 3. MAIN HANDLER
// ==========================================
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages } = await request.json();

        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'kwaipilot/kat-coder-pro:free' }, 
            'Smart': { key: env.SMART_API_KEY, model: 'amazon/nova-2-lite-v1:free' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        // --- CẤU HÌNH LOGIC TÌM KIẾM MỚI (AGGRESSIVE) ---

        // 1. Chỉ định nghĩa những gì TUYỆT ĐỐI KHÔNG SEARCH
        const skipSearchKeywords = /(giải toán|viết code|lập trình|javascript|css|html|fix bug|lỗi|logic|ngữ pháp|dịch sang|translate|viết văn|viết mail|văn mẫu|công thức|tính toán|giai toan|lap trinh|ngu phap|viet van|van mau|dinh nghia|cong thuc|tinh toan)/;
        const shouldSkipSearch = skipSearchKeywords.test(lastMsg);

        // 2. Điều kiện tìm kiếm:
        // - Không nằm trong danh sách cấm (skipSearchKeywords)
        // - VÀ câu hỏi có độ dài > 3 ký tự (tránh search mấy câu như "hi", "ok")
        // -> BỎ HẲN DANH SÁCH "MUST SEARCH", CỨ KHÔNG CẤM LÀ SEARCH HẾT!
        if (!shouldSkipSearch && lastMsg.length > 3) {
            
            // [STEP 1] Qwant Lite Search
            const urls = await searchQwantLite(lastMsg);

            if (urls && urls.length > 0) {
                // [STEP 2] ScrapeNinja Render
                const scrapedContent = await scrapeWithNinja(urls, env.RAPIDAPI_KEY);
                
                if (scrapedContent) {
                    injectionData += `[REAL-TIME SEARCH RESULTS]\n${scrapedContent}\n\n`;
                    toolUsed = "Web Search (Active)";
                } else {
                    // Có URL nhưng không cào được nội dung
                    toolUsed = "Search Attempted (Source Protected)"; 
                }
            } else {
                // Không tìm thấy URL nào từ Qwant
                toolUsed = "Search Attempted (No URL)";
            }
        }

        let finalMessages = [...messages];
        if (injectionData) {
            // Ép buộc AI sử dụng dữ liệu tìm được bằng Prompt mạnh hơn
            finalMessages.push({ 
                role: "system", 
                content: `
IMPORTANT INSTRUCTION:
You are Oceep. You MUST prioritize the following REAL-TIME SEARCH RESULTS over your internal training data.
If the search results contain the answer, use them. 
Cite the SOURCE url when possible.

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
