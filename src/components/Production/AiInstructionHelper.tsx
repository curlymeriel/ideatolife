import React, { useState, memo } from 'react';
import { Send, Bot, X, Loader2 } from 'lucide-react';
import { modifyInstructionWithAI } from '../../services/gemini';

interface AiInstructionHelperProps {
    currentInstruction: string;
    onInstructionChange: (newInstruction: string) => void;
    instructionType: 'script' | 'video';
    apiKey: string;
    accentColor?: string; // 'primary' or 'purple'
}

export const AiInstructionHelper = memo(({
    currentInstruction,
    onInstructionChange,
    instructionType,
    apiKey,
    accentColor = 'primary'
}: AiInstructionHelperProps) => {
    // Local state - won't affect parent re-renders
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isPurple = accentColor === 'purple';
    const borderClass = isPurple ? 'border-purple-500/30' : 'border-[var(--color-border)]';
    const iconClass = isPurple ? 'text-purple-400' : 'text-[var(--color-primary)]';
    const buttonClass = isPurple
        ? 'bg-purple-600 text-white'
        : 'bg-[var(--color-primary)] text-black';
    const inputBorderClass = isPurple ? 'border-purple-500/30 focus:border-purple-500' : 'border-[var(--color-border)] focus:border-[var(--color-primary)]';

    const handleRequest = async () => {
        if (!input.trim() || !apiKey) {
            setMessage({ type: 'error', text: 'API 키가 없거나 입력이 비어있습니다.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const result = await modifyInstructionWithAI(
                currentInstruction,
                input,
                instructionType,
                apiKey
            );

            if (result.success && result.modifiedInstruction) {
                onInstructionChange(result.modifiedInstruction);
                setMessage({
                    type: 'success',
                    text: `✨ ${result.explanation || '지시문이 수정되었습니다. 변경사항을 확인해 주세요!'}`
                });
                setInput('');
            } else {
                setMessage({ type: 'error', text: result.error || '수정에 실패했습니다.' });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || '오류가 발생했습니다.' });
        } finally {
            setLoading(false);
        }
    };

    const placeholderText = instructionType === 'script'
        ? '예: 대사를 더 짧게 만들어줘 / 감정 표현을 더 풍부하게 해줘'
        : '예: 카메라 무브먼트를 더 부드럽게 해줘 / 캐릭터 동작에 집중해줘';

    return (
        <div className={`bg-[var(--color-surface)] border ${borderClass} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-3">
                <Bot size={16} className={iconClass} />
                <span className="text-sm font-bold text-white">AI에게 수정 요청하기</span>
                <span className="text-[10px] text-gray-500">(자연어로 요청하면 AI가 지시문을 수정해 드려요)</span>
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loading && input.trim()) {
                            handleRequest();
                        }
                    }}
                    placeholder={placeholderText}
                    className={`flex-1 bg-black/30 border ${inputBorderClass} rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors`}
                    disabled={loading}
                />
                <button
                    onClick={handleRequest}
                    disabled={loading || !input.trim()}
                    className={`flex items-center gap-2 px-4 py-2 ${buttonClass} font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {loading ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <Send size={16} />
                    )}
                    수정 요청
                </button>
            </div>
            {message && (
                <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {message.type === 'success' ? '✅' : '❌'}
                    <span>{message.text}</span>
                    <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70">
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
});

AiInstructionHelper.displayName = 'AiInstructionHelper';
