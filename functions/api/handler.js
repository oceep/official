// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC HÀM CÔNG CỤ (TOOLS)
// ==========================================

// Tool: Lấy giờ VN
function getCurrentTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return now.toLocaleString('vi-VN', options);
}

// Tool: Tìm tọa độ từ tên địa điểm (Dùng Nominatim - Cực chuẩn cho VN)
async function getCoordinates(query) {
    try {
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=vi`;
        const res = await fetch(searchUrl, { headers: { 'User-Agent': 'OceepChatbot/1.0' } });
        const data = await res.json();
        if (!data || data.length === 0) return null;
        return {
            lat: data[0].lat,
            lon: data[0].lon,
            name: data[0].display_name
        };
    } catch (e) { return null; }
}

// Tool: Lấy bản đồ
async function getPlaceInfo(query) {
    const coords = await getCoordinates(query);
    if (!coords) return null;
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords.name)}`;
    return `Địa điểm: ${coords.name}\nLink bản đồ: ${googleMapsLink}`;
}

// Tool: Lấy thời tiết (Kết hợp Nominatim + Open-Meteo)
async function getWeather(locationQuery) {
    try {
        // B1: Tìm tọa độ bằng Nominatim (Khôn hơn Open-Meteo Geocoding)
        const coords = await getCoordinates(locationQuery);
        
        // Nếu không tìm thấy, thử fallback về Hà Nội nếu query rỗng, hoặc trả về null
        if (!coords) {
            // Nếu người dùng hỏi trống không "thời tiết thế nào", mặc định HN
            if (!locationQuery || locationQuery.length < 3) return await getWeather("Hà Nội"); 
            return null;
        }

        // B2: Gọi API Thời tiết bằng tọa độ vừa tìm được
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        
        const current = weatherData.current;
        const codes = { 0: "Trời quang đãng ☀️", 1: "Nhiều mây 🌤️", 2: "Mây rải rác ☁️", 3: "U ám ☁️", 45: "Sương mù 🌫️", 51: "Mưa phùn 🌧️", 61: "Mưa nhỏ 🌧️", 63: "Mưa vừa 🌧️", 80: "Mưa rào ⛈️", 95: "Dông bão ⛈️" };
        const condition = codes[current.weather_code] || "Không xác định";

        return `Dữ liệu thời tiết tại [${coords.name}]:
- Tình trạng: ${condition}
- Nhiệt độ: ${current.temperature_2m}°C (Cảm giác như ${current.apparent_temperature}°C)
- Độ ẩm: ${current.relative_humidity_2m}%
- Gió: ${current.wind_speed_10m} km/h`;
    } catch (e) { return null; }
}

// Tool: Crypto
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
// 2. XỬ LÝ REQUEST
// ==========================================

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages, max_tokens, temperature } = await request.json();

        // Config API Key
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: `Chưa cấu hình API Key` }), { status: 400, headers: corsHeaders });

        // --- PHÂN TÍCH Ý ĐỊNH ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let systemInjection = "";

        // 1. Xử lý Thời tiết (Cải tiến Logic tách từ khóa)
        if (lastMsg.includes('thời tiết') || lastMsg.includes('weather') || lastMsg.includes('nhiệt độ') || lastMsg.includes('mưa')) {
            // Loại bỏ các từ khóa nhiễu để lấy tên địa điểm sạch
            let location = lastMsg
                .replace('thời tiết', '')
                .replace('weather', '')
                .replace('nhiệt độ', '')
                .replace('dự báo', '')
                .replace('tại', '')
                .replace('ở', '')
                .replace('khu vực', '')
                .replace('in', '')
                .trim(); // Xóa khoảng trắng thừa

            // Xóa dấu câu
            location = location.replace(/[?!.,]/g, '');

            // Nếu sau khi xóa mà chuỗi rỗng (vd user chỉ chat "thời tiết"), gán mặc định HN
            if (location.length < 2) location = "Hà Nội";

            const weatherInfo = await getWeather(location);
            if (weatherInfo) systemInjection += `\n[THÔNG TIN THỜI TIẾT THỰC TẾ TỪ SERVER]:\n${weatherInfo}\n`;
        }

        // 2. Xử lý Bản đồ
        else if (lastMsg.includes('bản đồ') || lastMsg.includes('chỉ đường') || lastMsg.includes('ở đâu') || lastMsg.includes('đường đến')) {
            let query = lastMsg
                .replace('bản đồ', '')
                .replace('chỉ đường', '')
                .replace('ở đâu', '')
                .replace('đường đến', '')
                .replace('tại', '')
                .replace('ở', '')
                .trim().replace(/[?!.,]/g, '');
            
            if (query.length > 2) {
                const placeInfo = await getPlaceInfo(query);
                if (placeInfo) systemInjection += `\n[THÔNG TIN VỊ TRÍ]:\n${placeInfo}\n`;
            }
        }

        // 3. Thời gian
        else if (lastMsg.includes('giờ') || lastMsg.includes('ngày') || lastMsg.includes('hôm nay')) {
            systemInjection += `\n[THỜI GIAN HIỆN TẠI]: ${getCurrentTime()}\n`;
        }

        // 4. Coin
        else if (lastMsg.includes('giá') && (lastMsg.includes('btc') || lastMsg.includes('eth'))) {
            let coin = lastMsg.includes('eth') ? 'ethereum' : 'bitcoin';
            const priceInfo = await getCryptoPrice(coin);
            if (priceInfo) systemInjection += `\n[GIÁ CRYPTO]: ${priceInfo}\n`;
        }

        // --- INJECT DỮ LIỆU VÀO ĐẦU TIN NHẮN ---
        let finalMessages = [...messages];
        if (systemInjection) {
            // Ép AI phải đóng vai là người đã biết thông tin này
            const instruction = `HỆ THỐNG CUNG CẤP DỮ LIỆU THỰC TẾ SAU ĐÂY. BẠN PHẢI DÙNG NÓ ĐỂ TRẢ LỜI NGƯỜI DÙNG. TUYỆT ĐỐI KHÔNG NÓI LÀ KHÔNG BIẾT.\n${systemInjection}\n----------------\nCÂU HỎI CỦA USER: `;
            finalMessages[finalMessages.length - 1].content = instruction + lastMsgObj.content;
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
