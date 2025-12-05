// script.js - PHIÊN BẢN FINAL FIX (ICON MŨI TÊN & DỊCH FULL)
// Đã sửa: Nút Gửi luôn là Icon Mũi Tên (không hiện chữ), Dịch toàn bộ giao diện.

//=====================================================================//
// 1. CẤU HÌNH & DỮ LIỆU BAN ĐẦU                                     //
//=====================================================================//

// Kiểm tra khóa bảo mật
try {
    if (localStorage.getItem('isLocked') === 'true') {
        window.location.href = 'verify.html';
        throw new Error("App is locked requiring verification."); 
    }
} catch (e) { console.error("Security check error:", e); }

// Helper: Copy Code
window.copyToClipboard = function(btn) {
    try {
        const header = btn.closest('.code-box-header');
        if (!header) return;
        const contentDiv = header.nextElementSibling;
        const codeText = contentDiv.querySelector('code')?.innerText;
        if (!codeText) return;

        navigator.clipboard.writeText(codeText).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<span class="text-green-400 font-bold">Copied!</span>`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        });
    } catch (e) { console.error("Copy failed:", e); }
};

// Cấu hình Token
const tokenConfig = {
    IS_INFINITE: true,            
    MAX_TOKENS: 50,              
    TOKEN_COST_PER_MESSAGE: 1,    
    TOKEN_REGEN_INTERVAL_MINUTES: 5, 
    TOKEN_REGEN_AMOUNT: 1,        
};

// --- LUẬT NGÔN NGỮ (LANGUAGE ENFORCEMENT) ---
const LANGUAGE_RULES = {
    vi: "YÊU CẦU TUYỆT ĐỐI: Bạn PHẢI trả lời hoàn toàn bằng TIẾNG VIỆT.",
    en: "STRICT REQUIREMENT: You MUST answer entirely in ENGLISH.",
    zh: "STRICT REQUIREMENT: You MUST answer entirely in CHINESE (Simplified/简体中文).",
    ja: "STRICT REQUIREMENT: You MUST answer entirely in JAPANESE (日本語).",
    fr: "STRICT REQUIREMENT: You MUST answer entirely in FRENCH (Français).",
    es: "STRICT REQUIREMENT: You MUST answer entirely in SPANISH (Español).",
    hi: "STRICT REQUIREMENT: You MUST answer entirely in HINDI (हिंदी).",
    it: "STRICT REQUIREMENT: You MUST answer entirely in ITALIAN (Italiano)."
};

function generateSystemPrompt(mode, langCode) {
    const langRule = LANGUAGE_RULES[langCode] || LANGUAGE_RULES['en'];
    if (mode === 'tutor') {
        return `You are Oceep, an expert Tutor/Teacher.
        *** STRICT LANGUAGE REQUIREMENT ***
        ${langRule}
        *** INSTRUCTIONS ***
        1. METHOD: Do not just give the final answer. Explain the "Why" and "How".
        2. STYLE: Be educational, encouraging, but concise.`;
    } else {
        return `You are Oceep, a smart and helpful AI Assistant.
        *** STRICT LANGUAGE REQUIREMENT ***
        ${langRule}
        *** INSTRUCTIONS ***
        1. STYLE: Be CONCISE, SUCCINCT, and COMPLETE.
        2. CITATION: If you use search results, cite them as **[Source Name](URL)**.`;
    }
}

//=====================================================================//
// 2. DOM ELEMENTS & STATE MANAGEMENT                                //
//=====================================================================//

const getEl = (id) => document.getElementById(id);

// DOM Elements cần dịch
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
    // Tooltips (nếu dùng text riêng)
    randomTooltip: getEl('random-tooltip'),
    videoTooltip: getEl('video-tooltip'),
    learnTooltip: getEl('learn-tooltip'),
    langTooltip: getEl('lang-tooltip'),
    themeTooltip: getEl('theme-tooltip'),
    historyTooltip: getEl('history-tooltip'),
    newChatTooltip: getEl('new-chat-tooltip'),
};

const themeMenuButton = getEl('theme-menu-button');
const themeModal = getEl('theme-modal');
const themeOptionButtons = document.querySelectorAll('.theme-option');
const languageModal = getEl('language-modal');
const languageOptionButtons = document.querySelectorAll('.language-option');
const langSwitchBtn = getEl('lang-switch-btn');

const body = document.body;
const backgroundContainer = getEl('background-container');
const chatFormEl = getEl('chat-form');
const oceanImageUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop';

const sidebar = getEl('sidebar');
const sidebarToggle = getEl('sidebar-toggle');
const historyList = getEl('history-list');
const newChatHeaderBtn = getEl('new-chat-header-btn');
const sendButton = getEl('send-button');
const soundWaveButton = getEl('sound-wave-button');
const stopButton = getEl('stop-button');
const messageInput = getEl('message-input');

const randomPromptBtn = getEl('random-prompt-icon-btn');
const videoBtn = getEl('video-icon-btn');
const learnBtn = getEl('learn-icon-btn');
const modelButton = getEl('model-button');
const modelPopup = getEl('model-popup');

const uploadFileBtn = getEl('upload-file-btn');
const fileInput = getEl('file-input');
const fileThumbnailContainer = getEl('file-thumbnail-container');

// Token Inputs
const currentTokenInput = getEl('current-token-input');
const maxTokenInput = getEl('max-token-input');
const tokenInputsContainer = getEl('token-inputs-container');
const tokenInfinity = getEl('token-infinity');

// Global State
let stagedFile = null;
let currentLang = localStorage.getItem('language') || 'vi';
let isTutorMode = localStorage.getItem('isTutorMode') === 'true';
let abortController;
let isRandomPromptUsedInSession = false;
let conversationHistory = [];
let chatHistories = {};
let currentChatId = null;

let currentModel;
try {
    currentModel = JSON.parse(localStorage.getItem('currentModel'));
} catch (e) { currentModel = null; }
if (!currentModel) currentModel = { model: 'Mini', version: '' };

// --- TỪ ĐIỂN DỊCH (FULL) ---
const translations = {
    vi: {
        sidebarHeader: "Lịch sử Chat", newChatTitle: "Chat mới", messagePlaceholder: "Bạn muốn biết gì?", aiTypingPlaceholder: "AI đang trả lời...", footerText: "AI có thể mắc lỗi. Hãy kiểm tra thông tin.", themeModalTitle: "Giao Diện", languageModalTitle: "Ngôn Ngữ", themeDark: "Tối", themeLight: "Sáng", themeOcean: "Biển", modalClose: "Đóng", greetingMorning: "Chào buổi sáng", greetingNoon: "Chào buổi trưa", greetingAfternoon: "Chào buổi chiều", greetingEvening: "Chào buổi tối", comingSoon: "Sắp có", comingSoonTitle: "Sắp có...", comingSoonText: "Tính năng đang phát triển.", langTooltip: "Ngôn Ngữ", themeTooltip: "Giao Diện", historyTooltip: "Lịch Sử", newChatTooltip: "Mới", modelMiniDesc: "Nhanh", modelSmartDesc: "Thông minh", modelNerdDesc: "Chuyên sâu", randomButton: "Ngẫu nhiên", videoButton: "Video", learnButton: "Học tập"
    },
    en: {
        sidebarHeader: "History", newChatTitle: "New Chat", messagePlaceholder: "Ask me anything...", aiTypingPlaceholder: "AI replying...", footerText: "AI may err. Check info.", themeModalTitle: "Theme", languageModalTitle: "Language", themeDark: "Dark", themeLight: "Light", themeOcean: "Ocean", modalClose: "Close", greetingMorning: "Good morning", greetingNoon: "Good afternoon", greetingAfternoon: "Good afternoon", greetingEvening: "Good evening", comingSoon: "Coming Soon", comingSoonTitle: "Soon...", comingSoonText: "In dev.", langTooltip: "Language", themeTooltip: "Theme", historyTooltip: "History", newChatTooltip: "New", modelMiniDesc: "Fast", modelSmartDesc: "Smart", modelNerdDesc: "Deep", randomButton: "Random", videoButton: "Video", learnButton: "Learn"
    },
    zh: {
        sidebarHeader: "历史", newChatTitle: "新对话", messagePlaceholder: "你想知道什么？", aiTypingPlaceholder: "AI正在思考...", footerText: "AI可能犯错。请核实。", themeModalTitle: "主题", languageModalTitle: "语言", themeDark: "深色", themeLight: "浅色", themeOcean: "海洋", modalClose: "关闭", greetingMorning: "早上好", greetingNoon: "中午好", greetingAfternoon: "下午好", greetingEvening: "晚上好", comingSoon: "即将推出", comingSoonTitle: "即将推出...", comingSoonText: "开发中。", langTooltip: "语言", themeTooltip: "主题", historyTooltip: "历史", newChatTooltip: "新对话", modelMiniDesc: "快速", modelSmartDesc: "智能", modelNerdDesc: "深度", randomButton: "随机", videoButton: "视频", learnButton: "学习"
    },
    ja: {
        sidebarHeader: "履歴", newChatTitle: "新規チャット", messagePlaceholder: "何でも聞いて...", aiTypingPlaceholder: "AI応答中...", footerText: "AIは間違うことがあります。", themeModalTitle: "テーマ", languageModalTitle: "言語", themeDark: "ダーク", themeLight: "ライト", themeOcean: "海", modalClose: "閉じる", greetingMorning: "おはよう", greetingNoon: "こんにちは", greetingAfternoon: "こんにちは", greetingEvening: "こんばんは", comingSoon: "近日公開", comingSoonTitle: "近日公開", comingSoonText: "開発中", langTooltip: "言語", themeTooltip: "テーマ", historyTooltip: "履歴", newChatTooltip: "新規", modelMiniDesc: "高速", modelSmartDesc: "スマート", modelNerdDesc: "詳細", randomButton: "ランダム", videoButton: "動画", learnButton: "学習"
    },
    fr: {
        sidebarHeader: "Historique", newChatTitle: "Nouveau", messagePlaceholder: "Posez une question...", aiTypingPlaceholder: "L'IA écrit...", footerText: "L'IA peut se tromper.", themeModalTitle: "Thème", languageModalTitle: "Langue", themeDark: "Sombre", themeLight: "Clair", themeOcean: "Océan", modalClose: "Fermer", greetingMorning: "Bonjour", greetingNoon: "Bon après-midi", greetingAfternoon: "Bon après-midi", greetingEvening: "Bonsoir", comingSoon: "Bientôt", comingSoonTitle: "Bientôt...", comingSoonText: "En dév.", langTooltip: "Langue", themeTooltip: "Thème", historyTooltip: "Historique", newChatTooltip: "Nouveau", modelMiniDesc: "Rapide", modelSmartDesc: "Intelligent", modelNerdDesc: "Profond", randomButton: "Aléatoire", videoButton: "Vidéo", learnButton: "Apprendre"
    },
    es: {
        sidebarHeader: "Historial", newChatTitle: "Nuevo Chat", messagePlaceholder: "Pregúntame...", aiTypingPlaceholder: "IA escribiendo...", footerText: "La IA puede errar.", themeModalTitle: "Tema", languageModalTitle: "Idioma", themeDark: "Oscuro", themeLight: "Claro", themeOcean: "Océano", modalClose: "Cerrar", greetingMorning: "Buenos días", greetingNoon: "Buenas tardes", greetingAfternoon: "Buenas tardes", greetingEvening: "Buenas noches", comingSoon: "Pronto", comingSoonTitle: "Pronto...", comingSoonText: "En desarrollo.", langTooltip: "Idioma", themeTooltip: "Tema", historyTooltip: "Historial", newChatTooltip: "Nuevo", modelMiniDesc: "Rápido", modelSmartDesc: "Inteligente", modelNerdDesc: "Profundo", randomButton: "Aleatorio", videoButton: "Video", learnButton: "Aprender"
    },
    hi: {
        sidebarHeader: "इतिहास", newChatTitle: "नई चैट", messagePlaceholder: "कुछ भी पूछें...", aiTypingPlaceholder: "AI लिख रहा है...", footerText: "AI गलत हो सकता है।", themeModalTitle: "थीम", languageModalTitle: "भाषा", themeDark: "डार्क", themeLight: "लाइट", themeOcean: "सागर", modalClose: "बंद", greetingMorning: "नमस्ते", greetingNoon: "नमस्ते", greetingAfternoon: "नमस्ते", greetingEvening: "नमस्ते", comingSoon: "जल्द", comingSoonTitle: "जल्द...", comingSoonText: "विकास में।", langTooltip: "भाषा", themeTooltip: "थीम", historyTooltip: "इतिहास", newChatTooltip: "नई", modelMiniDesc: "तेज़", modelSmartDesc: "स्मार्ट", modelNerdDesc: "गहरा", randomButton: "रैंडम", videoButton: "वीडियो", learnButton: "सीखें"
    },
    it: {
        sidebarHeader: "Cronologia", newChatTitle: "Nuova Chat", messagePlaceholder: "Chiedimi...", aiTypingPlaceholder: "L'IA scrive...", footerText: "L'IA può sbagliare.", themeModalTitle: "Tema", languageModalTitle: "Lingua", themeDark: "Scuro", themeLight: "Chiaro", themeOcean: "Oceano", modalClose: "Chiudi", greetingMorning: "Buongiorno", greetingNoon: "Buon pomeriggio", greetingAfternoon: "Buon pomeriggio", greetingEvening: "Buonasera", comingSoon: "Presto", comingSoonTitle: "Presto...", comingSoonText: "In sviluppo.", langTooltip: "Lingua", themeTooltip: "Tema", historyTooltip: "Cronologia", newChatTooltip: "Nuovo", modelMiniDesc: "Veloce", modelSmartDesc: "Intelligente", modelNerdDesc: "Profondo", randomButton: "Casuale", videoButton: "Video", learnButton: "Impara"
    }
};

const randomPrompts = {
    vi: ["Giải thích lượng tử?", "Code game rắn săn mồi", "Cách ngủ ngon?", "Tóm tắt lịch sử VN", "Công thức phở bò"],
    en: ["Explain quantum physics?", "Code Snake game", "How to sleep better?", "Vietnam history summary", "Beef Pho recipe"],
    zh: ["解释量子物理", "贪吃蛇代码", "如何助眠", "越南历史概要", "牛肉粉食谱"],
    ja: ["量子力学とは？", "スネークゲームのコード", "睡眠改善法", "ベトナムの歴史", "フォーのレシピ"],
    fr: ["Physique quantique ?", "Jeu Snake code", "Mieux dormir ?", "Histoire Vietnam", "Recette Pho"],
    es: ["¿Física cuántica?", "Código juego Snake", "Dormir mejor", "Historia Vietnam", "Receta Pho"],
    hi: ["क्वांटम भौतिकी?", "स्नेक गेम कोड", "बेहतर नींद", "वियतनाम इतिहास", "फो रेसिपी"],
    it: ["Fisica quantistica?", "Codice Snake", "Dormire meglio", "Storia Vietnam", "Ricetta Pho"]
};

// Theme Colors
const themeColors = {
    dark: { bg: ['bg-gradient-to-br', 'from-[#212935]', 'to-black'], text: 'text-gray-100', subtleText: 'text-gray-400', logo: 'text-gray-100', iconColor: 'text-gray-300', popup: ['bg-gray-900', 'border', 'border-gray-700'], popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'], sidebar: ['bg-black/10', 'border-white/10'], historyActive: ['bg-blue-800/50'], historyHover: ['hover:bg-blue-800/30'], form: ['bg-black/30', 'border-white/20'], headerPill: [], aiMessage: ['text-gray-100'], userMessage: ['bg-blue-600', 'text-white'], inputColor: ['text-gray-200', 'placeholder-gray-500'] },
    light: { bg: ['bg-white'], text: 'text-black', subtleText: 'text-gray-600', logo: 'text-blue-500', iconColor: 'text-gray-800', popup: ['bg-white', 'border', 'border-gray-200', 'shadow-lg'], popupButton: ['text-gray-700', 'hover:bg-gray-100'], sidebar: ['bg-gray-50', 'border-r', 'border-gray-200'], historyActive: ['bg-blue-100'], historyHover: ['hover:bg-gray-200'], form: ['bg-gray-100', 'border', 'border-gray-300', 'shadow'], headerPill: [], aiMessage: ['text-black'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-black', 'placeholder-gray-400'] },
    ocean: { bgImage: `url('${oceanImageUrl}')`, text: 'text-white', subtleText: 'text-gray-300', logo: 'text-white', iconColor: 'text-white', popup: ['bg-black/70', 'backdrop-blur-md', 'border', 'border-white/10'], popupButton: ['text-gray-300', 'hover:bg-white/10'], sidebar: ['bg-black/10', 'border-white/10'], historyActive: ['bg-white/20'], historyHover: ['hover:bg-white/10'], form: ['bg-black/30', 'border-white/20'], headerPill: ['bg-black/30', 'backdrop-blur-lg', 'border', 'border-white/20'], aiMessage: ['text-white'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-white', 'placeholder-gray-300'] }
};

//=====================================================================//
// 3. CORE FUNCTIONS                                                 //
//=====================================================================//

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function saveStateToLocalStorage() {
    try {
        const h = { ...chatHistories };
        if (h[currentChatId] && h[currentChatId].length === 0) delete h[currentChatId];
        localStorage.setItem('chatHistories', JSON.stringify(h));
        localStorage.setItem('currentChatId', currentChatId);
    } catch(e) {}
}

function initializeApp() {
    const s = localStorage.getItem('chatHistories');
    chatHistories = s ? JSON.parse(s) : {};
    startNewChat(); 
}

function updateTokenUI() {
    if (tokenConfig.IS_INFINITE) {
        if (tokenInputsContainer) tokenInputsContainer.classList.add('hidden');
        if (tokenInfinity) tokenInfinity.classList.remove('hidden');
        return;
    }
    if (tokenInputsContainer) tokenInputsContainer.classList.remove('hidden');
    if (tokenInfinity) tokenInfinity.classList.add('hidden');

    const currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    if (currentTokenInput) currentTokenInput.textContent = currentTokens;
    if (maxTokenInput) maxTokenInput.textContent = tokenConfig.MAX_TOKENS;
}

function applyTheme(theme) {
    if (!themeColors[theme]) theme = 'dark';
    body.className = "flex flex-col h-screen overflow-hidden transition-colors duration-500";
    backgroundContainer.className = "fixed inset-0 -z-10 transition-all duration-500 bg-cover bg-center";
    backgroundContainer.style.backgroundImage = '';
    const config = themeColors[theme];
    const all = Object.values(themeColors);

    themeOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20');
        if (btn.dataset.theme === theme) btn.classList.add('bg-blue-500/20');
    });

    body.classList.remove(...all.flatMap(c => c.bg).flat());
    if (config.bgImage) {
        backgroundContainer.style.backgroundImage = config.bgImage;
        backgroundContainer.classList.add('image-overlay');
    } else {
        body.classList.add(...config.bg);
        backgroundContainer.classList.remove('image-overlay');
    }
    
    body.classList.remove(...all.map(c => c.text));
    body.classList.add(config.text);

    if(textElements.logoText) {
        textElements.logoText.classList.remove(...all.map(c => c.logo));
        textElements.logoText.classList.add(config.logo);
    }

    if(sidebar) {
        sidebar.classList.remove(...all.flatMap(c => c.sidebar || []).flat());
        sidebar.classList.add(...(config.sidebar || []));
    }
    if(chatFormEl) {
        chatFormEl.classList.remove(...all.flatMap(c => c.form || []).flat());
        chatFormEl.classList.add(...(config.form || []));
    }
    document.querySelectorAll('.header-pill-container').forEach(pill => {
        pill.classList.remove(...all.flatMap(c => c.headerPill || []).flat());
        pill.classList.add(...(config.headerPill || []));
    });

    const icons = [sidebarToggle, newChatHeaderBtn, langSwitchBtn, getEl('theme-icon'), randomPromptBtn, videoBtn, learnBtn, uploadFileBtn];
    icons.forEach(el => {
        if (el && el.querySelector && el.querySelector('svg')) el = el.querySelector('svg');
        if(el && el.classList) {
            el.classList.remove(...all.map(c => c.iconColor));
            el.classList.add(config.iconColor);
        }
    });
    
    if(messageInput) {
        messageInput.classList.remove(...all.flatMap(c => c.inputColor || []).flat());
        messageInput.classList.add(...(config.inputColor || []));
    }

    if(textElements.footer) {
        textElements.footer.classList.remove(...all.map(c => c.subtleText));
        textElements.footer.classList.add(config.subtleText);
    }
    
    if(modelPopup) {
        modelPopup.classList.remove(...all.flatMap(c => c.popup).flat());
        modelPopup.classList.add(...config.popup);
    }

    const chatContainer = getEl('chat-container');
    if (chatContainer) {
        chatContainer.querySelectorAll('.ai-message-wrapper').forEach(msg => {
            msg.classList.remove(...all.flatMap(c => c.aiMessage).flat());
            msg.classList.add(...config.aiMessage);
        });
        chatContainer.querySelectorAll('.user-message-wrapper').forEach(msg => {
            msg.classList.remove(...all.flatMap(c => c.userMessage).flat());
            msg.classList.add(...config.userMessage);
        });
    }

    localStorage.setItem('theme', theme);
    renderHistoryList();
    updateLearnButtonVisualState();
}

function switchLanguage(lang) {
    currentLang = lang; 
    const t = translations[lang] || translations['en']; 
    const setText = (el, txt) => { if(el) el.textContent = txt; };
    
    // Dịch các thành phần chính
    setText(textElements.sidebarHeader, t.sidebarHeader);
    if(textElements.input) textElements.input.placeholder = t.messagePlaceholder;
    setText(textElements.footer, t.footerText);
    setText(textElements.themeModalTitle, t.themeModalTitle);
    setText(textElements.languageModalTitle, t.languageModalTitle);
    setText(textElements.themeDarkText, t.themeDark);
    setText(textElements.themeLightText, t.themeLight);
    setText(textElements.themeOceanText, t.themeOcean);
    setText(textElements.closeModalButton, t.modalClose);
    setText(textElements.closeLanguageModalBtn, t.modalClose);
    setText(textElements.comingSoonTitle, t.comingSoonTitle);
    setText(textElements.comingSoonText, t.comingSoonText);
    setText(textElements.closeComingSoonModal, t.modalClose);
    
    // Dịch Tooltips & Text phụ
    const setTooltip = (el, txt) => { if(el) el.title = txt; };
    setTooltip(randomPromptBtn, t.randomButton);
    setTooltip(videoBtn, t.videoButton);
    setTooltip(learnBtn, t.learnButton);
    setTooltip(langSwitchBtn, t.langTooltip);

    setText(textElements.randomTooltip, t.randomButton);
    setText(textElements.videoTooltip, t.videoButton);
    setText(textElements.learnTooltip, t.learnButton);
    setText(textElements.langTooltip, t.langTooltip);
    setText(textElements.themeTooltip, t.themeTooltip);
    setText(textElements.historyTooltip, t.historyTooltip);
    setText(textElements.newChatTooltip, t.newChatTooltip);

    if(langSwitchBtn) langSwitchBtn.textContent = lang.toUpperCase();
    document.documentElement.lang = lang;
    localStorage.setItem('language', lang);
    
    languageOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20', 'text-blue-600');
        if (btn.dataset.lang === lang) btn.classList.add('bg-blue-500/20', 'text-blue-600');
    });

    updateModelButtonText();
    setGreeting();
    renderHistoryList();
    updateTokenUI();
}

function setGreeting() {
    const mt = getEl('main-title');
    if (!mt) return;
    const h = new Date().getHours();
    const t = translations[currentLang] || translations['en'];
    mt.textContent = (h < 11) ? t.greetingMorning : (h < 14) ? t.greetingNoon : (h < 18) ? t.greetingAfternoon : t.greetingEvening;
}

let isModalAnimating = false;
function showModal(modal, show) {
    if(!modal) return;
    if (isModalAnimating) return;
    isModalAnimating = true;
    const content = modal.querySelector('div[id$="-content"]');
    if (show) {
        modal.classList.remove('hidden');
        if(content) { content.classList.remove('modal-fade-leave'); content.classList.add('modal-fade-enter'); }
    } else {
        if(content) { content.classList.remove('modal-fade-enter'); content.classList.add('modal-fade-leave'); }
    }
    setTimeout(() => {
        if (!show) modal.classList.add('hidden');
        isModalAnimating = false;
    }, 300);
}

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

function updateModelButtonText() {
    const t = translations[currentLang] || translations['en'];
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
    const t = translations[currentLang] || translations['en'];
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
// 4. CHAT LOGIC & RENDER                                            //
//=====================================================================//

function shouldShowSearchStatus(text) {
    if (!text) return false;
    const skip = /(code|html|css|js|python|fix|bug|lỗi|toán|giải|dịch|translate|viết|văn|write)/i;
    const must = /(địa chỉ|ở đâu|chỗ nào|thời tiết|giá|tin tức|sự kiện|hôm nay|mới nhất|là gì|address|location|weather|price|news)/i;
    return !skip.test(text) && must.test(text);
}

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    
    if(getEl('chat-container')) getEl('chat-container').innerHTML = '';
    if(getEl('initial-view')) getEl('initial-view').classList.remove('hidden');
    if(getEl('chat-container')) getEl('chat-container').classList.add('hidden');
    if(getEl('mainContent')) { getEl('mainContent').classList.add('justify-center'); getEl('mainContent').classList.remove('justify-start'); }
    
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

// FORMATTER
function formatAIResponse(text) {
    if (!text) return '';
    const codeBlocks = [];
    let processedText = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang: lang || 'code', code: code });
        return `__CODE_BLOCK_${index}__`; 
    });

    const sourceRegex = /\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g;
    processedText = processedText.replace(sourceRegex, (match, name, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="source-pill" title="Nguồn: ${name}">${name}</a>`;
    });

    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-blue-400">$1</strong>');
    processedText = processedText.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2 border-b border-gray-500/50 pb-1">$1</h2>');
    processedText = processedText.replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-bold mt-3 mb-1">$1</h3>');
    
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

    processedText = processedText.replace(/\n/g, '<br>');

    processedText = processedText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const block = codeBlocks[index];
        const escapedCode = block.code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700 shadow-xl w-full"><div class="code-box-header flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700"><span class="text-xs text-gray-400 font-mono font-bold uppercase">${block.lang}</span><button onclick="copyToClipboard(this)" class="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition cursor-pointer bg-transparent border-none">Copy</button></div><div class="p-4 overflow-x-auto bg-[#1e1e1e]"><pre><code class="font-mono text-sm text-green-400 whitespace-pre">${escapedCode}</code></pre></div></div>`;
    });
    return processedText;
}

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

