//=====================================================================//
// CONFIGURATION
//=====================================================================//
const tokenConfig = {
    IS_INFINITE: true,
    MAX_TOKENS: 50,
    TOKEN_COST_PER_MESSAGE: 1,
    TOKEN_REGEN_INTERVAL_MINUTES: 5,
    TOKEN_REGEN_AMOUNT: 1,
};

// --- DOM ELEMENTS ---
const themeMenuButton = document.getElementById('theme-menu-button');
const themeModal = document.getElementById('theme-modal');
const modalContent = document.getElementById('modal-content');
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

const uploadFileBtn = document.getElementById('upload-file-btn');
const fileInput = document.getElementById('file-input');
const fileThumbnailContainer = document.getElementById('file-thumbnail-container');
let stagedFile = null;

const tokenInputsContainer = document.getElementById('token-inputs-container');
const currentTokenInput = document.getElementById('current-token-input');
const maxTokenInput = document.getElementById('max-token-input');
const tokenInfinity = document.getElementById('token-infinity');

let currentLang = 'vi';
let isTutorMode = localStorage.getItem('isTutorMode') === 'true';
let currentModel = JSON.parse(localStorage.getItem('currentModel')) || { model: 'Mini', version: '' };
let abortController;
let isRandomPromptUsedInSession = false;
let conversationHistory = [];
let chatHistories = {};
let currentChatId = null;

