// script.js

//=====================================================================//
// LOGIC BẢO MẬT: KHÓA CỬA (CHỐNG BYPASS)                              //
//=====================================================================//
if (localStorage.getItem('isLocked') === 'true') {
    window.location.href = 'verify.html';
    throw new Error("App is locked requiring verification."); 
}

//=====================================================================//
// HELPER: COPY CODE                                                   //
//=====================================================================//
window.copyToClipboard = function(btn) {
    const codeElement = btn.closest('.code-box-header').nextElementSibling.querySelector('code');
    const codeText = codeElement.innerText;
    navigator.clipboard.writeText(codeText).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span class="text-green-400 font-bold">Copied!</span>`;
        setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
    });
};

//=====================================================================//
// CONFIG                                                              //
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

// --- STATE ---
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
    // ... (Giữ nguyên các ngôn ngữ khác nếu cần, hoặc có thể rút gọn để tiết kiệm không gian file)
};

// Fallback languages to prevent errors
if (!translations['zh']) translations['zh'] = translations['en'];
if (!translations['hi']) translations['hi'] = translations['en'];
if (!translations['es']) translations['es'] = translations['en'];
if (!translations['fr']) translations['fr'] = translations['en'];
if (!translations['ja']) translations['ja'] = translations['en'];
if (!translations['it']) translations['it'] = translations['en'];

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

// --- CORE FUNCTIONS ---

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
        try {
            chatHistories = JSON.parse(savedHistories);
        } catch(e) { chatHistories = {}; }
    } else {
        chatHistories = {};
    }
    startNewChat(); 
}

function applyTheme(theme) {
    if (!themeColors[theme]) theme = 'dark'; // Safety fallback
    
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
    if(textElements.logoText) {
        textElements.logoText.classList.remove(...allLogoColors);
        textElements.logoText.classList.add(config.logo);
    }

    const sidebarEl = document.getElementById('sidebar');
    const formEl = document.getElementById('chat-form');
    const pillEls = document.querySelectorAll('.header-pill-container');
    const allPillClasses = allConfigs.flatMap(c => c.headerPill || []).flat();
    
    if(sidebarEl) {
        sidebarEl.classList.remove(...allConfigs.flatMap(c => c.sidebar || []).flat());
        sidebarEl.classList.add(...(config.sidebar || []));
    }
    if(formEl) {
        formEl.classList.remove(...allConfigs.flatMap(c => c.form || []).flat());
        formEl.classList.add(...(config.form || []));
    }
    pillEls.forEach(pill => {
        pill.classList.remove(...allPillClasses);
        pill.classList.add(...(config.headerPill || []));
    });

    const themeableIconEls = [
        sidebarToggle ? sidebarToggle.querySelector('svg') : null, 
        newChatHeaderBtn ? newChatHeaderBtn.querySelector('svg') : null,
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
    if(messageInputEl) {
        messageInputEl.classList.remove(...allInputColors);
        messageInputEl.classList.add(...(config.inputColor || []));
    }

    if(textElements.footer) {
        textElements.footer.classList.remove(...allConfigs.map(c => c.subtleText));
        textElements.footer.classList.add(config.subtleText);
    }
    const tokenDisplayIcon = document.querySelector('#token-display svg');
    if(tokenDisplayIcon) {
        tokenDisplayIcon.classList.remove(...allConfigs.map(c => c.iconColor));
        tokenDisplayIcon.classList.add(config.iconColor);
    }

    const modelPopup = document.getElementById('model-popup');
    if(modelPopup) {
        modelPopup.classList.remove(...allConfigs.flatMap(c => c.popup).flat());
        modelPopup.classList.add(...config.popup);
    }

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

// ... (Các hàm switchLanguage, showModal giữ nguyên) ...
// Để ngắn gọn, tôi giữ các hàm quan trọng

function switchLanguage(lang) {
    currentLang = lang;
    const t = translations[lang] || translations['vi']; // Safety

    // Helper to safely set text
    const setText = (el, txt) => { if(el) el.textContent = txt; };
    const setAttr = (el, attr, txt) => { if(el) el[attr] = txt; };

    setText(textElements.sidebarHeader, t.sidebarHeader);
    setAttr(textElements.input, 'placeholder', t.messagePlaceholder);
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
    
    updateActiveLanguageButton(lang);
    updateModelButtonText();
    setGreeting();
    renderHistoryList();
    updateTokenUI();
}

function updateActiveLanguageButton(lang) {
    languageOptionButtons.forEach(btn => {
        btn.classList.remove('bg-blue-500/20', 'text-blue-600');
        if (btn.dataset.lang === lang) {
            btn.classList.add('bg-blue-500/20', 'text-blue-600');
        }
    });
}

function setGreeting() {
    const mainTitle = document.getElementById('main-title');
    if (!mainTitle) return;
    const now = new Date();
    const hour = now.getHours();
    const t = translations[currentLang] || translations['vi'];
    let greeting = '';
    if (hour >= 5 && hour < 11) greeting = t.greetingMorning;
    else if (hour >= 11 && hour < 14) greeting = t.greetingNoon;
    else if (hour >= 14 && hour < 18) greeting = t.greetingAfternoon;
    else greeting = t.greetingEvening;
    mainTitle.textContent = greeting;
}

// Model Selection Logic - FIXED
function updateModelButtonText() {
    const t = translations[currentLang] || translations['vi'];
    if (!textElements.modelBtnText) return;
    
    if (currentModel && currentModel.model) {
        textElements.modelBtnText.textContent = currentModel.model;
    } else {
         textElements.modelBtnText.textContent = t.modelButtonDefault;
    }
}

const createModelButton = (text, description, model, version = '', iconSvg) => {
    const theme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[theme] || themeColors['dark'];
    const button = document.createElement('button');
    button.className = 'w-full text-left p-2 rounded-lg transition-colors duration-200 flex items-center justify-between btn-interaction';
    if(themeConfig.popupButton) button.classList.add(...themeConfig.popupButton);
    
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
    
    // Updated check logic
    const isSelected = currentModel && currentModel.model === model && (!version || currentModel.version === version);
    if (!isSelected) {
        checkmarkContainer.classList.add('hidden');
    }
    
    button.appendChild(checkmarkContainer);
    return button;
};

const showInitialModels = () => {
    if(!modelPopup) return;
    modelPopup.innerHTML = '';
    const t = translations[currentLang] || translations['vi'];
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
    try {
        e.stopPropagation();
        const button = e.currentTarget;
        currentModel = {
            model: button.dataset.model,
            version: button.dataset.version || null
        };
        localStorage.setItem('currentModel', JSON.stringify(currentModel));
        updateModelButtonText();
        if(modelPopup) modelPopup.classList.add('hidden');
    } catch(err) {
        console.error("Model select error:", err);
    }
};

if(modelButton) {
    modelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showInitialModels();
        if(modelPopup) modelPopup.classList.toggle('hidden');
    });
}

document.addEventListener('click', (e) => {
    if (modelButton && modelPopup && !modelButton.contains(e.target) && !modelPopup.contains(e.target)) {
        modelPopup.classList.add('hidden');
    }
});

// --- UI HELPERS ---

let isModalAnimating = false;
const animationDuration = 300;

function showModal(modal, show) {
    if(!modal) return;
    if (isModalAnimating && (modal === themeModal || modal === languageModal || modal === document.getElementById('update-log-modal') || modal === comingSoonModal)) return;
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
        if (!show) {
            modal.classList.add('hidden');
        }
        isModalAnimating = false;
    }, animationDuration);
}

function toggleThemeModal() {
    if(!themeModal) return;
    const isHidden = themeModal.classList.contains('hidden');
    showModal(themeModal, isHidden);
}

// ... (EventListeners for other modals remain same) ...
if(themeMenuButton) themeMenuButton.addEventListener('click', toggleThemeModal);
if(closeModalButton) closeModalButton.addEventListener('click', () => showModal(themeModal, false));
if(themeModal) themeModal.addEventListener('click', (e) => {
    if (e.target === themeModal) showModal(themeModal, false);
});

themeOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const theme = button.getAttribute('data-theme');
        applyTheme(theme);
        showModal(themeModal, false);
    });
});

if(langSwitchBtn) langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
if(closeLanguageModalBtn) closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
if(languageModal) languageModal.addEventListener('click', (e) => {
    if (e.target === languageModal) showModal(languageModal, false);
});

languageOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const lang = button.getAttribute('data-lang');
        switchLanguage(lang);
        showModal(languageModal, false);
    });
});

if(sidebarToggle) sidebarToggle.addEventListener('click', () => {
    if(sidebar) {
        sidebar.classList.toggle('-translate-x-full');
        sidebar.classList.toggle('hidden');
    }
});

// --- CHAT LOGIC ---

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    
    if(chatContainer) chatContainer.innerHTML = '';
    const initialView = document.getElementById('initial-view');
    const mainContent = document.getElementById('mainContent');
    
    if(initialView) initialView.classList.remove('hidden');
    if(chatContainer) chatContainer.classList.add('hidden');
    if(mainContent) {
        mainContent.classList.add('justify-center');
        mainContent.classList.remove('justify-start');
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

function formatAIResponse(text) {
    const codeBlocks = [];
    let processedText = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang: lang || 'code', code: code });
        return `__CODE_BLOCK_${index}__`; 
    });

    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-blue-400">$1</strong>');
    processedText = processedText.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2 border-b border-gray-500/50 pb-1">$1</h2>');
    processedText = processedText.replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-bold mt-3 mb-1">$1</h3>');
    processedText = processedText.replace(/\n/g, '<br>');

    processedText = processedText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const block = codeBlocks[index];
        const escapedCode = block.code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `
        <div class="my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700 shadow-xl w-full">
            <div class="code-box-header flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
                <span class="text-xs text-gray-400 font-mono font-bold uppercase">${block.lang}</span>
                <button onclick="copyToClipboard(this)" class="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition cursor-pointer bg-transparent border-none">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    Copy
                </button>
            </div>
            <div class="p-4 overflow-x-auto bg-[#1e1e1e]">
                <pre><code class="font-mono text-sm text-green-400 whitespace-pre">${escapedCode}</code></pre>
            </div>
        </div>`;
    });
    return processedText;
}

function createMessageElement(messageContent, sender) {
    const row = document.createElement('div');
    row.classList.add('flex', 'w-full', 'mb-4');
    const messageWrapper = document.createElement('div');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme] || themeColors['dark'];
    
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

async function typeWriterEffect(text, element) {
    element.innerHTML = ''; 
    const words = text.split(/(?=\s)/g); 
    let currentText = "";
    const speed = 10; 

    for (const word of words) {
        currentText += word;
        element.innerHTML = formatAIResponse(currentText);
        const chatContainer = document.getElementById('chat-container');
        if(chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        await new Promise(r => setTimeout(r, speed));
    }
    element.innerHTML = formatAIResponse(text);
}

// ... (streamAIResponse giữ nguyên) ...
// Để ngắn gọn, tôi giữ logic stream quan trọng nhất

// --- LOGIC KIỂM TRA XEM CÓ CẦN HIỆN TRẠNG THÁI SEARCH KHÔNG ---
const searchKeywordsRegex = /(quán|nhà hàng|ở đâu|địa chỉ|gần đây|đường nào|bản đồ|quan|nha hang|o dau|dia chi|gan day|duong nao|ban do|hôm nay|ngày mai|bây giờ|hiện tại|thời tiết|nhiệt độ|mưa không|hom nay|ngay mai|bay gio|hien tai|thoi tiet|nhiet do|mua khong|tin tức|sự kiện|mới nhất|vừa xảy ra|biến động|scandal|tin tuc|su kien|moi nhat|vua xay ra|bien dong|giá|bao nhiêu tiền|chi phí|tỷ giá|giá vàng|coin|crypto|chứng khoán|cổ phiếu|mua|bán|gia|bao nhieu tien|chi phi|ty gia|gia vang|chung khoan|co phieu|lịch thi đấu|kết quả|giờ mở cửa|kẹt xe|tắc đường|giao thông|lich thi dau|ket qua|gio mo cua|ket xe|tac duong|giao thong)/i;

function shouldShowSearchStatus(text) {
    const skipRegex = /(viết code|sửa lỗi|lập trình|giải toán|phương trình|đạo hàm|tích phân|văn học|bài văn|javascript|python|css|html|dịch sang|translate)/i;
    if (skipRegex.test(text)) return false;
    return searchKeywordsRegex.test(text);
}

// ... (chatForm event listener updated with shouldShowSearchStatus) ...

// Restore streamAIResponse for completeness
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
    // ... logic như cũ ...
    // Giả sử logic này đã có trong file gốc, chỉ update phần UI
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';
    const CLOUDFLARE_PROJECT_URL = ''; 
    const API_URL = isLocal && CLOUDFLARE_PROJECT_URL ? `${CLOUDFLARE_PROJECT_URL}/api/handler` : '/api/handler';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName, messages, max_tokens: 4000, temperature: 0.7 }),
            signal
        });

        if (!response.ok) {
            let errorMsg = `Server Error (${response.status})`;
            try { const errorData = await response.json(); if (errorData.error) errorMsg = errorData.error; } catch (e) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const fullText = data.content;
        await typeWriterEffect(fullText, aiMessageEl.firstChild);
        return fullText;

    } catch (error) {
        if (error.name === 'AbortError') return aiMessageEl.firstChild.innerText;
        console.error("Fetch Error:", error);
        let userMsg = translations[currentLang]?.errorPrefix || "Đã có lỗi xảy ra.";
        if (error.message) userMsg += ` (${error.message})`;
        aiMessageEl.firstChild.innerHTML = `<span class="text-red-400">${userMsg}</span>`;
        throw error;
    }
}

if(stopButton) stopButton.addEventListener('click', () => {
    if (abortController) abortController.abort();
});

function setInputActive(isActive) {
    const t = translations[currentLang] || translations['vi'];
    if(messageInput) {
        messageInput.disabled = !isActive;
        if (!isActive) messageInput.placeholder = t.aiTypingPlaceholder;
        else updateTokenUI();
    }
    const footerButtons = [randomPromptBtn, videoBtn, learnBtn, uploadFileBtn, document.getElementById('model-button')];
    footerButtons.forEach(btn => { if(btn) btn.disabled = !isActive; });
}

if(chatFormEl) {
    chatFormEl.addEventListener('submit', async function(event) {
        event.preventDefault();
        const message = messageInput.value.trim();
        if (!message && !stagedFile) return;

        if (!consumeToken()) return;

        const initialView = document.getElementById('initial-view');
        if (initialView && !initialView.classList.contains('hidden')) {
            initialView.style.opacity = '0';
            setTimeout(() => {
                initialView.classList.add('hidden');
                if(chatContainer) chatContainer.classList.remove('hidden');
                const mainContent = document.getElementById('mainContent');
                if(mainContent) {
                    mainContent.classList.remove('justify-center');
                    mainContent.classList.add('justify-start');
                }
            }, 500);
        }

        const userMessageContent = [];
        if (stagedFile) {
            if (stagedFile.type === 'image') userMessageContent.push({ type: "image_url", image_url: { url: stagedFile.url } });
            else if (stagedFile.type === 'video') userMessageContent.push({ type: "video_url", video_url: { url: stagedFile.url } });
        }
        if (message) userMessageContent.push({ type: "text", text: message });

        const userMessageEl = createMessageElement(userMessageContent, 'user');
        chatContainer.appendChild(userMessageEl);

        const historyContent = userMessageContent.length === 1 && userMessageContent[0].type === 'text' ? message : userMessageContent;
        conversationHistory.push({ role: 'user', content: historyContent });
        renderHistoryList();

        messageInput.value = '';
        messageInput.dispatchEvent(new Event('input')); 
        stagedFile = null;
        if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
        isRandomPromptUsedInSession = true; 
        updateRandomButtonVisibility(); 
        chatContainer.scrollTop = chatContainer.scrollHeight;

        const aiMessageEl = createMessageElement('', 'ai');
        aiMessageEl.firstChild.classList.add('streaming'); 
        aiMessageEl.firstChild.innerHTML = '<span class="animate-pulse">AI đang trả lời...</span>';

        // TIMER: Chỉ hiện "Đang tìm kiếm" nếu câu hỏi thực sự cần search
        const searchStatusTimer = setTimeout(() => {
            if (shouldShowSearchStatus(message)) {
                aiMessageEl.firstChild.innerHTML = '<span class="animate-pulse text-blue-400">Đang tìm kiếm thông tin...</span>';
            } else {
                aiMessageEl.firstChild.innerHTML = '<span class="animate-pulse">AI đang suy nghĩ...</span>';
            }
        }, 1500);

        chatContainer.appendChild(aiMessageEl);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        if(sendButton) sendButton.classList.add('hidden');
        if(soundWaveButton) soundWaveButton.classList.add('hidden');
        if(stopButton) stopButton.classList.remove('hidden');
        setInputActive(false);

        abortController = new AbortController();

        try {
            const modelToUse = (currentModel && currentModel.model) ? currentModel.model : 'Mini';
            const fullAiResponse = await streamAIResponse(modelToUse, conversationHistory, aiMessageEl, abortController.signal);
            
            clearTimeout(searchStatusTimer); 
            conversationHistory.push({ role: 'assistant', content: fullAiResponse });
            chatContainer.scrollTop = chatContainer.scrollHeight;
            saveStateToLocalStorage(); 
        } catch (error) {
            clearTimeout(searchStatusTimer);
        } finally {
            clearTimeout(searchStatusTimer);
            aiMessageEl.firstChild.classList.remove('streaming');
            renderMath(aiMessageEl);

            if(stopButton) stopButton.classList.add('hidden');
            if(soundWaveButton) soundWaveButton.classList.remove('hidden');
            setInputActive(true);
        }
    });
}

// --- FILE UPLOAD LOGIC ---
const randomPrompts = {
    vi: ["Kể một câu chuyện cười", "Thủ đô của nước Pháp là gì?", "Viết một đoạn văn về tầm quan trọng của việc đọc sách.", "Công thức làm món phở bò?"],
    en: ["Tell me a joke", "What is the capital of France?", "Write a paragraph about the importance of reading books.", "What is the recipe for beef pho?"],
    // ...
};

if(randomPromptBtn) randomPromptBtn.addEventListener('click', () => {
    if (isRandomPromptUsedInSession) return;
    const prompts = randomPrompts[currentLang] || randomPrompts['vi'];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    if(messageInput) {
        messageInput.value = randomPrompt;
        messageInput.dispatchEvent(new Event('input')); 
        isRandomPromptUsedInSession = true;
        updateRandomButtonVisibility();
        chatFormEl.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});

if(videoBtn) videoBtn.addEventListener('click', () => {
    const t = translations[currentLang] || translations['vi'];
    alert(t.comingSoon);
});

if(learnBtn) learnBtn.addEventListener('click', () => {
    isTutorMode = !isTutorMode; 
    localStorage.setItem('isTutorMode', isTutorMode);
    updateLearnButtonVisualState();
});

if(uploadFileBtn) uploadFileBtn.addEventListener('click', () => fileInput && fileInput.click());

if(fileInput) fileInput.addEventListener('change', (event) => {
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
    const btn = document.getElementById('remove-file-btn');
    if(btn) btn.addEventListener('click', () => {
        if (stagedFile && stagedFile.type === 'video') {
             URL.revokeObjectURL(stagedFile.url);
        }
        stagedFile = null;
        if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
        if(fileInput) fileInput.value = '';
    });
}

function updateLearnButtonVisualState() {
    if(!learnBtn) return;
    const learnIcon = learnBtn.querySelector('svg');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const activeColorClass = currentTheme === 'light' ? 'bg-blue-500' : 'bg-blue-600';
    
    if (isTutorMode) {
        learnBtn.classList.add(activeColorClass);
        if(learnIcon) {
            learnIcon.classList.add('text-white');
            learnIcon.classList.remove(themeColors[currentTheme].iconColor);
        }
    } else {
        learnBtn.classList.remove('bg-blue-600', 'bg-blue-500');
        if(learnIcon) {
            learnIcon.classList.remove('text-white');
            learnIcon.classList.add(themeColors[currentTheme].iconColor);
        }
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    function checkSecurityGate() {
        let verificationLimit = localStorage.getItem('verificationLimit');
        if (!verificationLimit) {
            verificationLimit = Math.floor(Math.random() * (7 - 2 + 1)) + 2;
            localStorage.setItem('verificationLimit', verificationLimit);
        } else {
            verificationLimit = parseInt(verificationLimit);
        }
        let usageCount = parseInt(localStorage.getItem('appUsageCount') || '0');
        usageCount++;
        if (usageCount >= verificationLimit) {
            localStorage.setItem('isLocked', 'true'); 
            window.location.href = 'verify.html';
        } else {
            localStorage.setItem('appUsageCount', usageCount);
        }
    }
    checkSecurityGate();

    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedLang = localStorage.getItem('language') || 'vi';
    
    switchLanguage(savedLang);
    applyTheme(savedTheme);
    initializeApp();
    handleUpdateLog();
    initTokenSystem();
    
    if(soundWaveButton) soundWaveButton.classList.remove('hidden');
    if(sendButton) sendButton.classList.add('hidden');

    updateModelButtonText();
    updateLearnButtonVisualState();

    if(messageInput) messageInput.addEventListener('input', () => {
        if (messageInput.value.trim().length > 0) {
            if(soundWaveButton) soundWaveButton.classList.add('hidden');
            if(sendButton) sendButton.classList.remove('hidden');
            isRandomPromptUsedInSession = true; 
            updateRandomButtonVisibility(); 
        } else {
            if(soundWaveButton) soundWaveButton.classList.remove('hidden');
            if(sendButton) sendButton.classList.add('hidden');
        }
    });

    const initialView = document.getElementById('initial-view');
    if (initialView && !initialView.classList.contains('hidden')) {
         const mt = document.getElementById('main-title');
         if(mt) mt.classList.add('animate-fade-up');
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            startNewChat();
        }
        const activeEl = document.activeElement;
        const isTypingInInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
        if (!isTypingInInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if(messageInput) messageInput.focus();
        }
    });
});

// ... (initTokenSystem and helper functions remain same) ...
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
    if(currentTokenInput) currentTokenInput.addEventListener('change', handleTokenInputChange);
    if(maxTokenInput) maxTokenInput.addEventListener('change', handleTokenInputChange);
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
    if(messageInput) messageInput.disabled = false;
    if (tokenConfig.IS_INFINITE) {
        if(tokenInputsContainer) tokenInputsContainer.classList.add('hidden');
        if(tokenInfinity) tokenInfinity.classList.remove('hidden');
        const t = translations[currentLang] || translations['vi'];
        if(messageInput) messageInput.placeholder = t.messagePlaceholder;
        return;
    }
    if(tokenInputsContainer) tokenInputsContainer.classList.remove('hidden');
    if(tokenInfinity) tokenInfinity.classList.add('hidden');
    const currentTokens = parseInt(localStorage.getItem('userTokens') || '0');
    const maxTokens = parseInt(localStorage.getItem('maxTokens') || tokenConfig.MAX_TOKENS);
    if(currentTokenInput) currentTokenInput.value = currentTokens;
    if(maxTokenInput) maxTokenInput.value = maxTokens;
    const t = translations[currentLang] || translations['vi'];
    if (currentTokens < tokenConfig.TOKEN_COST_PER_MESSAGE) {
        if(messageInput) {
            messageInput.disabled = true;
            messageInput.placeholder = t.outOfTokensPlaceholder;
        }
    } else {
        if(messageInput) messageInput.placeholder = t.messagePlaceholder;
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
