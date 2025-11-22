//=====================================================================//
// NEW: ENERGY CONFIGURATION BOX                                       //
// Dễ dàng điều chỉnh các thông số Năng lượng tại đây.                    //
//=====================================================================//
const tokenConfig = {
    IS_INFINITE: true,
    MAX_TOKENS: 50,
    TOKEN_COST_PER_MESSAGE: 1,
    TOKEN_REGEN_INTERVAL_MINUTES: 5,
    TOKEN_REGEN_AMOUNT: 1,
};
//=====================================================================//

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

// File upload elements
const uploadFileBtn = document.getElementById('upload-file-btn');
const fileInput = document.getElementById('file-input');
const fileThumbnailContainer = document.getElementById('file-thumbnail-container');
let stagedFile = null;

// Token management elements
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

// --- TRANSLATIONS ---
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

// --- UI TEXT ELEMENTS ---
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

const themeColors = {
    dark: {
        bg: ['bg-gradient-to-br', 'from-[#212935]', 'to-black'],
        text: 'text-gray-100',
        subtleText: 'text-gray-400',
        logo: 'text-gray-100',
        iconColor: 'text-gray-300',
        popup: ['bg-gray-900', 'border', 'border-gray-700'],
        popupButton: ['text-gray-300', 'hover:bg-white/10', 'hover:text-white'],
        popupSelected: ['bg-sky-500/20', '!text-sky-300', 'font-semibold'],
        sidebar: ['bg-black/10', 'border-white/10'],
        sidebarText: 'text-gray-200',
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
        popupSelected: ['bg-blue-100', '!text-blue-600', 'font-semibold'],
        sidebar: ['bg-gray-50', 'border-r', 'border-gray-200'],
        sidebarText: 'text-black',
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
        popupSelected: ['bg-sky-400/20', '!text-sky-300', 'font-semibold'],
        sidebar: ['bg-black/10', 'border-white/10'],
        sidebarText: 'text-white',
        historyActive: ['bg-white/20'],
        historyHover: ['hover:bg-white/10'],
        form: ['bg-black/30', 'border-white/20'],
        headerPill: ['bg-black/30', 'backdrop-blur-lg', 'border', 'border-white/20'],
        aiMessage: ['text-white'],
        userMessage: ['bg-blue-500', 'text-white'],
        inputColor: ['text-white', 'placeholder-gray-300']
    }
};

// --- FUNCTIONS ---

function saveStateToLocalStorage() {
    const historiesToSave = { ...chatHistories };
    if (historiesToSave[currentChatId] && historiesToSave[currentChatId].length === 0) {
        delete historiesToSave[currentChatId];
    }
    localStorage.setItem('chatHistories', JSON.stringify(historiesToSave));
    localStorage.setItem('currentChatId', currentChatId);
}

