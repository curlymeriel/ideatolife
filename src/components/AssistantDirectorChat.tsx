import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Bot, X, Sparkles, Send, Loader2 } from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { consultAssistantDirector, type ChatMessage as AiChatMessage } from '../services/gemini';
import { useWorkflowStore } from '../store/workflowStore';
import { useShallow } from 'zustand/react/shallow';

interface AssistantDirectorChatProps {
    isOpen: boolean;
    onClose: () => void;
    localScript: any[];
    setLocalScript: React.Dispatch<React.SetStateAction<any[]>>;
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
        apiKeys: state.apiKeys,
        storylineTable: state.storylineTable
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

    // OPTIMIZATION: Memoize context to prevent heavy O(N) recalculations on every render
    const context = useMemo(() => ({
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
        storylineTable: projectContext.storylineTable,
        currentScript: localScript.map((cut, index) => {
            // Inject 1-based index as 'cut_number' for AI context
            const cutWithIndex = { ...cut, cut_number: index + 1 };

            const allAssets = [
                ...projectContext.characters,
                ...projectContext.episodeCharacters,
                ...projectContext.seriesLocations,
                ...projectContext.episodeLocations,
                ...(projectContext.seriesProps || []),
                ...(projectContext.episodeProps || [])
            ];

            const matchedAssets = (cut.referenceAssetIds || [])
                .map((id: string) => allAssets.find((a: any) => a.id === id))
                .filter(Boolean);

            const linkedReferences: any[] = [];

            // 1. User Uploads
            if (cut.userReferenceImage) {
                linkedReferences.push({
                    name: "User Reference",
                    type: "user",
                    hasImage: true
                });
            }

            // 2. Previous Cuts
            (cut.referenceCutIds || []).forEach((refId: number | string) => {
                const refCut = localScript.find(c => c.id === refId);
                linkedReferences.push({
                    name: `Cut #${refId}`,
                    type: "composition",
                    hasImage: !!refCut?.finalImageUrl
                });
            });

            // 3. Project Assets
            matchedAssets.forEach((asset: any) => {
                linkedReferences.push({
                    name: asset.name,
                    type: asset.type,
                    hasImage: !!(asset.masterImage || asset.draftImage || asset.referenceImage)
                });
            });

            return {
                ...cutWithIndex,
                linkedAssets: linkedReferences
            };
        }),
        assetDefinitions: useWorkflowStore.getState().assetDefinitions
    }), [projectContext, localScript]);

    const handleSendChatMessage = async () => {
        if (!chatInput.trim() || isConsulting) return;

        const userMsg: AiChatMessage = { role: 'user', content: chatInput };
        const updatedHistory = [...(productionChatHistory || []), userMsg];
        setProductionChatHistory(updatedHistory);
        setChatInput('');
        setIsConsulting(true);

        try {

            const result = await consultAssistantDirector(updatedHistory, context, projectContext.apiKeys.gemini);

            const aiMsg: AiChatMessage = { role: 'model', content: result.reply };
            setProductionChatHistory([...updatedHistory, aiMsg]);

            if (result.modifiedScript && result.modifiedScript.length > 0) {
                console.log("[AssistantDirectorChat] suggested script modifications:", result.modifiedScript);

                setLocalScript(prevScript => {
                    const updatedScript = [...prevScript];
                    let hasChanges = false;

                    // 1. Handle Modifications
                    (result.modifiedScript || []).forEach((modCut: any) => {
                        const modId = Number(modCut.id);
                        if (isNaN(modId)) return;

                        // [MAPPING LOGIC]
                        // Standard: Match by internal ID
                        let idx = updatedScript.findIndex(c => Number(c.id) === modId);

                        // FALLBACK 1: Check if AI explicitly provided 'cut_number'
                        if (idx === -1 && modCut.cut_number) {
                            const visualNum = Number(modCut.cut_number);
                            console.warn(`[AssistantDirector] ID ${modId} not found. Attempting Fallback 1: cut_number ${visualNum}`);
                            idx = visualNum - 1; // 1-based to 0-based
                        }

                        // FALLBACK 2: Check if 'id' sent by AI is actually a plausible 'cut_number'
                        // If id is small (e.g. 1-100) and we didn't find a matching long internal id,
                        // it's highly likely the AI inserted the visual number into the id field.
                        if (idx === -1 && modId > 0 && modId <= updatedScript.length) {
                            // Double check if the internal ID at this visual index is NOT modId
                            // If it were, it would have been found in the initial 'findIndex'.
                            console.warn(`[AssistantDirector] ID ${modId} not found in internal IDs. Attempting Fallback 2: interpreting ID as cut_number.`);
                            idx = modId - 1;
                        }

                        // VALIDATION: Ensure the resolved index is within bounds
                        if (idx < 0 || idx >= updatedScript.length) {
                            console.error(`[AssistantDirector] Failed to map cut (modId: ${modId}, cut_num: ${modCut.cut_number}) to a valid index.`);
                            idx = -1;
                        }

                        if (idx !== -1) {
                            console.log(`[AssistantDirector] Successfully mapped modId ${modId} to cut index ${idx} (Original ID: ${updatedScript[idx].id})`);
                            updatedScript[idx] = {
                                ...updatedScript[idx],
                                ...modCut,
                                id: updatedScript[idx].id, // ALWAYS preserve existing internal ID
                                audioUrl: modCut.audioUrl || updatedScript[idx].audioUrl,
                                finalImageUrl: modCut.finalImageUrl || updatedScript[idx].finalImageUrl,
                                isAudioConfirmed: modCut.isAudioConfirmed ?? updatedScript[idx].isAudioConfirmed,
                                isImageConfirmed: modCut.isImageConfirmed ?? updatedScript[idx].isImageConfirmed
                            };
                            hasChanges = true;
                        }
                    });

                    // 2. Handle Insertions (New Feature)
                    if (result.newCuts && result.newCuts.length > 0) {
                        console.log("[AssistantDirectorChat] Inserting new cuts:", result.newCuts);

                        // Sort by afterCutId in descending order to prevent index shift issues during splice
                        // -1 (beginning) should be processed last or handled carefully.
                        const sortedNewCuts = [...result.newCuts].sort((a: any, b: any) => {
                            const idA = Number(a.afterCutId);
                            const idB = Number(b.afterCutId);
                            return idB - idA;
                        });

                        sortedNewCuts.forEach((newCutReq: any) => {
                            const afterId = Number(newCutReq.afterCutId);
                            const insertIndex = afterId === -1 ? -1 : updatedScript.findIndex(c => Number(c.id) === afterId);

                            if (afterId === -1 || insertIndex !== -1) {
                                // Generate temp ID safely
                                const numericIds = updatedScript.map(c => Number(c.id)).filter(id => !isNaN(id));
                                const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
                                const newCutId = maxId + 1;

                                const newCut = {
                                    ...newCutReq.cut,
                                    id: newCutId,
                                    isConfirmed: false,
                                    isAudioConfirmed: false,
                                    isImageConfirmed: false
                                };

                                if (afterId === -1) {
                                    updatedScript.unshift(newCut);
                                } else {
                                    updatedScript.splice(insertIndex + 1, 0, newCut);
                                }
                                hasChanges = true;
                            } else {
                                console.warn(`Could not find cut with ID ${afterId} to insert after.`);
                            }
                        });
                    }

                    if (hasChanges) {
                        saveToStore(updatedScript);
                        return updatedScript;
                    }
                    return prevScript;
                });
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
