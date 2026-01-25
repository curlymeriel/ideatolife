import React, { useState, useRef, useEffect, memo } from 'react';
import { Bot, X, Sparkles, Send, Loader2 } from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { consultAssistantDirector, type ChatMessage as AiChatMessage } from '../services/gemini';
import { useWorkflowStore } from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';

interface AssistantDirectorChatProps {
    isOpen: boolean;
    onClose: () => void;
    localScript: any[];
    setLocalScript: (script: any[]) => void;
    saveToStore: (script: any[]) => void;
}

export const AssistantDirectorChat: React.FC<AssistantDirectorChatProps> = memo(({
    isOpen,
    onClose,
    localScript,
    setLocalScript,
    saveToStore
}) => {
    // Use shallow to minimize re-renders from the store
    const projectContext = useWorkflowStore(useShallow(state => ({
        seriesName: state.seriesName,
        episodeName: state.episodeName,
        episodeNumber: state.episodeNumber,
        seriesStory: state.seriesStory,
        characters: state.characters,
        episodeCharacters: state.episodeCharacters,
        seriesLocations: state.seriesLocations,
        episodeLocations: state.episodeLocations,
        seriesProps: state.seriesProps,
        episodeProps: state.episodeProps,
        episodePlot: state.episodePlot,
        targetDuration: state.targetDuration,
        aspectRatio: state.aspectRatio,
        masterStyle: state.masterStyle,
        apiKeys: state.apiKeys
    })));

    const productionChatHistory = useWorkflowStore(state => state.productionChatHistory);
    const setProductionChatHistory = useWorkflowStore(state => state.setProductionChatHistory);

    const [chatInput, setChatInput] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [isOpen, productionChatHistory]);

    const handleSendChatMessage = async () => {
        if (!chatInput.trim() || isConsulting) return;

        const userMsg: AiChatMessage = { role: 'user', content: chatInput };
        const updatedHistory = [...(productionChatHistory || []), userMsg];
        setProductionChatHistory(updatedHistory);
        setChatInput('');
        setIsConsulting(true);

        try {
            const context = {
                seriesName: projectContext.seriesName,
                episodeName: projectContext.episodeName,
                episodeNumber: projectContext.episodeNumber,
                seriesStory: projectContext.seriesStory || '',
                characters: projectContext.characters,
                seriesLocations: projectContext.seriesLocations,
                episodePlot: projectContext.episodePlot,
                episodeCharacters: projectContext.episodeCharacters,
                episodeLocations: projectContext.episodeLocations,
                seriesProps: projectContext.seriesProps || [],
                episodeProps: projectContext.episodeProps || [],
                targetDuration: projectContext.targetDuration,
                aspectRatio: projectContext.aspectRatio || '16:9',
                masterStyle: projectContext.masterStyle?.description || '',
                currentScript: localScript.map(cut => {
                    const allAssets = [
                        ...projectContext.characters,
                        ...projectContext.episodeCharacters,
                        ...projectContext.seriesLocations,
                        ...projectContext.episodeLocations
                    ];

                    const matchedAssets = (cut.referenceAssetIds || [])
                        .map((id: string) => allAssets.find((a: any) => a.id === id))
                        .filter(Boolean);

                    // Reconstruct Reference #N indexing logic from Step3_Production
                    const refUrls: string[] = [];
                    if (cut.userReferenceImage) refUrls.push(cut.userReferenceImage);

                    const assetsWithImages = matchedAssets
                        .map((a: any) => ({ name: a.name, url: a.masterImage || a.draftImage || a.referenceImage, type: a.type }))
                        .filter(a => !!a.url);

                    const remainingSlot = 4 - refUrls.length;
                    const limitedAssets = assetsWithImages.slice(0, remainingSlot);
                    limitedAssets.forEach(a => refUrls.push(a.url));

                    const linkedAssetsMeta = matchedAssets.map((asset: any) => {
                        const assetImageUrl = asset.masterImage || asset.draftImage || asset.referenceImage;
                        const imgIdx = refUrls.indexOf(assetImageUrl || '');
                        return {
                            name: asset.name,
                            type: asset.type,
                            refNumber: imgIdx !== -1 ? imgIdx + 1 : null,
                            hasImage: !!assetImageUrl
                        };
                    });

                    return {
                        ...cut,
                        linkedAssets: linkedAssetsMeta
                    };
                })
            };

            const result = await consultAssistantDirector(updatedHistory, context, projectContext.apiKeys.gemini);

            const aiMsg: AiChatMessage = { role: 'model', content: result.reply };
            setProductionChatHistory([...updatedHistory, aiMsg]);

            if (result.modifiedScript && result.modifiedScript.length > 0) {
                console.log("[AssistantDirectorChat] suggested script modifications:", result.modifiedScript);

                const updatedScript = [...localScript];
                result.modifiedScript.forEach((modCut: any) => {
                    const idx = updatedScript.findIndex(c => c.id === modCut.id);
                    if (idx !== -1) {
                        updatedScript[idx] = {
                            ...updatedScript[idx],
                            ...modCut,
                            audioUrl: modCut.audioUrl || updatedScript[idx].audioUrl,
                            finalImageUrl: modCut.finalImageUrl || updatedScript[idx].finalImageUrl,
                            isAudioConfirmed: modCut.isAudioConfirmed ?? updatedScript[idx].isAudioConfirmed,
                            isImageConfirmed: modCut.isImageConfirmed ?? updatedScript[idx].isImageConfirmed
                        };
                    }
                });

                setLocalScript(updatedScript);
                saveToStore(updatedScript);
            }
        } catch (error: any) {
            console.error("Chat Error:", error);
            const errorMsg: AiChatMessage = {
                role: 'model',
                content: `죄송합니다. 오류가 발생했습니다: ${error.message || 'Unknown Error'}`
            };
            setProductionChatHistory([...updatedHistory, errorMsg]);
        } finally {
            setIsConsulting(false);
        }
    };

    return (
        <div className={`fixed top-0 right-0 h-full z-[60] flex transition-all duration-300 ${isOpen ? 'w-[450px]' : 'w-0 overflow-hidden'}`}>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[-1]"
                    onClick={onClose}
                />
            )}

            <div className="bg-[#1a1a1a] border-l border-white/10 w-full h-full flex flex-col shadow-2xl">
                {/* Chat Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                            <Bot className="text-orange-400" size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">AI 조감독 (Assistant Director)</h3>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Senior Production Partner</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                    {(!productionChatHistory || productionChatHistory.length === 0) ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                                <Sparkles className="text-gray-600" size={32} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-300 font-medium font-noto">
                                    "안녕하세요 감독님, 조감독입니다."
                                </p>
                                <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                                    대사 수정, 컷 연출 변경, 혹은 특정 구간의 분위기 조정 등<br />
                                    무엇이든 말씀해 주세요. 스크립트 전체를 조망하며 반영하겠습니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center pt-4">
                                {["1번 컷 더 강렬하게", "대사 전체적으로 다듬어줘", "호흡 좀 더 빠르게"].map(suggest => (
                                    <button
                                        key={suggest}
                                        onClick={() => setChatInput(suggest)}
                                        className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                        {suggest}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        productionChatHistory.map((msg, i) => (
                            <ChatMessageItem key={i} msg={msg as any} />
                        ))
                    )}
                    {isConsulting && (
                        <div className="flex items-start gap-3 animate-pulse">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                <Bot size={16} className="text-orange-400" />
                            </div>
                            <div className="bg-white/5 rounded-2xl px-4 py-2 border border-white/10">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-white/5 bg-black/20">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSendChatMessage();
                        }}
                        className="relative"
                    >
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="감독으로서 지시를 내려주세요..."
                            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder:text-gray-500 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 outline-none transition-all resize-none min-h-[100px]"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendChatMessage();
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!chatInput.trim() || isConsulting}
                            className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all ${chatInput.trim() && !isConsulting
                                ? 'bg-orange-500 text-white shadow-lg'
                                : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {isConsulting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </form>
                    <p className="text-[9px] text-gray-500 mt-2 text-center">
                        Shift + Enter for new line. 지시는 즉시 스크립트에 반영될 수 있습니다.
                    </p>
                </div>
            </div>
        </div>
    );
});
