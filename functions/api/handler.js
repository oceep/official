const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { modelName, messages, max_tokens, temperature } = await request.json();

        // --- BỎ QUA CHECK CAPTCHA VÌ ĐÃ CÓ WAF ---

        const apiConfig = {
            'Mini': { key: env.MINI_API_KEY, model: 'openai/gpt-oss-20b:free' },
            'Smart': { key: env.SMART_API_KEY, model: 'kwaipilot/kat-coder-pro:free' },
            'Nerd': { key: env.NERD_API_KEY, model: 'x-ai/grok-4.1-fast:free' }
        };

        const config = apiConfig[modelName];
        if (!config || !config.key) {
            return new Response(
                JSON.stringify({ error: `Chưa cấu hình API Key cho model '${modelName}'.` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

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
                messages: messages,
                stream: true,
                max_tokens: max_tokens || 3000,
                temperature: temperature || 0.7
            }),
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return new Response(
                JSON.stringify({ error: 'Lỗi từ OpenRouter API', details: errText }),
                { status: apiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { readable, writable } = new TransformStream();
        apiResponse.body.pipeTo(writable);

        return new Response(readable, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Lỗi Server Cloudflare', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}
