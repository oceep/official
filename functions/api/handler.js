// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC HÀM GỌI API & SEARCH (TOOLS)
// ==========================================

// --- Tool 1: Thời gian ---
function getCurrentTime() {
    const now = new Date();
    const date = now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    return `${date} | ${time}`;
}

// --- Tool 2: Địa điểm (OpenStreetMap) ---
async function getCoordinates(query) {
    try {
        const q = (query.includes('Vietnam') || query.length < 10) ? `${query} Vietnam` : query;
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=vi`;
        
        const res = await fetch(searchUrl, { 
            headers: { 'User-Agent': 'OceepAI/1.0' } 
        });
        const data = await res.json();
        
        if (!data || data.length === 0) return null;
        return { lat: data[0].lat, lon: data[0].lon, name: data[0].display_name };
    } catch (e) { return null; }
}

// --- Tool 3: Thời tiết (Open-Meteo) ---
async function getWeather(query) {
    try {
        let loc = query.replace(/(thời tiết|nhiệt độ|dự báo|tại|ở|hôm nay|thế nào|\?)/gi, '').trim();
        if (loc.length < 2) loc = "Hanoi";
        
        let coords = await getCoordinates(loc);
        if (!coords) coords = await getCoordinates("Hanoi");
        if (!coords) return null;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        if (!data || !data.current) return null;

        const cur = data.current;
        const wmo = { 
            0:"Nắng đẹp ☀️", 1:"Nhiều mây 🌤", 2:"Có mây ☁️", 3:"Âm u ☁️", 
            45:"Sương mù 🌫", 51:"Mưa nhỏ 🌧", 61:"Mưa 🌧", 63:"Mưa vừa 🌧", 
            80:"Mưa rào ⛈", 95:"Bão ⛈" 
        };
        const status = wmo[cur.weather_code] || "Có mây";

        return `[REAL-TIME WEATHER DATA]
- Location: ${coords.name}
- Time: ${cur.time}
- Status: ${status}
- Temp: ${cur.temperature_2m}°C (Feels like: ${cur.apparent_temperature}°C)
- Humidity: ${cur.relative_humidity_2m}%
- Wind: ${cur.wind_speed_10m} km/h`;
    } catch (e) { return null; }
}

// --- Tool 4: Google Search (via SerpApi) ---
// Yêu cầu: Cần thêm biến môi trường SERPAPI_KEY trong Cloudflare Dashboard
async function searchGoogle(query, apiKey) {
    if (!apiKey) return null;
    
    try {
        const url = new URL('https://serpapi.com/search');
        url.searchParams.append('engine', 'google');
        url.searchParams.append('q', query);
        url.searchParams.append('api_key', apiKey);
        url.searchParams.append('google_domain', 'google.com.vn');
        url.searchParams.append('gl', 'vn'); // Quốc gia: Việt Nam
        url.searchParams.append('hl', 'vi'); // Ngôn ngữ: Tiếng Việt
        url.searchParams.append('num', '5'); // Lấy top 5 kết quả

        const res = await fetch(url.toString());
        if (!res.ok) return null;

        const data = await res.json();
        
        let resultText = `[GOOGLE SEARCH RESULTS]\nQuery: "${query}"\n`;

        // 1. Lấy thông tin Knowledge Graph (nếu có - vd: thông tin nhân vật, công ty)
        if (data.knowledge_graph) {
            resultText += `> Info: ${data.knowledge_graph.title} - ${data.knowledge_graph.description || ''}\n`;
        }

        // 2. Lấy thông tin Organic Results (kết quả tìm kiếm thường)
        if (data.organic_results && data.organic_results.length > 0) {
            data.organic_results.forEach((item, index) => {
                if (item.snippet) {
                    resultText += `${index + 1}. ${item.title}\n   ${item.snippet}\n   Source: ${item.source || 'Web'}\n`;
                }
            });
        }
        
        // 3. Lấy thông tin Top Stories (nếu là tin tức)
        if (data.top_stories && data.top_stories.length > 0) {
             resultText += `\n[TOP NEWS]\n`;
             data.top_stories.slice(0, 3).forEach(story => {
                 resultText += `- ${story.title} (${story.date || 'Mới nhất'})\n`;
             });
        }

        return resultText;

    } catch (e) {
        console.error("SerpApi Error:", e);
        return null;
    }
}

// ==========================================
// 2. XỬ LÝ REQUEST
// ==========================================

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages } = await request.json();

        // Config Key
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        // --- PHÂN TÍCH Ý ĐỊNH & THU THẬP DỮ LIỆU ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        // =========================================================
        // LOGIC PHÂN LOẠI: NÊN SEARCH HAY KHÔNG?
        // =========================================================

        // 🟥 DANH SÁCH ĐỎ (KHÔNG SEARCH) - Ưu tiên kiểm tra trước để chặn search thừa
        // Nếu dính các từ khóa này => Bỏ qua logic search bên dưới
        const skipSearchKeywords = /(viết code|sửa lỗi|lập trình|giải toán|phương trình|đạo hàm|tích phân|văn học|bài văn|thuyết minh|định nghĩa|khái niệm|lý thuyết|công thức|javascript|python|css|html|dịch sang|translate)/;
        
        // Chỉ bỏ qua search nếu KHÔNG có từ khóa thời gian thực đi kèm (ví dụ: "giá bitcoin code python" -> vẫn cần search giá)
        const hasRealtimeKeyword = /(giá|mới nhất|hôm nay|bây giờ|hiện tại)/.test(lastMsg);
        const shouldSkipSearch = skipSearchKeywords.test(lastMsg) && !hasRealtimeKeyword;

        if (!shouldSkipSearch) {
            
            // 🟩 DANH SÁCH XANH (CHẮC CHẮN SEARCH)
            const mustSearchKeywords = [
                // Địa điểm / Hàng quán
                'quán', 'nhà hàng', 'ở đâu', 'địa chỉ', 'gần đây', 'đường nào', 'bản đồ',
                // Thời gian / Thời tiết
                'hôm nay', 'ngày mai', 'bây giờ', 'hiện tại', 'thời tiết', 'nhiệt độ', 'mưa không',
                // Tin tức / Sự kiện
                'tin tức', 'sự kiện', 'mới nhất', 'vừa xảy ra', 'biến động', 'scandal',
                // Giá cả / Tài chính
                'giá', 'bao nhiêu tiền', 'chi phí', 'tỷ giá', 'giá vàng', 'coin', 'crypto', 'chứng khoán', 'cổ phiếu', 'mua', 'bán',
                // Thông tin sống
                'lịch thi đấu', 'kết quả', 'giờ mở cửa', 'kẹt xe', 'tắc đường', 'giao thông'
            ];
            
            const isMustSearch = mustSearchKeywords.some(kw => lastMsg.includes(kw));

            // 1. Xử lý Thời gian (Luôn cần nếu hỏi giờ)
            if (lastMsg.match(/(giờ|ngày|hôm nay|thứ mấy|bây giờ)/)) {
                injectionData += `SYSTEM TIME: ${getCurrentTime()}\n\n`;
                if (!toolUsed) toolUsed = "Time";
            }

            // 2. Xử lý Thời tiết
            if (lastMsg.match(/(thời tiết|nhiệt độ|mưa|nắng)/)) {
                const data = await getWeather(lastMsg);
                if (data) {
                    injectionData += data + "\n\n";
                    toolUsed = "Weather";
                }
            }

            // 3. Xử lý Google Search (SerpApi)
            if (isMustSearch) {
                // Sử dụng key SerpApi từ biến môi trường
                const serpKey = env.SERPAPI_KEY; 
                
                if (serpKey) {
                    const searchData = await searchGoogle(lastMsg, serpKey);
                    if (searchData) {
                        injectionData += searchData + "\n\n";
                        toolUsed = toolUsed || "Google Search";
                    }
                } else {
                    // Fallback nếu không có SerpApi Key: Báo lỗi nhẹ cho AI biết
                    injectionData += "[SYSTEM NOTE: Search tool unavailable due to missing API Key]\n";
                }
            }
        }

        // --- CẤU TRÚC LẠI SYSTEM PROMPT ---
        let finalMessages = [...messages];

        if (injectionData) {
            const systemPrompt = `
You are Oceep, an AI assistant with REAL-TIME access to Google Search.
Below is the raw data fetched just now for this specific user query:

=== START OF REAL-TIME DATA ===
${injectionData}
=== END OF REAL-TIME DATA ===

INSTRUCTIONS:
1.  **Analyze:** Use the data above (Google Search Results, Weather, Time) to answer.
2.  **No Hallucinations:** If the data contains prices, addresses, or news, quote them accurately.
3.  **Citation:** Mention sources naturally (e.g., "Theo kết quả tìm kiếm...", "Dữ liệu thời tiết cho thấy...").
4.  **Language:** Answer in Vietnamese.
5.  **Scope:** If the user asks about "Now", "Today", "Current Price", you MUST rely on the data provided above.
`;
            finalMessages.push({ role: "system", content: systemPrompt });
        } else {
            // Nếu KHÔNG có injectionData (tức là rơi vào Red List hoặc không tìm thấy gì)
            // Nhắc nhở AI dùng kiến thức nội tại
            if (shouldSkipSearch) {
                finalMessages.push({ role: "system", content: "User is asking a task that requires internal knowledge (Coding, Math, Writing). Do NOT fabricate real-time info. Focus on logic and creativity." });
            }
        }

        // --- GỌI LLM ---
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

        if (!res.ok) {
            const txt = await res.text();
            return new Response(JSON.stringify({ error: txt }), { status: res.status, headers: corsHeaders });
        }
        
        const data = await res.json();
        const aiContent = data.choices?.[0]?.message?.content || "";

        return new Response(JSON.stringify({ 
            content: aiContent,
            toolUsed: toolUsed 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: `System Error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
