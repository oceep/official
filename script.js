/**
 * ============================================================================
 * PROJECT: OCEEP AI CHATBOT - CLIENT SCRIPT
 * VERSION: 2.5.0 (Ultimate Full)
 * AUTHOR: Oceep Dev Team
 * ============================================================================
 * * TÍNH NĂNG CHÍNH:
 * 1. Security Gate: Khóa ứng dụng nếu dùng quá giới hạn.
 * 2. Token System: Quản lý lượt chat (có thể bật/tắt chế độ vô hạn).
 * 3. Multi-Theme: Dark, Light, Ocean (có ảnh nền động).
 * 4. Multi-Language: Tiếng Việt / Tiếng Anh.
 * 5. Model Selector: Chuyển đổi giữa Mini, Smart, Nerd.
 * 6. Chat Logic:
 * - Streaming Effect (Hiệu ứng gõ chữ).
 * - Markdown Parsing (Code block, Table, Bold, Italic).
 * - Source Pills (Nút nguồn tròn đẹp mắt).
 * - MathJax Rendering (Hiển thị công thức toán học).
 * - Timeout Handling (Tự ngắt nếu treo quá 60s).
 * 7. System Training: Chuyển đổi chế độ Trợ lý (Assistant) / Gia sư (Tutor).
 * 8. File Upload: Xử lý ảnh/video đầu vào.
 */

//=====================================================================//
// PHẦN 1: CẤU HÌNH & KHỞI TẠO (CONFIGURATION & INIT)
//=====================================================================//

'use strict'; // Chế độ nghiêm ngặt để bắt lỗi cú pháp

// 1.1. Kiểm tra Khóa bảo mật (Security Gate)
// --------------------------------------------------------------------
(function checkSecurityStatus() {
    try {
        const isLocked = localStorage.getItem('isLocked');
        if (isLocked === 'true') {
            console.warn("🔒 App is locked. Redirecting to verification...");
            window.location.href = 'verify.html';
            // Ngăn chặn thực thi code phía dưới bằng cách ném lỗi
            throw new Error("SECURITY_LOCK: App requires verification."); 
        }
    } catch (e) {
        console.error(e);
    }
})();

// 1.2. Cấu hình Hệ thống Token (Token Config)
// --------------------------------------------------------------------
const tokenConfig = {
    IS_INFINITE: true,            // TRUE = Không giới hạn token (Chat tẹt ga)
    MAX_TOKENS: 50,               // Số token tối đa nếu giới hạn
    TOKEN_COST_PER_MESSAGE: 1,    // Phí cho 1 tin nhắn
    TOKEN_REGEN_INTERVAL_MINUTES: 5, // Hồi phục mỗi 5 phút
    TOKEN_REGEN_AMOUNT: 1,        // Hồi phục 1 token
};

// 1.3. Cấu hình Hệ thống Training (System Prompts)
// --------------------------------------------------------------------
// Đây là "nhân cách" của AI, được gửi kèm mỗi request nhưng ẩn với người dùng.
const SYSTEM_PROMPTS = {
    // Chế độ Mặc định (Trợ lý hữu ích)
    assistant: `You are Oceep, a smart, helpful, and truthful AI Assistant.
    
    CORE RULES:
    1. LANGUAGE DETECTION: You MUST detect the language of the User's prompt.
       - If User speaks Vietnamese => You MUST answer in VIETNAMESE.
       - If User speaks English => You MUST answer in ENGLISH.
       - Never answer in a different language than the user.
    
    2. RESPONSE STYLE:
       - Be CONCISE (Ngắn gọn), SUCCINCT (Súc tích), and COMPLETE (Đầy đủ).
       - Do not ramble. Get straight to the point.
       - Use Markdown formatting (Bold, Lists, Tables) to make text readable.
    
    3. CITATIONS (Web Search):
       - If you are provided with search results, you MUST cite them.
       - CITATION FORMAT: **[Source Name](URL)**.
       - Example: "Thông tin này được xác nhận bởi **[VnExpress](https://...)**."
    `,

    // Chế độ Gia sư (Tutor Mode - Nút "Học Tập")
    tutor: `You are Oceep, acting as a world-class Expert Tutor and Teacher.
    
    CORE RULES:
    1. LANGUAGE: Strict adherence to the User's language (Vietnamese/English).
    2. PEDAGOGY (Phương pháp dạy):
       - Do NOT just give the final answer immediately.
       - Explain the "Why" and "How" (Tại sao và Làm thế nào).
       - Break down complex concepts into simple, digestible steps.
       - Use analogies (so sánh ví von) to explain difficult ideas.
       - Encourage the user to think.
    3. FORMATTING: Use **Bold** for key terms. Use Code Blocks for examples.`
};

//=====================================================================//
// PHẦN 2: QUẢN LÝ DOM & TRẠNG THÁI (DOM ELEMENTS & STATE)
//=====================================================================//

// Helper lấy Element nhanh
const getEl = (id) => document.getElementById(id);

// 2.1. Danh sách các Element chứa Text (để dịch đa ngôn ngữ)
const textElements = {
    header: getEl('header-title'),
    main: getEl('main-title'),
    input: getEl('message-input'),
    footer: getEl('footer-text'),
    themeIcon: getEl('theme-icon'),
    logoText: getEl('logo-text'),
    sidebarHeader: getEl('sidebar-header'),
    modelBtnText: getEl('model-button-text-display'),
    themeModalTitle: getEl('theme-modal-title'),
    languageModalTitle: getEl('language-modal-title'),
    themeDarkText: getEl('theme-dark-text'),
    themeLightText: getEl('theme-light-text'),
    themeOceanText: getEl('theme-ocean-text'),
    closeModalButton: getEl('close-modal-button'),
    closeLanguageModalBtn: getEl('close-language-modal-button'),
    comingSoonTitle: getEl('coming-soon-title'),
    comingSoonText: getEl('coming-soon-text'),
    closeComingSoonModal: getEl('close-coming-soon-modal'),
    // Tooltips (Gợi ý khi di chuột)
    randomTooltip: getEl('random-tooltip'),
    videoTooltip: getEl('video-tooltip'),
    learnTooltip: getEl('learn-tooltip'),
    langTooltip: getEl('lang-tooltip'),
    themeTooltip: getEl('theme-tooltip'),
    historyTooltip: getEl('history-tooltip'),
    newChatTooltip: getEl('new-chat-tooltip'),
};

