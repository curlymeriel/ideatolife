import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { Play, Image as ImageIcon, ArrowRight, ArrowLeft, BarChart3, Pause } from 'lucide-react';
import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { TimelineView } from '../components/Production/TimelineView';

export const Step4_QualityAssurance: React.FC = () => {
    const { id: projectId, script, nextStep, prevStep, bgmTracks, setBGMTracks } = useWorkflowStore();
    const navigate = useNavigate();

    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

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
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.audioUrl && cut.audioUrl !== 'mock:beep') {
                    if (isIdbUrl(cut.audioUrl)) {
                        const resolvedUrl = await resolveUrl(cut.audioUrl, { asBlob: true });
                        if (resolvedUrl) resolved[cut.id] = resolvedUrl;
                    } else {
                        resolved[cut.id] = cut.audioUrl;
                    }
                }
            }
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
                        resolved[cut.id] = cut.sfxUrl;
                    }
                }
            }
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

    const currentCut = script[currentCutIndex];
    const currentResolvedImage = currentCut ? resolvedImages[currentCut.id] : undefined;

    const handlePrevCut = () => {
        setCurrentCutIndex(Math.max(0, currentCutIndex - 1));
    };

    const handleNextCut = () => {
        setCurrentCutIndex(Math.min(script.length - 1, currentCutIndex + 1));
    };

    const handlePlaySequential = () => {
        if (!currentCut?.audioUrl) return;

        // Get the resolved audio URL
        const resolvedAudioUrl = resolvedAudios[currentCut.id];
        const resolvedSfxUrl = resolvedSfx[currentCut.id];
        const sfxVolume = currentCut.sfxVolume ?? 0.3;

        if (!resolvedAudioUrl) {
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
                // Ensure audio src is set
                if (audio.src !== resolvedAudioUrl) {
                    audio.src = resolvedAudioUrl;
                }
                audio.load();

                // Also prepare SFX if available
                if (sfxAudio && resolvedSfxUrl) {
                    sfxAudio.src = resolvedSfxUrl;
                    sfxAudio.volume = sfxVolume;
                    sfxAudio.load();
                }

                // Play main audio
                audio.play().catch(console.error);

                // Play SFX simultaneously
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
                    if (sfxAudio) sfxAudio.pause();
                    Object.values(bgmRefs.current).forEach(bgm => {
                        bgm.pause();
                    });
                    // Auto-advance
                    if (currentCutIndex < script.length - 1) {
                        setTimeout(() => {
                            setCurrentCutIndex(currentCutIndex + 1);
                        }, 500);
                    }
                };
            }
        }
    };

    const handleFinish = () => {
        nextStep();
        navigate('/step/5');
    };

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-120px)] overflow-hidden">
            {/* Main Preview Area */}
            <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                {/* Left Controls / Nav (Simplified) */}
                <div className="w-[200px] shrink-0 flex flex-col gap-4">
                    <div className="glass-panel p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart3 className="text-[var(--color-primary)]" size={18} />
                            <h2 className="text-sm font-bold text-white">Review</h2>
                        </div>
                        <p className="text-[10px] text-gray-400">
                            Check the visuals and audio flow before finalizing video.
                        </p>
                    </div>

                    <div className="glass-panel p-4 flex flex-col gap-2 flex-1 relative">
                        {/* Mini Map or Stats could go here, but for now just navigation */}
                        <div className="flex items-center justify-between text-xs text-white mb-2">
                            <span>Cut</span>
                            <span className="font-bold text-[var(--color-primary)]">{currentCutIndex + 1} / {script.length}</span>
                        </div>

                        <div className="flex flex-col gap-2 mt-auto">
                            <button
                                onClick={() => { prevStep(); navigate('/step/3'); }}
                                className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white text-xs transition-all"
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                            <button
                                onClick={handleFinish}
                                className="w-full btn-primary flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-bold text-xs shadow-lg hover:scale-105 transition-all"
                            >
                                Next Step <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Center: Image & Dialogue */}
                <div className="flex-1 flex flex-col gap-4 glass-panel p-6 h-full">
                    {/* Main Image */}
                    <div className="flex-1 relative min-h-0 rounded-lg overflow-hidden bg-black/40 border border-white/5">
                        {currentResolvedImage ? (
                            <img
                                src={currentResolvedImage}
                                alt={`Cut ${currentCut?.id}`}
                                className="absolute inset-0 w-full h-full object-contain"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-600 flex-col gap-2">
                                <ImageIcon size={48} />
                                <span className="text-xs">No Image</span>
                            </div>
                        )}

                        {/* Cut info overlay */}
                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-xs font-bold text-white">
                            Cut #{currentCutIndex + 1}
                        </div>
                    </div>

                    {/* Playback Controls & Dialogue */}
                    <div className="h-[120px] shrink-0 flex items-start gap-6 pt-2">
                        <div className="shrink-0 flex items-center gap-3 pt-2">
                            <button onClick={handlePrevCut} disabled={currentCutIndex === 0} className="p-2 hover:bg-white/10 rounded-full text-white disabled:opacity-30">
                                <ArrowLeft size={20} />
                            </button>
                            <button
                                onClick={handlePlaySequential}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isPlaying
                                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 ring-2 ring-red-500/50'
                                    : 'bg-[var(--color-primary)] text-black hover:scale-110 shadow-lg shadow-[var(--color-primary)]/30'
                                    }`}
                            >
                                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                            </button>
                            <button onClick={handleNextCut} disabled={currentCutIndex === script.length - 1} className="p-2 hover:bg-white/10 rounded-full text-white disabled:opacity-30">
                                <ArrowRight size={20} />
                            </button>
                        </div>

                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-bold text-white uppercase tracking-wider">
                                    {currentCut?.speaker}
                                </span>
                            </div>
                            <p className="text-lg text-white font-medium leading-relaxed">
                                "{currentCut?.dialogue}"
                            </p>
                            <p className="text-xs text-gray-500 line-clamp-1">
                                {currentCut?.visualPrompt}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom: Timeline (Fixed Height) */}
            <div className="h-[320px] shrink-0">
                {script.length > 0 ? (
                    <TimelineView
                        script={script}
                        bgmTracks={bgmTracks || []}
                        currentCutIndex={currentCutIndex}
                        onCutClick={setCurrentCutIndex}
                        onBGMUpdate={setBGMTracks}
                    />
                ) : (
                    <div className="h-full glass-panel flex items-center justify-center text-gray-500">
                        No script data available.
                    </div>
                )}
            </div>

            {/* Hidden Audio Elements */}
            <audio id="sequential-audio" className="hidden" />
            <audio id="sequential-sfx" className="hidden" />
        </div>
    );
};
