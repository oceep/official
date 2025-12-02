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

// --- Tool 2: Địa điểm (OpenStreetMap - Free) ---
async function getCoordinates(query) {
    try {
        const q = (query.includes('Vietnam') || query.length < 10) ? `${query} Vietnam` : query;
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=vi`;
        
        const res = await fetch(searchUrl, { 
            headers: { 'User-Agent': 'FoxChatbot/1.0' } 
        });
        const data = await res.json();
        
        if (!data || data.length === 0) return null;
        return { lat: data[0].lat, lon: data[0].lon, name: data[0].display_name };
    } catch (e) { return null; }
}

// --- Tool 3: Thời tiết (Open-Meteo - Free) ---
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

        return `[THỜI TIẾT THỰC TẾ]
- Địa điểm: ${coords.name}
- Thời gian đo: ${cur.time}
- Trạng thái: ${status}
- Nhiệt độ: ${cur.temperature_2m}°C (Cảm giác: ${cur.apparent_temperature}°C)
- Độ ẩm: ${cur.relative_humidity_2m}%
- Gió: ${cur.wind_speed_10m} km/h`;
    } catch (e) { return null; }
}

// --- Tool 4: Tìm kiếm chung / Chứng khoán / Tin tức (DuckDuckGo HTML - Free & Unlimited) ---
async function performSearch(query, type = 'general') {
    try {
        // Tối ưu từ khóa cho từng loại
        let searchQuery = query;
        if (type === 'stock') searchQuery = `${query} stock price`;
        if (type === 'news') searchQuery = `${query} tin tức mới nhất`;
        if (type === 'general') searchQuery = query;

        // Sử dụng DuckDuckGo HTML version (nhẹ, free, không cần API Key)
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
        
        const res = await fetch(url, {
            headers: {
                // Giả lập trình duyệt để không bị chặn
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!res.ok) return null;
        const html = await res.text();

        // Xử lý Regex đơn giản để lấy kết quả (Title và Snippet)
        // Lưu ý: DuckDuckGo class thường là 'result__a' (title) và 'result__snippet' (desc)
        const results = [];
        const regex = /<a class="result__a" href="([^"]+)">([^<]+)<\/a>.*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        
        let match;
        let count = 0;
        // Lấy tối đa 4 kết quả đầu tiên
        while ((match = regex.exec(html)) !== null && count < 4) {
            let link = match[1];
            let title = match[2].replace(/<[^>]*>/g, ''); // Xóa tag HTML thừa
            let snippet = match[3].replace(/<[^>]*>/g, '');
            results.push(`- Title: ${title}\n  Summary: ${snippet}\n  Link: ${link}`);
            count++;
        }

        if (results.length === 0) return null;

        return `[KẾT QUẢ TÌM KIẾM TỪ DUCKDUCKGO] (${type.toUpperCase()})
Query: "${searchQuery}"
${results.join('\n\n')}
`;
    } catch (e) {
        console.error("Search error:", e);
        return null;
    }
}

// ==========================================
// 2. XỬ LÝ ROUTING & LOGIC THÔNG MINH
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

        // --- PHÂN TÍCH Ý ĐỊNH NGƯỜI DÙNG ---
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        // 1. NGÀY GIỜ (Ưu tiên cao nhất)
        if (lastMsg.includes('giờ') || lastMsg.includes('ngày') || lastMsg.includes('thứ mấy') || lastMsg.includes('hôm nay')) {
            injectionData += `THỜI GIAN HIỆN TẠI: ${getCurrentTime()}\n\n`;
            toolUsed = "Time";
        }

        // 2. THỜI TIẾT
        if (lastMsg.includes('thời tiết') || lastMsg.includes('nhiệt độ') || lastMsg.includes('mưa') || lastMsg.includes('nắng')) {
            const data = await getWeather(lastMsg);
            if (data) {
                injectionData += data + "\n\n";
                toolUsed = "Weather";
            }
        }

        // 3. CHỨNG KHOÁN (Stock)
        if (lastMsg.includes('giá cổ phiếu') || lastMsg.includes('chứng khoán') || lastMsg.includes('mã cổ phiếu') || lastMsg.includes('stock')) {
            // Lấy từ khóa sau các từ trigger
            let query = lastMsg.replace(/(giá cổ phiếu|chứng khoán|giá|của|mã)/g, '').trim();
            const data = await performSearch(query, 'stock');
            if (data) {
                injectionData += data + "\n\n";
                toolUsed = "Stock Search";
            }
        }

        // 4. TIN TỨC (News)
        else if (lastMsg.includes('tin tức') || lastMsg.includes('báo chí') || lastMsg.includes('sự kiện') || lastMsg.includes('mới nhất')) {
            const data = await performSearch(lastMsg, 'news');
            if (data) {
                injectionData += data + "\n\n";
                toolUsed = "News Search";
            }
        }

        // 5. TÌM KIẾM TỔNG QUÁT (Fallback cho câu hỏi khó/cần fact)
        // Nếu chưa dùng tool nào và câu hỏi có vẻ cần dữ liệu thực tế (chứa "ai là", "tại sao", "kết quả", "như thế nào")
        else if (!toolUsed && (lastMsg.includes('ai là') || lastMsg.includes('là gì') || lastMsg.includes('ở đâu') || lastMsg.includes('top') || lastMsg.length > 15)) {
             // Chỉ search nếu không phải là chào hỏi xã giao
             const commonGreetings = ['xin chào', 'hello', 'hi', 'bạn là ai', 'giúp gì'];
             if (!commonGreetings.some(g => lastMsg.includes(g))) {
                 const data = await performSearch(lastMsg, 'general');
                 if (data) {
                     injectionData += data + "\n\n";
                     toolUsed = "General Search";
                 }
             }
        }

        // --- TẠO SYSTEM PROMPT MỚI ---
        let finalMessages = [...messages];

        if (injectionData) {
            // System Override: Ép buộc AI nhận dữ liệu và trích dẫn nguồn
            const overridePrompt = `
[SYSTEM DATA & TOOLS RESULT - REALTIME]
========================
${injectionData}
========================
INSTRUCTION:
The user is asking about the above information.
1. You MUST use the provided data to answer.
2. If using Search Results, synthesize the information concisely.
3. Cite the source (domain name) if available (e.g., "Theo [Source Name]...").
4. Answer directly in Vietnamese.
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
        
        // Trả về content kèm metadata tool đã dùng (để debug nếu cần)
        return new Response(JSON.stringify({ 
            content: data.choices?.[0]?.message?.content || "",
            toolUsed: toolUsed // Frontend có thể dùng cái này để hiển thị icon tool
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: `Server Error: ${e.message}` }), { status: 500, headers: corsHeaders });
    }
}