function initializeApp() {
    const savedHistories = localStorage.getItem('chatHistories');
    if (savedHistories) {
        chatHistories = JSON.parse(savedHistories);
    } else {
        chatHistories = {};
    }
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
        if (btn.dataset.theme === theme) {
             btn.classList.add('bg-blue-500/20');
        }
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

    const allLogoColors = allConfigs.map(c => c.logo);
    textElements.logoText.classList.remove(...allLogoColors);
    textElements.logoText.classList.add(config.logo);

    const sidebarEl = document.getElementById('sidebar');
    const formEl = document.getElementById('chat-form');
    const pillEls = document.querySelectorAll('.header-pill-container');
    const allPillClasses = allConfigs.flatMap(c => c.headerPill || []).flat();
    sidebarEl.classList.remove(...allConfigs.flatMap(c => c.sidebar || []).flat());
    sidebarEl.classList.add(...(config.sidebar || []));
    formEl.classList.remove(...allConfigs.flatMap(c => c.form || []).flat());
    formEl.classList.add(...(config.form || []));
    pillEls.forEach(pill => {
        pill.classList.remove(...allPillClasses);
        pill.classList.add(...(config.headerPill || []));
    });

    const themeableIconEls = [
        sidebarToggle.querySelector('svg'), newChatHeaderBtn.querySelector('svg'),
        langSwitchBtn, document.getElementById('theme-icon'),
        document.querySelector('#random-prompt-icon-btn svg'), 
        document.querySelector('#video-icon-btn svg'), 
        document.querySelector('#learn-icon-btn svg'), 
        document.querySelector('#upload-file-btn svg')
    ];
    const allIconColors = allConfigs.map(c => c.iconColor);
    themeableIconEls.forEach(el => {
        if (el) {
            el.classList.remove(...allIconColors);
            el.classList.add(config.iconColor);
        }
    });
    
    const messageInputEl = document.getElementById('message-input');
    const allInputColors = allConfigs.flatMap(c => c.inputColor || []).flat();
    messageInputEl.classList.remove(...allInputColors);
    messageInputEl.classList.add(...(config.inputColor || []));

    textElements.footer.classList.remove(...allConfigs.map(c => c.subtleText));
    textElements.footer.classList.add(config.subtleText);
    const tokenDisplayIcon = document.querySelector('#token-display svg');
    tokenDisplayIcon.classList.remove(...allConfigs.map(c => c.iconColor));
    tokenDisplayIcon.classList.add(config.iconColor);

    const modelPopup = document.getElementById('model-popup');
    modelPopup.classList.remove(...allConfigs.flatMap(c => c.popup).flat());
    modelPopup.classList.add(...config.popup);

    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const aiMessages = chatContainer.querySelectorAll('.ai-message-wrapper');
        const allAiMessageClasses = allConfigs.flatMap(c => c.aiMessage || []).flat();
        aiMessages.forEach(msg => {
            msg.classList.remove(...allAiMessageClasses);
            msg.classList.add(...config.aiMessage);
        });
        const userMessages = chatContainer.querySelectorAll('.user-message-wrapper');
        const allUserMessageClasses = allConfigs.flatMap(c => c.userMessage || []).flat();
        userMessages.forEach(msg => {
            msg.classList.remove(...allUserMessageClasses);
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
        if (btn.dataset.lang === lang) {
            btn.classList.add('bg-blue-500/20', 'text-blue-600');
        }
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
const animationDuration = 300;

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
        if (!show) {
            modal.classList.add('hidden');
        }
        isModalAnimating = false;
    }, animationDuration);
}

function toggleThemeModal() {
    const isHidden = themeModal.classList.contains('hidden');
    showModal(themeModal, isHidden);
}

function setGreeting() {
    const mainTitle = document.getElementById('main-title');
    if (!mainTitle) return;
    const now = new Date();
    const hour = now.getHours();
    const t = translations[currentLang];
    let greeting = '';
    if (hour >= 5 && hour < 11) greeting = t.greetingMorning;
    else if (hour >= 11 && hour < 14) greeting = t.greetingNoon;
    else if (hour >= 14 && hour < 18) greeting = t.greetingAfternoon;
    else greeting = t.greetingEvening;
    mainTitle.textContent = greeting;
}

themeMenuButton.addEventListener('click', toggleThemeModal);
closeModalButton.addEventListener('click', () => showModal(themeModal, false));
themeModal.addEventListener('click', (e) => {
    if (e.target === themeModal) showModal(themeModal, false);
});

themeOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const theme = button.getAttribute('data-theme');
        applyTheme(theme);
        showModal(themeModal, false);
    });
});

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('hidden');
});

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    chatContainer.innerHTML = '';
    initialView.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    mainContent.classList.add('justify-center');
    mainContent.classList.remove('justify-start');
    setGreeting();
    
    isRandomPromptUsedInSession = false; 
    updateRandomButtonVisibility();
    
    renderHistoryList();
    setActiveHistoryItem(currentChatId);
    saveStateToLocalStorage();
}

function updateRandomButtonVisibility() {
    if (conversationHistory.length === 0 && !isRandomPromptUsedInSession) {
        randomPromptBtn.classList.remove('hidden');
    } else {
        randomPromptBtn.classList.add('hidden');
    }
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
            if (typeof firstContent === 'string') {
                firstMessageText = firstContent;
            } else if (Array.isArray(firstContent)) {
                const mediaPart = firstContent.find(p => p.type === 'image_url' || p.type === 'video_url');
                const textPart = firstContent.find(p => p.type === 'text');

                if (mediaPart && mediaPart.type === 'image_url') firstMessageText = '[Hình ảnh]';
                if (mediaPart && mediaPart.type === 'video_url') firstMessageText = '[Video]';

                if (textPart && textPart.text) {
                   firstMessageText = (mediaPart ? firstMessageText + " " : "") + textPart.text;
                }
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
            else {
               saveStateToLocalStorage();
               renderHistoryList();
            }
        };

        item.appendChild(text);
        item.appendChild(deleteBtn);
        item.onclick = () => loadChatHistory(chatId);
        historyList.appendChild(item); 
    });
    if(currentChatId) setActiveHistoryItem(currentChatId);
}

