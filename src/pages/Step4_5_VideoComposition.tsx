import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import {
    Video, Upload, Play, Edit3, Check, X, Loader2,
    ChevronLeft, ChevronRight, FileVideo, Image as ImageIcon,
    FolderOpen, CheckCircle2, Lock, Download, Package, Zap,
    Volume2, VolumeX, Pause
} from 'lucide-react';
import type { ScriptCut } from '../services/gemini';
import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { exportVideoGenerationKit } from '../utils/videoGenerationKitExporter';

interface VideoClipStatus {
    cutId: number;
    status: 'idle' | 'uploading' | 'ready' | 'error';
    progress?: number;
    error?: string;
}

const ResolvedImage = React.memo(({ src, alt, className, fallbackSrc }: { src?: string, alt?: string, className?: string, fallbackSrc?: string }) => {
    const [resolvedSrc, setResolvedSrc] = useState<string>('');

    useEffect(() => {
        if (!src) {
            setResolvedSrc('');
            return;
        }

        const processUrl = (url: string) => {
            if (url.startsWith('data:application/octet-stream;base64')) {
                return url.replace('data:application/octet-stream;base64', 'data:image/png;base64');
            }
            return url;
        };

        if (isIdbUrl(src)) {
            resolveUrl(src).then(url => setResolvedSrc(processUrl(url))).catch((err) => {
                console.error('Failed to resolve image:', err);
                if (fallbackSrc) setResolvedSrc(fallbackSrc);
            });
        } else {
            setResolvedSrc(processUrl(src));
        }
    }, [src, fallbackSrc]);

    if (!resolvedSrc && !fallbackSrc) return null;

    return (
        <img
            src={resolvedSrc || fallbackSrc}
            alt={alt}
            className={className}
            onError={(e) => {
                if (fallbackSrc && e.currentTarget.src !== fallbackSrc) {
                    e.currentTarget.src = fallbackSrc;
                }
            }}
        />
    );
});

