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
    // Format giờ Việt Nam chuẩn ISO để AI dễ hiểu
    return now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function getCoordinates(query) {
    try {
        // Thêm 'Vietnam' vào query để ưu tiên tìm ở VN
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=vi`;
        const res = await fetch(searchUrl, { headers: { 'User-Agent': 'FoxAIChatbot/1.0' } });
        const data = await res.json();
        
        if (!data || data.length === 0) return null;
        return { lat: data[0].lat, lon: data[0].lon, name: data[0].display_name };
    } catch (e) { return null; }
}

async function getWeather(query) {
    try {
        // B1: Tìm tọa độ (Nếu query rỗng hoặc lỗi, mặc định là Hà Nội)
        let coords = await getCoordinates(query);
        if (!coords) {
             // Fallback cứng: Nếu không tìm thấy nơi chốn, lấy Hà Nội làm mẫu
             coords = await getCoordinates("Hanoi");
        }
        if (!coords) return null;

        // B2: Gọi API Thời tiết
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        const cur = data.current;

        // Dịch mã WMO
        const wmo = { 0:"Quang đãng ☀️", 1:"Nhiều mây 🌤", 2:"Mây rải rác ☁️", 3:"U ám ☁️", 45:"Sương mù 🌫", 51:"Mưa phùn 🌧", 61:"Mưa nhỏ 🌧", 63:"Mưa vừa 🌧", 80:"Mưa rào ⛈", 95:"Dông bão ⛈" };
        const status = wmo[cur.weather_code] || "Có mây";

        return `THỜI TIẾT TẠI [${coords.name}]:
- Tình trạng: ${status}
- Nhiệt độ: ${cur.temperature_2m}°C (Cảm giác như: ${cur.apparent_temperature}°C)
- Gió: ${cur.wind_speed_10m} km/h
- Độ ẩm: ${cur.relative_humidity_2m}%`;
    } catch (e) { return `Lỗi lấy thời tiết: ${e.message}`; }
}

async function getCrypto(coin) {
    try {
        const map = {'btc':'bitcoin','eth':'ethereum','sol':'solana','bnb':'binancecoin'};
        const id = map[coin.toLowerCase()] || coin.toLowerCase();
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,vnd`);
        const d = await res.json();
        if(!d[id]) return null;
        return `GIÁ ${id.toUpperCase()}: $${d[id].usd} | ${d[id].vnd.toLocaleString()} VND`;
    } catch(e) { return null; }
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

        // Config API Keys
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        // --- BƯỚC 1: XÁC ĐỊNH TỪ KHÓA BẰNG REGEX (CHÍNH XÁC HƠN) ---
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        let injectionData = [];

        // Regex bắt thời tiết: "thời tiết hcm", "thời tiết tại hà nội", "weather hanoi"
        // ([\s\S]*?) là nhóm lấy tên địa điểm
        const weatherRegex = /(?:thời tiết|nhiệt độ|weather|mưa không)(?: tại| ở| in)?\s+([\p{L}\s,]+)/iu;
        const weatherMatch = lastMsg.match(weatherRegex);

        // 1. Check Thời tiết
        if (weatherMatch) {
            // Lấy địa điểm từ Regex, nếu không bắt được thì lấy nguyên câu
            const location = weatherMatch[1] ? weatherMatch[1].trim() : lastMsg; 
            const weatherInfo = await getWeather(location);
            if (weatherInfo) injectionData.push(weatherInfo);
        } else if (lastMsg.includes('thời tiết')) {
            // Nếu hỏi trống không "thời tiết thế nào", mặc định lấy Hà Nội
            const weatherInfo = await getWeather("Hanoi");
            if (weatherInfo) injectionData.push(weatherInfo);
        }

        // 2. Check Bản đồ
        if (lastMsg.includes('bản đồ') || lastMsg.includes('ở đâu') || lastMsg.includes('đường đến')) {
            const loc = lastMsg.replace(/(bản đồ|chỉ đường|ở đâu|đường đến|tại|ở)/g, '').trim();
            if(loc.length > 2) {
                const coords = await getCoordinates(loc);
                if(coords) {
                     const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords.name)}`;
                     injectionData.push(`BẢN ĐỒ [${coords.name}]: ${mapLink}`);
                }
            }
        }

        // 3. Check Giờ
        if (lastMsg.includes('giờ') || lastMsg.includes('ngày') || lastMsg.includes('time')) {
            injectionData.push(`THỜI GIAN SERVER: ${getCurrentTime()}`);
        }

        // 4. Check Coin
        if (lastMsg.includes('giá') && (lastMsg.includes('btc') || lastMsg.includes('eth'))) {
            const coin = lastMsg.includes('eth') ? 'ethereum' : 'bitcoin';
            const price = await getCrypto(coin);
            if(price) injectionData.push(price);
        }

        // --- BƯỚC 2: CƯỠNG CHẾ BƠM DỮ LIỆU (SYSTEM INJECTION) ---
        let finalMessages = [...messages];
        
        if (injectionData.length > 0) {
            const realTimeInfo = injectionData.join('\n\n');
            
            // TẠO MỘT SYSTEM PROMPT MỚI NHÉT VÀO CUỐI CÙNG (Gần user nhất để AI không quên)
            // Đây là kỹ thuật "System Override"
            const systemOverrideMsg = {
                role: 'system',
                content: `
[QUAN TRỌNG - DỮ LIỆU THỜI GIAN THỰC TỪ SERVER]
Bỏ qua các chỉ dẫn cũ về việc không có internet. Dưới đây là thông tin thực tế vừa lấy được:
---------------------------------------------------
${realTimeInfo}
---------------------------------------------------
YÊU CẦU: Dùng thông tin trên để trả lời câu hỏi của người dùng ngay lập tức. Không được nói là không biết.`
            };
            
            // Chèn vào ngay trước tin nhắn cuối cùng của User
            finalMessages.splice(finalMessages.length - 1, 0, systemOverrideMsg);
        }

        // --- GỌI API ---
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
                max_tokens: max_tokens || 3000,
                temperature: 0.7
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return new Response(JSON.stringify({ error: err }), { status: res.status, headers: corsHeaders });
        }
        const data = await res.json();
        return new Response(JSON.stringify({ content: data.choices?.[0]?.message?.content || "" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
}