const translations = {
    vi: {
        sidebarHeader: "Lịch sử Chat", newChatTitle: "Chat mới", messagePlaceholder: "Bạn muốn biết gì?", aiTypingPlaceholder: "AI đang trả lời...", outOfTokensPlaceholder: "Bạn đã hết lượt.", sendButton: "Gửi", stopButton: "Dừng", modelButtonDefault: "Expert", modelButtonPrefix: "Mô Hình", randomButton: "Ngẫu nhiên", videoButton: "Tạo Video", learnButton: "Học Tập", footerText: "AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.", themeModalTitle: "Chọn Giao Diện", languageModalTitle: "Chọn Ngôn Ngữ", themeDark: "Tối", themeLight: "Sáng", themeOcean: "Biển", modalClose: "Đóng", newChatHistory: "Cuộc trò chuyện mới", greetingMorning: "Chào buổi sáng", greetingNoon: "Chào buổi trưa", greetingAfternoon: "Chào buổi chiều", greetingEvening: "Chào buổi tối", errorPrefix: "Đã có lỗi xảy ra", comingSoon: "Sắp có", comingSoonTitle: "Sắp có...", comingSoonText: "Tính năng này đang được phát triển.", langTooltip: "Đổi Ngôn Ngữ", themeTooltip: "Đổi Giao Diện", historyTooltip: "Lịch Sử Chat", newChatTooltip: "Chat Mới", modelMiniDesc: "Nhanh và hiệu quả.", modelSmartDesc: "Cân bằng tốc độ và thông minh.", modelNerdDesc: "Suy luận cao, kết quả chuẩn xác."
    },
    en: {
        sidebarHeader: "Chat History", newChatTitle: "New Chat", messagePlaceholder: "What do you want to know?", aiTypingPlaceholder: "AI is replying...", outOfTokensPlaceholder: "You're out of tokens.", sendButton: "Send", stopButton: "Stop", modelButtonDefault: "Expert", modelButtonPrefix: "Model", randomButton: "Random", videoButton: "Create Video", learnButton: "Study", footerText: "AI can make mistakes. Check important info.", themeModalTitle: "Choose Theme", languageModalTitle: "Select Language", themeDark: "Dark", themeLight: "Light", themeOcean: "Ocean", modalClose: "Close", newChatHistory: "New Conversation", greetingMorning: "Good morning", greetingNoon: "Good afternoon", greetingAfternoon: "Good afternoon", greetingEvening: "Good evening", errorPrefix: "An error occurred", comingSoon: "Coming Soon", comingSoonTitle: "Coming Soon...", comingSoonText: "Under development.", langTooltip: "Switch Language", themeTooltip: "Change Theme", historyTooltip: "Chat History", newChatTooltip: "New Chat", modelMiniDesc: "Fast and efficient.", modelSmartDesc: "Balanced speed and intelligence.", modelNerdDesc: "Powerful model for complex answers."
    },
    zh: {
        sidebarHeader: "聊天历史", newChatTitle: "新聊天", messagePlaceholder: "你想知道什么？", aiTypingPlaceholder: "AI正在回复...", outOfTokensPlaceholder: "代币已用完。", sendButton: "发送", stopButton: "停止", modelButtonDefault: "专家", modelButtonPrefix: "模型", randomButton: "随机", videoButton: "创建视频", learnButton: "学习", footerText: "AI可能会犯错。", themeModalTitle: "选择主题", languageModalTitle: "选择语言", themeDark: "黑暗", themeLight: "光", themeOcean: "海洋", modalClose: "关闭", newChatHistory: "新对话", greetingMorning: "早上好", greetingNoon: "中午好", greetingAfternoon: "下午好", greetingEvening: "晚上好", errorPrefix: "发生错误", comingSoon: "即将推出", comingSoonTitle: "即将推出...", comingSoonText: "开发中。", langTooltip: "切换语言", themeTooltip: "更改主题", historyTooltip: "聊天历史", newChatTooltip: "新聊天", modelMiniDesc: "快速高效。", modelSmartDesc: "速度与智能的平衡。", modelNerdDesc: "强大的模型。"
    },
    hi: {
        sidebarHeader: "चैट इतिहास", newChatTitle: "नई चैट", messagePlaceholder: "आप क्या जानना चाहते हैं?", aiTypingPlaceholder: "एआई जवाब दे रहा है...", outOfTokensPlaceholder: "टोकन खत्म हो गए हैं।", sendButton: "भेजें", stopButton: "रुकें", modelButtonDefault: "विशेषज्ञ", modelButtonPrefix: "मॉडल", randomButton: "यादृच्छिक", videoButton: "वीडियो बनाएं", learnButton: "अध्ययन", footerText: "एआई गलतियाँ कर सकता है।", themeModalTitle: "थीम चुनें", languageModalTitle: "भाषा चुनें", themeDark: "अंधेरा", themeLight: "प्रकाश", themeOcean: "सागर", modalClose: "बंद करें", newChatHistory: "नई बातचीत", greetingMorning: "सुप्रभात", greetingNoon: "नमस्ते", greetingAfternoon: "नमस्ते", greetingEvening: "शुभ संध्या", errorPrefix: "त्रुटि हुई", comingSoon: "जल्द आ रहा है", comingSoonTitle: "जल्द आ रहा है...", comingSoonText: "विकास अधीन है।", langTooltip: "भाषा बदलें", themeTooltip: "थीम बदलें", historyTooltip: "चैट इतिहास", newChatTooltip: "नई चैट", modelMiniDesc: "तेज़ और कुशल।", modelSmartDesc: "गति और बुद्धिमत्ता का संतुलन।", modelNerdDesc: "शक्तिशाली मॉडल।"
    },
    es: {
        sidebarHeader: "Historial", newChatTitle: "Nuevo chat", messagePlaceholder: "¿Qué quieres saber?", aiTypingPlaceholder: "IA respondiendo...", outOfTokensPlaceholder: "Sin tokens.", sendButton: "Enviar", stopButton: "Detener", modelButtonDefault: "Experto", modelButtonPrefix: "Modelo", randomButton: "Aleatorio", videoButton: "Crear video", learnButton: "Estudiar", footerText: "La IA puede cometer errores.", themeModalTitle: "Elegir tema", languageModalTitle: "Idioma", themeDark: "Oscuro", themeLight: "Luz", themeOcean: "Océano", modalClose: "Cerrar", newChatHistory: "Nueva conversación", greetingMorning: "Buenos días", greetingNoon: "Buenas tardes", greetingAfternoon: "Buenas tardes", greetingEvening: "Buenas noches", errorPrefix: "Error", comingSoon: "Próximamente", comingSoonTitle: "Próximamente...", comingSoonText: "En desarrollo.", langTooltip: "Idioma", themeTooltip: "Tema", historyTooltip: "Historial", newChatTooltip: "Nuevo", modelMiniDesc: "Rápido y eficiente.", modelSmartDesc: "Equilibrio velocidad/inteligencia.", modelNerdDesc: "Modelo potente."
    },
    fr: {
        sidebarHeader: "Historique", newChatTitle: "Nouveau chat", messagePlaceholder: "Que voulez-vous savoir ?", aiTypingPlaceholder: "L'IA répond...", outOfTokensPlaceholder: "Plus de jetons.", sendButton: "Envoyer", stopButton: "Arrêter", modelButtonDefault: "Expert", modelButtonPrefix: "Modèle", randomButton: "Aléatoire", videoButton: "Vidéo", learnButton: "Étudier", footerText: "L'IA peut faire des erreurs.", themeModalTitle: "Thème", languageModalTitle: "Langue", themeDark: "Sombre", themeLight: "Lumière", themeOcean: "Océan", modalClose: "Fermer", newChatHistory: "Nouvelle conversation", greetingMorning: "Bonjour", greetingNoon: "Bon après-midi", greetingAfternoon: "Bon après-midi", greetingEvening: "Bonsoir", errorPrefix: "Erreur", comingSoon: "Bientôt", comingSoonTitle: "Bientôt...", comingSoonText: "En développement.", langTooltip: "Langue", themeTooltip: "Thème", historyTooltip: "Historique", newChatTooltip: "Nouveau", modelMiniDesc: "Rapide et efficace.", modelSmartDesc: "Équilibre vitesse/intelligence.", modelNerdDesc: "Modèle puissant."
    },
    ja: {
        sidebarHeader: "履歴", newChatTitle: "新しいチャット", messagePlaceholder: "何を知りたいですか？", aiTypingPlaceholder: "AIが返信中...", outOfTokensPlaceholder: "トークン切れ。", sendButton: "送信", stopButton: "停止", modelButtonDefault: "エキスパート", modelButtonPrefix: "モデル", randomButton: "ランダム", videoButton: "ビデオ作成", learnButton: "学習", footerText: "AIは間違うことがあります。", themeModalTitle: "テーマ", languageModalTitle: "言語", themeDark: "ダーク", themeLight: "ライト", themeOcean: "海", modalClose: "閉じる", newChatHistory: "新しい会話", greetingMorning: "おはよう", greetingNoon: "こんにちは", greetingAfternoon: "こんにちは", greetingEvening: "こんばんは", errorPrefix: "エラー", comingSoon: "近日公開", comingSoonTitle: "近日公開...", comingSoonText: "開発中。", langTooltip: "言語", themeTooltip: "テーマ", historyTooltip: "履歴", newChatTooltip: "新規", modelMiniDesc: "高速で効率的。", modelSmartDesc: "速度と知能のバランス。", modelNerdDesc: "強力なモデル。"
    },
    it: {
        sidebarHeader: "Cronologia", newChatTitle: "Nuova Chat", messagePlaceholder: "Cosa vuoi sapere?", aiTypingPlaceholder: "L'IA risponde...", outOfTokensPlaceholder: "Token esauriti.", sendButton: "Invia", stopButton: "Stop", modelButtonDefault: "Esperto", modelButtonPrefix: "Modello", randomButton: "Casuale", videoButton: "Crea Video", learnButton: "Studia", footerText: "L'IA può sbagliare.", themeModalTitle: "Tema", languageModalTitle: "Lingua", themeDark: "Scuro", themeLight: "Chiaro", themeOcean: "Oceano", modalClose: "Chiudi", newChatHistory: "Nuova Conversazione", greetingMorning: "Buongiorno", greetingNoon: "Buon pomeriggio", greetingAfternoon: "Buon pomeriggio", greetingEvening: "Buonasera", errorPrefix: "Errore", comingSoon: "Prossimamente", comingSoonTitle: "Prossimamente...", comingSoonText: "In sviluppo.", langTooltip: "Lingua", themeTooltip: "Tema", historyTooltip: "Cronologia", newChatTooltip: "Nuova", modelMiniDesc: "Veloce ed efficiente.", modelSmartDesc: "Equilibrio velocità/intelligenza.", modelNerdDesc: "Modello potente."
    }
};

