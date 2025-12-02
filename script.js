// script.js

//=====================================================================//
// 1. LOGIC BẢO MẬT & KHỞI TẠO CƠ BẢN                                  //
//=====================================================================//

// Kiểm tra khóa bảo mật ngay lập tức
try {
    if (localStorage.getItem('isLocked') === 'true') {
        window.location.href = 'verify.html';
        throw new Error("App is locked requiring verification."); 
    }
} catch (e) {
    console.error("Security check error:", e);
}

// Helper: Copy Code
window.copyToClipboard = function(btn) {
    try {
        const codeElement = btn.closest('.code-box-header').nextElementSibling.querySelector('code');
        const codeText = codeElement.innerText;
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

//=====================================================================//
// 2. DOM ELEMENTS & STATE                                             //
//=====================================================================//

// Elements - Sử dụng getElementById an toàn
const getEl = (id) => document.getElementById(id);
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
    randomTooltip: getEl('random-tooltip'),
    videoTooltip: getEl('video-tooltip'),
    learnTooltip: getEl('learn-tooltip'),
    langTooltip: getEl('lang-tooltip'),
    themeTooltip: getEl('theme-tooltip'),
    historyTooltip: getEl('history-tooltip'),
    newChatTooltip: getEl('new-chat-tooltip'),
};

// Các nút & Modal
const themeMenuButton = getEl('theme-menu-button');
const themeModal = getEl('theme-modal');
const modalContent = getEl('modal-content');
const themeOptionButtons = document.querySelectorAll('.theme-option');
const languageModal = getEl('language-modal');
const languageOptionButtons = document.querySelectorAll('.language-option');
const langSwitchBtn = getEl('lang-switch-btn');

const body = document.body;
const backgroundContainer = getEl('background-container');
const chatFormEl = getEl('chat-form');
const oceanImageUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

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

// State Variables
let stagedFile = null;
let currentLang = 'vi';
let isTutorMode = localStorage.getItem('isTutorMode') === 'true';
let abortController;
let isRandomPromptUsedInSession = false;
let conversationHistory = [];
let chatHistories = {};
let currentChatId = null;

// Khởi tạo Model an toàn (Tránh lỗi JSON parse)
let currentModel;
try {
    currentModel = JSON.parse(localStorage.getItem('currentModel'));
} catch (e) { currentModel = null; }
if (!currentModel) currentModel = { model: 'Mini', version: '' };

const translations = {
    vi: {
        sidebarHeader: "Lịch sử Chat", newChatTitle: "Chat mới", messagePlaceholder: "Bạn muốn biết gì?", aiTypingPlaceholder: "AI đang trả lời...", outOfTokensPlaceholder: "Bạn đã hết lượt.", sendButton: "Gửi", stopButton: "Dừng", modelButtonDefault: "Expert", modelButtonPrefix: "Mô Hình", randomButton: "Ngẫu nhiên", videoButton: "Tạo Video", learnButton: "Học Tập", footerText: "AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.", themeModalTitle: "Chọn Giao Diện", languageModalTitle: "Chọn Ngôn Ngữ", themeDark: "Tối", themeLight: "Sáng", themeOcean: "Biển", modalClose: "Đóng", newChatHistory: "Cuộc trò chuyện mới", greetingMorning: "Chào buổi sáng", greetingNoon: "Chào buổi trưa", greetingAfternoon: "Chào buổi chiều", greetingEvening: "Chào buổi tối", errorPrefix: "Đã có lỗi xảy ra", comingSoon: "Sắp có", comingSoonTitle: "Sắp có...", comingSoonText: "Tính năng này đang được phát triển.", langTooltip: "Đổi Ngôn Ngữ", themeTooltip: "Đổi Giao Diện", historyTooltip: "Lịch Sử Chat", newChatTooltip: "Chat Mới", modelMiniDesc: "Nhanh và hiệu quả.", modelSmartDesc: "Cân bằng tốc độ và thông minh.", modelNerdDesc: "Suy luận cao, kết quả chuẩn xác."
    },
    en: {
        sidebarHeader: "Chat History", newChatTitle: "New Chat", messagePlaceholder: "What do you want to know?", aiTypingPlaceholder: "AI is replying...", outOfTokensPlaceholder: "You're out of tokens.", sendButton: "Send", stopButton: "Stop", modelButtonDefault: "Expert", modelButtonPrefix: "Model", randomButton: "Random", videoButton: "Create Video", learnButton: "Study", footerText: "AI can make mistakes. Check important info.", themeModalTitle: "Choose Theme", languageModalTitle: "Select Language", themeDark: "Dark", themeLight: "Light", themeOcean: "Ocean", modalClose: "Close", newChatHistory: "New Conversation", greetingMorning: "Good morning", greetingNoon: "Good afternoon", greetingAfternoon: "Good afternoon", greetingEvening: "Good evening", errorPrefix: "An error occurred", comingSoon: "Coming Soon", comingSoonTitle: "Coming Soon...", comingSoonText: "Under development.", langTooltip: "Switch Language", themeTooltip: "Change Theme", historyTooltip: "Chat History", newChatTooltip: "New Chat", modelMiniDesc: "Fast and efficient.", modelSmartDesc: "Balanced speed and intelligence.", modelNerdDesc: "Powerful model for complex answers."
    },
};
// Fallback languages
['zh', 'hi', 'es', 'fr', 'ja', 'it'].forEach(lang => { if(!translations[lang]) translations[lang] = translations['en']; });

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
// 3. CORE FUNCTIONS                                                   //
//=====================================================================//

function saveStateToLocalStorage() {
    try {
        const historiesToSave = { ...chatHistories };
        if (historiesToSave[currentChatId] && historiesToSave[currentChatId].length === 0) {
            delete historiesToSave[currentChatId];
        }
        localStorage.setItem('chatHistories', JSON.stringify(historiesToSave));
        localStorage.setItem('currentChatId', currentChatId);
    } catch(e) { console.error("Save error:", e); }
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
    if (!themeColors[theme]) theme = 'dark';
    
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

    const allLogoColors = allConfigs.map(c => c.logo);
    if(textElements.logoText) {
        textElements.logoText.classList.remove(...allLogoColors);
        textElements.logoText.classList.add(config.logo);
    }

    // Cập nhật giao diện an toàn (kiểm tra element tồn tại)
    if(sidebar) {
        sidebar.classList.remove(...allConfigs.flatMap(c => c.sidebar || []).flat());
        sidebar.classList.add(...(config.sidebar || []));
    }
    if(chatFormEl) {
        chatFormEl.classList.remove(...allConfigs.flatMap(c => c.form || []).flat());
        chatFormEl.classList.add(...(config.form || []));
    }
    document.querySelectorAll('.header-pill-container').forEach(pill => {
        pill.classList.remove(...allConfigs.flatMap(c => c.headerPill || []).flat());
        pill.classList.add(...(config.headerPill || []));
    });

    const themeableIconEls = [
        sidebarToggle ? sidebarToggle.querySelector('svg') : null, 
        newChatHeaderBtn ? newChatHeaderBtn.querySelector('svg') : null,
        langSwitchBtn, getEl('theme-icon'),
        randomPromptBtn ? randomPromptBtn.querySelector('svg') : null, 
        videoBtn ? videoBtn.querySelector('svg') : null, 
        learnBtn ? learnBtn.querySelector('svg') : null, 
        uploadFileBtn ? uploadFileBtn.querySelector('svg') : null
    ];
    const allIconColors = allConfigs.map(c => c.iconColor);
    themeableIconEls.forEach(el => {
        if (el) {
            el.classList.remove(...allIconColors);
            el.classList.add(config.iconColor);
        }
    });
    
    const allInputColors = allConfigs.flatMap(c => c.inputColor || []).flat();
    if(messageInput) {
        messageInput.classList.remove(...allInputColors);
        messageInput.classList.add(...(config.inputColor || []));
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

    if(modelPopup) {
        modelPopup.classList.remove(...allConfigs.flatMap(c => c.popup).flat());
        modelPopup.classList.add(...config.popup);
    }

    const chatContainer = getEl('chat-container');
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
    setText(textElements.themeDarkText, t.themeDark);
    setText(textElements.themeLightText, t.themeLight);
    setText(textElements.themeOceanText, t.themeOcean);
    if(textElements.closeModalButton) setText(textElements.closeModalButton, t.modalClose);
    if(textElements.closeLanguageModalBtn) setText(textElements.closeLanguageModalBtn, t.modalClose);
    setText(textElements.comingSoonTitle, t.comingSoonTitle);
    setText(textElements.comingSoonText, t.comingSoonText);
    if(textElements.closeComingSoonModal) setText(textElements.closeComingSoonModal, t.modalClose);
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
    
    // updateActiveLanguageButton(lang);
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
    const mainTitle = getEl('main-title');
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

// --- UI HELPERS ---
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

// Events
if(themeMenuButton) themeMenuButton.addEventListener('click', () => showModal(themeModal, true));
if(textElements.closeModalButton) textElements.closeModalButton.addEventListener('click', () => showModal(themeModal, false));
if(themeModal) themeModal.addEventListener('click', (e) => { if(e.target === themeModal) showModal(themeModal, false); });

themeOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const theme = button.getAttribute('data-theme');
        applyTheme(theme);
        showModal(themeModal, false);
    });
});

