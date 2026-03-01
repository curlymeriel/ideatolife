import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateScript, DEFAULT_SCRIPT_INSTRUCTIONS, DEFAULT_VIDEO_PROMPT_INSTRUCTIONS, detectGender } from '../services/gemini';
import type { ScriptCut } from '../services/gemini';
import { generateImage } from '../services/imageGen';
import { generateSpeech, type VoiceConfig } from '../services/tts';
import { generateGeminiSpeech, getDefaultGeminiVoice, isGeminiTtsVoice, GEMINI_TTS_VOICES } from '../services/geminiTts';

import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, ArrowRight, Lock, Unlock, Settings, Mic, Image, Sparkles, Sliders, Bot } from 'lucide-react';
import { CutItem } from '../components/Production/CutItem';
import { SfxSearchModal } from '../components/Production/SfxSearchModal';
import { AiInstructionHelper } from '../components/Production/AiInstructionHelper';

import { AssistantDirectorChat } from '../components/AssistantDirectorChat';

import { getMatchedAssets } from '../utils/assetUtils';
import { linkCutsToStoryline } from '../utils/storylineUtils';
import { saveToIdb, generateCutImageKey, generateAudioKey, resolveUrl } from '../utils/imageStorage';


export const Step3_Production: React.FC = () => {
    // OPTIMIZED SELECTORS: Individual selectors prevent the entire component 
    // from re-rendering when unrelated store fields change.
    const id = useWorkflowStore(state => state.id);
    const seriesName = useWorkflowStore(state => state.seriesName);
    const episodeName = useWorkflowStore(state => state.episodeName);
    const targetDuration = useWorkflowStore(state => state.targetDuration);
    const styleAnchor = useWorkflowStore(state => state.styleAnchor);
    const apiKeys = useWorkflowStore(state => state.apiKeys);
    const script = useWorkflowStore(state => state.script);
    const ttsModel = useWorkflowStore(state => state.ttsModel);
    const imageModel = useWorkflowStore(state => state.imageModel);
    const assetDefinitions = useWorkflowStore(state => state.assetDefinitions);
    const episodePlot = useWorkflowStore(state => state.episodePlot);
    const characters = useWorkflowStore(state => state.characters);
    const episodeCharacters = useWorkflowStore(state => state.episodeCharacters);
    const seriesLocations = useWorkflowStore(state => state.seriesLocations);
    const episodeLocations = useWorkflowStore(state => state.episodeLocations);
    const masterStyle = useWorkflowStore(state => state.masterStyle);
    const aspectRatio = useWorkflowStore(state => state.aspectRatio);
    const storylineTable = useWorkflowStore(state => state.storylineTable);
    const trendInsights = useWorkflowStore(state => (state as any).trendInsights);
    const nextStep = useWorkflowStore(state => state.nextStep);

    // Aliases for backward compatibility
    const projectId = id;
    const setScript = useWorkflowStore(state => state.setScript);
    const setTtsModel = useWorkflowStore(state => state.setTtsModel);
    const setImageModel = useWorkflowStore(state => state.setImageModel);

    const navigate = useNavigate();

    // --- LOCAL STATE ---
    const [loading, setLoading] = useState(false);
    const [localScript, setLocalScript] = useState<ScriptCut[]>(script || []);
    const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
    const [audioLoading, setAudioLoading] = useState<Record<number, boolean>>({});
    const [playingAudio, setPlayingAudio] = useState<number | null>(null);
    const [showAssetSelector, setShowAssetSelector] = useState<number | null>(null);
    const [sfxModalCutId, setSfxModalCutId] = useState<number | null>(null);
    const [batchLoading, setBatchLoading] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isAiInstructionsOpen, setIsAiInstructionsOpen] = useState(false);
    const [customInstructions, setCustomInstructions] = useState(DEFAULT_SCRIPT_INSTRUCTIONS);
    const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
    const [videoPromptInstructions, setVideoPromptInstructions] = useState(DEFAULT_VIDEO_PROMPT_INSTRUCTIONS);
    const [isVideoInstructionsModalOpen, setIsVideoInstructionsModalOpen] = useState(false);

    // Ref to keep track of latest script for stable callbacks
    const localScriptRef = useRef(localScript);
    useEffect(() => {
        localScriptRef.current = localScript;
    }, [localScript]);

    // Sync localScript when store's script changes
    useEffect(() => {
        setLocalScript(prev => {
            const newScript = script || [];
            if (JSON.stringify(prev) === JSON.stringify(newScript)) return prev;

            // [DEBUG] Track dialogue line breaks during sync
            const prevBreaks = prev.filter(c => c.dialogue?.includes('\n')).length;
            const newBreaks = newScript.filter(c => c.dialogue?.includes('\n')).length;

            if (prevBreaks !== newBreaks) {
                console.log(`[Step3 Sync DEBUG] ⚠️ Dialogue \\n count changed: ${prevBreaks} → ${newBreaks}`);
            } else if (newBreaks > 0) {
                console.log(`[Step3 Sync DEBUG] ✅ Syncing script with ${newBreaks} cuts containing \\n`);
            }

            // [CRITICAL FIX] Per-cut dialogue preservation: merge new data but keep
            // local dialogue if it has more newlines than the incoming version.
            // This prevents ALL scenarios where stale/flat data overwrites user's manual line breaks.
            if (prev.length > 0) {
                const prevMap = new Map(prev.map(c => [c.id, c]));
                let anyPreserved = false;
                const merged = newScript.map(newCut => {
                    const prevCut = prevMap.get(newCut.id);
                    if (prevCut) {
                        const prevNewlines = (prevCut.dialogue?.match(/\n/g) || []).length;
                        const newNewlines = ((newCut.dialogue || '').match(/\n/g) || []).length;
                        if (prevNewlines > 0 && newNewlines < prevNewlines) {
                            console.warn(`[Step3 Sync] 🛡️ Preserving dialogue newlines for cut ${newCut.id}. Local: ${prevNewlines}, Store: ${newNewlines}`);
                            anyPreserved = true;
                            return { ...newCut, dialogue: prevCut.dialogue };
                        }
                    }
                    return newCut;
                });
                if (anyPreserved) return merged;
            }

            return newScript;
        });
    }, [projectId, script]);

    // --- PERSISTENCE HELPER ---
    const saveToStore = useCallback((currentScript: ScriptCut[]) => {
        const breaks = currentScript.filter(c => c.dialogue?.includes('\n')).length;
        console.log(`[Step3 saveToStore] 📤 Saving ${currentScript.length} cuts (${breaks} with \\n) to store.`);
        setScript(currentScript);
    }, [setScript]);

    const handleSave = useCallback(() => {
        saveToStore(localScriptRef.current);
    }, [saveToStore]);

    // [FIX] Flush local script to store on page unload/visibility-hidden
    // This ensures dialogue edits (including line breaks) are saved before navigation
    useEffect(() => {
        const flush = () => {
            saveToStore(localScriptRef.current);
        };
        const handleVisChange = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', handleVisChange);
        return () => {
            window.removeEventListener('beforeunload', flush);
            document.removeEventListener('visibilitychange', handleVisChange);
        };
    }, [saveToStore]);

    // --- DERIVED DATA ---
    const confirmedCount = useMemo(() => localScript.filter(c => {
        const hasConfirmedImage = c.isImageConfirmed && c.finalImageUrl;
        const hasConfirmedAudio = c.isAudioConfirmed && (c.audioUrl || c.speaker === 'SILENT');
        return hasConfirmedImage && hasConfirmedAudio;
    }).length, [localScript]);

    const totalCount = localScript.length;
    const progressPercent = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

    const speakerList = useMemo(() => {
        const allChars = [...(characters || []), ...(episodeCharacters || [])];
        return allChars
            .map(c => c.name)
            .filter((v, i, a) => v && a.indexOf(v) === i);
    }, [characters, episodeCharacters]);

    // --- CONSTANTS ---
    const TTS_MODELS = [
        { value: 'standard' as const, label: 'Standard', cost: '$', hint: '기본 품질, 가장 저렴한 비용' },
        { value: 'wavenet' as const, label: 'WaveNet', cost: '$$', hint: '고품질, 합리적인 비용' },
        { value: 'neural2' as const, label: 'Neural2 (다국어/일반)', cost: '$$$', hint: '피치 조절이 가능한 프리미엄 보이스 (영어 특화)' },
        { value: 'chirp3-hd' as const, label: 'Chirp 3 HD (한국어)', cost: '$$$', hint: '최신 한국어 AI 목소리 - 자연스러운 억양' },
        { value: 'gemini-tts' as const, label: 'Gemini TTS ✨', cost: '$$', hint: '자연어 연기 지시 지원 - 감정 표현 최고' },
    ];

    const IMAGE_MODELS = [
        { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash', cost: '$$$$$', hint: '최고 품질 프리미엄 이미지 생성 (가장 빠른 속도)' },
        { value: 'gemini-3-pro-image-preview', label: 'Gemini 3.0 Pro', cost: '$$$$', hint: '고품질 프리미엄 이미지 생성' },
        { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash', cost: '$$', hint: '빠른 속도, 표준 품질' },
    ];

    // Helper: Get default voice for language, gender, and TTS model
    const getDefaultVoiceForLanguage = (
        language: 'en-US' | 'ko-KR',
        gender: 'male' | 'female' | 'neutral',
        age: 'child' | 'young' | 'adult' | 'senior' = 'adult',
        model: string = ttsModel
    ): string => {
        if (language === 'ko-KR') {
            if (model === 'chirp3-hd') {
                if (gender === 'female') {
                    if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Leda';
                    if (age === 'senior') return 'ko-KR-Chirp3-HD-Kore';
                    return 'ko-KR-Chirp3-HD-Aoede';
                } else {
                    if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Puck';
                    if (age === 'senior') return 'ko-KR-Chirp3-HD-Charon';
                    return 'ko-KR-Chirp3-HD-Fenrir';
                }
            } else if (model === 'wavenet') {
                if (gender === 'female') return 'ko-KR-Wavenet-A';
                if (gender === 'male') return 'ko-KR-Wavenet-C';
                return 'ko-KR-Wavenet-B';
            } else {
                if (gender === 'female') return 'ko-KR-Standard-A';
                if (gender === 'male') return 'ko-KR-Standard-C';
                return 'ko-KR-Standard-B';
            }
        } else {
            if (model === 'neural2') {
                if (gender === 'female') {
                    if (age === 'child' || age === 'young') return 'en-US-Neural2-G';
                    if (age === 'senior') return 'en-US-Neural2-H';
                    return 'en-US-Neural2-C';
                }
                if (gender === 'male') {
                    if (age === 'child' || age === 'young') return 'en-US-Neural2-I';
                    if (age === 'senior') return 'en-US-Neural2-D';
                    return 'en-US-Neural2-J';
                }
                return 'en-US-Neural2-A';
            } else if (model === 'wavenet') {
                if (gender === 'female') return 'en-US-Wavenet-C';
                if (gender === 'male') return 'en-US-Wavenet-D';
                return 'en-US-Wavenet-A';
            } else if (model === 'chirp3-hd') {
                console.warn('Chirp 3 HD does not support English, falling back to Neural2');
                if (gender === 'female') return 'en-US-Neural2-C';
                if (gender === 'male') return 'en-US-Neural2-J';
                return 'en-US-Neural2-A';
            } else {
                if (gender === 'female') return 'en-US-Standard-C';
                if (gender === 'male') return 'en-US-Standard-D';
                return 'en-US-Standard-A';
            }
        }
    };

    // Helper: Map emotion to rate adjustment
    const getEmotionRate = (emotion?: string): string => {
        switch (emotion) {
            case 'excited': return '110%';
            case 'angry': return '115%';
            case 'sad': return '85%';
            case 'calm': return '95%';
            case 'tense': return '105%';
            default: return '100%';
        }
    };

    // Helper: Map emotion to pitch adjustment (Neural2 only)
    const getEmotionPitch = (emotion?: string, intensity?: 'low' | 'moderate' | 'high'): string => {
        const multiplier = intensity === 'high' ? 1.5 : intensity === 'low' ? 0.5 : 1;
        switch (emotion) {
            case 'excited': return `+${Math.round(2 * multiplier)}st`;
            case 'happy': return `+${Math.round(1 * multiplier)}st`;
            case 'sad': return `-${Math.round(1.5 * multiplier)}st`;
            case 'angry': return `+${Math.round(1 * multiplier)}st`;
            default: return '0st';
        }
    };

    const handleGenerateScript = async () => {
        setLoading(true);
        try {
            const allCharacters = [...(characters || []), ...(episodeCharacters || [])];
            const allLocations = [...(seriesLocations || []), ...(episodeLocations || [])];

            console.log("[Step3] Generating Script with Assets:");
            console.log("Characters:", allCharacters.map(c => `${c.name} (${c.id})`));
            console.log("Locations:", allLocations.map(l => `${l.name} (${l.id})`));
            console.log("Asset Definitions Keys:", assetDefinitions ? Object.keys(assetDefinitions) : "None");

            console.log("--- Generating Script DEBUG ---");
            console.log("Episode Plot:", episodePlot);
            console.log("Storyline Table Full:", JSON.stringify(storylineTable, null, 2));

            if (assetDefinitions) {
                console.log("Asset Definitions Preview:");
                Object.values(assetDefinitions).forEach((def: any) => {
                    console.log(`- ${def.name} (${def.type}): ${def.description.substring(0, 50)}... [Full Description check logs]`);
                    // We log the full description if it looks suspicious
                    if (def.description.length > 50) console.log(`  Full Desc (${def.name}):`, def.description);
                });
            } else {
                console.log("Asset Definitions: None/Undefined");
            }

            const generated = await generateScript(
                seriesName,
                episodeName,
                targetDuration,
                styleAnchor.prompts,
                apiKeys.gemini,
                episodePlot,
                allCharacters,
                allLocations,
                storylineTable,  // Pass storyline table
                assetDefinitions,  // NEW: Pass Step 2 asset definitions
                customInstructions, // NEW: Custom instructions
                localScript, // NEW: Pass existing script for context-aware regeneration
                imageModel, // NEW: Pass the currently selected model from state
                trendInsights // NEW: Pass trend insights for prompt enrichment
            );

            // Link cuts to storyline scenes
            const linkedScript = linkCutsToStoryline(generated, storylineTable);

            // Merge Logic Moved to Gemini.ts (ID-based stability)
            // We now trust the generated script as the source of truth, 
            // since gemini.ts handles the granular locking and merging internally.

            console.log('[Step3] Received merged script from Gemini Service:', linkedScript);

            setLocalScript(linkedScript);
            localScriptRef.current = linkedScript; // SYNC REF
            saveToStore(linkedScript);
        } catch (error) {
            console.error(error);
            // ... (keep default fallback)
            alert(`Script Generation Failed:\n${(error as any).message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };



    const handleGenerateFinalImage = useCallback(async (cutId: number, prompt: string) => {
        setImageLoading(prev => ({ ...prev, [cutId]: true }));
        try {
            console.log(`[Image ${cutId}] Visual Prompt:`, prompt);

            interface AssetRef { name: string; url: string; type: string; }
            const assetsWithImages: AssetRef[] = [];
            const matchedAssets: string[] = [];

            const currentScript = localScriptRef.current;
            const currentCut = currentScript.find(c => c.id === cutId);
            const manualAssetIds = currentCut?.referenceAssetIds || [];
            const referenceCutIds = currentCut?.referenceCutIds || [];

            // 1. Add Previous Cut Images (as background/location refs)
            referenceCutIds.forEach(refId => {
                const refCut = currentScript.find(c => c.id === refId);
                if (refCut?.finalImageUrl) {
                    assetsWithImages.push({ name: `Prev Cut #${refId}`, url: refCut.finalImageUrl, type: 'location' });
                    console.log(`[Image ${cutId}] 📸 Added PREVIOUS CUT #${refId} as reference`);
                }
            });

            // 2. FORCE ADD MANUAL ASSETS
            manualAssetIds.forEach(assetId => {
                const asset = assetDefinitions?.[assetId];
                if (asset) {
                    if (!matchedAssets.includes(asset.name)) matchedAssets.push(asset.name);
                    const imageToUse = asset.masterImage || asset.draftImage || asset.referenceImage;
                    if (imageToUse) {
                        assetsWithImages.push({ name: asset.name, url: imageToUse, type: asset.type });
                        console.log(`[Image ${cutId}] 👆 Force-adding manual asset: "${asset.name}"`);
                    }
                }
            });

            // 3. Auto-match from prompt
            const deduplicatedMatches = getMatchedAssets(prompt, [], assetDefinitions, cutId);
            deduplicatedMatches.forEach(({ asset }) => {
                if (matchedAssets.includes(asset.name)) return;
                matchedAssets.push(asset.name);
                const imageToUse = asset.masterImage || asset.draftImage || asset.referenceImage;
                if (imageToUse) {
                    assetsWithImages.push({ name: asset.name, url: imageToUse, type: asset.type });
                    console.log(`[Image ${cutId}] 🤖 Auto-matched asset: "${asset.name}"`);
                }
            });

            // 4. Speaker Auto-Match
            const speakerName = currentCut?.speaker;
            if (speakerName && speakerName !== 'Narrator' && speakerName !== 'SILENT') {
                const speakerAsset = Object.values(assetDefinitions || {}).find((a: any) =>
                    a.type === 'character' && a.name.toLowerCase() === speakerName.toLowerCase()
                );
                if (speakerAsset && !matchedAssets.includes(speakerAsset.name)) {
                    matchedAssets.push(speakerAsset.name);
                    const imageToUse = speakerAsset.masterImage || speakerAsset.draftImage || speakerAsset.referenceImage;
                    if (imageToUse) {
                        assetsWithImages.push({ name: speakerAsset.name, url: imageToUse, type: 'character' });
                    }
                }
            }

            // Combine into limited set of 4 images
            const allReferenceImages: string[] = [];
            if (currentCut?.userReferenceImage) {
                allReferenceImages.push(currentCut.userReferenceImage);
            }

            // Limit assets to ensure we don't exceed 4 total images (including user ref)
            const remainingSlot = 4 - allReferenceImages.length;
            const limitedAssets = assetsWithImages.slice(0, remainingSlot);
            limitedAssets.forEach(a => allReferenceImages.push(a.url));

            // Build Details with Explicit Reference Indexing
            let characterDetails = '';
            let locationDetails = '';
            let propDetails = '';

            matchedAssets.forEach(assetName => {
                const asset = Object.values(assetDefinitions || {}).find((a: any) => a.name === assetName);
                if (asset && asset.description) {
                    // Find if this asset has an image in the limited set
                    const imgIdx = allReferenceImages.indexOf(assetsWithImages.find(a => a.name === assetName)?.url || '');
                    const refNote = imgIdx !== -1 ? ` (Reference #${imgIdx + 1})` : '';

                    if (asset.type === 'character') {
                        characterDetails += `\n- ${asset.name}${refNote}: ${asset.description}`;
                    } else if (asset.type === 'location') {
                        locationDetails += `\n- ${asset.name}${refNote}: ${asset.description}`;
                    } else if (asset.type === 'prop') {
                        propDetails += `\n- ${asset.name}${refNote}: ${asset.description}`;
                    }
                }
            });

            let assetDetails = '';
            if (characterDetails) {
                assetDetails += `\n\n[Character Details (STRICT VISUAL REFERENCE)]${characterDetails}`;
            }
            if (locationDetails) {
                assetDetails += `\n\n[Location Details]${locationDetails}`;
            }
            if (propDetails) {
                assetDetails += `\n\n[Prop Details]${propDetails}`;
            }

            let stylePrompt = '';
            if (masterStyle?.description) {
                stylePrompt += `\n\n[Master Visual Style]\n${masterStyle.description}`;
                const hasCharacterAssets = limitedAssets.some(a => a.type === 'character');
                if (hasCharacterAssets && masterStyle.characterModifier) {
                    stylePrompt += `\n${masterStyle.characterModifier}`;
                } else if (!hasCharacterAssets && masterStyle.backgroundModifier) {
                    stylePrompt += `\n${masterStyle.backgroundModifier}`;
                }
            }

            const finalPrompt = assetDetails + stylePrompt + `\n\n[Scene Action]\n${prompt}`;

            // FIX: Resolve IDB URLs to Base64 before sending to Gemini
            const resolvedReferenceImages = await Promise.all(
                allReferenceImages.map(url => resolveUrl(url))
            );

            const result = await generateImage(
                finalPrompt,
                apiKeys.gemini,
                resolvedReferenceImages.length > 0 ? resolvedReferenceImages : undefined,
                aspectRatio,
                imageModel
            );

            // Save first image to IndexedDB and get idb:// reference URL
            const imageKey = generateCutImageKey(projectId, cutId, 'final');
            const idbUrl = await saveToIdb('images', imageKey, result.urls[0]);

            const updatedScript = currentScript.map(cut =>
                cut.id === cutId ? { ...cut, finalImageUrl: `${idbUrl}?t=${Date.now()}` } : cut
            );
            setLocalScript(updatedScript);
            localScriptRef.current = updatedScript; // SYNC REF
            saveToStore(updatedScript);

            console.log(`[Image ${cutId}] ✅ Generated and saved to IndexedDB`);
        } catch (error: any) {
            console.error(`[Image ${cutId}] ❌ Generation failed:`, error);
            alert(`이미지 생성 실패: ${error.message}`);
        } finally {
            setImageLoading(prev => ({ ...prev, [cutId]: false }));
        }
    }, [projectId, apiKeys.gemini, aspectRatio, imageModel, assetDefinitions, masterStyle, styleAnchor]);


    const handleGenerateAudio = useCallback(async (cutId: number, dialogue: string) => {
        setAudioLoading(prev => ({ ...prev, [cutId]: true }));
        try {
            console.log(`[Audio ${cutId}] Generating for dialogue:`, dialogue);

            const currentScript = localScriptRef.current;
            const currentCut = currentScript.find(c => c.id === cutId);
            const speaker = currentCut?.speaker || 'Narrator';

            // ===== GEMINI TTS BRANCH =====
            if (ttsModel === 'gemini-tts') {
                console.log(`[Audio ${cutId}] Using Gemini TTS for dialogue...`);

                // Determine language from cut metadata or auto-detect
                const rawLanguage = (currentCut?.language || detectLanguageFromText(dialogue)) as string;
                let language: 'ko-KR' | 'en-US';
                if (rawLanguage === 'ko' || rawLanguage.startsWith('ko')) {
                    language = 'ko-KR';
                } else if (rawLanguage === 'en' || rawLanguage.startsWith('en')) {
                    language = 'en-US';
                } else {
                    language = 'ko-KR'; // Default to Korean for Gemini TTS
                }

                // Get voice: check if voiceId is a valid Gemini TTS voice, otherwise use gender/age-based default
                let voiceName = currentCut?.voiceId;
                const gender = (currentCut?.voiceGender || 'female') as 'male' | 'female' | 'neutral';
                const age = (currentCut?.voiceAge || 'adult') as 'child' | 'young' | 'adult' | 'senior';

                if (!voiceName || !isGeminiTtsVoice(voiceName)) {
                    voiceName = getDefaultGeminiVoice(gender, age);
                    console.log(`[Audio ${cutId}] Using default Gemini voice: ${voiceName} (${gender}, ${age})`);
                } else {
                    console.log(`[Audio ${cutId}] Using assigned Gemini voice: ${voiceName}`);
                }

                // Build config with acting direction and volume/rate from UI
                const geminiConfig = {
                    voiceName,
                    languageCode: language,
                    actingDirection: currentCut?.actingDirection,
                    volume: currentCut?.voiceVolume ? parseFloat(String(currentCut.voiceVolume)) : 1.0,
                    rate: currentCut?.voiceSpeed ? parseFloat(String(currentCut.voiceSpeed)) : 1.0
                };

                console.log(`[Audio ${cutId}] Gemini TTS Config:`, geminiConfig);

                const audioData = await generateGeminiSpeech(dialogue, apiKeys.gemini, geminiConfig);

                // Save to IndexedDB to keep state clean
                const audioKey = generateAudioKey(projectId, cutId);
                const idbAudioUrl = await saveToIdb('audio', audioKey, audioData);
                const cacheBustedUrl = `${idbAudioUrl}?t=${Date.now()}`;

                console.log(`[Audio ${cutId}] Gemini TTS generated and saved to IDB: ${cacheBustedUrl}`);

                setLocalScript(prev => {
                    const updated = prev.map(cut =>
                        cut.id === cutId ? {
                            ...cut,
                            audioUrl: cacheBustedUrl,
                            language,
                            voiceId: voiceName,
                            voiceGender: gender,
                            voiceAge: age,
                            voiceSpeed: geminiConfig.rate,
                            voiceVolume: String(geminiConfig.volume)
                        } as ScriptCut : cut
                    );
                    localScriptRef.current = updated; // SYNC REF
                    saveToStore(updated);
                    return updated;
                });
                return; // Exit early for Gemini TTS
            }

            // ===== CLOUD TTS BRANCH (existing logic) =====
            // 1. Determine language based on TTS model selection and dialogue content
            // If user selected Chirp 3 HD (Korean model), force Korean language
            // If user selected Neural2 (English model), force English language
            let language: 'en-US' | 'ko-KR';

            if (ttsModel === 'chirp3-hd') {
                // User explicitly selected Korean model
                language = 'ko-KR';
                console.log(`[Audio ${cutId}] Using Korean (ko-KR) based on TTS model selection: ${ttsModel}`);
            } else if (ttsModel === 'neural2') {
                // User explicitly selected English Neural2 model
                language = 'en-US';
                console.log(`[Audio ${cutId}] Using English (en-US) based on TTS model selection: ${ttsModel}`);
            } else {
                // For standard/wavenet, auto-detect from cut metadata or dialogue text
                const rawLanguage = (currentCut?.language || detectLanguageFromText(dialogue)) as string;
                if (rawLanguage === 'ko' || rawLanguage.startsWith('ko')) {
                    language = 'ko-KR';
                } else if (rawLanguage === 'en' || rawLanguage.startsWith('en')) {
                    language = 'en-US';
                } else {
                    language = 'en-US'; // Default fallback
                }
                console.log(`[Audio ${cutId}] Auto-detected language: ${language}`);
            }


            // 2. Find character voice settings or use defaults
            const allCharacters = [...(characters || []), ...(episodeCharacters || [])];
            const character = allCharacters.find(c => c.name.toLowerCase() === speaker.toLowerCase());

            // Priority for voice gender:
            // 1. Manual override from cut (if not 'neutral'/auto)
            // 2. Character definition from Step 1
            // 3. Name-based detection as fallback
            let genderToUse: 'male' | 'female' | 'neutral';
            if (currentCut?.voiceGender && currentCut.voiceGender !== 'neutral') {
                // Manual override takes highest priority
                genderToUse = currentCut.voiceGender;
                console.log(`[Audio ${cutId}] Using manual gender override: ${genderToUse}`);
            } else if (character?.gender && character.gender !== 'other') {
                // Use character definition from Step 1
                genderToUse = character.gender as 'male' | 'female';
                console.log(`[Audio ${cutId}] Using character gender from Step 1: ${genderToUse} (${character.name})`);
            } else {
                // Fallback to name-based detection
                genderToUse = detectGender(speaker);
                console.log(`[Audio ${cutId}] Using name-based gender detection: ${genderToUse}`);
            }

            // Priority for voice selection: 
            // 1. Manual override from cut (voiceId) - Set via Bulk Settings
            // 2. Character default voice from Step 1
            let voiceName = currentCut?.voiceId || character?.voiceId;

            // Validate voice-language compatibility
            if (voiceName) {
                const isKoreanVoice = voiceName.startsWith('ko-'); // Capture ko-KR, etc.
                const isEnglishVoice = voiceName.startsWith('en-'); // Capture en-US, en-GB, etc.

                if (language === 'ko-KR' && isEnglishVoice) {
                    console.warn(`[Audio ${cutId}] ⚠️ Language mismatch: Text is Korean, Voice is English (${voiceName}). Switching to default Korean voice.`);
                    voiceName = undefined;
                } else if (language === 'en-US' && isKoreanVoice) {
                    console.warn(`[Audio ${cutId}] ⚠️ Language mismatch: Text is English, Voice is Korean (${voiceName}). Switching to default English voice.`);
                    voiceName = undefined;
                }
            }

            // Determine voice age: 1. Manual override, 2. Character age from Step 1, 3. Default 'adult'
            let ageToUse: 'child' | 'young' | 'adult' | 'senior' = 'adult';
            if (currentCut?.voiceAge) {
                ageToUse = currentCut.voiceAge;
                console.log(`[Audio ${cutId}] Using manual age override: ${ageToUse}`);
            } else if (character?.age) {
                ageToUse = character.age;
                console.log(`[Audio ${cutId}] Using character age from Step 1: ${ageToUse} (${character.name})`);
            }

            if (!voiceName) {
                voiceName = getDefaultVoiceForLanguage(
                    language,
                    genderToUse,
                    ageToUse
                );
            }

            // 3. Determine model type
            const isChirp3 = voiceName.includes('Chirp3-HD');
            const model = isChirp3 ? 'chirp3-hd' : 'neural2';

            // 4. Build voice config with emotion-based prosody
            const voiceConfig: VoiceConfig = {
                language,
                rate: currentCut?.voiceSpeed ? `${Math.round(currentCut.voiceSpeed * 100)}%` : getEmotionRate(currentCut?.emotion),
                volume: currentCut?.emotionIntensity === 'high' ? '+3dB' : currentCut?.emotionIntensity === 'low' ? '-3dB' : undefined
            };

            // Add pitch only for Neural2 (not Chirp 3 HD)
            if (!isChirp3) {
                voiceConfig.pitch = getEmotionPitch(currentCut?.emotion, currentCut?.emotionIntensity);
            }

            console.log(`[Audio ${cutId}] Voice: ${voiceName}, Model: ${model}, Language: ${language}`);
            console.log(`[Audio ${cutId}] Emotion: ${currentCut?.emotion || 'neutral'} (${currentCut?.emotionIntensity || 'moderate'})`);
            console.log(`[Audio ${cutId}] Rate: ${voiceConfig.rate} (${currentCut?.voiceSpeed ? 'Manual' : 'Auto from Emotion'})`);
            console.log(`[Audio ${cutId}] VoiceConfig:`, voiceConfig);

            const apiKeyToUse = (apiKeys.googleCloud || apiKeys.gemini)?.trim() || '';
            const audioDataUrl = await generateSpeech(dialogue, voiceName, apiKeyToUse, model, voiceConfig);

            // Save to IndexedDB
            const audioKey = generateAudioKey(projectId, cutId);
            const idbAudioUrl = await saveToIdb('audio', audioKey, audioDataUrl);
            const cacheBustedUrl = `${idbAudioUrl}?t=${Date.now()}`;

            console.log(`[Audio ${cutId}] Generated and saved to IDB: ${cacheBustedUrl}`);

            setLocalScript(prev => {
                const updated = prev.map(cut =>
                    cut.id === cutId ? {
                        ...cut,
                        audioUrl: cacheBustedUrl,
                        language,
                        voiceId: voiceName,
                        emotion: currentCut?.emotion,
                        emotionIntensity: currentCut?.emotionIntensity,
                        voiceGender: genderToUse as any,
                        voiceAge: (currentCut?.voiceAge || 'adult') as any,
                        voiceSpeed: currentCut?.voiceSpeed
                    } as ScriptCut : cut
                );
                localScriptRef.current = updated; // SYNC REF
                saveToStore(updated);
                return updated;
            });
        } catch (error: any) {
            console.error(`[Audio ${cutId}] Failed:`, error);
            alert(`Audio generation failed: ${error.message}`);
        } finally {
            setAudioLoading(prev => ({ ...prev, [cutId]: false }));
        }
    }, [apiKeys.googleCloud, apiKeys.gemini, characters, episodeCharacters, ttsModel]);


    // ESC key handler for AI Instructions modals
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isInstructionsModalOpen) setIsInstructionsModalOpen(false);
                if (isVideoInstructionsModalOpen) setIsVideoInstructionsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isInstructionsModalOpen, isVideoInstructionsModalOpen]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (playingAudio !== null) {
                const currentAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement;
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
            }
        };
    }, [playingAudio]);

    const handlePlayAudio = useCallback((cutId: number) => {
        const currentScript = localScriptRef.current;
        const cut = currentScript.find(c => c.id === cutId);
        if (!cut?.audioUrl) return;

        // Stop current audio if playing
        if (playingAudio !== null) {
            const currentAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement;
            currentAudio?.pause();
            if (currentAudio) {
                currentAudio.currentTime = 0;
            }
        }

        // Handle mock beep
        if (cut.audioUrl === 'mock:beep') {
            console.log(`[Audio ${cutId}] Playing mock beep`);
            try {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);

                osc.start();
                setPlayingAudio(cutId);

                setTimeout(() => {
                    osc.stop();
                    ctx.close();
                    setPlayingAudio(null);
                }, 500);
            } catch (e) {
                console.error('[Audio] Failed to play mock beep:', e);
            }
            return;
        }

        // Play actual audio
        const audio = document.getElementById(`audio-${cutId}`) as HTMLAudioElement;
        if (!audio) {
            console.error(`[Audio ${cutId}] ❌ Audio element not found in DOM!`);
            alert(`오디오 엘리먼트를 찾을 수 없습니다 (Cut #${cutId}). 다시 시도해 주세요.`);
            return;
        }

        console.log(`[Audio ${cutId}] ⏯️ Playback requested. Current State:`, {
            src: audio.src.substring(0, 50) + '...',
            readyState: audio.readyState,
            paused: audio.paused,
            currentTime: audio.currentTime
        });

        if (playingAudio === cutId) {
            audio.pause();
            audio.currentTime = 0;
            setPlayingAudio(null);
        } else {
            // Ensure audio is loaded
            audio.load();

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`[Audio ${cutId}] ▶️ Playback started successfully`);
                }).catch((error) => {
                    // Ignore AbortError (happens when clicking fast)
                    if (error.name !== 'AbortError') {
                        console.error(`[Audio ${cutId}] ❌ Playback failed:`, error);
                        alert(`재생 실패: ${error.message}`);
                    }
                    setPlayingAudio(null);
                });
            }

            setPlayingAudio(cutId);
            audio.onended = () => {
                console.log(`[Audio ${cutId}] ⏹️ Playback ended`);
                setPlayingAudio(null);
            };
            audio.onerror = () => {
                console.error(`[Audio ${cutId}] ❌ Element error:`, audio.error);
                setPlayingAudio(null);
            };
        }
    }, [playingAudio]);

    const handleApprove = () => {
        setScript(localScript);
        nextStep();
        navigate('/step/4');
    };

    // --- BULK AUDIO SETTINGS ---
    const [sampleLoading, setSampleLoading] = useState<string | null>(null);

    // Derived Speaker Map for Bulk Settings
    const { speakers, currentLanguage, currentSpeed } = useMemo(() => {
        const speakerMap = new Map<string, { gender?: string; age?: string; voiceId?: string; voiceSpeed?: number; language?: string; cutCount: number }>();
        const speakerCuts = new Map<string, ScriptCut[]>();

        localScript.forEach(cut => {
            const s = cut.speaker || 'Narrator';
            if (s === 'SILENT') return;
            if (!speakerCuts.has(s)) speakerCuts.set(s, []);
            speakerCuts.get(s)!.push(cut);
        });

        speakerCuts.forEach((cuts, speaker) => {
            const primaryCut = cuts.find(c => !c.isAudioConfirmed && !c.isConfirmed) || cuts[0];
            speakerMap.set(speaker, {
                gender: primaryCut.voiceGender,
                age: primaryCut.voiceAge,
                voiceId: primaryCut.voiceId,
                voiceSpeed: primaryCut.voiceSpeed,
                language: primaryCut.language,
                cutCount: cuts.length
            });
        });

        return {
            speakers: Array.from(speakerMap.entries()),
            currentLanguage: localScript[0]?.language || '',
            currentSpeed: localScript[0]?.voiceSpeed || ''
        };
    }, [localScript]);

    // Voice Options Derived from Models
    const { VOICE_OPTIONS } = useMemo(() => {
        const geminiOps = [
            {
                optgroup: '✨ Gemini TTS - 여성 (Female)',
                options: GEMINI_TTS_VOICES
                    .filter(v => v.gender === 'female')
                    .map(v => ({ value: v.id, label: `♀ ${v.label} - ${v.style}`, gender: v.gender, lang: 'multilingual' }))
            },
            {
                optgroup: '✨ Gemini TTS - 남성 (Male)',
                options: GEMINI_TTS_VOICES
                    .filter(v => v.gender === 'male')
                    .map(v => ({ value: v.id, label: `♂ ${v.label} - ${v.style}`, gender: v.gender, lang: 'multilingual' }))
            }
        ];

        const cloudOps = [
            {
                optgroup: '🇰🇷 Korean (Standard)',
                options: [
                    { value: 'ko-KR-Standard-A', label: '♀ Standard-A (여성)', gender: 'female', lang: 'ko-KR' },
                    { value: 'ko-KR-Standard-C', label: '♂ Standard-C (남성)', gender: 'male', lang: 'ko-KR' },
                ]
            },
            {
                optgroup: '🇰🇷 Korean (WaveNet)',
                options: [
                    { value: 'ko-KR-Wavenet-A', label: '♀ WaveNet-A (여성)', gender: 'female', lang: 'ko-KR' },
                    { value: 'ko-KR-Wavenet-B', label: '♀ WaveNet-B (여성, 차분함)', gender: 'female', lang: 'ko-KR' },
                    { value: 'ko-KR-Wavenet-C', label: '♂ WaveNet-C (남성)', gender: 'male', lang: 'ko-KR' },
                    { value: 'ko-KR-Wavenet-D', label: '♂ WaveNet-D (남성, 중후함)', gender: 'male', lang: 'ko-KR' },
                ]
            },
            {
                optgroup: '🇰🇷 Korean (Neural2)',
                options: [
                    { value: 'ko-KR-Neural2-A', label: '♀ Neural2-A (여성)', gender: 'female', lang: 'ko-KR' },
                    { value: 'ko-KR-Neural2-B', label: '♀ Neural2-B (여성)', gender: 'female', lang: 'ko-KR' },
                    { value: 'ko-KR-Neural2-C', label: '♂ Neural2-C (남성)', gender: 'male', lang: 'ko-KR' },
                ]
            }
        ];

        const combined = [...geminiOps, ...cloudOps];
        const flat = combined.flatMap(g => g.options);
        return { VOICE_OPTIONS: combined, FLAT_VOICE_OPTIONS: flat };
    }, []);

    // Helper: Auto-detect language from dialogue text
    const detectLanguageFromText = (text: string): 'en-US' | 'ko-KR' => {
        const koreanRegex = /[\u3131-\uD79D]/;
        return koreanRegex.test(text) ? 'ko-KR' : 'en-US';
    };

    // --- HANDLERS ---


    const playVoiceSample = useCallback(async (voiceId: string) => {
        const VOICE_SAMPLES: Record<string, string> = {
            'ko-KR-Chirp3-HD-Puck': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Puck.wav',
            'ko-KR-Neural2-A': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Neural2-A.wav',
            'ko-KR-Standard-A': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-A.wav',
        };

        const sampleUrl = VOICE_SAMPLES[voiceId];
        if (sampleUrl) {
            new Audio(sampleUrl).play().catch(e => console.warn('Sample playback failed:', e));
            return;
        }

        if (!apiKeys?.gemini) return alert('Gemini API 키가 필요합니다.');
        setSampleLoading(voiceId);
        try {
            const sampleText = '안녕하세요, 저는 이 목소리의 샘플입니다.';
            const result = await generateSpeech(sampleText, voiceId, apiKeys.gemini, 'gemini-tts');
            const audio = new Audio(result);
            await audio.play();
        } catch (error: any) {
            alert(`샘플 생성 실패: ${error.message}`);
        } finally {
            setSampleLoading(null);
        }
    }, [apiKeys?.gemini]);



    // --- BULK HELPERS ---
    const applyToAll = useCallback((field: string, value: any) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => ({ ...cut, [field]: value }));
            localScriptRef.current = updated; // SYNC REF
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const applyToSpeaker = useCallback((speaker: string, field: string, value: any) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => cut.speaker === speaker ? { ...cut, [field]: value } : cut);
            localScriptRef.current = updated; // SYNC REF
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const applyVoiceToSpeaker = useCallback((speaker: string, voiceId: string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => cut.speaker === speaker ? { ...cut, voiceName: voiceId, voiceId } : cut);
            localScriptRef.current = updated; // SYNC REF
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const handleBulkGenerateAudio = useCallback(async (speaker: string) => {
        const cutsToGenerate = localScriptRef.current.filter(c => c.speaker === speaker && !c.isAudioConfirmed && c.dialogue);
        if (cutsToGenerate.length === 0) return alert('생성할 컷이 없거나 모두 잠겨있습니다.');

        setBatchLoading(true);
        try {
            for (const cut of cutsToGenerate) {
                await handleGenerateAudio(cut.id, cut.dialogue);
            }
            alert(`${speaker}의 오디오 생성이 완료되었습니다.`);
        } catch (e) {
            console.error('Bulk audio error:', e);
        } finally {
            setBatchLoading(false);
        }
    }, [handleGenerateAudio, localScriptRef, setBatchLoading]);

    const handleBatchGenerate = useCallback(async () => {
        const cutsToGenerate = localScriptRef.current.filter(c => {
            const needsAudio = !c.audioUrl && c.speaker !== 'SILENT' && !c.isAudioConfirmed;
            const needsImage = !c.finalImageUrl && !c.isImageConfirmed;
            return needsAudio || needsImage;
        });
        if (cutsToGenerate.length === 0) return alert('이미 모든 자산이 생성되었거나 잠겨 있습니다.');

        if (!confirm(`${cutsToGenerate.length}개 컷의 누락된 자산을 일괄 생성하시겠습니까?`)) return;

        setBatchLoading(true);
        try {
            for (const cut of cutsToGenerate) {
                // Generate Audio if missing (and not silent and not locked)
                if (!cut.audioUrl && cut.speaker !== 'SILENT' && cut.dialogue && !cut.isAudioConfirmed) {
                    await handleGenerateAudio(cut.id, cut.dialogue);
                }
                // Generate Image if missing (and not locked)
                if (!cut.finalImageUrl && !cut.isImageConfirmed) {
                    await handleGenerateFinalImage(cut.id, cut.visualPrompt || '');
                }
            }
            alert('일괄 생성이 완료되었습니다.');
        } catch (e: any) {
            console.error('Batch generation error:', e);
            alert(`일괄 생성 중 오류 발생: ${e.message}`);
        } finally {
            setBatchLoading(false);
        }
    }, [handleGenerateAudio, handleGenerateFinalImage, setBatchLoading]);


    const handleBulkLockAudio = useCallback((speaker: string, lock: boolean) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => cut.speaker === speaker ? { ...cut, isAudioConfirmed: lock } : cut);
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const handleUpdateCut = useCallback(async (id: number, updates: Partial<ScriptCut>) => {
        let finalUpdates = { ...updates };

        // [STABILITY FIX] If Studio sends raw data: URLs (Base64), save to IDB first
        // to prevent large JSON payloads from crashing the save/sync engine.
        // This mirrors the logic in handleGenerateFinalImage that is already working reliably.
        if (finalUpdates.finalImageUrl?.startsWith('data:')) {
            try {
                const key = generateCutImageKey(projectId, id, 'final');
                const idbUrl = await saveToIdb('images', key, finalUpdates.finalImageUrl);
                finalUpdates.finalImageUrl = idbUrl;
                console.log(`[handleUpdateCut] Pre-saved final image to IDB for cut ${id}`);
            } catch (e) {
                console.error(`[handleUpdateCut] Failed to pre-save final image to IDB for cut ${id}:`, e);
            }
        }

        if (finalUpdates.draftImageUrl?.startsWith('data:')) {
            try {
                const key = generateCutImageKey(projectId, id, 'draft');
                const idbUrl = await saveToIdb('images', key, finalUpdates.draftImageUrl);
                finalUpdates.draftImageUrl = idbUrl;
                console.log(`[handleUpdateCut] Pre-saved draft image to IDB for cut ${id}`);
            } catch (e) {
                console.error(`[handleUpdateCut] Failed to pre-save draft image to IDB for cut ${id}:`, e);
            }
        }

        setLocalScript(prev => {
            const targetId = Number(id);
            const updated = prev.map(cut =>
                Number(cut.id) === targetId ? { ...cut, ...finalUpdates } : cut
            );
            // IMMUTABLE UPDATE: Also update the ref immediately so subsequent handleSave calls
            // see the newest data even if the component hasn't re-rendered yet.
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [projectId, saveToStore]);

    const handleUploadUserReference = useCallback(async (cutId: number, file: File) => {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                if (!base64) return;
                const storageKey = `cut-${cutId}-userref`;
                const idbUrl = await saveToIdb('images', storageKey, base64, { compress: true, maxWidth: 1024 });
                handleUpdateCut(cutId, { userReferenceImage: idbUrl });
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Failed to upload reference:", error);
        }
    }, [handleUpdateCut, saveToIdb]);

    const toggleAudioConfirm = useCallback((cutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (Number(cut.id) === Number(cutId)) {
                    // [MIGRATION] Handle legacy isConfirmed flag by migrating it to granular locks
                    const currentLock = cut.isAudioConfirmed ?? !!cut.isConfirmed;
                    return {
                        ...cut,
                        isAudioConfirmed: !currentLock,
                        // If we are touching granular locks, ensure legacy flag is cleared to avoid confusion
                        isConfirmed: false
                    };
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const toggleImageConfirm = useCallback((cutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (Number(cut.id) === Number(cutId)) {
                    // [MIGRATION] Handle legacy isConfirmed flag
                    const currentLock = cut.isImageConfirmed ?? !!cut.isConfirmed;
                    const newIsConfirmed = !currentLock;

                    let updates: Partial<typeof cut> = {
                        isImageConfirmed: newIsConfirmed,
                        isConfirmed: false // Clear legacy flag
                    };

                    if (newIsConfirmed && !cut.videoPrompt) {
                        const basePrompt = cut.visualPrompt || '';
                        const motionSuffix = '. Camera slowly pushes in. Subtle atmospheric motion.';
                        updates.videoPrompt = basePrompt + motionSuffix;
                    }
                    return { ...cut, ...updates };
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const addAssetToCut = useCallback((cutId: number, assetId: string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (Number(cut.id) === Number(cutId)) {
                    const currentAssets = cut.referenceAssetIds || [];
                    if (!currentAssets.includes(assetId)) {
                        return { ...cut, referenceAssetIds: [...currentAssets, assetId] };
                    }
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
        setShowAssetSelector(null);
    }, [saveToStore, setShowAssetSelector]);

    const removeAssetFromCut = useCallback((cutId: number, assetId: string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (Number(cut.id) === Number(cutId)) {
                    return {
                        ...cut,
                        referenceAssetIds: (cut.referenceAssetIds || []).filter(id => id !== assetId)
                    };
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const addCutReference = useCallback((cutId: number | string, refCutId: number | string) => {
        console.log(`[addCutReference] Called with cutId=${cutId} (type: ${typeof cutId}), refCutId=${refCutId} (type: ${typeof refCutId})`);
        setLocalScript(prev => {
            console.log(`[addCutReference] Current script cut ids:`, prev.map(c => `${c.id}(type:${typeof c.id})`));
            const updated = prev.map(cut => {
                if (String(cut.id) === String(cutId)) {
                    const currentRefs = cut.referenceCutIds || [];
                    console.log(`[addCutReference] MATCH found for cut ${cut.id}. Current refs:`, currentRefs, `Adding:`, refCutId);
                    if (!currentRefs.map(String).includes(String(refCutId))) {
                        return { ...cut, referenceCutIds: [...currentRefs, refCutId] };
                    } else {
                        console.log(`[addCutReference] refCutId ${refCutId} already in refs, skipping`);
                    }
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
        setShowAssetSelector(null);
    }, [saveToStore, setShowAssetSelector]);

    const removeCutReference = useCallback((cutId: number | string, refCutId: number | string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (String(cut.id) === String(cutId)) {
                    return {
                        ...cut,
                        referenceCutIds: (cut.referenceCutIds || []).filter(id => String(id) !== String(refCutId))
                    };
                }
                return cut;
            });
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const handleDeleteCut = useCallback((id: number) => {
        setLocalScript(prev => {
            const updated = prev.filter(cut => Number(cut.id) !== Number(id));
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const handleMoveCut = useCallback((id: number, direction: 'up' | 'down') => {
        setLocalScript(prev => {
            const targetId = Number(id);
            const index = prev.findIndex(c => Number(c.id) === targetId);
            if (index === -1) return prev;
            if (direction === 'up' && index === 0) return prev;
            if (direction === 'down' && index === prev.length - 1) return prev;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            const updated = [...prev];
            [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const handleInsertCut = useCallback((id: number) => {
        const state = useWorkflowStore.getState();
        const nextId = state.nextCutId || 1;

        setLocalScript(prev => {
            const index = prev.findIndex(c => Number(c.id) === Number(id));
            if (index === -1) return prev;

            const newCut: ScriptCut = {
                id: nextId,
                speaker: 'Narrator',
                dialogue: '',
                visualPrompt: '',
                estimatedDuration: 3
            };
            const updated = [...prev];
            updated.splice(index + 1, 0, newCut);
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const lockAllAudio = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => (cut.audioUrl || cut.speaker === 'SILENT') ? { ...cut, isAudioConfirmed: true } : cut);
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const unlockAllAudio = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => ({ ...cut, isAudioConfirmed: false }));
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const lockAllImages = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => cut.finalImageUrl ? { ...cut, isImageConfirmed: true } : cut);
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const unlockAllImages = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => ({ ...cut, isImageConfirmed: false }));
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);

    const audioLockedCount = localScript.filter(c => c.isAudioConfirmed).length;
    const imageLockedCount = localScript.filter(c => c.isImageConfirmed).length;
    const audioGeneratedCount = localScript.filter(c => c.audioUrl).length;
    const imageGeneratedCount = localScript.filter(c => c.finalImageUrl).length;

    const handleRemoveSfx = useCallback((id: number) => {
        setLocalScript(prev => {
            const updated = prev.map(c =>
                Number(c.id) === Number(id) ? { ...c, sfxUrl: undefined, sfxName: undefined, sfxVolume: undefined, sfxFreesoundId: undefined, sfxDescription: undefined } : c
            );
            localScriptRef.current = updated;
            saveToStore(updated);
            return updated;
        });
    }, [saveToStore]);


    return (
        <>
            <div className="flex gap-6 h-[calc(100vh-120px)]">
                {/* LEFT SIDEBAR - widened to 30% / max 420px for better visibility */}
                <div className="w-[30%] min-w-[320px] max-w-[420px] flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">

                    {/* Header with Stats */}
                    <div className="glass-panel p-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Production</h2>
                                    <p className="text-xs text-[var(--color-text-muted)] mt-1">컷별로 자산(오디오,이미지)을 생성하고 준비되면 확정하세요.</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <button
                                        onClick={handleGenerateScript}
                                        disabled={loading}
                                        className="px-3 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shrink-0 shadow-md"
                                        title={localScript.length > 0 ? 'Regenerate Script' : 'Generate Script'}
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                                        <span className="hidden sm:inline">Script</span>
                                    </button>
                                    {localScript.length > 0 && (
                                        <div className="text-right">
                                            <div className="text-xs font-bold text-[var(--color-primary)]">{progressPercent}% Ready</div>
                                            <div className="text-[10px] text-[var(--color-text-muted)]">{confirmedCount}/{totalCount} confirmed</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Batch Generation Button */}
                            {localScript.length > 0 && (progressPercent < 100) && (
                                <button
                                    onClick={handleBatchGenerate}
                                    disabled={batchLoading || loading}
                                    className="w-full mt-2 py-2 bg-gradient-to-r from-[var(--color-primary)] to-[#FF9A5C] text-black text-xs font-bold rounded-lg flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                                >
                                    {batchLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                                    미생성 자산 일괄 생성하기 ({localScript.filter(c => (!c.audioUrl && c.speaker !== 'SILENT') || !c.finalImageUrl).length})
                                </button>
                            )}

                            {/* Bulk Lock Buttons - Inside header for visibility before regeneration */}
                            {localScript.length > 0 && (
                                <div className="pt-3 border-t border-white/5 flex gap-4">
                                    {/* Left Side: Title & Description */}
                                    <div className="flex-1 flex flex-col justify-center gap-1">
                                        <span className="text-[10px] uppercase tracking-widest font-black text-[var(--color-primary)] opacity-80 flex items-center gap-2">
                                            <Lock size={10} />
                                            이미 생성된 자산 일괄 잠금/해제
                                        </span>
                                        <span className="text-[10px] text-gray-500 pl-3.5 leading-snug">
                                            - 스크립트 재생성 전, 유지하고 싶은 자산을 잠금 설정하세요.
                                        </span>
                                    </div>

                                    {/* Right Side: Controls */}
                                    <div className="flex-1 flex flex-col gap-2 justify-center">
                                        {/* Row 1: Audio */}
                                        <div className="flex items-center justify-end gap-3">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Audio ({audioLockedCount}/{audioGeneratedCount})</span>
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={lockAllAudio}
                                                    className="w-7 h-7 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                    title="일괄 잠금"
                                                >
                                                    <Lock size={12} strokeWidth={2.5} />
                                                </button>
                                                <button
                                                    onClick={unlockAllAudio}
                                                    className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                    title="일괄 해제"
                                                >
                                                    <Unlock size={12} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Row 2: Image */}
                                        <div className="flex items-center justify-end gap-3">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Image ({imageLockedCount}/{imageGeneratedCount})</span>
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={lockAllImages}
                                                    className="w-7 h-7 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                    title="일괄 잠금"
                                                >
                                                    <Lock size={12} strokeWidth={2.5} />
                                                </button>
                                                <button
                                                    onClick={unlockAllImages}
                                                    className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                    title="일괄 해제"
                                                >
                                                    <Unlock size={12} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* INTEGRATED PRODUCTION SETTINGS */}
                    <div className="glass-panel p-4 space-y-5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                <Settings size={14} className="text-white" />
                                이미지/오디오 생성 AI모델 세팅
                            </span>
                        </div>

                        <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                            <div className="flex items-center gap-1.5 pt-2 justify-end">
                                <Image size={11} className="text-white" />
                                <span className="text-[11px] text-white font-bold uppercase tracking-wider">이미지</span>
                            </div>
                            <div className="space-y-1">
                                <select
                                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                    value={imageModel}
                                    onChange={(e) => setImageModel(e.target.value as any)}
                                >
                                    {IMAGE_MODELS.map(model => (
                                        <option key={model.value} value={model.value}>
                                            {model.label} {model.cost}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-[var(--color-text-muted)] block">
                                    {IMAGE_MODELS.find(m => m.value === imageModel)?.hint}
                                </span>
                            </div>
                        </div>

                        <div className="h-px bg-white/5 my-2" />

                        <div className="grid grid-cols-[70px_1fr] gap-3 items-start">
                            <div className="flex items-center gap-1.5 pt-2 justify-end">
                                <Mic size={11} className="text-white" />
                                <span className="text-[11px] text-white font-bold uppercase tracking-wider">오디오</span>
                            </div>
                            <div className="space-y-1">
                                <select
                                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                    value={ttsModel}
                                    onChange={(e) => setTtsModel(e.target.value as any)}
                                >
                                    {TTS_MODELS.map(model => (
                                        <option key={model.value} value={model.value}>
                                            {model.label} {model.cost}
                                        </option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-[var(--color-text-muted)] block mb-3">
                                    {TTS_MODELS.find(m => m.value === ttsModel)?.hint}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* BULK AUDIO SUB-PANEL - MOVED OUT OF GRID to use full sidebar width */}
                    {localScript.length > 0 && (
                        <div className="mt-2 p-3 bg-black/20 rounded-lg border border-white/5 space-y-3">
                            <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1 uppercase tracking-wider">
                                <Sliders size={11} className="text-white" />
                                <span className="text-[11px] text-white font-bold uppercase tracking-wider">일괄 오디오 세팅</span>
                            </div>

                            {/* Global Settings */}
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                    value={currentLanguage}
                                    onChange={(e) => applyToAll('language', e.target.value || undefined)}
                                >
                                    <option value="">🌐 언어: 자동</option>
                                    <option value="ko-KR">🇰🇷 한국어</option>
                                    <option value="en-US">🇺🇸 영어</option>
                                </select>
                                <select
                                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                    value={currentSpeed}
                                    onChange={(e) => applyToAll('voiceSpeed', e.target.value ? parseFloat(e.target.value) : undefined)}
                                >
                                    <option value="">⚡ 속도: 자동</option>
                                    <option value="0.85">85% 느리게</option>
                                    <option value="1.0">100% 보통</option>
                                    <option value="1.15">115% 빠르게</option>
                                </select>
                            </div>

                            {/* Per Speaker */}

                            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                                <div className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold">화자별 보이스 설정</div>
                                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                                    {speakers.map(([speaker, settings]) => {
                                        const currentVoice = settings.voiceId || getDefaultGeminiVoice(settings.gender);
                                        return (
                                            <div key={speaker} className="bg-[var(--color-surface)] p-2 rounded border border-[var(--color-border)] space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex-1 text-xs text-white truncate font-medium" title={speaker}>{speaker}</span>
                                                    <span className="text-[10px] text-gray-500">{settings.cutCount} cuts</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="flex-1 space-y-1">
                                                        <select
                                                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] text-white outline-none"
                                                            value={currentVoice}
                                                            onChange={(e) => applyVoiceToSpeaker(speaker, e.target.value)}
                                                        >
                                                            {VOICE_OPTIONS.map(group => (
                                                                <optgroup key={group.optgroup} label={group.optgroup}>
                                                                    {group.options.map(v => (
                                                                        <option key={v.value} value={v.value}>{v.label}</option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                        <div className="flex gap-1">
                                                            <select
                                                                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[9px] text-gray-400 outline-none"
                                                                value={settings.voiceSpeed ?? ''}
                                                                onChange={(e) => applyToSpeaker(speaker, 'voiceSpeed', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                            >
                                                                <option value="">속도: 자동</option>
                                                                <option value="0.8">0.8x</option>
                                                                <option value="0.9">0.9x</option>
                                                                <option value="1.0">1.0x</option>
                                                                <option value="1.1">1.1x</option>
                                                            </select>
                                                            <select
                                                                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[9px] text-gray-400 outline-none"
                                                                value={settings.age || 'adult'}
                                                                onChange={(e) => applyToSpeaker(speaker, 'voiceAge', e.target.value)}
                                                            >
                                                                <option value="child">Child</option>
                                                                <option value="young">Young</option>
                                                                <option value="adult">Adult</option>
                                                                <option value="senior">Senior</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => playVoiceSample(currentVoice || '')}
                                                        disabled={sampleLoading === currentVoice}
                                                        className={`px-2 py-2 rounded text-[12px] font-bold self-start transition-all ${sampleLoading === currentVoice
                                                            ? 'bg-gray-500/20 text-gray-400 cursor-wait animate-pulse'
                                                            : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30'
                                                            }`}
                                                        title={sampleLoading === currentVoice ? 'Generating sample...' : 'Play voice sample'}
                                                    >
                                                        {sampleLoading === currentVoice ? '⏳' : '🔊'}
                                                    </button>
                                                </div>
                                                {/* Bulk Operations Row */}
                                                <div className="flex gap-1 pt-1 border-t border-white/5">
                                                    <button
                                                        onClick={() => handleBulkGenerateAudio(speaker)}
                                                        className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-orange-300 text-[10px] py-1 rounded flex items-center justify-center gap-1 transition-colors font-medium border border-orange-500/30"
                                                        title="해당 화자의 잠금 해제된 모든 컷 오디오 생성"
                                                    >
                                                        <Wand2 size={10} />
                                                        일괄 생성
                                                    </button>
                                                    <button
                                                        onClick={() => handleBulkLockAudio(speaker, true)}
                                                        className="w-7 h-7 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                        title="일괄 잠금"
                                                    >
                                                        <Lock size={12} strokeWidth={2.5} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleBulkLockAudio(speaker, false)}
                                                        className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg flex items-center justify-center transition-all hover:scale-105"
                                                        title="일괄 해제"
                                                    >
                                                        <Unlock size={12} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}


                    {/* System Instruction Management Panel */}
                    <div className="p-4 space-y-3 border-none shadow-none bg-transparent">
                        <div
                            className="flex items-center justify-between mb-1 cursor-pointer group"
                            onClick={() => setIsAiInstructionsOpen(!isAiInstructionsOpen)}
                        >
                            <span className="text-sm font-bold text-white flex items-center gap-2 group-hover:text-[var(--color-primary)] transition-colors">
                                <Sparkles size={14} className="text-white group-hover:text-[var(--color-primary)] transition-colors" />
                                사용자별 AI작가 시스템 지시문 관리
                            </span>
                            <span className="text-gray-500 group-hover:text-white transition-colors">
                                {isAiInstructionsOpen ? '▲' : '▼'}
                            </span>
                        </div>

                        {isAiInstructionsOpen && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* 1) Script / Image Prompt Instructions */}
                                <button
                                    onClick={() => setIsInstructionsModalOpen(true)}
                                    className="w-full flex items-center justify-between p-3 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-lg transition-colors group text-left"
                                >
                                    <span className="text-xs font-medium text-white group-hover:text-[var(--color-primary)] transition-colors">
                                        Script/Image
                                    </span>
                                    <span className="text-[10px] text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded">
                                        Edit ✏️
                                    </span>
                                </button>

                                {/* 2) Video Prompt Instructions */}
                                <button
                                    onClick={() => setIsVideoInstructionsModalOpen(true)}
                                    className="w-full flex items-center justify-between p-3 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-lg transition-colors group text-left"
                                >
                                    <span className="text-xs font-medium text-white group-hover:text-[var(--color-primary)] transition-colors">
                                        Video
                                    </span>
                                    <span className="text-[10px] text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded">
                                        Edit ✏️
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Next Step Button */}
                    {
                        localScript.length > 0 && (
                            <button
                                onClick={handleApprove}
                                className="w-full btn-primary flex items-center justify-center gap-2 py-3 rounded-xl font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-[1.02] transition-all"
                            >
                                Next Step
                                <ArrowRight size={20} />
                            </button>
                        )
                    }
                </div>

                <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
                    {localScript.length === 0 ? (
                        <div className="glass-panel p-12 text-center space-y-6 h-full flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center mx-auto border border-[var(--color-border)]">
                                <Wand2 size={40} className="text-[var(--color-primary)]" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">스크립트 생성 준비 완료</h3>
                                <p className="text-[var(--color-text-muted)] max-w-md mx-auto mt-2">
                                    Gemini가 대사와 시각적 묘사를 포함하여 컷별로 분할된 스크립트를 생성합니다.
                                </p>
                            </div>
                            <button onClick={handleGenerateScript} className="btn-primary">
                                마법처럼 스크립트 생성 시작
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
                            {localScript.map((cut, index) => (
                                <CutItem
                                    key={cut.id}
                                    cut={cut}
                                    index={index}
                                    isAudioConfirmed={!!cut.isAudioConfirmed}
                                    isImageConfirmed={!!cut.isImageConfirmed}
                                    showAssetSelector={showAssetSelector === cut.id}
                                    assetDefinitions={assetDefinitions}
                                    localScript={localScript}
                                    audioLoading={!!audioLoading[cut.id]}
                                    imageLoading={!!imageLoading[cut.id]}
                                    playingAudio={playingAudio}
                                    aspectRatio={aspectRatio || '16:9'}
                                    speakerList={speakerList}
                                    ttsModel={ttsModel}
                                    masterStyle={masterStyle?.description || ''}
                                    onToggleAudioConfirm={toggleAudioConfirm}

                                    onToggleImageConfirm={toggleImageConfirm}
                                    onUpdateCut={handleUpdateCut}
                                    onGenerateAudio={handleGenerateAudio}
                                    onPlayAudio={handlePlayAudio}
                                    onGenerateImage={handleGenerateFinalImage}
                                    onUploadUserReference={handleUploadUserReference}
                                    onAddAsset={addAssetToCut}
                                    onRemoveAsset={removeAssetFromCut}
                                    onAddReference={addCutReference}
                                    onRemoveReference={removeCutReference}
                                    onToggleAssetSelector={(id) => setShowAssetSelector(showAssetSelector === id ? null : id)}
                                    onCloseAssetSelector={() => setShowAssetSelector(null)}
                                    onSave={handleSave}
                                    onDelete={handleDeleteCut}
                                    onMove={handleMoveCut}
                                    onInsert={handleInsertCut}
                                    onOpenSfxModal={(id) => setSfxModalCutId(id)}
                                    onRemoveSfx={handleRemoveSfx}
                                    apiKey={apiKeys?.gemini || ''}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* SFX Search Modal */}
                <SfxSearchModal
                    isOpen={sfxModalCutId !== null}
                    onClose={() => setSfxModalCutId(null)}
                    onSelect={(sfx) => {
                        if (sfxModalCutId === null) return;
                        setLocalScript(prev => {
                            const updated = prev.map(c =>
                                c.id === sfxModalCutId
                                    ? { ...c, sfxUrl: sfx.url, sfxName: sfx.name, sfxVolume: sfx.volume, sfxFreesoundId: sfx.freesoundId }
                                    : c
                            );
                            saveToStore(updated);
                            return updated;
                        });
                    }}
                    sceneDescription={localScript.find(c => c.id === sfxModalCutId)?.visualPrompt || ''}
                    geminiApiKey={apiKeys?.gemini || ''}
                    freesoundApiKey={(apiKeys as any)?.freesound || ''}
                    currentSfxName={localScript.find(c => c.id === sfxModalCutId)?.sfxName}
                    initialQuery={localScript.find(c => c.id === sfxModalCutId)?.sfxDescription}
                />

                {/* AI Instructions Popup Modal */}
                {
                    isInstructionsModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                                {/* Modal Header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🤖</span>
                                        <div>
                                            <h2 className="text-lg font-bold text-white">AI Script Instructions</h2>
                                            <p className="text-xs text-[var(--color-text-muted)]">
                                                Customize how the AI generates your script
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCustomInstructions(DEFAULT_SCRIPT_INSTRUCTIONS)}
                                            className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                                        >
                                            ↺ Reset to Default
                                        </button>
                                        <button
                                            onClick={() => setIsInstructionsModalOpen(false)}
                                            className="px-4 py-1.5 text-xs font-bold text-black bg-[var(--color-primary)] rounded-lg hover:opacity-90 transition-opacity"
                                        >
                                            Done ✓
                                        </button>
                                    </div>
                                </div>

                                {/* Modal Body - Large Textarea */}
                                <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
                                    <textarea
                                        value={customInstructions}
                                        onChange={(e) => setCustomInstructions(e.target.value)}
                                        className="w-full flex-1 min-h-[40vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-sm text-white font-mono outline-none resize-none focus:border-[var(--color-primary)] transition-colors"
                                        placeholder="Enter custom instructions for the AI screenwriter..."
                                    />

                                    {/* AI Helper Chat - Memoized Component */}
                                    <AiInstructionHelper
                                        currentInstruction={customInstructions}
                                        onInstructionChange={setCustomInstructions}
                                        instructionType="script"
                                        apiKey={apiKeys?.gemini || ''}
                                        accentColor="primary"
                                    />
                                </div>

                                {/* Modal Footer */}
                                <div className="px-6 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
                                    <p className="text-[10px] text-[var(--color-text-muted)]">
                                        ⚠️ <strong>중요:</strong> 개별 컷은 반드시 8초 이내로 구성해야 합니다. 이 규칙이 프롬프트에 이미 포함되어 있습니다.
                                    </p>
                                    <button
                                        onClick={() => setIsInstructionsModalOpen(false)}
                                        className="text-xs text-[var(--color-text-muted)] hover:text-white"
                                    >
                                        ESC to close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Video Prompt Instructions Popup Modal */}
                {
                    isVideoInstructionsModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                                {/* Modal Header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🎬</span>
                                        <div>
                                            <h2 className="text-lg font-bold text-white">Video Prompt Instructions</h2>
                                            <p className="text-xs text-[var(--color-text-muted)]">
                                                Customize video generation for Veo3, Kling, Grok
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setVideoPromptInstructions(DEFAULT_VIDEO_PROMPT_INSTRUCTIONS)}
                                            className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                                        >
                                            ↺ Reset to Default
                                        </button>
                                        <button
                                            onClick={() => setIsVideoInstructionsModalOpen(false)}
                                            className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:opacity-90 transition-opacity"
                                        >
                                            Done ✓
                                        </button>
                                    </div>
                                </div>

                                {/* Modal Body - Large Textarea */}
                                <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
                                    <textarea
                                        value={videoPromptInstructions}
                                        onChange={(e) => setVideoPromptInstructions(e.target.value)}
                                        className="w-full flex-1 min-h-[40vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-sm text-white font-mono outline-none resize-none focus:border-purple-500 transition-colors"
                                        placeholder="Enter custom instructions for video prompt generation..."
                                    />

                                    {/* AI Helper Chat - Memoized Component */}
                                    <AiInstructionHelper
                                        currentInstruction={videoPromptInstructions}
                                        onInstructionChange={setVideoPromptInstructions}
                                        instructionType="video"
                                        apiKey={apiKeys?.gemini || ''}
                                        accentColor="purple"
                                    />
                                </div>

                                {/* Modal Footer */}
                                <div className="px-6 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
                                    <p className="text-[10px] text-[var(--color-text-muted)]">
                                        💡 <strong>팁:</strong> 각 컷의 visualPrompt를 기반으로 카메라 무브먼트와 모션을 추가합니다.
                                    </p>
                                    <button
                                        onClick={() => setIsVideoInstructionsModalOpen(false)}
                                        className="text-xs text-[var(--color-text-muted)] hover:text-white"
                                    >
                                        ESC to close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>

            {/* AI Assistant Director Chat Sidebar */}
            < AssistantDirectorChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                localScript={localScript}
                setLocalScript={setLocalScript}
                saveToStore={saveToStore}
            />

            {/* Chat Trigger Button (Floating) */}
            {
                !isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-8 right-8 w-20 h-20 rounded-full bg-orange-500 text-white shadow-2xl flex flex-col items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
                    >
                        <div className="absolute -top-12 right-0 bg-black/80 backdrop-blur px-3 py-1.5 rounded-lg text-[11px] font-bold text-orange-400 border border-orange-500/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            AI 조감독에게 코칭받기 ✨
                        </div>
                        <Bot size={32} />
                        <span className="text-[11px] font-bold mt-1 font-noto">조감독</span>
                        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 border-2 border-[#121212] rounded-full" />
                    </button>
                )
            }
        </>
    );
};
