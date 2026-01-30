import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
    X, Wand2, Loader2, ImageIcon, Plus, Send,
    Sparkles, RotateCcw, Film, Image, Trash2, Check, Layers, Bot
} from 'lucide-react';
import { ImageCropModal } from '../ImageCropModal';
import { InteractiveImageViewer } from '../InteractiveImageViewer';
import { CompositionEditor } from './CompositionEditor';
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
    suggestedPrompt?: string;
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
    masterStyle?: string;
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
    masterStyle = '',
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
    const [uploadImageToCrop, setUploadImageToCrop] = useState<string | null>(null); // NEW: For cropping uploaded refs
    const [currentMask, setCurrentMask] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const draftFileInputRef = useRef<HTMLInputElement>(null);
    const wasOpenRef = useRef(false);
    const [resolvedCandidates, setResolvedCandidates] = useState<Array<{ id: number, url: string, index: number }>>([]);

    // Tab state for switching between visual settings and composition editor
    const [activeTab, setActiveTab] = useState<'visual' | 'composition'>('visual');

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

    const projectAssetCandidates = useMemo(() => {
        if (!assetDefinitions) return [];
        return Object.values(assetDefinitions)
            .filter((a: any) => (a.type === 'character' || a.type === 'location' || a.type === 'prop') && (a.masterImage || a.draftImage || a.referenceImage))
            .map((a: any) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                url: a.masterImage || a.draftImage || a.referenceImage
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
            const translation = await generateText(
                `Translate this English text to Korean. Only output the Korean translation:\n\n${visualPrompt}`,
                apiKey,
                undefined, // mime
                undefined, // images
                undefined, // system
                { temperature: 0.1 }
            );
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

    const getUnifiedReferences = async () => {
        const currentCut = (existingCuts || []).find(c => c.id === cutId);
        if (!currentCut) return [];

        const manualAssetIds = currentCut.referenceAssetIds || [];
        const referenceCutIds = currentCut.referenceCutIds || [];

        interface SyncRef { id: string; name: string; url: string; type: string; categories: string[] }
        const syncRefs: SyncRef[] = [];

        if (currentCut.userReferenceImage) {
            syncRefs.push({ id: 'user-ref', name: 'User Reference', url: currentCut.userReferenceImage, type: 'user', categories: ['style'] });
        }

        referenceCutIds.forEach(refId => {
            const refCut = existingCuts.find(c => c.id === refId);
            if (refCut?.finalImageUrl) {
                syncRefs.push({ id: `cut-${refId}`, name: `Prev Cut #${refId}`, url: refCut.finalImageUrl, type: 'location', categories: ['composition', 'style'] });
            }
        });

        manualAssetIds.forEach(assetId => {
            const asset = assetDefinitions?.[assetId];
            if (asset) {
                const imageToUse = asset.masterImage || asset.draftImage || asset.referenceImage;
                if (imageToUse) {
                    syncRefs.push({ id: assetId, name: asset.name, url: imageToUse, type: asset.type, categories: [asset.type === 'character' ? 'face' : 'style'] });
                }
            }
        });

        autoMatchedAssets.forEach((asset: any) => {
            if (syncRefs.some(r => r.name === asset.name)) return;
            const imageToUse = asset.masterImage || asset.draftImage || asset.referenceImage;
            if (imageToUse) {
                syncRefs.push({ id: asset.id, name: asset.name, url: imageToUse, type: asset.type, categories: [asset.type === 'character' ? 'face' : 'style'] });
            }
        });

        return syncRefs.slice(0, 4);
    };

    const analyzeReferences = async () => {
        const refs = await getUnifiedReferences();
        if (refs.length === 0) return null;

        const results = await Promise.all(refs.map(async (ref, idx) => {
            const refIndex = idx + 1;
            const imgData = await resolveUrl(ref.url);
            const mappingHeader = `Reference #${refIndex} (Asset Name: "${ref.name}") [Type: ${ref.type}]`;
            const analysisPrompt = `Describe the VISUAL FEATURES (face, hair, costume, lighting) of this image. If this is a character, focus on their unique facial features so we can maintain identity. Return ONLY the description.`;
            const text = await generateText(analysisPrompt, apiKey, undefined, imgData);
            return `${mappingHeader}\nDetailed Analysis: ${text}`;
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
            // Open Crop Modal instead of adding immediately
            setUploadImageToCrop(base64);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleUploadCropConfirm = (croppedImg: string) => {
        setTaggedReferences(prev => [...prev, {
            id: `ref-${Date.now()}`,
            url: croppedImg,
            categories: ['style'],
            isAuto: false
        }]);
        setUploadImageToCrop(null);
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
            // IMPROVEMENT: Do NOT prepend refAnalysis (text description of references) to the final prompt.
            // The literal images are being sent, so prepending a text "summary" often HALLUCINATES or 
            // DRIFTS away from the visual truth. The (Reference #N) tags in the prompt are enough.
            const finalPrompt = visualPrompt;
            const cleaned = cleanPromptForGeneration(finalPrompt);
            const unifiedRefs = await getUnifiedReferences();
            const refImages = await Promise.all(unifiedRefs.map(r => r.url.startsWith('idb://') ? resolveUrl(r.url) : r.url));
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
                const unifiedRefs = await getUnifiedReferences();
                const refImages = await Promise.all(unifiedRefs.map(r => r.url.startsWith('idb://') ? resolveUrl(r.url) : r.url));

                // Add reference mapping instruction to the user's chat input for the editor
                const mappingMeta = unifiedRefs.map((r, i) => `[Visual Reference #${i + 1}]: ${r.name} (${r.type})`).join('\n');
                const enhancedInstruction = `### EDIT TARGET\nModify the Primary Draft (IMAGE_0) based on the instruction below. \n\n### VISUAL CONTEXT MAPPING\n${mappingMeta}\n\n### USER INSTRUCTION\n${chatInput}`;

                const result = await editImageWithChat(selectedDraft, enhancedInstruction, apiKey, currentMask, refImages.filter(Boolean) as string[]);
                if (result.image) {
                    setDraftHistory(prev => [...prev, result.image!]);
                    setSelectedDraft(result.image);
                }
                setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: result.explanation || '이미지가 수정되었습니다.', image: result.image, timestamp: Date.now() }]);
            } else {
                const refContext = await analyzeReferences();
                const systemPrompt = `You are a visual director. Help the user refine their image generation prompt by integrating visual analysis from references.
                
                **CRITICAL CONSTRAINTS:**
                1. **STRICT IDENTITY LOCKING (Mandatory)**: 
                   - For every character or location mention that has a corresponding entry in the [Reference Analysis] below, you MUST append " (Reference #N)" to the name in your 'suggested_prompt'.
                   - Example: "강이수 (홈룩) (Reference #1) is sitting on a luxury sofa..."
                2. **DESCRIPTION PRUNING**: DO NOT re-describe the character's facial features, hair, or basic outfit if they have a reference image. The reference image is the ABSOLUTE VISUAL TRUTH. 
                   - Focus your expansion on the lighting, composition, cinematic camera movement, and environment. 
                   - This prevents the generator from drifting away from the reference identity due to redundant text descriptions.
                3. **EDITORIAL AUTHORITY**: You have full authority to remove existing prompt elements that contradict the references or create redundancies.
                4. **MASTER STYLE ADHERENCE**: The overall project style is: "${masterStyle}".
                5. **ASSET CONSISTENCY**: Use the EXACT asset names for characters and locations.
                6. **8K EXPANSION**: Expand the final result into a highly detailed, premium 8k English prompt.
                
                [Project Visual Anchor]
                Master Style: ${masterStyle}
                
                ${refContext ? `[Reference Analysis]\n${refContext}` : ''}

                Output a JSON with two fields: 'suggested_prompt' (the improved English prompt) and 'explanation' (a concise 1-2 sentence summary of what was changed and why, written in KOREAN).`;

                const userQuery = `Current Prompt: ${visualPrompt}\nUser Request: ${chatInput}\n\nProvide the refined prompt that integrates the User Request while strictly maintaining the Master Style and Asset Consistency.`;

                const res = await generateText(userQuery, apiKey, undefined, undefined, systemPrompt);

                try {
                    // Try to parse JSON if AI follows instructions
                    const jsonMatch = res?.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        setChatMessages(prev => [...prev, {
                            id: `msg-${Date.now()}`,
                            role: 'assistant',
                            content: parsed.explanation || '프롬프트를 다음과 같이 개선해보았습니다.',
                            suggestedPrompt: parsed.suggested_prompt,
                            timestamp: Date.now()
                        }]);
                    } else {
                        // Fallback: search for SUGGESTED_PROMPT tag or use raw text
                        const match = res?.match(/SUGGESTED_PROMPT:\s*(.+?)(?:\n|$)/s);
                        if (match) {
                            setChatMessages(prev => [...prev, {
                                id: `msg-${Date.now()}`,
                                role: 'assistant',
                                content: '프롬프트 수정안을 제시합니다.',
                                suggestedPrompt: match[1].trim(),
                                timestamp: Date.now()
                            }]);
                        } else {
                            setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: res || '수정되었습니다.', timestamp: Date.now() }]);
                        }
                    }
                } catch (e) {
                    setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: '응답을 처리하는 중 오류가 발생했습니다.', timestamp: Date.now() }]);
                }
            }
        } catch (error) {
            setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: '요청을 처리하는 중 오류가 발생했습니다.', timestamp: Date.now() }]);
        } finally {
            setIsChatLoading(false);
            setTimeout(() => {
                chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
            }, 100);
        }
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

                {/* TAB SWITCHER */}
                <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/10">
                    <button
                        onClick={() => setActiveTab('visual')}
                        className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${activeTab === 'visual'
                            ? 'bg-[var(--color-primary)] text-black shadow-lg'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Sparkles size={14} />
                        비주얼 설정
                    </button>
                    <button
                        onClick={() => setActiveTab('composition')}
                        className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${activeTab === 'composition'
                            ? 'bg-purple-500 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Layers size={14} />
                        구도 수정
                    </button>
                </div>

                {/* SPEAKER & DIALOGUE CENTER SECTION */}
                <div className="flex-1 flex flex-col items-center justify-center max-w-md px-4 overflow-hidden border-x border-white/5">
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
                {/* COMPOSITION EDITOR TAB */}
                {activeTab === 'composition' ? (
                    <CompositionEditor
                        imageUrl={selectedDraft}
                        prompt={visualPrompt}
                        aspectRatio={aspectRatio}
                        apiKey={apiKey}
                        onApply={(newImageUrl) => {
                            setDraftHistory(prev => [...prev, newImageUrl]);
                            setSelectedDraft(newImageUrl);
                            setActiveTab('visual');
                        }}
                        onClose={() => setActiveTab('visual')}
                    />
                ) : (
                    <>
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

                                {/* Project Assets Candidates (Key Visuals) */}
                                {projectAssetCandidates.length > 0 && (
                                    <section className="space-y-4 pt-4 border-t border-white/5">
                                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">Key Visuals</h3>
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            {projectAssetCandidates.map((c: any) => (
                                                <button key={c.id} onClick={() => handleAddCandidate(c.url)} className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all relative group">
                                                    <img src={c.url} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center"><Plus size={16} className="text-white" /></div>
                                                    <div className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-[8px] font-bold text-white text-center truncate px-1">{c.name}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Candidate Assets from other cuts */}
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

                            <div className="flex-1 flex flex-row relative bg-black overflow-hidden">
                                <div className="flex-1 relative border-r border-white/5">
                                    {selectedDraft ? (
                                        <InteractiveImageViewer src={selectedDraft} onMaskChange={setCurrentMask} onCrop={handleCropSelected} onClose={() => setSelectedDraft(null)} className="w-full h-full" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-20"><ImageIcon size={120} /></div>
                                    )}
                                </div>

                                {/* AI Editor Panel (Right Side Sidebar) */}
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
                                    <div ref={chatContainerRef} className="flex-1 px-6 py-6 overflow-y-auto space-y-4 custom-scrollbar">
                                        {chatMessages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center px-4">
                                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 opacity-20">
                                                    <Bot size={32} className="text-gray-400" />
                                                </div>
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
                                                                <div className="bg-black/20 p-2 rounded text-[9px] text-gray-400 italic line-clamp-4 select-all">
                                                                    {msg.suggestedPrompt}
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setVisualPrompt(msg.suggestedPrompt!);
                                                                    }}
                                                                    className="w-full py-2 bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg text-[10px] font-black hover:bg-[var(--color-primary)]/30 transition-all flex items-center justify-center gap-1.5"
                                                                >
                                                                    <Check size={12} strokeWidth={3} />
                                                                    프롬프트 적용
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[8px] text-gray-700 mt-1 px-2">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            ))
                                        )}
                                        {isChatLoading && <div className="flex justify-start"><div className="bg-white/5 px-4 py-2 rounded-2xl animate-pulse"><Loader2 size={12} className="animate-spin text-gray-400" /></div></div>}
                                    </div>
                                    <div className="p-6 border-t border-white/5 bg-black/20">
                                        <div className="flex items-center gap-3">
                                            <input
                                                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                                                value={chatInput}
                                                onChange={e => setChatInput(e.target.value)}
                                                type="text"
                                                placeholder={chatIntent === 'image' ? "수정 지시..." : "프롬프트 개선 요청..."}
                                                className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-xs text-white outline-none focus:border-[var(--color-primary)] transition-all"
                                            />
                                            <button onClick={handleChatSend} disabled={isChatLoading || !chatInput.trim()} className="p-3 bg-[var(--color-primary)] text-black rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-30">
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

            {/* Upload Crop Modal */}
            {uploadImageToCrop && (
                <ImageCropModal
                    imageSrc={uploadImageToCrop}
                    aspectRatio={aspectRatio} // Crop to current aspect ratio? Or free? Let's use current aspect ratio for consistency, or maybe '1:1' if it's just a ref? 
                    // Actually, for reference, free crop or 1:1 is usually better, but let's stick to aspect ratio for now or maybe allow user to change?
                    // The user asked "allow cropping", usually implies freedom.
                    // But ImageCropModal takes a fixed aspectRatio prop.
                    // Let's pass '1:1' for now as generic reference, or maybe allow free?
                    // ImageCropModal implementation defaults to 16:9 if invalid.
                    // Let's pass '1:1' as default for references since they are typically square-ish in UI.
                    // No, let's use the SCENE aspect ratio because often we want to crop a reference LAYOUT that matches the scene.
                    onConfirm={handleUploadCropConfirm}
                    onCancel={() => setUploadImageToCrop(null)}
                />
            )}

            {/* Generated Draft Crop Modal */}
            {showCropModal && imageToCrop && (
                <ImageCropModal
                    imageSrc={imageToCrop}
                    aspectRatio={aspectRatio}
                    onConfirm={handleCropConfirm}
                    onCancel={() => setShowCropModal(false)}
                />
            )}
        </div>
        , document.body
    );
};
