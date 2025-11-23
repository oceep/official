// =====================================================================
// CẤU HÌNH HỆ THỐNG
// =====================================================================
const config = {
    IS_INFINITE: true,           // true: Dùng vô hạn, false: Tính token
    MAX_TOKENS: 50,
    TOKEN_COST: 1,
    LANG_DEFAULT: 'vi',
    THEME_DEFAULT: 'dark',
    MODELS: [
        { id: 'Mini', name: 'Mini', desc: 'Nhanh & Hiệu quả', icon: '<path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />' },
        { id: 'Smart', name: 'Smart', desc: 'Cân bằng', icon: '<path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>' },
        { id: 'Nerd', name: 'Expert', desc: 'Thông minh nhất', icon: '<path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>' }
    ]
};

// =====================================================================
// PROMPTS (Cấu hình hành vi AI)
// =====================================================================
const coreInstructions = `
Quy tắc (TUÂN THỦ 100%):
1. **Toán học:** Dùng LaTeX chuẩn.
   - Inline: $...$
   - Block: $$...$$
   - KHÔNG DÙNG: \\(..\\) hoặc \\[..\\]
2. **Format:** Markdown (In đậm, List).
`;

const systemPrompts = {
    vi: { tutor: `Bạn là Oceep (Gia Sư). Hãy giải thích bản chất, gợi mở tư duy, dùng ví dụ thực tế.\n${coreInstructions}`, assistant: `Bạn là Oceep (Trợ Lý). Trả lời ngắn gọn, chính xác, trực diện.\n${coreInstructions}` },
    en: { tutor: `You are Oceep (Tutor). Explain concepts deeply using Socratic method.\n${coreInstructions}`, assistant: `You are Oceep (Assistant). Be precise and concise.\n${coreInstructions}` }
};

// =====================================================================
// KHỞI TẠO DOM ELEMENTS
// =====================================================================
const $ = (id) => document.getElementById(id);
const dom = {
    chatForm: $('chat-form'),
    msgInput: $('message-input'),
    chatBox: $('chat-container'),
    initialView: $('initial-view'),
    fileInput: $('file-input'),
    fileThumb: $('file-thumbnail-container'),
    mainTitle: $('main-title'),
    themeModal: $('theme-modal'),
    langModal: $('language-modal'),
    sidebar: $('sidebar'),
    btns: {
        send: $('send-button'), stop: $('stop-button'), sound: $('sound-wave-button'),
        theme: $('theme-menu-button'), lang: $('lang-switch-btn'), newChat: $('new-chat-header-btn'),
        toggleSide: $('sidebar-toggle'), random: $('random-prompt-icon-btn'),
        upload: $('upload-file-btn'), video: $('video-icon-btn'), learn: $('learn-icon-btn'), model: $('model-button')
    }
};

// State Variables
let currentModel = JSON.parse(localStorage.getItem('currentModel')) || config.MODELS[0];
let currentLang = localStorage.getItem('language') || config.LANG_DEFAULT;
let isTutorMode = localStorage.getItem('isTutorMode') === 'true';
let chatHistories = JSON.parse(localStorage.getItem('chatHistories')) || {};
let currentChatId = null;
let conversationHistory = [];
let abortController;
let stagedFile = null;

// =====================================================================
// XỬ LÝ SỰ KIỆN CHÍNH (SỬA LỖI REFRESH)
// =====================================================================

// Hàm xử lý gửi tin nhắn duy nhất
const handleSubmit = async (e) => {
    // 1. CHẶN LOAD TRANG (QUAN TRỌNG NHẤT)
    if (e) e.preventDefault();

    const txt = dom.msgInput.value.trim();
    if (!txt && !stagedFile) return;
    
    // UI Transitions
    dom.btns.send.classList.add('hidden');
    dom.btns.sound.classList.add('hidden');
    dom.btns.stop.classList.remove('hidden');
    dom.initialView.classList.add('hidden');
    dom.chatBox.classList.remove('hidden');
    $('mainContent').classList.remove('justify-center');

    // Add User Msg
    const content = stagedFile ? [{ type: 'text', text: txt }, { type: stagedFile.type === 'video' ? 'video_url' : 'image_url', [stagedFile.type === 'video' ? 'video_url' : 'image_url']: { url: stagedFile.url } }] : txt;
    appendMessage(content, 'user');
    conversationHistory.push({ role: 'user', content });

    // Reset Input
    dom.msgInput.value = '';
    stagedFile = null;
    dom.fileThumb.innerHTML = '';
    
    // Add AI Placeholder
    const aiBubble = appendMessage('', 'ai');
    aiBubble.classList.add('streaming');
    dom.chatBox.scrollTop = dom.chatBox.scrollHeight;

    abortController = new AbortController();

    try {
        const reply = await streamAI(currentModel.id, conversationHistory, aiBubble, abortController.signal);
        conversationHistory.push({ role: 'assistant', content: reply });
        saveChat();
    } catch (err) {
        if(err.name !== 'AbortError') console.error(err);
    } finally {
        // Cleanup UI
        aiBubble.classList.remove('streaming');
        // RE-RENDER MATH TO FIX LAYOUT
        const finalContent = conversationHistory[conversationHistory.length-1]?.content || aiBubble.innerText;
        aiBubble.innerHTML = formatText(finalContent);
        setTimeout(() => renderMath(aiBubble), 50);

        dom.btns.stop.classList.add('hidden');
        dom.btns.sound.classList.remove('hidden');
        dom.msgInput.focus();
    }
};

