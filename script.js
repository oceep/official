// --- State Management ---
const state = {
    sessions: JSON.parse(localStorage.getItem('oceep_sessions')) || [],
    currentSessionId: null,
    theme: localStorage.getItem('theme') || 'dark',
    isSearchEnabled: false,
    stagedImage: null,
    isStreaming: false
};

// --- DOM Elements ---
const els = {
    appBody: document.getElementById('app-body'),
    sidebar: document.getElementById('sidebar'),
    overlay: document.getElementById('sidebar-overlay'),
    sessionList: document.getElementById('session-list'),
    chatContainer: document.getElementById('chat-container'),
    messagesArea: document.getElementById('messages-area'),
    welcomeScreen: document.getElementById('welcome-screen'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    imagePreview: document.getElementById('image-preview'),
    previewImg: document.getElementById('preview-img'),
    fileUpload: document.getElementById('file-upload'),
    searchToggle: document.getElementById('search-toggle'),
    themeModal: document.getElementById('theme-modal'),
    scrollAnchor: document.getElementById('scroll-anchor')
};

// --- Initialization ---
function init() {
    marked.use(window.markedKatex); // Enable Math
    applyTheme(state.theme);
    
    if (state.sessions.length > 0) {
        loadSession(state.sessions[0].id);
    } else {
        createNewSession();
    }
    
    updateGreeting();
    renderSessionList();
}

// --- Theme Logic ---
function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('theme', theme);
    
    const body = els.appBody;
    const inputContainer = document.getElementById('input-container');
    
    // Reset classes
    body.className = "h-screen w-screen overflow-hidden flex transition-colors duration-500";
    body.style.backgroundImage = '';
    
    if (theme === 'light') {
        body.classList.add('bg-white', 'text-gray-900');
        inputContainer.className = "relative flex flex-col bg-white/80 border border-gray-300 backdrop-blur-lg rounded-[2rem] p-2 transition-colors duration-300";
        els.userInput.classList.replace('text-gray-200', 'text-gray-900');
        els.userInput.classList.replace('placeholder-gray-400', 'placeholder-gray-500');
    } else if (theme === 'ocean') {
        body.classList.add('bg-cover', 'bg-center', 'text-white');
        body.style.backgroundImage = "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop')";
        inputContainer.className = "relative flex flex-col bg-black/30 border border-white/20 backdrop-blur-lg rounded-[2rem] p-2 transition-colors duration-300";
        els.userInput.classList.replace('text-gray-900', 'text-gray-200');
    } else {
        // Dark
        body.classList.add('bg-gradient-to-br', 'from-[#212935]', 'to-black', 'text-gray-100');
        inputContainer.className = "relative flex flex-col bg-black/30 border border-white/20 backdrop-blur-lg rounded-[2rem] p-2 transition-colors duration-300";
        els.userInput.classList.replace('text-gray-900', 'text-gray-200');
    }
}

// --- Session Logic ---
function createNewSession() {
    const newSession = {
        id: crypto.randomUUID(),
        title: 'Cuộc trò chuyện mới',
        messages: [],
        createdAt: Date.now()
    };
    state.sessions.unshift(newSession);
    saveSessions();
    loadSession(newSession.id);
    if(window.innerWidth < 1024) toggleSidebar(false);
}

function loadSession(id) {
    state.currentSessionId = id;
    renderSessionList();
    renderMessages();
}

function saveSessions() {
    localStorage.setItem('oceep_sessions', JSON.stringify(state.sessions));
    renderSessionList();
}

function getCurrentSession() {
    return state.sessions.find(s => s.id === state.currentSessionId);
}

// --- Rendering ---
function renderSessionList() {
    els.sessionList.innerHTML = '';
    state.sessions.forEach(session => {
        const btn = document.createElement('button');
        const isActive = session.id === state.currentSessionId;
        btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-white/5'}`;
        btn.innerText = session.title;
        btn.onclick = () => loadSession(session.id);
        els.sessionList.appendChild(btn);
    });
}

function renderMessages() {
    const session = getCurrentSession();
    els.messagesArea.innerHTML = '';
    
    if (!session || session.messages.length === 0) {
        els.welcomeScreen.style.display = 'flex';
        els.messagesArea.style.display = 'none';
        return;
    }

    els.welcomeScreen.style.display = 'none';
    els.messagesArea.style.display = 'flex';

    session.messages.forEach(msg => appendMessageElement(msg));
    scrollToBottom();
}

function appendMessageElement(msg) {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `w-full flex ${isUser ? 'justify-end' : 'justify-start'} animate-pop-in`;
    wrapper.id = `msg-${msg.id}`;

    // Styling logic
    const bubbleBg = isUser ? 'bg-blue-600' : 'bg-transparent';
    const textColor = isUser ? 'text-white' : (state.theme === 'light' ? 'text-gray-900' : 'text-gray-100');
    const maxWidth = isUser ? 'max-w-[85%]' : 'max-w-[90%] lg:max-w-[80%]';

    let contentHtml = '';
    
    // Image
    if (msg.image) {
        contentHtml += `<img src="${msg.image}" class="mb-2 max-w-full h-auto max-h-64 rounded-lg border border-white/20">`;
    }

    // Text Content (Markdown)
    const parsedText = marked.parse(msg.content);
    contentHtml += `<div class="markdown-body ${textColor} ${msg.isStreaming ? 'cursor-blink' : ''}">${parsedText}</div>`;

    // Sources (Grounding)
    if (msg.groundingMetadata?.groundingChunks) {
        const sources = msg.groundingMetadata.groundingChunks
            .filter(c => c.web?.uri && c.web?.title)
            .map(c => `<a href="${c.web.uri}" target="_blank" class="source-pill">${c.web.title}</a>`)
            .join('');
        if (sources) {
            contentHtml += `<div class="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-2">${sources}</div>`;
        }
    }

    wrapper.innerHTML = `
        <div class="relative rounded-3xl px-5 py-3 flex flex-col gap-2 ${bubbleBg} ${maxWidth} shadow-sm">
            ${contentHtml}
        </div>
    `;

    els.messagesArea.appendChild(wrapper);
}

