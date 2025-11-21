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

// Hàm chính xử lý request
export default async function handler(req) {
    // Chỉ cho phép phương thức POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const { modelName, messages } = await req.json();

        // Lấy thông tin cấu hình cho model được yêu cầu
        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return new Response(JSON.stringify({ error: `Configuration or API key for model '${modelName}' not found.` }), { status: 400 });
        }

        const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

        // Gọi đến API của OpenRouter
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                // Các header này có thể cần thiết để OpenRouter xác thực
                'HTTP-Referer': 'https://your-frontend-domain.com', // Thay bằng domain của bạn
                'X-Title': 'Oceep Chatbot' // Thay bằng tên app của bạn
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
            return new Response(JSON.stringify({ error: 'Failed to fetch from OpenRouter API.', details: errorText }), { status: response.status });
        }
        
        // Trả về luồng (stream) dữ liệu trực tiếp cho client
        return new Response(response.body, {
            headers: {
                'Content-Type': 'text/event-stream',
            },
        });

    } catch (error) {
        console.error('Error in handler:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.', details: error.message }), { status: 500 });
    }
}
