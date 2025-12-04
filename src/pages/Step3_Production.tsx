import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateScript } from '../services/gemini';
import type { ScriptCut } from '../services/gemini';
import { generateImage } from '../services/imageGen';
import { generateSpeech, type VoiceConfig } from '../services/tts';
import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, ArrowRight } from 'lucide-react';
import { CutItem } from '../components/Production/CutItem';
import { getMatchedAssets } from '../utils/assetUtils';
import { linkCutsToStoryline, syncCutsToStoryline } from '../utils/storylineUtils';  // NEW

export const Step3_Production: React.FC = () => {
    const {
        seriesName, episodeName, targetDuration, styleAnchor, apiKeys,
        script, setScript, ttsModel, setTtsModel, imageModel, setImageModel, nextStep, assetDefinitions,
        episodePlot, characters, episodeCharacters, seriesLocations, episodeLocations, masterStyle, aspectRatio,
        storylineTable, setProjectInfo  // NEW: For storyline integration
    } = useWorkflowStore();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [localScript, setLocalScript] = useState<ScriptCut[]>(script);
    const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
    const [audioLoading, setAudioLoading] = useState<Record<number, boolean>>({});
    const [playingAudio, setPlayingAudio] = useState<number | null>(null);
    const [showAssetSelector, setShowAssetSelector] = useState<number | null>(null);

    // Ref to keep track of latest script for stable callbacks
    const localScriptRef = useRef(localScript);
    useEffect(() => {
        localScriptRef.current = localScript;
    }, [localScript]);

    // Auto-save helper
    const saveToStore = (currentScript: ScriptCut[]) => {
        setScript(currentScript);
    };

    const handleSave = useCallback(() => {
        saveToStore(localScriptRef.current);
    }, []);

    // Calculate progress
    const confirmedCount = localScript.filter(c => c.isConfirmed).length;
    const totalCount = localScript.length;
    const progressPercent = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

    const TTS_MODELS = [
        { value: 'standard' as const, label: 'Standard', cost: '$', hint: 'Basic quality, lowest cost' },
        { value: 'wavenet' as const, label: 'WaveNet', cost: '$$', hint: 'High quality, moderate cost' },
        { value: 'neural2' as const, label: 'Neural2 (영어)', cost: '$$$', hint: 'Premium English voices with pitch control' },
        { value: 'chirp3-hd' as const, label: 'Chirp 3 HD (한국어)', cost: '$$$', hint: '최신 한국어 AI 목소리 - 자연스러운 억양' },
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
                assetDefinitions  // NEW: Pass Step 2 asset definitions
            );

            // Link cuts to storyline scenes
            const linkedScript = linkCutsToStoryline(generated, storylineTable);

            // Merge generated script with confirmed cuts
            // Keep confirmed cuts' content but add new TTS metadata
            const mergedScript = linkedScript.map((newCut, index) => {
                const existingCut = localScriptRef.current[index];
                if (existingCut && existingCut.isConfirmed) {
                    // Keep confirmed cut content but add new metadata for TTS
                    return {
                        ...existingCut,
                        // Add/update TTS metadata from regenerated script
                        emotion: newCut.emotion,
                        emotionIntensity: newCut.emotionIntensity,
                        language: newCut.language
                    };
                }

                // Auto-populate voiceGender and voiceAge for new cuts
                const autoGender = detectGender(newCut.speaker || 'Narrator');
                return {
                    ...newCut,
                    voiceGender: autoGender,
                    voiceAge: 'adult' as const  // Default to adult, user can change via dropdown
                };
            });

            setLocalScript(mergedScript);
            saveToStore(mergedScript);
        } catch (error) {
            console.error(error);
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

                const imageToUse = asset.draftImage || asset.referenceImage;

                if (imageToUse) {
                    if (asset.type === 'character') {
                        characterImages.push(imageToUse);
                        console.log(`[Image ${cutId}]   - Added CHARACTER: "${asset.name}"`);
                    } else {
                        locationImages.push(imageToUse);
                        console.log(`[Image ${cutId}]   - Added LOCATION: "${asset.name}"`);
                    }
                }
            });


            const allReferenceImages = [...characterImages, ...locationImages].slice(0, 3);

            let characterDetails = '';
            let locationDetails = '';

            matchedAssets.forEach(assetName => {
                const asset = Object.values(assetDefinitions || {}).find((a: any) => a.name === assetName);
                if (asset && asset.description) {
                    if (asset.type === 'character') {
                        characterDetails += `\n- ${asset.name}: ${asset.description}`;
                    } else if (asset.type === 'location') {
                        locationDetails += `\n- ${asset.name}: ${asset.description}`;
                    }
                }
            });

            let assetDetails = '';
            if (characterDetails) {
                assetDetails += `\n\n[Character Details]${characterDetails}`;
            }
            if (locationDetails) {
                assetDetails += `\n\n[Location Details]${locationDetails}`;
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

            const finalPrompt = prompt + assetDetails + stylePrompt;

            const result = await generateImage(
                finalPrompt,
                apiKeys.gemini,
                allReferenceImages.length > 0 ? allReferenceImages : undefined,
                aspectRatio,
                imageModel
            );

            const updatedScript = currentScript.map(cut =>
                cut.id === cutId ? { ...cut, finalImageUrl: result.url } : cut
            );
            setLocalScript(updatedScript);
            saveToStore(updatedScript);

            console.log(`[Image ${cutId}] ✅ Generated successfully`);
        } catch (error) {
            console.error(`[Image ${cutId}] ❌ Generation failed:`, error);
        } finally {
            setImageLoading(prev => ({ ...prev, [cutId]: false }));
        }
    }, [apiKeys.gemini, aspectRatio, imageModel, assetDefinitions, masterStyle, styleAnchor]);

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

    // Helper: Get default voice for language and gender
    const getDefaultVoiceForLanguage = (
        language: 'en-US' | 'ko-KR',
        gender: 'male' | 'female' | 'neutral',
        age: 'child' | 'young' | 'adult' | 'senior' = 'adult'
    ): string => {
        if (language === 'ko-KR') {
            // Chirp 3 HD Korean voices mapping
            if (gender === 'female') {
                if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Leda';
                if (age === 'senior') return 'ko-KR-Chirp3-HD-Kore';
                return 'ko-KR-Chirp3-HD-Aoede'; // Default Adult
            } else {
                if (age === 'child' || age === 'young') return 'ko-KR-Chirp3-HD-Puck';
                if (age === 'senior') return 'ko-KR-Chirp3-HD-Charon';
                return 'ko-KR-Chirp3-HD-Fenrir'; // Default Adult
            }
        } else {
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

            // 1. Detect language from cut metadata OR auto-detect from dialogue text
            const language = currentCut?.language || detectLanguageFromText(dialogue);

            // 2. Find character voice settings or use defaults
            const allCharacters = [...(characters || []), ...(episodeCharacters || [])];
            const character = allCharacters.find(c => c.name.toLowerCase() === speaker.toLowerCase());

            const genderToUse = (currentCut?.voiceGender && currentCut.voiceGender !== 'neutral')
                ? currentCut.voiceGender
                : detectGender(speaker);

            const voiceName = character?.voiceId || getDefaultVoiceForLanguage(
                language,
                genderToUse,
                currentCut?.voiceAge || 'adult'
            );

            // 3. Determine model type
            const isChirp3 = voiceName.includes('Chirp3-HD');
            const model = isChirp3 ? 'chirp3-hd' : 'neural2';

            // 4. Build voice config with emotion-based prosody
            const voiceConfig: VoiceConfig = {
                language,
                rate: getEmotionRate(currentCut?.emotion),
                volume: currentCut?.emotionIntensity === 'high' ? '+3dB' : currentCut?.emotionIntensity === 'low' ? '-3dB' : undefined
            };

            // Add pitch only for Neural2 (not Chirp 3 HD)
            if (!isChirp3) {
                voiceConfig.pitch = getEmotionPitch(currentCut?.emotion, currentCut?.emotionIntensity);
            }

            console.log(`[Audio ${cutId}] Voice: ${voiceName}, Model: ${model}, Language: ${language}`);
            console.log(`[Audio ${cutId}] Emotion: ${currentCut?.emotion} (${currentCut?.emotionIntensity})`);
            console.log(`[Audio ${cutId}] VoiceConfig:`, voiceConfig);

            const audioUrl = await generateSpeech(dialogue, voiceName, apiKeys.googleCloud, model, voiceConfig);
            console.log(`[Audio ${cutId}] Generated successfully`);

            const updatedScript = currentScript.map(cut =>
                cut.id === cutId ? {
                    ...cut,
                    audioUrl,
                    language,
                    emotion: currentCut?.emotion,
                    emotionIntensity: currentCut?.emotionIntensity,
                    voiceGender: genderToUse,
                    voiceAge: currentCut?.voiceAge || 'adult'
                } : cut
            );
            setLocalScript(updatedScript);
            saveToStore(updatedScript);
        } catch (error: any) {
            console.error(`[Audio ${cutId}] Failed:`, error);
            alert(`Audio generation failed: ${error.message}`);
        } finally {
            setAudioLoading(prev => ({ ...prev, [cutId]: false }));
        }
    }, [apiKeys.googleCloud, characters, episodeCharacters]);

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
        if (audio) {
            if (playingAudio === cutId) {
                audio.pause();
                audio.currentTime = 0;
                setPlayingAudio(null);
            } else {
                // Ensure audio is loaded
                audio.load();

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch((error) => {
                        // Ignore AbortError (happens when clicking fast)
                        if (error.name !== 'AbortError') {
                            console.error(`[Audio ${cutId}] Playback failed:`, error);
                            alert(`Playback failed: ${error.message}`);
                        }
                        setPlayingAudio(null);
                    });
                }

                setPlayingAudio(cutId);
                audio.onended = () => setPlayingAudio(null);
                audio.onerror = () => {
                    console.error(`[Audio ${cutId}] Element error:`, audio.error);
                    setPlayingAudio(null);
                };
            }
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

            // NEW: Sync changes back to storyline table
            if (storylineTable && storylineTable.length > 0) {
                const updatedStoryline = syncCutsToStoryline(updated, storylineTable);
                setProjectInfo({ storylineTable: updatedStoryline });
            }

            return updated;
        });
    }, [storylineTable, setProjectInfo]);

    const toggleConfirm = useCallback((cutId: number) => {
        setLocalScript(prev => {
            const updated = prev.map(cut =>
                cut.id === cutId ? { ...cut, isConfirmed: !cut.isConfirmed } : cut
            );
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

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Script & Production</h2>
                    <p className="text-[var(--color-text-muted)]">Generate assets per cut and confirm when ready.</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex flex-col">
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 font-medium">Image Model</label>
                        <select
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-4 py-2 outline-none focus:border-[var(--color-primary)] min-w-[200px]"
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value as any)}
                        >
                            {IMAGE_MODELS.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.label} {model.cost}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-[var(--color-text-muted)] mt-1">
                            {IMAGE_MODELS.find(m => m.value === imageModel)?.hint}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 font-medium">TTS Model</label>
                        <select
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-4 py-2 outline-none focus:border-[var(--color-primary)] min-w-[200px]"
                            value={ttsModel}
                            onChange={(e) => setTtsModel(e.target.value as any)}
                        >
                            {TTS_MODELS.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.label} {model.cost}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-[var(--color-text-muted)] mt-1">
                            {TTS_MODELS.find(m => m.value === ttsModel)?.hint}
                        </span>
                    </div>
                    <button
                        onClick={handleGenerateScript}
                        disabled={loading}
                        className="btn-secondary flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                        {localScript.length > 0 ? 'Regenerate Script' : 'Generate Script'}
                    </button>
                </div>
            </div>

            {/* Storyline Indicator */}
            {storylineTable && storylineTable.length > 0 && (
                <div className="glass-panel p-3 border-l-4 border-blue-500">
                    <p className="text-sm text-blue-300 flex items-center gap-2">
                        <span className="text-lg">{'\uD83D\uDCCB'}</span>
                        Script generated from {storylineTable.length} storyline scene{storylineTable.length > 1 ? 's' : ''}.
                        Edits will sync back to Step 1.
                    </p>
                </div>
            )}

            {/* Progress Bar */}
            {localScript.length > 0 && (
                <div className="glass-panel p-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-white">Progress: {confirmedCount}/{totalCount} cuts confirmed</span>
                        <span className="text-sm text-[var(--color-text-muted)]">{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-green-500 transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Scrollable Cuts Container */}
            <div className={localScript.length === 0 ? '' : 'h-[calc(100vh-280px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent'}>
                <div className="space-y-4">
                    {localScript.length === 0 ? (
                        <div className="glass-panel p-12 text-center space-y-6">
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
                        <div className="grid gap-6">
                            {localScript.map((cut, index) => (
                                <CutItem
                                    key={cut.id}
                                    cut={cut}
                                    index={index}
                                    isConfirmed={cut.isConfirmed || false}
                                    showAssetSelector={showAssetSelector === cut.id}
                                    assetDefinitions={assetDefinitions}
                                    localScript={localScript}
                                    audioLoading={!!audioLoading[cut.id]}
                                    imageLoading={!!imageLoading[cut.id]}
                                    playingAudio={playingAudio}
                                    aspectRatio={aspectRatio || '16:9'}
                                    onToggleConfirm={toggleConfirm}
                                    onUpdateCut={handleUpdateCut}
                                    onGenerateAudio={handleGenerateAudio}
                                    onPlayAudio={handlePlayAudio}
                                    onGenerateImage={handleGenerateFinalImage}
                                    onAddAsset={addAssetToCut}
                                    onRemoveAsset={removeAssetFromCut}
                                    onAddReference={addCutReference}
                                    onRemoveReference={removeCutReference}
                                    onToggleAssetSelector={(id) => setShowAssetSelector(showAssetSelector === id ? null : id)}
                                    onCloseAssetSelector={() => setShowAssetSelector(null)}
                                    onSave={handleSave}
                                    onDelete={handleDeleteCut}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {localScript.length > 0 && (
                <div className="flex justify-end pt-6 pb-12">
                    <button
                        onClick={handleApprove}
                        className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-105 transition-all sticky bottom-8"
                    >
                        Next Step
                        <ArrowRight size={24} />
                    </button>
                </div>
            )}
        </div>
    );
};
