import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
    X, Wand2, Loader2, ImageIcon, Plus, Send,
    Sparkles, RotateCcw, Film, Image, Trash2, Check, Layers, Bot
} from 'lucide-react';
import { ImageCropModal } from '../ImageCropModal';
import { InteractiveImageViewer } from '../InteractiveImageViewer';
import { CompositionEditor } from './CompositionEditor';
import { ReferenceSelectorModal } from '../ReferenceSelectorModal';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import { generateText, generateVideoMotionPrompt, type VideoMotionContext } from '../../services/gemini';
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
    const [cropTarget, setCropTarget] = useState<{ url: string; name?: string; type?: string; id?: string } | null>(null);
    const [currentMask, setCurrentMask] = useState<string | null>(null);

    const draftFileInputRef = useRef<HTMLInputElement>(null);
    const wasOpenRef = useRef(false);

    // Memory management: Track all blob URLs created in this component
    const blobUrlsRef = useRef<Set<string>>(new Set());

    const [resolvedCandidates, setResolvedCandidates] = useState<Array<{ id: number, url: string, index: number }>>([]);
    const [resolvedProjectAssets, setResolvedProjectAssets] = useState<Array<{ id: string, name: string, url: string, type: string }>>([]);
    const [showRefSelector, setShowRefSelector] = useState(false);

    // Tab state for switching between visual settings and composition editor
    const [activeTab, setActiveTab] = useState<'visual' | 'composition'>('visual');

    // Memory cleanup: Revoke all blob URLs when closing
    useEffect(() => {
        if (!isOpen && wasOpenRef.current) {
            // Component is closing - cleanup all blob URLs
            blobUrlsRef.current.forEach(url => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
            blobUrlsRef.current.clear();
            console.log('[VisualSettingsStudio] Cleaned up blob URLs on close');
        }
    }, [isOpen]);

    // ========================================================================
    // MEMOS
    // ========================================================================

    const dynamicCategories = useMemo(() => {
        if (!assetDefinitions) return [];
        return Object.values(assetDefinitions)
            .filter((a: any) => a.type === 'character' || a.type === 'location' || a.type === 'prop')
            .map((a: any) => {
                let typeLabel = '기타';
                if (a.type === 'character') typeLabel = '인물';
                else if (a.type === 'location') typeLabel = '장소';
                else if (a.type === 'prop') typeLabel = '소품';

                return {
                    value: `${a.type}-${a.name}`,
                    label: `${typeLabel}: ${a.name}`
                };
            });
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

    const analyzeReferences = async () => {
        const refs = taggedReferences;
        if (refs.length === 0 || !apiKey) return null;

        const { blobUrlToBase64 } = await import('../../utils/imageStorage');

        const results = await Promise.all(refs.map(async (ref) => {
            try {
                // [FIX] Convert blob/idb URL to Base64 for Vision analysis
                const imgData = await blobUrlToBase64(ref.url);
                if (!imgData) return null;

                const analysisPrompt = `Perform a RIGID VISUAL INVENTORY of this reference image for identity preservation.
                
                **STRICT ANTI-HALLUCINATION RULES**:
                1. Describe ONLY clearly visible features.
                2. **FACT CHECK**: Hair length, Clothing type, Neckline, Accessories.
                3. Do NOT assume generic details.
                
                Format:
                - Asset Name: ${ref.name}
                - Role/Category: ${ref.categories.join(', ')}
                - Identity: (Gender, visible age)
                - Hair: (Style, EXACT length, color)
                - Outfit: (Type, visible colors, specific neckline)
                
                Return ONLY the list.`;

                const text = await generateText(analysisPrompt, apiKey, undefined, [imgData]);
                return `### REFERENCE IDENTITY: ${ref.name}\n[ASSET ROLE: ${ref.categories.join(', ')}]\n[MANDATORY VISUAL FEATURES]\n${text}`;
            } catch (err) {
                console.error(`[VisualSettingsStudio:Analysis] Failed for ${ref.name}:`, err);
                return null;
            }
        }));
        return results.filter(Boolean).join('\n\n');
    };

    const handleAIExpand = async () => {
        setIsExpanding(true);
        try {
            const refContext = await analyzeReferences();

            const systemPrompt = `You are a professional visual director. Expand the user's prompt into a cinematic English prompt while STRICTLY ADHERING to the provided [MANDATORY VISUAL FEATURES].
            
            **ABSOLUTE GROUND TRUTH RULE**: 
            1. The 시각적 특징(MANDATORY VISUAL FEATURES) extracted from images are the ONLY source of truth.
            2. **TEXT DISCARD RULE**: If the user's prompt contradicts the visual analysis (e.g., user says "Long hair" but image shows "Short"), YOU MUST DISCARD the user's text and use the visual fact.
            3. Do NOT assume or hallucinate generic clothing or hair styles.
            4. **NO DIALOGUE**: Do not include any speech or script lines.`;

            const fullPrompt = `[User Request]
${visualPrompt}

${refContext ? `[MANDATORY VISUAL FEATURES - GROUND TRUTH]
${refContext}` : ''}

[Final Instruction]
1. Expand into a detailed cinematic English visual prompt.
2. **PRIORITY 1 (IDENTITY)**: You MUST include ALL characters listed in [MANDATORY VISUAL FEATURES] in the final prompt. 
3. Use "(Ref: {Asset Name})" immediately after the character's first mention for identity mapping.
4. **PRIORITY 2 (PHYSICALITY)**: Use ONLY the physical features from [MANDATORY VISUAL FEATURES]. Ignore any physical descriptions in [User Request] that contradict the [MANDATORY VISUAL FEATURES]. 
5. Provide a high-end cinematic description starting directly with the subject.`;

            const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
            if (result) setVisualPrompt(result.trim());
        } catch (error) {
            console.error(error);
        } finally {
            setIsExpanding(false);
        }
    };


    const handleSelectReference = (asset: { url: string; name?: string; type?: string; id?: string }) => {
        // Close selector and open cropper
        setShowRefSelector(false);
        setCropTarget(asset);
    };

    const handleUploadCropConfirm = (croppedImg: string) => {
        // Use the metadata from the selected asset, or fallback to defaults
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

            // 1. Use Tagged References from State (User Edited)
            const unifiedRefs = taggedReferences;

            // 2. Parse Prompt for (Ref: Name) tags
            // regex matches (Ref: Name) or (Reference #N) fallback
            const refTagRegex = /\(Ref:\s*(.+?)\)/g;
            const matches = [...visualPrompt.matchAll(refTagRegex)];

            // 3. Build Ordered List of used references for the API
            const usedRefImages: { name: string, url: string }[] = [];
            let finalPrompt = visualPrompt;


            // Helper to add ref and get index
            const getOrAddRef = async (name: string): Promise<boolean> => {
                const cleanName = name.trim();
                if (usedRefImages.some(r => r.name === cleanName)) return true;

                // Find matching asset
                const refObj =
                    unifiedRefs.find(r => r.name === cleanName) ||
                    unifiedRefs.find(r => r.name?.includes(cleanName));

                if (refObj) {
                    const { blobUrlToBase64 } = await import('../../utils/imageStorage');
                    const base64 = await blobUrlToBase64(refObj.url);
                    if (base64) {
                        usedRefImages.push({ name: cleanName, url: base64 });
                        return true;
                    }
                }
                return false;
            };

            // Process all matches to ensure assets are loaded
            for (const match of matches) {
                const refName = match[1].trim();
                await getOrAddRef(refName);
                // [NAMED BINDING] We leave the (Ref: Name) tag as is!
                // AI in imageGen.ts now knows how to handle (Ref: Name) directly.
            }

            // If no explicit tags found, fall back to sending ALL attached references (legacy behavior logic) 
            // but ONLY if the prompt doesn't look like it's trying to use specific refs.
            // Actually, safe default: if list is empty but we have taggedReferences, just send them all?
            // No, "Smart" mode implies specificity. But if user manually added refs and didn't tag them?
            // Let's keep the user's manual refs in the list if they aren't tagged.
            // Wait, if I manually add a ref, I want it used.
            // Append unused references for style context
            const unusedRefs = unifiedRefs.filter(r => r.name && !usedRefImages.some(ui => ui.name === r.name));
            for (const r of unusedRefs) {
                const { blobUrlToBase64 } = await import('../../utils/imageStorage');
                const base64 = await blobUrlToBase64(r.url);
                if (base64) {
                    usedRefImages.push({ name: r.name || 'Style Ref', url: base64 });
                }
            }

            const cleaned = cleanPromptForGeneration(finalPrompt);
            const model = aiModel === 'PRO' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

            const result = await generateImage(cleaned, apiKey, usedRefImages, aspectRatio, model, draftCount);
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
                const unifiedRefs = taggedReferences;
                const refImages = await Promise.all(unifiedRefs.map(r => resolveUrl(r.url)));

                // Add reference mapping instruction to the user's chat input for the editor
                const mappingMeta = unifiedRefs.map((r, i) => `[Visual Reference #${i + 1}]: ${r.name} (Tags: ${r.categories.join(',')})`).join('\n');
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
                   - For every character or location mention that has a corresponding entry in the [Reference Analysis] below, you MUST append " (Ref: {Asset Name})" to the name in your 'suggested_prompt'.
                   - Example: "강이수 (홈룩) (Ref: 강이수 홈룩) is sitting on a luxury sofa..."
                2. **DESCRIPTION PRUNING**: DO NOT re-describe the character's facial features, hair, or basic outfit if they have a reference image. The reference image is the ABSOLUTE VISUAL TRUTH. 
                   - Focus your expansion on the lighting, composition, cinematic camera movement, and environment. 
                   - This prevents the generator from drifting away from the reference identity due to redundant text descriptions.
                3. **EDITORIAL AUTHORITY**: You have full authority to remove existing prompt elements that contradict the references or create redundancies.
                4. **MASTER STYLE ADHERENCE**: The overall project style is: "${masterStyle}".
                5. **ASSET CONSISTENCY**: Use the EXACT asset names for characters and locations.
                6. **8K EXPANSION**: Expand the final result into a highly detailed, premium 8k English prompt.
                7. **NO DIALOGUE/TEXT (Strictly enforced)**: DO NOT include any script dialogue, character quotes, or instructions to "render text" or "say something". Image prompts must be purely visual.
                
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

    // Auto-generate AI video prompt on save
    const [isSaving, setIsSaving] = useState(false);
    const handleSave = async () => {
        setIsSaving(true);
        try {
            let finalVideoPrompt = videoPrompt;

            // If no video prompt or it's empty, auto-generate using AI
            if (!finalVideoPrompt?.trim() && visualPrompt?.trim()) {
                console.log('[VisualSettingsStudio] Auto-generating AI video prompt on save...');

                // Find speaker asset for visual features
                const speakerAsset = assetDefinitions ?
                    Object.values(assetDefinitions).find((a: any) =>
                        a.type === 'character' && a.name?.toLowerCase() === initialSpeaker?.toLowerCase()
                    ) as any : null;

                // Find location from visual prompt
                const locationAsset = assetDefinitions ?
                    Object.values(assetDefinitions).find((a: any) =>
                        a.type === 'location' && visualPrompt?.toLowerCase().includes(a.name?.toLowerCase())
                    ) as any : null;

                // NEW: Find Props from visual prompt
                const propAssets = assetDefinitions ?
                    Object.values(assetDefinitions).filter((a: any) =>
                        a.type === 'prop' && visualPrompt?.toLowerCase().includes(a.name?.toLowerCase())
                    ) as any[] : [];

                // Find the current cut to get duration and emotion
                const currentCut = existingCuts.find(c => c.id === cutId);

                const context: VideoMotionContext = {
                    visualPrompt: visualPrompt,
                    dialogue: initialDialogue,
                    emotion: currentCut?.emotion,
                    audioDuration: currentCut?.estimatedDuration,
                    speakerInfo: speakerAsset ? {
                        name: speakerAsset.name,
                        visualFeatures: speakerAsset.visualSummary || speakerAsset.description,
                        gender: speakerAsset.gender
                    } : undefined,
                    locationInfo: locationAsset ? {
                        name: locationAsset.name,
                        visualFeatures: locationAsset.visualSummary || locationAsset.description
                    } : undefined,
                    propInfo: propAssets.length > 0 ? propAssets.map(p => ({
                        name: p.name,
                        visualFeatures: p.visualSummary || p.description
                    })) : undefined
                };

                try {
                    finalVideoPrompt = await generateVideoMotionPrompt(context, apiKey);
                    console.log('[VisualSettingsStudio] ✨ AI video prompt generated:', finalVideoPrompt.substring(0, 80) + '...');
                } catch (err) {
                    console.error('[VisualSettingsStudio] Failed to generate AI video prompt:', err);
                    // Fallback to basic
                    finalVideoPrompt = `${visualPrompt}. Camera slowly pushes in. Subtle atmospheric motion.`;
                }
            }

            onSave({
                visualPrompt,
                visualPromptKR,
                videoPrompt: finalVideoPrompt,
                finalImageUrl: selectedDraft,
                draftHistory,
                taggedReferences
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

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
                const getAssetImageUrl = (asset: any) => asset?.masterImage || asset?.referenceImage || asset?.draftImage || asset?.imageUrl || asset?.image || asset?.url || null;

                const processAsset = async (asset: any, isAuto: boolean) => {
                    if (!asset) return;
                    const imgUrl = getAssetImageUrl(asset);
                    if (imgUrl) {
                        let url = imgUrl;
                        if (isIdbUrl(url)) url = await resolveUrl(url) || url;

                        let category = asset.type || 'unknown';
                        if (asset.type === 'prop') category = `prop-${asset.name}`;

                        loadedRefs.push({
                            id: asset.id || `${asset.type}-${asset.name}`,
                            url,
                            categories: [category],
                            name: asset.name,
                            isAuto
                        });
                    }
                };

                // 1. Load Manual Asset References
                for (const asset of manualAssetObjs) await processAsset(asset, false);

                // 2. Load Auto Matched Asset References
                for (const asset of autoMatchedAssets) await processAsset(asset, true);

                // 3. Load Previous Cut References
                const currentCut = existingCuts.find(c => c.id === cutId);
                if (currentCut?.referenceCutIds) {
                    for (const refId of currentCut.referenceCutIds) {
                        const refCut = existingCuts.find(c => c.id === refId);
                        if (refCut?.finalImageUrl) {
                            let url = refCut.finalImageUrl;
                            if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                            if (url) {
                                loadedRefs.push({
                                    id: `cut-${refId}`,
                                    url,
                                    name: `Cut #${refId}`,
                                    categories: ['style'],
                                    isAuto: false
                                });
                            }
                        }
                    }
                }

                // 4. Load User Reference Image
                if (currentCut?.userReferenceImage) {
                    let url = currentCut.userReferenceImage;
                    if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                    if (url) {
                        loadedRefs.push({
                            id: 'user-ref',
                            url,
                            name: 'User Reference',
                            categories: ['style'],
                            isAuto: false
                        });
                    }
                }

                setTaggedReferences(loadedRefs);
            };

            init().catch(() => { });
            wasOpenRef.current = true;
        } else if (!isOpen) {
            wasOpenRef.current = false;
        }
    }, [isOpen, initialVisualPrompt, initialVisualPromptKR, initialFinalImageUrl, initialVideoPrompt, assetDefinitions, autoMatchedAssets, manualAssetObjs]);

    // AUTO-SYNC REMOVED: Name-based logic replaces index syncing.

    useEffect(() => {
        setCurrentMask(null);
    }, [selectedDraft]);

    useEffect(() => {
        if (!visualPrompt || visualPrompt.trim().length < 5 || !apiKey) return;
        const timer = setTimeout(() => performTranslation(), 1000);
        return () => clearTimeout(timer);
    }, [visualPrompt, apiKey]);

    // Resolve candidates URLs - only when modal is open
    useEffect(() => {
        if (!isOpen) return;
        const resolveCandidates = async () => {
            const candidates = existingCuts
                .filter(c => c.id !== cutId && c.finalImageUrl)
                .map(c => ({ id: c.id, url: c.finalImageUrl!, index: existingCuts.indexOf(c) + 1 }));

            const resolved = await Promise.all(candidates.map(async c => {
                let url = c.url;
                if (isIdbUrl(url)) {
                    url = await resolveUrl(url) || url;
                    // Track blob URLs for cleanup
                    if (url.startsWith('blob:')) blobUrlsRef.current.add(url);
                }
                return { ...c, url };
            }));
            setResolvedCandidates(resolved);
        };
        resolveCandidates();
    }, [existingCuts, cutId, isOpen]);

    // Resolve Project Assets - only when modal is open
    useEffect(() => {
        if (!isOpen) return;
        const resolveAssets = async () => {
            if (!assetDefinitions) return;
            const rawAssets = Object.values(assetDefinitions)
                .filter((a: any) => (a.type === 'character' || a.type === 'location' || a.type === 'prop') && (a.masterImage || a.draftImage || a.referenceImage))
                .map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    url: a.masterImage || a.draftImage || a.referenceImage
                }));

            const resolved = await Promise.all(rawAssets.map(async a => {
                let url = a.url;
                if (isIdbUrl(url)) {
                    url = await resolveUrl(url) || url;
                    // Track blob URLs for cleanup
                    if (url.startsWith('blob:')) blobUrlsRef.current.add(url);
                }
                return { ...a, url };
            }));
            setResolvedProjectAssets(resolved);
        };
        resolveAssets();
    }, [assetDefinitions, isOpen]);

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
                            ? 'bg-orange-500 text-black shadow-lg'
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
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-[var(--color-primary)] text-black font-black rounded-xl text-sm hover:scale-105 transition-all flex items-center gap-2 shadow-xl disabled:opacity-50 disabled:scale-100">
                        {isSaving ? <><Loader2 size={18} className="animate-spin" /> AI 생성중...</> : <><Check size={18} /> SAVE & CLOSE</>}
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
                                    <div className="pt-2 flex justify-center">
                                        <button
                                            onClick={() => setShowRefSelector(true)}
                                            className="w-full py-3 border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-white hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all text-xs font-bold"
                                        >
                                            <Plus size={14} /> ADD REFERENCE
                                        </button>
                                    </div>
                                </section>

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
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2"><Film size={14} /> Motion Direction</label>
                                            <button
                                                onClick={() => setVideoPrompt('')}
                                                className="text-[9px] font-bold text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                                                title="내용 지우기 (저장 시 자동 생성됨)"
                                            >
                                                <Trash2 size={12} /> CLEAR
                                            </button>
                                        </div>
                                        <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} placeholder="Camera panning, movement..." className="w-full h-20 bg-orange-500/5 border border-orange-500/10 rounded-xl p-3 text-[11px] text-gray-400 outline-none focus:border-orange-500/30 transition-all resize-none" />
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
            {cropTarget && (
                <ImageCropModal
                    imageSrc={cropTarget.url}
                    aspectRatio={aspectRatio}
                    onConfirm={handleUploadCropConfirm}
                    onCancel={() => setCropTarget(null)}
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

            {/* Reference Selector Modal */}
            <ReferenceSelectorModal
                isOpen={showRefSelector}
                onClose={() => setShowRefSelector(false)}
                onSelect={handleSelectReference}
                projectAssets={resolvedProjectAssets}
                pastCuts={resolvedCandidates.map(c => ({ ...c, id: String(c.id) }))}
                drafts={draftHistory}
            />
        </div>
        , document.body
    );
};
