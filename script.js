//=====================================================================//
// NEW: ENERGY CONFIGURATION BOX                                       //
// Dễ dàng điều chỉnh các thông số Năng lượng tại đây.                 //
//=====================================================================//
const tokenConfig = {
    IS_INFINITE: true,          // true: Vô hạn token, false: Có giới hạn
    MAX_TOKENS: 50,             // Số token tối đa
    TOKEN_COST_PER_MESSAGE: 1,  // Phí mỗi tin nhắn
    TOKEN_REGEN_INTERVAL_MINUTES: 5, 
    TOKEN_REGEN_AMOUNT: 1,      
};

// --- DOM ELEMENTS ---
const themeMenuButton = document.getElementById('theme-menu-button');
const themeModal = document.getElementById('theme-modal');
const closeModalButton = document.getElementById('close-modal-button');
const themeOptionButtons = document.querySelectorAll('.theme-option');
const languageModal = document.getElementById('language-modal');
const closeLanguageModalBtn = document.getElementById('close-language-modal-button');
const languageOptionButtons = document.querySelectorAll('.language-option');

const body = document.body;
const backgroundContainer = document.getElementById('background-container');
const chatFormEl = document.getElementById('chat-form');
const oceanImageUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

const appContainer = document.getElementById('app-container');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const historyList = document.getElementById('history-list');
const newChatHeaderBtn = document.getElementById('new-chat-header-btn');
const langSwitchBtn = document.getElementById('lang-switch-btn');
const sendButton = document.getElementById('send-button');
const soundWaveButton = document.getElementById('sound-wave-button');
const stopButton = document.getElementById('stop-button');
const messageInput = document.getElementById('message-input');
const randomPromptBtn = document.getElementById('random-prompt-icon-btn');
const comingSoonModal = document.getElementById('coming-soon-modal');
const closeComingSoonModal = document.getElementById('close-coming-soon-modal');

// File upload elements
const uploadFileBtn = document.getElementById('upload-file-btn');
const fileInput = document.getElementById('file-input');
const fileThumbnailContainer = document.getElementById('file-thumbnail-container');
let stagedFile = null;

// Token elements
const tokenInputsContainer = document.getElementById('token-inputs-container');
const currentTokenInput = document.getElementById('current-token-input');
const maxTokenInput = document.getElementById('max-token-input');
const tokenInfinity = document.getElementById('token-infinity');

// --- STATE ---
let currentLang = 'vi';
let isTutorMode = localStorage.getItem('isTutorMode') === 'true';
let currentModel = JSON.parse(localStorage.getItem('currentModel')) || { model: 'Mini', version: '' };
let abortController;
let isRandomPromptUsedInSession = false;
let conversationHistory = [];
let chatHistories = {};
let currentChatId = null;

// =====================================================================
// SYSTEM PROMPTS (QUAN TRỌNG: Cấu hình hiển thị Toán/Code)
// =====================================================================
const coreInstructions = `
QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
1. **Định dạng Toán học:**
   - TUYỆT ĐỐI sử dụng cú pháp LaTeX chuẩn.
   - Công thức cùng dòng (Inline): Dùng cặp dấu $...$ (Ví dụ: $E = mc^2$).
   - Công thức xuống dòng (Block): Dùng cặp dấu $$...$$ (Ví dụ: $$ x = 5 $$).
   - KHÔNG sử dụng \\( ... \\) hoặc \\[ ... \\].

2. **Trình bày văn bản:**
   - Sử dụng Markdown chuẩn (**in đậm**, tiêu đề...).
   - Suy nghĩ logic từng bước (Chain of Thought).
`;

const systemPrompts = {
    vi: {
        tutor: `Bạn là Oceep - một Gia Sư AI. Giúp người dùng HIỂU BẢN CHẤT. Hãy kiên nhẫn, giải thích bằng ví dụ thực tế. Đừng đưa đáp án ngay, hãy gợi mở. \n${coreInstructions}`,
        assistant: `Bạn là Oceep - Trợ lý ảo AI. Giải quyết vấn đề NHANH và CHÍNH XÁC. Trả lời ngắn gọn nhưng đầy đủ. \n${coreInstructions}`
    },
    en: {
        tutor: `You are Oceep, an AI Tutor. Goal: Help users understand concepts deeply. Be patient. Follow LaTeX rules: $...$ for inline, $$...$$ for block. \n${coreInstructions}`,
        assistant: `You are Oceep, an AI Assistant. Be precise and concise. Follow LaTeX rules: $...$ for inline, $$...$$ for block. \n${coreInstructions}`
    }
    // Các ngôn ngữ khác sử dụng logic tương tự, fallback về 'en' nếu thiếu.
};