function renderMath(element) {
    if (typeof window.renderMathInElement === 'function') {
        window.renderMathInElement(element, {
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

async function typeWriterEffect(text, element) {
    if (!text) return;
    element.innerHTML = ''; 
    const words = text.split(/(?=\s)/g); 
    let currentText = "";
    const container = getEl('chat-container');
    for (const word of words) {
        currentText += word;
        element.innerHTML = formatAIResponse(currentText);
        if(container) container.scrollTop = container.scrollHeight;
        await new Promise(r => setTimeout(r, 10));
    }
    element.innerHTML = formatAIResponse(text);
}

// API STREAMING
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const API_URL = isLocal ? '/api/chat' : '/api/handler';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); 
        const combinedSignal = signal || controller.signal;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model: modelName, 
                messages: messages, 
                max_tokens: 2000, 
                temperature: 0.7 
            }),
            signal: combinedSignal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMsg = `Lỗi Server (${response.status})`;
            try { const err = await response.json(); if (err.error) errorMsg = err.error; } catch(e){}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const fullText = data.content || (data.choices && data.choices[0]?.message?.content) || ""; 
        
        await typeWriterEffect(fullText, aiMessageEl.firstChild);
        return fullText;

    } catch (error) {
        if (error.name === 'AbortError') {
            if (!signal?.aborted) {
                aiMessageEl.firstChild.innerHTML = `<span class="text-red-400 font-bold">⚠️ Quá thời gian chờ (Timeout). Vui lòng thử lại.</span>`;
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

// SUBMIT HANDLER
if(chatFormEl) {
    chatFormEl.addEventListener('submit', async function(event) {
        event.preventDefault();
        const message = messageInput.value.trim();
        if (!message && !stagedFile) return;

        if (!consumeToken()) return;

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

        const userContent = [];
        if (stagedFile) {
            if (stagedFile.type === 'image') userContent.push({ type: "image_url", image_url: { url: stagedFile.url } });
            else if (stagedFile.type === 'video') userContent.push({ type: "video_url", video_url: { url: stagedFile.url } });
        }
        if (message) userContent.push({ type: "text", text: message });

        const userEl = createMessageElement(userContent, 'user');
        chatContainer.appendChild(userEl);

        const historyContent = userContent.length === 1 && userContent[0].type === 'text' ? message : userContent;
        conversationHistory.push({ role: 'user', content: historyContent });
        renderHistoryList();

        messageInput.value = '';
        messageInput.dispatchEvent(new Event('input')); 
        stagedFile = null;
        if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
        isRandomPromptUsedInSession = true; 
        updateRandomButtonVisibility(); 
        chatContainer.scrollTop = chatContainer.scrollHeight;

        const aiEl = createMessageElement('', 'ai');
        aiEl.firstChild.classList.add('streaming'); 
        
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
            
            const systemContent = generateSystemPrompt(isTutorMode ? 'tutor' : 'assistant', currentLang);
            const messagesPayload = [
                { role: 'system', content: systemContent },
                ...conversationHistory
            ];

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

// Token (Minimal)
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

// Other UI Events
if(stopButton) stopButton.onclick = () => { if (abortController) abortController.abort(); };

if(randomPromptBtn) randomPromptBtn.onclick = () => {
    if (isRandomPromptUsedInSession) return;
    const prompts = randomPrompts[currentLang] || randomPrompts['vi'];
    messageInput.value = prompts[Math.floor(Math.random() * prompts.length)];
    chatFormEl.dispatchEvent(new Event('submit'));
};

if(videoBtn) videoBtn.onclick = () => alert(translations[currentLang].comingSoon);
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

// File Upload
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

// Sidebar History
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

// --- KHỞI CHẠY (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('theme') || 'dark';
    const lang = localStorage.getItem('language') || 'vi';

    // --- [MỚI] SET ARROW ICON NGAY LẬP TỨC ---
    if(sendButton) {
        // SVG Arrow Up Icon
        sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>`;
    }

    switchLanguage(lang); // Dịch các thành phần khác (trừ nút Gửi)
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

function handleUpdateLog() {
    const updateLogModal = getEl('update-log-modal');
    const closeUpdateLogBtn = getEl('close-update-log');
    const dontShowAgainCheckbox = getEl('dont-show-again');
    const updateLogVersion = '1.0.3'; 
    const hasSeenUpdate = localStorage.getItem('seenUpdateLogVersion');

    if (hasSeenUpdate !== updateLogVersion && updateLogModal) showModal(updateLogModal, true);

    const closeAndSavePreference = () => {
        if (dontShowAgainCheckbox && dontShowAgainCheckbox.checked) localStorage.setItem('seenUpdateLogVersion', updateLogVersion);
        showModal(updateLogModal, false);
    };

    if(closeUpdateLogBtn) closeUpdateLogBtn.addEventListener('click', closeAndSavePreference);
}

//=====================================================================//
// 6. INJECT CSS FOR SOURCE PILLS (Auto-run)                           //
//=====================================================================//
(function addSourcePillStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        .source-pill { display: inline-flex; align-items: center; background-color: #2f3336; color: #e0e0e0 !important; text-decoration: none; font-size: 0.7rem; font-weight: 600; padding: 2px 10px; border-radius: 99px; margin: 0 2px 0 6px; vertical-align: middle; border: 1px solid #444; transition: all 0.2s ease; white-space: nowrap; opacity: 0.9; }
        .source-pill:hover { background-color: #1d9bf0; border-color: #1d9bf0; color: white !important; transform: translateY(-1px); opacity: 1; box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3); }
        body.text-black .source-pill { background-color: #eef1f5; color: #333 !important; border-color: #cbd5e1; }
        body.text-black .source-pill:hover { background-color: #2563eb; color: white !important; border-color: #2563eb; }
    `;
    document.head.appendChild(style);
})();