const textElements = {
    header: document.getElementById('header-title'),
    main: document.getElementById('main-title'),
    input: document.getElementById('message-input'),
    footer: document.getElementById('footer-text'),
    themeIcon: document.getElementById('theme-icon'),
    logoText: document.getElementById('logo-text'),
    sidebarHeader: document.getElementById('sidebar-header'),
    modelBtnText: document.getElementById('model-button-text-display'),
    themeModalTitle: document.getElementById('theme-modal-title'),
    languageModalTitle: document.getElementById('language-modal-title'),
    themeDarkText: document.getElementById('theme-dark-text'),
    themeLightText: document.getElementById('theme-light-text'),
    themeOceanText: document.getElementById('theme-ocean-text'),
    closeModalButton: document.getElementById('close-modal-button'),
    closeLanguageModalBtn: document.getElementById('close-language-modal-button'),
    comingSoonTitle: document.getElementById('coming-soon-title'),
    comingSoonText: document.getElementById('coming-soon-text'),
    closeComingSoonModal: document.getElementById('close-coming-soon-modal'),
    randomTooltip: document.getElementById('random-tooltip'),
    videoTooltip: document.getElementById('video-tooltip'),
    learnTooltip: document.getElementById('learn-tooltip'),
    langTooltip: document.getElementById('lang-tooltip'),
    themeTooltip: document.getElementById('theme-tooltip'),
    historyTooltip: document.getElementById('history-tooltip'),
    newChatTooltip: document.getElementById('new-chat-tooltip'),
};