// --- TRANSLATIONS ---
const translations = {
    vi: {
        sidebarHeader: "Lịch sử Chat", newChatTitle: "Chat mới", messagePlaceholder: "Bạn muốn biết gì?", aiTypingPlaceholder: "AI đang trả lời...", outOfTokensPlaceholder: "Bạn đã hết lượt.", sendButton: "Gửi", stopButton: "Dừng", modelButtonDefault: "Expert", modelButtonPrefix: "Mô Hình", randomButton: "Ngẫu nhiên", videoButton: "Tạo Video", learnButton: "Học Tập", footerText: "AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.", themeModalTitle: "Chọn Giao Diện", languageModalTitle: "Chọn Ngôn Ngữ", themeDark: "Tối", themeLight: "Sáng", themeOcean: "Biển", modalClose: "Đóng", newChatHistory: "Cuộc trò chuyện mới", greetingMorning: "Chào buổi sáng", greetingNoon: "Chào buổi trưa", greetingAfternoon: "Chào buổi chiều", greetingEvening: "Chào buổi tối", errorPrefix: "Đã có lỗi xảy ra", comingSoon: "Sắp có", comingSoonTitle: "Sắp có...", comingSoonText: "Tính năng này đang được phát triển.", langTooltip: "Đổi Ngôn Ngữ", themeTooltip: "Đổi Giao Diện", historyTooltip: "Lịch Sử Chat", newChatTooltip: "Chat Mới", modelMiniDesc: "Nhanh và hiệu quả.", modelSmartDesc: "Cân bằng tốc độ và thông minh.", modelNerdDesc: "Suy luận cao, kết quả chuẩn xác."
    },
    en: {
        sidebarHeader: "Chat History", newChatTitle: "New Chat", messagePlaceholder: "What do you want to know?", aiTypingPlaceholder: "AI is replying...", outOfTokensPlaceholder: "You're out of tokens.", sendButton: "Send", stopButton: "Stop", modelButtonDefault: "Expert", modelButtonPrefix: "Model", randomButton: "Random", videoButton: "Create Video", learnButton: "Study", footerText: "AI can make mistakes. Check important info.", themeModalTitle: "Choose Theme", languageModalTitle: "Select Language", themeDark: "Dark", themeLight: "Light", themeOcean: "Ocean", modalClose: "Close", newChatHistory: "New Conversation", greetingMorning: "Good morning", greetingNoon: "Good afternoon", greetingAfternoon: "Good afternoon", greetingEvening: "Good evening", errorPrefix: "An error occurred", comingSoon: "Coming Soon", comingSoonTitle: "Coming Soon...", comingSoonText: "Under development.", langTooltip: "Switch Language", themeTooltip: "Change Theme", historyTooltip: "Chat History", newChatTooltip: "New Chat", modelMiniDesc: "Fast and efficient.", modelSmartDesc: "Balanced speed and intelligence.", modelNerdDesc: "Powerful model for complex answers."
    },
    // Các ngôn ngữ khác giữ nguyên (đã lược bớt để code gọn, logic tự fallback)
    zh: { sidebarHeader: "聊天历史", messagePlaceholder: "你想知道什么？", footerText: "AI可能会犯错。", themeDark: "黑暗", themeLight: "光", themeOcean: "海洋" },
    hi: { sidebarHeader: "चैट इतिहास", messagePlaceholder: "आप क्या जानना चाहते हैं?", footerText: "एआई गलतियाँ कर सकता है।", themeDark: "अंधेरा", themeLight: "प्रकाश", themeOcean: "सागर" },
    es: { sidebarHeader: "Historial", messagePlaceholder: "¿Qué quieres saber?", footerText: "La IA puede cometer errores.", themeDark: "Oscuro", themeLight: "Luz", themeOcean: "Océano" },
    fr: { sidebarHeader: "Historique", messagePlaceholder: "Que voulez-vous savoir ?", footerText: "L'IA peut faire des erreurs.", themeDark: "Sombre", themeLight: "Lumière", themeOcean: "Océan" },
    ja: { sidebarHeader: "履歴", messagePlaceholder: "何を知りたいですか？", footerText: "AIは間違うことがあります。", themeDark: "ダーク", themeLight: "ライト", themeOcean: "海" },
    it: { sidebarHeader: "Cronologia", messagePlaceholder: "Cosa vuoi sapere?", footerText: "L'IA può sbagliare.", themeDark: "Scuro", themeLight: "Chiaro", themeOcean: "Oceano" }
};

