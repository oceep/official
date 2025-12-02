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

// --- Tool 4: Wikipedia API (Rất ổn định cho định nghĩa/thông tin chung) ---
async function searchWikipedia(query) {
    try {
        const url = `https://vi.wikipedia.org/w/api.php?action=query&list=search&prop=info&inprop=url&utf8=&format=json&origin=*&srlimit=3&srsearch=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.query || !data.query.search || data.query.search.length === 0) return null;

        const results = data.query.search.map(item => {
            return `- Title: ${item.title}\n  Snippet: ${item.snippet.replace(/<[^>]*>/g, '')}`;
        }).join('\n');

        return `[WIKIPEDIA DATA]\n${results}`;
    } catch (e) { return null; }
}

// --- Tool 5: DuckDuckGo HTML Search (Cải tiến Headers để tránh bị chặn) ---
async function searchDuckDuckGo(query, type) {
    try {
        // Tối ưu từ khóa
        let q = query;
        if (type === 'price') q = `giá ${query} tại việt nam`;
        else if (type === 'news') q = `tin tức ${query} mới nhất`;
        else if (type === 'stock') q = `giá cổ phiếu ${query}`;

        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        
        // Giả lập User-Agent của trình duyệt thật để không bị chặn
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        if (!res.ok) return null;
        const html = await res.text();

        // Regex cải tiến để bắt dữ liệu chính xác hơn
        const results = [];
        const regex = /<a class="result__a" href="([^"]+)">([^<]+)<\/a>.*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        
        let match;
        let count = 0;
        while ((match = regex.exec(html)) !== null && count < 5) {
            results.push(`- Source: ${match[2].replace(/<[^>]*>/g, '')}\n  Summary: ${match[3].replace(/<[^>]*>/g, '')}\n  Link: ${match[1]}`);
            count++;
        }

        if (results.length === 0) return null; // Nếu bị chặn sẽ không có kết quả

        return `[WEB SEARCH RESULTS - DUCKDUCKGO]\nKeyword: "${q}"\n${results.join('\n\n')}`;
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

        // 1. Check Thời gian
        if (lastMsg.match(/(giờ|ngày|hôm nay|thứ mấy)/)) {
            injectionData += `SYSTEM TIME: ${getCurrentTime()}\n\n`;
            toolUsed = "Time";
        }

        // 2. Check Thời tiết
        if (lastMsg.match(/(thời tiết|nhiệt độ|mưa|nắng)/)) {
            const data = await getWeather(lastMsg);
            if (data) {
                injectionData += data + "\n\n";
                toolUsed = "Weather";
            }
        }

        // 3. Check Web Search (Giá cả, Tin tức, Cổ phiếu, Ai là, Ở đâu...)
        // Đây là phần quan trọng để AI "đọc" web
        const searchKeywords = /(giá|mua|bán|bao nhiêu|chi phí|vé|tin tức|sự kiện|mới nhất|cổ phiếu|chứng khoán|ai là|là gì|ở đâu|tại sao)/;
        
        if (searchKeywords.test(lastMsg) || lastMsg.length > 15) { // Nếu câu hỏi dài hoặc chứa từ khóa
            let searchType = 'general';
            if (lastMsg.match(/(giá|mua|bán|chi phí|vé|bao nhiêu)/)) searchType = 'price';
            if (lastMsg.match(/(tin tức|sự kiện|mới nhất)/)) searchType = 'news';
            if (lastMsg.match(/(cổ phiếu|chứng khoán)/)) searchType = 'stock';

            // Ưu tiên 1: DuckDuckGo (Thông tin mới nhất)
            let searchData = await searchDuckDuckGo(lastMsg, searchType);
            
            // Ưu tiên 2: Wikipedia (Nếu DDG lỗi và câu hỏi là "là gì/ai là")
            if (!searchData && lastMsg.match(/(là gì|ai là|địa lý|lịch sử)/)) {
                searchData = await searchWikipedia(lastMsg);
            }

            if (searchData) {
                injectionData += searchData + "\n\n";
                toolUsed = toolUsed || "Web Search"; // Cập nhật nếu chưa có tool nào
            }
        }

        // --- CẤU TRÚC LẠI SYSTEM PROMPT ---
        // Kỹ thuật "Grounding": Ép AI trả lời dựa trên dữ liệu vừa tìm được
        let finalMessages = [...messages];

        if (injectionData) {
            const systemPrompt = `
You are Oceep, an AI assistant with REAL-TIME access to tools and the internet.
Below is the raw data fetched just now for this specific user query:

=== START OF REAL-TIME DATA ===
${injectionData}
=== END OF REAL-TIME DATA ===

INSTRUCTIONS:
1.  **Analyze the Data:** Read the "Summary" and "Snippet" sections in the data above carefully.
2.  **Answer the User:** Use ONLY the information provided above to answer the user's question.
3.  **Citation:** Mention the source if available (e.g., "Theo thông tin từ [Source]...").
4.  **No Refusal:** Do NOT say "I cannot access the internet" or "I don't have real-time info". You HAVE the info above.
5.  **Language:** Answer in Vietnamese.
`;
            // Chèn System Prompt này vào cuối mảng messages để nó có trọng lượng cao nhất (ghi đè prompt cũ)
            finalMessages.push({ role: "system", content: systemPrompt });
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
                stream: false, // Tắt stream để Cloudflare xử lý xong mới trả về (ổn định hơn cho tool)
                max_tokens: 2500,
                temperature: 0.5 // Giảm nhiệt độ để AI bám sát dữ liệu thực tế hơn
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