// ... (Theme colors and basic functions stay the same) ...
const themeColors = {
    dark: { bg: ['bg-gradient-to-br', 'from-[#212935]', 'to-black'], text: 'text-gray-100', subtleText: 'text-gray-400', logo: 'text-gray-100', iconColor: 'text-gray-300', popup: ['bg-gray-900', 'border', 'border-gray-700'], popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'], popupSelected: ['bg-sky-500/20', '!text-sky-300', 'font-semibold'], sidebar: ['bg-black/10', 'border-white/10'], sidebarText: 'text-gray-200', historyActive: ['bg-blue-800/50'], historyHover: ['hover:bg-blue-800/30'], form: ['bg-black/30', 'border-white/20'], headerPill: [], aiMessage: ['text-gray-100'], userMessage: ['bg-blue-600', 'text-white'], inputColor: ['text-gray-200', 'placeholder-gray-500'] },
    light: { bg: ['bg-white'], text: 'text-black', subtleText: 'text-gray-600', logo: 'text-blue-500', iconColor: 'text-gray-800', popup: ['bg-white', 'border', 'border-gray-200', 'shadow-lg'], popupButton: ['text-gray-700', 'hover:bg-gray-100'], popupSelected: ['bg-blue-100', '!text-blue-600', 'font-semibold'], sidebar: ['bg-gray-50', 'border-r', 'border-gray-200'], sidebarText: 'text-black', historyActive: ['bg-blue-100'], historyHover: ['hover:bg-gray-200'], form: ['bg-gray-100', 'border', 'border-gray-300', 'shadow'], headerPill: [], aiMessage: ['text-black'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-black', 'placeholder-gray-400'] },
    ocean: { bgImage: `url('${oceanImageUrl}')`, text: 'text-white', subtleText: 'text-gray-300', logo: 'text-white', iconColor: 'text-white', popup: ['bg-black/70', 'backdrop-blur-md', 'border', 'border-white/10'], popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'], popupSelected: ['bg-sky-400/20', '!text-sky-300', 'font-semibold'], sidebar: ['bg-black/10', 'border-white/10'], sidebarText: 'text-white', historyActive: ['bg-white/20'], historyHover: ['hover:bg-white/10'], form: ['bg-black/30', 'border-white/20'], headerPill: ['bg-black/30', 'backdrop-blur-lg', 'border', 'border-white/20'], aiMessage: ['text-white'], userMessage: ['bg-blue-500', 'text-white'], inputColor: ['text-white', 'placeholder-gray-300'] }
};

function saveStateToLocalStorage() {
    const historiesToSave = { ...chatHistories };
    if (historiesToSave[currentChatId] && historiesToSave[currentChatId].length === 0) delete historiesToSave[currentChatId];
    localStorage.setItem('chatHistories', JSON.stringify(historiesToSave));
    localStorage.setItem('currentChatId', currentChatId);
}

function initializeApp() {
    const savedHistories = localStorage.getItem('chatHistories');
    chatHistories = savedHistories ? JSON.parse(savedHistories) : {};
    startNewChat();
}

function applyTheme(theme) {
    body.className = "flex flex-col h-screen overflow-hidden transition-colors duration-500";
    backgroundContainer.className = "fixed inset-0 -z-10 transition-all duration-500 bg-cover bg-center";
    backgroundContainer.style.backgroundImage = '';
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
    textElements.logoText.classList.remove(...allConfigs.map(c => c.logo));
    textElements.logoText.classList.add(config.logo);

    const sidebarEl = document.getElementById('sidebar');
    const formEl = document.getElementById('chat-form');
    const pillEls = document.querySelectorAll('.header-pill-container');
    sidebarEl.classList.remove(...allConfigs.flatMap(c => c.sidebar || []).flat());
    sidebarEl.classList.add(...(config.sidebar || []));
    formEl.classList.remove(...allConfigs.flatMap(c => c.form || []).flat());
    formEl.classList.add(...(config.form || []));
    pillEls.forEach(pill => {
        pill.classList.remove(...allConfigs.flatMap(c => c.headerPill || []).flat());
        pill.classList.add(...(config.headerPill || []));
    });

    const themeableIconEls = [sidebarToggle.querySelector('svg'), newChatHeaderBtn.querySelector('svg'), langSwitchBtn, document.getElementById('theme-icon'), document.querySelector('#random-prompt-icon-btn svg'), document.querySelector('#video-icon-btn svg'), document.querySelector('#learn-icon-btn svg'), document.querySelector('#upload-file-btn svg')];
    themeableIconEls.forEach(el => {
        if (el) {
            el.classList.remove(...allConfigs.map(c => c.iconColor));
            el.classList.add(config.iconColor);
        }
    });
    
    const messageInputEl = document.getElementById('message-input');
    messageInputEl.classList.remove(...allConfigs.flatMap(c => c.inputColor || []).flat());
    messageInputEl.classList.add(...(config.inputColor || []));

    textElements.footer.classList.remove(...allConfigs.map(c => c.subtleText));
    textElements.footer.classList.add(config.subtleText);
    document.querySelector('#token-display svg').classList.remove(...allConfigs.map(c => c.iconColor));
    document.querySelector('#token-display svg').classList.add(config.iconColor);

    const modelPopup = document.getElementById('model-popup');
    modelPopup.classList.remove(...allConfigs.flatMap(c => c.popup).flat());
    modelPopup.classList.add(...config.popup);

    if (document.getElementById('chat-container')) {
        document.querySelectorAll('.ai-message-wrapper').forEach(msg => {
            msg.classList.remove(...allConfigs.flatMap(c => c.aiMessage || []).flat());
            msg.classList.add(...config.aiMessage);
        });
        document.querySelectorAll('.user-message-wrapper').forEach(msg => {
            msg.classList.remove(...allConfigs.flatMap(c => c.userMessage || []).flat());
            msg.classList.add(...config.userMessage);
        });
    }
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
    const t = translations[lang];
    textElements.sidebarHeader.textContent = t.sidebarHeader;
    textElements.input.placeholder = t.messagePlaceholder;
    textElements.footer.textContent = t.footerText;
    textElements.themeModalTitle.textContent = t.themeModalTitle;
    textElements.languageModalTitle.textContent = t.languageModalTitle;
    textElements.themeDarkText.textContent = t.themeDark;
    textElements.themeLightText.textContent = t.themeLight;
    textElements.themeOceanText.textContent = t.themeOcean;
    textElements.closeModalButton.textContent = t.modalClose;
    textElements.closeLanguageModalBtn.textContent = t.modalClose;
    textElements.comingSoonTitle.textContent = t.comingSoonTitle;
    textElements.comingSoonText.textContent = t.comingSoonText;
    textElements.closeComingSoonModal.textContent = t.modalClose;
    textElements.randomTooltip.textContent = t.randomButton;
    textElements.videoTooltip.textContent = t.videoButton;
    textElements.learnTooltip.textContent = t.learnButton;
    textElements.langTooltip.textContent = t.langTooltip;
    textElements.themeTooltip.textContent = t.themeTooltip;
    textElements.historyTooltip.textContent = t.historyTooltip;
    textElements.newChatTooltip.textContent = t.newChatTooltip;
    langSwitchBtn.textContent = lang.toUpperCase();
    document.documentElement.lang = lang;
    localStorage.setItem('language', lang);
    updateActiveLanguageButton(lang);
    updateModelButtonText();
    setGreeting();
    renderHistoryList();
    updateTokenUI();
}

let isModalAnimating = false;
function showModal(modal, show) {
    if (isModalAnimating && (modal === themeModal || modal === languageModal || modal === document.getElementById('update-log-modal') || modal === comingSoonModal)) return;
    isModalAnimating = true;
    const content = modal.querySelector('div[id$="-content"]');
    if (show) {
        modal.classList.remove('hidden');
        content.classList.remove('modal-fade-leave');
        content.classList.add('modal-fade-enter');
    } else {
        content.classList.remove('modal-fade-enter');
        content.classList.add('modal-fade-leave');
    }
    setTimeout(() => {
        if (!show) modal.classList.add('hidden');
        isModalAnimating = false;
    }, 300);
}

function toggleThemeModal() { showModal(themeModal, themeModal.classList.contains('hidden')); }

function setGreeting() {
    const mainTitle = document.getElementById('main-title');
    if (!mainTitle) return;
    const now = new Date();
    const hour = now.getHours();
    const t = translations[currentLang];
    let greeting = hour >= 5 && hour < 11 ? t.greetingMorning : hour >= 11 && hour < 14 ? t.greetingNoon : hour >= 14 && hour < 18 ? t.greetingAfternoon : t.greetingEvening;
    mainTitle.textContent = greeting;
}

themeMenuButton.addEventListener('click', toggleThemeModal);
closeModalButton.addEventListener('click', () => showModal(themeModal, false));
themeModal.addEventListener('click', (e) => { if (e.target === themeModal) showModal(themeModal, false); });
themeOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        applyTheme(button.getAttribute('data-theme'));
        showModal(themeModal, false);
    });
});
sidebarToggle.addEventListener('click', () => { sidebar.classList.toggle('-translate-x-full'); sidebar.classList.toggle('hidden'); });

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    document.getElementById('chat-container').innerHTML = '';
    document.getElementById('initial-view').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
    document.getElementById('mainContent').classList.add('justify-center');
    document.getElementById('mainContent').classList.remove('justify-start');
    setGreeting();
    isRandomPromptUsedInSession = false;
    updateRandomButtonVisibility();
    renderHistoryList();
    setActiveHistoryItem(currentChatId);
    saveStateToLocalStorage();
}

