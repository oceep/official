// functions/api/handler.js

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// ==========================================
// 1. CÁC HÀM GỌI API (TOOLS)
// ==========================================

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

async function getCoordinates(query) {
    try {
        // Thêm 'Vietnam' để ưu tiên tìm ở VN nếu query ngắn
        const q = (query.includes('Vietnam') || query.length < 10) ? `${query} Vietnam` : query;
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=vi`;
        
        const res = await fetch(searchUrl, { 
            headers: { 'User-Agent': 'FoxChatbot/1.0' } // Quan trọng: Nominatim cần User-Agent
        });
        const data = await res.json();
        
        if (!data || data.length === 0) return null;
        return { lat: data[0].lat, lon: data[0].lon, name: data[0].display_name };
    } catch (e) { return null; }
}

async function getWeather(query) {
    try {
        // Fallback: Nếu query rỗng, lấy Hà Nội
        const locationQuery = (query && query.length > 2) ? query : "Hanoi";
        
        let coords = await getCoordinates(locationQuery);
        // Nếu không tìm thấy địa điểm lạ, thử lại với Hanoi để đảm bảo luôn có data demo
        if (!coords && locationQuery !== "Hanoi") coords = await getCoordinates("Hanoi");
        
        if (!coords) return null;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        
        const res = await fetch(url);
        if (!res.ok) return null; // Kiểm tra lỗi mạng
        
        const data = await res.json();

        // --- FIX LỖI CRASH Ở ĐÂY ---
        // Kiểm tra xem data.current có tồn tại không trước khi đọc
        if (!data || !data.current) {
            return null; 
        }

        const cur = data.current;
        const wmo = { 
            0:"Nắng đẹp ☀️", 1:"Nhiều mây 🌤", 2:"Có mây ☁️", 3:"Âm u ☁️", 
            45:"Sương mù 🌫", 51:"Mưa nhỏ 🌧", 61:"Mưa 🌧", 63:"Mưa vừa 🌧", 
            80:"Mưa rào ⛈", 95:"Bão ⛈" 
        };
        // Sử dụng toán tử ?. để tránh lỗi undefined
        const status = wmo[cur.weather_code] || "Có mây";

        return `DỮ LIỆU THỜI TIẾT TẠI [${coords.name}]:
- Thời gian đo: ${cur.time}
- Trạng thái: ${status}
- Nhiệt độ: ${cur.temperature_2m}°C
- Cảm giác thực: ${cur.apparent_temperature}°C
- Độ ẩm: ${cur.relative_humidity_2m}%
- Gió: ${cur.wind_speed_10m} km/h`;
    } catch (e) {
        // Nếu lỗi, trả về null để không làm sập Chatbot
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
        const { modelName, messages, max_tokens } = await request.json();

        // Config Key
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        // --- XỬ LÝ LOGIC ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";

        // 1. BẮT TỪ KHÓA THỜI TIẾT
        if (lastMsg.includes('thời tiết') || lastMsg.includes('nhiệt độ') || lastMsg.includes('mưa')) {
            let loc = lastMsg.replace(/(thời tiết|nhiệt độ|dự báo|tại|ở|hôm nay|thế nào|\?)/g, '').trim();
            if (loc.length < 2) loc = "Hanoi";
            
            const weather = await getWeather(loc);
            if (weather) injectionData += weather + "\n\n";
        }

        // 2. BẮT TỪ KHÓA BẢN ĐỒ
        if (lastMsg.includes('bản đồ') || lastMsg.includes('ở đâu')) {
             let loc = lastMsg.replace(/(bản đồ|ở đâu|tại|ở|\?)/g, '').trim();
             if (loc.length > 2) {
                 const coords = await getCoordinates(loc);
                 if (coords) injectionData += `VỊ TRÍ: ${coords.name}\nLINK MAP: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords.name)}\n\n`;
             }
        }
        
        // 3. THỜI GIAN
        if (lastMsg.includes('giờ') || lastMsg.includes('ngày')) {
            injectionData += `GIỜ SERVER: ${getCurrentTime()}\n\n`;
        }

        // --- TẠO SYSTEM PROMPT MỚI ---
        let finalMessages = [...messages];

        if (injectionData) {
            // System Override: Ép buộc AI nhận dữ liệu
            const overridePrompt = `
[SYSTEM DATA - REALTIME]
========================
${injectionData}
========================
INSTRUCTION:
The user is asking about the above information.
You MUST use the provided data to answer.
Do NOT say "I don't know" or "I am an AI".
Answer directly in Vietnamese.
`;
            finalMessages.push({ role: "system", content: overridePrompt });
        }

        // --- GỌI OPENROUTER ---
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
                max_tokens: 2000,
                temperature: 0.6
            }),
        });

        if (!res.ok) {
            const txt = await res.text();
            return new Response(JSON.stringify({ error: txt }), { status: res.status, headers: corsHeaders });
        }
        const data = await res.json();
        return new Response(JSON.stringify({ content: data.choices?.[0]?.message?.content || "" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        // Trả về lỗi JSON sạch sẽ thay vì lỗi crash
        return new Response(JSON.stringify({ error: `Server Error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
