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

// --- Tool 3: Firecrawl Search (New) ---
async function searchFirecrawl(query, apiKey) {
    if (!apiKey) return null;
    
    try {
        // Sử dụng endpoint search của Firecrawl
        const res = await fetch('https://api.firecrawl.dev/v0/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: query,
                limit: 5,
                lang: 'vi',
                scrapeOptions: { formats: ['markdown'] }
            })
        });

        if (!res.ok) return null;
        const data = await res.json();
        
        if (!data.success || !data.data || data.data.length === 0) return null;

        let resultText = `[FIRECRAWL SEARCH RESULTS]\nQuery: "${query}"\n\n`;
        
        data.data.forEach((item, index) => {
            resultText += `=== Source ${index + 1}: ${item.title || 'Untitled'} ===\n`;
            resultText += `URL: ${item.url}\n`;
            if (item.markdown) {
                // Giới hạn độ dài markdown để tránh quá token
                resultText += `Content: ${item.markdown.substring(0, 500)}...\n\n`;
            } else if (item.description) {
                resultText += `Summary: ${item.description}\n\n`;
            }
        });
        
        return resultText;

    } catch (e) {
        return null;
    }
}

// --- Tool 4: Binance Crypto Data (New) ---
async function getBinanceData(query) {
    try {
        // Simple heuristic mapping for common coins
        let symbol = "BTCUSDT"; // Default
        const q = query.toUpperCase();
        
        if (q.includes("ETH") || q.includes("ETHEREUM")) symbol = "ETHUSDT";
        else if (q.includes("BNB")) symbol = "BNBUSDT";
        else if (q.includes("SOL")) symbol = "SOLUSDT";
        else if (q.includes("DOGE")) symbol = "DOGEUSDT";
        else if (q.includes("ADA") || q.includes("CARDANO")) symbol = "ADAUSDT";
        else if (q.includes("XRP")) symbol = "XRPUSDT";
        // Attempt to extract 3-4 letter symbol if present
        else {
             const potentialSymbol = q.match(/\b[A-Z]{3,4}\b/);
             if (potentialSymbol) symbol = `${potentialSymbol[0]}USDT`;
        }

        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!res.ok) return null; // Fallback if symbol not found

        const data = await res.json();
        
        // Format as structured data for LLM to build a table
        return `[BINANCE MARKET DATA - REALTIME]
Symbol: ${data.symbol}
Current Price: ${parseFloat(data.lastPrice).toLocaleString()} USDT
Price Change (24h): ${parseFloat(data.priceChange).toLocaleString()} USDT
Change Percent (24h): ${data.priceChangePercent}%
High (24h): ${parseFloat(data.highPrice).toLocaleString()} USDT
Low (24h): ${parseFloat(data.lowPrice).toLocaleString()} USDT
Volume (24h): ${parseFloat(data.volume).toLocaleString()} ${symbol.replace('USDT','')}
Quote Volume (24h): ${parseFloat(data.quoteVolume).toLocaleString()} USDT
Time: ${new Date(data.closeTime).toLocaleString('vi-VN')}
`;
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
        const { modelName, messages } = await request.json();

        // Config Key
        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'arcee-ai/trinity-mini:free' }, 
            'Smart': { key: env.SMART_API_KEY, model: 'google/gemini-flash-1.5-8b' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };
        const config = apiConfig[modelName];
        if (!config || !config.key) return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 400, headers: corsHeaders });

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content.toLowerCase();
        let injectionData = "";
        let toolUsed = null;

        // --- DANH SÁCH TỪ KHÓA (Logic người dùng yêu cầu) ---
        
        // 🟥 Những loại câu hỏi KHÔNG nên search (Red List)
        const skipSearchKeywords = /(giải toán|code|lập trình|javascript|python|html|css|fix bug|lỗi|logic|ngữ pháp|tiếng anh|viết văn|viết mail|văn mẫu|kiến thức chung|trái đất quay quanh gì|định nghĩa|khái niệm|công thức|tính toán|giai toan|lap trinh|ngu phap|viet van|van mau|kien thuc chung|trai dat|dinh nghia|khai niem|cong thuc|tinh toan)/;
        
        // 🟩 Những loại câu hỏi CHẮC CHẮN cần search (Green List)
        const mustSearchKeywords = [
            'địa chỉ', 'quán', 'nhà hàng', 'ở đâu', 'gần đây', 'đường nào', 'bản đồ', 
            'dia chi', 'quan', 'nha hang', 'o dau', 'gan day', 'duong nao', 'ban do',
            'thời tiết', 'hôm nay', 'ngày mai', 'nhiệt độ', 'mưa', 'nắng',
            'thoi tiet', 'hom nay', 'ngay mai', 'nhiet do',
            'tin tức', 'sự kiện', 'mới nhất', 'vừa xảy ra', 'biến động',
            'tin tuc', 'su kien', 'moi nhat', 'vua xay ra', 'bien dong',
            'giá', 'chi phí', 'bao nhiêu tiền', 'tỷ giá', 'vàng',
            'gia', 'chi phi', 'bao nhieu tien', 'ty gia', 'vang',
            'giờ mở cửa', 'tình trạng giao thông', 'kẹt xe', 'tắc đường',
            'gio mo cua', 'giao thong', 'ket xe', 'tac duong',
            'hiện tại', 'bây giờ', 'hien tai', 'bay gio', 'có quán nào', 'co quan nao'
        ];

        // Crypto specific keywords for Binance
        const cryptoKeywords = /(crypto|coin|bitcoin|eth|bnb|usdt|token|thị trường ảo|thi truong ao|giá coin|gia coin)/;

        // Logic check
        const shouldSkipSearch = skipSearchKeywords.test(lastMsg);
        const isMustSearch = mustSearchKeywords.some(kw => lastMsg.includes(kw));
        const isCryptoQuery = cryptoKeywords.test(lastMsg);

        if (!shouldSkipSearch) {
            
            // 1. Time Check (Always helpful for "now/today")
            if (lastMsg.match(/(giờ|ngày|hôm nay|thứ mấy|bây giờ|gio|ngay|hom nay|thu may|bay gio)/)) {
                injectionData += `SYSTEM TIME: ${getCurrentTime()}\n\n`;
                toolUsed = "Time";
            }

            // 2. Weather Check
            if (lastMsg.match(/(thời tiết|nhiệt độ|mưa|nắng|thoi tiet|nhiet do|mua|nang)/)) {
                const weatherData = await getWeather(lastMsg);
                if (weatherData) injectionData += weatherData + "\n\n";
            }

            // 3. Binance Crypto Check
            if (isCryptoQuery) {
                const binanceData = await getBinanceData(lastMsg);
                if (binanceData) {
                    injectionData += binanceData + "\n\n";
                    toolUsed = "Binance API";
                }
            }

            // 4. Firecrawl Search (Must Search OR Long query that is not Red Listed)
            if (isMustSearch && !toolUsed) { // Ưu tiên Binance nếu đã dùng rồi thì thôi search chung chung (trừ khi cần news)
                 const firecrawlKey = env.FIRECRAWL_KEY;
                 if (firecrawlKey) {
                     const searchData = await searchFirecrawl(lastMsg, firecrawlKey);
                     if (searchData) {
                         injectionData += searchData + "\n\n";
                         toolUsed = "Firecrawl Search";
                     }
                 } else {
                     injectionData += "[SYSTEM NOTE: Search capability unavailable (Missing Firecrawl API Key)]\n";
                 }
            }
        }

        let finalMessages = [...messages];

        if (injectionData) {
            const systemPrompt = `
You are Oceep, an intelligent AI assistant.
You have access to real-time tools. Below is the data retrieved for this request:

=== START OF REAL-TIME DATA ===
${injectionData}
=== END OF REAL-TIME DATA ===

INSTRUCTIONS:
1. **Search Results (Firecrawl):** If data comes from Firecrawl, synthesize the information to answer the user's question accurately. Mention addresses, prices, and opening hours if available.
2. **Crypto Data (Binance):** If data comes from Binance, **YOU MUST OUTPUT A MARKDOWN TABLE**.
   - Format: | Indicator | Value |
   - Provide a brief analysis below the table (Bullish/Bearish trend based on % change).
3. **No Refusal:** Do not say "I cannot access the internet". Use the provided data.
4. **Language:** Answer in Vietnamese (unless requested otherwise).
5. **Formatting:** Use Markdown bolding for key figures.
`;
            finalMessages.push({ role: "system", content: systemPrompt });
        } else if (shouldSkipSearch) {
            finalMessages.push({ role: "system", content: "Task requires internal knowledge (Code/Math/Creative). Do NOT hallucinate real-time facts. Focus on logic and accuracy." });
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