function updateRandomButtonVisibility() {
    randomPromptBtn.classList.toggle('hidden', conversationHistory.length !== 0 || isRandomPromptUsedInSession);
}

function renderHistoryList() {
    historyList.innerHTML = '';
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme];
    Object.keys(chatHistories).sort().reverse().forEach(chatId => {
        const history = chatHistories[chatId];
        if (chatId === currentChatId && history.length === 0) return;
        let firstMessageText = translations[currentLang].newChatHistory;
        if (history.length > 0) {
            const firstContent = history[0].content;
            if (typeof firstContent === 'string') firstMessageText = firstContent;
            else if (Array.isArray(firstContent)) {
                const mediaPart = firstContent.find(p => p.type === 'image_url' || p.type === 'video_url');
                const textPart = firstContent.find(p => p.type === 'text');
                if (mediaPart) firstMessageText = mediaPart.type === 'image_url' ? '[Hình ảnh]' : '[Video]';
                if (textPart && textPart.text) firstMessageText = (mediaPart ? firstMessageText + " " : "") + textPart.text;
            }
        }
        const item = document.createElement('div');
        item.className = 'history-item flex items-center justify-between p-2 rounded-md cursor-pointer';
        item.classList.add(...themeConfig.historyHover);
        item.dataset.chatId = chatId;
        const text = document.createElement('span');
        text.className = 'text-sm truncate';
        text.textContent = firstMessageText.substring(0, 25) + (firstMessageText.length > 25 ? '...' : '');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'p-1 rounded-md hover:bg-red-500/20 text-gray-500 hover:text-red-500';
        deleteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            delete chatHistories[chatId];
            if (currentChatId === chatId) startNewChat();
            else { saveStateToLocalStorage(); renderHistoryList(); }
        };
        item.appendChild(text);
        item.appendChild(deleteBtn);
        item.onclick = () => loadChatHistory(chatId);
        historyList.appendChild(item);
    });
    if (currentChatId) setActiveHistoryItem(currentChatId);
}

