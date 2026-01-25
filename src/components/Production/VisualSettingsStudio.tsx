import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
    X, Wand2, Loader2, ImageIcon, Plus, Send,
    Sparkles, RotateCcw, Film, Image, Trash2, Check
} from 'lucide-react';
import { ImageCropModal } from '../ImageCropModal';
import { InteractiveImageViewer } from '../InteractiveImageViewer';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import { generateText } from '../../services/gemini';
import type { ScriptCut } from '../../services/gemini';
import type { AspectRatio } from '../../store/types';

// ============================================================================
// TYPES
// ============================================================================

export interface TaggedReference {
    id: string;
    url: string;
    categories: string[];
    name?: string;
    isAuto?: boolean;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    image?: string;
    timestamp: number;
}

export interface VisualSettingsStudioProps {
    isOpen: boolean;
    onClose: () => void;
    cutId: number;
    cutIndex: number;
    initialVisualPrompt: string;
    initialVisualPromptKR?: string;
    initialFinalImageUrl?: string;
    initialVideoPrompt?: string;
    aspectRatio: AspectRatio;
    apiKey: string;
    assetDefinitions: any;
    existingCuts?: ScriptCut[];
    autoMatchedAssets?: any[];
    manualAssetObjs?: any[];
    initialSpeaker?: string;
    initialDialogue?: string;
    onSave: (result: VisualSettingsResult) => void;
}

export interface VisualSettingsResult {
    visualPrompt: string;
    visualPromptKR?: string;
    videoPrompt?: string;
    finalImageUrl: string | null;
    draftHistory: string[];
    taggedReferences: TaggedReference[];
}