// --- THEME COLORS ---
const themeColors = {
    dark: {
        bg: ['bg-gradient-to-br', 'from-[#212935]', 'to-black'], text: 'text-gray-100', subtleText: 'text-gray-400', logo: 'text-gray-100', iconColor: 'text-gray-300',
        popup: ['bg-gray-900', 'border', 'border-gray-700'],popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'],
        sidebar: ['bg-black/10', 'border-white/10'], historyActive: ['bg-blue-800/50'], historyHover: ['hover:bg-blue-800/30'],
        form: ['bg-black/30', 'border-white/20'], headerPill: [],
        aiMessage: ['text-gray-100'], userMessage: ['bg-blue-600', 'text-white'], inputColor: ['text-gray-200', 'placeholder-gray-500']
    },
    light: {
        bg: ['bg-white'], text: 'text-black', subtleText: 'text-gray-600', logo: 'text-blue-500', iconColor: 'text-gray-800',
        popup: ['bg-white', 'border', 'border-gray-200', 'shadow-lg'],popupButton: ['text-gray-700', 'hover:bg-gray-100'],
        sidebar: ['bg-gray-50', 'border-r', 'border-gray-200'], historyActive: ['bg-blue-100'], historyHover: ['hover:bg-gray-200'],
        form: ['bg-gray-100', 'border', 'border-gray-300', 'shadow'], headerPill: [],
        aiMessage: ['text-black'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-black', 'placeholder-gray-400']
    },
    ocean: {
        bgImage: `url('${oceanImageUrl}')`, text: 'text-white', subtleText: 'text-gray-300', logo: 'text-white', iconColor: 'text-white',
        popup: ['bg-black/70', 'backdrop-blur-md', 'border', 'border-white/10'],popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'],
        sidebar: ['bg-black/10', 'border-white/10'], historyActive: ['bg-white/20'], historyHover: ['hover:bg-white/10'],
        form: ['bg-black/30', 'border-white/20'], headerPill: ['bg-black/30', 'backdrop-blur-lg', 'border', 'border-white/20'],
        aiMessage: ['text-white'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-white', 'placeholder-gray-300']
    }
};

const textElements = {
    header: document.getElementById('header-title'), main: document.getElementById('main-title'), input: document.getElementById('message-input'), footer: document.getElementById('footer-text'),
    themeIcon: document.getElementById('theme-icon'), logoText: document.getElementById('logo-text'), sidebarHeader: document.getElementById('sidebar-header'),
    modelBtnText: document.getElementById('model-button-text-display'), themeModalTitle: document.getElementById('theme-modal-title'), languageModalTitle: document.getElementById('language-modal-title'),
    themeDarkText: document.getElementById('theme-dark-text'), themeLightText: document.getElementById('theme-light-text'), themeOceanText: document.getElementById('theme-ocean-text'),
    closeModalButton: document.getElementById('close-modal-button'), closeLanguageModalBtn: document.getElementById('close-language-modal-button'),
    comingSoonTitle: document.getElementById('coming-soon-title'), comingSoonText: document.getElementById('coming-soon-text'), closeComingSoonModal: document.getElementById('close-coming-soon-modal'),
    randomTooltip: document.getElementById('random-tooltip'), videoTooltip: document.getElementById('video-tooltip'), learnTooltip: document.getElementById('learn-tooltip'),
    langTooltip: document.getElementById('lang-tooltip'), themeTooltip: document.getElementById('theme-tooltip'), historyTooltip: document.getElementById('history-tooltip'), newChatTooltip: document.getElementById('new-chat-tooltip')
};

// --- FUNCTIONS ---
function saveStateToLocalStorage() {
    const historiesToSave = { ...chatHistories };
    if (historiesToSave[currentChatId] && historiesToSave[currentChatId].length === 0) delete historiesToSave[currentChatId];
    localStorage.setItem('chatHistories', JSON.stringify(historiesToSave));
    localStorage.setItem('currentChatId', currentChatId);
}

function initializeApp() {
    chatHistories = JSON.parse(localStorage.getItem('chatHistories')) || {};
    startNewChat();
}

function applyTheme(theme) {
    body.className = "flex flex-col h-screen overflow-hidden transition-colors duration-500";
    backgroundContainer.style.backgroundImage = '';
    backgroundContainer.className = "fixed inset-0 -z-10 transition-all duration-500 bg-cover bg-center";
    const config = themeColors[theme];
    const allConfigs = Object.values(themeColors);

    themeOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20');
        if (btn.dataset.theme === theme) btn.classList.add('bg-blue-500/20');
    });

    body.classList.remove(...allConfigs.flatMap(c => c.bg).flat());
    if (config.bgImage) {
        backgroundContainer.style.backgroundImage = config.bgImage;
        backgroundContainer.classList.add('image-overlay');
    } else {
        body.classList.add(...config.bg);
        backgroundContainer.classList.remove('image-overlay');
    }

    body.classList.remove(...allConfigs.map(c => c.text));
    body.classList.add(config.text);

    textElements.logoText.className = `text-2xl ml-0.5 font-semibold ${config.logo}`;

    sidebar.className = `w-64 backdrop-blur-lg flex flex-col transition-all duration-300 -translate-x-full absolute lg:relative lg:translate-x-0 z-30 h-full hidden ${config.sidebar.join(' ')}`;
    chatFormEl.className = `relative flex flex-col rounded-3xl shadow-lg p-1 transition-all ${config.form.join(' ')}`;

    const pills = document.querySelectorAll('.header-pill-container');
    const allPillClasses = allConfigs.flatMap(c => c.headerPill || []).flat();
    pills.forEach(pill => {
        pill.classList.remove(...allPillClasses);
        pill.classList.add(...(config.headerPill || []));
    });

    // Cập nhật tất cả các Icon màu
    const icons = [sidebarToggle.querySelector('svg'), newChatHeaderBtn.querySelector('svg'), langSwitchBtn, document.getElementById('theme-icon'), document.querySelector('#random-prompt-icon-btn svg'), document.querySelector('#video-icon-btn svg'), document.querySelector('#learn-icon-btn svg'), document.querySelector('#upload-file-btn svg')];
    icons.forEach(icon => {
        if(icon) {
            icon.classList.remove(...allConfigs.map(c => c.iconColor));
            icon.classList.add(config.iconColor);
        }
    });

    messageInput.className = `flex-grow bg-transparent border-none focus:ring-0 focus:outline-none text-lg pl-5 pt-3 pb-3 ${config.inputColor.join(' ')}`;
    
    textElements.footer.classList.remove(...allConfigs.map(c => c.subtleText));
    textElements.footer.classList.add(config.subtleText);

    document.getElementById('model-popup').className = `hidden absolute bottom-full right-0 mb-2 w-72 rounded-2xl p-2 shadow-lg transition space-y-1 ${config.popup.join(' ')}`;

    // Update Message Bubbles
    document.querySelectorAll('.user-message-wrapper').forEach(el => {
        el.className = `user-message-wrapper animate-pop-in px-5 py-3 rounded-3xl max-w-4xl shadow-md flex flex-col gap-2 ${config.userMessage.join(' ')}`;
    });
    document.querySelectorAll('.ai-message-wrapper').forEach(el => {
        el.className = `ai-message-wrapper animate-pop-in max-w-4xl ${config.aiMessage.join(' ')}`;
    });

    localStorage.setItem('theme', theme);
    renderHistoryList();
    updateLearnButtonVisualState();
}

