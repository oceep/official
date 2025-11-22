// ============================================================
// HÀM GỌI API (Đã tối ưu cho Cloudflare Pages)
// ============================================================
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    const langPrompts = systemPrompts[currentLang] || systemPrompts['en'];
    const systemContent = isTutorMode ? langPrompts.tutor : langPrompts.assistant;
    const systemMessage = { role: 'system', content: systemContent };
    const messagesWithSystemPrompt = [systemMessage, ...messages];
    
    // --- URL CONFIGURATION ---
    // Khi deploy lên Cloudflare Pages, Backend và Frontend nằm cùng domain
    // nên ta chỉ cần gọi đường dẫn tương đối "/api/handler"
    
    // Tuy nhiên, nếu bạn chạy local (Live Server), bạn cần điền URL của Cloudflare Pages
    // Ví dụ: const DEV_API_URL = 'https://ten-du-an-cua-ban.pages.dev';
    
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';

    // Nếu đang chạy local, hãy thay chuỗi rỗng '' bên dưới bằng URL dự án Cloudflare của bạn sau khi deploy
    // Ví dụ: const CLOUDFLARE_URL = 'https://oceep-chat.pages.dev';
    const CLOUDFLARE_URL = ''; 

    const API_URL = isLocal 
        ? `${CLOUDFLARE_URL}/api/handler` // Gọi đến server thật khi đang test local
        : '/api/handler';                 // Gọi đường dẫn tương đối khi đã deploy

    console.log(`[System] Requesting: ${modelName} via ${API_URL}`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelName: modelName,
                messages: messagesWithSystemPrompt,
                max_tokens: 4000, // Cloudflare chịu tải tốt, cứ để cao
                temperature: 0.7  
            }),
            signal
        });

        if (!response.ok) {
            let errorMsg = `Server Error (${response.status})`;
            try {
                const errorBody = await response.text(); 
                try {
                    const errorData = JSON.parse(errorBody);
                    if (errorData.error) errorMsg = errorData.error;
                    if (errorData.details) errorMsg += ` - ${errorData.details}`;
                } catch (e) {
                    if (errorBody) errorMsg = errorBody.substring(0, 200);
                }
            } catch (e) {}
            throw new Error(errorMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponseText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonString = line.substring(6).trim();
                    if (jsonString === '[DONE]') break;
                    try {
                        const data = JSON.parse(jsonString);
                        const content = data.choices?.[0]?.delta?.content || "";
                        if (content) {
                            fullResponseText += content;
                            aiMessageEl.firstChild.innerHTML = formatAIResponse(fullResponseText);
                            
                            // Tự động cuộn xuống dưới cùng khi đang viết
                            const chatContainer = document.getElementById('chat-container');
                            if(chatContainer) {
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }
                        }
                    } catch (e) { }
                }
            }
        }
        return fullResponseText;

    } catch (error) {
        if (error.name === 'AbortError') return aiMessageEl.firstChild.innerText;
        
        console.error("Connection Error Details:", error);
        
        let userMsg = "Đã có lỗi xảy ra.";
        if (error.message.includes('Failed to fetch')) {
             userMsg = isLocal 
                ? "Lỗi kết nối. Nếu đang chạy Local, hãy chắc chắn bạn đã điền URL Cloudflare vào biến CLOUDFLARE_URL trong script.js." 
                : "Không thể kết nối đến Server.";
        } else {
            userMsg = `Lỗi: ${error.message}`;
        }
        
        aiMessageEl.firstChild.innerHTML = `<span class="text-red-400">${userMsg}</span>`;
        throw error;
    }
}
