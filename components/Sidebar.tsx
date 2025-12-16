import React from 'react';
import { ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onToggleSidebar
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-20 transition-opacity md:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onToggleSidebar}
      />

      {/* Sidebar Content */}
      <aside 
        className={`fixed md:relative z-30 flex flex-col h-full w-[260px] bg-gray-950 border-r border-gray-800 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-none'
        }`}
      >
        <div className="p-3 flex-shrink-0">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onToggleSidebar();
            }}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          <div className="text-xs font-semibold text-gray-500 px-3 py-2">Recent</div>
          {sessions.length === 0 && (
            <div className="text-xs text-gray-600 px-3 italic">No history yet</div>
          )}
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => {
                onSelectSession(session.id);
                if (window.innerWidth < 768) onToggleSidebar();
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                currentSessionId === session.id 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-300 hover:bg-gray-900'
              }`}
            >
              {session.title}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800">
           <div className="flex items-center gap-3 text-sm text-white">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center font-bold">
                O
              </div>
              <span className="font-medium">Oceep AI</span>
           </div>
        </div>
      </aside>
    </>
  );
};