function loadChatHistory(chatId) {
    currentChatId = chatId;
    conversationHistory = chatHistories[chatId] || [];
    chatContainer.innerHTML = '';

    if(conversationHistory.length > 0) {
         initialView.classList.add('hidden');
         chatContainer.classList.remove('hidden');
         mainContent.classList.remove('justify-center');
         mainContent.classList.add('justify-start');
         conversationHistory.forEach(msg => {
            const el = createMessageElement(msg.content, msg.role);
            chatContainer.appendChild(el);
         });
         if (window.MathJax) MathJax.typesetPromise([chatContainer]);
    } else {
         initialView.classList.remove('hidden');
         chatContainer.classList.add('hidden');
         setGreeting();
    }
     setActiveHistoryItem(chatId);
     updateRandomButtonVisibility();
     saveStateToLocalStorage();
}

function setActiveHistoryItem(chatId) {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme];
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove(...Object.values(themeColors).flatMap(t => t.historyActive).flat());
        if(item.dataset.chatId === chatId) item.classList.add(...themeConfig.historyActive);
    });
}

newChatHeaderBtn.addEventListener('click', startNewChat);

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedLang = localStorage.getItem('language') || 'vi';
    
    switchLanguage(savedLang);
    applyTheme(savedTheme);
    initializeApp();
    handleUpdateLog();
    initTokenSystem();
    
    soundWaveButton.classList.remove('hidden');
    sendButton.classList.add('hidden');

    updateModelButtonText();
    updateLearnButtonVisualState();

    messageInput.addEventListener('input', () => {
        if (messageInput.value.trim().length > 0) {
            soundWaveButton.classList.add('hidden');
            sendButton.classList.remove('hidden');
            isRandomPromptUsedInSession = true; 
            updateRandomButtonVisibility(); 
        } else {
            soundWaveButton.classList.remove('hidden');
            sendButton.classList.add('hidden');
        }
    });

    const initialView = document.getElementById('initial-view');
    if (!initialView.classList.contains('hidden')) {
         document.getElementById('main-title').classList.add('animate-fade-up');
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            startNewChat();
        }
        const activeEl = document.activeElement;
        const isTypingInInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
        if (!isTypingInInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            messageInput.focus();
        }
    });
});

function handleUpdateLog() {
    const updateLogModal = document.getElementById('update-log-modal');
    const closeUpdateLogBtn = document.getElementById('close-update-log');
    const dontShowAgainCheckbox = document.getElementById('dont-show-again');
    const updateLogVersion = '1.0.2';
    const hasSeenUpdate = localStorage.getItem('seenUpdateLogVersion');

    if (hasSeenUpdate !== updateLogVersion) showModal(updateLogModal, true);

    const closeAndSavePreference = () => {
        if (dontShowAgainCheckbox.checked) localStorage.setItem('seenUpdateLogVersion', updateLogVersion);
        showModal(updateLogModal, false);
    };

    closeUpdateLogBtn.addEventListener('click', closeAndSavePreference);
    updateLogModal.addEventListener('click', (e) => {
        if(e.target === updateLogModal) closeAndSavePreference();
    });
}

function initTokenSystem() {
    if (tokenConfig.IS_INFINITE) {
        updateTokenUI();
        return;
    }
    let maxTokens = localStorage.getItem('maxTokens');
    if (maxTokens === null) {
        maxTokens = tokenConfig.MAX_TOKENS;
        localStorage.setItem('maxTokens', maxTokens);
    }
    let userTokens = localStorage.getItem('userTokens');
    if (userTokens === null) {
        userTokens = maxTokens;
        localStorage.setItem('userTokens', userTokens);
        localStorage.setItem('lastTokenRegenTimestamp', Date.now());
    }
    currentTokenInput.addEventListener('change', handleTokenInputChange);
    maxTokenInput.addEventListener('change', handleTokenInputChange);
    regenerateTokens();
    setInterval(regenerateTokens, 60 * 1000);
}