// 2.2. Các nút chức năng & Modal
const themeMenuButton = getEl('theme-menu-button');
const themeModal = getEl('theme-modal');
const themeOptionButtons = document.querySelectorAll('.theme-option');
const languageModal = getEl('language-modal');
const languageOptionButtons = document.querySelectorAll('.language-option');
const langSwitchBtn = getEl('lang-switch-btn');

// 2.3. Layout chính
const body = document.body;
const backgroundContainer = getEl('background-container');
const chatFormEl = getEl('chat-form');
const oceanImageUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop';

// 2.4. Chat Interface
const sidebar = getEl('sidebar');
const sidebarToggle = getEl('sidebar-toggle');
const historyList = getEl('history-list');
const newChatHeaderBtn = getEl('new-chat-header-btn');
const sendButton = getEl('send-button');
const soundWaveButton = getEl('sound-wave-button');
const stopButton = getEl('stop-button');
const messageInput = getEl('message-input');

// 2.5. Footer Action Buttons
const randomPromptBtn = getEl('random-prompt-icon-btn');
const videoBtn = getEl('video-icon-btn');
const learnBtn = getEl('learn-icon-btn'); // Nút chế độ Tutor
const modelButton = getEl('model-button');
const modelPopup = getEl('model-popup');

// 2.6. File Upload
const uploadFileBtn = getEl('upload-file-btn');
const fileInput = getEl('file-input');
const fileThumbnailContainer = getEl('file-thumbnail-container');

// 2.7. Token Inputs (Ẩn/Hiện tùy config)
const currentTokenInput = getEl('current-token-input');
const maxTokenInput = getEl('max-token-input');
const tokenInputsContainer = getEl('token-inputs-container');
const tokenInfinity = getEl('token-infinity');

// --- GLOBAL STATE VARIABLES ---
let stagedFile = null; // File đang chờ gửi
let currentLang = localStorage.getItem('language') || 'vi';
let isTutorMode = localStorage.getItem('isTutorMode') === 'true'; // Trạng thái chế độ học tập
let abortController; // Controller để hủy request fetch
let isRandomPromptUsedInSession = false;
let conversationHistory = []; // Mảng chứa lịch sử hội thoại hiện tại
let chatHistories = {}; // Object chứa toàn bộ lịch sử: { id: [msg, msg...] }
let currentChatId = null;

// Khởi tạo Model (Lấy từ LocalStorage hoặc mặc định Mini)
let currentModel;
try {
    currentModel = JSON.parse(localStorage.getItem('currentModel'));
} catch (e) { currentModel = null; }
if (!currentModel) currentModel = { model: 'Mini', version: '' };

//=====================================================================//
// PHẦN 3: TỪ ĐIỂN & THEME (DICTIONARY & THEMES)
//=====================================================================//

const translations = {
    vi: {
        sidebarHeader: "Lịch sử Chat", 
        newChatTitle: "Chat mới", 
        messagePlaceholder: "Bạn muốn biết gì hôm nay?", 
        aiTypingPlaceholder: "AI đang suy nghĩ...", 
        outOfTokensPlaceholder: "Bạn đã hết lượt chat.", 
        sendButton: "Gửi", 
        stopButton: "Dừng", 
        modelButtonDefault: "Expert", 
        randomButton: "Ngẫu nhiên", 
        videoButton: "Tạo Video", 
        learnButton: "Chế độ Gia sư", 
        footerText: "AI có thể mắc lỗi. Hãy kiểm tra lại thông tin quan trọng.", 
        themeModalTitle: "Chọn Giao Diện", 
        languageModalTitle: "Chọn Ngôn Ngữ", 
        themeDark: "Tối", 
        themeLight: "Sáng", 
        themeOcean: "Đại Dương", 
        modalClose: "Đóng", 
        newChatHistory: "Cuộc trò chuyện mới", 
        greetingMorning: "Chào buổi sáng! ☀️", 
        greetingNoon: "Chào buổi trưa! 🌤️", 
        greetingAfternoon: "Chào buổi chiều! ⛅", 
        greetingEvening: "Chào buổi tối! 🌙", 
        errorPrefix: "Đã có lỗi xảy ra", 
        comingSoon: "Tính năng Sắp ra mắt", 
        comingSoonTitle: "Sắp có...", 
        comingSoonText: "Tính năng này đang được phát triển.", 
        langTooltip: "Đổi Ngôn Ngữ", 
        themeTooltip: "Đổi Giao Diện", 
        historyTooltip: "Lịch Sử Chat", 
        newChatTooltip: "Tạo Chat Mới", 
        modelMiniDesc: "Nhanh, nhẹ, hiệu quả.", 
        modelSmartDesc: "Thông minh, cân bằng.", 
        modelNerdDesc: "Chuyên sâu, logic cao."
    },
    en: {
        sidebarHeader: "Chat History", 
        newChatTitle: "New Chat", 
        messagePlaceholder: "Ask me anything...", 
        aiTypingPlaceholder: "AI is thinking...", 
        outOfTokensPlaceholder: "Out of tokens.", 
        sendButton: "Send", 
        stopButton: "Stop", 
        modelButtonDefault: "Expert", 
        randomButton: "Random", 
        videoButton: "Create Video", 
        learnButton: "Tutor Mode", 
        footerText: "AI can make mistakes. Please verify important info.", 
        themeModalTitle: "Select Theme", 
        languageModalTitle: "Select Language", 
        themeDark: "Dark", 
        themeLight: "Light", 
        themeOcean: "Ocean", 
        modalClose: "Close", 
        newChatHistory: "New Conversation", 
        greetingMorning: "Good morning! ☀️", 
        greetingNoon: "Good afternoon! 🌤️", 
        greetingAfternoon: "Good afternoon! ⛅", 
        greetingEvening: "Good evening! 🌙", 
        errorPrefix: "An error occurred", 
        comingSoon: "Coming Soon", 
        comingSoonTitle: "Coming Soon...", 
        comingSoonText: "This feature is under development.", 
        langTooltip: "Switch Language", 
        themeTooltip: "Change Theme", 
        historyTooltip: "Chat History", 
        newChatTooltip: "New Chat", 
        modelMiniDesc: "Fast & Efficient.", 
        modelSmartDesc: "Balanced Intelligence.", 
        modelNerdDesc: "Deep Reasoning."
    },
};
// Fallback languages
['zh', 'hi', 'es', 'fr', 'ja', 'it', 'de', 'ru'].forEach(lang => { 
    if(!translations[lang]) translations[lang] = translations['en']; 
});