if(langSwitchBtn) langSwitchBtn.addEventListener('click', () => showModal(languageModal, true));
if(textElements.closeLanguageModalBtn) textElements.closeLanguageModalBtn.addEventListener('click', () => showModal(languageModal, false));
if(languageModal) languageModal.addEventListener('click', (e) => { if(e.target === languageModal) showModal(languageModal, false); });

languageOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const lang = button.getAttribute('data-lang');
        switchLanguage(lang);
        showModal(languageModal, false);
    });
});

if(sidebarToggle && sidebar) sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('hidden');
});

// --- MODEL SELECTION (FIXED) ---
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
    
    const isSelected = currentModel && currentModel.model === model && (!version || currentModel.version === version);
    if (!isSelected) checkmarkContainer.classList.add('hidden');
    
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentModel = { model: m.model, version: m.version || null };
            localStorage.setItem('currentModel', JSON.stringify(currentModel));
            updateModelButtonText();
            if(modelPopup) modelPopup.classList.add('hidden');
        });
        modelPopup.appendChild(btn);
    });
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

//=====================================================================//
// 4. CHAT LOGIC & RENDER                                              //
//=====================================================================//

// Logic phân loại Search
const searchKeywordsRegex = /(quán|nhà hàng|ở đâu|địa chỉ|gần đây|đường nào|bản đồ|quan|nha hang|o dau|dia chi|gan day|duong nao|ban do|hôm nay|ngày mai|bây giờ|hiện tại|thời tiết|nhiệt độ|mưa không|hom nay|ngay mai|bay gio|hien tai|thoi tiet|nhiet do|mua khong|tin tức|sự kiện|mới nhất|vừa xảy ra|biến động|scandal|tin tuc|su kien|moi nhat|vua xay ra|bien dong|giá|bao nhiêu tiền|chi phí|tỷ giá|giá vàng|coin|crypto|chứng khoán|cổ phiếu|mua|bán|gia|bao nhieu tien|chi phi|ty gia|gia vang|chung khoan|co phieu|lịch thi đấu|kết quả|giờ mở cửa|kẹt xe|tắc đường|giao thông|lich thi dau|ket qua|gio mo cua|ket xe|tac duong|giao thong)/i;

