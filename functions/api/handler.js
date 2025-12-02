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
        let loc = query.replace(/(thời tiết|nhiệt độ|dự báo|tại|ở|hôm nay|thế nào|\?|thoi tiet|nhiet do|du bao|tai|o|hom nay|the nao)/gi, '').trim();
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
async function searchGoogle(query, apiKey) {
    if (!apiKey) return null;
    
    try {
        const url = new URL('https://serpapi.com/search');
        url.searchParams.append('engine', 'google');
        url.searchParams.append('q', query);
        url.searchParams.append('api_key', apiKey);
        url.searchParams.append('google_domain', 'google.com.vn');
        url.searchParams.append('gl', 'vn'); 
        url.searchParams.append('hl', 'vi'); 
        url.searchParams.append('num', '5'); 

        const res = await fetch(url.toString());
        if (!res.ok) return null;

        const data = await res.json();
        
        let resultText = `[GOOGLE SEARCH RESULTS]\nQuery: "${query}"\n`;

        // 1. [QUAN TRỌNG] Lấy Local Map Pack (Các địa điểm trên bản đồ)
        // Đây là phần giúp AI nhận biết nhiều quán trùng tên
        if (data.local_results && data.local_results.places && data.local_results.places.length > 0) {
            resultText += `\n[LOCAL PLACES FOUND] (User might be looking for one of these):\n`;
            data.local_results.places.forEach((place, index) => {
                resultText += `${index + 1}. ${place.title}\n`;
                if (place.address) resultText += `   - Địa chỉ: ${place.address}\n`;
                if (place.rating) resultText += `   - Đánh giá: ${place.rating}⭐ (${place.reviews} reviews)\n`;
                if (place.price) resultText += `   - Mức giá: ${place.price}\n`;
                if (place.type) resultText += `   - Loại hình: ${place.type}\n`;
            });
            resultText += `\n----------------\n`;
        }

        // 2. Lấy Knowledge Graph (Thông tin chính xác nếu Google xác định rõ)
        if (data.knowledge_graph) {
            resultText += `> Verified Info: ${data.knowledge_graph.title} - ${data.knowledge_graph.description || ''}\n`;
        }

        // 3. Lấy Organic Results (Kết quả web)
        if (data.organic_results && data.organic_results.length > 0) {
            data.organic_results.forEach((item, index) => {
                if (item.snippet) {
                    resultText += `- Web Result: ${item.title}\n   Snippet: ${item.snippet}\n`;
                }
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

        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        // --- PHÂN TÍCH Ý ĐỊNH ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        // --- LOGIC PHÂN LOẠI SEARCH ---
        const skipSearchKeywords = /(viết code|sửa lỗi|lập trình|giải toán|phương trình|đạo hàm|tích phân|văn học|bài văn|thuyết minh|định nghĩa|khái niệm|lý thuyết|công thức|javascript|python|css|html|dịch sang|translate|viet code|sua loi|lap trinh|giai toan|phuong trinh|dao ham|tich phan|van hoc|bai van|thuyet minh|dinh nghia|khai niem|ly thuyet|cong thuc|dich sang)/;
        
        const hasRealtimeKeyword = /(giá|mới nhất|hôm nay|bây giờ|hiện tại|gia|moi nhat|hom nay|bay gio|hien tai)/.test(lastMsg);
        const shouldSkipSearch = skipSearchKeywords.test(lastMsg) && !hasRealtimeKeyword;

        if (!shouldSkipSearch) {
            const mustSearchKeywords = [
                'quán', 'nhà hàng', 'ở đâu', 'địa chỉ', 'gần đây', 'đường nào', 'bản đồ',
                'quan', 'nha hang', 'o dau', 'dia chi', 'gan day', 'duong nao', 'ban do',
                'hôm nay', 'ngày mai', 'bây giờ', 'hiện tại', 'thời tiết', 'nhiệt độ', 'mưa không',
                'hom nay', 'ngay mai', 'bay gio', 'hien tai', 'thoi tiet', 'nhiet do', 'mua khong',
                'tin tức', 'sự kiện', 'mới nhất', 'vừa xảy ra', 'biến động', 'scandal',
                'tin tuc', 'su kien', 'moi nhat', 'vua xay ra', 'bien dong',
                'giá', 'bao nhiêu tiền', 'chi phí', 'tỷ giá', 'giá vàng', 'coin', 'crypto', 'chứng khoán', 'cổ phiếu', 'mua', 'bán',
                'gia', 'bao nhieu tien', 'chi phi', 'ty gia', 'gia vang', 'chung khoan', 'co phieu',
                'lịch thi đấu', 'kết quả', 'giờ mở cửa', 'kẹt xe', 'tắc đường', 'giao thông',
                'lich thi dau', 'ket qua', 'gio mo cua', 'ket xe', 'tac duong', 'giao thong'
            ];
            
            const isMustSearch = mustSearchKeywords.some(kw => lastMsg.includes(kw));

            if (lastMsg.match(/(giờ|ngày|hôm nay|thứ mấy|bây giờ|gio|ngay|hom nay|thu may|bay gio)/)) {
                injectionData += `SYSTEM TIME: ${getCurrentTime()}\n\n`;
                if (!toolUsed) toolUsed = "Time";
            }

            if (lastMsg.match(/(thời tiết|nhiệt độ|mưa|nắng|thoi tiet|nhiet do|mua|nang)/)) {
                const data = await getWeather(lastMsg);
                if (data) {
                    injectionData += data + "\n\n";
                    toolUsed = "Weather";
                }
            }

            if (isMustSearch) {
                const serpKey = env.SERPAPI_KEY; 
                if (serpKey) {
                    const searchData = await searchGoogle(lastMsg, serpKey);
                    if (searchData) {
                        injectionData += searchData + "\n\n";
                        toolUsed = toolUsed || "Google Search";
                    }
                } else {
                    injectionData += "[SYSTEM NOTE: Search tool unavailable]\n";
                }
            }
        }

        // --- CẤU TRÚC LẠI SYSTEM PROMPT (DẠY AI XỬ LÝ NHẦM LẪN) ---
        let finalMessages = [...messages];

        if (injectionData) {
            const systemPrompt = `
You are Oceep, an AI assistant with REAL-TIME access to Google Search.
Below is the raw data fetched just now for this specific user query:

=== START OF REAL-TIME DATA ===
${injectionData}
=== END OF REAL-TIME DATA ===

INSTRUCTIONS:
1.  **Analyze Local Places:** Check the section "[LOCAL PLACES FOUND]". If there are multiple places with similar names (e.g., "Thủy Tạ Restaurant" vs "Thủy Tạ Cafe"), DO NOT assume one. Instead, list them and ask the user to clarify (e.g., "Có vài địa điểm tên là..., bạn muốn hỏi về chỗ nào?").
2.  **Suggest Corrections:** If the user likely misspelled a name but the search results show a close match, suggest it politely (e.g., "Có thể bạn đang tìm... đúng không?").
3.  **Accuracy:** Use exact addresses and prices from the data.
4.  **Language:** Answer in Vietnamese.
`;
            finalMessages.push({ role: "system", content: systemPrompt });
        } else {
            if (shouldSkipSearch) {
                finalMessages.push({ role: "system", content: "User is asking a task that requires internal knowledge. Do NOT fabricate real-time info." });
            }
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