const themeColors = {
    dark: {
        bg: ['bg-gradient-to-br', 'from-[#212935]', 'to-black'],
        text: 'text-gray-100',
        subtleText: 'text-gray-400',
        logo: 'text-gray-100',
        iconColor: 'text-gray-300',
        popup: ['bg-gray-900', 'border', 'border-gray-700'],
        popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'],
        sidebar: ['bg-black/10', 'border-white/10'],
        historyActive: ['bg-blue-800/50'],
        historyHover: ['hover:bg-blue-800/30'],
        form: ['bg-black/30', 'border-white/20'],
        headerPill: [],
        aiMessage: ['text-gray-100'],
        userMessage: ['bg-blue-600', 'text-white'],
        inputColor: ['text-gray-200', 'placeholder-gray-500']
    },
    light: {
        bg: ['bg-white'],
        text: 'text-black',
        subtleText: 'text-gray-600',
        logo: 'text-blue-500',
        iconColor: 'text-gray-800',
        popup: ['bg-white', 'border', 'border-gray-200', 'shadow-lg'],
        popupButton: ['text-gray-700', 'hover:bg-gray-100'],
        sidebar: ['bg-gray-50', 'border-r', 'border-gray-200'],
        historyActive: ['bg-blue-100'],
        historyHover: ['hover:bg-gray-200'],
        form: ['bg-gray-100', 'border', 'border-gray-300', 'shadow'],
        headerPill: [],
        aiMessage: ['text-black'],
        userMessage: ['bg-blue-500', 'text-white'],
        inputColor: ['text-black', 'placeholder-gray-400']
    },
    ocean: {
        bgImage: `url('${oceanImageUrl}')`,
        text: 'text-white',
        subtleText: 'text-gray-300',
        logo: 'text-white',
        iconColor: 'text-white',
        popup: ['bg-black/70', 'backdrop-blur-md', 'border', 'border-white/10'],
        popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'],
        sidebar: ['bg-black/10', 'border-white/10'],
        historyActive: ['bg-white/20'],
        historyHover: ['hover:bg-white/10'],
        form: ['bg-black/30', 'border-white/20'],
        headerPill: ['bg-black/30', 'backdrop-blur-lg', 'border', 'border-white/20'],
        aiMessage: ['text-white'],
        userMessage: ['bg-blue-500', 'text-white'],
        inputColor: ['text-white', 'placeholder-gray-300']
    }
};

//=====================================================================//
// PHẦN 4: HÀM TIỆN ÍCH (HELPER FUNCTIONS)
//=====================================================================//

// Escape HTML để chống XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

// Lưu lịch sử chat vào LocalStorage
function saveStateToLocalStorage() {
    try {
        const h = { ...chatHistories };
        // Dọn dẹp các chat rỗng để tiết kiệm bộ nhớ
        if (h[currentChatId] && h[currentChatId].length === 0) {
            delete h[currentChatId];
        }
        localStorage.setItem('chatHistories', JSON.stringify(h));
        localStorage.setItem('currentChatId', currentChatId);
    } catch(e) { 
        console.error("Save state error:", e); 
    }
}

// Tải lịch sử chat khi mở app
function initializeApp() {
    const s = localStorage.getItem('chatHistories');
    if (s) {
        try { chatHistories = JSON.parse(s); } catch(e) { chatHistories = {}; }
    } else {
        chatHistories = {};
    }
    startNewChat(); 
}

