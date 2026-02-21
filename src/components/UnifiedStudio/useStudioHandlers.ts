// UnifiedStudio Handlers Hook
// Consolidates generation, chat, AI expand, and save logic from all 3 modals

import { useState, useRef, useCallback } from 'react';
import type { TaggedReference, ChatMessage, StudioModeConfig } from './types';
import { resolveUrl } from '../../utils/imageStorage';
import { generateText, generateVideoMotionPrompt, analyzeImage, type VideoMotionContext } from '../../services/gemini';

interface UseStudioHandlersProps {
    config: StudioModeConfig;
    apiKey: string;
    masterStyle: string;
    prompt: string;
    setPrompt: (v: string) => void;
    promptKR: string;
    setPromptKR: (v: string) => void;
    videoPrompt: string;
    setVideoPrompt: (v: string) => void;
    taggedReferences: TaggedReference[];
    setTaggedReferences: React.Dispatch<React.SetStateAction<TaggedReference[]>>;
    draftHistory: string[];
    setDraftHistory: React.Dispatch<React.SetStateAction<string[]>>;
    selectedDraft: string | null;
    setSelectedDraft: (v: string | null) => void;
    chatMessages: ChatMessage[];
    setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    chatInput: string;
    setChatInput: (v: string) => void;
    chatIntent: 'image' | 'prompt';
    draftCount: number;
    aiModel: 'PRO' | 'STD';
    currentMask: string | null;
}