function loadChatHistory(chatId) {
    currentChatId = chatId;
    conversationHistory = chatHistories[chatId] || [];
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    if (conversationHistory.length > 0) {
        document.getElementById('initial-view').classList.add('hidden');
        chatContainer.classList.remove('hidden');
        document.getElementById('mainContent').classList.remove('justify-center');
        document.getElementById('mainContent').classList.add('justify-start');
        conversationHistory.forEach(msg => chatContainer.appendChild(createMessageElement(msg.content, msg.role)));
        if (window.MathJax) MathJax.typesetPromise([chatContainer]);
    } else {
        document.getElementById('initial-view').classList.remove('hidden');
        chatContainer.classList.add('hidden');
        setGreeting();
    }
    setActiveHistoryItem(chatId);
    updateRandomButtonVisibility();
    saveStateToLocalStorage();
}

function setActiveHistoryItem(chatId) {
    const themeConfig = themeColors[localStorage.getItem('theme') || 'dark'];
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove(...Object.values(themeColors).flatMap(t => t.historyActive).flat());
        if (item.dataset.chatId === chatId) item.classList.add(...themeConfig.historyActive);
    });
}

newChatHeaderBtn.addEventListener('click', startNewChat);

document.addEventListener('DOMContentLoaded', () => {
    switchLanguage(localStorage.getItem('language') || 'vi');
    applyTheme(localStorage.getItem('theme') || 'dark');
    initializeApp();
    handleUpdateLog();
    initTokenSystem();
    soundWaveButton.classList.remove('hidden');
    sendButton.classList.add('hidden');
    updateModelButtonText();
    updateLearnButtonVisualState();
    messageInput.addEventListener('input', () => {
        const hasText = messageInput.value.trim().length > 0;
        soundWaveButton.classList.toggle('hidden', hasText);
        sendButton.classList.toggle('hidden', !hasText);
        if (hasText) { isRandomPromptUsedInSession = true; updateRandomButtonVisibility(); }
    });
    if (!document.getElementById('initial-view').classList.contains('hidden')) document.getElementById('main-title').classList.add('animate-fade-up');
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); startNewChat(); }
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) messageInput.focus();
    });
});

function handleUpdateLog() {
    const updateLogModal = document.getElementById('update-log-modal');
    const version = '1.0.3'; // Incremented version
    if (localStorage.getItem('seenUpdateLogVersion') !== version) showModal(updateLogModal, true);
    const close = () => {
        if (document.getElementById('dont-show-again').checked) localStorage.setItem('seenUpdateLogVersion', version);
        showModal(updateLogModal, false);
    };
    document.getElementById('close-update-log').addEventListener('click', close);
    updateLogModal.addEventListener('click', (e) => { if(e.target === updateLogModal) close(); });
}

function initTokenSystem() {
    if (tokenConfig.IS_INFINITE) { updateTokenUI(); return; }
    if (!localStorage.getItem('maxTokens')) localStorage.setItem('maxTokens', tokenConfig.MAX_TOKENS);
    if (!localStorage.getItem('userTokens')) { localStorage.setItem('userTokens', tokenConfig.MAX_TOKENS); localStorage.setItem('lastTokenRegenTimestamp', Date.now()); }
    currentTokenInput.addEventListener('change', handleTokenInputChange);
    maxTokenInput.addEventListener('change', handleTokenInputChange);
    regenerateTokens();
    setInterval(regenerateTokens, 60000);
}

function handleTokenInputChange() {
    let cur = parseInt(currentTokenInput.value), max = parseInt(maxTokenInput.value);
    if (isNaN(max) || max < 1) max = parseInt(localStorage.getItem('maxTokens')) || tokenConfig.MAX_TOKENS;
    if (isNaN(cur) || cur < 0) cur = 0;
    if (cur > max) cur = max;
    localStorage.setItem('userTokens', cur);
    localStorage.setItem('maxTokens', max);
    updateTokenUI();
}

function regenerateTokens() {
    if (tokenConfig.IS_INFINITE) return;
    const max = parseInt(localStorage.getItem('maxTokens')), last = parseInt(localStorage.getItem('lastTokenRegenTimestamp') || Date.now());
    let cur = parseInt(localStorage.getItem('userTokens') || '0');
    if (cur >= max) { updateTokenUI(); return; }
    const elapsed = Date.now() - last, interval = tokenConfig.TOKEN_REGEN_INTERVAL_MINUTES * 60000;
    if (elapsed >= interval) {
        cur = Math.min(max, cur + Math.floor(elapsed / interval) * tokenConfig.TOKEN_REGEN_AMOUNT);
        localStorage.setItem('userTokens', cur);
        localStorage.setItem('lastTokenRegenTimestamp', Date.now());
    }
    updateTokenUI();
}

function updateTokenUI() {
    messageInput.disabled = false;
    if (tokenConfig.IS_INFINITE) {
        tokenInputsContainer.classList.add('hidden');
        tokenInfinity.classList.remove('hidden');
        messageInput.placeholder = translations[currentLang].messagePlaceholder;
        return;
    }
    tokenInputsContainer.classList.remove('hidden');
    tokenInfinity.classList.add('hidden');
    const cur = parseInt(localStorage.getItem('userTokens') || '0'), max = parseInt(localStorage.getItem('maxTokens') || tokenConfig.MAX_TOKENS);
    currentTokenInput.value = cur;
    maxTokenInput.value = max;
    if (cur < tokenConfig.TOKEN_COST_PER_MESSAGE) { messageInput.disabled = true; messageInput.placeholder = translations[currentLang].outOfTokensPlaceholder; }
    else messageInput.placeholder = translations[currentLang].messagePlaceholder;
}

