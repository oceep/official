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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await res.text();

        // Regex bắt link từ kết quả Qwant Lite
        const linkPattern = /<a class="result__url" href="(http[^"]+)"/g;
        let match;
        const results = [];
        let count = 0;

        while ((match = linkPattern.exec(html)) !== null && count < 3) { // Lấy top 3
            const link = match[1];
            if (!link.includes('qwant.com') && !link.includes('ad.')) {
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
    
    // Giới hạn chạy tối đa 2 URL cùng lúc để tiết kiệm Credit ScrapeNinja
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
            // Cắt gọn nội dung để không bị quá token input của AI
            content = content.replace(/\s+/g, ' ').trim().slice(0, 2000);
            
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

        // Config API Keys
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

        // --- BỘ LỌC TỪ KHÓA MỚI (CẬP NHẬT) ---

        // 1. Từ khóa BỎ QUA (Các tác vụ nội bộ: code, viết văn, dịch thuật...)
        const skipSearchKeywords = /(giải toán|code|lập trình|javascript|css|html|fix bug|lỗi|logic|ngữ pháp|tiếng anh|dịch|translate|viết văn|viết mail|văn mẫu|kiến thức chung|định nghĩa|khái niệm|công thức|tính toán|giai toan|lap trinh|ngu phap|tieng anh|viet van|van mau|dinh nghia|khai niem|cong thuc|tinh toan)/;

        // 2. Từ khóa BẮT BUỘC SEARCH (Bao gồm có dấu & không dấu)
        // Nhóm: Địa điểm, Thời gian, Giá cả, Tin tức, Crypto, Profile, Hỏi đáp
        const mustSearchKeywords = new RegExp([
            // Địa điểm / Di chuyển
            'địa chỉ', 'quán', 'nhà hàng', 'khách sạn', 'ở đâu', 'đường nào', 'bản đồ', 'vị trí', 'bao xa',
            'dia chi', 'quan', 'nha hang', 'khach san', 'o dau', 'duong nao', 'ban do', 'vi tri', 'bao xa',
            
            // Thời tiết / Thời gian
            'thời tiết', 'nhiệt độ', 'dự báo', 'mưa', 'nắng', 'hôm nay', 'ngày mai', 'tuần này', 'bây giờ',
            'thoi tiet', 'nhiet do', 'du bao', 'mua', 'nang', 'hom nay', 'ngay mai', 'tuan nay', 'bay gio',
            
            // Tin tức / Sự kiện / Bóng đá
            'tin tức', 'sự kiện', 'bóng đá', 'thể thao', 'lịch thi đấu', 'kết quả', 'mới nhất', 'vừa xong', 'biến động', 'hot',
            'tin tuc', 'su kien', 'bong da', 'the thao', 'lich thi dau', 'ket qua', 'moi nhat', 'vua xong', 'bien dong',
            
            // Mua sắm / Giá cả / Review
            'giá', 'bao nhiêu', 'tiền', 'tỷ giá', 'vàng', 'chứng khoán', 'cổ phiếu', 'lãi suất', 'review', 'đánh giá', 'so sánh', 'top',
            'gia', 'bao nhieu', 'tien', 'ty gia', 'vang', 'chung khoan', 'co phieu', 'lai suat', 'danh gia', 'so sanh',
            
            // Profile / Thông tin / Là ai
            'là ai', 'là gì', 'tiểu sử', 'thông tin', 'profile', 'scandal', 'drama', 'nguồn gốc',
            'la ai', 'la gi', 'tieu su', 'thong tin', 'nguon goc',
            
            // Crypto / Tech
            'crypto', 'coin', 'token', 'btc', 'eth', 'sol', 'iphone', 'samsung', 'công nghệ', 'cong nghe',
            
            // Lệnh tìm kiếm trực tiếp
            'tìm kiếm', 'tra cứu', 'search', 'google', 'tim kiem', 'tra cuu'
        ].join('|'), 'i'); // 'i' flag để không phân biệt hoa thường

        const shouldSkipSearch = skipSearchKeywords.test(lastMsg);
        const isMustSearch = mustSearchKeywords.test(lastMsg);

        // Logic kích hoạt: 
        // 1. Không nằm trong danh sách cấm
        // 2. VÀ (Có từ khóa search HOẶC câu hỏi dài > 10 ký tự)
        if (!shouldSkipSearch && (isMustSearch || lastMsg.length > 10)) {
            
            // [STEP 1] Qwant Lite Search
            const urls = await searchQwantLite(lastMsg);

            if (urls && urls.length > 0) {
                // [STEP 2] ScrapeNinja Render
                const scrapedContent = await scrapeWithNinja(urls, env.RAPIDAPI_KEY);
                
                if (scrapedContent) {
                    injectionData += `[SEARCH CONTEXT FROM WEB]\n${scrapedContent}\n\n`;
                    toolUsed = "Web Search (Qwant+Ninja)";
                }
            }
        }

        let finalMessages = [...messages];
        if (injectionData) {
            finalMessages.push({ 
                role: "system", 
                content: `You are Oceep. Use the following REAL-TIME web content to answer:\n\n${injectionData}\n\nAnswer in Vietnamese.` 
            });
        }

        // Call LLM
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