// Hàm đổi Theme (Giao diện)
function applyTheme(theme) {
    if (!themeColors[theme]) theme = 'dark';
    
    // Reset classes
    body.className = "flex flex-col h-screen overflow-hidden transition-colors duration-500";
    backgroundContainer.className = "fixed inset-0 -z-10 transition-all duration-500 bg-cover bg-center";
    backgroundContainer.style.backgroundImage = '';
    
    const config = themeColors[theme];
    const allConfigs = Object.values(themeColors);

    // Active state cho nút theme
    themeOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20');
        if (btn.dataset.theme === theme) btn.classList.add('bg-blue-500/20');
    });

    // Apply Background
    body.classList.remove(...allConfigs.flatMap(c => c.bg).flat());
    if (config.bgImage) {
        backgroundContainer.style.backgroundImage = config.bgImage;
        backgroundContainer.classList.add('image-overlay');
    } else {
        body.classList.add(...config.bg);
        backgroundContainer.classList.remove('image-overlay');
    }
    
    // Apply Text Color
    body.classList.remove(...allConfigs.map(c => c.text));
    body.classList.add(config.text);

    // Apply specific component styles (Sidebar, Form, Popups, etc.)
    const applyToElement = (el, propName) => {
        if (!el) return;
        el.classList.remove(...allConfigs.flatMap(c => c[propName] || []).flat());
        el.classList.add(...(config[propName] || []));
    };

    applyToElement(sidebar, 'sidebar');
    applyToElement(chatFormEl, 'form');
    applyToElement(modelPopup, 'popup');
    
    document.querySelectorAll('.header-pill-container').forEach(pill => applyToElement(pill, 'headerPill'));

    // Apply Icon Colors
    const icons = [sidebarToggle, newChatHeaderBtn, langSwitchBtn, getEl('theme-icon'), randomPromptBtn, videoBtn, learnBtn, uploadFileBtn];
    icons.forEach(el => {
        if (el && el.querySelector && el.querySelector('svg')) el = el.querySelector('svg');
        if(el && el.classList) {
            el.classList.remove(...allConfigs.map(c => c.iconColor));
            el.classList.add(config.iconColor);
        }
    });
    
    // Apply Input Styles
    if(messageInput) {
        messageInput.classList.remove(...allConfigs.flatMap(c => c.inputColor || []).flat());
        messageInput.classList.add(...(config.inputColor || []));
    }

    // Apply Footer Text Color
    if(textElements.footer) {
        textElements.footer.classList.remove(...allConfigs.map(c => c.subtleText));
        textElements.footer.classList.add(config.subtleText);
    }

    localStorage.setItem('theme', theme);
    renderHistoryList(); // Re-render history để cập nhật màu hover
    updateLearnButtonVisualState(); // Cập nhật màu nút Learn
}

// Hàm đổi Ngôn ngữ
function switchLanguage(lang) {
    currentLang = lang;
    const t = translations[lang] || translations['vi'];
    
    const setText = (el, txt) => { if(el) el.textContent = txt; };
    const setAttr = (el, attr, txt) => { if(el) el[attr] = txt; };

    setText(textElements.sidebarHeader, t.sidebarHeader);
    setAttr(textElements.input, 'placeholder', t.messagePlaceholder);
    setText(textElements.footer, t.footerText);
    setText(textElements.themeModalTitle, t.themeModalTitle);
    setText(textElements.languageModalTitle, t.languageModalTitle);
    
    // Modal Texts
    setText(textElements.themeDarkText, t.themeDark);
    setText(textElements.themeLightText, t.themeLight);
    setText(textElements.themeOceanText, t.themeOcean);
    setText(textElements.closeModalButton, t.modalClose);
    
    // Tooltips
    setText(textElements.randomTooltip, t.randomButton);
    setText(textElements.videoTooltip, t.videoButton);
    setText(textElements.learnTooltip, t.learnButton);
    
    if(langSwitchBtn) langSwitchBtn.textContent = lang.toUpperCase();
    document.documentElement.lang = lang;
    localStorage.setItem('language', lang);
    
    // Active state cho nút ngôn ngữ
    languageOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20', 'text-blue-600');
        if (btn.dataset.lang === lang) btn.classList.add('bg-blue-500/20', 'text-blue-600');
    });

    updateModelButtonText();
    setGreeting();
    renderHistoryList();
}

function setGreeting() {
    const mt = getEl('main-title');
    if (!mt) return;
    const h = new Date().getHours();
    const t = translations[currentLang] || translations['vi'];
    let greeting = t.greetingEvening;
    if (h >= 5 && h < 11) greeting = t.greetingMorning;
    else if (h >= 11 && h < 14) greeting = t.greetingNoon;
    else if (h >= 14 && h < 18) greeting = t.greetingAfternoon;
    mt.textContent = greeting;
}

// Helper: Modal Animation Logic
let isModalAnimating = false;
function showModal(modal, show) {
    if(!modal) return;
    if (isModalAnimating && (modal === themeModal || modal === languageModal)) return;
    isModalAnimating = true;
    const content = modal.querySelector('div[id$="-content"]');
    
    if (show) {
        modal.classList.remove('hidden');
        if(content) {
            content.classList.remove('modal-fade-leave');
            content.classList.add('modal-fade-enter');
        }
    } else {
        if(content) {
            content.classList.remove('modal-fade-enter');
            content.classList.add('modal-fade-leave');
        }
    }
    setTimeout(() => {
        if (!show) modal.classList.add('hidden');
        isModalAnimating = false;
    }, 300);
}

// --- EVENT LISTENERS CHO UI ---
if(themeMenuButton) themeMenuButton.addEventListener('click', () => showModal(themeModal, true));
if(textElements.closeModalButton) textElements.closeModalButton.addEventListener('click', () => showModal(themeModal, false));
if(themeModal) themeModal.addEventListener('click', (e) => { if(e.target === themeModal) showModal(themeModal, false); });
themeOptionButtons.forEach(b => b.addEventListener('click', () => { applyTheme(b.dataset.theme); showModal(themeModal, false); }));

if(langSwitchBtn) langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
if(textElements.closeLanguageModalBtn) textElements.closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
if(languageModal) languageModal.addEventListener('click', (e) => { if(e.target === languageModal) showModal(languageModal, false); });
languageOptionButtons.forEach(b => b.addEventListener('click', () => { switchLanguage(b.dataset.lang); showModal(languageModal, false); }));

if(sidebarToggle && sidebar) sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('hidden');
});

// --- MODEL SELECTION LOGIC ---
function updateModelButtonText() {
    const t = translations[currentLang] || translations['vi'];
    if (textElements.modelBtnText) textElements.modelBtnText.textContent = (currentModel && currentModel.model) ? currentModel.model : t.modelButtonDefault;
}