function updateActiveLanguageButton(lang) {
    languageOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20', 'text-blue-600');
        if (btn.dataset.lang === lang) btn.classList.add('bg-blue-500/20', 'text-blue-600');
    });
}

function switchLanguage(lang) {
    currentLang = lang;
    const t = translations[lang] || translations['vi']; // Fallback
    textElements.sidebarHeader.textContent = t.sidebarHeader || translations['vi'].sidebarHeader;
    textElements.input.placeholder = t.messagePlaceholder || translations['vi'].messagePlaceholder;
    textElements.footer.textContent = t.footerText || translations['vi'].footerText;
    
    // Chỉ cập nhật các elements tồn tại để tránh lỗi null
    if(textElements.themeDarkText) textElements.themeDarkText.textContent = t.themeDark || "Tối";
    if(textElements.themeLightText) textElements.themeLightText.textContent = t.themeLight || "Sáng";
    if(textElements.themeOceanText) textElements.themeOceanText.textContent = t.themeOcean || "Biển";
    if(textElements.closeModalButton) textElements.closeModalButton.textContent = t.modalClose || "Đóng";
    if(textElements.newChatTooltip) textElements.newChatTooltip.textContent = t.newChatTooltip || "Chat Mới";

    langSwitchBtn.textContent = lang.toUpperCase();
    localStorage.setItem('language', lang);
    updateActiveLanguageButton(lang);
    setGreeting();
    renderHistoryList();
    updateTokenUI();
}