const VideoCompositionRow = React.memo(({
    cut,
    status,
    isSelected,
    isLocked,
    onToggleSelection,
    onPreview,
    onRemoveVideo,
    onEditPrompt,
    onUpload,
    onConfirm,
    onUnconfirm
}: {
    cut: ScriptCut;
    status: VideoClipStatus;
    isSelected: boolean;
    isLocked: boolean;
    onToggleSelection: () => void;
    onPreview: () => void;
    onRemoveVideo: () => void;
    onEditPrompt: () => void;
    onUpload: (file: File) => void;
    onConfirm: () => void;
    onUnconfirm: () => void;
}) => {
    const [resolvedVideoUrl, setResolvedVideoUrl] = useState('');

    useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;

        const loadVideo = async () => {
            if (!cut.videoUrl) {
                if (active) setResolvedVideoUrl('');
                return;
            }

            try {
                let url = cut.videoUrl;
                if (isIdbUrl(url)) {
                    url = await resolveUrl(url);
                }

                if (active) {
                    // Convert Data URL to Blob URL for fast/reliable playback
                    if (url && url.startsWith('data:')) {
                        try {
                            const res = await fetch(url);
                            const blob = await res.blob();

                            // FORCE MIME TYPE: If the blob comes back as generic octet-stream,
                            // force it to video/mp4 so the browser knows how to play it.
                            let finalBlob = blob;
                            if (blob.type === 'application/octet-stream' || !blob.type) {
                                console.log(`[Step4.5] Fixing generic video blob type -> video/mp4`);
                                finalBlob = new Blob([blob], { type: 'video/mp4' });
                            }

                            objectUrl = URL.createObjectURL(finalBlob);
                            setResolvedVideoUrl(objectUrl);
                        } catch (err) {
                            console.warn("[Step4.5] Blob conversion failed, falling back to raw Data URL:", err);
                            setResolvedVideoUrl(url);
                        }
                    } else {
                        setResolvedVideoUrl(url);
                    }
                }
            } catch (e) {
                console.error("Failed to resolve/convert video:", e);
                if (active) setResolvedVideoUrl('');
            }
        };

        loadVideo();

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [cut.videoUrl]);

    // Debugging 'Loading' state vs 'No Data' state
    const hasVideoData = !!cut.videoUrl;
    const isLoadingVideo = hasVideoData && !resolvedVideoUrl;

    // Debug Log
    useEffect(() => {
        if (cut.videoUrl && !resolvedVideoUrl) {
            console.log(`[Step4.5] Cut ${cut.id} has videoUrl but NO resolved URL yet.`);
        } else if (resolvedVideoUrl) {
            // Success case
        }
    }, [resolvedVideoUrl, cut.videoUrl]);

    return (
        <div className={`grid grid-cols-[40px_80px_1fr_120px_150px_200px] gap-2 px-4 py-3 items-center transition-colors ${isLocked ? 'bg-green-500/5' : isSelected ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-bg)]'}`}>
            <div className="flex items-center justify-center">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelection}
                    className="w-4 h-4 accent-[var(--color-primary)]"
                />
            </div>

            <div className="relative w-16 h-10 bg-[var(--color-bg)] rounded overflow-hidden">
                {hasVideoData ? (
                    <div className="relative w-full h-full bg-black group cursor-pointer" onClick={() => onPreview()}>
                        {/* Fallback Image behind video */}
                        {cut.finalImageUrl && !resolvedVideoUrl && (
                            <ResolvedImage
                                src={cut.finalImageUrl}
                                alt="Poster"
                                className="absolute inset-0 w-full h-full object-cover opacity-50"
                            />
                        )}

                        {isLoadingVideo && (
                            <div className="absolute inset-0 flex items-center justify-center text-white/50 z-10">
                                <Loader2 size={16} className="animate-spin" />
                            </div>
                        )}

                        {resolvedVideoUrl && (
                            <>
                                <video
                                    src={resolvedVideoUrl}
                                    className="w-full h-full object-cover"
                                    muted
                                    preload="auto"
                                    onMouseOver={(e) => e.currentTarget.play()}
                                    onMouseOut={(e) => {
                                        e.currentTarget.pause();
                                        e.currentTarget.currentTime = 0;
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                    <Play size={20} className="text-white fill-white" />
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    cut.finalImageUrl ? (
                        <ResolvedImage
                            src={cut.finalImageUrl}
                            alt={`Cut ${cut.id}`}
                            className="w-full h-full object-cover"
                            fallbackSrc={cut.draftImageUrl}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
                            <ImageIcon size={16} />
                        </div>
                    )
                )}
                <div className="absolute bottom-0 right-0 bg-black/70 text-xs px-1 text-white">
                    #{cut.id}
                </div>
            </div>

            <div className="min-w-0">
                <div className="text-sm text-white font-medium truncate">
                    {cut.speaker}: {cut.dialogue}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                    {cut.videoPrompt || cut.visualPrompt || 'No prompt'}
                </div>
            </div>

            <div className="text-sm text-[var(--color-text-muted)]">
                {cut.estimatedDuration || 5}s
            </div>

            <div>
                {status?.status === 'uploading' ? (
                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                        <Loader2 className="animate-spin" size={12} />
                        Uploading...
                    </span>
                ) : status?.status === 'error' ? (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                        <X size={12} />
                        {status.error}
                    </span>
                ) : (
                    cut.videoUrl ? (
                        cut.isVideoConfirmed ? (
                            <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                                <CheckCircle2 size={12} /> Confirmed
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-blue-400 font-medium">
                                <FileVideo size={12} /> Ready
                            </span>
                        )
                    ) : (
                        <span className="text-xs text-[var(--color-text-muted)] text-center block w-full opacity-50">Empty</span>
                    )
                )}
            </div>

            <div className="flex items-center gap-1">
                {/* Preview */}
                {cut.videoUrl && (
                    <button
                        onClick={onPreview}
                        className="p-1.5 rounded hover:bg-[var(--color-bg)] text-blue-400"
                        title="미리보기"
                    >
                        <Play size={16} />
                    </button>
                )}

                {/* Confirm (Lock) */}
                {cut.videoUrl && !isLocked && (
                    <button
                        onClick={onConfirm}
                        className="p-1.5 rounded hover:bg-green-500/20 text-green-400"
                        title="확정"
                    >
                        <Check size={16} />
                    </button>
                )}

                {/* Unlock */}
                {isLocked && (
                    <button
                        onClick={onUnconfirm}
                        className="p-1.5 rounded hover:bg-green-500/20 text-green-400"
                        title="확정 해제 (Unlock)"
                    >
                        <Lock size={16} />
                    </button>
                )}

                {/* Remove Video */}
                {cut.videoUrl && !isLocked && (
                    <button
                        onClick={onRemoveVideo}
                        className="p-1.5 rounded hover:bg-[var(--color-bg)] text-red-400"
                        title="삭제"
                    >
                        <X size={16} />
                    </button>
                )}

                {/* Edit Prompt (Still useful for the Kit export) */}
                {!isLocked && (
                    <button
                        onClick={onEditPrompt}
                        className="p-1.5 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-muted)]"
                        title="프롬프트 편집"
                    >
                        <Edit3 size={16} />
                    </button>
                )}

                {/* Upload */}
                {!isLocked && (
                    <label className="p-1.5 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-pointer" title="개별 업로드">
                        <Upload size={16} />
                        <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onUpload(file);
                            }}
                        />
                    </label>
                )}
            </div>
        </div>
    );
});