const createModelButton = (text, desc, model, ver, icon) => {
    const theme = localStorage.getItem('theme') || 'dark';
    const config = themeColors[theme] || themeColors['dark'];
    const btn = document.createElement('button');
    btn.className = 'w-full text-left p-2 rounded-lg transition-colors duration-200 flex items-center justify-between btn-interaction';
    if(config.popupButton) btn.classList.add(...config.popupButton);
    
    btn.innerHTML = `<div class="flex items-center gap-3"><div>${icon}</div><div class="flex flex-col"><span class="font-semibold leading-tight">${text}</span><span class="text-xs text-gray-500 leading-tight">${desc}</span></div></div>`;
    
    if (currentModel && currentModel.model === model) {
        btn.innerHTML += `<div class="text-blue-500"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg></div>`;
    }
    
    btn.onclick = (e) => {
        e.stopPropagation();
        currentModel = { model, version: ver || null };
        localStorage.setItem('currentModel', JSON.stringify(currentModel));
        updateModelButtonText();
        modelPopup.classList.add('hidden');
    };
    return btn;
};

const showInitialModels = () => {
    if(!modelPopup) return;
    modelPopup.innerHTML = '';
    const t = translations[currentLang] || translations['vi'];
    const icons = {
        Mini: `<svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`,
        Smart: `<svg class="w-6 h-6 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>`,
        Nerd: `<svg class="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>`
    };
    [
        { text: 'Mini', desc: t.modelMiniDesc, model: 'Mini', ver: '', icon: icons.Mini },
        { text: 'Smart', desc: t.modelSmartDesc, model: 'Smart', ver: '', icon: icons.Smart },
        { text: 'Nerd', desc: t.modelNerdDesc, model: 'Nerd', ver: '', icon: icons.Nerd }
    ].forEach(m => modelPopup.appendChild(createModelButton(m.text, m.desc, m.model, m.ver, m.icon)));
};

if(modelButton) modelButton.onclick = (e) => { e.stopPropagation(); showInitialModels(); modelPopup.classList.toggle('hidden'); };
document.onclick = (e) => { if(modelPopup && !modelButton.contains(e.target)) modelPopup.classList.add('hidden'); };

//=====================================================================//
// PHẦN 5: CHAT LOGIC, FORMATTING & STREAMING (TRÁI TIM CỦA APP)
//=====================================================================//

// 5.1. Phân loại câu hỏi để hiện chữ "Đang tìm kiếm..."
function shouldShowSearchStatus(text) {
    if (!text) return false;
    const skipRegex = /(giải toán|code|lập trình|javascript|python|html|css|fix bug|lỗi|logic|ngữ pháp|tiếng anh|viết văn|viết mail|văn mẫu|kiến thức chung|trái đất|mặt trời|định nghĩa|khái niệm|công thức|tính toán|giai toan|lap trinh|ngu phap|viet van|van mau|kien thuc chung|trai dat|mat troi|dinh nghia|khai niem|cong thuc|tinh toan)/i;
    const mustSearchRegex = /(địa chỉ|quán|nhà hàng|ở đâu|gần đây|thời tiết|hôm nay|ngày mai|tin tức|sự kiện|giá|tỷ giá|vàng|crypto|coin|bitcoin|eth|giờ mở cửa|giao thông|kẹt xe|dia chi|quan|nha hang|o dau|gan day|thoi tiet|hom nay|ngay mai|tin tuc|su kien|gia|ty gia|vang|gio mo cua|giao thong|ket xe|hiện tại|bây giờ|hien tai|bay gio)/i;

    if (skipRegex.test(text)) return false;
    return mustSearchRegex.test(text);
}

// 5.2. Khởi tạo phiên Chat mới
function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    
    if(getEl('chat-container')) getEl('chat-container').innerHTML = '';
    if(getEl('initial-view')) getEl('initial-view').classList.remove('hidden');
    if(getEl('chat-container')) getEl('chat-container').classList.add('hidden');
    if(getEl('mainContent')) { 
        getEl('mainContent').classList.add('justify-center'); 
        getEl('mainContent').classList.remove('justify-start'); 
    }
    
    setGreeting();
    isRandomPromptUsedInSession = false; 
    updateRandomButtonVisibility();
    renderHistoryList();
    setActiveHistoryItem(currentChatId);
    saveStateToLocalStorage();
}

function updateRandomButtonVisibility() {
    if (conversationHistory.length === 0 && !isRandomPromptUsedInSession) {
        if(randomPromptBtn) randomPromptBtn.classList.remove('hidden');
    } else {
        if(randomPromptBtn) randomPromptBtn.classList.add('hidden');
    }
}

// 5.3. FORMATTER: Xử lý Markdown & Source Pill (QUAN TRỌNG)
function formatAIResponse(text) {
    if (!text) return '';
    const codeBlocks = [];
    
    // Tách code block ra trước để tránh bị format nhầm
    let processedText = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang: lang || 'code', code: code });
        return `__CODE_BLOCK_${index}__`; 
    });

    // --- SOURCE PILL REGEX (Tạo nút tròn ghi nguồn) ---
    // Cú pháp từ Backend: **[Tên Nguồn](Link)**
    const sourceRegex = /\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g;
    processedText = processedText.replace(sourceRegex, (match, name, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="source-pill" title="Nguồn: ${name}">${name}</a>`;
    });

    // Xử lý in đậm
    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-blue-400">$1</strong>');
    // Xử lý Headers (H2, H3)
    processedText = processedText.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2 border-b border-gray-500/50 pb-1">$1</h2>');
    processedText = processedText.replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-bold mt-3 mb-1">$1</h3>');
    
    // Xử lý Markdown Table
    const tableRegex = /\|(.+)\|\n\|([-:| ]+)\|\n((?:\|.*\|\n?)*)/g;
    processedText = processedText.replace(tableRegex, (match, header, separator, body) => {
        try {
            const safeHeader = header || "";
            const headers = safeHeader.split('|').filter(h => h.trim() !== '').map(h => `<th class="px-4 py-2 bg-gray-700 border border-gray-600 font-semibold text-white">${h.trim()}</th>`).join('');
            const safeBody = body || "";
            const rows = safeBody.trim().split('\n').map(row => {
                const cells = row.split('|').filter(c => c.trim() !== '').map(c => `<td class="px-4 py-2 border border-gray-600 text-gray-200">${c.trim()}</td>`).join('');
                return `<tr class="hover:bg-gray-700/50 transition-colors">${cells}</tr>`;
            }).join('');
            return `<div class="overflow-x-auto my-3 rounded-lg shadow-lg"><table class="min-w-full bg-gray-800 border-collapse text-sm"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
        } catch (e) { return match; }
    });

    // Xuống dòng
    processedText = processedText.replace(/\n/g, '<br>');

    // Trả lại Code Block
    processedText = processedText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const block = codeBlocks[index];
        const escapedCode = block.code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700 shadow-xl w-full"><div class="code-box-header flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700"><span class="text-xs text-gray-400 font-mono font-bold uppercase">${block.lang}</span><button onclick="copyToClipboard(this)" class="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition cursor-pointer bg-transparent border-none">Copy</button></div><div class="p-4 overflow-x-auto bg-[#1e1e1e]"><pre><code class="font-mono text-sm text-green-400 whitespace-pre">${escapedCode}</code></pre></div></div>`;
    });
    return processedText;
}

