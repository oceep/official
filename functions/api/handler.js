// File: functions/api/handler.js

// Cấu hình CORS Header để cho phép gọi từ frontend
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// Xử lý yêu cầu OPTIONS (Preflight cho CORS - bắt buộc phải có)
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

// Xử lý yêu cầu POST (Logic chính)
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. Đọc dữ liệu gửi lên từ Frontend
        const { modelName, messages, max_tokens, temperature } = await request.json();

        // 2. Cấu hình API Keys (Lấy từ biến môi trường của Cloudflare Pages)
        // Bạn nhớ vào Settings -> Environment Variables trên Cloudflare để điền key nhé
        const apiConfig = {
            'Mini': {
                key: env.MINI_API_KEY,
                model: 'meituan/longcat-flash-chat:free'
            },
            'Smart': {
                key: env.SMART_API_KEY,
                model: 'kwaipilot/kat-coder-pro:free'
            },
            'Nerd': {
                key: env.NERD_API_KEY,
                model: 'x-ai/grok-4.1-fast'
            }
        };

        const config = apiConfig[modelName];
        
        // Kiểm tra xem đã có cấu hình cho model này chưa
        if (!config || !config.key) {
            return new Response(
                JSON.stringify({ error: `Chưa cấu hình API Key cho model '${modelName}' trên Cloudflare Pages.` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Gọi sang OpenRouter API
        const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
        
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'HTTP-Referer': 'https://oceep.pages.dev/', // Thay bằng domain thật của bạn nếu muốn
                'X-Title': 'Oceep'
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: false, // QUAN TRỌNG: Tắt streaming để chuyển sang chế độ Buffer
                max_tokens: max_tokens || 3000,
                temperature: temperature || 0.7
            }),
        });

        // Xử lý lỗi từ OpenRouter nếu có
        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return new Response(
                JSON.stringify({ error: 'Lỗi từ OpenRouter API', details: errText }),
                { status: apiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Lấy dữ liệu JSON trọn vẹn
        const data = await apiResponse.json();
        
        // Lấy nội dung text từ response chuẩn của OpenAI format
        const content = data.choices?.[0]?.message?.content || "";

        // 5. Trả về JSON cho Frontend
        return new Response(JSON.stringify({ content: content }), {
            headers: { 
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
        });

    } catch (error) {
        // Bắt lỗi hệ thống (ví dụ lỗi code, lỗi server)
        return new Response(
            JSON.stringify({ error: 'Lỗi Server Cloudflare', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}