function handleTokenInputChange() {
    let newCurrent = parseInt(currentTokenInput.value);
    let newMax = parseInt(maxTokenInput.value);
    if (isNaN(newMax) || newMax < 1) newMax = parseInt(localStorage.getItem('maxTokens')) || tokenConfig.MAX_TOKENS;
    if (isNaN(newCurrent) || newCurrent < 0) newCurrent = 0;
    if (newCurrent > newMax) newCurrent = newMax;
    localStorage.setItem('userTokens', newCurrent);
    localStorage.setItem('maxTokens', newMax);
    updateTokenUI();
}

function regenerateTokens() {
    if (tokenConfig.IS_INFINITE) return;
    const maxTokens = parseInt(localStorage.getItem('maxTokens'));
    let currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    if (currentTokens >= maxTokens) {
        updateTokenUI();
        return;
    }
    const lastRegenTimestamp = parseInt(localStorage.getItem('lastTokenRegenTimestamp') || Date.now());
    const now = Date.now();
    const timeElapsed = now - lastRegenTimestamp;
    const regenIntervalMs = tokenConfig.TOKEN_REGEN_INTERVAL_MINUTES * 60 * 1000;
    if (timeElapsed >= regenIntervalMs) {
        const intervalsPassed = Math.floor(timeElapsed / regenIntervalMs);
        const tokensToAdd = intervalsPassed * tokenConfig.TOKEN_REGEN_AMOUNT;
        currentTokens = Math.min(maxTokens, currentTokens + tokensToAdd);
        localStorage.setItem('userTokens', currentTokens);
        localStorage.setItem('lastTokenRegenTimestamp', now);
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
    const currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    const maxTokens = parseInt(localStorage.getItem('maxTokens') || tokenConfig.MAX_TOKENS);
    currentTokenInput.value = currentTokens;
    maxTokenInput.value = maxTokens;
    if (currentTokens < tokenConfig.TOKEN_COST_PER_MESSAGE) {
        messageInput.disabled = true;
        messageInput.placeholder = translations[currentLang].outOfTokensPlaceholder;
    } else {
        messageInput.placeholder = translations[currentLang].messagePlaceholder;
    }
}

function consumeToken() {
    if (tokenConfig.IS_INFINITE) return true;
    let currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    if (currentTokens >= tokenConfig.TOKEN_COST_PER_MESSAGE) {
        currentTokens -= tokenConfig.TOKEN_COST_PER_MESSAGE;
        localStorage.setItem('userTokens', currentTokens);
        updateTokenUI();
        return true;
    }
    return false;
}

const chatForm = document.getElementById('chat-form');
const chatContainer = document.getElementById('chat-container');
const initialView = document.getElementById('initial-view');
const mainContent = document.getElementById('mainContent');
const videoBtn = document.getElementById('video-icon-btn');
const learnBtn = document.getElementById('learn-icon-btn');
const modelButton = document.getElementById('model-button');
const modelPopup = document.getElementById('model-popup');

const randomPrompts = {
    vi: ["Kể một câu chuyện cười", "Thủ đô của nước Pháp là gì?", "Viết một đoạn văn về tầm quan trọng của việc đọc sách.", "Công thức làm món phở bò?"],
    en: ["Tell me a joke", "What is the capital of France?", "Write a paragraph about the importance of reading books.", "What is the recipe for beef pho?"],
    zh: ["讲个笑话", "法国的首都是哪里？", "写一段关于阅读重要性的段落。", "牛肉河粉的食谱是什么？"],
    hi: ["एक चुटकुला सुनाओ", "फ्रांस की राजधानी क्या है?", "किताबें पढ़ने के महत्व पर एक पैराग्राफ लिखें।", "बीफ फो की रेसिपी क्या है?"],
    es: ["Cuéntame un chiste", "¿Cuál es la capital de Francia?", "Escribe un párrafo sobre la importancia de leer libros.", "¿Cuál es la receta del pho de ternera?"],
    fr: ["Raconte-moi une blague", "Quelle est la capitale de la France ?", "Écrivez un paragraphe sur l'importance de la lecture.", "Quelle est la recette du phở au bœuf ?"],
    ja: ["冗談を言って", "フランスの首都はどこですか？", "読書の重要性について段落を書いてください。", "牛肉フォーのレシピは何ですか？"],
    it: ["Raccontami una barzelletta", "Qual è la capitale della Francia?", "Scrivi un paragrafo sull'importanza di leggere libri.", "Qual è la ricetta per il pho di manzo?"]
};

randomPromptBtn.addEventListener('click', () => {
    if (isRandomPromptUsedInSession) return;
    const prompts = randomPrompts[currentLang];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    messageInput.value = randomPrompt;
    messageInput.dispatchEvent(new Event('input')); 
    isRandomPromptUsedInSession = true;
    updateRandomButtonVisibility();
    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
});

videoBtn.addEventListener('click', () => alert(translations[currentLang].comingSoon));

function updateLearnButtonVisualState() {
    const learnIcon = learnBtn.querySelector('svg');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const activeColorClass = currentTheme === 'light' ? 'bg-blue-500' : 'bg-blue-600';
    
    if (isTutorMode) {
        learnBtn.classList.add(activeColorClass);
        learnIcon.classList.add('text-white');
        learnIcon.classList.remove(themeColors[currentTheme].iconColor);
    } else {
        learnBtn.classList.remove('bg-blue-600', 'bg-blue-500');
        learnIcon.classList.remove('text-white');
        learnIcon.classList.add(themeColors[currentTheme].iconColor);
    }
}

learnBtn.addEventListener('click', () => {
    isTutorMode = !isTutorMode; 
    localStorage.setItem('isTutorMode', isTutorMode);
    updateLearnButtonVisualState();
});

function updateModelButtonText() {
    const t = translations[currentLang];
    if (currentModel && currentModel.model) {
        textElements.modelBtnText.textContent = currentModel.model;
    } else {
         textElements.modelBtnText.textContent = t.modelButtonDefault;
    }
}

const createModelButton = (text, description, model, version = '', iconSvg) => {
    const theme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[theme];
    const button = document.createElement('button');
    button.className = 'w-full text-left p-2 rounded-lg transition-colors duration-200 flex items-center justify-between btn-interaction';
    button.classList.add(...themeConfig.popupButton);
    button.dataset.model = model;
    if (version) button.dataset.version = version;
    const leftContainer = document.createElement('div');
    leftContainer.className = 'flex items-center gap-3';
    const iconContainer = document.createElement('div');
    iconContainer.innerHTML = iconSvg;
    leftContainer.appendChild(iconContainer);
    const textContainer = document.createElement('div');
    textContainer.className = 'flex flex-col';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold leading-tight';
    nameSpan.textContent = text;
    textContainer.appendChild(nameSpan);
    const descSpan = document.createElement('span');
    const descColor = theme === 'light' ? 'text-gray-500' : 'text-gray-400';
    descSpan.className = `text-xs ${descColor} leading-tight`;
    descSpan.textContent = description;
    textContainer.appendChild(descSpan);
    leftContainer.appendChild(textContainer);
    button.appendChild(leftContainer);
    const checkmarkContainer = document.createElement('div');
    checkmarkContainer.innerHTML = `<svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;
    if (!(currentModel && currentModel.model === model && (!version || currentModel.version === version))) {
        checkmarkContainer.classList.add('hidden');
    }
    button.appendChild(checkmarkContainer);
    return button;
};

const showInitialModels = () => {
    modelPopup.innerHTML = '';
    const t = translations[currentLang];
    const iconThunder = `<svg class="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>`;
    const iconLightbulb = `<svg class="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.311a7.5 7.5 0 01-7.5 0c-1.255 0-2.443-.29-3.5-.832a7.5 7.5 0 0114.5.032c-.318.13-.644.242-.984.326a7.5 7.5 0 01-4.016.033z" /></svg>`;
    const iconBrain = `<svg class="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>`;
    const models = [
        { text: 'Mini', description: t.modelMiniDesc, model: 'Mini', version: '', icon: iconThunder },
        { text: 'Smart', description: t.modelSmartDesc, model: 'Smart', version: '', icon: iconLightbulb },
        { text: 'Nerd', description: t.modelNerdDesc, model: 'Nerd', version: '', icon: iconBrain },
    ];
    models.forEach(m => {
        const btn = createModelButton(m.text, m.description, m.model, m.version, m.icon);
        btn.addEventListener('click', selectModelAndClose);
        modelPopup.appendChild(btn);
    });
};

const selectModelAndClose = (e) => {
    e.stopPropagation();
    const button = e.currentTarget;
    currentModel = {
        model: button.dataset.model,
        version: button.dataset.version || null
    };
    localStorage.setItem('currentModel', JSON.stringify(currentModel));
    updateModelButtonText();
    modelPopup.classList.add('hidden');
};

modelButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showInitialModels();
    modelPopup.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!modelButton.contains(e.target) && !modelPopup.contains(e.target)) {
        modelPopup.classList.add('hidden');
    }
});

langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
languageModal.addEventListener('click', (e) => {
    if (e.target === languageModal) showModal(languageModal, false);
});

languageOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const lang = button.getAttribute('data-lang');
        switchLanguage(lang);
        showModal(languageModal, false);
    });
});

// === UPDATED FUNCTION: FORMAT AI RESPONSE ===
// Fixes visual issues and supports ## headers
function formatAIResponse(text) {
    // 1. Xử lý Tiêu đề (## Heading)
    // Regex tìm chuỗi bắt đầu bằng ## và thay thế bằng thẻ h2 được style đẹp mắt, to, in đậm, màu xanh
    let formattedText = text.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold text-blue-300 mt-4 mb-2 border-b border-gray-500/30 pb-1">$1</h2>');
    
    // 2. Xử lý In đậm (**Bold**)
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 3. Xử lý Xuống dòng (\n thành <br>)
    formattedText = formattedText.replace(/\n/g, '<br>');

    return formattedText;
}

function createMessageElement(messageContent, sender) {
    const row = document.createElement('div');
    row.classList.add('flex', 'w-full', 'mb-4');
    const messageWrapper = document.createElement('div');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme];
    if (sender === 'user') {
        row.classList.add('justify-end', 'user-message');
        messageWrapper.classList.add('user-message-wrapper', 'animate-pop-in', 'px-5', 'py-3', 'rounded-3xl', 'max-w-4xl', 'shadow-md', 'flex', 'flex-col', 'gap-2');
        messageWrapper.classList.add(...themeConfig.userMessage);
        if (Array.isArray(messageContent)) {
            messageContent.forEach(part => {
                if (part.type === 'image_url') {
                    const img = document.createElement('img');
                    img.src = part.image_url.url;
                    img.className = 'rounded-lg max-w-xs';
                    messageWrapper.appendChild(img);
                } else if (part.type === 'video_url') {
                    const video = document.createElement('video');
                    video.src = part.video_url.url;
                    video.className = 'rounded-lg max-w-xs';
                    video.controls = true;
                    messageWrapper.appendChild(video);
                } else if (part.type === 'text') {
                    const textDiv = document.createElement('div');
                    textDiv.innerHTML = part.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    messageWrapper.appendChild(textDiv);
                }
            });
        } else {
             messageWrapper.innerHTML = messageContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
    } else {
        row.classList.add('justify-start');
        messageWrapper.classList.add('ai-message-wrapper', 'animate-pop-in', 'max-w-4xl');
        messageWrapper.classList.add(...themeConfig.aiMessage);
        messageWrapper.innerHTML = formatAIResponse(messageContent);
    }
    row.appendChild(messageWrapper);
    return row;
}

