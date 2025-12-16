import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChatMessage, Role } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
  theme: 'dark' | 'light' | 'ocean';
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, theme }) => {
  const isUser = message.role === Role.USER;

  const sources = message.groundingMetadata?.groundingChunks?.filter(c => c.web?.uri && c.web?.title) || [];

  const textColorClass = isUser 
    ? 'text-white' 
    : theme === 'light' 
      ? 'text-gray-900' 
      : 'text-gray-100';

  return (
    <div className={`w-full mb-6 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`relative rounded-3xl px-5 py-3 flex flex-col gap-2 animate-pop-in ${
          isUser 
            ? 'bg-blue-600 shadow-md origin-bottom-right ml-auto w-fit max-w-[85%]' 
            : 'bg-transparent origin-bottom-left w-full max-w-[90%] lg:max-w-[80%]' 
        }`}
      >
        {/* Image Attachment (User) */}
        {message.image && (
          <div className="mb-2">
            <img src={message.image} alt="User upload" className="max-w-full h-auto max-h-64 rounded-lg border border-white/20" />
          </div>
        )}

        {/* Content */}
        <div className={`markdown-body ${textColorClass} ${message.isStreaming ? 'cursor-blink' : ''}`}>
            {message.content === '' && message.isStreaming ? (
               // Just the blinking cursor handled by CSS class on wrapper
               <span className="opacity-0">|</span> 
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    return !inline ? (
                      <div className="my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700 shadow-xl w-full text-white">
                         <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-gray-700">
                             <span className="text-xs text-gray-400 font-mono font-bold uppercase">Code</span>
                         </div>
                         <div className="p-4 overflow-x-auto bg-[#1e1e1e]">
                             <code className="font-mono text-sm text-green-400 whitespace-pre" {...props}>{children}</code>
                         </div>
                      </div>
                    ) : (
                      <code className={`font-mono rounded px-1 py-0.5 ${isUser ? 'bg-white/20' : (theme === 'light' ? 'bg-gray-200 text-red-600' : 'bg-gray-700/50')}`} {...props}>{children}</code>
                    )
                  },
                  p: ({node, ...props}) => <p className={textColorClass} {...props} />,
                  li: ({node, ...props}) => <li className={textColorClass} {...props} />,
                  h1: ({node, ...props}) => <h1 className={`font-bold text-2xl mb-2 ${textColorClass}`} {...props} />,
                  h2: ({node, ...props}) => <h2 className={`font-bold text-xl mb-2 ${textColorClass}`} {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-blue-400" {...props} />
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className={`mt-2 pt-2 border-t flex flex-wrap gap-2 ${isUser ? 'border-white/20' : (theme === 'light' ? 'border-gray-300' : 'border-white/10')}`}>
            {sources.map((chunk, idx) => (
              <a 
                key={idx} 
                href={chunk.web?.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="source-pill"
                title={chunk.web?.title}
              >
                 {chunk.web?.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