function updateMessageContent(msgId, newContent, isStreaming, meta) {
    const msgEl = document.querySelector(`#msg-${msgId} .markdown-body`);
    if (msgEl) {
        msgEl.innerHTML = marked.parse(newContent);
        if (isStreaming) msgEl.classList.add('cursor-blink');
        else msgEl.classList.remove('cursor-blink');
    }
    // Handle sources if meta exists (omitted for brevity, similar to append logic)
}

// --- Logic ---
async function handleSend() {
    const text = els.userInput.value.trim();
    if ((!text && !state.stagedImage) || state.isStreaming) return;

    const session = getCurrentSession();
    const userMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        image: state.stagedImage
    };

    // Update UI & State
    session.messages.push(userMsg);
    
    // Update title if first message
    if (session.messages.length === 1) {
        session.title = text.slice(0, 30) || "Image Chat";
        renderSessionList();
    }

    appendMessageElement(userMsg);
    els.userInput.value = '';
    els.userInput.style.height = 'auto';
    state.stagedImage = null;
    els.imagePreview.classList.add('hidden');
    scrollToBottom();

    // AI Placeholder
    const aiId = crypto.randomUUID();
    const aiMsg = { id: aiId, role: 'model', content: '', isStreaming: true };
    session.messages.push(aiMsg);
    appendMessageElement(aiMsg);
    
    state.isStreaming = true;
    let fullText = "";

    try {
        // Prepare Payload
        const payload = {
            history: session.messages.slice(0, -1), // Exclude the empty AI placeholder
            newMessage: userMsg.content,
            useSearch: state.isSearchEnabled,
            image: userMsg.image
        };

        // Call Handler (Proxy)
        // Note: In local dev, ensure handler.js is running or deployed.
        // Assuming handler is at /api/chat or similar relative path
        const response = await fetch('/api/chat', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // Parse Server-Sent Events or custom stream format
            // Our handler will send raw text chunks for simplicity or JSON lines
            // Let's assume JSON lines for metadata support
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.text) {
                        fullText += data.text;
                        updateMessageContent(aiId, fullText, true);
                    }
                    if (data.groundingMetadata) {
                        aiMsg.groundingMetadata = data.groundingMetadata;
                        // Re-render to show sources
                        document.getElementById(`msg-${aiId}`).remove();
                        aiMsg.content = fullText;
                        appendMessageElement(aiMsg); 
                    }
                } catch (e) {
                    // Fallback for plain text stream if JSON fails
                    // fullText += line;
                }
            }
            scrollToBottom();
        }

    } catch (err) {
        fullText += "\n[Lỗi kết nối hoặc API]";
        updateMessageContent(aiId, fullText, false);
    } finally {
        state.isStreaming = false;
        aiMsg.content = fullText;
        aiMsg.isStreaming = false;
        updateMessageContent(aiId, fullText, false);
        saveSessions();
    }
}

// --- Event Listeners ---
els.sendBtn.onclick = handleSend;
els.userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
    // Auto-resize
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
    els.searchToggle.classList.toggle('bg-blue-500/10', state.isSearchEnabled);
};

// Sidebar / Menu
document.getElementById('new-chat-btn').onclick = createNewSession;
document.getElementById('open-sidebar').onclick = () => toggleSidebar(true);
document.getElementById('close-sidebar').onclick = () => toggleSidebar(false);
els.overlay.onclick = () => toggleSidebar(false);

function toggleSidebar(open) {
    if (open) {
        els.sidebar.classList.remove('-translate-x-full');
        els.overlay.classList.remove('hidden');
    } else {
        els.sidebar.classList.add('-translate-x-full');
        els.overlay.classList.add('hidden');
    }
}

// Theme
document.getElementById('theme-btn').onclick = () => els.themeModal.classList.remove('hidden');
document.getElementById('close-theme').onclick = () => els.themeModal.classList.add('hidden');
document.querySelectorAll('.theme-option').forEach(btn => {
    btn.onclick = () => {
        applyTheme(btn.dataset.theme);
        els.themeModal.classList.add('hidden');
    };
});

function updateGreeting() {
    const hour = new Date().getHours();
    let text = 'Chào buổi sáng';
    if (hour >= 11) text = 'Chào buổi trưa';
    if (hour >= 14) text = 'Chào buổi chiều';
    if (hour >= 18) text = 'Chào buổi tối';
    document.getElementById('greeting-text').innerText = text;
}

function scrollToBottom() {
    els.scrollAnchor.scrollIntoView({ behavior: 'smooth' });
}

// Start
init();
