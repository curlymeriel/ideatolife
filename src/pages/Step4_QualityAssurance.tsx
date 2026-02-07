import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateImage } from '../services/imageGen';
import { generateSpeech } from '../services/tts';
import { generateGeminiSpeech } from '../services/geminiTts';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2, Image as ImageIcon, Music, ArrowRight, ArrowLeft, BarChart3, CheckCircle, Pause, LayoutList, Clock } from 'lucide-react';
import { resolveUrl, isIdbUrl, generateAudioKey, saveToIdb } from '../utils/imageStorage';
import { TimelineView } from '../components/Production/TimelineView';
import { GlobalBGMEditor } from '../components/Production/GlobalBGMEditor';

export const Step4_QualityAssurance: React.FC = () => {
    const { id: projectId, script, apiKeys, ttsModel, imageModel, nextStep, prevStep, assetDefinitions, aspectRatio, masterStyle, setScript, bgmTracks, setBGMTracks } = useWorkflowStore();
    const navigate = useNavigate();

    const [batchLoading, setBatchLoading] = useState(false);
    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

    // Resolved image URLs for idb:// references
    const [resolvedImages, setResolvedImages] = useState<Record<number, string>>({});
    // Resolved audio URLs for idb:// references
    const [resolvedAudios, setResolvedAudios] = useState<Record<number, string>>({});
    // Resolved SFX URLs for idb:// or external references
    const [resolvedSfx, setResolvedSfx] = useState<Record<number, string>>({});

    // BGM audio refs for preview playback
    const bgmRefs = useRef<Record<string, HTMLAudioElement>>({});

    // CRITICAL: Reset state when project changes to prevent showing old project data
    useEffect(() => {
        console.log(`[Step4] Project changed to ${projectId} - resetting cached state`);
        setCurrentCutIndex(0);
        setResolvedImages({});
        setResolvedAudios({});
        setResolvedSfx({});
        setIsPlaying(false);
    }, [projectId]);

    // Resolve all idb:// image URLs
    useEffect(() => {
        const resolveAllImages = async () => {
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.finalImageUrl) {
                    if (isIdbUrl(cut.finalImageUrl)) {
                        resolved[cut.id] = await resolveUrl(cut.finalImageUrl);
                    } else {
                        resolved[cut.id] = cut.finalImageUrl;
                    }
                }
            }
            setResolvedImages(resolved);
        };
        resolveAllImages();
    }, [script]);

    // Resolve all idb:// audio URLs
    useEffect(() => {
        const resolveAllAudios = async () => {
            console.log('[Step4] Starting audio resolution for', script.length, 'cuts');
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.audioUrl && cut.audioUrl !== 'mock:beep') {
                    console.log(`[Step4] Cut ${cut.id} audioUrl:`, cut.audioUrl.substring(0, 50) + '...');
                    if (isIdbUrl(cut.audioUrl)) {
                        console.log(`[Step4] Cut ${cut.id} - Resolving idb:// URL`);
                        const resolvedUrl = await resolveUrl(cut.audioUrl, { asBlob: true });
                        if (resolvedUrl) {
                            console.log(`[Step4] Cut ${cut.id} - Resolved successfully (Blob URL)`);
                            resolved[cut.id] = resolvedUrl;
                        } else {
                            console.warn(`[Step4] Cut ${cut.id} - Failed to resolve idb:// URL`);
                        }
                    } else {
                        // Already a data: URL or http URL
                        console.log(`[Step4] Cut ${cut.id} - Using direct URL`);
                        resolved[cut.id] = cut.audioUrl;
                    }
                }
            }
            console.log('[Step4] Audio resolution complete. Resolved:', Object.keys(resolved).length, 'audios');
            setResolvedAudios(resolved);
        };
        resolveAllAudios();

        return () => {
            // Cleanup: Revoke all audio blob URLs
            const audios = resolvedAudios;
            Object.values(audios).forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [script]);

    // Resolve all SFX URLs
    useEffect(() => {
        const resolveAllSfx = async () => {
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.sfxUrl) {
                    if (isIdbUrl(cut.sfxUrl)) {
                        const resolvedUrl = await resolveUrl(cut.sfxUrl, { asBlob: true });
                        if (resolvedUrl) resolved[cut.id] = resolvedUrl;
                    } else {
                        // Direct URL (data:, http:, etc.)
                        resolved[cut.id] = cut.sfxUrl;
                    }
                }
            }
            console.log('[Step4] SFX resolution complete. Resolved:', Object.keys(resolved).length, 'SFX tracks');
            setResolvedSfx(resolved);
        };
        resolveAllSfx();

        return () => {
            // Cleanup: Revoke all SFX blob URLs
            const sfxs = resolvedSfx;
            Object.values(sfxs).forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [script]);

    // Calculate statistics
    const getMissingAssets = () => {
        const missingAudio = script.filter(cut => !cut.audioUrl || cut.audioUrl === 'mock:beep');
        const missingImages = script.filter(cut => !cut.finalImageUrl);
        return { missingAudio, missingImages };
    };

    const { missingAudio, missingImages } = getMissingAssets();
    // Calculate confirmed count using granular flags (consistent with Step 3)
    const confirmedCount = script.filter(c => {
        const isAudioDone = c.isAudioConfirmed || c.isConfirmed;
        const isImageDone = c.isImageConfirmed || c.isConfirmed;
        return isAudioDone && isImageDone;
    }).length;
    const totalCount = script.length;
    const completionPercent = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

    // Sequential playback
    const currentCut = script[currentCutIndex];
    const currentResolvedImage = currentCut ? resolvedImages[currentCut.id] : undefined;

    const handlePrevCut = () => {
        setCurrentCutIndex(Math.max(0, currentCutIndex - 1));
    };

    const handleNextCut = () => {
        setCurrentCutIndex(Math.min(script.length - 1, currentCutIndex + 1));
    };

    // Stop audio when cut changes
    React.useEffect(() => {
        const audio = document.getElementById(`sequential-audio`) as HTMLAudioElement;
        const sfxAudio = document.getElementById(`sequential-sfx`) as HTMLAudioElement;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        if (sfxAudio) {
            sfxAudio.pause();
            sfxAudio.currentTime = 0;
        }
        // Also stop BGM
        Object.values(bgmRefs.current).forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        setIsPlaying(false);
    }, [currentCutIndex]);

    // Initialize BGM audio elements
    useEffect(() => {
        // Cleanup old
        Object.values(bgmRefs.current).forEach(audio => {
            audio.pause();
            audio.src = '';
        });
        bgmRefs.current = {};

        if (!bgmTracks || bgmTracks.length === 0) return;

        bgmTracks.forEach(track => {
            if (!track.url) return;
            const audio = new Audio(track.url);
            audio.loop = track.loop;
            audio.volume = track.volume ?? 0.5;
            audio.preload = 'auto';
            bgmRefs.current[track.id] = audio;
        });

        return () => {
            Object.values(bgmRefs.current).forEach(audio => {
                audio.pause();
                audio.src = '';
            });
        };
    }, [bgmTracks]);

    const handlePlaySequential = () => {
        if (!currentCut?.audioUrl) {
            console.warn('[Step4] No audioUrl for current cut');
            return;
        }

        // Get the resolved audio URL
        const resolvedAudioUrl = resolvedAudios[currentCut.id];
        const resolvedSfxUrl = resolvedSfx[currentCut.id];
        const sfxVolume = currentCut.sfxVolume ?? 0.3;

        console.log(`[Step4] Playing cut ${currentCut.id}:`, {
            originalUrl: currentCut.audioUrl.substring(0, 50) + '...',
            resolvedUrl: resolvedAudioUrl ? resolvedAudioUrl.substring(0, 50) + '...' : 'NOT RESOLVED',
            hasSfx: !!resolvedSfxUrl,
            sfxVolume,
            isIdb: isIdbUrl(currentCut.audioUrl)
        });

        if (!resolvedAudioUrl) {
            console.error(`[Step4] No resolved audio URL for cut ${currentCut.id}. audioUrl is idb:// but not resolved yet.`);
            alert('Audio is still loading. Please try again in a moment.');
            return;
        }

        const audio = document.getElementById(`sequential-audio`) as HTMLAudioElement;
        const sfxAudio = document.getElementById(`sequential-sfx`) as HTMLAudioElement;

        if (audio) {
            if (isPlaying) {
                audio.pause();
                if (sfxAudio) sfxAudio.pause();
                // Stop BGM
                Object.values(bgmRefs.current).forEach(bgm => {
                    bgm.pause();
                });
                setIsPlaying(false);
            } else {
                // Ensure audio src is set (for cases where React rendering hasn't caught up)
                if (audio.src !== resolvedAudioUrl) {
                    audio.src = resolvedAudioUrl;
                }

                // Ensure audio is loaded
                audio.load();

                // Also prepare SFX if available
                if (sfxAudio && resolvedSfxUrl) {
                    sfxAudio.src = resolvedSfxUrl;
                    sfxAudio.volume = sfxVolume;
                    sfxAudio.load();
                }

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            console.error('Playback failed:', error);
                        }
                        setIsPlaying(false);
                    });
                }

                // Play SFX simultaneously (fire and forget)
                if (sfxAudio && resolvedSfxUrl) {
                    sfxAudio.play().catch(e => console.warn('SFX playback failed:', e));
                }

                setIsPlaying(true);

                // Play matching BGM track(s)
                (bgmTracks || []).forEach(track => {
                    const startIdx = script.findIndex(c => String(c.id) === String(track.startCutId));
                    const endIdx = script.findIndex(c => String(c.id) === String(track.endCutId));

                    if (startIdx === -1) return;

                    const validEnd = endIdx !== -1 ? endIdx : script.length - 1;

                    // Check if current cut is within this track's range
                    if (currentCutIndex >= startIdx && currentCutIndex <= validEnd) {
                        const bgmAudio = bgmRefs.current[track.id];
                        if (bgmAudio) {
                            bgmAudio.currentTime = 0;
                            bgmAudio.play().catch(e => console.warn('BGM play failed:', e));
                        }
                    }
                });
                audio.onended = () => {
                    setIsPlaying(false);
                    // Stop SFX when TTS ends
                    if (sfxAudio) sfxAudio.pause();
                    // Stop BGM when TTS ends
                    Object.values(bgmRefs.current).forEach(bgm => {
                        bgm.pause();
                    });
                    // Auto-advance to next cut
                    if (currentCutIndex < script.length - 1) {
                        setTimeout(() => {
                            setCurrentCutIndex(currentCutIndex + 1);
                        }, 500);
                    }
                };
                audio.onerror = () => {
                    console.error('Audio element error:', audio.error);
                    setIsPlaying(false);
                };
            }
        } else {
            console.error('[Step4] Audio element not found in DOM');
        }
    };

    // Batch generation for missing assets
    const handleGenerateMissing = async () => {
        setBatchLoading(true);
        const { missingAudio, missingImages } = getMissingAssets();

        try {
            // Generate missing audio
            for (const cut of missingAudio) {
                if (!cut.dialogue) continue;

                try {
                    console.log(`[Batch Audio] Generating for cut ${cut.id}`);
                    let audioUrl: string | Blob = '';

                    if (ttsModel === 'gemini-tts') {
                        // Use Gemini TTS for batch if selected
                        const geminiConfig = {
                            voiceName: cut.voiceId || 'Puck',
                            languageCode: cut.language || 'ko-KR',
                            actingDirection: cut.actingDirection
                        };
                        const audioData = await generateGeminiSpeech(cut.dialogue, apiKeys.gemini, geminiConfig);
                        audioUrl = audioData as any; // Temporary cast to match existing logic if needed, or better: update audioUrl type
                    } else {
                        // Default to Google Cloud TTS
                        audioUrl = await generateSpeech(cut.dialogue, cut.voiceId || 'en-US-Neural2-A', apiKeys.googleCloud, ttsModel as any);
                    }

                    // Save to IndexedDB
                    const audioKey = generateAudioKey(projectId, cut.id);
                    const idbAudioUrl = await saveToIdb('audio', audioKey, audioUrl);

                    // Update script
                    const updatedScript = script.map(c =>
                        c.id === cut.id ? { ...c, audioUrl: idbAudioUrl } : c
                    );
                    setScript(updatedScript);
                    console.log(`[Batch Audio] Success for cut ${cut.id}`);
                } catch (error) {
                    console.error(`[Batch Audio] Failed for cut ${cut.id}:`, error);
                }
            }

            // Generate missing images
            for (const cut of missingImages) {
                if (!cut.visualPrompt) continue;

                try {
                    console.log(`[Batch Image] Generating for cut ${cut.id}`);

                    // Build reference images (same logic as Step 4)
                    const referenceImages: string[] = [];
                    Object.values(assetDefinitions || {}).forEach((asset: any) => {
                        if (cut.visualPrompt.toLowerCase().includes(asset.name.toLowerCase())) {
                            const imageToUse = asset.draftImage || asset.referenceImage;
                            if (imageToUse) {
                                referenceImages.push(imageToUse);
                            }
                        }
                    });

                    let stylePrompt = '';
                    if (masterStyle?.description) {
                        stylePrompt += `\n\n[Master Visual Style]\n${masterStyle.description}`;
                    }
                    // NOTE: styleAnchor.prompts removed from image prompt
                    // Reason: Raw JSON like {"font":"Inter, sans-serif"} was being rendered as text in images

                    const finalPrompt = cut.visualPrompt + stylePrompt;

                    const result = await generateImage(
                        finalPrompt,
                        apiKeys.gemini,
                        referenceImages.length > 0 ? referenceImages : undefined,
                        aspectRatio,
                        imageModel
                    );

                    const updatedScript = script.map(c =>
                        c.id === cut.id ? { ...c, finalImageUrl: result.urls[0] } : c
                    );
                    setScript(updatedScript);
                    console.log(`[Batch Image] Success for cut ${cut.id}`);
                } catch (error) {
                    console.error(`[Batch Image] Failed for cut ${cut.id}:`, error);
                }
            }

            alert('Batch generation complete!');
        } catch (error) {
            console.error('Batch generation error:', error);
            alert('Some assets failed to generate. Check console for details.');
        } finally {
            setBatchLoading(false);
        }
    };

    const handleFinish = () => {
        nextStep();
        navigate('/step/5');
    };

    return (
        <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* LEFT SIDEBAR - 1/4 width */}
            <div className="w-1/4 min-w-[280px] max-w-[360px] flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">

                {/* Header & Stats */}
                <div className="glass-panel p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="text-[var(--color-primary)]" size={18} />
                        <h2 className="text-lg font-bold text-white">Post-Production</h2>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-[var(--color-text-muted)]">Progress</span>
                            <span className="text-xs text-[var(--color-primary)] font-bold">{completionPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[var(--color-primary)] to-green-500 transition-all duration-300"
                                style={{ width: `${completionPercent}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
                            {confirmedCount}/{totalCount} cuts confirmed
                        </div>
                    </div>

                    {/* Missing Stats */}
                    {(missingAudio.length > 0 || missingImages.length > 0) && (
                        <div className="flex gap-3 mb-3 text-xs">
                            {missingAudio.length > 0 && (
                                <div className="flex items-center gap-1 text-yellow-400">
                                    <Music size={12} />
                                    <span>{missingAudio.length} audio</span>
                                </div>
                            )}
                            {missingImages.length > 0 && (
                                <div className="flex items-center gap-1 text-orange-400">
                                    <ImageIcon size={12} />
                                    <span>{missingImages.length} images</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Generate Button */}
                    {(missingAudio.length > 0 || missingImages.length > 0) && (
                        <button
                            onClick={handleGenerateMissing}
                            disabled={batchLoading}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-black text-xs font-bold rounded-lg transition-all disabled:opacity-50"
                        >
                            {batchLoading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                            Generate Missing
                        </button>
                    )}
                </div>

                {/* Grid Overview - Scrollable */}
                <div className="glass-panel p-3 flex-1 overflow-y-auto">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2 sticky top-0 bg-[var(--color-surface-highlight)] py-1 -mt-1 -mx-1 px-1">
                        <ImageIcon className="text-[var(--color-primary)]" size={14} />
                        All Cuts
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {script.map((cut, index) => {
                            const hasAudio = !!cut.audioUrl;
                            const hasImage = !!cut.finalImageUrl;
                            const isComplete = hasAudio && hasImage && cut.isConfirmed;
                            const hasIssues = !hasAudio || !hasImage;

                            return (
                                <div
                                    key={cut.id}
                                    onClick={() => setCurrentCutIndex(index)}
                                    className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all hover:scale-105 ${currentCutIndex === index
                                        ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/50'
                                        : isComplete
                                            ? 'border-green-500/50'
                                            : hasIssues
                                                ? 'border-yellow-500/30'
                                                : 'border-[var(--color-border)]'
                                        }`}
                                >
                                    {hasImage && resolvedImages[cut.id] ? (
                                        <div className="aspect-video bg-[var(--color-bg)]">
                                            <img
                                                src={resolvedImages[cut.id]}
                                                alt={`Cut ${cut.id}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div className="aspect-video bg-[var(--color-bg)] flex items-center justify-center">
                                            <ImageIcon size={16} className="text-gray-600" />
                                        </div>
                                    )}
                                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white text-[10px] font-bold">#{cut.id}</span>
                                            <div className="flex gap-0.5">
                                                {!hasAudio && <Music size={8} className="text-yellow-500" />}
                                                {!hasImage && <ImageIcon size={8} className="text-orange-500" />}
                                                {isComplete && <CheckCircle size={8} className="text-green-500" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex gap-2">
                    <button
                        onClick={() => { prevStep(); navigate('/step/3'); }}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white text-xs transition-all"
                    >
                        <ArrowLeft size={14} />
                        Back
                    </button>
                    <button
                        onClick={handleFinish}
                        className="flex-1 btn-primary flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-bold text-xs"
                    >
                        Next Step
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>

            {/* RIGHT CONTENT - 3/4 width */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                {script.length > 0 && currentCut ? (
                    <>
                        {/* View Mode Toggle */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">
                                Cut {currentCutIndex + 1} / {script.length}
                            </span>
                            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <LayoutList size={14} />
                                    List
                                </button>
                                <button
                                    onClick={() => setViewMode('timeline')}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-all ${viewMode === 'timeline' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Clock size={14} />
                                    Timeline
                                </button>
                            </div>
                        </div>

                        {/* Main Image Display */}
                        <div className="flex-1 glass-panel p-4 flex flex-col overflow-hidden">
                            {/* Image Container - Flex grow to fill space */}
                            <div className="flex-1 relative min-h-0">
                                {currentResolvedImage ? (
                                    <img
                                        src={currentResolvedImage}
                                        alt={`Cut ${currentCut.id}`}
                                        className="absolute inset-0 w-full h-full object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-[var(--color-bg)] border border-[var(--color-border)] border-dashed rounded-lg flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                                            <ImageIcon size={48} className="text-gray-600" />
                                            <p>No image generated</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Dialogue & Playback Controls */}
                        <div className="glass-panel p-4">
                            <div className="flex items-start gap-4">
                                {/* Dialogue Text */}
                                <div className="flex-1">
                                    <p className="text-sm text-[var(--color-primary)] font-bold mb-1">{currentCut.speaker}</p>
                                    <p className="text-white text-base italic">"{currentCut.dialogue}"</p>
                                    <p className="text-[10px] text-[var(--color-text-muted)] mt-1 line-clamp-1">{currentCut.visualPrompt}</p>
                                </div>

                                {/* Playback Controls */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={handlePrevCut}
                                        disabled={currentCutIndex === 0}
                                        className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>

                                    {currentCut.audioUrl && (
                                        <>
                                            <button
                                                onClick={handlePlaySequential}
                                                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-black font-bold transition-all"
                                            >
                                                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                                                {isPlaying ? 'Pause' : 'Play'}
                                            </button>
                                            {currentCut.audioUrl !== 'mock:beep' && (
                                                <>
                                                    <audio
                                                        id="sequential-audio"
                                                        src={resolvedAudios[currentCut.id] || undefined}
                                                        preload="metadata"
                                                    />
                                                    {/* SFX Audio Element */}
                                                    <audio
                                                        id="sequential-sfx"
                                                        src={resolvedSfx[currentCut.id] || undefined}
                                                        preload="metadata"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}

                                    <button
                                        onClick={handleNextCut}
                                        disabled={currentCutIndex === script.length - 1}
                                        className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ArrowRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Timeline View (when selected) */}
                        {viewMode === 'timeline' && (
                            <TimelineView
                                script={script}
                                bgmTracks={bgmTracks || []}
                                currentCutIndex={currentCutIndex}
                                onCutClick={setCurrentCutIndex}
                                onBGMUpdate={setBGMTracks}
                            />
                        )}

                        {/* BGM Editor (always visible in timeline mode) */}
                        {viewMode === 'timeline' && (
                            <GlobalBGMEditor
                                tracks={bgmTracks || []}
                                onChange={setBGMTracks}
                                totalCuts={script.length}
                            />
                        )}
                    </>
                ) : (
                    <div className="flex-1 glass-panel p-12 flex items-center justify-center">
                        <div className="text-center">
                            <ImageIcon size={64} className="text-gray-600 mx-auto mb-4" />
                            <p className="text-[var(--color-text-muted)]">No cuts available. Generate a script in Step 3 first.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
