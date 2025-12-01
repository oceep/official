// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC HÀM GỌI API BÊN NGOÀI (TOOLS)
// ==========================================

// Tool: Lấy ngày giờ hiện tại
function getCurrentTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `Thời gian hiện tại ở Việt Nam: ${now.toLocaleString('vi-VN', options)}`;
}

// Tool: Lấy thông tin địa điểm & Tạo link Google Map (Dùng OpenStreetMap - Miễn phí)
async function getPlaceInfo(query) {
    try {
        // Gọi API tìm kiếm của OpenStreetMap
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&accept-language=vi`;
        
        // Nominatim yêu cầu phải có User-Agent
        const res = await fetch(searchUrl, {
            headers: { 'User-Agent': 'OceepChatbot/1.0' }
        });
        const data = await res.json();

        if (!data || data.length === 0) return null;

        const place = data[0];
        const address = place.display_name;
        const lat = place.lat;
        const lon = place.lon;
        
        // Tạo link Google Maps trực tiếp đến tọa độ đó
        const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

        return `Thông tin địa điểm '${query}':
- Tên đầy đủ: ${address}
- Loại địa điểm: ${place.type}
- Tọa độ: ${lat}, ${lon}
- Link bản đồ: ${googleMapsLink}
(Hãy cung cấp link bản đồ trên cho người dùng click vào)`;
    } catch (e) {
        console.error("Lỗi tìm địa điểm:", e);
        return null;
    }
}

// Tool: Lấy thời tiết (Open-Meteo)
async function getWeather(locationQuery) {
    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=vi&format=json`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) return null;

        const { latitude, longitude, name, country } = geoData.results[0];
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        
        const current = weatherData.current;
        return `Thời tiết tại ${name}, ${country}: Nhiệt độ ${current.temperature_2m}°C, Gió ${current.wind_speed_10m} km/h, Tình trạng: ${getWeatherDescription(current.weather_code)}`;
    } catch (e) { return null; }
}

function getWeatherDescription(code) {
    const codes = { 0: "Trời quang", 1: "Nhiều mây", 2: "Mây rải rác", 3: "U ám", 45: "Sương mù", 61: "Mưa nhỏ", 63: "Mưa vừa", 95: "Dông bão" };
    return codes[code] || "Không xác định";
}

// Tool: Lấy giá Crypto (CoinGecko)
async function getCryptoPrice(coinName) {
    try {
        const mapping = { 'bitcoin': 'bitcoin', 'btc': 'bitcoin', 'eth': 'ethereum', 'sol': 'solana', 'doge': 'dogecoin', 'bnb': 'binancecoin' };
        let coinId = mapping[coinName.toLowerCase()] || coinName.toLowerCase();
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,vnd`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data[coinId]) return null;
        return `Giá ${coinId.toUpperCase()}: $${data[coinId].usd} (USD) - ${data[coinId].vnd.toLocaleString()} đ (VND)`;
    } catch (e) { return null; }
}

// ==========================================
// 2. XỬ LÝ REQUEST CHÍNH
// ==========================================

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages, max_tokens, temperature } = await request.json();

        // CẤU HÌNH API KEY (Lấy từ Cloudflare Environment Variables)
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return new Response(JSON.stringify({ error: `Chưa cấu hình API Key cho model '${modelName}'` }), { status: 400, headers: corsHeaders });
        }

        // --- PHÂN TÍCH Ý ĐỊNH & GỌI TOOL ---
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        let systemInjection = "";

        // 1. Kiểm tra Bản đồ / Đường đi (NEW)
        // Các từ khóa: đường đến, ở đâu, bản đồ, map, location, direction, where is
        if (lastMsg.includes('đường đến') || lastMsg.includes('đường đi') || lastMsg.includes('ở đâu') || lastMsg.includes('vị trí') || lastMsg.includes('bản đồ') || lastMsg.includes('map') || lastMsg.includes('location')) {
            // Logic tách tên địa điểm
