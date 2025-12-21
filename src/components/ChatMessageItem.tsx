import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'model';
    content: string;
    image?: string;
    fileContent?: string;
    fileName?: string;
    fileType?: 'image' | 'text' | 'json';
}

interface ChatMessageItemProps {
    msg: ChatMessage;
}

export const ChatMessageItem = memo(({ msg }: ChatMessageItemProps) => {
    return (
        <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                    <Bot size={18} className="text-black" />
                </div>
            )}
            <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user'
                ? 'bg-[var(--color-primary)]/20 text-white border border-[var(--color-primary)]/30'
                : 'bg-[var(--color-surface)] text-white border border-[var(--color-border)]'
                }`}>
                <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ node, ...props }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />,
                            li: ({ node, ...props }) => <li className="" {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-500 pl-4 italic my-2" {...props} />,
                            table: ({ node, ...props }) => <div className="overflow-x-auto my-2"><table className="w-full text-left border-collapse" {...props} /></div>,
                            th: ({ node, ...props }) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-highlight)] px-3 py-2 font-semibold text-xs text-white" {...props} />,
                            td: ({ node, ...props }) => <td className="border border-[var(--color-border)] px-3 py-2 text-xs text-gray-300" {...props} />
                        }}
                    >
                        {msg.content}
                    </ReactMarkdown>
                </div>
            </div>
            {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white opacity-100 flex items-center justify-center">
                    <User size={18} className="text-[#F97316]" />
                </div>
            )}
        </div>
    );
});