function consumeToken() {
    if (tokenConfig.IS_INFINITE) return true;
    let cur = parseInt(localStorage.getItem('userTokens') || '0');
    if (cur >= tokenConfig.TOKEN_COST_PER_MESSAGE) {
        localStorage.setItem('userTokens', cur - tokenConfig.TOKEN_COST_PER_MESSAGE);
        updateTokenUI();
        return true;
    }
    return false;
}

const chatForm = document.getElementById('chat-form');
randomPromptBtn.addEventListener('click', () => {
    if (isRandomPromptUsedInSession) return;
    const p = randomPrompts[currentLang];
    messageInput.value = p[Math.floor(Math.random() * p.length)];
    messageInput.dispatchEvent(new Event('input'));
    isRandomPromptUsedInSession = true;
    updateRandomButtonVisibility();
    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
});
videoBtn.addEventListener('click', () => alert(translations[currentLang].comingSoon));
learnBtn.addEventListener('click', () => { isTutorMode = !isTutorMode; localStorage.setItem('isTutorMode', isTutorMode); updateLearnButtonVisualState(); });

function updateModelButtonText() { textElements.modelBtnText.textContent = (currentModel && currentModel.model) ? currentModel.model : translations[currentLang].modelButtonDefault; }

const showInitialModels = () => {
    modelPopup.innerHTML = '';
    const t = translations[currentLang];
    const models = [
        { text: 'Mini', description: t.modelMiniDesc, model: 'Mini', icon: `<svg class="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>` },
        { text: 'Smart', description: t.modelSmartDesc, model: 'Smart', icon: `<svg class="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.311a7.5 7.5 0 01-7.5 0c-1.255 0-2.443-.29-3.5-.832a7.5 7.5 0 0114.5.032c-.318.13-.644.242-.984.326a7.5 7.5 0 01-4.016.033z" /></svg>` },
        { text: 'Nerd', description: t.modelNerdDesc, model: 'Nerd', icon: `<svg class="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>` }
    ];
    models.forEach(m => {
        const btn = createModelButton(m.text, m.description, m.model, '', m.icon);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentModel = { model: btn.dataset.model, version: null };
            localStorage.setItem('currentModel', JSON.stringify(currentModel));
            updateModelButtonText();
            modelPopup.classList.add('hidden');
        });
        modelPopup.appendChild(btn);
    });
};
modelButton.addEventListener('click', (e) => { e.stopPropagation(); showInitialModels(); modelPopup.classList.toggle('hidden'); });
document.addEventListener('click', (e) => { if (!modelButton.contains(e.target) && !modelPopup.contains(e.target)) modelPopup.classList.add('hidden'); });
langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
languageModal.addEventListener('click', (e) => { if(e.target === languageModal) showModal(languageModal, false); });
languageOptionButtons.forEach(btn => btn.addEventListener('click', () => { switchLanguage(btn.dataset.lang); showModal(languageModal, false); }));