// 5.4. Tạo Element tin nhắn (Message Bubble)
function createMessageElement(messageContent, sender) {
    const row = document.createElement('div');
    row.classList.add('flex', 'w-full', 'mb-4');
    const wrapper = document.createElement('div');
    const theme = localStorage.getItem('theme') || 'dark';
    const config = themeColors[theme] || themeColors['dark'];
    
    if (sender === 'user') {
        row.classList.add('justify-end', 'user-message');
        wrapper.className = 'user-message-wrapper animate-pop-in px-5 py-3 rounded-3xl max-w-4xl shadow-md flex flex-col gap-2';
        wrapper.classList.add(...config.userMessage);
        if (Array.isArray(messageContent)) {
            messageContent.forEach(p => {
                if (p.type === 'text') { const d = document.createElement('div'); d.innerHTML = escapeHTML(p.text); wrapper.appendChild(d); }
                else if (p.type === 'image_url') { const i = document.createElement('img'); i.src = p.image_url.url; i.className='rounded-lg max-w-xs'; wrapper.appendChild(i); }
                else if (p.type === 'video_url') { const v = document.createElement('video'); v.src = p.video_url.url; v.controls=true; v.className='rounded-lg max-w-xs'; wrapper.appendChild(v); }
            });
        } else wrapper.innerHTML = escapeHTML(messageContent);
    } else {
        row.classList.add('justify-start');
        wrapper.className = 'ai-message-wrapper animate-pop-in max-w-4xl';
        wrapper.classList.add(...config.aiMessage);
        wrapper.innerHTML = formatAIResponse(messageContent);
    }
    row.appendChild(wrapper);
    return row;
}

// 5.5. Hiển thị Toán học (MathJax)
function renderMath(element) {
    if (window.renderMathInElement) {
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }
}

// 5.6. Hiệu ứng gõ chữ (Streaming Effect)
async function typeWriterEffect(text, element) {
    if (!text) return;
    element.innerHTML = ''; 
    const words = text.split(/(?=\s)/g); 
    let currentText = "";
    const speed = 10; 
    const chatContainer = getEl('chat-container');

    for (const word of words) {
        currentText += word;
        element.innerHTML = formatAIResponse(currentText);
        if(chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        await new Promise(r => setTimeout(r, speed));
    }
    element.innerHTML = formatAIResponse(text);
}

// 5.7. GỌI API & STREAMING (FIX TREO & TIMEOUT)
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    const isLocal = location.hostname === 'localhost' || location.protocol === 'file:';
    const API_URL = isLocal ? '/api/handler' : '/api/handler';

    try {
        const controller = new AbortController();
        // TIMEOUT 60 GIÂY: Đảm bảo không bao giờ bị treo vĩnh viễn
        const timeoutId = setTimeout(() => controller.abort(), 60000); 
        const combinedSignal = signal || controller.signal;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName, messages, max_tokens: 2000, temperature: 0.7 }),
            signal: combinedSignal
        });

        clearTimeout(timeoutId); // Xóa timeout nếu có phản hồi thành công

        if (!response.ok) {
            let errorMsg = `Lỗi Server (${response.status})`;
            try { const err = await response.json(); if (err.error) errorMsg = err.error; } catch(e){}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const fullText = (data && data.content) ? data.content : ""; 
        
        await typeWriterEffect(fullText, aiMessageEl.firstChild);
        return fullText;

    } catch (error) {
        if (error.name === 'AbortError') {
            if (!signal?.aborted) {
                // Do timeout tự ngắt
                aiMessageEl.firstChild.innerHTML = `<span class="text-red-400 font-bold">⚠️ Quá thời gian chờ (Timeout 60s). Backend đang quá tải, vui lòng thử lại sau.</span>`;
                throw new Error("Request Timed Out");
            }
            return aiMessageEl.firstChild.innerText;
        }
        
        console.error("Fetch Error:", error);
        let userMsg = "Đã có lỗi xảy ra.";
        if (error.message) userMsg += ` (${error.message})`;
        aiMessageEl.firstChild.innerHTML = `<span class="text-red-400">${userMsg}</span>`;
        throw error;
    }
}