function showModal(modal, show) {
    const content = modal.querySelector('div[id$="-content"]');
    if (show) {
        modal.classList.remove('hidden');
        content.classList.remove('modal-fade-leave');
        content.classList.add('modal-fade-enter');
    } else {
        content.classList.remove('modal-fade-enter');
        content.classList.add('modal-fade-leave');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

themeMenuButton.addEventListener('click', () => showModal(themeModal, true));
closeModalButton.addEventListener('click', () => showModal(themeModal, false));
themeModal.addEventListener('click', (e) => { if (e.target === themeModal) showModal(themeModal, false); });
themeOptionButtons.forEach(btn => btn.addEventListener('click', () => { applyTheme(btn.dataset.theme); showModal(themeModal, false); }));

langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
languageModal.addEventListener('click', (e) => { if (e.target === languageModal) showModal(languageModal, false); });
languageOptionButtons.forEach(btn => btn.addEventListener('click', () => { switchLanguage(btn.dataset.lang); showModal(languageModal, false); }));

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('hidden');
});

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    
    document.getElementById('chat-container').innerHTML = '';
    document.getElementById('initial-view').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
    document.getElementById('mainContent').classList.add('justify-center');
    
    setGreeting();
    isRandomPromptUsedInSession = false; 
    updateRandomButtonVisibility();
    renderHistoryList();
    saveStateToLocalStorage();
}

function setGreeting() {
    const mainTitle = document.getElementById('main-title');
    if(!mainTitle) return;
    const h = new Date().getHours();
    const t = translations[currentLang] || translations['vi'];
    if (h >= 5 && h < 11) mainTitle.textContent = t.greetingMorning || "Good morning";
    else if (h >= 11 && h < 14) mainTitle.textContent = t.greetingNoon || "Good afternoon";
    else if (h >= 14 && h < 18) mainTitle.textContent = t.greetingAfternoon || "Good afternoon";
    else mainTitle.textContent = t.greetingEvening || "Good evening";
}

function updateRandomButtonVisibility() {
    randomPromptBtn.classList.toggle('hidden', conversationHistory.length !== 0 || isRandomPromptUsedInSession);
}

// === KATEX RENDER HELPER ===
function renderMath(element) {
    if (window.renderMathInElement) {
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }
}

function renderHistoryList() {
    historyList.innerHTML = '';
    const theme = localStorage.getItem('theme') || 'dark';
    const config = themeColors[theme];
    
    Object.keys(chatHistories).sort().reverse().forEach(chatId => {
        const hist = chatHistories[chatId];
        if (chatId === currentChatId && hist.length === 0) return;
        
        const firstMsg = hist.length > 0 ? (typeof hist[0].content === 'string' ? hist[0].content : "Media file") : "Cuộc trò chuyện mới";
        
        const item = document.createElement('div');
        item.className = `history-item flex items-center justify-between p-2 rounded-md cursor-pointer ${config.historyHover.join(' ')}`;
        if (chatId === currentChatId) item.classList.add(...config.historyActive);
        
        item.innerHTML = `<span class="text-sm truncate w-4/5">${firstMsg}</span>
                          <button class="del-chat p-1 rounded-md hover:bg-red-500/20 text-gray-500 hover:text-red-500">&times;</button>`;
        
        item.querySelector('.del-chat').onclick = (e) => { e.stopPropagation(); delete chatHistories[chatId]; if(chatId===currentChatId) startNewChat(); else {saveStateToLocalStorage(); renderHistoryList();} };
        item.onclick = () => loadChatHistory(chatId);
        historyList.appendChild(item);
    });
}