const DEFAULT_CATEGORIES = [
    { value: 'face', label: '얼굴' },
    { value: 'style', label: '화풍/스타일' },
    { value: 'costume', label: '의상' },
    { value: 'hair', label: '헤어' },
    { value: 'color', label: '색감' },
    { value: 'composition', label: '구도' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const VisualSettingsStudio: React.FC<VisualSettingsStudioProps> = ({
    isOpen,
    onClose,
    cutId,
    cutIndex,
    initialVisualPrompt,
    initialVisualPromptKR,
    initialFinalImageUrl,
    initialVideoPrompt,
    aspectRatio,
    apiKey,
    assetDefinitions,
    existingCuts = [],
    autoMatchedAssets = [],
    manualAssetObjs = [],
    initialSpeaker = 'Narrator',
    initialDialogue = '',
    onSave,
}) => {
    // ========================================================================
    // STATE
    // ========================================================================

    const [visualPrompt, setVisualPrompt] = useState(initialVisualPrompt);
    const [visualPromptKR, setVisualPromptKR] = useState(initialVisualPromptKR || '');
    const [videoPrompt, setVideoPrompt] = useState(initialVideoPrompt || '');

    const [draftHistory, setDraftHistory] = useState<string[]>([]);
    const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
    const [taggedReferences, setTaggedReferences] = useState<TaggedReference[]>([]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [draftCount, setDraftCount] = useState(2);
    const [aiModel, setAiModel] = useState<'PRO' | 'STD'>('STD');

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatIntent, setChatIntent] = useState<'prompt' | 'image'>('image');
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [currentMask, setCurrentMask] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const draftFileInputRef = useRef<HTMLInputElement>(null);
    const wasOpenRef = useRef(false);
    const [resolvedCandidates, setResolvedCandidates] = useState<Array<{ id: number, url: string, index: number }>>([]);

    // ========================================================================
    // MEMOS
    // ========================================================================

    const dynamicCategories = useMemo(() => {
        if (!assetDefinitions) return [];
        return Object.values(assetDefinitions)
            .filter((a: any) => a.type === 'character' || a.type === 'location')
            .map((a: any) => ({
                value: `${a.type}-${a.name}`,
                label: `${a.type === 'character' ? '인물' : '장소'}: ${a.name}`
            }));
    }, [assetDefinitions]);

    const referenceCategories = useMemo(() => [...DEFAULT_CATEGORIES, ...dynamicCategories], [dynamicCategories]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const performTranslation = async () => {
        if (!visualPrompt || visualPrompt.trim().length < 2) return;
        setIsTranslating(true);
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Translate this English text to Korean. Only output the Korean translation:\n\n${visualPrompt}` }] }]
                    })
                }
            );
            const data = await response.json();
            const translation = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (translation) setVisualPromptKR(translation.trim());
        } catch (error) {
            console.error('Translation failed:', error);
        } finally {
            setIsTranslating(false);
        }
    };

    const handleResetToOriginal = useCallback(() => {
        if (confirm('최초의 기본 프롬프트로 복원하시겠습니까?')) {
            setVisualPrompt(initialVisualPrompt);
            setVisualPromptKR('');
        }
    }, [initialVisualPrompt]);

    const analyzeReferences = async () => {
        if (taggedReferences.length === 0) return '';
        const results = await Promise.all(taggedReferences.map(async (ref, idx) => {
            const refIndex = idx + 1;
            const instructions: string[] = [];

            ref.categories.forEach(cat => {
                if (cat.startsWith('character-')) instructions.push(`facial features and identity of character "${cat.replace('character-', '')}"`);
                else if (cat.startsWith('location-')) instructions.push(`environmental details and architecture of location "${cat.replace('location-', '')}"`);
                else if (cat === 'style') instructions.push("artistic rendering style and medium");
                else if (cat === 'costume') instructions.push("clothing and accessories design");
                else if (cat === 'color') instructions.push("lighting and color grading");
                else if (cat === 'composition') instructions.push("camera angle and framing");
            });

            const mappingHeader = `[Reference #${refIndex}]${ref.name ? ` (${ref.name})` : ''}`;
            const analysisPrompt = `Analyze this image for: ${instructions.join(', ') || 'visual characteristics'}. Output ONLY short descriptive English phrases.`;

            try {
                let imgData: any = null;
                if (ref.url.startsWith('data:')) {
                    const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                    if (matches) imgData = [{ mimeType: matches[1], data: matches[2] }];
                }
                const text = await generateText(analysisPrompt, apiKey, undefined, imgData);
                return `${mappingHeader}\nTags: ${ref.categories.join(', ')}\nAnalysis: ${text}`;
            } catch { return null; }
        }));
        return results.filter(Boolean).join('\n\n');
    };

    const handleAIExpand = async () => {
        setIsExpanding(true);
        try {
            const refContext = await analyzeReferences();
            const systemPrompt = "You are a visual director. Enhance the user's prompt by integrating visual analysis from references marked as 'Reference #X'. Stay concise and premium.";
            const fullPrompt = `User Prompt: ${visualPrompt}\nMotion/Video Direction: ${videoPrompt}\n\n${refContext ? `[Reference Analysis]\n${refContext}` : ''}\n\n[Instructions]\n1. Incorporate specific details from numbered references (e.g., "match the lighting from Reference #1").\n2. Maintain consistent identity for named characters.\n3. Expand into a detailed 8k English prompt.`;

            const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
            if (result) setVisualPrompt(result.trim());
        } catch (error) {
            console.error(error);
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
                categories: ['style'],
                isAuto: false
            }]);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleAddCandidate = async (url: string) => {
        let resolved = url;
        if (isIdbUrl(url)) resolved = await resolveUrl(url) || url;
        setTaggedReferences(prev => [...prev, { id: `cut-${Date.now()}`, url: resolved, categories: ['style'], isAuto: false }]);
    };

    const handleToggleRefCategory = (refId: string, cat: string) => {
        setTaggedReferences(prev => prev.map(r => r.id === refId ? { ...r, categories: r.categories.includes(cat) ? r.categories.filter(c => c !== cat) : [...r.categories, cat] } : r));
    };

    const handleRemoveRef = (id: string) => {
        setTaggedReferences(prev => prev.filter(ref => ref.id !== id));
    };

    const handleGenerate = async () => {
        if (!visualPrompt) return;
        setIsGenerating(true);
        try {
            const { generateImage } = await import('../../services/imageGen');
            const { cleanPromptForGeneration } = await import('../../utils/promptUtils');
            const refAnalysis = await analyzeReferences();
            const finalPrompt = refAnalysis ? `${refAnalysis}\n\n${visualPrompt}` : visualPrompt;
            const cleaned = cleanPromptForGeneration(finalPrompt);
            const refImages = await Promise.all(taggedReferences.map(r => isIdbUrl(r.url) ? resolveUrl(r.url) : r.url));
            const model = aiModel === 'PRO' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
            const result = await generateImage(cleaned, apiKey, refImages.filter(Boolean) as string[], aspectRatio, model, draftCount);
            const resolved = await Promise.all(result.urls.map(u => resolveUrl(u)));
            const newDrafts = resolved.map((u, i) => u || result.urls[i]);
            setDraftHistory(prev => [...prev, ...newDrafts]);
            if (newDrafts.length > 0) setSelectedDraft(newDrafts[0]);
        } catch (e: any) { alert(e.message); } finally { setIsGenerating(false); }
    };

    const handleChatSend = async () => {
        if (!chatInput.trim()) return;
        const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: chatInput, timestamp: Date.now() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setIsChatLoading(true);
        try {
            if (chatIntent === 'image' && selectedDraft) {
                const { editImageWithChat } = await import('../../services/imageGen');
                const result = await editImageWithChat(selectedDraft, chatInput, apiKey, currentMask);
                if (result.image) {
                    setDraftHistory(prev => [...prev, result.image!]);
                    setSelectedDraft(result.image);
                }
                setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: result.explanation || 'Modified.', image: result.image, timestamp: Date.now() }]);
            } else {
                const res = await generateText(`Current: ${visualPrompt}\nEdit: ${chatInput}\nOutput only SUGGESTED_PROMPT: [prompt]`, apiKey);
                const match = res?.match(/SUGGESTED_PROMPT:\s*(.+)/s);
                if (match) setVisualPrompt(match[1].trim());
            }
        } catch { /* error */ } finally { setIsChatLoading(false); }
    };

    const handleCropSelected = () => { if (selectedDraft) { setImageToCrop(selectedDraft); setShowCropModal(true); } };
    const handleCropConfirm = (img: string) => { setDraftHistory(prev => [...prev, img]); setSelectedDraft(img); setShowCropModal(false); };
    const handleClearHistory = () => { if (confirm('Clear all drafts?')) { setDraftHistory([]); setSelectedDraft(null); } };
    const handleSave = () => { onSave({ visualPrompt, visualPromptKR, videoPrompt, finalImageUrl: selectedDraft, draftHistory, taggedReferences }); onClose(); };

    const handleAddDraftAsReference = (url: string) => {
        setTaggedReferences(prev => [...prev, {
            id: `draft-${Date.now()}-${Math.random()}`,
            url,
            categories: ['style'],
            isAuto: false,
            name: 'Generated Draft'
        }]);
    };

    const handleAddDraftManually = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setDraftHistory(prev => [...prev, base64]);
            setSelectedDraft(base64);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // ========================================================================
    // EFFECTS
    // ========================================================================

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setVisualPrompt(initialVisualPrompt);
            setVisualPromptKR(initialVisualPromptKR || '');
            setVideoPrompt(initialVideoPrompt || '');

            const init = async () => {
                if (initialFinalImageUrl) {
                    let resolvedUrl = initialFinalImageUrl;
                    if (isIdbUrl(initialFinalImageUrl)) {
                        resolvedUrl = await resolveUrl(initialFinalImageUrl) || initialFinalImageUrl;
                    }
                    setDraftHistory([resolvedUrl]);
                    setSelectedDraft(resolvedUrl);
                }

                const loadedRefs: TaggedReference[] = [];
                const getAssetImageUrl = (asset: any) => asset?.referenceImage || asset?.draftImage || asset?.masterImage || asset?.imageUrl || asset?.image || asset?.url || null;

                const processAsset = async (asset: any, isAuto: boolean) => {
                    if (!asset) return;
                    const imgUrl = getAssetImageUrl(asset);
                    if (imgUrl) {
                        let url = imgUrl;
                        if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                        if (url && !loadedRefs.some(r => r.name === asset.name)) {
                            loadedRefs.push({
                                id: `${isAuto ? 'auto' : 'manual'}-${asset.id || Date.now()}-${Math.random()}`,
                                url,
                                categories: [asset.type === 'character' ? `character-${asset.name}` : 'style'],
                                name: asset.name,
                                isAuto
                            });
                        }
                    }
                };

                for (const asset of manualAssetObjs) await processAsset(asset, false);
                for (const asset of autoMatchedAssets) await processAsset(asset, true);
                setTaggedReferences(loadedRefs);
            };

            init().catch(() => { });
            wasOpenRef.current = true;
        } else if (!isOpen) {
            wasOpenRef.current = false;
        }
    }, [isOpen, initialVisualPrompt, initialVisualPromptKR, initialFinalImageUrl, initialVideoPrompt, assetDefinitions, autoMatchedAssets, manualAssetObjs]);

    useEffect(() => {
        setCurrentMask(null);
    }, [selectedDraft]);

    useEffect(() => {
        if (!visualPrompt || visualPrompt.trim().length < 5 || !apiKey) return;
        const timer = setTimeout(() => performTranslation(), 1000);
        return () => clearTimeout(timer);
    }, [visualPrompt, apiKey]);

    // Resolve candidates URLs
    useEffect(() => {
        const resolveCandidates = async () => {
            const candidates = existingCuts
                .filter(c => c.id !== cutId && c.finalImageUrl)
                .map(c => ({ id: c.id, url: c.finalImageUrl!, index: existingCuts.indexOf(c) + 1 }));

            const resolved = await Promise.all(candidates.map(async c => {
                let url = c.url;
                if (isIdbUrl(url)) {
                    url = await resolveUrl(url) || url;
                }
                return { ...c, url };
            }));
            setResolvedCandidates(resolved);
        };
        resolveCandidates();
    }, [existingCuts, cutId]);

    // ========================================================================
    // RENDER
    // ========================================================================

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/98 flex flex-col font-sans">
            {/* HEADER */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--color-primary)] text-black rounded-2xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"><Wand2 size={24} /></div>
                    <div>
                        <h2 className="text-xl font-black text-white">Visual Settings Studio</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold text-[var(--color-primary)]">CUT #{cutIndex + 1}</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{aspectRatio} Ratio</span>
                        </div>
                    </div>
                </div>

                {/* NEW: SPEAKER & DIALOGUE CENTER SECTION */}
                <div className="flex-1 flex flex-col items-center justify-center max-w-2xl px-4 overflow-hidden border-x border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest bg-[var(--color-primary)]/10 px-2 py-0.5 rounded">SPEAKER</span>
                        <span className="text-sm font-bold text-white truncate">{initialSpeaker}</span>
                    </div>
                    <div className="w-full text-center">
                        <p className="text-xs text-gray-400 italic line-clamp-2 leading-relaxed">&quot;{initialDialogue}&quot;</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleSave} className="px-6 py-2.5 bg-[var(--color-primary)] text-black font-black rounded-xl text-sm hover:scale-105 transition-all flex items-center gap-2 shadow-xl">
                        <Check size={18} /> SAVE & CLOSE
                    </button>
                    <button onClick={onClose} className="p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"><X size={24} /></button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT PANEL: References & Tooling */}
                <div className="w-[420px] border-r border-white/5 flex flex-col bg-black/20 shrink-0">
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                        {/* Reference Assets */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Image size={14} /> Reference Assets
                                </h3>
                                <button onClick={() => fileInputRef.current?.click()} className="p-1 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-gray-400 transition-all flex items-center gap-2">
                                    <Plus size={12} /> ADD
                                    <input ref={fileInputRef} type="file" onChange={(e) => { handleAddReference(e); (e.target as any).value = null; }} className="hidden" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {taggedReferences.map((ref, idx) => (
                                    <div key={ref.id} className="relative group/ref bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden p-3 transition-all hover:border-white/20">
                                        <div className="flex gap-4">
                                            <div className="w-24 h-24 shrink-0 relative rounded-xl overflow-hidden border border-white/10">
                                                <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 bg-black/80 backdrop-blur-md rounded text-[9px] font-black text-[var(--color-primary)]">#{idx + 1}</div>
                                                <img src={ref.url} className="w-full h-full object-cover" />
                                                <button onClick={() => handleRemoveRef(ref.id)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover/ref:opacity-100 transition-all"><Trash2 size={12} /></button>
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <div className="text-[10px] font-black text-gray-500 border-b border-white/5 pb-1 uppercase tracking-tighter truncate">{ref.name || 'External Asset'}</div>
                                                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                                                    {referenceCategories.map(cat => (
                                                        <button key={cat.value} onClick={() => handleToggleRefCategory(ref.id, cat.value)}
                                                            className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${ref.categories.includes(cat.value) ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] shadow-lg' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                                                            {cat.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {taggedReferences.length === 0 && <div className="py-10 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-600"><ImageIcon size={32} className="mb-2 opacity-10" /><p className="text-[10px] font-bold">참조 이미지가 없습니다.</p></div>}
                            </div>
                        </section>

                        {/* Candidate Assets */}
                        {resolvedCandidates.length > 0 && (
                            <section className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">Candidates from other cuts</h3>
                                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                    {resolvedCandidates.map((c: any) => (
                                        <button key={c.id} onClick={() => handleAddCandidate(c.url)} className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all relative group">
                                            <img src={c.url} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center"><Plus size={16} className="text-white" /></div>
                                            <div className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-[8px] font-bold text-white text-center">CUT {c.index}</div>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Prompt & Translation */}
                        <section className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><Sparkles size={16} className="text-[var(--color-primary)]" /> Image Prompt</h3>
                                <div className="flex gap-2">
                                    <button onClick={handleAIExpand} disabled={isExpanding} className="text-[10px] font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1.5 rounded-xl hover:bg-[var(--color-primary)]/20 transition-all flex items-center gap-2 shadow-lg">
                                        {isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI 레퍼런스 확장
                                    </button>
                                    <button onClick={handleResetToOriginal} className="text-[10px] font-bold text-gray-400 hover:text-white transition-all"><RotateCcw size={14} /></button>
                                </div>
                            </div>
                            <textarea value={visualPrompt} onChange={e => setVisualPrompt(e.target.value)} placeholder="Visual prompt..." className="w-full h-40 bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-sm text-gray-200 outline-none focus:border-[var(--color-primary)] transition-all leading-relaxed custom-scrollbar" />
                            <div className="bg-black/40 border border-white/5 rounded-xl p-4 relative">
                                <span className="absolute top-2 right-3 text-[9px] font-black text-gray-600 tracking-tighter">KOREAN TRANSLATION</span>
                                <p className="text-[11px] text-gray-400 italic leading-relaxed pt-2">{visualPromptKR || (isTranslating ? '번역 중...' : '자동 번역 대기...')}</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Film size={14} /> Motion Direction</label>
                                <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} placeholder="Camera panning, movement..." className="w-full h-20 bg-purple-500/5 border border-purple-500/10 rounded-xl p-3 text-[11px] text-gray-400 outline-none focus:border-purple-500/30 transition-all resize-none" />
                            </div>
                        </section>
                    </div>

                    {/* Left Bottom: Generator */}
                    <div className="p-6 border-t border-white/5 bg-white/[0.01]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
                                {['PRO', 'STD'].map(m => (
                                    <button key={m} onClick={() => setAiModel(m as any)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${aiModel === m ? 'bg-white/20 text-white shadow-lg scale-105' : 'text-gray-500 hover:text-gray-300'}`}>{m}</button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
                                {[1, 2, 3, 4].map(n => (
                                    <button key={n} onClick={() => setDraftCount(n)} className={`w-8 h-7 rounded-lg text-[10px] font-black flex items-center justify-center transition-all ${draftCount === n ? 'bg-white/20 text-white shadow-lg scale-105' : 'text-gray-500 hover:text-gray-300'}`}>{n}</button>
                                ))}
                            </div>
                        </div>
                        <button onClick={handleGenerate} disabled={isGenerating || !visualPrompt} className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all ${isGenerating ? 'bg-white/5 text-gray-500' : 'bg-gradient-to-r from-[var(--color-primary)] to-[#ff8c00] text-black shadow-2xl hover:brightness-110 active:scale-[0.98]'}`}>
                            {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                            {isGenerating ? 'GENERATING DRAFTS...' : 'GENERATE IMAGES'}
                        </button>
                    </div>
                </div>

                {/* CENTER AREA: Fullscreen Image Display & Draft Side-rail */}
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Draft Thumbnails Sidebar (Left of Preview) */}
                    <div className="w-40 border-r border-white/5 bg-black/40 flex flex-col p-3 shrink-0 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Drafts ({draftHistory.length})</span>
                            {draftHistory.length > 0 && (
                                <button onClick={handleClearHistory} className="text-[9px] font-bold text-red-500/70 hover:text-red-500 uppercase leading-none">Clear</button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pb-2">
                            <button onClick={() => draftFileInputRef.current?.click()} className="aspect-square rounded-lg border border-dashed border-white/20 hover:border-white/40 flex items-center justify-center text-gray-500 hover:text-white transition-all relative group/add">
                                <Plus size={18} />
                                <input ref={draftFileInputRef} type="file" onChange={handleAddDraftManually} className="hidden" />
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/add:opacity-100 rounded-lg transition-opacity" />
                            </button>

                            {draftHistory.map((url, i) => (
                                <div key={i} className="relative group/draft">
                                    <button onClick={() => setSelectedDraft(url)} className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedDraft === url ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-lg scale-[1.05]' : 'border-white/5 hover:border-white/20'}`}>
                                        <img src={url} className="w-full h-full object-cover" />
                                    </button>
                                    <button onClick={() => handleAddDraftAsReference(url)} className="absolute -top-1 -right-1 p-1 bg-[var(--color-primary)] text-black rounded-full opacity-0 group-hover/draft:opacity-100 hover:scale-110 transition-all shadow-xl z-20">
                                        <Plus size={10} strokeWidth={4} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col relative bg-black overflow-hidden">
                        <div className="flex-1 relative">
                            {selectedDraft ? (
                                <InteractiveImageViewer src={selectedDraft} onMaskChange={setCurrentMask} onCrop={handleCropSelected} onClose={() => setSelectedDraft(null)} className="w-full h-full" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center opacity-20"><ImageIcon size={120} /></div>
                            )}
                        </div>

                        {/* AI Editor Panel (Bottom Center) - Floating or Docked */}
                        <div className="h-44 border-t border-white/5 bg-[#0a0a0a] flex flex-col mx-auto w-full max-w-4xl rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-20">
                            <div className="flex items-center justify-between px-6 py-2 border-b border-white/5 bg-white/[0.02] rounded-t-3xl">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-[var(--color-primary)]" />
                                    <span className="text-sm font-black text-white tracking-widest uppercase">AI 편집장</span>
                                </div>
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
                                    <button onClick={() => setChatIntent('image')} className={`px-4 py-1 rounded-lg text-[9px] font-black transition-all flex items-center gap-1.5 ${chatIntent === 'image' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500'}`}><Image size={10} /> 이미지 부분 수정</button>
                                    <button onClick={() => setChatIntent('prompt')} className={`px-4 py-1 rounded-lg text-[9px] font-black transition-all flex items-center gap-1.5 ${chatIntent === 'prompt' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500'}`}><Plus size={10} /> 프롬프트 정제</button>
                                </div>
                            </div>
                            <div ref={chatContainerRef} className="flex-1 px-6 py-3 overflow-y-auto space-y-3 custom-scrollbar text-center">
                                {chatMessages.length === 0 ? (
                                    <div className="text-gray-700 text-[10px] font-bold uppercase tracking-widest py-8">결과물에 대한 지시사항을 입력하세요</div>
                                ) : (
                                    chatMessages.map(msg => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-[11px] leading-relaxed ${msg.role === 'user' ? 'bg-[var(--color-primary)] text-black font-bold' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                                                {msg.content}
                                                {msg.image && <img src={msg.image} className="mt-2 rounded-lg max-w-full border border-white/10" />}
                                            </div>
                                        </div>
                                    ))
                                )}
                                {isChatLoading && <div className="flex justify-start"><div className="bg-white/5 px-4 py-2 rounded-2xl animate-pulse"><Loader2 size={12} className="animate-spin text-gray-400" /></div></div>}
                            </div>
                            <div className="px-6 py-4 flex items-center gap-3">
                                <input onKeyDown={e => e.key === 'Enter' && handleChatSend()} value={chatInput} onChange={e => setChatInput(e.target.value)} type="text" placeholder={chatIntent === 'image' ? "마스킹 영역이나 이미지 전체에 대한 수정 지시..." : "현재 프롬프트 개선을 위한 요청 입력..."} className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-xs text-white outline-none focus:border-[var(--color-primary)] transition-all" />
                                <button onClick={handleChatSend} disabled={isChatLoading || !chatInput.trim()} className="p-3 bg-[var(--color-primary)] text-black rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-30"><Send size={20} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showCropModal && imageToCrop && <ImageCropModal imageSrc={imageToCrop} aspectRatio={aspectRatio} onConfirm={handleCropConfirm} onCancel={() => setShowCropModal(false)} />}
        </div>,
        document.body
    );
};
