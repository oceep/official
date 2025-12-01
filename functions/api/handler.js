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
    // Chuyển sang giờ Việt Nam (UTC+7)
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `Thời gian hiện tại ở Việt Nam: ${now.toLocaleString('vi-VN', options)}`;
}

// Tool: Lấy thời tiết (Dùng Open-Meteo - Miễn phí 100%, không cần Key)
async function getWeather(locationQuery) {
    try {
        // B1: Geocoding - Tìm tọa độ từ tên thành phố
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=vi&format=json`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            return null; // Không tìm thấy địa điểm
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        // B2: Lấy thời tiết từ tọa độ
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        
        const current = weatherData.current;
        
        return `Dữ liệu thời tiết thực tế tại ${name}, ${country}:
- Nhiệt độ: ${current.temperature_2m}°C (Cảm giác như: ${current.apparent_temperature}°C)
- Tốc độ gió: ${current.wind_speed_10m} km/h
- Độ ẩm: ${current.relative_humidity_2m}%
- Tình trạng: ${getWeatherDescription(current.weather_code)}`;
    } catch (e) {
        console.error("Lỗi lấy thời tiết:", e);
        return null;
    }
}

// Helper: Dịch mã thời tiết Open-Meteo sang tiếng Việt
function getWeatherDescription(code) {
    const codes = {
        0: "Trời quang đãng", 1: "Nhiều mây", 2: "Mây rải rác", 3: "U ám",
        45: "Sương mù", 48: "Sương muối", 51: "Mưa phùn nhẹ", 53: "Mưa phùn vừa",
        55: "Mưa phùn dày", 61: "Mưa nhỏ", 63: "Mưa vừa", 65: "Mưa to",
        80: "Mưa rào nhẹ", 81: "Mưa rào vừa", 82: "Mưa rào rất to", 95: "Dông bão"
    };
    return codes[code] || "Không xác định";
}

// Tool: Lấy giá Crypto (CoinGecko - Miễn phí public)
async function getCryptoPrice(coinName) {
    try {
        // Mapping tên tiếng Việt sang ID CoinGecko cơ bản
        const mapping = {
            'bitcoin': 'bitcoin', 'btc': 'bitcoin',
            'ethereum': 'ethereum', 'eth': 'ethereum',
            'solana': 'solana', 'sol': 'solana',
            'dogecoin': 'dogecoin', 'doge': 'dogecoin',
            'bnb': 'binancecoin'
        };
        
        let coinId = mapping[coinName.toLowerCase()] || coinName.toLowerCase();
        
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,vnd`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data[coinId]) return null;
        
        const price = data[coinId];
        return `Giá ${coinId.toUpperCase()} hiện tại:
- USD: $${price.usd.toLocaleString()}
- VND: ${price.vnd.toLocaleString()} đ`;
    } catch (e) {
        return null;
    }
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

        // --- BƯỚC 1: CẤU HÌNH API KEY ---
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' }, // Hoặc model khác bạn thích
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' }, // Gemini Flash rất tốt cho tool use
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return new Response(JSON.stringify({ error: `Chưa cấu hình API Key cho model '${modelName}'` }), { status: 400, headers: corsHeaders });
        }

        // --- BƯỚC 2: PHÂN TÍCH TIN NHẮN CUỐI CÙNG ĐỂ TÌM Ý ĐỊNH DÙNG TOOL ---
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        let systemInjection = "";

        // >>> LOGIC THÔNG MINH <<<
        
        // A. Kiểm tra Thời gian
        if (lastMsg.includes('mấy giờ') || lastMsg.includes('ngày bao nhiêu') || lastMsg.includes('hôm nay') || lastMsg.includes('time') || lastMsg.includes('date')) {
            systemInjection += `\n[SYSTEM INFO]: ${getCurrentTime()}`;
        }

        // B. Kiểm tra Thời tiết (Tìm từ khóa 'thời tiết' + địa điểm)
        if (lastMsg.includes('thời tiết') || lastMsg.includes('weather')) {
            // Tách tên thành phố đơn giản (Logic thô sơ nhưng hiệu quả cho demo)
            // Ví dụ: "Thời tiết tại Hà Nội" -> Lấy "Hà Nội"
            let location = "Hanoi"; // Mặc định
            const keywords = ['tại', 'ở', 'in', 'of'];
            for (const kw of keywords) {
                if (lastMsg.includes(kw)) {
                    const parts = lastMsg.split(kw);
                    if (parts.length > 1) location = parts[1].trim().replace(/[?!.]/g, '');
                }
            }
            const weatherInfo = await getWeather(location);
            if (weatherInfo) {
                systemInjection += `\n[REAL-TIME DATA]: ${weatherInfo}`;
            }
        }

        // C. Kiểm tra Giá Coin
        if (lastMsg.includes('giá') && (lastMsg.includes('btc') || lastMsg.includes('bitcoin') || lastMsg.includes('eth'))) {
            let coin = 'bitcoin';
            if (lastMsg.includes('eth')) coin = 'ethereum';
            if (lastMsg.includes('sol')) coin = 'solana';
            const priceInfo = await getCryptoPrice(coin);
            if (priceInfo) {
                systemInjection += `\n[REAL-TIME DATA]: ${priceInfo}`;
            }
        }

        // --- BƯỚC 3: TIÊM DỮ LIỆU VÀO CONTEXT ---
        // Nếu có dữ liệu Real-time, ta nhét nó vào tin nhắn hệ thống (System Prompt)
        // hoặc chèn vào cuối tin nhắn user để AI đọc được.
        
        let finalMessages = [...messages];
        if (systemInjection) {
            console.log("Injecting data:", systemInjection); // Debug log trên Cloudflare
            
            // Tìm message System đầu tiên để chèn vào, hoặc chèn vào user message cuối
            const sysIndex = finalMessages.findIndex(m => m.role === 'system');
            if (sysIndex !== -1) {
                finalMessages[sysIndex].content += `\n\n${systemInjection}\n(Hãy sử dụng dữ liệu trên để trả lời người dùng chính xác)`;
            } else {
                // Nếu không có system prompt, chèn vào tin nhắn user cuối
                finalMessages[finalMessages.length - 1].content += `\n\n(Dữ liệu hệ thống cung cấp: ${systemInjection})`;
            }
        }

        // --- BƯỚC 4: GỌI OPENROUTER ---
        const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'HTTP-Referer': 'https://oceep.pages.dev/',
                'X-Title': 'Oceep'
            },
            body: JSON.stringify({
                model: config.model,
                messages: finalMessages, // Đã bao gồm dữ liệu Real-time
                stream: false,
                max_tokens: max_tokens || 3000,
                temperature: temperature || 0.7
            }),
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return new Response(JSON.stringify({ error: 'OpenRouter Error', details: errText }), { status: apiResponse.status, headers: corsHeaders });
        }

        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content || "";

        return new Response(JSON.stringify({ content: content }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Server Logic Error', details: error.message }), { status: 500, headers: corsHeaders });
    }
}
