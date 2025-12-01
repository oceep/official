// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC TOOL HỖ TRỢ (THỜI TIẾT, MAP,...)
// ==========================================

// Lấy giờ VN
function getCurrentTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return now.toLocaleString('vi-VN', options);
}

// Lấy bản đồ (Nominatim)
async function getPlaceInfo(query) {
    try {
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&accept-language=vi`;
        const res = await fetch(searchUrl, { headers: { 'User-Agent': 'OceepChatbot/1.0' } });
        const data = await res.json();
        if (!data || data.length === 0) return null;
        const place = data[0];
        // Tạo link Google Map
        const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.display_name)}`;
        return `Địa điểm: ${place.display_name}\nLink bản đồ: ${googleMapsLink}`;
    } catch (e) { return null; }
}

// Lấy thời tiết (Open-Meteo) - QUAN TRỌNG
async function getWeather(locationQuery) {
    try {
        // 1. Tìm tọa độ
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=vi&format=json`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) return null;

        const { latitude, longitude, name, country } = geoData.results[0];

        // 2. Lấy thời tiết
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        
        const current = weatherData.current;
        // Mã thời tiết (WMO Code)
        const codes = { 0: "Trời quang đãng ☀️", 1: "Nhiều mây 🌤️", 2: "Mây rải rác ☁️", 3: "U ám ☁️", 45: "Sương mù 🌫️", 51: "Mưa phùn 🌧️", 61: "Mưa nhỏ 🌧️", 63: "Mưa vừa 🌧️", 80: "Mưa rào ⛈️", 95: "Dông bão ⛈️" };
        const condition = codes[current.weather_code] || "Không xác định";

        return `Dữ liệu thời tiết mới nhất tại ${name}, ${country}:
- Tình trạng: ${condition}
- Nhiệt độ: ${current.temperature_2m}°C (Cảm giác như ${current.apparent_temperature}°C)
- Độ ẩm: ${current.relative_humidity_2m}%
- Gió: ${current.wind_speed_10m} km/h`;
    } catch (e) { return null; }
}

async function getCryptoPrice(coinName) {
    try {
        const mapping = { 'bitcoin': 'bitcoin', 'btc': 'bitcoin', 'eth': 'ethereum', 'sol': 'solana', 'doge': 'dogecoin', 'bnb': 'binancecoin' };
        let coinId = mapping[coinName.toLowerCase()] || coinName.toLowerCase();
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,vnd`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data[coinId]) return null;
        return `Giá ${coinId.toUpperCase()}: $${data[coinId].usd} USD - ${data[coinId].vnd.toLocaleString()} VND`;
    } catch (e) { return null; }
}

// ==========================================
// 2. LOGIC XỬ LÝ (HANDLER)
// ==========================================

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages, max_tokens, temperature } = await request.json();

        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return new Response(JSON.stringify({ error: `Chưa cấu hình API Key cho model '${modelName}'` }), { status: 400, headers: corsHeaders });
        }

        // --- PHÂN TÍCH VÀ INJECT DỮ LIỆU ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let systemInjection = "";

        // 1. Check Thời tiết (Tự động mặc định Hà Nội nếu không nói rõ)
        if (lastMsg.includes('thời tiết') || lastMsg.includes('weather') || lastMsg.includes('nhiệt độ') || lastMsg.includes('mưa không')) {
            let location = "Hanoi"; // Mặc định là Hà Nội
            
            // Logic tìm tên địa điểm đơn giản
            const keywords = ['tại', 'ở', 'in', 'khu vực', 'tp', 'thành phố'];
            for (const kw of keywords) {
                if (lastMsg.includes(kw)) {
                    // Lấy phần sau từ khóa (ví dụ: "ở Đà Nẵng" -> "Đà Nẵng")
                    const parts = lastMsg.split(kw);
                    if (parts.length > 1) {
                        let potentialLoc = parts[1].trim().replace(/[?!.]/g, '');
                        if (potentialLoc.length > 1) location = potentialLoc;
                    }
                }
            }
            
            const weatherInfo = await getWeather(location);
            if (weatherInfo) {
                systemInjection += `\n[THÔNG TIN THỜI TIẾT THỰC TẾ]:\n${weatherInfo}\n`;
            }
        }

        // 2. Check Bản đồ
        if (lastMsg.includes('bản đồ') || lastMsg.includes('chỉ đường') || lastMsg.includes('ở đâu') || lastMsg.includes('đường đến')) {
            let query = lastMsg;
            const keywords = ['đến', 'tại', 'ở', 'to', 'of', 'location'];
            for (const kw of keywords) {
                if (lastMsg.includes(kw)) {
                    const parts = lastMsg.split(kw);
                    if (parts.length > 1) query = parts[1].trim().replace(/[?!.]/g, '');
                }
            }
            if (query.length > 2) {
                const placeInfo = await getPlaceInfo(query);
                if (placeInfo) systemInjection += `\n[THÔNG TIN VỊ TRÍ]:\n${placeInfo}\n`;
            }
        }

        // 3. Check Ngày giờ
        if (lastMsg.includes('giờ') || lastMsg.includes('ngày') || lastMsg.includes('hôm nay')) {
            systemInjection += `\n[THỜI GIAN HIỆN TẠI]: ${getCurrentTime()}\n`;
        }

        // 4. Check Coin
        if (lastMsg.includes('giá') && (lastMsg.includes('btc') || lastMsg.includes('eth') || lastMsg.includes('sol'))) {
            let coin = 'bitcoin';
            if (lastMsg.includes('eth')) coin = 'ethereum';
            if (lastMsg.includes('sol')) coin = 'solana';
            const priceInfo = await getCryptoPrice(coin);
            if (priceInfo) systemInjection += `\n[GIÁ CRYPTO]: ${priceInfo}\n`;
        }

        // --- CỰC KỲ QUAN TRỌNG: CHÈN VÀO ĐẦU TIN NHẮN ---
        // Thay vì chèn cuối, ta chèn vào ĐẦU (Prepend) để AI chú ý nhất
        let finalMessages = [...messages];
        
        if (systemInjection) {
            const contextInstruction = `
=== DỮ LIỆU HỆ THỐNG CUNG CẤP (REAL-TIME) ===
${systemInjection}
=============================================
YÊU CẦU: Hãy sử dụng dữ liệu trên để trả lời câu hỏi của người dùng một cách tự nhiên.
Nếu là thời tiết, hãy báo nhiệt độ và tình trạng.
---------------------------------------------
CÂU HỎI CỦA NGƯỜI DÙNG:
`;
            // Sửa nội dung tin nhắn cuối cùng của User
            finalMessages[finalMessages.length - 1].content = contextInstruction + lastMsgObj.content;
        }

        // --- GỌI OPENROUTER ---
        const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
                max_tokens: max_tokens || 3000,
                temperature: 0.7
            }),
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return new Response(JSON.stringify({ error: 'OpenRouter Error', details: errText }), { status: apiResponse.status, headers: corsHeaders });
        }

        const data = await apiResponse.json();
        return new Response(JSON.stringify({ content: data.choices?.[0]?.message?.content || "" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Server Error', details: error.message }), { status: 500, headers: corsHeaders });
    }
}