// Gắn sự kiện (Event Listener)
dom.chatForm.addEventListener('submit', handleSubmit);
dom.msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(null);
    }
});
dom.btns.send.addEventListener('click', (e) => {
    e.preventDefault(); // Chặn hành vi mặc định của nút submit
    handleSubmit(null);
});


// =====================================================================
// SMART BUFFER STREAMING (Xử lý kết nối & Chữ)
// =====================================================================
async function streamAI(model, msgs, el, signal) {
    const promptConfig = systemPrompts[currentLang] || systemPrompts['en'];
    const systemMsg = { role: 'system', content: isTutorMode ? promptConfig.tutor : promptConfig.assistant };
    
    // URL LOCAL HOẶC CLOUDFLARE
    const isLocal = location.hostname.includes('local') || location.protocol === 'file:';
    const ENDPOINT = isLocal ? 'YOUR_CLOUDFLARE_URL_HERE/api/handler' : '/api/handler'; // Điền URL nếu test local
    // Mặc định fallback tốt cho deploy: '/api/handler'
    
    const res = await fetch(ENDPOINT.startsWith('YOUR') ? '/api/handler' : ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: model, messages: [systemMsg, ...msgs], max_tokens: 4000, temperature: 0.7 }),
        signal
    });

    if (!res.ok) throw new Error("API Error");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Giữ lại dòng dở dang

        for (const line of lines) {
            const str = line.trim();
            if (str.startsWith('data: ')) {
                const json = str.slice(6).trim();
                if (json === '[DONE]') break;
                try {
                    const parsed = JSON.parse(json);
                    const chunk = parsed.choices?.[0]?.delta?.content || "";
                    if (chunk) {
                        text += chunk;
                        el.innerHTML = formatText(text);
                        dom.chatBox.scrollTop = dom.chatBox.scrollHeight;
                    }
                } catch (e) {}
            }
        }
    }
    return text;
}