export function useStudioHandlers(props: UseStudioHandlersProps) {
    const {
        config, apiKey, masterStyle,
        prompt, setPrompt, promptKR, setPromptKR,
        videoPrompt, setVideoPrompt: _setVideoPrompt,
        taggedReferences, setTaggedReferences: _setTaggedReferences,
        draftHistory, setDraftHistory,
        selectedDraft, setSelectedDraft,
        chatMessages: _chatMessages, setChatMessages,
        chatInput, setChatInput,
        chatIntent, draftCount, aiModel, currentMask,
    } = props;

    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [analyzedImageUrl, setAnalyzedImageUrl] = useState<string | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // ========================================================================
    // TRANSLATION
    // ========================================================================

    const performTranslation = useCallback(async () => {
        if (!prompt || prompt.trim().length < 2 || !apiKey) return;
        setIsTranslating(true);
        try {
            const translation = await generateText(
                `Translate this English text to Korean. Only output the Korean translation:\n\n${prompt}`,
                apiKey, undefined, undefined, undefined, { temperature: 0.1 }
            );
            if (translation) setPromptKR(translation.trim());
        } catch (error) {
            console.error('Translation failed:', error);
        } finally {
            setIsTranslating(false);
        }
    }, [prompt, apiKey, setPromptKR]);

    // ========================================================================
    // REFERENCE ANALYSIS (shared)
    // ========================================================================

    const analyzeReferences = useCallback(async () => {
        const refs = taggedReferences;
        if (refs.length === 0) return null;

        const results = await Promise.all(refs.map(async (ref) => {
            const imgData = await resolveUrl(ref.url);
            const mappingHeader = `Reference Asset: "${ref.name || 'Ref'}" [Categories: ${ref.categories.join(', ')}]`;
            const analysisPrompt = `Describe the VISUAL FEATURES (face, hair, costume, lighting, material) of this image. If this is a character, focus on their unique facial features so we can maintain identity. If it is an object/prop, focus on its specific design and texture. Return ONLY the description.`;
            const text = await generateText(analysisPrompt, apiKey, undefined, imgData);
            return `${mappingHeader}\nDetailed Analysis: ${text}`;
        }));
        return results.filter(Boolean).join('\n\n');
    }, [taggedReferences, apiKey]);

    // ========================================================================
    // AI EXPAND
    // ========================================================================

    const handleAIExpand = useCallback(async () => {
        setIsExpanding(true);
        try {
            const refContext = await analyzeReferences();

            if (config.mode === 'channelArt') {
                const { characters = [], strategyContext, type } = config;
                const systemPrompt = `당신은 유튜브 ${type === 'banner' ? '배너' : '프로필'} 디자인 및 채널 브랜딩 전문가입니다. 채널의 정체성과 참조 이미지의 시각적 특징을 결합하여, AI 이미지 생성을 위한 고품질의 영어 프롬프트를 작성하세요.`;
                const refImages = taggedReferences.map(ref => {
                    const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                    if (matches) return { mimeType: matches[1], data: matches[2] };
                    return null;
                }).filter(Boolean) as { mimeType: string; data: string }[];

                const fullPrompt = `[채널 브랜딩 및 전략 정보]\n${strategyContext}\n\n[사용자 현재 의도]\n${prompt || (type === 'banner' ? 'A professional YouTube banner' : 'A premium profile icon')}\n\n${refContext ? `[참조 이미지 시각적 분석]\n${refContext}` : ''}\n\n[프롬프트 작성 지침]\n1. 브랜딩 정보를 시각적으로 형상화하세요.\n2. 참조 이미지를 100% 반영하세요.\n3. 캐릭터(${characters.map(c => c.name).join(', ')}) 반영.\n4. 오직 1개의 통합된 영어 프롬프트만 출력하세요.`;

                const result = await generateText(fullPrompt, apiKey, undefined, refImages, systemPrompt);
                if (result) {
                    const clean = result.replace(/^["']|["']$/g, '').replace(/^(Prompt|Output):\s*/i, '').trim();
                    setPrompt(clean);
                }
            } else if (config.mode === 'thumbnail') {
                const { strategyContext } = config as any;
                const systemPrompt = `You are a YouTube thumbnail CTR optimization expert. Convert trend insights into highly effective visual prompts. Return ONLY valid JSON.`;

                // Safe Zone, Anti-Bleeding, Typography Guard 주입
                const fullPrompt = `[Thumbnail Strategy]\n${JSON.stringify(strategyContext)}\n\n[User Intent]\n${prompt}\n\n${refContext ? `[Reference Analysis]\n${refContext}` : ''}\n\n[Instructions]\n1. Incorporate specific reference details using '(Ref: {Name})' format.\n2. **Youtube Safe Zone Guard**: Keep the bottom-right corner clear. Focus subjects in center/left.\n3. **Anti-Bleeding**: Ensure clear spatial separation if multiple characters exist (e.g., A on left, B on right. Do NOT mix features).\n4. **Typography Guard**: Describe visuals only. Append 'No typography, no broken text, (Korean Font Safeguard)'.\n\nReturn JSON: { "prompt": "Detailed English visual prompt", "hookCopies": ["Hook text 1 in KR", "Hook text 2 in KR", "Hook text 3 in KR"] }`;

                const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
                try {
                    const jsonMatch = result?.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.prompt) setPrompt(parsed.prompt);
                        if (parsed.hookCopies && parsed.hookCopies.length > 0) {
                            setChatMessages(prev => [...prev, {
                                id: `msg-${Date.now()}`, role: 'assistant',
                                content: `썸네일 기획 전략을 바탕으로 프롬프트를 자동 최적화했습니다.\n\n💡 **추천 썸네일 카피(Hook)**:\n${parsed.hookCopies.map((c: string) => `- ${c}`).join('\n')}`,
                                timestamp: Date.now()
                            }]);
                        }
                    } else if (result) {
                        setPrompt(result.trim());
                    }
                } catch (e) {
                    console.error('Failed to parse thumbnail expand JSON', e);
                    if (result) setPrompt(result.trim());
                }
            } else if (config.mode === 'asset') {
                // Asset mode: category-based analysis + enhancePrompt
                const categoryAnalyses: Record<string, string[]> = {};
                for (const ref of taggedReferences) {
                    const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                    if (!matches) continue;
                    const cat = ref.categories[0] || 'style';
                    const instruction = {
                        face: 'Focus ONLY on facial features.',
                        body: 'Focus ONLY on body type.',
                        costume: 'Focus ONLY on clothing.',
                        props: 'Focus ONLY on objects/props.',
                        style: 'Focus ONLY on artistic style.',
                        color: 'Focus ONLY on color palette.',
                        pose: 'Focus ONLY on pose.'
                    }[cat] || 'Describe the key visual elements.';

                    const res = await generateText(
                        `Analyze this reference image. ${instruction} Output ONLY English text.`,
                        apiKey, undefined,
                        [{ mimeType: matches[1], data: matches[2] }],
                        undefined, { temperature: 0.7 }
                    );
                    if (res) {
                        if (!categoryAnalyses[cat]) categoryAnalyses[cat] = [];
                        categoryAnalyses[cat].push(res.trim());
                    }
                }

                const parts: string[] = [];
                for (const [cat, texts] of Object.entries(categoryAnalyses)) {
                    parts.push(`[${cat}]: ${texts.join('; ')}`);
                }

                if (parts.length > 0) {
                    try {
                        const { enhancePrompt } = await import('../../services/gemini');
                        const basePrompt = prompt ? `${prompt}\n\n--- Visual References ---\n${parts.join('\n\n')}` : parts.join('\n\n');
                        const aiType = (config.assetType === 'prop' ? 'character' : config.assetType) as 'character' | 'location' | 'style';
                        const enhanced = await enhancePrompt(basePrompt, aiType, config.projectContext || `Master Style: ${masterStyle}`, apiKey);
                        setPrompt(enhanced);
                    } catch {
                        setPrompt(prompt ? `${prompt}\n\n${parts.join('\n\n')}` : parts.join('\n\n'));
                    }
                }
            } else {
                // Visual mode
                const systemPrompt = "You are a visual director. Enhance the user's prompt by integrating visual analysis from references. Use the format '(Ref: {Asset Name})' to link specific assets. Stay concise and premium.";
                const fullPrompt = `User Prompt: ${prompt}\n\n${refContext ? `[Reference Analysis]\n${refContext}` : ''}\n\n[Instructions]\n1. Incorporate specific details from named references.\n2. Maintain consistent identity by appending "(Ref: {Asset Name})" after character names.\n3. Expand into a detailed 8k English prompt.\n4. DO NOT include any script dialogue.`;
                const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
                if (result) setPrompt(result.trim());
            }
        } catch (error) {
            console.error('AI Expand failed:', error);
        } finally {
            setIsExpanding(false);
        }
    }, [config, prompt, taggedReferences, apiKey, masterStyle, analyzeReferences, setPrompt]);

    // ========================================================================
    // GENERATE IMAGE
    // ========================================================================

    const handleGenerate = useCallback(async () => {
        if (!prompt) return;
        setIsGenerating(true);
        try {
            const { generateImage } = await import('../../services/imageGen');
            const { cleanPromptForGeneration } = await import('../../utils/promptUtils');

            let finalPrompt = prompt;
            let refImages: string[] = taggedReferences.map(r => r.url);
            let ratio = '1:1';
            const model = aiModel === 'PRO' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

            if (config.mode === 'channelArt') {
                const analysisContext = await analyzeReferences();
                finalPrompt = `[Context: ${config.strategyContext}]\n${analysisContext}\n\nTask: Generate channel art for "${config.channelName}".\nDescription: ${prompt}`;
                ratio = config.type === 'banner' ? '16:9' : '1:1';
            } else if (config.mode === 'asset') {
                if (masterStyle) finalPrompt = `[Master Style: ${masterStyle}]\n\n${finalPrompt}`;
                ratio = config.aspectRatio;
            } else {
                // Visual & Thumbnail mode: smart ref tag processing
                const refTagRegex = /\(Ref:\s*(.+?)\)/g;
                const matches = [...prompt.matchAll(refTagRegex)];
                const usedRefImages: string[] = [];
                const nameToIndex = new Map<string, number>();

                for (const match of matches) {
                    const refName = match[1].trim();
                    if (!nameToIndex.has(refName)) {
                        const refObj = taggedReferences.find(r => r.name === refName) || taggedReferences.find(r => r.name?.includes(refName));
                        if (refObj) {
                            let url = refObj.url;
                            if (url.startsWith('idb://')) url = await resolveUrl(url) || url;
                            usedRefImages.push(url);
                            nameToIndex.set(refName, usedRefImages.length);
                        }
                    }
                    const idx = nameToIndex.get(refName);
                    if (idx) finalPrompt = finalPrompt.replace(match[0], `(Reference #${idx})`);
                }

                // Append unused refs
                for (const r of taggedReferences.filter(r => r.name && !nameToIndex.has(r.name))) {
                    let url = r.url;
                    if (url.startsWith('idb://')) url = await resolveUrl(url) || url;
                    usedRefImages.push(url);
                }

                refImages = usedRefImages.length > 0 ? usedRefImages : refImages;
                ratio = config.mode === 'thumbnail' ? '16:9' : config.aspectRatio;
            }

            const cleaned = cleanPromptForGeneration(finalPrompt);
            const result = await generateImage(cleaned, apiKey, refImages.length > 0 ? refImages : undefined, ratio, model, draftCount);
            const resolved = await Promise.all(result.urls.map((u: string) => resolveUrl(u)));
            const newDrafts = resolved.map((u, i) => u || result.urls[i]);
            setDraftHistory(prev => [...prev, ...newDrafts]);
            if (newDrafts.length > 0) setSelectedDraft(newDrafts[0]);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsGenerating(false);
        }
    }, [config, prompt, taggedReferences, apiKey, masterStyle, aiModel, draftCount, analyzeReferences, setDraftHistory, setSelectedDraft]);

    // ========================================================================
    // CHAT SEND
    // ========================================================================

    const handleChatSend = useCallback(async () => {
        if (!chatInput.trim()) return;
        const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: chatInput, timestamp: Date.now() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setIsChatLoading(true);
        try {
            if (chatIntent === 'image' && selectedDraft) {
                const { editImageWithChat } = await import('../../services/imageGen');
                const refImages = await Promise.all(taggedReferences.map(r => resolveUrl(r.url)));
                const mappingMeta = taggedReferences.map((r, i) => `[Visual Reference #${i + 1}]: ${r.name || 'Ref'} (Tags: ${r.categories.join(',')})`).join('\n');
                const enhancedInstruction = `### EDIT TARGET\nModify the Primary Draft (IMAGE_0) based on the instruction below.\n\n### VISUAL CONTEXT MAPPING\n${mappingMeta}\n\n### USER INSTRUCTION\n${chatInput}`;

                const editModel = aiModel === 'PRO' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
                const result = await editImageWithChat(selectedDraft, enhancedInstruction, apiKey, currentMask, refImages.filter(Boolean) as string[], editModel);
                if (result.image) {
                    setDraftHistory(prev => [...prev, result.image!]);
                    setSelectedDraft(result.image);
                }
                setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: result.explanation || '이미지가 수정되었습니다.', image: result.image, timestamp: Date.now() }]);
            } else {
                // Prompt refinement mode
                const refContext = await analyzeReferences();
                const systemPrompt = `You are a visual director. Help refine the image generation prompt.\nMaster Style: ${masterStyle}\n${refContext ? `[Reference Analysis]\n${refContext}` : ''}\n\nOutput JSON: { "suggested_prompt": "...", "explanation": "..." (Korean) }`;
                const userQuery = `Current Prompt: ${prompt}\nUser Request: ${chatInput}`;
                const res = await generateText(userQuery, apiKey, undefined, undefined, systemPrompt);

                try {
                    const jsonMatch = res?.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        setChatMessages(prev => [...prev, {
                            id: `msg-${Date.now()}`, role: 'assistant',
                            content: parsed.explanation || '프롬프트를 개선했습니다.',
                            suggestedPrompt: parsed.suggested_prompt,
                            timestamp: Date.now()
                        }]);
                    } else {
                        setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: res || '수정되었습니다.', timestamp: Date.now() }]);
                    }
                } catch {
                    setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: '응답 처리 중 오류가 발생했습니다.', timestamp: Date.now() }]);
                }
            }
        } catch {
            setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: '요청 처리 중 오류가 발생했습니다.', timestamp: Date.now() }]);
        } finally {
            setIsChatLoading(false);
            setTimeout(() => { chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' }); }, 100);
        }
    }, [chatInput, chatIntent, selectedDraft, taggedReferences, apiKey, masterStyle, prompt, currentMask, analyzeReferences, setChatMessages, setChatInput, setDraftHistory, setSelectedDraft]);

    // ========================================================================
    // SAVE
    // ========================================================================

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            let finalDescription = prompt;

            if (selectedDraft && selectedDraft !== analyzedImageUrl) {
                console.log('[UnifiedStudio] Automatically analyzing draft image...', selectedDraft);
                try {
                    let analysisImageUrl = selectedDraft;

                    // Handle idb:// URLs
                    if (selectedDraft.startsWith('idb://')) {
                        console.log('[UnifiedStudio] Resolving idb:// URL for analysis...');
                        analysisImageUrl = await resolveUrl(selectedDraft) || selectedDraft;
                    }

                    if (analysisImageUrl.startsWith('blob:') || analysisImageUrl.startsWith('http')) {
                        console.log('[UnifiedStudio] Fetching image for analysis:', analysisImageUrl);
                        const response = await fetch(analysisImageUrl);
                        const blob = await response.blob();
                        const reader = new FileReader();
                        const base64 = await new Promise<string>((resolve, reject) => {
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        analysisImageUrl = base64;
                    }

                    const analysis = await analyzeImage(analysisImageUrl, apiKey || '');
                    console.log('[UnifiedStudio] AI Analysis complete:', analysis ? (analysis.substring(0, 50) + '...') : 'FAILED');

                    if (analysis) {
                        const marker = "Visual Features:";
                        const cleanPrev = prompt.split(marker)[0].trim();
                        const newFinalDescription = cleanPrev ? `${cleanPrev}\n\n${marker} ${analysis}` : `${marker} ${analysis}`;
                        finalDescription = newFinalDescription;
                        setPrompt(newFinalDescription);
                        setAnalyzedImageUrl(selectedDraft);
                        console.log('[UnifiedStudio] Prompt updated with analysis.');
                    }
                } catch (err) {
                    console.error('Auto-analysis during save failed:', err);
                }
            }

            if (config.mode === 'channelArt') {
                await config.onSave(selectedDraft || '', finalDescription);
            } else if (config.mode === 'thumbnail') {
                await config.onSave({
                    url: selectedDraft || '',
                    prompt: finalDescription,
                    draftHistory
                });
            } else if (config.mode === 'asset') {
                console.log('[UnifiedStudio] Calling onSave (asset mode) with description:', finalDescription);
                await config.onSave({
                    description: finalDescription,
                    taggedReferences: taggedReferences as any,
                    selectedDraft,
                    draftHistory,
                });
            } else {
                // Visual mode: auto-generate video prompt if empty
                let finalVideoPrompt = videoPrompt;
                if (!finalVideoPrompt?.trim() && prompt?.trim()) {
                    console.log('[UnifiedStudio] Auto-generating AI video prompt on save...');
                    const { assetDefinitions, existingCuts = [], initialSpeaker, initialDialogue } = config;

                    const speakerAsset = assetDefinitions ?
                        Object.values(assetDefinitions).find((a: any) => a.type === 'character' && a.name?.toLowerCase() === initialSpeaker?.toLowerCase()) as any : null;
                    const locationAsset = assetDefinitions ?
                        Object.values(assetDefinitions).find((a: any) => a.type === 'location' && prompt?.toLowerCase().includes(a.name?.toLowerCase())) as any : null;
                    const propAssets = assetDefinitions ?
                        Object.values(assetDefinitions).filter((a: any) => a.type === 'prop' && prompt?.toLowerCase().includes(a.name?.toLowerCase())) as any[] : [];
                    const currentCut = existingCuts.find(c => c.id === config.cutId);

                    const context: VideoMotionContext = {
                        visualPrompt: prompt,
                        dialogue: initialDialogue,
                        emotion: currentCut?.emotion,
                        audioDuration: currentCut?.estimatedDuration,
                        speakerInfo: speakerAsset ? { name: speakerAsset.name, visualFeatures: speakerAsset.visualSummary || speakerAsset.description, gender: speakerAsset.gender } : undefined,
                        locationInfo: locationAsset ? { name: locationAsset.name, visualFeatures: locationAsset.visualSummary || locationAsset.description } : undefined,
                        propInfo: propAssets.length > 0 ? propAssets.map(p => ({ name: p.name, visualFeatures: p.visualSummary || p.description })) : undefined
                    };

                    try {
                        finalVideoPrompt = await generateVideoMotionPrompt(context, apiKey);
                    } catch {
                        finalVideoPrompt = `${prompt}. Camera slowly pushes in. Subtle atmospheric motion.`;
                    }
                }

                console.log('[UnifiedStudio] Calling onSave (visual mode) with description:', finalDescription);
                await config.onSave({
                    visualPrompt: finalDescription,
                    visualPromptKR: promptKR,
                    videoPrompt: finalVideoPrompt,
                    finalImageUrl: selectedDraft,
                    draftHistory,
                    withBackground: false
                } as any);
            }
        } finally {
            setIsSaving(false);
        }
    }, [config, prompt, promptKR, videoPrompt, selectedDraft, draftHistory, taggedReferences, apiKey]);

    return {
        isGenerating, isExpanding, isTranslating, isChatLoading, isSaving,
        chatContainerRef,
        performTranslation,
        handleAIExpand, handleGenerate, handleChatSend, handleSave,
    };
}