function shouldShowSearchStatus(text) {
    const skipRegex = /(viết code|sửa lỗi|lập trình|giải toán|phương trình|đạo hàm|tích phân|văn học|bài văn|javascript|python|css|html|dịch sang|translate)/i;
    if (skipRegex.test(text)) return false;
    return searchKeywordsRegex.test(text);
}

function startNewChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    chatHistories[currentChatId] = conversationHistory;
    
    const chatContainer = getEl('chat-container');
    if(chatContainer) chatContainer.innerHTML = '';
    const initialView = getEl('initial-view');
    const mainContent = getEl('mainContent');
    
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
    const chatContainer = getEl('chat-container');

    for (const word of words) {
        currentText += word;
        element.innerHTML = formatAIResponse(currentText);
        if(chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        await new Promise(r => setTimeout(r, speed));
    }
    element.innerHTML = formatAIResponse(text);
}

// API STREAMING
async function streamAIResponse(modelName, messages, aiMessageEl, signal) {
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

// Submit Handler
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

// Token & Inputs
const currentTokenInput = getEl('current-token-input');
const maxTokenInput = getEl('max-token-input');
const tokenInputsContainer = getEl('token-inputs-container');
const tokenInfinity = getEl('token-infinity');

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

// Other UI Events
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
    const footerButtons = [randomPromptBtn, videoBtn, learnBtn, uploadFileBtn, modelButton];
    footerButtons.forEach(btn => { if(btn) btn.disabled = !isActive; });
}

