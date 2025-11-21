// Cấu hình cho các model và tên tệp model tương ứng trên OpenRouter
const apiConfig = {
    'Mini': {
        key: process.env.MINI_API_KEY, // Lấy key từ biến môi trường
        model: 'openai/gpt-oss-20b:free'
    },
    'Smart': {
        key: process.env.SMART_API_KEY, // Lấy key từ biến môi trường
        model: 'kwaipilot/kat-coder-pro:free'
    },
    'Nerd': {
        key: process.env.NERD_API_KEY, // Lấy key từ biến môi trường
        model: 'x-ai/grok-4.1-fast:free'
    }
};

// Cấu hình để Vercel hiểu đây là một Edge Function để xử lý streaming
export const config = {
    runtime: 'edge',
};

// Hàm helper để tạo response với CORS headers
function corsResponse(body, init = {}) {
    const headers = new Headers(init.headers || {});
    
    // Thêm CORS headers - QUAN TRỌNG!
    headers.set('Access-Control-Allow-Origin', '*'); // Hoặc chỉ định domain cụ thể của bạn
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return new Response(body, { ...init, headers });
}

// Hàm chính xử lý request
export default async function handler(req) {
    // Xử lý preflight request (OPTIONS) - Browsers gửi trước khi POST
    if (req.method === 'OPTIONS') {
        return corsResponse(null, { status: 204 });
    }

    // Chỉ cho phép phương thức POST
    if (req.method !== 'POST') {
        return corsResponse(
            JSON.stringify({ error: 'Method not allowed' }), 
            { 
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    try {
        const { modelName, messages } = await req.json();

        // Lấy thông tin cấu hình cho model được yêu cầu
        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return corsResponse(
                JSON.stringify({ 
                    error: `Configuration or API key for model '${modelName}' not found.` 
                }), 
                { 
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

        // Gọi đến API của OpenRouter
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                // Các header này có thể cần thiết để OpenRouter xác thực
                'HTTP-Referer': 'https://official-virid.vercel.app/', // Thay bằng domain của bạn
                'X-Title': 'Oceep' // Thay bằng tên app của bạn
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: true // Luôn bật stream
            }),
        });

        // Kiểm tra nếu API của OpenRouter trả về lỗi
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API Error:', errorText);
            return corsResponse(
                JSON.stringify({ 
                    error: 'Failed to fetch from OpenRouter API.', 
                    details: errorText 
                }), 
                { 
                    status: response.status,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        // Trả về luồng (stream) dữ liệu trực tiếp cho client với CORS headers
        return corsResponse(response.body, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Error in handler:', error);
        return corsResponse(
            JSON.stringify({ 
                error: 'An internal server error occurred.', 
                details: error.message 
            }), 
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
