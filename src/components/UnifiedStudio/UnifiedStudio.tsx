// UnifiedStudio - Consolidated Studio Component
// Replaces: ChannelArtModal, AssetGenerationModal, VisualSettingsStudio

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
    X, Wand2, Loader2, ImageIcon, Plus, Send,
    Sparkles, RotateCcw, Film, Image, Trash2, Check, Layers, Bot
} from 'lucide-react';
import { ImageCropModal } from '../ImageCropModal';
import { InteractiveImageViewer } from '../InteractiveImageViewer';
import { ReferenceSelectorModal } from '../ReferenceSelectorModal';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import { useStudioHandlers } from './useStudioHandlers';
import type { UnifiedStudioProps, TaggedReference, ChatMessage } from './types';
import { DEFAULT_CATEGORIES, ASSET_CATEGORIES } from './types';

// Lazy import for visual mode only
const CompositionEditorLazy = React.lazy(() =>
    import('../Production/CompositionEditor').then(m => ({ default: m.CompositionEditor }))
);

export const UnifiedStudio = ({
    isOpen,
    onClose,
    apiKey,
    masterStyle = '',
    config,
}: UnifiedStudioProps) => {
    // ========================================================================
    // STATE
    // ========================================================================

    const mode = config.mode;

    // Determine initial values based on mode
    const initialPrompt = mode === 'channelArt' ? config.initialPrompt
        : mode === 'asset' ? config.initialDescription
            : mode === 'thumbnail' ? config.initialPrompt
                : (config as any).initialVisualPrompt;

    const [prompt, setPrompt] = useState(initialPrompt);
    const [promptKR, setPromptKR] = useState(mode === 'visual' ? (config.initialVisualPromptKR || '') : '');
    const [videoPrompt, setVideoPrompt] = useState(mode === 'visual' ? (config.initialVideoPrompt || '') : '');

    const [draftHistory, setDraftHistory] = useState<string[]>([]);
    const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
    const [taggedReferences, setTaggedReferences] = useState<TaggedReference[]>([]);

    const [draftCount, setDraftCount] = useState(2);
    const [aiModel, setAiModel] = useState<'PRO' | 'STD'>(mode === 'asset' ? 'PRO' : 'STD');

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatIntent, setChatIntent] = useState<'image' | 'prompt'>('image');

    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [cropTarget, setCropTarget] = useState<{ url: string; name?: string; type?: string; id?: string } | null>(null);
    const [currentMask, setCurrentMask] = useState<string | null>(null);

    const draftFileInputRef = useRef<HTMLInputElement>(null);
    const wasOpenRef = useRef(false);
    const blobUrlsRef = useRef<Set<string>>(new Set());

    // Visual mode specific
    const [activeTab, setActiveTab] = useState<'visual' | 'composition'>('visual');
    const [showRefSelector, setShowRefSelector] = useState(false);
    const [resolvedCandidates, setResolvedCandidates] = useState<Array<{ id: number; url: string; index: number }>>([]);
    const [resolvedProjectAssets, setResolvedProjectAssets] = useState<Array<{ id: string; name: string; url: string; type: string }>>([]);

    // Asset mode specific
    const [, _setShowRefPicker] = useState(false);


    const [selectorTarget, setSelectorTarget] = useState<'reference' | 'draft'>('reference');
    const [modalDefaultTab, setModalDefaultTab] = useState<'assets' | 'cuts' | 'drafts' | 'computer'>('assets');

    // ========================================================================
    // HANDLERS HOOK
    // ========================================================================

    const handlers = useStudioHandlers({
        config, apiKey, masterStyle,
        prompt, setPrompt, promptKR, setPromptKR,
        videoPrompt, setVideoPrompt,
        taggedReferences, setTaggedReferences,
        draftHistory, setDraftHistory,
        selectedDraft, setSelectedDraft,
        chatMessages, setChatMessages,
        chatInput, setChatInput,
        chatIntent, draftCount, aiModel, currentMask,
    });

    // ========================================================================
    // MEMOS
    // ========================================================================

    const dynamicCategories = useMemo(() => {
        if (mode !== 'visual' || !config.assetDefinitions) return [];
        return Object.values(config.assetDefinitions)
            .filter((a: any) => a.type === 'character' || a.type === 'location' || a.type === 'prop')
            .map((a: any) => {
                let typeLabel = '기타';
                if (a.type === 'character') typeLabel = '인물';
                else if (a.type === 'location') typeLabel = '장소';
                else if (a.type === 'prop') typeLabel = '소품';
                return { value: `${a.type}-${a.name}`, label: `${typeLabel}: ${a.name}` };
            });
    }, [mode, mode === 'visual' ? config.assetDefinitions : null]);

    const referenceCategories = useMemo(() => {
        if (mode === 'asset') return ASSET_CATEGORIES;
        if (mode === 'channelArt') {
            const chars = config.characters || [];
            return [...DEFAULT_CATEGORIES, ...chars.map(c => ({ value: `character-${c.name}`, label: `캐릭터: ${c.name}` }))];
        }
        if (mode === 'thumbnail') {
            const chars = config.characters || [];
            return [...DEFAULT_CATEGORIES, ...chars.map(c => ({ value: `character-${c.name}`, label: `캐릭터: ${c.name}` }))];
        }
        return [...DEFAULT_CATEGORIES, ...dynamicCategories];
    }, [mode, dynamicCategories, (mode === 'channelArt' || mode === 'thumbnail') ? config.characters : null]);

    // ========================================================================
    // REFERENCE HANDLERS
    // ========================================================================

    const handleToggleRefCategory = (refId: string, cat: string) => {
        setTaggedReferences(prev => prev.map(r =>
            r.id === refId ? { ...r, categories: r.categories.includes(cat) ? r.categories.filter(c => c !== cat) : [...r.categories, cat] } : r
        ));
    };

    const handleRemoveRef = (id: string) => {
        setTaggedReferences(prev => prev.filter(ref => ref.id !== id));
    };

    const handleSelectReference = (asset: { url: string; name?: string; type?: string; id?: string }) => {
        setShowRefSelector(false);
        setCropTarget(asset);
    };

    const handleUploadCropConfirm = (croppedImg: string) => {
        if (selectorTarget === 'draft') {
            setDraftHistory(prev => [...prev, croppedImg]);
            setSelectedDraft(croppedImg);
            setCropTarget(null);
            return;
        }

        const newRef: TaggedReference = {
            id: cropTarget?.id || `ref-${Date.now()}`,
            url: croppedImg,
            name: cropTarget?.name || 'External Asset',
            categories: cropTarget?.type ? [cropTarget.type === 'character' ? 'face' : 'style'] : ['style'],
            isAuto: false
        };
        setTaggedReferences(prev => [...prev, newRef]);
        setCropTarget(null);
    };

    const handleCropSelected = () => { if (selectedDraft) { setImageToCrop(selectedDraft); setShowCropModal(true); } };
    const handleCropConfirm = (img: string) => { setDraftHistory(prev => [...prev, img]); setSelectedDraft(img); setShowCropModal(false); };
    const handleClearHistory = () => { if (confirm('Clear all drafts?')) { setDraftHistory([]); setSelectedDraft(null); } };

    const handleAddDraftAsReference = (url: string) => {
        setTaggedReferences(prev => [...prev, {
            id: `draft-${Date.now()}-${Math.random()}`,
            url, categories: ['style'], isAuto: false, name: 'Generated Draft'
        }]);
    };

    const handleAddDraftManually = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => { setDraftHistory(prev => [...prev, reader.result as string]); setSelectedDraft(reader.result as string); };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleResetToOriginal = useCallback(() => {
        if (confirm('최초의 기본 프롬프트로 복원하시겠습니까?')) {
            setPrompt(initialPrompt);
            setPromptKR('');
        }
    }, [initialPrompt]);

    const handleAddReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setCropTarget({ url: base64 });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const refFileInputRef = useRef<HTMLInputElement>(null);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Memory cleanup on close
    useEffect(() => {
        if (!isOpen && wasOpenRef.current) {
            blobUrlsRef.current.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
            blobUrlsRef.current.clear();
        }
    }, [isOpen]);

    // Clear mask when draft changes
    useEffect(() => { setCurrentMask(null); }, [selectedDraft]);

    // Auto-translate
    useEffect(() => {
        if (!prompt || prompt.trim().length < 5 || !apiKey || prompt === initialPrompt) return;
        const timer = setTimeout(() => handlers.performTranslation(), 3000);
        return () => clearTimeout(timer);
    }, [prompt, apiKey, initialPrompt]);

    // Initialization effect
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setPrompt(initialPrompt);
            setChatMessages([]);
            setChatInput('');

            const init = async () => {
                if (mode === 'visual') {
                    setPromptKR(config.initialVisualPromptKR || '');
                    setVideoPrompt(config.initialVideoPrompt || '');

                    if (config.initialFinalImageUrl) {
                        let url = config.initialFinalImageUrl;
                        if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                        setDraftHistory([url]);
                        setSelectedDraft(url);
                    }

                    // Load auto/manual asset references  
                    const loadedRefs: TaggedReference[] = [];
                    // [PRIORITY] referenceImage > masterImage > imageUrl > draftImage to avoid using stale drafts as reference
                    const getUrl = (a: any) => a?.referenceImage || a?.masterImage || a?.imageUrl || a?.image || a?.url || a?.draftImage || null;

                    const processAsset = async (asset: any, isAuto: boolean) => {
                        if (!asset) return;
                        const imgUrl = getUrl(asset);
                        if (imgUrl) {
                            let url = imgUrl;
                            if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                            const refId = asset.id || `${isAuto ? 'auto' : 'manual'}-${Date.now()}-${Math.random()}`;
                            if (url && !loadedRefs.some(r => r.id === refId)) {
                                console.log(`[UnifiedStudio] Processing ${isAuto ? 'AUTO' : 'MANUAL'} Asset: ${asset.name}`, { type: asset.type, urlSource: imgUrl.substring(0, 50) });
                                let category = 'style';
                                if (asset.type === 'character') category = `character-${asset.name}`;
                                else if (asset.type === 'location') category = `location-${asset.name}`;
                                else if (asset.type === 'prop') category = `prop-${asset.name}`;
                                loadedRefs.push({ id: refId, url, categories: [category], name: asset.name, isAuto });
                            }
                        }
                    };

                    console.log('[UnifiedStudio] Initializing References with config:', {
                        manualCount: (config.manualAssetObjs || []).length,
                        autoCount: (config.autoMatchedAssets || []).length
                    });

                    for (const a of (config.manualAssetObjs || [])) await processAsset(a, false);
                    for (const a of (config.autoMatchedAssets || [])) await processAsset(a, true);

                    const currentCut = (config.existingCuts || []).find(c => c.id === config.cutId);
                    if (currentCut?.referenceCutIds) {
                        for (const refId of currentCut.referenceCutIds) {
                            const refCut = (config.existingCuts || []).find(c => c.id === refId);
                            if (refCut?.finalImageUrl) {
                                let url = refCut.finalImageUrl;
                                if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                                if (url) loadedRefs.push({ id: `cut-${refId}`, url, name: `Cut #${refId}`, categories: ['style'], isAuto: false });
                            }
                        }
                    }
                    if (currentCut?.userReferenceImage) {
                        let url = currentCut.userReferenceImage;
                        if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                        if (url) loadedRefs.push({ id: 'user-ref', url, name: 'User Reference', categories: ['style'], isAuto: false });
                    }
                    setTaggedReferences(loadedRefs);

                } else if (mode === 'asset') {
                    if (config.initialReferenceImage) {
                        setTaggedReferences([{ id: `ref-${Date.now()}`, url: config.initialReferenceImage, categories: ['style'] }]);
                    }
                    if (config.initialDraftImage) {
                        setDraftHistory([config.initialDraftImage]);
                        setSelectedDraft(config.initialDraftImage);
                    }
                } else if (mode === 'channelArt') {
                    if (config.initialUrl) {
                        let url = config.initialUrl;
                        if (url.startsWith('idb://')) url = await resolveUrl(url) || url;
                        if (url) { setDraftHistory([url]); setSelectedDraft(url); }
                    }
                } else if (mode === 'thumbnail') {
                    if (config.initialUrl) {
                        let url = config.initialUrl;
                        if (url.startsWith('idb://')) url = await resolveUrl(url) || url;
                        if (url) { setDraftHistory([url]); setSelectedDraft(url); }
                    }
                }
            };

            init().catch(() => { });
            wasOpenRef.current = true;
        } else if (!isOpen) {
            wasOpenRef.current = false;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        // Resolve Candidates (Cuts) - mostly for visual mode, but safe to run
        const resolveCandidates = async () => {
            if (config.mode !== 'visual' || !config.existingCuts) return;
            const cuts = config.existingCuts || [];
            const candidates = cuts.filter(c => c.id !== config.cutId && c.finalImageUrl).map(c => ({ id: c.id, url: c.finalImageUrl!, index: cuts.indexOf(c) + 1 }));
            const resolved = await Promise.all(candidates.map(async c => {
                let url = c.url;
                if (isIdbUrl(url)) { url = await resolveUrl(url) || url; if (url.startsWith('blob:')) blobUrlsRef.current.add(url); }
                return { ...c, url };
            }));
            setResolvedCandidates(resolved);
        };

        // Resolve Project Assets - shared for both modes now
        const resolveAssets = async () => {
            let rawAssets: any[] = [];

            if (config.mode === 'visual' && config.assetDefinitions) {
                rawAssets = Object.values(config.assetDefinitions)
                    .filter((a: any) => ['character', 'location', 'prop'].includes(a.type) && (a.masterImage || a.draftImage || a.referenceImage))
                    .map((a: any) => ({ id: a.id, name: a.name, type: a.type, url: a.masterImage || a.draftImage || a.referenceImage }));
            } else if (config.mode === 'asset' && config.existingAssets) {
                // Use the assets passed specifically for asset mode context
                rawAssets = config.existingAssets.map(a => ({ id: a.id, name: a.name, type: a.type, url: a.url }));
            }

            const resolved = await Promise.all(rawAssets.map(async a => {
                let url = a.url;
                if (isIdbUrl(url)) { url = await resolveUrl(url) || url; if (url.startsWith('blob:')) blobUrlsRef.current.add(url); }
                return { ...a, url };
            }));
            setResolvedProjectAssets(resolved);
        };

        resolveCandidates();
        resolveAssets();
    }, [isOpen, mode, (config as any).existingCuts, (config as any).assetDefinitions, (config as any).existingAssets]);



    // ========================================================================
    // RENDER
    // ========================================================================

    if (!isOpen) return null;

    // Title
    const studioTitle = mode === 'channelArt' ? `${config.type === 'banner' ? 'Channel Banner' : 'Profile Icon'} Studio`
        : mode === 'asset' ? `${config.assetName} Studio`
            : mode === 'thumbnail' ? 'Thumbnail Synthesis Studio'
                : 'Visual Settings Studio';

    const subtitle = mode === 'channelArt' ? config.channelName
        : mode === 'asset' ? config.assetType
            : mode === 'thumbnail' ? 'YouTube Thumbnail'
                : `CUT #${config.cutIndex + 1}`;

    const aspectRatio = mode === 'channelArt' ? (config.type === 'banner' ? '16:9' : '1:1')
        : mode === 'asset' ? config.aspectRatio
            : mode === 'thumbnail' ? '16:9'
                : config.aspectRatio;

    const handleSaveAndClose = async () => {
        await handlers.handleSave();
        onClose();
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/98 flex flex-col font-sans">
            {/* HEADER */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--color-primary)] text-black rounded-2xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"><Wand2 size={24} /></div>
                    <div>
                        <h2 className="text-xl font-black text-white">{studioTitle}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold text-[var(--color-primary)]">{subtitle}</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{aspectRatio} Ratio</span>
                        </div>
                    </div>
                </div>

                {/* TAB SWITCHER (visual mode only) */}
                {mode === 'visual' && (
                    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/10">
                        <button onClick={() => setActiveTab('visual')} className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${activeTab === 'visual' ? 'bg-[var(--color-primary)] text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            <Sparkles size={14} /> 비주얼 설정
                        </button>
                        <button onClick={() => setActiveTab('composition')} className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${activeTab === 'composition' ? 'bg-orange-600 text-black shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            <Layers size={14} /> 구도 수정
                        </button>
                    </div>
                )}

                {/* SPEAKER & DIALOGUE (visual mode only) */}
                {mode === 'visual' && (
                    <div className="flex-1 flex flex-col items-center justify-center max-w-md px-4 overflow-hidden border-x border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest bg-[var(--color-primary)]/10 px-2 py-0.5 rounded">SPEAKER</span>
                            <span className="text-sm font-bold text-white truncate">{config.initialSpeaker}</span>
                        </div>
                        <div className="w-full text-center">
                            <p className="text-xs text-gray-400 italic line-clamp-2 leading-relaxed">&quot;{config.initialDialogue}&quot;</p>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSaveAndClose}
                        disabled={handlers.isSaving}
                        className="px-6 py-2.5 bg-[var(--color-primary)] text-black font-black rounded-xl text-sm hover:scale-105 transition-all flex items-center gap-2 shadow-xl disabled:opacity-50 disabled:scale-100"
                    >
                        {handlers.isSaving ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : <><Check size={18} /> SAVE & CLOSE</>}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* COMPOSITION EDITOR TAB (visual mode only) */}
                {mode === 'visual' && activeTab === 'composition' ? (
                    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-gray-500" /></div>}>
                        <CompositionEditorLazy
                            imageUrl={selectedDraft}
                            prompt={prompt}
                            aspectRatio={config.aspectRatio}
                            apiKey={apiKey}
                            onApply={(newImageUrl: string) => { setDraftHistory(prev => [...prev, newImageUrl]); setSelectedDraft(newImageUrl); setActiveTab('visual'); }}
                            onClose={() => setActiveTab('visual')}
                        />
                    </React.Suspense>
                ) : (
                    <>
                        {/* LEFT PANEL: References & Prompt & Generator */}
                        <div className="w-[420px] border-r border-white/5 flex flex-col bg-black/20 shrink-0">
                            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                                {/* Reference Assets */}
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Image size={14} /> Reference Assets
                                        </h3>
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
                                    <div className="pt-2 relative">
                                        <button
                                            onClick={() => {
                                                setSelectorTarget('reference');
                                                setModalDefaultTab('computer');
                                                setShowRefSelector(true);
                                            }}
                                            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between px-6 hover:bg-white/10 transition-all text-xs font-black text-gray-300 group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Plus size={16} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" strokeWidth={3} />
                                                <span>가져오기</span>
                                            </div>
                                        </button>
                                        <input ref={refFileInputRef} type="file" accept="image/*" onChange={handleAddReference} className="hidden" />
                                    </div>
                                </section>

                                {/* Prompt & Translation */}
                                <section className="space-y-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><Sparkles size={16} className="text-[var(--color-primary)]" /> Image Prompt</h3>
                                        <div className="flex gap-2">
                                            <button onClick={handlers.handleAIExpand} disabled={handlers.isExpanding} className="text-[10px] font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1.5 rounded-xl hover:bg-[var(--color-primary)]/20 transition-all flex items-center gap-2 shadow-lg">
                                                {handlers.isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI Reference Expand
                                            </button>
                                            <button onClick={handleResetToOriginal} className="text-[10px] font-bold text-gray-400 hover:text-white transition-all"><RotateCcw size={14} /></button>
                                        </div>
                                    </div>
                                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Image prompt..." className="w-full h-40 bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-sm text-gray-200 outline-none focus:border-[var(--color-primary)] transition-all leading-relaxed custom-scrollbar" />
                                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 relative">
                                        <span className="absolute top-2 right-3 text-[9px] font-black text-gray-600 tracking-tighter">KOREAN TRANSLATION</span>
                                        <p className="text-[11px] text-gray-400 italic leading-relaxed pt-2">{promptKR || (handlers.isTranslating ? '번역 중...' : '자동 번역 대기...')}</p>
                                    </div>

                                    {/* Video Prompt (visual mode only) */}
                                    {mode === 'visual' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Film size={14} /> Motion Direction</label>
                                                <button onClick={() => setVideoPrompt('')} className="text-[9px] font-bold text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors" title="내용 지우기 (저장 시 자동 생성됨)">
                                                    <Trash2 size={12} /> CLEAR
                                                </button>
                                            </div>
                                            <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} placeholder="Camera panning, movement..." className="w-full h-20 bg-purple-500/5 border border-purple-500/10 rounded-xl p-3 text-[11px] text-gray-400 outline-none focus:border-purple-500/30 transition-all resize-none" />
                                        </div>
                                    )}
                                </section>
                            </div>

                            {/* Generator Bottom */}
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
                                <button onClick={handlers.handleGenerate} disabled={handlers.isGenerating || !prompt} className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all ${handlers.isGenerating ? 'bg-white/5 text-gray-500' : 'bg-gradient-to-r from-[var(--color-primary)] to-[#ff8c00] text-black shadow-2xl hover:brightness-110 active:scale-[0.98]'}`}>
                                    {handlers.isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                                    {handlers.isGenerating ? 'GENERATING DRAFTS...' : 'GENERATE IMAGES'}
                                </button>
                            </div>
                        </div>

                        {/* CENTER: Draft Sidebar + Preview + Chat */}
                        <div className="flex-1 flex overflow-hidden relative">
                            {/* Draft Thumbnails Sidebar */}
                            <div className="w-40 border-r border-white/5 bg-black/40 flex flex-col p-3 shrink-0 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Drafts ({draftHistory.length})</span>
                                    {draftHistory.length > 0 && <button onClick={handleClearHistory} className="text-[9px] font-bold text-red-500/70 hover:text-red-500 uppercase leading-none">Clear</button>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 pb-2">
                                    <div className="relative col-span-2">
                                        <button
                                            onClick={() => {
                                                setSelectorTarget('draft');
                                                setModalDefaultTab('computer');
                                                setShowRefSelector(true);
                                            }}
                                            className="w-full py-2 bg-white/5 border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-[var(--color-primary)] transition-all group"
                                        >
                                            <Plus size={16} className="text-[var(--color-primary)]" />
                                            <span className="text-[9px] font-black uppercase">가져오기</span>
                                        </button>
                                        <input ref={draftFileInputRef} type="file" onChange={handleAddDraftManually} className="hidden" />
                                    </div>
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

                            {/* Preview */}
                            <div className="flex-1 flex flex-row relative bg-black overflow-hidden">
                                <div className="flex-1 relative border-r border-white/5">
                                    {selectedDraft ? (
                                        <InteractiveImageViewer src={selectedDraft} onMaskChange={setCurrentMask} onCrop={handleCropSelected} onClose={() => setSelectedDraft(null)} className="w-full h-full" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-20"><ImageIcon size={120} /></div>
                                    )}
                                </div>

                                {/* AI Editor Panel */}
                                <div className="w-[450px] h-full bg-[#0a0a0a] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-20">
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={16} className="text-[var(--color-primary)]" />
                                            <span className="text-sm font-black text-white tracking-widest uppercase">AI 편집장</span>
                                        </div>
                                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
                                            <button onClick={() => setChatIntent('image')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all flex items-center gap-1.5 ${chatIntent === 'image' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500'}`}><Image size={10} /> 이미지 수정</button>
                                            <button onClick={() => setChatIntent('prompt')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all flex items-center gap-1.5 ${chatIntent === 'prompt' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500'}`}><Plus size={10} /> 프롬프트</button>
                                        </div>
                                    </div>
                                    <div ref={handlers.chatContainerRef} className="flex-1 px-6 py-6 overflow-y-auto space-y-4 custom-scrollbar">
                                        {chatMessages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 opacity-20"><Bot size={32} className="text-gray-400" /></div>
                                                <p className="text-gray-600 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                                                    선택된 드래프트 이미지에 대한<br />수정 지시사항을 입력하세요
                                                </p>
                                            </div>
                                        ) : (
                                            chatMessages.map(msg => (
                                                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                    <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-[11px] leading-relaxed relative group ${msg.role === 'user' ? 'bg-[var(--color-primary)] text-black font-bold' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                                                        {msg.content}
                                                        {msg.image && <img src={msg.image} className="mt-2 rounded-lg max-w-full border border-white/10" />}
                                                        {msg.suggestedPrompt && (
                                                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-left">
                                                                <div className="bg-black/20 p-2 rounded text-[9px] text-gray-400 italic line-clamp-4 select-all">{msg.suggestedPrompt}</div>
                                                                <button onClick={() => setPrompt(msg.suggestedPrompt!)} className="w-full py-2 bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg text-[10px] font-black hover:bg-[var(--color-primary)]/30 transition-all flex items-center justify-center gap-1.5">
                                                                    <Check size={12} strokeWidth={3} /> 프롬프트 적용
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[8px] text-gray-700 mt-1 px-2">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            ))
                                        )}
                                        {handlers.isChatLoading && <div className="flex justify-start"><div className="bg-white/5 px-4 py-2 rounded-2xl animate-pulse"><Loader2 size={12} className="animate-spin text-gray-400" /></div></div>}
                                    </div>
                                    <div className="p-6 border-t border-white/5 bg-black/20">
                                        <div className="flex items-center gap-3">
                                            <input
                                                onKeyDown={e => e.key === 'Enter' && handlers.handleChatSend()}
                                                value={chatInput} onChange={e => setChatInput(e.target.value)}
                                                type="text" placeholder={chatIntent === 'image' ? "수정 지시..." : "프롬프트 개선 요청..."}
                                                className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-xs text-white outline-none focus:border-[var(--color-primary)] transition-all"
                                            />
                                            <button onClick={handlers.handleChatSend} disabled={handlers.isChatLoading || !chatInput.trim()} className="p-3 bg-[var(--color-primary)] text-black rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-30">
                                                <Send size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* MODALS */}
            {cropTarget && (
                <ImageCropModal
                    imageSrc={cropTarget.url}
                    aspectRatio={aspectRatio}
                    onConfirm={handleUploadCropConfirm}
                    onCancel={() => setCropTarget(null)}
                />
            )}
            {showCropModal && imageToCrop && (
                <ImageCropModal
                    imageSrc={imageToCrop}
                    aspectRatio={aspectRatio}
                    onConfirm={handleCropConfirm}
                    onCancel={() => setShowCropModal(false)}
                />
            )}

            <ReferenceSelectorModal
                isOpen={showRefSelector}
                onClose={() => setShowRefSelector(false)}
                onSelect={handleSelectReference}
                projectAssets={resolvedProjectAssets}
                pastCuts={resolvedCandidates.map(c => ({ ...c, id: String(c.id) }))}
                drafts={draftHistory}
                defaultTab={modalDefaultTab}
                title={selectorTarget === 'draft' ? 'Select Draft Image' : 'Select Reference Image'}
            />
        </div>,
        document.body
    );
};
