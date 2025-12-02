// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC HÀM GỌI API & SEARCH (TOOLS)
// ==========================================

// --- Tool 1: Thời gian (Native) ---
function getCurrentTime() {
    const now = new Date();
    const date = now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    return `${date} | ${time}`;
}

// --- Tool 2: Thời tiết (Open-Meteo) ---
async function getWeather(query) {
    try {
        let loc = query.replace(/(thời tiết|nhiệt độ|dự báo|tại|ở|hôm nay|thế nào|\?|thoi tiet|nhiet do|du bao|tai|o|hom nay|the nao)/gi, '').trim();
        if (loc.length < 2) loc = "Hanoi";

        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1&accept-language=vi`;
        const coordsRes = await fetch(searchUrl, { headers: { 'User-Agent': 'OceepAI/1.0' } });
        const coordsData = await coordsRes.json();
        
        if (!coordsData || coordsData.length === 0) return null;
        const { lat, lon, display_name } = coordsData[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(weatherUrl);
        const data = await res.json();
        
        if (!data || !data.current) return null;
        const cur = data.current;
        const wmo = { 0:"Nắng đẹp ☀️", 1:"Nhiều mây 🌤", 2:"Có mây ☁️", 3:"Âm u ☁️", 45:"Sương mù 🌫", 51:"Mưa nhỏ 🌧", 61:"Mưa 🌧", 63:"Mưa vừa 🌧", 80:"Mưa rào ⛈", 95:"Bão ⛈" };
        const status = wmo[cur.weather_code] || "Có mây";

        return `[REAL-TIME WEATHER DATA]
- Location: ${display_name}
- Status: ${status}
- Temp: ${cur.temperature_2m}°C (Feels like: ${cur.apparent_temperature}°C)
- Humidity: ${cur.relative_humidity_2m}%
- Wind: ${cur.wind_speed_10m} km/h`;
    } catch (e) { return null; }
}

// --- Tool 3: Google Search (via SerpApi) ---
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
        url.searchParams.append('num', '6'); 

        const res = await fetch(url.toString());
        if (!res.ok) return null;

        const data = await res.json();
        
        let resultText = `[GOOGLE SEARCH RESULTS]\nQuery: "${query}"\n`;

        if (data.ads && data.ads.length > 0) {
            resultText += `\n[ADS/SPONSORED] (Check for deals/prices):\n`;
            data.ads.forEach((ad, index) => {
                if (index < 3) {
                    resultText += `* [Ad] ${ad.title}: ${ad.description || ''}\n`;
                    if (ad.price) resultText += `   - Giá quảng cáo: ${ad.price}\n`;
                }
            });
            resultText += `\n----------------\n`;
        }

        if (data.local_results && data.local_results.places && data.local_results.places.length > 0) {
            resultText += `\n[LOCAL PLACES FOUND] (Possible matches):\n`;
            data.local_results.places.forEach((place, index) => {
                resultText += `${index + 1}. ${place.title}\n`;
                if (place.address) resultText += `   - ĐC: ${place.address}\n`;
                if (place.rating) resultText += `   - Đánh giá: ${place.rating}⭐ (${place.reviews} reviews)\n`;
                if (place.price) resultText += `   - Giá: ${place.price}\n`;
            });
            resultText += `\n----------------\n`;
        }

        if (data.knowledge_graph) {
            resultText += `> Info: ${data.knowledge_graph.title} - ${data.knowledge_graph.description || ''}\n`;
            if (data.knowledge_graph.detail) resultText += `> Details: ${data.knowledge_graph.detail}\n`;
        }

        if (data.organic_results && data.organic_results.length > 0) {
            data.organic_results.forEach((item, index) => {
                if (item.snippet) {
                    resultText += `- [${item.title}]: ${item.snippet}\n`;
                    if (item.sitelinks) {
                        if (item.sitelinks.inline) {
                            const links = item.sitelinks.inline.map(l => l.title).join(', ');
                            resultText += `  > Quick Links: ${links}\n`;
                        }
                        if (item.sitelinks.expanded) {
                            item.sitelinks.expanded.forEach(link => {
                                resultText += `  > ${link.title}: ${link.snippet || ''}\n`;
                            });
                        }
                    }
                }
            });
        }

        return resultText;

    } catch (e) {
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

        // Config Key - ĐÃ CẬP NHẬT MINI MODEL
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'arcee-ai/trinity-mini:free' }, // <-- UPDATED
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        const mustSearchKeywords = [
            'quán', 'nhà hàng', 'ở đâu', 'địa chỉ', 'gần đây', 'đường nào', 'bản đồ', 'map',
            'quan', 'nha hang', 'o dau', 'dia chi', 'gan day', 'duong nao', 'ban do',
            'hôm nay', 'ngày mai', 'bây giờ', 'hiện tại', 'thời tiết', 'nhiệt độ', 'mưa', 'nắng',
            'hom nay', 'ngay mai', 'bay gio', 'hien tai', 'thoi tiet', 'nhiet do', 'mua', 'nang',
            'tin tức', 'sự kiện', 'mới nhất', 'vừa xảy ra', 'biến động', 'scandal', 'drama',
            'tin tuc', 'su kien', 'moi nhat', 'vua xay ra', 'bien dong',
            'giá', 'bao nhiêu', 'chi phí', 'tỷ giá', 'vàng', 'coin', 'crypto', 'chứng khoán', 'cổ phiếu', 'mua', 'bán', 'vé',
            'gia', 'bao nhieu', 'chi phi', 'ty gia', 'vang', 'chung khoan', 'co phieu', 've',
            'lịch', 'kết quả', 'giờ mở cửa', 'kẹt xe', 'tắc đường', 'giao thông', 'là ai', 'là gì', 'tiểu sử', 'review',
            'lich', 'ket qua', 'gio mo cua', 'ket xe', 'tac duong', 'giao thong', 'la ai', 'la gi', 'tieu su'
        ];

        const skipSearchKeywords = /(viết code|sửa lỗi|lập trình|giải toán|phương trình|đạo hàm|tích phân|văn học|bài văn|thuyết minh|định nghĩa|khái niệm|lý thuyết|công thức|javascript|python|css|html|dịch sang|translate|viet code|sua loi|lap trinh|giai toan|phuong trinh|dao ham|tich phan|van hoc|bai van|thuyet minh|dinh nghia|khai niem|ly thuyet|cong thuc|dich sang)/;
        
        const hasRealtimeKeyword = /(giá|mới nhất|hôm nay|bây giờ|hiện tại|gia|moi nhat|hom nay|bay gio|hien tai)/.test(lastMsg);
        const shouldSkipSearch = skipSearchKeywords.test(lastMsg) && !hasRealtimeKeyword;

        if (!shouldSkipSearch) {
            const isMustSearch = mustSearchKeywords.some(kw => lastMsg.includes(kw));

            if (isMustSearch || lastMsg.length > 20) {
                if (lastMsg.match(/(giờ|ngày|hôm nay|thứ mấy|bây giờ|gio|ngay|hom nay|thu may|bay gio)/)) {
                    injectionData += `SYSTEM TIME: ${getCurrentTime()}\n\n`;
                    toolUsed = "Time";
                }

                if (lastMsg.match(/(thời tiết|nhiệt độ|mưa|nắng|thoi tiet|nhiet do|mua|nang)/)) {
                    const weatherData = await getWeather(lastMsg);
                    if (weatherData) injectionData += weatherData + "\n\n";
                }

                const serpKey = env.SERPAPI_KEY; 
                if (serpKey) {
                    const searchData = await searchGoogle(lastMsg, serpKey);
                    if (searchData) {
                        injectionData += searchData + "\n\n";
                        toolUsed = "Google Search";
                    }
                } else {
                    injectionData += "[SYSTEM NOTE: Search capability unavailable (Missing API Key)]\n";
                }
            }
        }

        let finalMessages = [...messages];

        if (injectionData) {
            const systemPrompt = `
You are Oceep, an AI assistant. You have just performed a REAL-TIME Google Search for this query.
Below is the search result data:

=== START OF SEARCH DATA ===
${injectionData}
=== END OF SEARCH DATA ===

INSTRUCTIONS:
1.  **Context:** The user likely misspelled names or asked colloquially. Use the "LOCAL PLACES FOUND" section to identify the correct place/entity.
2.  **Clarify:** If multiple similar places exist (e.g., "Thủy Tạ Cafe" vs "Thủy Tạ Restaurant"), mention them and ask which one they meant, but assume the most popular one first if providing info.
3.  **Accuracy:** Quote prices, addresses, and hours EXACTLY from the data.
4.  **No Refusal:** Do NOT say "I cannot browse the web". You HAVE the data above.
5.  **Language:** Answer in Vietnamese.
`;
            finalMessages.push({ role: "system", content: systemPrompt });
        } else if (shouldSkipSearch) {
            finalMessages.push({ role: "system", content: "Task requires internal knowledge (Code/Math/Creative). Do NOT hallucinate real-time facts." });
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
        return new Response(JSON.stringify({ 
            content: data.choices?.[0]?.message?.content || "",
            toolUsed: toolUsed 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: `System Error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