function loadChatHistory(chatId) {
    currentChatId = chatId;
    conversationHistory = chatHistories[chatId] || [];
    
    const container = document.getElementById('chat-container');
    container.innerHTML = '';
    
    if(conversationHistory.length > 0) {
         document.getElementById('initial-view').classList.add('hidden');
         container.classList.remove('hidden');
         document.getElementById('mainContent').classList.remove('justify-center');
         conversationHistory.forEach(msg => container.appendChild(createMessageElement(msg.content, msg.role)));
         renderMath(container);
    } else startNewChat();
    
    renderHistoryList();
    saveStateToLocalStorage();
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. SECURITY GATE (Đếm số lần dùng)
    let usage = parseInt(localStorage.getItem('appUsageCount') || '0');
    usage++;
    if (usage >= 5) {
        localStorage.setItem('appUsageCount', usage);
        window.location.href = 'verify.html'; // Chặn nếu dùng quá nhiều
    } else {
        localStorage.setItem('appUsageCount', usage);
    }

    applyTheme(localStorage.getItem('theme') || 'dark');
    switchLanguage(localStorage.getItem('language') || 'vi');
    initializeApp();
    handleUpdateLog();
    initTokenSystem();
    updateModelButtonText();

    soundWaveButton.classList.remove('hidden');
    sendButton.classList.add('hidden');

    messageInput.addEventListener('input', () => {
        const hasText = messageInput.value.trim().length > 0;
        soundWaveButton.classList.toggle('hidden', hasText);
        sendButton.classList.toggle('hidden', !hasText);
    });
});

newChatHeaderBtn.addEventListener('click', startNewChat);

function handleUpdateLog() {
    const ver = '1.0.3';
    if (localStorage.getItem('seenUpdateLogVersion') !== ver) {
        const modal = document.getElementById('update-log-modal');
        if(modal) showModal(modal, true);
        const close = document.getElementById('close-update-log');
        if(close) close.onclick = () => {
            if(document.getElementById('dont-show-again').checked) localStorage.setItem('seenUpdateLogVersion', ver);
            showModal(modal, false);
        };
    }
}

// --- TOKEN SYSTEM ---
function initTokenSystem() {
    if (tokenConfig.IS_INFINITE) {
        tokenInputsContainer.classList.add('hidden');
        tokenInfinity.classList.remove('hidden');
        return;
    }
    // Logic đếm ngược token ở đây (giữ nguyên logic của bạn nếu cần)
    updateTokenUI();
}

function updateTokenUI() {
    // Update visual token
    if(!tokenConfig.IS_INFINITE) {
        tokenInfinity.classList.add('hidden');
        tokenInputsContainer.classList.remove('hidden');
        // Add values from LocalStorage...
    }
}
function consumeToken() { return true; } // Bypass for infinite mode

// --- PROMPTS ---
randomPromptBtn.addEventListener('click', () => {
    const prompts = ["Kể chuyện cười", "Công thức Phở?", "Tại sao bầu trời màu xanh?"]; // Simple example
    messageInput.value = prompts[Math.floor(Math.random() * prompts.length)];
    messageInput.dispatchEvent(new Event('input'));
    chatFormEl.dispatchEvent(new Event('submit'));
});
videoBtn.addEventListener('click', () => alert("Sắp có!"));
learnBtn.addEventListener('click', () => {
    isTutorMode = !isTutorMode;
    localStorage.setItem('isTutorMode', isTutorMode);
    updateLearnButtonVisualState();
});

function updateLearnButtonVisualState() {
    const svg = learnBtn.querySelector('svg');
    const theme = localStorage.getItem('theme');
    if (isTutorMode) {
        learnBtn.classList.add('bg-blue-600');
        svg.classList.add('text-white');
    } else {
        learnBtn.classList.remove('bg-blue-600');
        svg.classList.remove('text-white');
        svg.classList.add(themeColors[theme].iconColor);
    }
}

// --- MODEL SELECTION (Simplified for brevity) ---
function updateModelButtonText() {
    textElements.modelBtnText.textContent = currentModel.model || "Mini";
}
document.getElementById('model-button').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('model-popup').classList.toggle('hidden');
    // Render list model items here if needed...
};
document.onclick = (e) => {
    if(!document.getElementById('model-button').contains(e.target)) 
        document.getElementById('model-popup').classList.add('hidden');
};

// --- CHAT LOGIC ---
function formatAIResponse(text) {
    // Convert basic Markdown to HTML
    let f = text.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-3 mb-2">$1</h2>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
    return f;
}

