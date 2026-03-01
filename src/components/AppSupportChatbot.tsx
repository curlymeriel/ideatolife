import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Loader2, Eraser, AlertCircle } from 'lucide-react';
import { useWorkflowStore } from '../store/workflowStore';
import { type ChatMessage, consultSupport } from '../services/gemini';

interface AppSupportChatbotProps {
    isOpen: boolean;
    onClose: () => void;
}

const SUPPORT_SYSTEM_PROMPT = `
You are the AI Assistant for "Idea to Life", an AI-powered video creation tool.
Your goal is to help users understand how to use this application and troubleshoot issues.

**APP OVERVIEW:**
"Idea to Life" transforms text ideas into video content through a 6-step workflow:
1. **Setup:** Plan Series/Episode, define plot.
2. **Key Visuals (Style):** Define Characters, Locations, and Props style.
3. **Production:** Generate Script (Gemini), create Images (Gemini), and generate Audio (Google TTS).
   - *Key Rule:* Cuts must be <= 8 seconds.
   - *Key Rule:* Locked cuts are preserved.
4. **Review (QA):** Check all assets.
4.5. **Video:** Convert static images to video using Replicate (Kling/Veo).
5. **Thumbnail:** Create a thumbnail for the video.
6. **Final:** Export the final result.

**TROUBLESHOOTING KNOWLEDGE:**
- **Data Loss:** Data is stored in specific browser (IndexedDB). Usage of Incognito mode or clearing cache deletes data.
- **Images not loading:** Try "Optimize Storage" in Dashboard.
- **API Keys:** Step 3/4.5 require API keys (Gemini, Google Cloud, Replicate).
- **Video Issues:** Replicate API key is required for Step 4.5.
- **Veo Video Generation:** To use Veo for video generation, users MUST enable "Vertex AI API" in Google Cloud Console and link a billing account (credit card) to their Google Cloud Project. It doesn't work on the free tier.

**TONE:**
- Friendly, encouraging, and technical when needed but simple to understand.
- Speak in **Korean** by default suitable for a Korean user base.

**LIMITATIONS:**
- You cannot perform actions in the app directly (like clicking buttons). You must guide the user to do it.
- If unsure, suggest checking the "Guide" or "Support" modal.
`;

export const AppSupportChatbot: React.FC<AppSupportChatbotProps> = ({ isOpen, onClose }) => {
    const { apiKeys } = useWorkflowStore();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: '안녕하세요! App 사용법이나 문제에 대해 궁금한 점이 있으신가요? 무엇이든 물어보세요! 😊' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const reply = await consultSupport(
                [...messages, userMsg], // Pass full history
                apiKeys?.gemini || '',
                SUPPORT_SYSTEM_PROMPT
            );

            setMessages(prev => [...prev, { role: 'model', content: reply }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'model', content: '죄송합니다. 오류가 발생했습니다. Gemini API Key를 확인해주세요.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearHistory = () => {
        setMessages([{ role: 'model', content: '대화가 초기화되었습니다. 무엇을 도와드릴까요?' }]);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[1100] w-[400px] h-[600px] flex flex-col glass-panel shadow-2xl animate-fade-in border border-[var(--color-primary)]/30">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-primary)]/10">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-[var(--color-primary)]/20 rounded-full">
                        <Bot size={20} className="text-[var(--color-primary)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">AI Support Agent</h3>
                        <p className="text-[10px] text-[var(--color-primary)]">Powered by Gemini</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={clearHistory}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-xs text-gray-400"
                        title="Clear History"
                    >
                        <Eraser size={16} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[var(--color-border)]" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-600' : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'}`}>
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                        </div>
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                ? 'bg-[var(--color-surface)] text-white border border-[var(--color-border)] rounded-tr-none'
                                : 'bg-[var(--color-primary)]/10 text-gray-100 border border-[var(--color-primary)]/20 rounded-tl-none'
                                }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] flex items-center justify-center">
                            <Bot size={16} />
                        </div>
                        <div className="bg-[var(--color-primary)]/10 rounded-2xl rounded-tl-none px-4 py-3 border border-[var(--color-primary)]/20">
                            <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Overlay if No Key */}
            {isOpen && !apiKeys?.gemini && (
                <div className="absolute inset-x-0 bottom-0 top-16 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="text-center p-6">
                        <AlertCircle className="mx-auto text-red-400 mb-2" size={32} />
                        <p className="text-white font-bold mb-1">API Key Missing</p>
                        <p className="text-xs text-gray-300">Gemini API Key가 설정되지 않았습니다.<br />좌측 메뉴에서 설정해주세요.</p>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full px-4 py-2 focus-within:border-[var(--color-primary)] transition-colors">
                    <input
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500"
                        placeholder="이 기능은 어떻게 쓰나요?"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading || !apiKeys?.gemini}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading || !apiKeys?.gemini}
                        className="p-1.5 bg-[var(--color-primary)] rounded-full text-black disabled:opacity-50 disabled:bg-gray-600 transition-all hover:scale-105 active:scale-95"
                    >
                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
};


