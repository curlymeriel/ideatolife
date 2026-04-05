import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { Play, Image as ImageIcon, ArrowRight, ArrowLeft, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { TimelineView } from '../components/Production/TimelineView';
import { WatermarkSettingsModal } from '../components/Production/WatermarkSettingsModal';
import { getAspectRatioCss } from '../utils/aspectRatioUtils';

export const Step4_PostProduction: React.FC = () => {
    const { id: projectId, script, nextStep, prevStep, bgmTracks, setBGMTracks, aspectRatio, watermarkSettings, setWatermarkSettings } = useWorkflowStore();
    const navigate = useNavigate();

    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState(false);

    const [resolvedImages, setResolvedImages] = useState<Record<number, string>>({});
    const [resolvedAudios, setResolvedAudios] = useState<Record<number, string>>({});
    const [resolvedSfx, setResolvedSfx] = useState<Record<number, string>>({});

    const bgmRefs = useRef<Record<string, HTMLAudioElement>>({});

    // Reset on project change
    useEffect(() => {
        setCurrentCutIndex(0);
        setResolvedImages({});
        setResolvedAudios({});
        setResolvedSfx({});
        setIsPlaying(false);
    }, [projectId]);

    // Resolve image URLs
    useEffect(() => {
        const resolveAllImages = async () => {
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.finalImageUrl) {
                    resolved[cut.id] = isIdbUrl(cut.finalImageUrl)
                        ? await resolveUrl(cut.finalImageUrl)
                        : cut.finalImageUrl;
                }
            }
            setResolvedImages(resolved);
        };
        resolveAllImages();
    }, [script]);

    // Resolve audio URLs
    useEffect(() => {
        const resolveAllAudios = async () => {
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.audioUrl && cut.audioUrl !== 'mock:beep') {
                    if (isIdbUrl(cut.audioUrl)) {
                        const url = await resolveUrl(cut.audioUrl, { asBlob: true });
                        if (url) resolved[cut.id] = url;
                    } else {
                        resolved[cut.id] = cut.audioUrl;
                    }
                }
            }
            setResolvedAudios(resolved);
        };
        resolveAllAudios();
        return () => {
            Object.values(resolvedAudios).forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [script]);

    // Resolve SFX URLs
    useEffect(() => {
        const resolveAllSfx = async () => {
            const resolved: Record<number, string> = {};
            for (const cut of script) {
                if (cut.sfxUrl) {
                    if (isIdbUrl(cut.sfxUrl)) {
                        const url = await resolveUrl(cut.sfxUrl, { asBlob: true });
                        if (url) resolved[cut.id] = url;
                    } else {
                        resolved[cut.id] = cut.sfxUrl;
                    }
                }
            }
            setResolvedSfx(resolved);
        };
        resolveAllSfx();
        return () => {
            Object.values(resolvedSfx).forEach(url => {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [script]);

    // Init BGM audio elements
    useEffect(() => {
        const initBGM = async () => {
            Object.values(bgmRefs.current).forEach(audio => { audio.pause(); audio.src = ''; });
            bgmRefs.current = {};
            if (!bgmTracks || bgmTracks.length === 0) return;
            for (const track of bgmTracks) {
                if (!track.url) continue;
                let finalUrl = track.url;
                if (isIdbUrl(track.url)) finalUrl = await resolveUrl(track.url, { asBlob: true });
                if (finalUrl) {
                    const audio = new Audio(finalUrl);
                    audio.loop = track.loop;
                    audio.volume = track.volume ?? 0.5;
                    audio.preload = 'auto';
                    bgmRefs.current[track.id] = audio;
                }
            }
        };
        initBGM();
        return () => {
            Object.values(bgmRefs.current).forEach(audio => { audio.pause(); audio.src = ''; });
        };
    }, [bgmTracks]);

    // Stop audio on cut change
    React.useEffect(() => {
        const audio = document.getElementById('sequential-audio') as HTMLAudioElement;
        const sfxAudio = document.getElementById('sequential-sfx') as HTMLAudioElement;
        if (audio) { audio.pause(); audio.currentTime = 0; }
        if (sfxAudio) { sfxAudio.pause(); sfxAudio.currentTime = 0; }
        Object.values(bgmRefs.current).forEach(bgm => { bgm.pause(); bgm.currentTime = 0; });
        setIsPlaying(false);
    }, [currentCutIndex]);

    const currentCut = script[currentCutIndex];
    const currentResolvedImage = currentCut ? resolvedImages[currentCut.id] : undefined;

    const handlePrevCut = () => setCurrentCutIndex(Math.max(0, currentCutIndex - 1));
    const handleNextCut = () => setCurrentCutIndex(Math.min(script.length - 1, currentCutIndex + 1));

    const handlePlaySequential = () => {
        if (!currentCut?.audioUrl) return;
        const resolvedAudioUrl = resolvedAudios[currentCut.id];
        const resolvedSfxUrl = resolvedSfx[currentCut.id];
        const sfxVolume = currentCut.sfxVolume ?? 0.3;
        if (!resolvedAudioUrl) {
            alert('Audio is still loading. Please try again in a moment.');
            return;
        }
        const audio = document.getElementById('sequential-audio') as HTMLAudioElement;
        const sfxAudio = document.getElementById('sequential-sfx') as HTMLAudioElement;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            if (sfxAudio) sfxAudio.pause();
            Object.values(bgmRefs.current).forEach(bgm => bgm.pause());
            setIsPlaying(false);
        } else {
            if (audio.src !== resolvedAudioUrl) audio.src = resolvedAudioUrl;
            audio.load();
            if (sfxAudio && resolvedSfxUrl) {
                sfxAudio.src = resolvedSfxUrl;
                sfxAudio.volume = sfxVolume;
                sfxAudio.load();
            }
            audio.play().catch(console.error);
            if (sfxAudio && resolvedSfxUrl) sfxAudio.play().catch(e => console.warn('SFX playback failed:', e));
            setIsPlaying(true);

            (bgmTracks || []).forEach(track => {
                const startIdx = script.findIndex(c => String(c.id) === String(track.startCutId));
                const endIdx = script.findIndex(c => String(c.id) === String(track.endCutId));
                if (startIdx === -1) return;
                const validEnd = endIdx !== -1 ? endIdx : script.length - 1;
                if (currentCutIndex >= startIdx && currentCutIndex <= validEnd) {
                    const bgmAudio = bgmRefs.current[track.id];
                    if (bgmAudio) { bgmAudio.currentTime = 0; bgmAudio.play().catch(e => console.warn('BGM play failed:', e)); }
                }
            });

            audio.onended = () => {
                setIsPlaying(false);
                if (sfxAudio) sfxAudio.pause();
                Object.values(bgmRefs.current).forEach(bgm => bgm.pause());
                if (currentCutIndex < script.length - 1) {
                    setTimeout(() => setCurrentCutIndex(currentCutIndex + 1), 500);
                }
            };
        }
    };

    const handleFinish = () => { nextStep(); navigate('/step/5'); };

    // Compute CSS aspect-ratio for preview and thumbnails
    const aspectCss = getAspectRatioCss(aspectRatio);
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4';

    return (
        <div className="flex flex-col gap-3 h-[calc(100vh-120px)] overflow-hidden min-h-[700px]">
            {/* Description */}
            <div className="flex-none px-1">
                <p className="text-[var(--color-text-muted)] text-sm">
                    STEP 3에서 확정된 이미지, TTS 오디오, 음향 효과에 배경음악(BGM)을 결합하여 결과물의 전체 흐름을 확인 및 수정하는 단계입니다.
                </p>
            </div>

            {/* Main Area: Left Panel + Right Preview */}
            <div className="flex-1 flex gap-4 overflow-hidden min-h-0">

                {/* ── LEFT PANEL: Controls + Script ── */}
                <div className="w-[320px] shrink-0 flex flex-col gap-4 glass-panel p-4 overflow-y-auto">
                    {/* Cut indicator */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                            Cut {currentCutIndex + 1} / {script.length}
                        </span>
                        <span className="text-xs text-gray-500">{currentCut?.estimatedDuration}s</span>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={handlePrevCut}
                            disabled={currentCutIndex === 0}
                            className="p-2.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors"
                        >
                            <ArrowLeft size={22} />
                        </button>

                        <button
                            onClick={handlePlaySequential}
                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
                                isPlaying
                                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 ring-2 ring-red-500/50'
                                    : 'bg-[var(--color-primary)] text-black hover:scale-110 shadow-[var(--color-primary)]/30'
                            }`}
                        >
                            {isPlaying
                                ? <Pause size={26} fill="currentColor" />
                                : <Play size={26} fill="currentColor" className="ml-1" />
                            }
                        </button>

                        <button
                            onClick={handleNextCut}
                            disabled={currentCutIndex === script.length - 1}
                            className="p-2.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors"
                        >
                            <ArrowRight size={22} />
                        </button>
                    </div>



                    {/* Speaker */}
                    {currentCut?.speaker && (
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[11px] font-bold text-[var(--color-primary)] uppercase tracking-wider">
                                {currentCut.speaker}
                            </span>
                        </div>
                    )}

                    {/* Script / Dialogue */}
                    <div className="flex-1">
                        <p className="text-base text-white font-medium leading-relaxed">
                            "{currentCut?.dialogue}"
                        </p>
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/10">
                        {/* Post Production Options */}
                        <button
                            onClick={() => setIsWatermarkModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)] transition-colors text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] w-full justify-center"
                        >
                            <ImageIcon size={16} />
                            <span>워터마크 설정</span>
                        </button>
                    </div>
                </div>

                {/* ── RIGHT PANEL: Preview Image (aspect-ratio locked) ── */}
                <div className="flex-1 flex flex-col items-center justify-center glass-panel p-4 overflow-hidden">
                    {/* Aspect-ratio locked image container */}
                    <div
                        className={`relative bg-black/60 border border-white/10 rounded-xl overflow-hidden shadow-2xl ${
                            isPortrait ? 'h-full' : 'w-full'
                        }`}
                        style={{ aspectRatio: aspectCss, maxHeight: '100%', maxWidth: '100%' }}
                    >
                        {currentResolvedImage ? (
                            <img
                                src={currentResolvedImage}
                                alt={`Cut ${currentCut?.id}`}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
                                <ImageIcon size={48} />
                                <span className="text-xs">No Image</span>
                            </div>
                        )}

                        {/* Cut number overlay */}
                        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white">
                            #{currentCutIndex + 1}
                        </div>

                        {/* Aspect ratio badge */}
                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur px-2 py-1 rounded border border-white/10 text-[10px] font-mono text-gray-400">
                            {aspectRatio || '16:9'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom: Timeline */}
            <div className="h-[160px] shrink-0">
                {script.length > 0 ? (
                    <TimelineView
                        script={script}
                        bgmTracks={bgmTracks || []}
                        currentCutIndex={currentCutIndex}
                        onCutClick={setCurrentCutIndex}
                        onBGMUpdate={setBGMTracks}
                        aspectRatio={aspectRatio}
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

            {/* Navigation */}
            <div className="flex items-center justify-between shrink-0">
                <button
                    onClick={() => { prevStep(); navigate('/step/3'); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded-lg hover:text-white transition-colors border border-[var(--color-border)] text-sm"
                >
                    <ChevronLeft size={16} />
                    <span>Back</span>
                </button>
                <button
                    onClick={handleFinish}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-black font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors shadow-lg shadow-[var(--color-primary)]/20 text-sm"
                >
                    <span>Next Step</span>
                    <ChevronRight size={16} />
                </button>
            </div>

            {isWatermarkModalOpen && (
                <WatermarkSettingsModal
                    projectId={projectId}
                    watermarkSettings={watermarkSettings}
                    aspectRatio={aspectRatio}
                    previewBackground={currentResolvedImage}
                    onUpdate={setWatermarkSettings}
                    onClose={() => setIsWatermarkModalOpen(false)}
                />
            )}
        </div>
    );
};