// === UPDATED: SYSTEM PROMPTS (Simplified & Strict) ===
// Fixes grammar issues by being concise and clear
const systemPrompts = {
    vi: {
        tutor: "Bạn là Oceep, một gia sư AI thân thiện. Nhiệm vụ: giải thích khái niệm phức tạp một cách dễ hiểu. Yêu cầu bắt buộc: Dùng Tiếng Việt chuẩn xác, viết đúng chính tả và ngữ pháp. Khi viết mục lục hoặc tiêu đề, hãy thêm '##' vào đầu dòng. Sử dụng LaTeX \\( ... \\) cho công thức toán.",
        assistant: `Bạn là Oceep, trợ lý ảo của FoxAI. Hãy trả lời ngắn gọn, đúng trọng tâm. Yêu cầu bắt buộc: Viết Tiếng Việt chuẩn xác, đầy đủ chủ ngữ vị ngữ, đúng chính tả. Dùng '##' ở đầu dòng nếu là tiêu đề. Sử dụng LaTeX \\( ... \\) cho công thức toán.`
    },
    en: {
        tutor: "You are Oceep, a friendly AI tutor. Explain complex concepts simply. Requirement: Perfect grammar and spelling. Use '##' for headers. Use LaTeX \\( ... \\) for math.",
        assistant: "You are Oceep by FoxAI. Answer concisely. Requirement: Perfect grammar and spelling. Use '##' for headers. Use LaTeX \\( ... \\) for math."
    },
    ja: {
        tutor: "あなたはOceepというAI家庭教師です。正確な日本語を使ってください。見出しには「##」を使用し、数式にはLaTeXを使用してください。",
        assistant: "あなたはFoxAIのOceepです。簡潔に答えてください。正確な日本語を使い、見出しには「##」を使用してください。"
    },
    it: {
        tutor: "Sei Oceep, un tutor AI. Usa una grammatica perfetta. Usa '##' per le intestazioni. Usa LaTeX per la matematica.",
        assistant: "Sei Oceep di FoxAI. Rispondi concisamente. Usa una grammatica perfetta. Usa '##' per le intestazioni."
    }
};