// HELPER: Repair function for video data
const repairVideoData = async (_project: any, script: ScriptCut[], onProgress: (msg: string) => void) => {
    const { loadFromIdb, parseIdbUrl } = await import('../utils/imageStorage');
    let fixedCount = 0;

    for (const cut of script) {
        if (cut.videoUrl && cut.videoUrl.startsWith('idb://')) {
            try {
                const parsed = parseIdbUrl(cut.videoUrl);
                if (!parsed) continue;

                onProgress(`Checking Cut #${cut.id}...`);

                // Load raw data
                const rawData = await loadFromIdb(cut.videoUrl);
                if (!rawData) continue;

                // Check header
                console.log(`[Repair] Checking Cut #${cut.id} Header: ${rawData.substring(0, 50)}...`);

                if (rawData.startsWith('data:application/octet-stream') || rawData.startsWith('data:binary/octet-stream')) {
                    onProgress(`Fixing Cut #${cut.id} header (generic binary)...`);

                    // Replace header
                    const fixedData = rawData.replace(/^data:(application|binary)\/octet-stream/, 'data:video/mp4');

                    // Save back
                    // We must use the SAME key to overwrite
                    const storageKey = `media-${parsed.type}-${parsed.key}`;
                    const { set } = await import('idb-keyval');
                    await set(storageKey, fixedData);

                    fixedCount++;
                } else if (!rawData.startsWith('data:video/')) {
                    onProgress(`Fixing Cut #${cut.id} with missing mime type...`);
                    // Try to assume it's mp4 if it has no type or weird type but not explicitly video
                    if (rawData.startsWith('data:;base64') || rawData.startsWith('data:base64')) {
                        // Fix empty mime type data:;base64
                        const fixedData = 'data:video/mp4;base64,' + rawData.split(',')[1];
                        const storageKey = `media-${parsed.type}-${parsed.key}`;
                        const { set } = await import('idb-keyval');
                        await set(storageKey, fixedData);
                        fixedCount++;
                    } else if (rawData.includes('base64,')) {
                        // Fallback for any other weird header format: force replace prefix
                        const base64Part = rawData.split('base64,')[1];
                        if (base64Part) {
                            const fixedData = 'data:video/mp4;base64,' + base64Part;
                            const storageKey = `media-${parsed.type}-${parsed.key}`;
                            const { set } = await import('idb-keyval');
                            await set(storageKey, fixedData);
                            fixedCount++;
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to repair cut ${cut.id}`, e);
            }
        }
    }
    return fixedCount;
};

// Audio Comparison Modal Component
const AudioComparisonModal: React.FC<{
    previewCut: ScriptCut | undefined;
    previewVideoUrl: string;
    onClose: () => void;
    onSave: (useVideoAudio: boolean, videoDuration: number | undefined) => void;
}> = ({ previewCut, previewVideoUrl, onClose, onSave }) => {
    const [selectedAudioSource, setSelectedAudioSource] = useState<'video' | 'tts'>(
        previewCut?.useVideoAudio ? 'video' : 'tts'
    );
    const [isTtsPlaying, setIsTtsPlaying] = useState(false);
    const [resolvedTtsUrl, setResolvedTtsUrl] = useState<string>('');
    const [actualVideoDuration, setActualVideoDuration] = useState<number>(0);
    const [customDuration, setCustomDuration] = useState<number>(previewCut?.videoDuration || 0);
    const ttsAudioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Get actual video duration when loaded
    useEffect(() => {
        if (videoRef.current) {
            const handleLoadedMetadata = () => {
                const dur = videoRef.current?.duration || 0;
                setActualVideoDuration(dur);
                // Set initial custom duration if not already set
                if (!customDuration && dur > 0) {
                    setCustomDuration(previewCut?.videoDuration || dur);
                }
            };
            videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
            // If already loaded
            if (videoRef.current.duration) handleLoadedMetadata();
            return () => videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
        }
    }, [previewVideoUrl]);

    // Resolve TTS audio URL
    useEffect(() => {
        if (!previewCut?.audioUrl) return;
        if (isIdbUrl(previewCut.audioUrl)) {
            resolveUrl(previewCut.audioUrl).then(url => setResolvedTtsUrl(url));
        } else {
            setResolvedTtsUrl(previewCut.audioUrl);
        }
    }, [previewCut?.audioUrl]);

    // Handle TTS playback
    const toggleTtsPlayback = async () => {
        if (!ttsAudioRef.current) {
            console.warn('[TTS] No audio ref');
            return;
        }
        if (!resolvedTtsUrl) {
            console.warn('[TTS] No resolved URL. Raw URL:', previewCut?.audioUrl);
            return;
        }

        console.log('[TTS] Toggle playback. URL:', resolvedTtsUrl.substring(0, 50), 'Playing:', isTtsPlaying);

        if (isTtsPlaying) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
            setIsTtsPlaying(false);
        } else {
            // Mute video when playing TTS
            if (videoRef.current) videoRef.current.muted = true;

            // Ensure audio element has correct source
            if (ttsAudioRef.current.src !== resolvedTtsUrl) {
                ttsAudioRef.current.src = resolvedTtsUrl;
            }

            // Wait for audio to be ready
            await new Promise<void>((resolve) => {
                if (ttsAudioRef.current!.readyState >= 2) {
                    resolve();
                } else {
                    ttsAudioRef.current!.oncanplay = () => resolve();
                    ttsAudioRef.current!.load();
                }
            });

            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current.muted = false;
            ttsAudioRef.current.volume = 1;

            try {
                await ttsAudioRef.current.play();
                console.log('[TTS] Playing successfully');
                setIsTtsPlaying(true);
            } catch (e) {
                console.error('[TTS] Play failed:', e);
            }
        }
    };

    // Handle video audio toggle
    const handleVideoAudioToggle = (muted: boolean) => {
        if (videoRef.current) {
            videoRef.current.muted = muted;
        }
        // Stop TTS if playing and switching to video audio
        if (!muted && ttsAudioRef.current && isTtsPlaying) {
            ttsAudioRef.current.pause();
            setIsTtsPlaying(false);
        }
    };

    if (!previewCut) return null;

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
            <div className="max-w-4xl w-full relative bg-[var(--color-surface)] rounded-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Video size={20} className="text-blue-400" />
                        Cut #{previewCut.id} - 오디오 소스 선택
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Video Player */}
                <div className="bg-black">
                    <video
                        ref={videoRef}
                        src={previewVideoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        muted={selectedAudioSource === 'tts'}
                        className="w-full max-h-[50vh] object-contain"
                        onError={(e) => {
                            console.error("Preview playback failed:", e);
                        }}
                    />
                </div>

                {/* Audio Comparison Controls - Scrollable */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* TTS Audio Player (hidden but functional) */}
                    {resolvedTtsUrl && (
                        <audio
                            ref={ttsAudioRef}
                            src={resolvedTtsUrl}
                            preload="auto"
                            onEnded={() => setIsTtsPlaying(false)}
                        />
                    )}

                    {/* Audio Source Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-400 block">최종 오디오 소스 선택</label>

                        {/* Option 1: Video Audio */}
                        <label
                            className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAudioSource === 'video'
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-[var(--color-border)] hover:border-gray-600'
                                }`}
                            onClick={() => {
                                setSelectedAudioSource('video');
                                handleVideoAudioToggle(false);
                            }}
                        >
                            <input
                                type="radio"
                                name="audioSource"
                                checked={selectedAudioSource === 'video'}
                                onChange={() => { }}
                                className="w-5 h-5 accent-blue-500"
                            />
                            <Volume2 size={24} className={selectedAudioSource === 'video' ? 'text-blue-400' : 'text-gray-500'} />
                            <div className="flex-1">
                                <div className="text-white font-medium">비디오 오디오 사용</div>
                                <div className="text-xs text-gray-400">업로드한 비디오 파일에 포함된 오디오를 사용합니다.</div>
                            </div>
                        </label>

                        {/* Option 2: TTS Audio */}
                        <label
                            className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAudioSource === 'tts'
                                ? 'border-green-500 bg-green-500/10'
                                : 'border-[var(--color-border)] hover:border-gray-600'
                                }`}
                            onClick={() => {
                                setSelectedAudioSource('tts');
                                handleVideoAudioToggle(true);
                            }}
                        >
                            <input
                                type="radio"
                                name="audioSource"
                                checked={selectedAudioSource === 'tts'}
                                onChange={() => { }}
                                className="w-5 h-5 accent-green-500"
                            />
                            <VolumeX size={24} className={selectedAudioSource === 'tts' ? 'text-green-400' : 'text-gray-500'} />
                            <div className="flex-1">
                                <div className="text-white font-medium">Step 3 TTS 오디오 사용</div>
                                <div className="text-xs text-gray-400">AI 음성 생성(TTS) 오디오를 사용합니다. (비디오는 음소거)</div>
                            </div>
                            {/* TTS Preview Button */}
                            {resolvedTtsUrl && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTtsPlayback();
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${isTtsPlaying
                                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                        : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                                        }`}
                                >
                                    {isTtsPlaying ? <><Pause size={16} /> 정지</> : <><Play size={16} /> TTS 미리듣기</>}
                                </button>
                            )}
                        </label>
                    </div>

                    {/* Dialogue Preview */}
                    {previewCut.dialogue && (
                        <div className="p-3 bg-[var(--color-bg)] rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">대사</div>
                            <div className="text-sm text-white">{previewCut.speaker}: "{previewCut.dialogue}"</div>
                        </div>
                    )}

                    {/* Video Duration Control */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-400 block">
                            비디오 재생 시간 {actualVideoDuration > 0 && <span className="text-gray-500 font-normal">(원본: {actualVideoDuration.toFixed(1)}초)</span>}
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0.5"
                                max={Math.max(actualVideoDuration, 30)}
                                step="0.1"
                                value={customDuration}
                                onChange={(e) => setCustomDuration(parseFloat(e.target.value))}
                                className="flex-1 accent-[var(--color-primary)]"
                            />
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0.5"
                                    max="60"
                                    step="0.1"
                                    value={customDuration.toFixed(1)}
                                    onChange={(e) => setCustomDuration(parseFloat(e.target.value) || 0.5)}
                                    className="w-20 px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-white text-center"
                                />
                                <span className="text-gray-400">초</span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500">
                            Hybrid 모드에서 이 값이 TTS 오디오 길이보다 우선 적용됩니다.
                        </div>
                    </div>

                    {/* Sync Preview Button */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={async () => {
                                if (!videoRef.current) return;

                                // Stop any previous playback
                                videoRef.current.pause();
                                videoRef.current.currentTime = 0;
                                if (ttsAudioRef.current) {
                                    ttsAudioRef.current.pause();
                                    ttsAudioRef.current.currentTime = 0;
                                }

                                // Set audio based on selection
                                if (selectedAudioSource === 'tts') {
                                    videoRef.current.muted = true;
                                    if (ttsAudioRef.current && resolvedTtsUrl) {
                                        ttsAudioRef.current.muted = false;
                                        ttsAudioRef.current.volume = 1;
                                    }
                                } else {
                                    videoRef.current.muted = false;
                                    videoRef.current.volume = 1;
                                }

                                // Start playback
                                try {
                                    await videoRef.current.play();
                                    if (selectedAudioSource === 'tts' && ttsAudioRef.current && resolvedTtsUrl) {
                                        await ttsAudioRef.current.play();
                                        setIsTtsPlaying(true);
                                    }
                                } catch (e) {
                                    console.warn('Sync preview play failed:', e);
                                }

                                // Stop after customDuration
                                setTimeout(() => {
                                    if (videoRef.current) {
                                        videoRef.current.pause();
                                        videoRef.current.currentTime = 0;
                                    }
                                    if (ttsAudioRef.current) {
                                        ttsAudioRef.current.pause();
                                        ttsAudioRef.current.currentTime = 0;
                                        setIsTtsPlaying(false);
                                    }
                                }, customDuration * 1000);
                            }}
                            className="flex-1 px-4 py-3 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2 font-semibold"
                        >
                            <Play size={18} />
                            싱크 미리보기 ({customDuration.toFixed(1)}초)
                        </button>
                        <div className="text-xs text-gray-500 w-48">
                            {selectedAudioSource === 'video' ? '비디오 오디오' : 'TTS 오디오'}와 함께 {customDuration.toFixed(1)}초 재생
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 bg-[var(--color-bg)] text-gray-400 rounded-lg hover:text-white transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => onSave(selectedAudioSource === 'video', customDuration > 0 ? customDuration : undefined)}
                            className="px-5 py-2.5 bg-[var(--color-primary)] text-black font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors flex items-center gap-2"
                        >
                            <Check size={18} />
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Step4_5_VideoComposition: React.FC = () => {
    const navigate = useNavigate();
    const {
        id: projectId, script, setScript, episodeName, seriesName
    } = useWorkflowStore();

    // State
    const [selectedCuts, setSelectedCuts] = useState<Set<number>>(new Set());
    const [clipStatuses, setClipStatuses] = useState<Record<number, VideoClipStatus>>({});
    const [showPromptEditor, setShowPromptEditor] = useState<number | null>(null);
    const [editingPrompt, setEditingPrompt] = useState('');
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [previewCutId, setPreviewCutId] = useState<number | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string>('');
    const [isExportingKit, setIsExportingKit] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);

    const prevProjectIdRef = useRef<string | null>(null);

    // Reset state on project change
    useEffect(() => {
        if (projectId && projectId !== prevProjectIdRef.current) {
            prevProjectIdRef.current = projectId;
            setSelectedCuts(new Set());
            setClipStatuses({});
            setShowPromptEditor(null);
            setEditingPrompt('');
            setShowBulkUploadModal(false);
            setPreviewCutId(null);
        }
    }, [projectId]);

    // Resolve preview URL
    useEffect(() => {
        if (previewCutId === null) {
            setPreviewVideoUrl('');
            return;
        }
        const cut = script.find(c => c.id === previewCutId);
        if (!cut?.videoUrl) {
            setPreviewVideoUrl('');
            return;
        }
        if (isIdbUrl(cut.videoUrl)) {
            resolveUrl(cut.videoUrl).then(url => setPreviewVideoUrl(url));
        } else {
            setPreviewVideoUrl(cut.videoUrl);
        }
    }, [previewCutId, script]);

    const videoStats = {
        ready: script.filter(cut => cut.videoUrl).length,
        confirmed: script.filter(cut => cut.isVideoConfirmed).length,
        total: script.length
    };

    const toggleCutSelection = (cutId: number) => {
        const newSelected = new Set(selectedCuts);
        if (newSelected.has(cutId)) newSelected.delete(cutId);
        else newSelected.add(cutId);
        setSelectedCuts(newSelected);
    };

    // Remove video
    const removeVideo = (cutId: number) => {
        const cutToRemove = script.find(c => c.id === cutId);
        console.log(`[Video Remove] Cut ${cutId}: Removing videoUrl "${cutToRemove?.videoUrl}"`);
        const updatedScript = script.map(c =>
            c.id === cutId ? { ...c, videoUrl: undefined, videoSource: undefined, isVideoConfirmed: false } : c
        );
        setScript(updatedScript);
        console.log(`[Video Remove] Cut ${cutId}: State updated, videoUrl set to undefined`);
    };

    // Save prompt
    const saveVideoPrompt = (cutId: number) => {
        const updatedScript = script.map(c =>
            c.id === cutId ? { ...c, videoPrompt: editingPrompt } : c
        );
        setScript(updatedScript);
        setShowPromptEditor(null);
        setEditingPrompt('');
    };

    const confirmSelectedVideos = () => {
        const updatedScript = script.map(c =>
            selectedCuts.has(c.id) && c.videoUrl ? { ...c, isVideoConfirmed: true } : c
        );
        setScript(updatedScript);
        setSelectedCuts(new Set());
        alert(`✅  확정 완료!`);
    };

    const unconfirmSelectedVideos = () => {
        const updatedScript = script.map(c =>
            selectedCuts.has(c.id) ? { ...c, isVideoConfirmed: false } : c
        );
        setScript(updatedScript);
        setSelectedCuts(new Set());
    };

    const removeSelectedVideos = () => {
        const count = Array.from(selectedCuts).filter(id => {
            const cut = script.find(c => c.id === id);
            return cut?.videoUrl && !cut.isVideoConfirmed;
        }).length;

        if (count === 0) {
            alert('삭제할 비디오가 없습니다. (확정된 비디오는 제외됩니다)');
            return;
        }

        if (!confirm(`선택된 ${count}개의 비디오를 삭제하시겠습니까?`)) return;

        console.log(`[Video Remove] Bulk removing ${count} videos`);
        const updatedScript = script.map(c =>
            selectedCuts.has(c.id) && c.videoUrl && !c.isVideoConfirmed
                ? { ...c, videoUrl: undefined, videoSource: undefined, useVideoAudio: undefined, videoDuration: undefined }
                : c
        );
        setScript(updatedScript);
        setSelectedCuts(new Set());
    };

    // --- Upload Handlers ---

    const handleSingleUpload = async (cutId: number, file: File) => {
        const currentScript = useWorkflowStore.getState().script;
        const currentProjectId = useWorkflowStore.getState().id;
        const cut = currentScript.find(c => c.id === cutId);
        if (!cut || cut.isVideoConfirmed || !currentProjectId) return;

        setClipStatuses(prev => ({
            ...prev,
            [cutId]: { cutId, status: 'uploading', progress: 0 }
        }));

        try {
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const { saveToIdb, generateVideoKey } = await import('../utils/imageStorage');
            // Extract extension safely
            const extension = file.name.split('.').pop() || 'mp4';
            const videoKey = generateVideoKey(currentProjectId, cutId, extension);
            console.log(`[Video Upload] Cut ${cutId}: Saving with key "${videoKey}"`);
            const idbUrl = await saveToIdb('video', videoKey, dataUrl);
            console.log(`[Video Upload] Cut ${cutId}: Saved as "${idbUrl}"`);

            useWorkflowStore.setState(state => ({
                script: state.script.map(c =>
                    c.id === cutId ? { ...c, videoUrl: idbUrl, videoSource: 'upload' as const } : c
                )
            }));
            console.log(`[Video Upload] Cut ${cutId}: State updated with videoUrl "${idbUrl}"`);
            await useWorkflowStore.getState().saveProject();

            setClipStatuses(prev => ({ ...prev, [cutId]: { cutId, status: 'ready' } }));
        } catch (error) {
            console.error('Upload failed:', error);
            setClipStatuses(prev => ({ ...prev, [cutId]: { cutId, status: 'error', error: 'Upload failed' } }));
        }
    };

    // Handle bulk upload
    const handleBulkUpload = async (files: FileList, matchMode: 'name-asc' | 'number', overwrite: boolean) => {
        const fileArray = Array.from(files).filter(f => f.type.startsWith('video/'));
        if (fileArray.length === 0) {
            alert('비디오 파일이 없습니다.');
            return;
        }

        // Target cuts:
        // - Must have finalImageUrl (has generated image)
        // - If overwrite=false: skip confirmed cuts AND cuts that already have video
        // - If overwrite=true: target all cuts including those with existing videos (but still skip confirmed)
        const targetCuts = script.filter(cut => {
            if (!cut.finalImageUrl) return false;
            if (cut.isVideoConfirmed) return false; // Never overwrite confirmed
            if (!overwrite && cut.videoUrl) return false; // Skip if already has video (unless overwrite)
            return true;
        });

        let sortedFiles: File[];

        if (matchMode === 'number') {
            sortedFiles = fileArray.sort((a, b) => {
                const numA = parseInt(a.name.match(/(\d+)/)?.[1] || '0');
                const numB = parseInt(b.name.match(/(\d+)/)?.[1] || '0');
                return numA - numB;
            });
        } else {
            sortedFiles = fileArray.sort((a, b) => a.name.localeCompare(b.name));
        }

        const uploadCount = Math.min(sortedFiles.length, targetCuts.length);
        for (let i = 0; i < uploadCount; i++) {
            await handleSingleUpload(targetCuts[i].id, sortedFiles[i]);
            // Auto unconfirm if overwriting, to ensure user reviews it? Or keep confirmed?
            // Let's keep status update in handleSingleUpload
        }
        setShowBulkUploadModal(false);
        alert(`✅ ${uploadCount}개 비디오 업로드 완료!`);
    };

    // --- Kit Export Handler ---

    const handleExportKit = async () => {
        setIsExportingKit(true);
        try {
            const blob = await exportVideoGenerationKit(script, seriesName, episodeName);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${seriesName}_${episodeName}_VideoKit.zip`;
            a.click();
            URL.revokeObjectURL(url);
            alert("외부 비디오 생성 키트 다운로드 완료!\n\n포함된 이미지와 프롬프트를 사용하여 외부 도구(Runway, Luma 등)에서 비디오를 생성하세요.");
        } catch (e) {
            console.error(e);
            alert("키트 생성 실패");
        } finally {
            setIsExportingKit(false);
        }
    };

    const handleRepairVideos = async () => {
        if (!confirm("비디오 데이터 검사 및 복구를 진행하시겠습니까?\n(재생이 안 되는 비디오가 있을 경우 권장)")) return;

        setIsRepairing(true);
        try {
            const count = await repairVideoData(useWorkflowStore.getState(), script, (msg) => {
                console.log(msg); // Optional: show toast?
            });
            if (count > 0) {
                alert(`✅ ${count}개의 비디오 데이터를 복구했습니다.\n페이지를 새로고침해주세요.`);
                window.location.reload();
            } else {
                alert("👌 복구가 필요한 비디오가 발견되지 않았습니다.\n문제가 지속되면 '일괄 업로드'로 다시 업로드해보세요.");
            }
        } catch (e) {
            alert("복구 중 오류 발생");
            console.error(e);
        } finally {
            setIsRepairing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Video className="text-[var(--color-primary)]" size={28} />
                        Video Composition
                    </h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">
                        Step 4의 이미지를 사용하여 외부 AI 도구(Luma Dream Machine, Runway 등)로 비디오를 생성하고 업로드하여 합성합니다.
                    </p>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-400">{videoStats.ready}</div>
                        <div className="text-[var(--color-text-muted)] text-xs">Clips Ready</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-400">{videoStats.confirmed}</div>
                        <div className="text-[var(--color-text-muted)] text-xs">Confirmed</div>
                    </div>
                </div>

                {/* Repair Button */}
                <button
                    onClick={handleRepairVideos}
                    disabled={isRepairing}
                    className="ml-4 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs flex items-center gap-2 transition-colors border border-gray-700"
                    title="재생 오류 시 클릭"
                >
                    {isRepairing ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                    비디오 데이터 복구
                </button>
            </div>

            {/* Action Bar (Replaces Provider Selector) */}
            <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">

                    {/* Left: Export Kit */}
                    <div className="flex-1 w-full">
                        <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                            <Package size={20} className="text-purple-400" />
                            1. 외부 Video 생성 Kit
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] mb-4">
                            각 컷의 이미지 파일과 기술적으로 보강된 비디오 프롬프트를 묶어 다운로드합니다.<br />
                            Runway, Luma, Kling 등의 외부 서비스에서 이 파일들을 사용하여 고품질 비디오를 생성하세요.
                        </p>
                        <button
                            onClick={handleExportKit}
                            disabled={isExportingKit}
                            className="flex items-center gap-2 px-5 py-3 bg-purple-500/20 text-purple-300 rounded-xl hover:bg-purple-500/30 border border-purple-500/30 transition-colors w-full md:w-auto justify-center"
                        >
                            {isExportingKit ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                            <span className="font-semibold">Generation Kit 다운로드 (.zip)</span>
                        </button>
                    </div>

                    <div className="hidden md:block w-px h-24 bg-[var(--color-border)]"></div>

                    {/* Right: Import */}
                    <div className="flex-1 w-full text-right md:text-left">
                        <div className="flex flex-col md:items-end">
                            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                                <Upload size={20} className="text-blue-400" />
                                2. 생성된 비디오 업로드
                            </h3>
                            <p className="text-xs text-[var(--color-text-muted)] mb-4 text-right md:text-left">
                                외부에서 생성한 영상 파일들을 이곳에 일괄 업로드하세요.<br />
                                파일명을 'cut_001.mp4' 등으로 유지하면 자동으로 매칭됩니다.
                            </p>
                            <button
                                onClick={() => setShowBulkUploadModal(true)}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 border border-blue-500/30 transition-colors w-full md:w-auto justify-center"
                            >
                                <FolderOpen size={20} />
                                <span className="font-semibold">비디오 일괄 업로드</span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            {/* Selection Actions */}
            {selectedCuts.size > 0 && (
                <div className="flex items-center gap-4 p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                    <span className="text-sm text-white font-bold">
                        {selectedCuts.size}개 컷 선택됨
                    </span>
                    <div className="w-px h-4 bg-gray-700"></div>
                    <button
                        onClick={confirmSelectedVideos}
                        className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                        선택 확정
                    </button>
                    <button
                        onClick={unconfirmSelectedVideos}
                        className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
                    >
                        확정 해제
                    </button>
                    <button
                        onClick={removeSelectedVideos}
                        className="px-3 py-1.5 bg-red-600/80 text-white rounded text-xs hover:bg-red-600"
                    >
                        선택 삭제
                    </button>
                </div>
            )}


            {/* Cuts List */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                <div className="grid grid-cols-[40px_80px_1fr_120px_150px_200px] gap-2 px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                    <div className="flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={selectedCuts.size === script.length && script.length > 0}
                            onChange={(e) => {
                                if (e.target.checked) setSelectedCuts(new Set(script.map(c => c.id)));
                                else setSelectedCuts(new Set());
                            }}
                            className="w-4 h-4 accent-[var(--color-primary)]"
                        />
                    </div>
                    <div>#</div>
                    <div>Content</div>
                    <div>Duration</div>
                    <div>Status</div>
                    <div>Actions</div>
                </div>

                <div className="divide-y divide-[var(--color-border)]">
                    {script.map((cut) => (
                        <VideoCompositionRow
                            key={cut.id}
                            cut={cut}
                            status={clipStatuses[cut.id]}
                            isSelected={selectedCuts.has(cut.id)}
                            isLocked={!!cut.isVideoConfirmed}
                            onToggleSelection={() => toggleCutSelection(cut.id)}
                            onPreview={() => setPreviewCutId(cut.id)}
                            onRemoveVideo={() => removeVideo(cut.id)}
                            onEditPrompt={() => {
                                setEditingPrompt(cut.videoPrompt || cut.visualPrompt || '');
                                setShowPromptEditor(cut.id);
                            }}
                            onUpload={(file) => handleSingleUpload(cut.id, file)}
                            onConfirm={() => {
                                const newScript = script.map(c => c.id === cut.id ? { ...c, isVideoConfirmed: true } : c);
                                setScript(newScript);
                            }}
                            onUnconfirm={() => {
                                const newScript = script.map(c => c.id === cut.id ? { ...c, isVideoConfirmed: false } : c);
                                setScript(newScript);
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button onClick={() => navigate('/step/4')} className="flex items-center gap-2 px-6 py-3 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded-xl hover:text-white transition-colors">
                    <ChevronLeft size={20} />
                    <span>Step 4: Review</span>
                </button>
                <button onClick={() => navigate('/step/5')} className="flex items-center gap-2 px-6 py-3 bg-[var(--color-primary)] text-black font-semibold rounded-xl hover:bg-[var(--color-primary-hover)] transition-colors">
                    <span>Step 5: Thumbnail</span>
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Prompt Editor */}
            {showPromptEditor !== null && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--color-surface)] rounded-xl p-6 max-w-2xl w-full border border-[var(--color-border)]">
                        <h3 className="text-lg font-bold text-white mb-4">Edit Video Prompt - Cut #{showPromptEditor}</h3>
                        <textarea
                            value={editingPrompt}
                            onChange={(e) => setEditingPrompt(e.target.value)}
                            className="w-full h-40 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-white resize-none focus:border-[var(--color-primary)] outline-none"
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setShowPromptEditor(null)} className="px-4 py-2 bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded-lg">Cancel</button>
                            <button onClick={() => saveVideoPrompt(showPromptEditor)} className="px-4 py-2 bg-[var(--color-primary)] text-black font-semibold rounded-lg">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Upload Modal */}
            {showBulkUploadModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--color-surface)] rounded-xl p-6 max-w-md w-full border border-[var(--color-border)]">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <FolderOpen size={20} className="text-blue-400" />
                            일괄 업로드 - 매칭 방식
                        </h3>
                        <div className="space-y-3 mb-6">
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-200">
                                💡 업로드할 파일의 이름이 <b>숫자</b>를 포함하고 있으면 (예: cut_001.mp4) 순서대로 자동 매칭됩니다.
                            </div>
                            <label className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-lg cursor-pointer hover:bg-[var(--color-bg)]/80">
                                <input type="radio" name="matchMode" value="number" defaultChecked className="accent-[var(--color-primary)]" />
                                <div>
                                    <div className="text-white text-sm font-medium">파일명 숫자 (cut_01.mp4)</div>
                                    <div className="text-xs text-[var(--color-text-muted)]">가장 권장되는 방식입니다.</div>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-lg cursor-pointer hover:bg-[var(--color-bg)]/80">
                                <input type="radio" name="matchMode" value="name-asc" className="accent-[var(--color-primary)]" />
                                <div>
                                    <div className="text-white text-sm font-medium">파일명 알파벳순</div>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-lg cursor-pointer hover:bg-[var(--color-bg)]/80">
                                <input type="checkbox" id="overwrite-check" className="w-4 h-4 accent-red-500" />
                                <div>
                                    <div className="text-white text-sm font-medium text-red-300">기존 비디오 덮어쓰기</div>
                                    <div className="text-xs text-[var(--color-text-muted)]">체크 해제 시: 이미 비디오가 있는 컷은 건너뜁니다.</div>
                                </div>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowBulkUploadModal(false)} className="px-4 py-2 bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded-lg">취소</button>
                            <label className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors cursor-pointer flex items-center gap-2">
                                <FolderOpen size={16} />
                                파일 선택
                                <input
                                    type="file"
                                    accept="video/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                        const files = e.target.files;
                                        if (files) {
                                            const modeInput = document.querySelector('input[name="matchMode"]:checked') as HTMLInputElement;
                                            const overwrite = (document.getElementById('overwrite-check') as HTMLInputElement).checked;
                                            handleBulkUpload(files, (modeInput?.value || 'number') as 'name-asc' | 'number', overwrite);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Video Preview Modal with Audio Comparison */}
            {previewVideoUrl && previewCutId !== null && (() => {
                const previewCut = script.find(c => c.id === previewCutId);
                return (
                    <AudioComparisonModal
                        previewCut={previewCut}
                        previewVideoUrl={previewVideoUrl}
                        onClose={() => setPreviewCutId(null)}
                        onSave={(useVideoAudio, videoDuration) => {
                            if (previewCut) {
                                const updatedScript = script.map(c =>
                                    c.id === previewCut.id ? { ...c, useVideoAudio, videoDuration } : c
                                );
                                setScript(updatedScript);
                            }
                            setPreviewCutId(null);
                        }}
                    />
                );
            })()}
        </div>
    );
};
