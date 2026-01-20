import React, { useState, useEffect } from 'react';
import { X, Wand2, Loader2, ImageIcon, Send, Sparkles, Image, Check, Plus, Trash2, Maximize2, Tag } from 'lucide-react';
import { generateImage, editImageWithChat } from '../services/imageGen';
import { generateText } from '../services/gemini';
import { resolveUrl } from '../utils/imageStorage';

interface TaggedReference {
    id: string;
    url: string;
    category: 'face' | 'style' | 'color' | 'composition' | 'character';
}

const DEFAULT_CATEGORIES = [
    { value: 'face', label: '얼굴 / Face' },
    { value: 'style', label: '스타일 / Style' },
    { value: 'color', label: '색감 / Color' },
    { value: 'composition', label: '구도 / Logic' },
];

interface ChannelArtModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'banner' | 'profile';
    channelName: string;
    initialPrompt: string;
    initialUrl?: string;
    apiKey: string;
    strategyContext: string;
    characters?: Array<{ name: string }>;
    onSave: (url: string, prompt: string) => void;
}

export const ChannelArtModal: React.FC<ChannelArtModalProps> = ({
    isOpen,
    onClose,
    type,
    channelName,
    initialPrompt,
    initialUrl,
    apiKey,
    strategyContext,
    characters = [],
    onSave,
}) => {
    const [prompt, setPrompt] = useState(initialPrompt);
    const [history, setHistory] = useState<string[]>([]);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(initialUrl || null);
    const [taggedReferences, setTaggedReferences] = useState<TaggedReference[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isChatProcessing, setIsChatProcessing] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant', text: string }>>([]);
    const [showLargeView, setShowLargeView] = useState(false);

    // Combine default categories with dynamic character categories
    const referenceCategories = [
        ...DEFAULT_CATEGORIES,
        ...characters.map(c => ({ value: `character-${c.name}`, label: `캐릭터: ${c.name}` }))
    ];

    useEffect(() => {
        if (isOpen) {
            setPrompt(initialPrompt);
            setSelectedUrl(initialUrl || null);
            if (initialUrl && !history.includes(initialUrl)) {
                setHistory([initialUrl]);
            }
        }
    }, [isOpen, initialPrompt, initialUrl]);

    const handleGenerate = async () => {
        if (!prompt || !apiKey) return;
        setIsGenerating(true);
        try {
            const aspectRatio = type === 'banner' ? '16:9' : '1:1';
            const refUrls = taggedReferences.map(r => r.url);
            const result = await generateImage(prompt, apiKey, refUrls.length > 0 ? refUrls : undefined, aspectRatio, 'imagen-3.0-generate-001');
            if (result.urls?.[0]) {
                const resolved = await resolveUrl(result.urls[0]) || result.urls[0];
                setHistory(prev => [resolved, ...prev]);
                setSelectedUrl(resolved);
            }
        } catch (error: any) {
            console.error('Generation failed:', error);
            alert(`생성 실패: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAIExpand = async () => {
        if (!apiKey) return;
        setIsExpanding(true);
        try {
            let referenceContext = '';

            // Analyze references if present
            if (taggedReferences.length > 0) {
                const analysisResults = await Promise.all(taggedReferences.map(async (ref) => {
                    const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                    if (!matches) return null;

                    const catLabel = referenceCategories.find(c => c.value === ref.category)?.label || ref.category;
                    const prompt = `Analyze this image for ${catLabel} aspects. Provide a detailed visual description in English for AI image generation. Output ONLY the description.`;

                    try {
                        const result = await generateText(prompt, apiKey, undefined, [{ mimeType: matches[1], data: matches[2] }]);
                        return `[Reference: ${catLabel}]\n${result}`;
                    } catch (e) {
                        return null;
                    }
                }));
                referenceContext = analysisResults.filter(Boolean).join('\n\n');
            }

            const systemPrompt = `당신은 유튜브 ${type === 'banner' ? '배너' : '프로필'} 디자인 전문가입니다. 다음 전략 및 이미지 분석 맥락을 바탕으로 고품질의 이미지 생성 프롬프트를 작성해주세요. 프리미엄하고 감각적인 최신 트렌드를 반영해야 합니다. 영어로만 상세하게 출력하세요.`;
            const fullPrompt = `채널명: ${channelName}
현재 프롬프트: ${prompt}
전략 맥락: ${strategyContext}
${referenceContext ? `참조 이미지 분석 및 카테고리 정보:\n${referenceContext}` : ''}

[지침]
위 정보들을 종합하여, 시각적으로 매우 상세하고 일관성 있는 제작용 프롬프트로 확장해줘.
특히, 참조 이미지의 각 카테고리(Face, Style, Color, Composition, Character 등) 정보가 프롬프트 내에 '구체적인 시각 효과'로 정확히 반영되어야 해. 
예를 들어, Style 참조라면 해당 스타일의 특징을 프롬프트에 녹여내고, Color 참조라면 해당 색감을 정의에 포함시켜줘.`;

            const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
            if (result) {
                setPrompt(result.trim());
            }
        } catch (error) {
            console.error('AI Expand failed:', error);
        } finally {
            setIsExpanding(false);
        }
    };

    const handleAddReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setTaggedReferences(prev => [...prev, {
                id: `ref-${Date.now()}`,
                url: base64,
                category: 'style'
            }]);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveReference = (id: string) => {
        setTaggedReferences(prev => prev.filter(r => r.id !== id));
    };

    const handleUpdateReferenceCategory = (id: string, cat: TaggedReference['category']) => {
        setTaggedReferences(prev => prev.map(r => r.id === id ? { ...r, category: cat } : r));
    };

    const handleChatSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!chatInput.trim() || !apiKey || isChatProcessing || !selectedUrl) return;

        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsChatProcessing(true);

        try {
            const result = await editImageWithChat(selectedUrl, userMsg, apiKey);
            if (result.image) {
                const resolved = await resolveUrl(result.image) || result.image;
                setHistory(prev => [resolved, ...prev]);
                setSelectedUrl(resolved);
            }
            setChatMessages(prev => [...prev, { role: 'assistant', text: result.explanation }]);
        } catch (error: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', text: `오류: ${error.message}` }]);
        } finally {
            setIsChatProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-4">
            <div className="w-[98vw] h-[96vh] bg-[#111] border border-white/10 rounded-[40px] overflow-hidden flex flex-col shadow-[0_0_150px_rgba(0,0,0,0.7)]">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-[var(--color-primary)] text-black rounded-2xl">
                            <ImageIcon size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{type === 'banner' ? 'Channel Banner' : 'Profile Icon'} Studio</h2>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{channelName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                        <X size={28} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Configuration */}
                    <div className="w-[600px] border-r border-white/5 flex flex-col bg-black/20">
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                            {/* References Section */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Image size={16} /> Reference Assets
                                    </h3>
                                    <label className="cursor-pointer px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-black text-gray-400 transition-all flex items-center gap-2">
                                        <Plus size={12} /> 추가
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAddReference} />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {taggedReferences.map(ref => (
                                        <div key={ref.id} className="relative group/ref bg-white/5 border border-white/10 rounded-xl overflow-hidden p-2">
                                            <div className="aspect-square rounded-lg overflow-hidden mb-2 relative">
                                                <img src={ref.url} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => handleRemoveReference(ref.id)}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover/ref:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <select
                                                    value={ref.category}
                                                    onChange={e => handleUpdateReferenceCategory(ref.id, e.target.value as any)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-md py-1 px-2 text-[10px] text-gray-300 outline-none appearance-none cursor-pointer hover:bg-black/60"
                                                >
                                                    {referenceCategories.map(c => (
                                                        <option key={c.value} value={c.value}>{c.label}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                                    <Tag size={10} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {taggedReferences.length === 0 && (
                                        <div className="col-span-2 py-8 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-600">
                                            <ImageIcon size={24} className="mb-2 opacity-20" />
                                            <p className="text-[10px] font-bold">참조 이미지가 없습니다.</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Image Prompt</h3>
                                    <button
                                        onClick={handleAIExpand}
                                        disabled={isExpanding}
                                        className="text-[10px] font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1.5 rounded-full hover:bg-[var(--color-primary)]/20 transition-all flex items-center gap-2"
                                    >
                                        {isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        전략 + 레퍼런스 분석 확장
                                    </button>
                                </div>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="Enter image description in English..."
                                    className="w-full h-48 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm text-gray-200 focus:border-[var(--color-primary)] outline-none transition-all leading-relaxed custom-scrollbar"
                                />
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !prompt}
                                    className="w-full py-5 bg-[var(--color-primary)] text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[var(--color-primary)]/20 disabled:opacity-30"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                                    이미지 생성 (Imagine)
                                </button>
                            </section>

                            {selectedUrl && (
                                <section className="space-y-4 pt-4 border-t border-white/5">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Send size={16} /> AI 편집 피드백
                                    </h3>
                                    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 min-h-[150px] flex flex-col justify-between">
                                        <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-40 no-scrollbar">
                                            {chatMessages.length === 0 ? (
                                                <p className="text-xs text-gray-600 italic">생성된 이미지에 대해 구체적인 수정 사항을 채팅으로 입력해보세요. (예: "배경을 더 어둡게", "로고 크기 키워줘")</p>
                                            ) : (
                                                chatMessages.map((m, i) => (
                                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[85%] p-3 rounded-xl text-xs ${m.role === 'user' ? 'bg-[var(--color-primary)] text-black' : 'bg-white/10 text-gray-300'}`}>
                                                            {m.text}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <form onSubmit={handleChatSubmit} className="relative">
                                            <input
                                                value={chatInput}
                                                onChange={e => setChatInput(e.target.value)}
                                                placeholder="수정 요청사항 입력..."
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:border-[var(--color-primary)] outline-none"
                                            />
                                            <button type="submit" disabled={isChatProcessing} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[var(--color-primary)] text-black rounded-lg">
                                                {isChatProcessing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                            </button>
                                        </form>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>

                    {/* Right: Preview & History */}
                    <div className="flex-1 flex flex-col p-8 bg-black/40">
                        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                            {selectedUrl ? (
                                <div className={`relative group ${type === 'banner' ? 'w-full aspect-[16/9]' : 'w-80 h-80 rounded-full border-4 border-[var(--color-primary)]'} shadow-2xl overflow-hidden`}>
                                    <img src={selectedUrl} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                        <button
                                            onClick={() => setShowLargeView(true)}
                                            className="px-6 py-3 bg-[var(--color-primary)] text-black text-xs font-black rounded-full flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform"
                                        >
                                            <Maximize2 size={16} /> 크게 보기
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full aspect-video bg-white/5 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center space-y-4 text-gray-600">
                                    <ImageIcon size={64} className="opacity-20" />
                                    <p className="font-bold">프롬프트를 입력하고 이미지를 생성하세요.</p>
                                </div>
                            )}

                            {history.length > 0 && (
                                <div className="w-full space-y-4">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest text-center">Generation History</h3>
                                    <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar justify-center">
                                        {history.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setSelectedUrl(url)}
                                                className={`w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${selectedUrl === url ? 'border-[var(--color-primary)] scale-110' : 'border-white/5 hover:border-white/20'}`}
                                            >
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex justify-end gap-4">
                            <button onClick={onClose} className="px-8 py-3 bg-white/5 text-gray-400 font-bold rounded-2xl hover:text-white transition-all">
                                취소
                            </button>
                            <button
                                onClick={() => selectedUrl && onSave(selectedUrl, prompt)}
                                disabled={!selectedUrl}
                                className="px-10 py-3 bg-[var(--color-primary)] text-black font-black rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-xl shadow-[var(--color-primary)]/20"
                            >
                                <Check size={20} />
                                현재 안으로 확정
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Large View Modal */}
            {showLargeView && selectedUrl && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                    <button
                        onClick={() => setShowLargeView(false)}
                        className="absolute top-8 right-8 p-4 text-white hover:bg-white/10 rounded-full transition-all"
                    >
                        <X size={32} />
                    </button>
                    <div className={`max-w-[90vw] max-h-[85vh] shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 ${type === 'banner' ? 'aspect-[16/9] w-full max-w-6xl' : 'aspect-square h-full rounded-full overflow-hidden border-4 border-[var(--color-primary)]'}`}>
                        <img src={selectedUrl} className="w-full h-full object-contain" />
                    </div>
                </div>
            )}
        </div>
    );
};