// ============================================================
// MAIN FIX FOR CONNECTION AND STREAMING ERRORS
// ============================================================
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    const langPrompts = systemPrompts[currentLang] || systemPrompts['en'];
    const systemContent = isTutorMode ? langPrompts.tutor : langPrompts.assistant;
    const systemMessage = { role: 'system', content: systemContent };
    const messagesWithSystemPrompt = [systemMessage, ...messages];
    
    // --- URL CONFIGURATION FIX ---
    const LIVE_DOMAIN = 'https://official-oceeps-projects.vercel.app'; // CẬP NHẬT DOMAIN MỚI
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';

    // Nếu là local, dùng full URL. Nếu là production, dùng relative path để tránh lỗi CORS.
    const API_URL = isLocal ? `${LIVE_DOMAIN}/api/handler` : '/api/handler';

    console.log(`[System] Requesting: ${modelName} via ${API_URL}`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelName: modelName,
                messages: messagesWithSystemPrompt,
                max_tokens: 3000, // <--- QUAN TRỌNG: Tăng giới hạn từ để không bị cắt giữa chừng
                temperature: 0.7  // <--- QUAN TRỌNG: Cân bằng độ sáng tạo để tránh nói sai ngữ pháp
            }),
            signal
        });

        // --- ERROR HANDLING FIX ---
        if (!response.ok) {
            let errorMsg = `Server Error (${response.status})`;
            try {
                const errorBody = await response.text(); 
                try {
                    const errorData = JSON.parse(errorBody);
                    if (errorData.error) errorMsg = errorData.error;
                    if (errorData.details) errorMsg += ` - ${errorData.details}`;
                } catch (parseError) {
                    if (errorBody) errorMsg = errorBody.substring(0, 200);
                }
            } catch (readError) {
                console.error("Could not read error response", readError);
            }
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
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }
                    } catch (e) { }
                }
            }
        }
        return fullResponseText;

    } catch (error) {
        if (error.name === 'AbortError') return aiMessageEl.firstChild.innerText;
        
        console.error("Connection Error Details:", error);
        
        let userMsg = "An error occurred.";
        
        if (error.message.includes('Failed to fetch')) {
             userMsg = isLocal 
                ? "Lỗi kết nối (CORS/Mạng). Hãy đảm bảo API đang chạy." 
                : "Không thể kết nối đến Server. Vui lòng kiểm tra lại đường truyền.";
        } else if (error.message.includes('404')) {
            userMsg = "Lỗi 404: Không tìm thấy API. Hãy đảm bảo file 'handler.js' nằm trong thư mục 'api'.";
        } else if (error.message.includes('401')) {
            userMsg = "Lỗi xác thực (401). Vui lòng kiểm tra API Key trên Vercel.";
        } else {
            userMsg = `Lỗi: ${error.message}`;
        }
        
        aiMessageEl.firstChild.innerHTML = `<span class="text-red-400">${userMsg}</span>`;
        throw error;
    }
}