// =====================================================================
// UI UTILS (Hiển thị)
// =====================================================================
function formatText(txt) {
    if(!txt) return '';
    let f = txt.replace(/^##\s+(.*)$/gm, '<h3 class="text-lg font-bold text-blue-400 mt-2 border-b border-gray-600/30">$1</h3>')
               .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
               .replace(/\n/g, '<br>');
    return f;
}

function appendMessage(content, role) {
    const wrap = document.createElement('div');
    wrap.className = `flex w-full mb-4 ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const bubble = document.createElement('div');
    // Style logic rút gọn
    const theme = getCurrentThemeColors();
    bubble.className = `max-w-[85%] rounded-2xl px-5 py-3 shadow-md animate-pop-in ${role === 'user' ? theme.user : theme.ai}`;
    
    if (typeof content === 'string') bubble.innerHTML = formatText(content);
    else {
        // Media rendering
        content.forEach(c => {
            if(c.text) bubble.innerHTML += `<div>${formatText(c.text)}</div>`;
            if(c.image_url) bubble.innerHTML += `<img src="${c.image_url.url}" class="rounded-lg max-w-xs mt-2"/>`;
            if(c.video_url) bubble.innerHTML += `<video src="${c.video_url.url}" controls class="rounded-lg max-w-xs mt-2"/>`;
        });
    }
    wrap.appendChild(bubble);
    dom.chatBox.appendChild(wrap);
    return bubble;
}

function renderMath(el) {
    if (window.renderMathInElement) renderMathInElement(el, {
        delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
        throwOnError: false
    });
}

// =====================================================================
// LOGIC GIAO DIỆN (Themes, History, Upload)
// =====================================================================
function getCurrentThemeColors() {
    const t = localStorage.getItem('theme') || 'dark';
    if(t === 'light') return { user: 'bg-blue-500 text-white', ai: 'bg-gray-100 text-black border border-gray-200' };
    return { user: 'bg-blue-600 text-white', ai: 'bg-white/10 text-gray-100 backdrop-blur-sm' };
}

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    dom.chatBox.innerHTML = '';
    dom.initialView.classList.remove('hidden');
    dom.chatBox.classList.add('hidden');
    $('mainContent').classList.add('justify-center');
    
    renderHistory();
    saveChat();
    dom.msgInput.focus();
}

function saveChat() {
    if(chatHistories[currentChatId] && chatHistories[currentChatId].length === 0) delete chatHistories[currentChatId];
    localStorage.setItem('chatHistories', JSON.stringify(chatHistories));
}

function renderHistory() {
    $('history-list').innerHTML = '';
    Object.keys(chatHistories).sort().reverse().forEach(id => {
        if(id === currentChatId && chatHistories[id].length === 0) return;
        
        const first = chatHistories[id][0]?.content || "Chat Mới";
        const preview = typeof first === 'string' ? first : '[File]';
        
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-sm text-gray-200 transition";
        if(id === currentChatId) div.classList.add('bg-blue-600/30');
        div.innerHTML = `<span class="truncate w-4/5">${preview}</span> <span class="text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 text-lg px-1" onclick="deleteChat(event, '${id}')">&times;</span>`;
        div.onclick = () => loadChat(id);
        $('history-list').appendChild(div);
    });
}

window.deleteChat = (e, id) => {
    e.stopPropagation();
    delete chatHistories[id];
    saveChat();
    if(id === currentChatId) startNewChat();
    else renderHistory();
};

function loadChat(id) {
    currentChatId = id;
    conversationHistory = chatHistories[id] || [];
    dom.chatBox.innerHTML = '';
    
    if (conversationHistory.length) {
        dom.initialView.classList.add('hidden');
        dom.chatBox.classList.remove('hidden');
        $('mainContent').classList.remove('justify-center');
        conversationHistory.forEach(m => appendMessage(m.content, m.role));
        renderMath(dom.chatBox);
    } else startNewChat();
    renderHistory();
}

// =====================================================================
// INIT & EVENT HANDLERS
// =====================================================================
dom.btns.upload.onclick = () => dom.fileInput.click();
dom.fileInput.onchange = (e) => {
    const f = e.target.files[0];
    if(f) {
        const type = f.type.startsWith('video') ? 'video' : 'image';
        const url = URL.createObjectURL(f);
        stagedFile = { file: f, url, type };
        dom.fileThumb.innerHTML = `<div class="relative inline-block mt-2"><${type} src="${url}" class="h-16 rounded border border-gray-600" ${type==='video'?'autoplay muted':''}></${type}><button class="absolute -top-2 -right-2 bg-red-500 rounded-full w-5 h-5 text-xs text-white" onclick="this.parentElement.remove(); stagedFile=null;">×</button></div>`;
    }
};

dom.btns.random.onclick = () => {
    const prompts = ["Kể chuyện cười", "Tóm tắt sách hay", "Công thức toán học Euler", "Code HTML cơ bản"];
    dom.msgInput.value = prompts[Math.floor(Math.random() * prompts.length)];
    handleSubmit(null);
};

dom.msgInput.oninput = () => {
    const hasText = dom.msgInput.value.trim().length > 0;
    dom.btns.sound.classList.toggle('hidden', hasText);
    dom.btns.send.classList.toggle('hidden', !hasText);
};

// Toggle Sidebar
dom.btns.toggleSide.onclick = () => dom.sidebar.classList.toggle('-translate-x-full');
dom.btns.toggleSide.onclick = () => dom.sidebar.classList.toggle('hidden');

// Init Logic
window.addEventListener('DOMContentLoaded', () => {
    let usage = parseInt(localStorage.getItem('usage') || '0') + 1;
    if(usage > 5 && !sessionStorage.getItem('verified')) { /* Verify Logic Here if needed */ }
    localStorage.setItem('usage', usage);
    
    applyTheme(localStorage.getItem('theme') || config.THEME_DEFAULT);
    startNewChat();
    updateModelText();
});

// Theme & Modal Handling Simplified
const showModal = (el, show) => el.classList.toggle('hidden', !show);
dom.btns.theme.onclick = () => showModal(dom.themeModal, true);
$('close-modal-button').onclick = () => showModal(dom.themeModal, false);
document.querySelectorAll('.theme-option').forEach(b => b.onclick = () => {
    applyTheme(b.dataset.theme);
    showModal(dom.themeModal, false);
});

function applyTheme(theme) {
    body.className = "flex flex-col h-screen overflow-hidden text-gray-100 transition-colors duration-500 " + (themeColors[theme]?.bg?.join(' ') || "");
    localStorage.setItem('theme', theme);
    // Background Image handling logic here if needed
}

// Model & Feature Toggles
dom.btns.model.onclick = (e) => { e.stopPropagation(); $('model-popup').classList.toggle('hidden'); };
function updateModelText() { $('model-button-text-display').innerText = currentModel.name; }
dom.btns.video.onclick = () => alert("Sắp ra mắt!");
dom.btns.learn.onclick = () => {
    isTutorMode = !isTutorMode;
    localStorage.setItem('isTutorMode', isTutorMode);
    dom.btns.learn.querySelector('svg').style.fill = isTutorMode ? 'currentColor' : 'none';
};