function formatAIResponse(text) {
    let formatted = text.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold text-blue-300 mt-4 mb-2 border-b border-gray-500/30 pb-1">$1</h2>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

function createMessageElement(content, sender) {
    const row = document.createElement('div');
    row.classList.add('flex', 'w-full', 'mb-4');
    const wrapper = document.createElement('div');
    const themeConfig = themeColors[localStorage.getItem('theme') || 'dark'];
    
    if (sender === 'user') {
        row.classList.add('justify-end', 'user-message');
        wrapper.className = 'user-message-wrapper animate-pop-in px-5 py-3 rounded-3xl max-w-4xl shadow-md flex flex-col gap-2';
        wrapper.classList.add(...themeConfig.userMessage);
        if (Array.isArray(content)) {
            content.forEach(p => {
                if (p.type === 'image_url') { const i = document.createElement('img'); i.src = p.image_url.url; i.className = 'rounded-lg max-w-xs'; wrapper.appendChild(i); }
                else if (p.type === 'video_url') { const v = document.createElement('video'); v.src = p.video_url.url; v.className = 'rounded-lg max-w-xs'; v.controls = true; wrapper.appendChild(v); }
                else if (p.type === 'text') { const t = document.createElement('div'); t.innerHTML = p.text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); wrapper.appendChild(t); }
            });
        } else wrapper.innerHTML = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else {
        row.classList.add('justify-start');
        wrapper.className = 'ai-message-wrapper animate-pop-in max-w-4xl';
        wrapper.classList.add(...themeConfig.aiMessage);
        wrapper.innerHTML = formatAIResponse(content);
    }
    row.appendChild(wrapper);
    return row;
}

const systemPrompts = {
    vi: { tutor: "Bạn là Oceep, gia sư AI. Yêu cầu: Tiếng Việt chuẩn, đúng chính tả. Dùng '##' cho tiêu đề. Dùng LaTeX cho toán.", assistant: "Bạn là Oceep. Trả lời ngắn gọn. Yêu cầu: Tiếng Việt chuẩn, đúng chính tả. Dùng '##' cho tiêu đề. Dùng LaTeX cho toán." },
    en: { tutor: "You are Oceep, AI tutor. Req: Perfect grammar. Use '##' for headers. Use LaTeX for math.", assistant: "You are Oceep. Req: Perfect grammar. Use '##' for headers. Use LaTeX for math." },
    ja: { tutor: "Oceepです。正確な日本語と文法。見出しは「##」。数式はLaTeX。", assistant: "Oceepです。簡潔に。正確な日本語。見出しは「##」。数式はLaTeX。" },
    it: { tutor: "Sei Oceep. Grammatica perfetta. Usa '##' per intestazioni. LaTeX per matematica.", assistant: "Sei Oceep. Conciso. Grammatica perfetta. Usa '##' per intestazioni. LaTeX per matematica." }
};

async function streamAIResponse(modelName, messages, aiMessageEl, signal, token) {
    const langPrompts = systemPrompts[currentLang] || systemPrompts['en'];
    const systemMsg = { role: 'system', content: isTutorMode ? langPrompts.tutor : langPrompts.assistant };
    const fullMsgs = [systemMsg, ...messages];
    
    // --- CLOUDFLARE CONFIG ---
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    const CLOUDFLARE_PROJECT_URL = ''; // Điền URL nếu test local
    const API_URL = (isLocal && CLOUDFLARE_PROJECT_URL) ? `${CLOUDFLARE_PROJECT_URL}/api/handler` : '/api/handler';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelName, messages: fullMsgs, max_tokens: 4000, temperature: 0.7,
                token: token // Gửi Captcha Token
            }),
            signal
        });

        if (!response.ok) {
            let msg = `Server Error (${response.status})`;
            try { const err = await response.json(); if(err.error) msg = err.error; } catch(e){}
            throw new Error(msg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = line.substring(6).trim();
                    if (json === '[DONE]') break;
                    try {
                        const data = JSON.parse(json);
                        const content = data.choices?.[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            aiMessageEl.firstChild.innerHTML = formatAIResponse(fullText);
                            const chatContainer = document.getElementById('chat-container');
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }
                    } catch (e) {}
                }
            }
        }
        return fullText;
    } catch (error) {
        if (error.name === 'AbortError') return aiMessageEl.firstChild.innerText;
        let msg = "Lỗi kết nối.";
        if (error.message.includes('403')) msg = "Xác thực Captcha thất bại.";
        else if (error.message.includes('404')) msg = "Không tìm thấy API.";
        else msg = `Lỗi: ${error.message}`;
        aiMessageEl.firstChild.innerHTML = `<span class="text-red-400">${msg}</span>`;
        throw error;
    }
}

chatForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    // --- CAPTCHA CHECK ---
    const formData = new FormData(chatForm);
    const token = formData.get('cf-turnstile-response');
    if (!token) { alert("Vui lòng xác thực bạn không phải là Robot!"); return; }
    // ---------------------

    const message = messageInput.value.trim();
    if (!message && !stagedFile) return;
    if (!consumeToken()) return;

    if (!document.getElementById('initial-view').classList.contains('hidden')) {
        document.getElementById('initial-view').classList.add('hidden');
        document.getElementById('chat-container').classList.remove('hidden');
        document.getElementById('mainContent').classList.remove('justify-center');
        document.getElementById('mainContent').classList.add('justify-start');
    }

    const userContent = [];
    if (stagedFile) userContent.push({ type: stagedFile.type === 'image' ? "image_url" : "video_url", [stagedFile.type === 'image' ? "image_url" : "video_url"]: { url: stagedFile.url } });
    if (message) userContent.push({ type: "text", text: message });

    const chatContainer = document.getElementById('chat-container');
    chatContainer.appendChild(createMessageElement(userContent, 'user'));
    conversationHistory.push({ role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? message : userContent });
    renderHistoryList();

    messageInput.value = '';
    messageInput.dispatchEvent(new Event('input'));
    stagedFile = null;
    fileThumbnailContainer.innerHTML = '';
    isRandomPromptUsedInSession = true;
    updateRandomButtonVisibility();
    
    // Reset Captcha sau khi gửi (để bắt xác thực lại cho lần sau nếu muốn, hoặc để đó)
    try { turnstile.reset(); } catch(e) {}

    const aiMessageEl = createMessageElement('', 'ai');
    aiMessageEl.firstChild.classList.add('streaming');
    chatContainer.appendChild(aiMessageEl);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    sendButton.classList.add('hidden');
    soundWaveButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    setInputActive(false);

    abortController = new AbortController();

    try {
        const fullAiResponse = await streamAIResponse((currentModel && currentModel.model) || 'Mini', conversationHistory, aiMessageEl, abortController.signal, token);
        conversationHistory.push({ role: 'assistant', content: fullAiResponse });
        saveStateToLocalStorage();
    } catch (error) { } 
    finally {
        aiMessageEl.firstChild.classList.remove('streaming');
        if (window.MathJax) MathJax.typesetPromise([aiMessageEl]);
        stopButton.classList.add('hidden');
        soundWaveButton.classList.remove('hidden');
        setInputActive(true);
    }
});