// 5.8. XỬ LÝ SUBMIT FORM CHAT
if(chatFormEl) {
    chatFormEl.addEventListener('submit', async function(event) {
        event.preventDefault();
        const message = messageInput.value.trim();
        if (!message && !stagedFile) return;

        if (!consumeToken()) return;

        // UI Transitions
        const initialView = getEl('initial-view');
        const chatContainer = getEl('chat-container');
        const mainContent = getEl('mainContent');

        if (initialView && !initialView.classList.contains('hidden')) {
            initialView.style.opacity = '0';
            setTimeout(() => {
                initialView.classList.add('hidden');
                if(chatContainer) chatContainer.classList.remove('hidden');
                if(mainContent) {
                    mainContent.classList.remove('justify-center');
                    mainContent.classList.add('justify-start');
                }
            }, 500);
        }

        // Tạo tin nhắn User
        const userContent = [];
        if (stagedFile) {
            if (stagedFile.type === 'image') userContent.push({ type: "image_url", image_url: { url: stagedFile.url } });
            else if (stagedFile.type === 'video') userContent.push({ type: "video_url", video_url: { url: stagedFile.url } });
        }
        if (message) userContent.push({ type: "text", text: message });

        const userEl = createMessageElement(userContent, 'user');
        chatContainer.appendChild(userEl);

        // Lưu vào lịch sử
        const historyContent = userContent.length === 1 && userContent[0].type === 'text' ? message : userContent;
        conversationHistory.push({ role: 'user', content: historyContent });
        renderHistoryList();

        // Reset Input
        messageInput.value = '';
        messageInput.dispatchEvent(new Event('input')); 
        stagedFile = null;
        if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
        isRandomPromptUsedInSession = true; 
        updateRandomButtonVisibility(); 
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Tạo tin nhắn AI (Loading)
        const aiEl = createMessageElement('', 'ai');
        aiEl.firstChild.classList.add('streaming'); 
        
        // Hiển thị trạng thái "Đang tìm kiếm..." nếu cần
        const searchStatusTimer = setTimeout(() => {
            if (shouldShowSearchStatus(message)) {
                aiEl.firstChild.innerHTML = '<span class="animate-pulse text-blue-400">Đang tìm kiếm thông tin...</span>';
            } else {
                aiEl.firstChild.innerHTML = '<span class="animate-pulse">AI đang suy nghĩ...</span>';
            }
        }, 1500);

        chatContainer.appendChild(aiEl);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        if(sendButton) sendButton.classList.add('hidden');
        if(soundWaveButton) soundWaveButton.classList.add('hidden');
        if(stopButton) stopButton.classList.remove('hidden');
        setInputActive(false);

        abortController = new AbortController();

        try {
            const modelToUse = (currentModel && currentModel.model) ? currentModel.model : 'Mini';
            
            // --- INJECT TRAINING PROMPT (SYSTEM INSTRUCTION) ---
            // Chọn prompt dựa trên chế độ Tutor/Assistant
            const systemContent = isTutorMode ? SYSTEM_PROMPTS.tutor : SYSTEM_PROMPTS.assistant;
            
            // Tạo payload tin nhắn mới (chèn System Prompt vào đầu mỗi request để model luôn nhớ luật)
            const messagesPayload = [
                { role: 'system', content: systemContent },
                ...conversationHistory
            ];
            // ----------------------------------------------------

            const fullAiResponse = await streamAIResponse(modelToUse, messagesPayload, aiEl, abortController.signal);
            
            clearTimeout(searchStatusTimer); 
            conversationHistory.push({ role: 'assistant', content: fullAiResponse });
            chatContainer.scrollTop = chatContainer.scrollHeight;
            saveStateToLocalStorage(); 
        } catch (error) {
            clearTimeout(searchStatusTimer);
        } finally {
            clearTimeout(searchStatusTimer);
            aiEl.firstChild.classList.remove('streaming');
            renderMath(aiEl);

            if(stopButton) stopButton.classList.add('hidden');
            if(soundWaveButton) soundWaveButton.classList.remove('hidden');
            setInputActive(true);
        }
    });
}

function setInputActive(isActive) {
    if(messageInput) {
        messageInput.disabled = !isActive;
        messageInput.placeholder = isActive ? (translations[currentLang]?.messagePlaceholder) : (translations[currentLang]?.aiTypingPlaceholder);
    }
    [randomPromptBtn, videoBtn, learnBtn, uploadFileBtn, modelButton].forEach(b => { if(b) b.disabled = !isActive; });
}

// Token (Minimal Logic)
const currentTokenInput = getEl('current-token-input');
const maxTokenInput = getEl('max-token-input');
const tokenInputsContainer = getEl('token-inputs-container');
const tokenInfinity = getEl('token-infinity');

function initTokenSystem() {
    if(tokenInputsContainer) tokenInputsContainer.classList.add('hidden');
    if(tokenInfinity) tokenInfinity.classList.remove('hidden');
}

function consumeToken() {
    if (tokenConfig.IS_INFINITE) return true;
    let currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    if (currentTokens >= tokenConfig.TOKEN_COST_PER_MESSAGE) {
        currentTokens -= tokenConfig.TOKEN_COST_PER_MESSAGE;
        localStorage.setItem('userTokens', currentTokens);
        return true;
    }
    return false;
}

// Các sự kiện UI khác
if(stopButton) stopButton.onclick = () => { if (abortController) abortController.abort(); };
if(randomPromptBtn) randomPromptBtn.onclick = () => {
    if (isRandomPromptUsedInSession) return;
    const prompts = [
        "Kể một câu chuyện cười", "Thủ đô của nước Pháp là gì?", 
        "Viết một đoạn văn về tầm quan trọng của việc đọc sách.", "Công thức làm món phở bò?"
    ];
    messageInput.value = prompts[Math.floor(Math.random() * prompts.length)];
    chatFormEl.dispatchEvent(new Event('submit'));
};
if(videoBtn) videoBtn.onclick = () => alert(translations[currentLang].comingSoon);

