import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateScript, DEFAULT_SCRIPT_INSTRUCTIONS, DEFAULT_VIDEO_PROMPT_INSTRUCTIONS } from '../services/gemini';
import type { ScriptCut } from '../services/gemini';
import { generateImage } from '../services/imageGen';
import { generateSpeech, type VoiceConfig } from '../services/tts';
import { generateGeminiSpeech, getDefaultGeminiVoice, isGeminiTtsVoice, GEMINI_TTS_VOICES } from '../services/geminiTts';

import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, ArrowRight, Lock, Unlock, Settings, Mic, Image, Sparkles } from 'lucide-react';
import { CutItem } from '../components/Production/CutItem';
import { SfxSearchModal } from '../components/Production/SfxSearchModal';
import { AiInstructionHelper } from '../components/Production/AiInstructionHelper';
import { getMatchedAssets } from '../utils/assetUtils';
import { linkCutsToStoryline } from '../utils/storylineUtils';
import { saveToIdb, generateCutImageKey, generateAudioKey, resolveUrl } from '../utils/imageStorage';

export const Step3_Production: React.FC = () => {
    const {
        id: projectId,  // For IndexedDB storage keys
        seriesName, episodeName, targetDuration, styleAnchor, apiKeys,
        script, setScript, ttsModel, setTtsModel, imageModel, setImageModel, nextStep, assetDefinitions,
        episodePlot, characters, episodeCharacters, seriesLocations, episodeLocations, masterStyle, aspectRatio,
        storylineTable, setProjectInfo
    } = useWorkflowStore();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [localScript, setLocalScript] = useState<ScriptCut[]>(script);
    const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
    const [audioLoading, setAudioLoading] = useState<Record<number, boolean>>({});
    const [playingAudio, setPlayingAudio] = useState<number | null>(null);
    const [showAssetSelector, setShowAssetSelector] = useState<number | null>(null);
    const [sfxModalCutId, setSfxModalCutId] = useState<number | null>(null);

    // Ref to keep track of latest script for stable callbacks
    const localScriptRef = useRef(localScript);
    useEffect(() => {
        localScriptRef.current = localScript;
    }, [localScript]);

    // CRITICAL: Sync localScript when store's script changes (e.g., project switch)
    // This ensures that when navigating between projects, the component shows correct data
    useEffect(() => {
        console.log(`[Step3] Store script changed - syncing localScript (projectId: ${projectId}, cuts: ${script.length})`);
        setLocalScript(script);
    }, [projectId, script]);

    // Auto-save helper
    const saveToStore = (currentScript: ScriptCut[]) => {
        setScript(currentScript);
    };

    const handleSave = useCallback(() => {
        saveToStore(localScriptRef.current);
    }, []);
    // State for local instructions
    const [customInstructions, setCustomInstructions] = useState(DEFAULT_SCRIPT_INSTRUCTIONS);
    const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);

    // State for video prompt instructions
    const [videoPromptInstructions, setVideoPromptInstructions] = useState(DEFAULT_VIDEO_PROMPT_INSTRUCTIONS);
    const [isVideoInstructionsModalOpen, setIsVideoInstructionsModalOpen] = useState(false);

    // Calculate progress - requires BOTH actual content AND confirmation
    const confirmedCount = localScript.filter(c => {
        const hasConfirmedImage = c.isImageConfirmed && c.finalImageUrl;
        const hasConfirmedAudio = c.isAudioConfirmed && (c.audioUrl || c.speaker === 'SILENT');
        return hasConfirmedImage && hasConfirmedAudio;
    }).length;
    const totalCount = localScript.length;
    const progressPercent = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

    // Memoized speaker list to prevent re-renders and crashes
    const speakerList = useMemo(() => {
        const allChars = [...(characters || []), ...(episodeCharacters || [])];
        return allChars
            .map(c => c.name)
            .filter((v, i, a) => v && a.indexOf(v) === i);
    }, [characters, episodeCharacters]);

    const TTS_MODELS = [
        { value: 'standard' as const, label: 'Standard', cost: '$', hint: 'Basic quality, lowest cost' },
        { value: 'wavenet' as const, label: 'WaveNet', cost: '$$', hint: 'High quality, moderate cost' },
        { value: 'neural2' as const, label: 'Neural2 (영어)', cost: '$$$', hint: 'Premium English voices with pitch control' },
        { value: 'chirp3-hd' as const, label: 'Chirp 3 HD (한국어)', cost: '$$$', hint: '최신 한국어 AI 목소리 - 자연스러운 억양' },
        { value: 'gemini-tts' as const, label: 'Gemini TTS ✨', cost: '$$', hint: '자연어 연기 지시 지원 - 감정 표현 최고' },
    ];


    const IMAGE_MODELS = [
        { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash', cost: '$', hint: 'Fast, efficient' },
        { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image', cost: '$$$', hint: 'High fidelity, premium' },
    ];

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
                localScript // NEW: Pass existing script for context-aware regeneration
            );

            // Link cuts to storyline scenes
            const linkedScript = linkCutsToStoryline(generated, storylineTable);

            // Merge generated script with confirmed cuts
            // Respect granular locks for Audio and Image
            const mergedScript = linkedScript.map((newCut, index) => {
                const existingCut = localScriptRef.current[index];

                if (existingCut) {
                    // MIGRATION: Treat old 'isConfirmed' as both locked
                    const isAudioLocked = existingCut.isAudioConfirmed || existingCut.isConfirmed;
                    const isImageLocked = existingCut.isImageConfirmed || existingCut.isConfirmed;

                    let finalCut = { ...newCut };

                    // Preserve Audio/Dialogue properties if locked
                    if (isAudioLocked) {
                        console.log(`[Step3] Preserving AUDIO for cut #${existingCut.id}`);
                        finalCut = {
                            ...finalCut,
                            speaker: existingCut.speaker,
                            dialogue: existingCut.dialogue,
                            emotion: existingCut.emotion,
                            emotionIntensity: existingCut.emotionIntensity,
                            language: existingCut.language, // Keep user setting
                            voiceGender: existingCut.voiceGender,
                            voiceAge: existingCut.voiceAge,
                            voiceSpeed: existingCut.voiceSpeed,
                            audioUrl: existingCut.audioUrl,
                            // SFX preservation Linked to Audio Lock
                            sfxUrl: existingCut.sfxUrl,
                            sfxName: existingCut.sfxName,
                            sfxDescription: existingCut.sfxDescription,
                            sfxVolume: existingCut.sfxVolume,
                            audioPadding: existingCut.audioPadding,
                            estimatedDuration: existingCut.estimatedDuration,
                            isAudioConfirmed: true
                        };
                    } else {
                        // Auto-populate logic for NEW audio content
                        // Priority: 1. Character gender/age from Step 1, 2. Name-based detection / default
                        const speakerChar = allCharacters.find(c => c.name.toLowerCase() === (newCut.speaker || 'Narrator').toLowerCase());
                        if (speakerChar?.gender && speakerChar.gender !== 'other') {
                            finalCut.voiceGender = speakerChar.gender as 'male' | 'female';
                        } else {
                            finalCut.voiceGender = detectGender(newCut.speaker || 'Narrator');
                        }
                        finalCut.voiceAge = speakerChar?.age || 'adult';
                    }

                    // Preserve Visual/Image properties if locked
                    if (isImageLocked) {
                        console.log(`[Step3] Preserving IMAGE for cut #${existingCut.id}`);
                        finalCut = {
                            ...finalCut,
                            visualPrompt: existingCut.visualPrompt,
                            finalImageUrl: existingCut.finalImageUrl,
                            referenceAssetIds: existingCut.referenceAssetIds,
                            referenceCutIds: existingCut.referenceCutIds,
                            isImageConfirmed: true
                        };
                    }

                    // Clear old deprecated flag
                    delete finalCut.isConfirmed;

                    return finalCut;
                }

                // Completely new cut
                // Priority: 1. Character gender/age from Step 1, 2. Name-based detection / default
                const speakerChar = allCharacters.find(c => c.name.toLowerCase() === (newCut.speaker || 'Narrator').toLowerCase());
                let voiceGender: 'male' | 'female' | 'neutral';
                if (speakerChar?.gender && speakerChar.gender !== 'other') {
                    voiceGender = speakerChar.gender as 'male' | 'female';
                } else {
                    voiceGender = detectGender(newCut.speaker || 'Narrator');
                }

                return {
                    ...newCut,
                    voiceGender,
                    voiceAge: speakerChar?.age || 'adult'
                };
            });

            setLocalScript(mergedScript);
            saveToStore(mergedScript);
        } catch (error) {
            console.error(error);
            // ... (keep default fallback)
            setLocalScript([
                { id: 1, speaker: 'Narrator', dialogue: 'In a world of pure imagination...', visualPrompt: 'Wide shot of a fantasy landscape, golden hour', estimatedDuration: 5 },
                { id: 2, speaker: 'Hero', dialogue: 'We have to keep moving.', visualPrompt: 'Close up of hero looking determined', estimatedDuration: 3 },
            ]);
        } finally {
            setLoading(false);
        }
    };



    const handleGenerateFinalImage = useCallback(async (cutId: number, prompt: string) => {
        setImageLoading(prev => ({ ...prev, [cutId]: true }));
        try {
            console.log(`[Image ${cutId}] Visual Prompt:`, prompt);

            const characterImages: string[] = [];
            const locationImages: string[] = [];
            const propImages: string[] = [];
            const matchedAssets: string[] = [];

            const currentScript = localScriptRef.current;
            const currentCut = currentScript.find(c => c.id === cutId);
            const manualAssetIds = currentCut?.referenceAssetIds || [];
            const referenceCutIds = currentCut?.referenceCutIds || [];

            // 1. Add Previous Cut Images
            referenceCutIds.forEach(refId => {
                const refCut = currentScript.find(c => c.id === refId);
                if (refCut?.finalImageUrl) {
                    locationImages.push(refCut.finalImageUrl);
                    console.log(`[Image ${cutId}] 📸 Added PREVIOUS CUT #${refId} as reference`);
                }
            });

            const deduplicatedMatches = getMatchedAssets(prompt, manualAssetIds, assetDefinitions, cutId);

            deduplicatedMatches.forEach(({ asset, isManual }) => {
                if (isManual) console.log(`[Image ${cutId}] 👆 Using manual asset: "${asset.name}"`);
                if (!isManual) console.log(`[Image ${cutId}] 🤖 Auto-matched asset: "${asset.name}"`);

                matchedAssets.push(asset.name);

                // FIX: Use masterImage (if selected) -> draftImage (if generated) -> referenceImage (if uploaded)
                const imageToUse = asset.masterImage || asset.draftImage || asset.referenceImage;

                if (imageToUse) {
                    if (asset.type === 'character') {
                        characterImages.push(imageToUse);
                        console.log(`[Image ${cutId}]   - Added CHARACTER: "${asset.name}"`);
                    } else if (asset.type === 'location') {
                        locationImages.push(imageToUse);
                        console.log(`[Image ${cutId}]   - Added LOCATION: "${asset.name}"`);
                    } else if (asset.type === 'prop') {
                        propImages.push(imageToUse);
                        console.log(`[Image ${cutId}]   - Added PROP: "${asset.name}"`);
                    }
                }
            });

            // CRITICAL FIX: Explicitly match Speaker to Asset (to ensure "Orange Uniform" survives)
            const speakerName = currentCut?.speaker;
            if (speakerName && speakerName !== 'Narrator' && speakerName !== 'SILENT') {
                const speakerAsset = Object.values(assetDefinitions || {}).find((a: any) =>
                    a.type === 'character' && a.name.toLowerCase() === speakerName.toLowerCase()
                );
                if (speakerAsset) {
                    // Only add if not already matched
                    if (!matchedAssets.includes(speakerAsset.name)) {
                        console.log(`[Image ${cutId}] 🗣️ Speaker Auto-Match (Priority): "${speakerAsset.name}"`);
                        matchedAssets.push(speakerAsset.name);

                        // Also add reference image if available
                        const imageToUse = speakerAsset.masterImage || speakerAsset.draftImage || speakerAsset.referenceImage;
                        if (imageToUse) characterImages.push(imageToUse);
                    }
                }
            }

            const allReferenceImages: string[] = [];
            if (currentCut?.userReferenceImage) {
                allReferenceImages.push(currentCut.userReferenceImage);
                console.log(`[Image ${cutId}] 🎨 Added USER SKETCH/REFERENCE image`);
            }
            allReferenceImages.push(...characterImages, ...locationImages, ...propImages);

            // Slice to reasonable limit (4 images) to avoid payload issues
            const limitedReferenceImages = allReferenceImages.slice(0, 4);

            let characterDetails = '';
            let locationDetails = '';
            let propDetails = '';

            matchedAssets.forEach(assetName => {
                const asset = Object.values(assetDefinitions || {}).find((a: any) => a.name === assetName);
                if (asset && asset.description) {
                    if (asset.type === 'character') {
                        // ENFORCE VISUAL TRUTH: Prepend "Fixed Visual Reference:"
                        characterDetails += `\n- ${asset.name}: ${asset.description}`;
                    } else if (asset.type === 'location') {
                        locationDetails += `\n- ${asset.name}: ${asset.description}`;
                    } else if (asset.type === 'prop') {
                        propDetails += `\n- ${asset.name}: ${asset.description}`;
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

                // Determine if this cut has character assets or location assets
                const hasCharacterAssets = matchedAssets.some(assetName => {
                    const asset = Object.values(assetDefinitions || {}).find((a: any) => a.name === assetName);
                    return asset && asset.type === 'character';
                });

                // Apply appropriate modifier
                if (hasCharacterAssets && masterStyle.characterModifier) {
                    stylePrompt += `\n${masterStyle.characterModifier}`;
                } else if (!hasCharacterAssets && masterStyle.backgroundModifier) {
                    // If no character assets, assume it's a background/location shot
                    stylePrompt += `\n${masterStyle.backgroundModifier}`;
                }
            }
            if (styleAnchor?.prompts) {
                stylePrompt += `\n\n[Style Details]\n${JSON.stringify(styleAnchor.prompts)}`;
            }

            // REORDERED PROMPT STRUCTURE: Asset Details First -> Style -> Scene Action
            // This ensures the "Who" and "What" (Orange Uniform) are established before the "Action"
            const finalPrompt = assetDetails + stylePrompt + `\n\n[Scene Action]\n${prompt}`;

            // FIX: Resolve IDB URLs to Base64 before sending to Gemini
            const resolvedReferenceImages = await Promise.all(
                limitedReferenceImages.map(url => resolveUrl(url))
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
            saveToStore(updatedScript);

            console.log(`[Image ${cutId}] ✅ Generated and saved to IndexedDB`);
        } catch (error: any) {
            console.error(`[Image ${cutId}] ❌ Generation failed:`, error);
            alert(`이미지 생성 실패: ${error.message}`);
        } finally {
            setImageLoading(prev => ({ ...prev, [cutId]: false }));
        }
    }, [projectId, apiKeys.gemini, aspectRatio, imageModel, assetDefinitions, masterStyle, styleAnchor]);

    // Helper: Detect gender from speaker name
    const detectGender = (speakerName: string): 'male' | 'female' | 'neutral' => {
        const lower = speakerName.toLowerCase();

        // Korean female keywords
        if (lower.includes('어머니') || lower.includes('엄마') || lower.includes('할머니') ||
            lower.includes('누나') || lower.includes('언니') || lower.includes('여자') ||
            lower.includes('소녀') || lower.includes('아가씨') || lower.includes('이모') || lower.includes('고모')) {
            return 'female';
        }

        // Korean male keywords
        if (lower.includes('아버지') || lower.includes('아빠') || lower.includes('할아버지') ||
            lower.includes('형') || lower.includes('오빠') || lower.includes('남자') ||
            lower.includes('소년') || lower.includes('삼촌') || lower.includes('이모부') || lower.includes('고모부')) {
            return 'male';
        }

        // English keywords
        if (lower.includes('hero') || lower.includes('male') || lower.includes('man') ||
            lower.includes('boy') || lower.includes('father') || lower.includes('dad') ||
            lower.includes('brother') || lower.includes('uncle')) {
            return 'male';
        }

        if (lower.includes('heroine') || lower.includes('female') || lower.includes('woman') ||
            lower.includes('girl') || lower.includes('mother') || lower.includes('mom') ||
            lower.includes('sister') || lower.includes('aunt')) {
            return 'female';
        }

        return 'neutral';
    };

    // Helper: Auto-detect language from dialogue text
    const detectLanguageFromText = (text: string): 'en-US' | 'ko-KR' => {
        // Check for Korean characters (Hangul)
        const koreanRegex = /[\u3131-\uD79D]/;
        return koreanRegex.test(text) ? 'ko-KR' : 'en-US';
    };

    // Helper: Get default voice for language, gender, and TTS model
    const getDefaultVoiceForLanguage = (
        language: 'en-US' | 'ko-KR',
        gender: 'male' | 'female' | 'neutral',
        age: 'child' | 'young' | 'adult' | 'senior' = 'adult',
        model: string = ttsModel
    ): string => {
        if (language === 'ko-KR') {
            // Korean voices based on model selection
            if (model === 'chirp3-hd') {
                // Chirp 3 HD Korean voices
                if (gender === 'female') {
                    if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Leda';
                    if (age === 'senior') return 'ko-KR-Chirp3-HD-Kore';
                    return 'ko-KR-Chirp3-HD-Aoede'; // Default Adult
                } else {
                    if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Puck';
                    if (age === 'senior') return 'ko-KR-Chirp3-HD-Charon';
                    return 'ko-KR-Chirp3-HD-Fenrir'; // Default Adult
                }
            } else if (model === 'wavenet') {
                // WaveNet Korean voices
                if (gender === 'female') return 'ko-KR-Wavenet-A';
                if (gender === 'male') return 'ko-KR-Wavenet-C';
                return 'ko-KR-Wavenet-B';
            } else {
                // Standard Korean voices (default for standard model)
                if (gender === 'female') return 'ko-KR-Standard-A';
                if (gender === 'male') return 'ko-KR-Standard-C';
                return 'ko-KR-Standard-B';
            }
        } else {
            // English voices based on model selection
            if (model === 'neural2') {
                // Neural2 English voices
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
                // WaveNet English voices
                if (gender === 'female') return 'en-US-Wavenet-C';
                if (gender === 'male') return 'en-US-Wavenet-D';
                return 'en-US-Wavenet-A';
            } else if (model === 'chirp3-hd') {
                // Chirp 3 HD doesn't have English - fallback to Neural2
                console.warn('Chirp 3 HD does not support English, falling back to Neural2');
                if (gender === 'female') return 'en-US-Neural2-C';
                if (gender === 'male') return 'en-US-Neural2-J';
                return 'en-US-Neural2-A';
            } else {
                // Standard English voices
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

                const updatedScript = currentScript.map(cut =>
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
                setLocalScript(updatedScript);
                saveToStore(updatedScript);
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

            const updatedScript = currentScript.map(cut =>
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
            setLocalScript(updatedScript);
            saveToStore(updatedScript);
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

    const handleUpdateCut = useCallback((id: number, updates: Partial<ScriptCut>) => {
        setLocalScript(prev => {
            const updated = prev.map(cut =>
                cut.id === id ? { ...cut, ...updates } : cut
            );
            // Auto-save to store when updating cut metadata
            saveToStore(updated);
            return updated;
        });
    }, [storylineTable, setProjectInfo]);

    const handleUploadUserReference = useCallback(async (cutId: number, file: File) => {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                if (!base64) return;

                // Optimization: Save to IDB to avoid bloating project.json
                // Use a manual key pattern since generateCutImageKey assumes final/draft
                const storageKey = `cut-${cutId}-userref`;
                const idbUrl = await saveToIdb('images', storageKey, base64, { compress: true, maxWidth: 1024 });

                handleUpdateCut(cutId, { userReferenceImage: idbUrl });
                console.log(`[Step3] 🎨 Saved user reference to IDB: ${idbUrl}`);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Failed to upload reference:", error);
        }
    }, [projectId, handleUpdateCut]);

    const toggleAudioConfirm = useCallback((cutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut =>
                cut.id === cutId ? { ...cut, isAudioConfirmed: !cut.isAudioConfirmed } : cut
            );
            saveToStore(updated);
            return updated;
        });
    }, []);

    const toggleImageConfirm = useCallback((cutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (cut.id === cutId) {
                    const newIsConfirmed = !cut.isImageConfirmed;
                    let updates: Partial<typeof cut> = { isImageConfirmed: newIsConfirmed };

                    // Auto-generate video motion prompt if locking and it's empty
                    if (newIsConfirmed && !cut.videoPrompt) {
                        const basePrompt = cut.visualPrompt || '';
                        const motionSuffix = '. Camera slowly pushes in. Subtle atmospheric motion. Character breathes naturally.';
                        updates.videoPrompt = basePrompt + motionSuffix;
                        console.log(`[Cut ${cut.id}] 🎬 Auto-generated video prompt on lock`);
                    }

                    return { ...cut, ...updates };
                }
                return cut;
            });
            saveToStore(updated);
            return updated;
        });
    }, []);

    const addAssetToCut = useCallback((cutId: number, assetId: string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (cut.id === cutId) {
                    const currentAssets = cut.referenceAssetIds || [];
                    if (!currentAssets.includes(assetId)) {
                        return { ...cut, referenceAssetIds: [...currentAssets, assetId] };
                    }
                }
                return cut;
            });
            saveToStore(updated);
            return updated;
        });
        setShowAssetSelector(null);
    }, []);

    const removeAssetFromCut = useCallback((cutId: number, assetId: string) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (cut.id === cutId) {
                    return {
                        ...cut,
                        referenceAssetIds: (cut.referenceAssetIds || []).filter(id => id !== assetId)
                    };
                }
                return cut;
            });
            saveToStore(updated);
            return updated;
        });
    }, []);

    const addCutReference = useCallback((cutId: number, refCutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (cut.id === cutId) {
                    const currentRefs = cut.referenceCutIds || [];
                    if (!currentRefs.includes(refCutId)) {
                        return { ...cut, referenceCutIds: [...currentRefs, refCutId] };
                    }
                }
                return cut;
            });
            saveToStore(updated);
            return updated;
        });
        setShowAssetSelector(null);
    }, []);

    const removeCutReference = useCallback((cutId: number, refCutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut => {
                if (cut.id === cutId) {
                    return {
                        ...cut,
                        referenceCutIds: (cut.referenceCutIds || []).filter(id => id !== refCutId)
                    };
                }
                return cut;
            });
            saveToStore(updated);
            return updated;
        });
    }, []);

    const handleDeleteCut = useCallback((id: number) => {
        setLocalScript(prev => {
            const updated = prev.filter(cut => cut.id !== id);
            // Re-index remaining cuts
            const reindexed = updated.map((cut, idx) => ({
                ...cut,
                id: idx + 1
            }));
            saveToStore(reindexed);
            return reindexed;
        });
    }, []);

    const handleMoveCut = useCallback((id: number, direction: 'up' | 'down') => {
        setLocalScript(prev => {
            const index = prev.findIndex(c => c.id === id);
            if (index === -1) return prev;
            if (direction === 'up' && index === 0) return prev;
            if (direction === 'down' && index === prev.length - 1) return prev;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            const updated = [...prev];
            [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

            // Re-index
            const reindexed = updated.map((cut, idx) => ({
                ...cut,
                id: idx + 1
            }));
            saveToStore(reindexed);
            return reindexed;
        });
    }, []);

    const handleInsertCut = useCallback((id: number) => {
        setLocalScript(prev => {
            const index = prev.findIndex(c => c.id === id);
            if (index === -1) return prev;

            const newCut: ScriptCut = {
                id: 0, // Placeholder
                speaker: 'Narrator',
                dialogue: '',
                visualPrompt: '',
                estimatedDuration: 3
            };

            const updated = [...prev];
            updated.splice(index + 1, 0, newCut);

            // Re-index
            const reindexed = updated.map((cut, idx) => ({
                ...cut,
                id: idx + 1
            }));
            saveToStore(reindexed);
            return reindexed;
        });
    }, []);

    // Bulk lock functions - component level for header access
    const lockAllAudio = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => (cut.audioUrl || cut.speaker === 'SILENT') ? { ...cut, isAudioConfirmed: true } : cut);
            saveToStore(updated);
            return updated;
        });
    }, []);

    const unlockAllAudio = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => ({ ...cut, isAudioConfirmed: false }));
            saveToStore(updated);
            return updated;
        });
    }, []);

    const lockAllImages = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => cut.finalImageUrl ? { ...cut, isImageConfirmed: true } : cut);
            saveToStore(updated);
            return updated;
        });
    }, []);

    const unlockAllImages = useCallback(() => {
        setLocalScript(prev => {
            const updated = prev.map(cut => ({ ...cut, isImageConfirmed: false }));
            saveToStore(updated);
            return updated;
        });
    }, []);

    // Bulk lock counts - component level for header access
    const audioLockedCount = localScript.filter(c => c.isAudioConfirmed).length;
    const imageLockedCount = localScript.filter(c => c.isImageConfirmed).length;
    const audioGeneratedCount = localScript.filter(c => c.audioUrl).length;
    const imageGeneratedCount = localScript.filter(c => c.finalImageUrl).length;

    return (
        <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* LEFT SIDEBAR - 1/4 width */}
            <div className="w-1/4 min-w-[280px] max-w-[360px] flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">

                {/* Header with Stats */}
                <div className="glass-panel p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Production</h2>
                                <p className="text-xs text-[var(--color-text-muted)] mt-1">컷별로 에셋을 생성하고 준비되면 확정하세요.</p>
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

                        {/* Bulk Lock Buttons - Inside header for visibility before regeneration */}
                        {localScript.length > 0 && (
                            <div className="pt-3 border-t border-white/5">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">🔒 Bulk Lock</span>
                                    <span className="text-[10px] text-gray-500">- Lock before regenerating script</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] text-gray-500">🎵 Audio ({audioLockedCount}/{audioGeneratedCount})</span>
                                        <div className="flex gap-1">
                                            <button onClick={lockAllAudio} className="flex-1 px-2 py-1 text-[9px] bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded font-bold">Lock All</button>
                                            <button onClick={unlockAllAudio} className="flex-1 px-2 py-1 text-[9px] bg-red-500/10 text-red-400/70 hover:bg-red-500/20 rounded">Unlock</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] text-gray-500">🖼️ Image ({imageLockedCount}/{imageGeneratedCount})</span>
                                        <div className="flex gap-1">
                                            <button onClick={lockAllImages} className="flex-1 px-2 py-1 text-[9px] bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded font-bold">Lock All</button>
                                            <button onClick={unlockAllImages} className="flex-1 px-2 py-1 text-[9px] bg-red-500/10 text-red-400/70 hover:bg-red-500/20 rounded">Unlock</button>
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
                    </div>      {/* BULK AUDIO SUB-PANEL */}
                    {localScript.length > 0 && (() => {
                        // ... (Re-using logic from original Voice Settings)
                        const speakerMap = new Map<string, { gender?: string; age?: string; voiceId?: string; voiceSpeed?: number; language?: string; cutCount: number }>();
                        const speakerCuts = new Map<string, ScriptCut[]>();
                        localScript.forEach(cut => {
                            const s = cut.speaker || 'Narrator';
                            if (s === 'SILENT') return; // Skip SILENT speaker for bulk audio settings
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
                        const speakers = Array.from(speakerMap.entries());
                        const currentLanguage = localScript[0]?.language || '';
                        const currentSpeed = localScript[0]?.voiceSpeed || '';

                        // Combined Voice Options - Conditional based on TTS Model
                        const GEMINI_VOICE_OPTIONS = [
                            {
                                optgroup: '✨ Gemini TTS (Multilingual)', options: GEMINI_TTS_VOICES.map(v => ({
                                    value: v.id,
                                    label: `${v.label} (${v.style})`,
                                    gender: v.gender,
                                    lang: 'multilingual'
                                }))
                            }
                        ];

                        const CLOUD_VOICE_OPTIONS = [
                            {
                                optgroup: '🇰🇷 Korean (Standard)', options: [
                                    { value: 'ko-KR-Standard-A', label: 'Standard-A (여성)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Standard-C', label: 'Standard-C (남성)', gender: 'male', lang: 'ko-KR' },
                                ]
                            },
                            {
                                optgroup: '🇰🇷 Korean (WaveNet)', options: [
                                    { value: 'ko-KR-Wavenet-A', label: 'WaveNet-A (여성)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Wavenet-B', label: 'WaveNet-B (여성, 차분함)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Wavenet-C', label: 'WaveNet-C (남성)', gender: 'male', lang: 'ko-KR' },
                                    { value: 'ko-KR-Wavenet-D', label: 'WaveNet-D (남성, 중후함)', gender: 'male', lang: 'ko-KR' },
                                ]
                            },
                            {
                                optgroup: '🇰🇷 Korean (Neural2)', options: [
                                    { value: 'ko-KR-Neural2-A', label: 'Neural2-A (여성)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Neural2-B', label: 'Neural2-B (여성, 차분함)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Neural2-C', label: 'Neural2-C (남성)', gender: 'male', lang: 'ko-KR' },
                                ]
                            },
                            {
                                optgroup: '🇰🇷 Korean (Chirp HD)', options: [
                                    { value: 'ko-KR-Chirp3-HD-Aoede', label: 'Aoede (여성, 성인)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Chirp3-HD-Leda', label: 'Leda (여성, 젊음)', gender: 'female', lang: 'ko-KR' },
                                    { value: 'ko-KR-Chirp3-HD-Fenrir', label: 'Fenrir (남성, 성인)', gender: 'male', lang: 'ko-KR' },
                                    { value: 'ko-KR-Chirp3-HD-Puck', label: 'Puck (남성, 젊음)', gender: 'male', lang: 'ko-KR' },
                                ]
                            },
                            {
                                optgroup: '🇺🇸 English (Neural2)', options: [
                                    { value: 'en-US-Neural2-C', label: 'Neural2-C (Female)', gender: 'female', lang: 'en-US' },
                                    { value: 'en-US-Neural2-G', label: 'Neural2-G (Female, Young)', gender: 'female', lang: 'en-US' },
                                    { value: 'en-US-Neural2-J', label: 'Neural2-J (Male)', gender: 'male', lang: 'en-US' },
                                    { value: 'en-US-Neural2-I', label: 'Neural2-I (Male, Young)', gender: 'male', lang: 'en-US' },
                                ]
                            }
                        ];

                        // Combine all voice options - show all voices regardless of TTS model
                        const VOICE_OPTIONS = [...CLOUD_VOICE_OPTIONS, ...GEMINI_VOICE_OPTIONS];
                        const FLAT_VOICE_OPTIONS = VOICE_OPTIONS.flatMap(g => g.options);

                        const getDefaultVoice = (gender?: string) => {
                            if (ttsModel === 'gemini-tts') {
                                // For Gemini TTS, use gender-based default
                                return gender === 'male' ? 'Puck' : 'Aoede';
                            }
                            if (gender === 'male') {
                                return FLAT_VOICE_OPTIONS.find(v => v.gender === 'male' && v.lang === currentLanguage)?.value || FLAT_VOICE_OPTIONS[0]?.value;
                            }
                            return FLAT_VOICE_OPTIONS.find(v => v.gender === 'female' && v.lang === currentLanguage)?.value || FLAT_VOICE_OPTIONS[0]?.value;
                        };


                        const applyVoiceToSpeaker = (speakerName: string, voiceValue: string) => {
                            const voice = FLAT_VOICE_OPTIONS.find(v => v.value === voiceValue);
                            if (voice) {
                                setLocalScript(prev => {
                                    const updated = prev.map(cut => {
                                        const isLocked = cut.isAudioConfirmed || cut.isConfirmed;
                                        const isMatch = (cut.speaker || 'Narrator') === speakerName;
                                        if (isMatch && !isLocked) {
                                            return {
                                                ...cut,
                                                voiceId: voiceValue,
                                                voiceGender: voice.gender as 'male' | 'female' | 'neutral',
                                                language: voice.lang
                                            } as ScriptCut;
                                        }
                                        return cut;
                                    });
                                    saveToStore(updated);
                                    return updated;
                                });
                            }
                        };
                        const applyToSpeaker = (speakerName: string, field: keyof ScriptCut, value: any) => {
                            setLocalScript(prev => {
                                const updated = prev.map(cut => {
                                    const isLocked = cut.isAudioConfirmed || cut.isConfirmed;
                                    const isMatch = (cut.speaker || 'Narrator') === speakerName;
                                    if (isMatch && !isLocked) {
                                        return { ...cut, [field]: value };
                                    }
                                    return cut;
                                });
                                saveToStore(updated);
                                return updated;
                            });
                        };
                        const applyToAll = (field: string, value: any) => {
                            setLocalScript(prev => {
                                const updated = prev.map(cut => {
                                    const isLocked = cut.isAudioConfirmed || cut.isConfirmed;
                                    if (!isLocked) {
                                        return { ...cut, [field]: value };
                                    }
                                    return cut;
                                });
                                saveToStore(updated);
                                return updated;
                            });
                        };

                        const handleBulkGenerateAudio = async (speakerName: string) => {
                            const cutsToGenerate = localScriptRef.current.filter(c =>
                                (c.speaker || 'Narrator') === speakerName &&
                                !c.isAudioConfirmed
                            );
                            if (cutsToGenerate.length === 0) {
                                alert('No unlocked cuts found for this speaker.');
                                return;
                            }
                            if (!confirm(`Generate audio for ${cutsToGenerate.length} cuts for "${speakerName}"?\n(This will process sequentially)`)) return;
                            for (const cut of cutsToGenerate) {
                                if (!cut.dialogue) continue;
                                await handleGenerateAudio(cut.id, cut.dialogue);
                                await new Promise(r => setTimeout(r, 200));
                            }
                        };
                        const handleBulkLockAudio = (speakerName: string, lock: boolean) => {
                            setLocalScript(prev => {
                                const updated = prev.map(cut => {
                                    if ((cut.speaker || 'Narrator') === speakerName) {
                                        if (lock && (!cut.audioUrl && cut.speaker !== 'SILENT')) return cut;
                                        return { ...cut, isAudioConfirmed: lock };
                                    }
                                    return cut;
                                });
                                saveToStore(updated);
                                return updated;
                            });
                        };

                        const VOICE_SAMPLES: Record<string, string> = {
                            'ko-KR-Chirp3-HD-Aoede': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Aoede.wav',
                            'ko-KR-Chirp3-HD-Fenrir': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Fenrir.wav',
                            'ko-KR-Chirp3-HD-Leda': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Leda.wav',
                            'ko-KR-Chirp3-HD-Puck': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Puck.wav',
                            'ko-KR-Neural2-A': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Neural2-A.wav',
                            'ko-KR-Neural2-B': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Neural2-B.wav',
                            'ko-KR-Standard-A': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-A.wav',
                            'ko-KR-Standard-B': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-B.wav',
                            'ko-KR-Standard-C': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-C.wav',
                            'ko-KR-Standard-D': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-D.wav',
                            'ko-KR-Wavenet-C': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Wavenet-C.wav',
                            'ko-KR-Wavenet-D': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Wavenet-D.wav',
                            'en-US-Neural2-C': 'https://cloud.google.com/static/text-to-speech/docs/audio/en-US-Neural2-C.wav',
                            'en-US-Neural2-G': 'https://cloud.google.com/static/text-to-speech/docs/audio/en-US-Neural2-G.wav',
                            'en-US-Neural2-J': 'https://cloud.google.com/static/text-to-speech/docs/audio/en-US-Neural2-J.wav',
                            'en-US-Neural2-I': 'https://cloud.google.com/static/text-to-speech/docs/audio/en-US-Neural2-I.wav',
                            // Gemini Voices (Mapped to official high-fidelity Chirp3-HD samples)
                            'Aoede': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Aoede.wav',
                            'Leda': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Leda.wav',
                            'Kore': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-B.wav',
                            'Puck': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Puck.wav',
                            'Fenrir': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Fenrir.wav',
                            'Charon': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Charon.wav',
                            'Orus': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Orus.wav',
                            'Zephyr': 'https://cloud.google.com/static/text-to-speech/docs/audio/ko-KR-Standard-A.wav',
                        };
                        const playVoiceSample = (voiceId: string) => {
                            const sampleUrl = VOICE_SAMPLES[voiceId];
                            if (sampleUrl) {
                                const audio = new Audio(sampleUrl);
                                audio.play().catch(e => console.warn('Sample playback failed:', e));
                            } else {
                                alert('Sample not available for this voice');
                            }
                        };


                        return (
                            <div className="mt-2 p-3 bg-black/20 rounded-lg border border-white/5 space-y-3">
                                <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1 uppercase tracking-wider">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"></div>
                                    Bulk Audio Settings
                                </div>

                                {/* Global Settings */}
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                        value={currentLanguage}
                                        onChange={(e) => applyToAll('language', e.target.value || undefined)}
                                    >
                                        <option value="">🌐 Auto Lang</option>
                                        <option value="ko-KR">🇰🇷 Korean</option>
                                        <option value="en-US">🇺🇸 English</option>
                                    </select>
                                    <select
                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                        value={currentSpeed}
                                        onChange={(e) => applyToAll('voiceSpeed', e.target.value ? parseFloat(e.target.value) : undefined)}
                                    >
                                        <option value="">⚡ Auto Rate</option>
                                        <option value="0.85">85% Slow</option>
                                        <option value="1.0">100% Normal</option>
                                        <option value="1.15">115% Fast</option>
                                    </select>
                                </div>

                                {/* Per Speaker */}
                                <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                                    <div className="text-[9px] text-[var(--color-text-muted)] uppercase font-bold">Per Speaker Voice</div>
                                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                                        {speakers.map(([speaker, settings]) => {
                                            const currentVoice = settings.voiceId || getDefaultVoice(settings.gender);
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
                                                                    <option value="">Rate: Auto</option>
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
                                                            className="px-2 py-2 bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 rounded text-[12px] font-bold self-start"
                                                            title="Play voice sample"
                                                        >
                                                            🔊
                                                        </button>
                                                    </div>
                                                    {/* Bulk Operations Row */}
                                                    <div className="flex gap-1 pt-1 border-t border-white/5">
                                                        <button
                                                            onClick={() => handleBulkGenerateAudio(speaker)}
                                                            className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-orange-300 text-[10px] py-1 rounded flex items-center justify-center gap-1 transition-colors font-medium border border-orange-500/30"
                                                            title="Generate audio for all unlocked cuts for this speaker"
                                                        >
                                                            <Wand2 size={10} />
                                                            Gen All
                                                        </button>
                                                        <button
                                                            onClick={() => handleBulkLockAudio(speaker, true)}
                                                            className="px-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] py-1 rounded transition-colors"
                                                            title="Lock all generated audio for this speaker"
                                                        >
                                                            <Lock size={10} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleBulkLockAudio(speaker, false)}
                                                            className="px-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] py-1 rounded transition-colors"
                                                            title="Unlock all audio for this speaker"
                                                        >
                                                            <Unlock size={10} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                </div>
                            </div>
                        );
                    })()}
                </div>


                {/* System Instruction Management Panel */}
                <div className="glass-panel p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white flex items-center gap-2">
                            <Sparkles size={14} className="text-[var(--color-primary)]" />
                            프롬프트 작성 Gemini 지시문 관리
                        </span>
                    </div>

                    <div className="space-y-2">
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
                            className="w-full flex items-center justify-between p-3 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-purple-400 rounded-lg transition-colors group text-left"
                        >
                            <span className="text-xs font-medium text-white group-hover:text-purple-400 transition-colors">
                                Video
                            </span>
                            <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                                Edit ✏️
                            </span>
                        </button>
                    </div>
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
                            <h3 className="text-xl font-bold text-white">Ready to Write</h3>
                            <p className="text-[var(--color-text-muted)] max-w-md mx-auto mt-2">
                                Gemini will generate a script broken down into shots, complete with dialogue and visual descriptions.
                            </p>
                        </div>
                        <button onClick={handleGenerateScript} className="btn-primary">
                            Start Magic Generation
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {localScript.map((cut, index) => (
                            <CutItem
                                key={cut.id}
                                cut={cut}
                                index={index}
                                isAudioConfirmed={!!(cut.isAudioConfirmed || cut.isConfirmed)}
                                isImageConfirmed={!!(cut.isImageConfirmed || cut.isConfirmed)}
                                showAssetSelector={showAssetSelector === cut.id}
                                assetDefinitions={assetDefinitions}
                                localScript={localScript}
                                audioLoading={!!audioLoading[cut.id]}
                                imageLoading={!!imageLoading[cut.id]}
                                playingAudio={playingAudio}
                                aspectRatio={aspectRatio || '16:9'}
                                speakerList={speakerList}
                                ttsModel={ttsModel}
                                onToggleAudioConfirm={toggleAudioConfirm}

                                onToggleImageConfirm={toggleImageConfirm}
                                onUpdateCut={handleUpdateCut}
                                onGenerateAudio={handleGenerateAudio}
                                onPlayAudio={handlePlayAudio}
                                onGenerateImage={handleGenerateFinalImage}
                                onRegenerateImage={(id) => handleGenerateFinalImage(id, localScript.find(c => c.id === id)?.visualPrompt || '')}
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
                                onRemoveSfx={(id) => {
                                    setLocalScript(prev => {
                                        const updated = prev.map(c =>
                                            c.id === id ? { ...c, sfxUrl: undefined, sfxName: undefined, sfxVolume: undefined, sfxFreesoundId: undefined } : c
                                        );
                                        saveToStore(updated);
                                        return updated;
                                    });
                                }}
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
        </div >
    );
};