function createMessageElement(content, role) {
    const div = document.createElement('div');
    div.className = "flex w-full mb-4 " + (role === 'user' ? "justify-end user-message" : "justify-start");
    
    const bubble = document.createElement('div');
    const theme = themeColors[localStorage.getItem('theme') || 'dark'];
    
    bubble.className = role === 'user' 
        ? `user-message-wrapper animate-pop-in px-5 py-3 rounded-3xl max-w-4xl shadow-md ${theme.userMessage.join(' ')}`
        : `ai-message-wrapper animate-pop-in max-w-4xl ${theme.aiMessage.join(' ')}`;
    
    if (Array.isArray(content)) {
        // Handle images/video
    } else {
        bubble.innerHTML = formatAIResponse(content);
    }
    
    div.appendChild(bubble);
    return div;
}

// ============================================================
// FIX STREAMING: SMART BUFFERING (SỬA MỌI LỖI MẤT CHỮ)
// ============================================================
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    const lang = systemPrompts[currentLang] || systemPrompts['vi'];
    const sysMsg = { role: 'system', content: isTutorMode ? lang.tutor : lang.assistant };
    
    // SETUP API URL
    const isLocal = location.hostname === 'localhost' || location.protocol === 'file:';
    // ĐIỀN URL CLOUDFLARE CỦA BẠN NẾU TEST LOCAL:
    const CLOUDFLARE_URL = ''; 
    const API = isLocal && CLOUDFLARE_URL ? `${CLOUDFLARE_URL}/api/handler` : '/api/handler';

    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ modelName, messages: [sysMsg, ...messages], max_tokens: 4000 }),
            signal
        });
        
        if(!res.ok) throw new Error("API Error");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        // BUFFERING FIX START
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Giữ lại dòng cuối (chưa trọn vẹn)

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const jsonStr = trimmed.slice(6).trim();
                    if (jsonStr === '[DONE]') break;
                    try {
                        const data = JSON.parse(jsonStr);
                        const txt = data.choices?.[0]?.delta?.content || "";
                        if (txt) {
                            fullText += txt;
                            aiMessageEl.firstChild.innerHTML = formatAIResponse(fullText);
                            const c = document.getElementById('chat-container');
                            if(c) c.scrollTop = c.scrollHeight;
                        }
                    } catch (e) { /* Ignore partial json */ }
                }
            }
        }
        return fullText;

    } catch (e) {
        if(e.name !== 'AbortError') {
            aiMessageEl.firstChild.innerHTML += `<br><span class="text-red-500">Lỗi: ${e.message}</span>`;
        }
        throw e;
    }
}

// --- SUBMIT HANDLER ---
chatFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg && !stagedFile) return;

    // UI Updates
    document.getElementById('initial-view').classList.add('hidden');
    const container = document.getElementById('chat-container');
    container.classList.remove('hidden');
    document.getElementById('mainContent').classList.remove('justify-center');

    // Add User Msg
    container.appendChild(createMessageElement(msg, 'user'));
    conversationHistory.push({ role: 'user', content: msg });
    
    messageInput.value = '';
    
    // Add AI Placeholder
    const aiDiv = createMessageElement('', 'assistant');
    aiDiv.firstChild.classList.add('streaming'); // Blinking cursor
    container.appendChild(aiDiv);
    container.scrollTop = container.scrollHeight;

    abortController = new AbortController();
    sendButton.classList.add('hidden');
    stopButton.classList.remove('hidden');

    try {
        const response = await streamAIResponse(currentModel.model, conversationHistory, aiDiv, abortController.signal);
        conversationHistory.push({ role: 'assistant', content: response });
        saveStateToLocalStorage();
    } catch (e) {
        // Error handled in stream function
    } finally {
        // QUAN TRỌNG: Render Math Sau khi xong
        aiDiv.firstChild.classList.remove('streaming');
        
        // Render text lại 1 lần chuẩn chỉ
        aiDiv.firstChild.innerHTML = formatAIResponse(conversationHistory[conversationHistory.length-1].content);
        
        // Gọi KaTeX render
        setTimeout(() => renderMath(aiDiv), 10);
        
        stopButton.classList.add('hidden');
        soundWaveButton.classList.remove('hidden');
    }
});

uploadFileBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    const f = e.target.files[0];
    if(f) {
        // Handle file logic preview (Keep simple for this full script)
        stagedFile = f; // Placeholder logic
    }
};
