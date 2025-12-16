// --- Cấu hình ---
const API_URL = 'http://localhost:3000/api/chat'; // Địa chỉ của handler.js

const state = {
    sessions: JSON.parse(localStorage.getItem('oceep_sessions')) || [],
    currentSessionId: null,
    isSearchEnabled: false,
    stagedImage: null,
    isStreaming: false
};

const els = {
    messagesArea: document.getElementById('messages-area'),
    welcomeScreen: document.getElementById('welcome-screen'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    imagePreview: document.getElementById('image-preview'),
    previewImg: document.getElementById('preview-img'),
    fileUpload: document.getElementById('file-upload'),
    searchToggle: document.getElementById('search-toggle'),
    scrollAnchor: document.getElementById('scroll-anchor'),
    sessionList: document.getElementById('session-list')
};

function init() {
    if (window.markedKatex) marked.use(window.markedKatex);
    if (state.sessions.length === 0) createNewSession();
    else loadSession(state.sessions[0].id);
    renderSessionList();
}

function createNewSession() {
    const newSession = { id: crypto.randomUUID(), title: 'Đoạn chat mới', messages: [] };
    state.sessions.unshift(newSession);
    loadSession(newSession.id);
    saveSessions();
}

function loadSession(id) {
    state.currentSessionId = id;
    renderMessages();
    renderSessionList();
}

function saveSessions() {
    localStorage.setItem('oceep_sessions', JSON.stringify(state.sessions));
    renderSessionList();
}

function renderSessionList() {
    els.sessionList.innerHTML = '';
    state.sessions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm truncate ${s.id === state.currentSessionId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-white/5'}`;
        btn.innerText = s.title;
        btn.onclick = () => loadSession(s.id);
        els.sessionList.appendChild(btn);
    });
}

function renderMessages() {
    const session = state.sessions.find(s => s.id === state.currentSessionId);
    els.messagesArea.innerHTML = '';
    if (!session || session.messages.length === 0) {
        els.welcomeScreen.classList.remove('hidden');
        els.messagesArea.classList.add('hidden');
    } else {
        els.welcomeScreen.classList.add('hidden');
        els.messagesArea.classList.remove('hidden');
        session.messages.forEach(msg => appendMessageElement(msg));
        scrollToBottom();
    }
}

function appendMessageElement(msg) {
    const isUser = msg.role === 'user';
    const div = document.createElement('div');
    div.className = `w-full flex ${isUser ? 'justify-end' : 'justify-start'} animate-pop-in`;
    div.id = `msg-${msg.id}`;
    
    let content = '';
    if (msg.image) content += `<img src="${msg.image}" class="mb-2 max-h-64 rounded-lg border border-white/20">`;
    content += `<div class="markdown-body ${isUser ? 'text-white' : 'text-gray-100'} ${msg.isStreaming ? 'cursor-blink' : ''}">${marked.parse(msg.content)}</div>`;
    
    // Nguồn (Sources)
    if (msg.sources && msg.sources.length > 0) {
        const pills = msg.sources.map(s => `<a href="${s.uri}" target="_blank" class="inline-block bg-gray-800 text-xs px-2 py-1 rounded-full mr-1 mt-2 hover:bg-blue-600 transition-colors border border-gray-700 no-underline text-gray-300">${s.title}</a>`).join('');
        content += `<div class="mt-2 pt-2 border-t border-white/10 flex flex-wrap">${pills}</div>`;
    }

    div.innerHTML = `<div class="relative rounded-3xl px-5 py-3 flex flex-col gap-2 max-w-[85%] ${isUser ? 'bg-blue-600' : 'bg-transparent'} shadow-sm">${content}</div>`;
    els.messagesArea.appendChild(div);
}

function updateMessageContent(id, text, isStreaming, sources) {
    const el = document.querySelector(`#msg-${id} .markdown-body`);
    if (el) {
        el.innerHTML = marked.parse(text);
        if (isStreaming) el.classList.add('cursor-blink');
        else el.classList.remove('cursor-blink');
    }
    // Cập nhật nguồn nếu có (logic đơn giản hóa)
    if (sources && sources.length > 0 && !document.querySelector(`#msg-${id} a`)) {
         // Re-render message for simplicity to show sources
         // (Trong thực tế nên dùng DOM manipulation để thêm div sources)
    }
}

async function handleSend() {
    const text = els.userInput.value.trim();
    if ((!text && !state.stagedImage) || state.isStreaming) return;

    const session = state.sessions.find(s => s.id === state.currentSessionId);
    
    // Tin nhắn User
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: text, image: state.stagedImage };
    session.messages.push(userMsg);
    appendMessageElement(userMsg);
    
    // Reset UI
    els.userInput.value = '';
    els.imagePreview.classList.add('hidden');
    state.stagedImage = null;
    if (session.messages.length === 1) session.title = text.slice(0, 30);
    renderSessionList();
    
    // Tin nhắn AI (Placeholder)
    const aiId = crypto.randomUUID();
    const aiMsg = { id: aiId, role: 'model', content: '', isStreaming: true };
    session.messages.push(aiMsg);
    appendMessageElement(aiMsg);
    scrollToBottom();

    state.isStreaming = true;
    let fullText = "";
    let sources = [];

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: session.messages.slice(0, -1),
                newMessage: userMsg.content,
                image: userMsg.image,
                useSearch: state.isSearchEnabled
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.text) {
                        fullText += data.text;
                        updateMessageContent(aiId, fullText, true);
                    }
                    if (data.sources) {
                        sources = data.sources;
                        aiMsg.sources = sources; // Lưu nguồn
                    }
                } catch (e) { console.error("Parse error", e); }
            }
            scrollToBottom();
        }
    } catch (err) {
        fullText += "\n[Lỗi kết nối đến Server. Hãy đảm bảo bạn đã chạy 'node handler.js']";
    } finally {
        state.isStreaming = false;
        aiMsg.content = fullText;
        aiMsg.isStreaming = false;
        updateMessageContent(aiId, fullText, false, sources);
        saveSessions();
    }
}

// Event Listeners
els.sendBtn.onclick = handleSend;
els.userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
};
els.fileUpload.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            state.stagedImage = ev.target.result;
            els.previewImg.src = state.stagedImage;
            els.imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
};
document.getElementById('remove-img').onclick = () => {
    state.stagedImage = null;
    els.fileUpload.value = '';
    els.imagePreview.classList.add('hidden');
};
els.searchToggle.onclick = () => {
    state.isSearchEnabled = !state.isSearchEnabled;
    els.searchToggle.classList.toggle('text-blue-500', state.isSearchEnabled);
};
document.getElementById('open-sidebar').onclick = () => { els.sessionList.parentElement.classList.remove('-translate-x-full'); document.getElementById('sidebar-overlay').classList.remove('hidden'); };
document.getElementById('close-sidebar').onclick = () => { els.sessionList.parentElement.classList.add('-translate-x-full'); document.getElementById('sidebar-overlay').classList.add('hidden'); };
document.getElementById('new-chat-btn').onclick = createNewSession;
function scrollToBottom() { els.scrollAnchor.scrollIntoView({ behavior: 'smooth' }); }

init();