// Xử lý nút Học Tập (Tutor Mode)
if(learnBtn) learnBtn.onclick = () => {
    isTutorMode = !isTutorMode; 
    localStorage.setItem('isTutorMode', isTutorMode);
    updateLearnButtonVisualState();
};
function updateLearnButtonVisualState() {
    if(!learnBtn) return;
    const icon = learnBtn.querySelector('svg');
    const theme = localStorage.getItem('theme') || 'dark';
    const config = themeColors[theme];
    if (isTutorMode) {
        learnBtn.classList.add(theme==='light'?'bg-blue-500':'bg-blue-600');
        if(icon) { icon.classList.add('text-white'); icon.classList.remove(config.iconColor); }
    } else {
        learnBtn.classList.remove('bg-blue-600', 'bg-blue-500');
        if(icon) { icon.classList.remove('text-white'); icon.classList.add(config.iconColor); }
    }
}

// File Upload Handler
if(uploadFileBtn) uploadFileBtn.addEventListener('click', () => fileInput && fileInput.click());
if(fileInput) fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (stagedFile && stagedFile.type === 'video') URL.revokeObjectURL(stagedFile.url);
    stagedFile = null;
    if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
    
    const rmBtn = `<button id="remove-file-btn" class="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center font-bold text-xs btn-interaction">&times;</button>`;
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            stagedFile = { file: file, url: e.target.result, type: 'image' };
            fileThumbnailContainer.innerHTML = `<div class="relative inline-block"><img src="${stagedFile.url}" class="h-20 w-auto rounded-lg" />${rmBtn}</div>`;
            getEl('remove-file-btn').onclick = () => { stagedFile = null; fileThumbnailContainer.innerHTML = ''; fileInput.value = ''; };
        };
        reader.readAsDataURL(file);
    }
});

// Sidebar History Logic
function renderHistoryList() {
    if(!historyList) return;
    historyList.innerHTML = '';
    const config = themeColors[localStorage.getItem('theme') || 'dark'];
    
    Object.keys(chatHistories).sort().reverse().forEach(chatId => {
        const history = chatHistories[chatId];
        if (chatId === currentChatId && history.length === 0) return;
        let txt = "Chat mới";
        if (history.length > 0) {
             const c = history[0].content;
             if (typeof c === 'string') txt = c;
             else if (Array.isArray(c)) txt = c.some(p=>p.type==='image_url') ? '[Hình ảnh]' : '[Nội dung]';
        }
        
        const item = document.createElement('div');
        item.className = 'history-item flex items-center justify-between p-2 rounded-md cursor-pointer';
        if(config.historyHover) item.classList.add(...config.historyHover);
        item.dataset.chatId = chatId;
        
        item.innerHTML = `<span class="text-sm truncate">${txt.substring(0, 20)}...</span><button class="p-1 hover:text-red-500">&times;</button>`;
        item.querySelector('button').onclick = (e) => {
            e.stopPropagation(); delete chatHistories[chatId];
            if (currentChatId === chatId) startNewChat(); else renderHistoryList();
        };
        item.onclick = () => loadChatHistory(chatId);
        historyList.appendChild(item);
    });
    setActiveHistoryItem(currentChatId);
}

function loadChatHistory(chatId) {
    currentChatId = chatId;
    conversationHistory = chatHistories[chatId] || [];
    const container = getEl('chat-container');
    container.innerHTML = '';
    
    if(conversationHistory.length > 0) {
         getEl('initial-view').classList.add('hidden');
         container.classList.remove('hidden');
         getEl('mainContent').classList.add('justify-start');
         conversationHistory.forEach(msg => container.appendChild(createMessageElement(msg.content, msg.role)));
    } else {
         getEl('initial-view').classList.remove('hidden');
         container.classList.add('hidden');
         setGreeting();
    }
    setActiveHistoryItem(chatId);
}

function setActiveHistoryItem(chatId) {
    const config = themeColors[localStorage.getItem('theme') || 'dark'];
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove(...Object.values(themeColors).flatMap(t => t.historyActive).flat());
        if(item.dataset.chatId === chatId && config.historyActive) item.classList.add(...config.historyActive);
    });
}

// ENTRY POINT
document.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('theme') || 'dark';
    const lang = localStorage.getItem('language') || 'vi';
    switchLanguage(lang);
    applyTheme(theme);
    initializeApp();
    initTokenSystem();
    if(soundWaveButton) soundWaveButton.classList.remove('hidden');
    if(sendButton) sendButton.classList.add('hidden');
    updateModelButtonText();
    updateLearnButtonVisualState();
    
    if(messageInput) messageInput.addEventListener('input', () => {
        const hasText = messageInput.value.trim().length > 0;
        soundWaveButton.classList.toggle('hidden', hasText);
        sendButton.classList.toggle('hidden', !hasText);
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); startNewChat(); }
        const active = document.activeElement;
        const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
        if (!isInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey) if(messageInput) messageInput.focus();
    });
});

//=====================================================================//
// 6. INJECT CSS FOR SOURCE PILLS (TỰ ĐỘNG CHÈN STYLE)                 //
//=====================================================================//
(function addSourcePillStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Source Pill Style - Nút tròn đẹp */
        .source-pill {
            display: inline-flex;
            align-items: center;
            background-color: #2f3336;
            color: #e0e0e0 !important;
            text-decoration: none;
            font-size: 0.7rem;
            font-weight: 600;
            padding: 2px 10px;
            border-radius: 99px;
            margin: 0 2px 0 6px;
            vertical-align: middle;
            border: 1px solid #444;
            transition: all 0.2s ease;
            white-space: nowrap;
            opacity: 0.9;
        }
        .source-pill:hover {
            background-color: #1d9bf0;
            border-color: #1d9bf0;
            color: white !important;
            transform: translateY(-1px);
            opacity: 1;
            box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
        }
        /* Style cho Light Mode */
        body.text-black .source-pill {
            background-color: #eef1f5;
            color: #333 !important;
            border-color: #cbd5e1;
        }
        body.text-black .source-pill:hover {
            background-color: #2563eb;
            color: white !important;
            border-color: #2563eb;
        }
    `;
    document.head.appendChild(style);
})();
