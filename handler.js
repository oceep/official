// File này BẮT BUỘC phải nằm trong thư mục: api/handler.js

const apiConfig = {
    'Mini': {
        key: process.env.MINI_API_KEY,
        model: 'openai/gpt-oss-20b:free'
    },
    'Smart': {
        key: process.env.SMART_API_KEY,
        model: 'kwaipilot/kat-coder-pro:free'
    },
    'Nerd': {
        key: process.env.NERD_API_KEY,
        model: 'x-ai/grok-4.1-fast:free'
    }
};

export const config = {
    runtime: 'edge',
};

function corsResponse(body, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return new Response(body, { ...init, headers });
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return corsResponse(null, { status: 204 });
    }

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

        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return corsResponse(
                JSON.stringify({ 
                    error: `API Key hoặc cấu hình cho model '${modelName}' chưa được cài đặt trên Server.` 
                }), 
                { 
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'HTTP-Referer': 'https://official-oceeps-projects.vercel.app/',
                'X-Title': 'Oceep'
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: true
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return corsResponse(
                JSON.stringify({ 
                    error: 'Lỗi từ OpenRouter API.', 
                    details: errorText 
                }), 
                { 
                    status: response.status,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
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
                error: 'Lỗi Server nội bộ.', 
                details: error.message 
            }), 
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}
