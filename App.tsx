import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageBubble } from './components/MessageBubble';
import { streamGeminiResponse } from './services/geminiService';
import { ChatMessage, ChatSession, Role } from './types';
import { v4 as uuidv4 } from 'uuid';
import { GroundingMetadata } from '@google/genai';

type Theme = 'dark' | 'light' | 'ocean';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [stagedImage, setStagedImage] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) setTheme(savedTheme);

    const savedSessions = localStorage.getItem('oceep_sessions');
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      setSessions(parsed);
      if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
      else createNewSession();
    } else {
      createNewSession();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('oceep_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isStreaming]);

  const getCurrentSession = () => sessions.find(s => s.id === currentSessionId);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'Cuộc trò chuyện mới',
      messages: [],
      createdAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const updateCurrentSessionMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let newTitle = s.title;
        const newMessages = updater(s.messages);
        if (s.messages.length === 0 && newMessages.length > 0 && newMessages[0].role === Role.USER) {
          const textContent = newMessages[0].content || (newMessages[0].image ? '[Hình ảnh]' : 'Chat mới');
          newTitle = textContent.slice(0, 30) + (textContent.length > 30 ? '...' : '');
        }
        return { ...s, messages: newMessages, title: newTitle };
      }
      return s;
    }));
  };

  const handleSend = async (manualInput?: string) => {
    const textToSend = manualInput !== undefined ? manualInput : input;
    
    // Prevent sending if empty (and no image) or streaming
    if ((!textToSend.trim() && !stagedImage) || isStreaming || !currentSessionId) return;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: Role.USER,
      content: textToSend.trim(),
      image: stagedImage || undefined
    };

    const aiMsgId = uuidv4();
    const aiMsgPlaceholder: ChatMessage = {
      id: aiMsgId,
      role: Role.MODEL,
      content: '',
      isStreaming: true
    };

    // Reset inputs
    setInput('');
    setStagedImage(null);
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }

    updateCurrentSessionMessages(prev => [...prev, userMsg, aiMsgPlaceholder]);
    setIsStreaming(true);

    try {
      const currentHistory = sessions.find(s => s.id === currentSessionId)?.messages || [];
      const streamResult = await streamGeminiResponse(currentHistory, userMsg.content, isSearchEnabled, userMsg.image);

      let fullText = '';
      let groundingMeta: GroundingMetadata | undefined;

      for await (const chunk of streamResult) {
        const textChunk = chunk.text || '';
        fullText += textChunk;
        if (chunk.candidates?.[0]?.groundingMetadata) {
          groundingMeta = chunk.candidates[0].groundingMetadata;
        }
        updateCurrentSessionMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, content: fullText, groundingMetadata: groundingMeta } 
            : msg
        ));
      }
    } catch (error) {
      updateCurrentSessionMessages(prev => prev.map(msg => 
        msg.id === aiMsgId ? { ...msg, content: "Đã có lỗi xảy ra. Vui lòng thử lại." } : msg
      ));
    } finally {
      setIsStreaming(false);
      updateCurrentSessionMessages(prev => prev.map(msg => 
        msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg
      ));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // If Shift+Enter, let default behavior happen (new line)
    }
  };

  const handleRandomPrompt = () => {
    const prompts = [
      "Kể cho tôi nghe một câu chuyện cười",
      "Viết một đoạn code Python để in ra dãy số Fibonacci",
      "Tóm tắt tin tức công nghệ mới nhất hôm nay",
      "Công thức làm món Phở Bò ngon?",
      "Giải thích thuyết tương đối rộng cho trẻ em"
    ];
    const random = prompts[Math.floor(Math.random() * prompts.length)];
    // Automatically send
    handleSend(random);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setStagedImage(ev.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getThemeClasses = () => {
    switch (theme) {
      case 'light':
        return 'bg-white text-gray-900';
      case 'ocean':
        return 'bg-cover bg-center text-white';
      case 'dark':
      default:
        return 'bg-gradient-to-br from-[#212935] to-black text-gray-100';
    }
  };

  const getFooterColors = () => {
    if (theme === 'light') {
       return {
         input: 'text-gray-900 placeholder-gray-500',
         icon: 'text-gray-600 hover:bg-gray-200',
         bg: 'bg-white/80 border-gray-300',
         searchActive: 'bg-blue-600 text-white',
       };
    }
    return {
       input: 'text-gray-200 placeholder-gray-400',
       icon: 'text-gray-300 hover:bg-white/10',
       bg: 'bg-black/30 border-white/20',
       searchActive: 'bg-blue-600 text-white',
    };
  };
  
  const footerColors = getFooterColors();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Chào buổi sáng';
    if (hour < 14) return 'Chào buổi trưa';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  const currentMessages = getCurrentSession()?.messages || [];

  return (
    <div className={`relative flex h-full overflow-hidden transition-colors duration-500 ${getThemeClasses()}`} style={theme === 'ocean' ? { backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173&auto=format&fit=crop')" } : {}}>
      {theme === 'ocean' && <div className="absolute inset-0 bg-black/40 pointer-events-none" />}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 bg-gray-950 border-r border-white/10 flex flex-col shadow-2xl`}>
        <div className="p-4 flex flex-col gap-4">
           {/* Sidebar Header with Close Button for Mobile */}
           <div className="flex justify-between items-center lg:hidden">
              <h2 className="font-bold text-lg text-white">Menu</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
           </div>
           
           {/* Big New Chat Button */}
           <button 
             onClick={() => { createNewSession(); setIsSidebarOpen(false); }}
             className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-full font-semibold transition-transform active:scale-95 shadow-lg shadow-blue-900/20"
           >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
              Trò chuyện mới
           </button>
           
           <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-2">Lịch sử</div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
           {sessions.map(session => (
             <button 
                key={session.id}
                onClick={() => { setCurrentSessionId(session.id); setIsSidebarOpen(false); }}
                className={`w-full text-left p-3 rounded-xl text-sm truncate transition-colors ${
                  currentSessionId === session.id 
                    ? 'bg-white/10 text-white' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
             >
                {session.title}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 h-full w-full">
        {/* Header */}
        <header className="p-4 flex justify-between items-center z-20">
            <div className="flex items-center gap-4">
                <div className="flex items-center text-xl font-semibold select-none">
                    <svg width="28" height="28" viewBox="0 0 100 100">
                        <defs>
                            <radialGradient id="bubbleGradient" cx="0.3" cy="0.3" r="0.7">
                                <stop offset="0%" style={{stopColor:'rgb(220,240,255)', stopOpacity:1}} />
                                <stop offset="100%" style={{stopColor:'rgb(51, 149, 240)', stopOpacity:1}} />
                            </radialGradient>
                        </defs>
                        <circle cx="50" cy="50" r="45" fill="url(#bubbleGradient)" stroke="rgba(255,255,255,0.7)" strokeWidth="3"/>
                        <path d="M 35 30 A 25 25 0 0 1 60 55" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-blue-400 text-2xl ml-0.5 font-semibold">ceep</span>
                </div>

                <div className={`flex items-center gap-1 p-1 rounded-full backdrop-blur ${theme === 'light' ? 'bg-gray-200/50' : 'bg-white/5'}`}>
                     <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`w-10 h-10 flex items-center justify-center rounded-full lg:hidden active:scale-90 transition-transform ${theme === 'light' ? 'text-gray-700 hover:bg-white' : 'text-white hover:bg-white/10'}`}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                     </button>
                     <button onClick={createNewSession} className={`w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform ${theme === 'light' ? 'text-gray-700 hover:bg-white' : 'text-white hover:bg-white/10'}`} title="Chat Mới">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                     </button>
                </div>
            </div>

            <div className="flex items-center gap-2">
                 <button className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-semibold active:scale-90 transition-transform ${theme === 'light' ? 'text-gray-700 hover:bg-white/50' : 'text-white hover:bg-white/10'}`}>VI</button>
                 <button onClick={() => setShowThemeModal(true)} className={`w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform ${theme === 'light' ? 'text-gray-700 hover:bg-white/50' : 'text-white hover:bg-white/10'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
                 </button>
            </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col p-4 overflow-hidden">
             {currentMessages.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center animate-fade-up">
                     <h1 className={`text-5xl font-bold mb-4 opacity-90 ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>{getGreeting()}</h1>
                </div>
             ) : (
                <div key={currentSessionId} className="w-full max-w-3xl mx-auto flex-grow mb-4 overflow-y-auto px-2 animate-fade-up">
                   {currentMessages.map(msg => <MessageBubble key={msg.id} message={msg} theme={theme} />)}
                   <div ref={bottomRef}></div>
                </div>
             )}
        </main>

        {/* Footer Input */}
        <footer className="w-full max-w-3xl mx-auto px-4 pb-4 z-20">
            <div className={`relative flex flex-col backdrop-blur-lg rounded-[2rem] shadow-lg p-1.5 border transition-colors duration-300 ${footerColors.bg}`}>
                
                {/* Staged Image Preview */}
                {stagedImage && (
                  <div className="px-4 pt-2 relative inline-block w-fit">
                    <img src={stagedImage} alt="Preview" className="h-16 rounded-lg border border-white/20" />
                    <button 
                      onClick={() => setStagedImage(null)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="flex items-end w-full">
                    {/* Auto-growing Textarea */}
                    <textarea 
                       ref={textareaRef}
                       value={input}
                       onChange={(e) => {
                         setInput(e.target.value);
                         e.target.style.height = 'auto';
                         e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                       }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           handleSend();
                         }
                       }}
                       placeholder="Bạn muốn biết gì?" 
                       rows={1}
                       className={`flex-grow bg-transparent border-none focus:ring-0 focus:outline-none text-lg pl-5 py-3 resize-none max-h-[150px] ${footerColors.input}`}
                    />
                    
                    <div className="flex items-center shrink-0 pr-1 pb-1.5 gap-1">
                         {/* Random Prompt */}
                         <div className="relative group hidden sm:block">
                            <button onClick={handleRandomPrompt} className={`p-2.5 rounded-full transition-colors active:scale-90 transform ${footerColors.icon}`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded shadow opacity-0 group-hover:opacity-100 transition pointer-events-none">Ngẫu nhiên</span>
                         </div>

                         {/* Search Toggle */}
                         <div className="relative group">
                             <button 
                                onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                className={`p-2.5 rounded-full transition-colors active:scale-90 transform ${isSearchEnabled ? footerColors.searchActive : footerColors.icon}`}
                             >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" strokeWidth="1.5"></circle><path strokeLinecap="round" strokeWidth="1.5" d="m21 21-4.35-4.35"></path></svg>
                             </button>
                             <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded shadow opacity-0 group-hover:opacity-100 transition pointer-events-none">{isSearchEnabled ? "Tắt tìm kiếm" : "Bật tìm kiếm"}</span>
                         </div>
                         
                         {/* Upload */}
                         <div className="relative group">
                            <button onClick={() => fileInputRef.current?.click()} className={`p-2.5 rounded-full transition-colors active:scale-90 transform ${footerColors.icon}`}>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                            </button>
                            <input 
                              type="file" 
                              ref={fileInputRef} 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleFileSelect}
                            />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded shadow opacity-0 group-hover:opacity-100 transition pointer-events-none">Tải ảnh</span>
                         </div>

                         {/* Send Button */}
                         {input.trim() || stagedImage ? (
                             <button onClick={() => handleSend()} className="flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors shrink-0 ml-1 shadow-lg active:scale-90 transform">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
                             </button>
                         ) : (
                             <button className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors shrink-0 ml-1 cursor-default ${theme === 'light' ? 'bg-gray-200 text-gray-400' : 'bg-gray-200/20 text-gray-500'}`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
                             </button>
                         )}
                    </div>
                </div>
            </div>
            <p className={`text-center text-xs mt-2 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>AI có thể mắc lỗi. Hãy cân nhắc kiểm tra thông tin quan trọng.</p>
        </footer>
      </div>

      {/* Theme Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowThemeModal(false)}>
            <div className="bg-gray-900 border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-5 text-white text-center">Chọn Giao Diện</h2>
                <div className="grid grid-cols-3 gap-4">
                    <button onClick={() => {setTheme('dark'); setShowThemeModal(false)}} className={`p-4 rounded-lg border active:scale-95 transition-transform ${theme === 'dark' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:bg-white/5'} flex flex-col items-center gap-2 text-white`}>
                        <div className="w-full h-12 bg-[#212935] rounded ring-1 ring-white/10"></div>
                        <span className="text-sm">Tối</span>
                    </button>
                    <button onClick={() => {setTheme('light'); setShowThemeModal(false)}} className={`p-4 rounded-lg border active:scale-95 transition-transform ${theme === 'light' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:bg-white/5'} flex flex-col items-center gap-2 text-white`}>
                        <div className="w-full h-12 bg-white rounded ring-1 ring-white/10"></div>
                        <span className="text-sm">Sáng</span>
                    </button>
                    <button onClick={() => {setTheme('ocean'); setShowThemeModal(false)}} className={`p-4 rounded-lg border active:scale-95 transition-transform ${theme === 'ocean' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:bg-white/5'} flex flex-col items-center gap-2 text-white`}>
                         <div className="w-full h-12 rounded bg-cover ring-1 ring-white/10" style={{backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1173')"}}></div>
                        <span className="text-sm">Biển</span>
                    </button>
                </div>
                <button onClick={() => setShowThemeModal(false)} className="mt-6 w-full py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors active:scale-95">Đóng</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;