// Random Prompt
const randomPrompts = {
    vi: ["Kể một câu chuyện cười", "Thủ đô của nước Pháp là gì?", "Viết một đoạn văn về tầm quan trọng của việc đọc sách.", "Công thức làm món phở bò?"],
    en: ["Tell me a joke", "What is the capital of France?", "Write a paragraph about the importance of reading books.", "What is the recipe for beef pho?"],
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

function updateLearnButtonVisualState() {
    if(!learnBtn) return;
    const learnIcon = learnBtn.querySelector('svg');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const activeColorClass = currentTheme === 'light' ? 'bg-blue-500' : 'bg-blue-600';
    const themeConfig = themeColors[currentTheme] || themeColors['dark'];
    
    if (isTutorMode) {
        learnBtn.classList.add(activeColorClass);
        if(learnIcon) {
            learnIcon.classList.add('text-white');
            if(themeConfig.iconColor) learnIcon.classList.remove(themeConfig.iconColor);
        }
    } else {
        learnBtn.classList.remove('bg-blue-600', 'bg-blue-500');
        if(learnIcon) {
            learnIcon.classList.remove('text-white');
            if(themeConfig.iconColor) learnIcon.classList.add(themeConfig.iconColor);
        }
    }
}

if(learnBtn) learnBtn.addEventListener('click', () => {
    isTutorMode = !isTutorMode; 
    localStorage.setItem('isTutorMode', isTutorMode);
    updateLearnButtonVisualState();
});

// File Upload
if(uploadFileBtn) uploadFileBtn.addEventListener('click', () => fileInput && fileInput.click());

if(fileInput) fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (stagedFile && stagedFile.type === 'video') {
        URL.revokeObjectURL(stagedFile.url);
    }
    stagedFile = null;
    if(fileThumbnailContainer) fileThumbnailContainer.innerHTML = '';
    
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

function renderHistoryList() {
    if(!historyList) return;
    historyList.innerHTML = '';
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme] || themeColors['dark'];

    Object.keys(chatHistories).sort().reverse().forEach(chatId => {
        const history = chatHistories[chatId];
        if (chatId === currentChatId && history.length === 0) return;

        let firstMessageText = translations[currentLang]?.newChatHistory || "Cuộc trò chuyện mới";
        if (history.length > 0) {
            const firstContent = history[0].content;
            if (typeof firstContent === 'string') {
                firstMessageText = firstContent;
            } else if (Array.isArray(firstContent)) {
                const mediaPart = firstContent.find(p => p.type === 'image_url' || p.type === 'video_url');
                const textPart = firstContent.find(p => p.type === 'text');
                if (mediaPart && mediaPart.type === 'image_url') firstMessageText = '[Hình ảnh]';
                if (mediaPart && mediaPart.type === 'video_url') firstMessageText = '[Video]';
                if (textPart && textPart.text) firstMessageText = (mediaPart ? firstMessageText + " " : "") + textPart.text;
            }
        }

        const item = document.createElement('div');
        item.className = 'history-item flex items-center justify-between p-2 rounded-md cursor-pointer';
        if(themeConfig.historyHover) item.classList.add(...themeConfig.historyHover);
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
    
    const chatContainer = getEl('chat-container');
    if(chatContainer) chatContainer.innerHTML = '';
    const initialView = getEl('initial-view');
    const mainContent = getEl('mainContent');

    if(conversationHistory.length > 0) {
         if(initialView) initialView.classList.add('hidden');
         if(chatContainer) chatContainer.classList.remove('hidden');
         if(mainContent) {
             mainContent.classList.remove('justify-center');
             mainContent.classList.add('justify-start');
         }
         conversationHistory.forEach(msg => {
            const el = createMessageElement(msg.content, msg.role);
            chatContainer.appendChild(el);
         });
         renderMath(chatContainer);
    } else {
         if(initialView) initialView.classList.remove('hidden');
         if(chatContainer) chatContainer.classList.add('hidden');
         setGreeting();
    }
     setActiveHistoryItem(chatId);
     updateRandomButtonVisibility();
     saveStateToLocalStorage();
}

function setActiveHistoryItem(chatId) {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const themeConfig = themeColors[currentTheme] || themeColors['dark'];
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove(...Object.values(themeColors).flatMap(t => t.historyActive).flat());
        if(item.dataset.chatId === chatId && themeConfig.historyActive) item.classList.add(...themeConfig.historyActive);
    });
}

// 5. MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', () => {
    // Security Gate
    function checkSecurityGate() {
        let verificationLimit = localStorage.getItem('verificationLimit');
        if (!verificationLimit) {
            verificationLimit = Math.floor(Math.random() * (7 - 2 + 1)) + 2;
            localStorage.setItem('verificationLimit', verificationLimit);
        } else verificationLimit = parseInt(verificationLimit);
        
        let usageCount = parseInt(localStorage.getItem('appUsageCount') || '0');
        usageCount++;
        if (usageCount >= verificationLimit) {
            localStorage.setItem('isLocked', 'true'); 
            window.location.href = 'verify.html';
        } else localStorage.setItem('appUsageCount', usageCount);
    }
    try { checkSecurityGate(); } catch(e) {}

    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedLang = localStorage.getItem('language') || 'vi';
    
    switchLanguage(savedLang);
    applyTheme(savedTheme);
    initializeApp();
    try { handleUpdateLog(); } catch(e) {}
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

    const initialView = getEl('initial-view');
    if (initialView && !initialView.classList.contains('hidden')) {
         const mt = getEl('main-title');
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
    if (closeUpdateLogBtn) closeUpdateLogBtn.addEventListener('click', closeAndSavePreference);
    if (updateLogModal) updateLogModal.addEventListener('click', (e) => { if(e.target === updateLogModal) closeAndSavePreference(); });
}