stopButton.addEventListener('click', () => {
    if (abortController) abortController.abort();
});

function setInputActive(isActive) {
    const t = translations[currentLang];
    messageInput.disabled = !isActive;
    const footerButtons = [
        randomPromptBtn, videoBtn, learnBtn, uploadFileBtn, modelButton
    ];
    footerButtons.forEach(btn => btn.disabled = !isActive);
    if (isActive) {
        updateTokenUI();
    } else {
        messageInput.placeholder = t.aiTypingPlaceholder;
    }
}

chatForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const message = messageInput.value.trim();
    if (!message && !stagedFile) return;

    if (!consumeToken()) {
        return;
    }

    if (!initialView.classList.contains('hidden')) {
        initialView.style.opacity = '0';
        setTimeout(() => {
            initialView.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            mainContent.classList.remove('justify-center');
            mainContent.classList.add('justify-start');
        }, 500);
    }

    const userMessageContent = [];
    if (stagedFile) {
        if (stagedFile.type === 'image') {
            userMessageContent.push({ type: "image_url", image_url: { url: stagedFile.url } });
        } else if (stagedFile.type === 'video') {
            userMessageContent.push({ type: "video_url", video_url: { url: stagedFile.url } });
        }
    }
    if (message) userMessageContent.push({ type: "text", text: message });

    const userMessageEl = createMessageElement(userMessageContent, 'user');
    chatContainer.appendChild(userMessageEl);

    const historyContent = userMessageContent.length === 1 && userMessageContent[0].type === 'text'
        ? message
        : userMessageContent;
    conversationHistory.push({ role: 'user', content: historyContent });
    renderHistoryList();

    messageInput.value = '';
    messageInput.dispatchEvent(new Event('input')); 
    stagedFile = null;
    fileThumbnailContainer.innerHTML = '';
    isRandomPromptUsedInSession = true; 
    updateRandomButtonVisibility(); 
    chatContainer.scrollTop = chatContainer.scrollHeight;

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
        const modelToUse = (currentModel && currentModel.model) ? currentModel.model : 'Mini';
        const fullAiResponse = await streamAIResponse(modelToUse, conversationHistory, aiMessageEl, abortController.signal);
        conversationHistory.push({ role: 'assistant', content: fullAiResponse });
        chatContainer.scrollTop = chatContainer.scrollHeight;
        saveStateToLocalStorage(); 
    } catch (error) {
        // Error handled inside streamAIResponse, message already displayed.
        // Just cleanup UI here.
    } finally {
        aiMessageEl.firstChild.classList.remove('streaming');
        if (window.MathJax) MathJax.typesetPromise([aiMessageEl]);

        stopButton.classList.add('hidden');
        soundWaveButton.classList.remove('hidden');
        
        setInputActive(true);
    }
});

uploadFileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (stagedFile && stagedFile.type === 'video') {
        URL.revokeObjectURL(stagedFile.url);
    }
    stagedFile = null;
    fileThumbnailContainer.innerHTML = '';
    
    const removeButtonHTML = `<button id="remove-file-btn" class="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center font-bold text-xs btn-interaction">&times;</button>`;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            stagedFile = { file: file, url: e.target.result, type: 'image' };
            fileThumbnailContainer.innerHTML = `
                <div class="relative inline-block">
                    <img src="${stagedFile.url}" class="h-20 w-auto rounded-lg" />
                    ${removeButtonHTML}
                </div>
            `;
            addRemoveButtonListener();
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        const objectURL = URL.createObjectURL(file);
        stagedFile = { file: file, url: objectURL, type: 'video' };
        fileThumbnailContainer.innerHTML = `
            <div class="relative inline-block">
                <video src="${stagedFile.url}" class="h-20 w-auto rounded-lg" autoplay muted loop playsinline></video>
                ${removeButtonHTML}
            </div>
        `;
        addRemoveButtonListener();
    }
});

function addRemoveButtonListener() {
    document.getElementById('remove-file-btn').addEventListener('click', () => {
        if (stagedFile && stagedFile.type === 'video') {
             URL.revokeObjectURL(stagedFile.url);
        }
        stagedFile = null;
        fileThumbnailContainer.innerHTML = '';
        fileInput.value = '';
    });
}
