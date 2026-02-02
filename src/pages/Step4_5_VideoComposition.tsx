import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import {
    Video, Upload, Play, Edit3, Check, X, Loader2,
    ChevronLeft, ChevronRight, FileVideo, Image as ImageIcon,
    Lock, Download, Zap, RefreshCw, FolderOpen,
    Volume2, VolumeX, Sparkles, AlertCircle, Trash2
} from 'lucide-react';
import type { ScriptCut, VideoMotionContext } from '../services/gemini';
import { resolveUrl, isIdbUrl, saveToIdb, generateVideoKey } from '../utils/imageStorage';
import { exportVideoGenerationKit } from '../utils/videoGenerationKitExporter';
import { generateVideo, getVideoModels, type VideoModel } from '../services/videoGen';
import { generateVideoWithVeo, getVeoModels } from '../services/veoGen';
import { generateVideoMotionPrompt } from '../services/gemini';
import type { VideoGenerationProvider, ReplicateVideoModel, VeoModel } from '../store/types';

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
    onUnconfirm,
    index
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
    index: number;
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
                    console.log(`[Step4.5] Resolving IDB URL for cut ${cut.id}:`, url);
                    url = await resolveUrl(url);
                    console.log(`[Step4.5] Resolved to:`, url ? `${url.substring(0, 50)}... (${Math.round(url.length / 1024)}KB)` : 'EMPTY');

                    if (!url) {
                        console.error(`[Step4.5] Cut ${cut.id}: resolveUrl returned empty! IDB data may be corrupted.`);
                        return;
                    }
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
                console.error(`[Step4.5] Failed to resolve/convert video for cut ${cut.id}:`, e);
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
                    #{index + 1}
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
                                <Check size={12} /> Confirmed
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
    const [customDuration, setCustomDuration] = useState<number>(
        previewCut?.videoDuration || previewCut?.estimatedDuration || 0
    );
    const ttsAudioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Get actual video duration when loaded
    useEffect(() => {
        if (videoRef.current) {
            const handleLoadedMetadata = () => {
                const dur = videoRef.current?.duration || 0;
                // Set initial custom duration if not already set
                // Prioritize: Saved videoDuration > TTS/Estimated Duration > Full Video Length
                if (!customDuration && dur > 0) {
                    setCustomDuration(previewCut?.videoDuration || previewCut?.estimatedDuration || dur);
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

                    {/* Main Controls Row - Single Line */}
                    <div className="flex items-center gap-4 bg-[var(--color-bg)] p-2 rounded-xl border border-[var(--color-border)]">

                        {/* 1. Audio Source Selection (Compact) */}
                        <div className="flex bg-black/40 rounded-lg p-1 gap-1 shrink-0">
                            {/* Video Option */}
                            <button
                                onClick={() => {
                                    setSelectedAudioSource('video');
                                    handleVideoAudioToggle(false);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${selectedAudioSource === 'video'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Volume2 size={16} />
                                <span className="text-sm font-medium">Video</span>
                            </button>

                            {/* TTS Option */}
                            <button
                                onClick={() => {
                                    setSelectedAudioSource('tts');
                                    handleVideoAudioToggle(true);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${selectedAudioSource === 'tts'
                                    ? 'bg-green-500 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <VolumeX size={16} />
                                <span className="text-sm font-medium">TTS</span>
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-[var(--color-border)] opacity-50 shrink-0" />

                        {/* 2. Duration Input (Compact & Wide as requested) */}
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-500 font-medium">Duration</span>
                            <div className="relative w-24">
                                <input
                                    type="number"
                                    min="0.5"
                                    max="60"
                                    step="0.1"
                                    value={customDuration.toFixed(1)}
                                    onChange={(e) => setCustomDuration(parseFloat(e.target.value) || 0.5)}
                                    className="w-full pl-2 pr-5 py-1.5 bg-black/40 border border-[var(--color-border)] rounded-md text-white font-mono text-center text-sm focus:border-[var(--color-primary)] outline-none transition-colors"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">s</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-8 bg-[var(--color-border)] opacity-50 shrink-0" />

                        {/* 3. Sync Preview Button (Narrower as requested & Original Logic) */}
                        <button
                            /**
                             * ORIGINAL LOGIC RESTORED
                             */
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
                            className="px-6 h-10 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2 font-semibold text-sm group"
                        >
                            <Play size={16} className="fill-purple-500/50 group-hover:fill-purple-500 transition-colors" />
                            <span>Preview Sync</span>
                        </button>
                    </div>

                    {/* Dialogue Preview (Below controls) */}
                    {previewCut.dialogue && (
                        <div className="px-3 py-2 border-l-2 border-[var(--color-border)] ml-1">
                            <div className="text-xs text-gray-500 mb-0.5">{previewCut.speaker}</div>
                            <div className="text-sm text-gray-300 italic">"{previewCut.dialogue}"</div>
                        </div>
                    )}

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
        id: projectId, script, setScript, episodeName, seriesName, aspectRatio
    } = useWorkflowStore();

    // Get API keys from store
    const { apiKeys } = useWorkflowStore();

    // State
    const [selectedCuts, setSelectedCuts] = useState<Set<number>>(new Set());
    const [clipStatuses, setClipStatuses] = useState<Record<number, VideoClipStatus>>({});
    const [showPromptEditor, setShowPromptEditor] = useState<number | null>(null);
    const [editingPrompt, setEditingPrompt] = useState('');
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [previewCutId, setPreviewCutId] = useState<number | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string>('');
    const [isExportingKit, setIsExportingKit] = useState(false);
    const [isBulkGeneratingMotion, setIsBulkGeneratingMotion] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);

    // AI Video Generation Mode State
    const [selectedProvider, setSelectedProvider] = useState<VideoGenerationProvider>('replicate');
    const [selectedVeoModel, setSelectedVeoModel] = useState<VeoModel>('veo-3.1-generate-preview');
    const [selectedReplicateModel, setSelectedReplicateModel] = useState<ReplicateVideoModel>('wan-2.2-i2v');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; status: string }>({ current: 0, total: 0, status: '' });

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

    // Save prompt (with auto-generation)
    const saveVideoPrompt = async (cutId: number) => {
        let finalPrompt = editingPrompt;

        // Auto-generate logic if empty
        if (!finalPrompt.trim()) {
            try {
                setIsGeneratingPrompt(true);
                const cut = script.find(c => c.id === cutId);
                if (!cut) throw new Error("Cut not found");

                const state = useWorkflowStore.getState();
                const apiKey = state.apiKeys?.gemini;

                if (!apiKey) {
                    alert("Gemini API Key is missing. Please check Settings.");
                    setIsGeneratingPrompt(false);
                    return;
                }

                // Resolve character info for better context
                const allChars = [...(state.characters || []), ...(state.episodeCharacters || [])];
                const char = allChars.find(c => c.name === cut.speaker);

                const context: VideoMotionContext = {
                    visualPrompt: cut.visualPrompt,
                    dialogue: cut.dialogue,
                    emotion: cut.emotion,
                    audioDuration: cut.estimatedDuration || 5,
                    speakerInfo: char ? { name: char.name, visualFeatures: char.visualSummary || char.description } : undefined,
                    stylePrompts: state.styleAnchor?.prompts
                };

                finalPrompt = await generateVideoMotionPrompt(context, apiKey);

            } catch (e) {
                console.error("Detailed prompt generation failed:", e);
                // Fallback: Just leave it empty if generation fails
            } finally {
                setIsGeneratingPrompt(false);
            }
        }

        const updatedScript = script.map(c =>
            c.id === cutId ? { ...c, videoPrompt: finalPrompt } : c
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

    // --- Bulk Motion Prompt Refresh ---
    const handleBulkRefreshMotionPrompts = async () => {
        const state = useWorkflowStore.getState();
        const apiKey = state.apiKeys?.gemini;

        if (!apiKey) {
            alert("Gemini API Key is missing. Please check Settings.");
            return;
        }

        if (!confirm("Are you sure you want to regenerate motion prompts for ALL cuts based on current Step 3 assets?\n\nThis will OVERWRITE existing motion prompts.\n(Visual prompts will be preserved)")) {
            return;
        }

        setIsBulkGeneratingMotion(true);
        try {
            const allChars = [...(state.characters || []), ...(state.episodeCharacters || [])];

            // Process in parallel (Gemini Flash is fast enough)
            const updatedScript = await Promise.all(script.map(async (cut) => {
                const char = allChars.find(c => c.name === cut.speaker);

                const context: VideoMotionContext = {
                    visualPrompt: cut.visualPrompt,
                    dialogue: cut.dialogue,
                    emotion: cut.emotion,
                    audioDuration: cut.estimatedDuration || 5, // Fallback duration
                    speakerInfo: char ? { name: char.name, visualFeatures: char.visualSummary || char.description } : undefined,
                    stylePrompts: state.styleAnchor?.prompts
                };

                try {
                    const newPrompt = await generateVideoMotionPrompt(context, apiKey);
                    return { ...cut, videoPrompt: newPrompt || cut.videoPrompt };
                } catch (e) {
                    console.error(`[BulkGen] Failed for cut ${cut.id}:`, e);
                    return cut; // Keep original on failure
                }
            }));

            setScript(updatedScript);
            // alert(`Successfully refreshed motion prompts for ${updatedScript.length} cuts!`);

        } catch (e) {
            console.error("Bulk generation failed:", e);
            alert("Failed to refresh motion prompts.");
        } finally {
            setIsBulkGeneratingMotion(false);
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

    // --- AI Video Generation Handler ---
    const handleAIVideoGeneration = async (mode: 'selected' | 'all') => {
        const currentProjectId = useWorkflowStore.getState().id;
        if (!currentProjectId) {
            alert('프로젝트를 먼저 저장해주세요.');
            return;
        }

        // Check API key
        const apiKey = selectedProvider === 'gemini-veo'
            ? apiKeys.gemini
            : apiKeys.replicate;

        if (!apiKey) {
            alert(`${selectedProvider === 'gemini-veo' ? 'Gemini' : 'Replicate'} API 키가 설정되지 않았습니다.\nStep 1에서 API 키를 설정해주세요.`);
            return;
        }

        // Get target cuts
        let targetCuts: ScriptCut[];
        if (mode === 'selected') {
            targetCuts = script.filter(cut =>
                selectedCuts.has(cut.id) &&
                !cut.isVideoConfirmed &&
                cut.finalImageUrl // Must have an image for I2V
            );
        } else {
            targetCuts = script.filter(cut =>
                !cut.videoUrl &&
                !cut.isVideoConfirmed &&
                cut.finalImageUrl
            );
        }

        if (targetCuts.length === 0) {
            alert('생성할 대상 컷이 없습니다.\n이미지가 있고 비디오가 없는 컷을 선택해주세요.');
            return;
        }

        setIsGenerating(true);
        setGenerationProgress({ current: 0, total: targetCuts.length, status: 'Starting...' });

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < targetCuts.length; i++) {
            const cut = targetCuts[i];
            setGenerationProgress({
                current: i + 1,
                total: targetCuts.length,
                status: `Cut #${cut.id} 생성 중...`
            });

            try {
                // Resolve image URL for I2V
                let imageUrl = cut.finalImageUrl;
                if (imageUrl && isIdbUrl(imageUrl)) {
                    imageUrl = await resolveUrl(imageUrl);
                }

                // If user provided a custom video prompt, use it exactly as is (gives full control).
                // Otherwise, use visual prompt and conditionally append dialogue.
                let prompt = cut.videoPrompt || cut.visualPrompt || '';

                // Only append dialogue if the speaker is explicitly mentioned in the prompt.
                // This prevents attaching dialogue to landscape shots or other characters, which can confuse the AI/Safety filters.
                if (!cut.videoPrompt && cut.dialogue && cut.speaker) {
                    const speakerName = cut.speaker.toLowerCase();
                    const promptText = prompt.toLowerCase();
                    if (promptText.includes(speakerName)) {
                        prompt += `. Character speaking: "${cut.dialogue}"`;
                    }
                }

                let videoUrl: string;

                if (selectedProvider === 'gemini-veo') {
                    // Use Veo
                    // Validate model existence (fallback for deprecated models like veo-3.0)
                    const validModels = getVeoModels().map(m => m.id);
                    const effectiveModel = validModels.includes(selectedVeoModel) ? selectedVeoModel : 'veo-3.1-generate-preview';

                    if (effectiveModel !== selectedVeoModel) {
                        console.warn(`[Step4.5] Deprecated model ${selectedVeoModel} detected. Switching to ${effectiveModel}.`);
                        setSelectedVeoModel(effectiveModel as VeoModel);
                    }

                    // Use Veo model's max duration (usually 8-10s) to give user flexibility
                    const veoMaxDuration = getVeoModels().find(m => m.id === effectiveModel)?.maxDuration || 8;

                    const result = await generateVideoWithVeo(apiKey, {
                        prompt,
                        imageUrl: effectiveModel === 'veo-3.1-generate-preview' ? imageUrl : undefined,
                        model: effectiveModel,
                        aspectRatio: aspectRatio || '16:9', // Use project aspect ratio
                        duration: veoMaxDuration, // Always request max duration
                    }, (status, _progress) => {
                        setGenerationProgress(prev => ({
                            ...prev,
                            status: `Cut #${cut.id}: ${status}`
                        }));
                    });
                    videoUrl = result.videoUrl;
                } else {
                    // Use Replicate model's max duration
                    const replicateMaxDuration = getVideoModels().find(m => m.id === selectedReplicateModel)?.maxDuration || 5;

                    const result = await generateVideo(apiKey, {
                        prompt,
                        imageUrl: selectedReplicateModel.includes('i2v') ? imageUrl : undefined,
                        model: selectedReplicateModel as VideoModel,
                        aspectRatio: aspectRatio || '16:9', // Use project aspect ratio
                        duration: replicateMaxDuration, // Always request max duration
                    }, (status, _progress) => {
                        setGenerationProgress(prev => ({
                            ...prev,
                            status: `Cut #${cut.id}: ${status}`
                        }));
                    });
                    videoUrl = result.videoUrl;
                }

                // Save video to IDB
                if (videoUrl) {
                    // If it's a URL (not data:), fetch and convert to data URL
                    let dataUrl = videoUrl;
                    if (!videoUrl.startsWith('data:')) {
                        try {
                            // Google API URLs require the API key and must go through our proxy to avoid CORS
                            let fetchUrl = videoUrl;
                            if (videoUrl.includes('generativelanguage.googleapis.com')) {
                                // Convert: https://generativelanguage.googleapis.com/v1beta/files/xxx
                                // To:      /api/google-ai/v1beta/files/xxx?key=...
                                const urlObj = new URL(videoUrl);
                                const proxyPath = `/api/google-ai${urlObj.pathname}${urlObj.search}`;
                                const separator = urlObj.search ? '&' : '?';
                                fetchUrl = `${proxyPath}${separator}key=${apiKey}`;
                                console.log('[VideoGen] Fetching video via proxy:', fetchUrl.substring(0, 100) + '...');
                            }

                            const response = await fetch(fetchUrl);
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                            const blob = await response.blob();
                            console.log('[VideoGen] Video blob size:', Math.round(blob.size / 1024), 'KB');
                            dataUrl = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            console.error('Failed to fetch video:', e);
                            // Use original URL as fallback - but this will likely not work
                            throw new Error(`Failed to download video from Veo API: ${(e as Error).message}`);
                        }
                    }

                    const videoKey = generateVideoKey(currentProjectId, cut.id, 'mp4');
                    const idbUrl = await saveToIdb('video', videoKey, dataUrl);

                    // Update script
                    useWorkflowStore.setState(state => ({
                        script: state.script.map(c =>
                            c.id === cut.id ? {
                                ...c,
                                videoUrl: idbUrl,
                                videoSource: selectedProvider === 'gemini-veo' ? 'veo' : 'ai' as const
                            } : c
                        )
                    }));
                    successCount++;
                }
            } catch (error: any) {
                console.error(`Failed to generate video for cut ${cut.id}:`, error);

                const errorMessage = error.message || 'Unknown error';
                errors.push(`Cut #${cut.id}: ${errorMessage}`);
                failCount++;

                // Circuit Breaker: Stop batch if Quota or Auth error occurs
                if (
                    errorMessage.includes('quota') ||
                    errorMessage.includes('429') ||
                    errorMessage.includes('403') ||
                    errorMessage.includes('401')
                ) {
                    const abortMsg = "⚠️ Critical API Error (Quota/Auth). Aborting remaining cuts to prevent system spam.";
                    console.warn(abortMsg);
                    errors.push(abortMsg);
                    break; // Stop the loop
                }
            }
        }

        // Save project
        await useWorkflowStore.getState().saveProject();

        setIsGenerating(false);
        setSelectedCuts(new Set());
        setGenerationProgress({ current: 0, total: 0, status: '' });

        if (failCount > 0) {
            let tip = "";
            if (errors.some(e => e.includes('quota') || e.includes('429'))) {
                tip = "\n💡 팁: 'Quota' 또는 '429' 에러는 구글 사용량이 일시적으로 몰린 것입니다. 1-2분 뒤에 다시 시도하거나, 계속되면 API Key를 변경해보세요.";
            }
            alert(`⚠️ 완료되었으나 일부 실패가 있습니다.\n성공: ${successCount}개\n실패: ${failCount}개\n\n[실패 원인]\n${errors.join('\n')}${tip}`);
        } else {
            alert(`✅ 모든 영상 생성 완료!\n성공: ${successCount}개`);
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


                <div className="flex items-center gap-2">
                    {/* Bulk Refresh Button */}
                    <button
                        onClick={handleBulkRefreshMotionPrompts}
                        disabled={isBulkGeneratingMotion || isGenerating}
                        className="px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 rounded-lg text-xs flex items-center gap-2 transition-colors border border-orange-500/20"
                        title="Refresh all motion prompts based on Step 3 data"
                    >
                        {isBulkGeneratingMotion ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                        Motion Refresh
                    </button>

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
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 1. AI Video Generation Mode (Left) */}
                <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)] hover:border-orange-500/30 transition-colors h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Video size={22} className="text-[var(--color-primary)]" />
                            AI Video 생성모드
                        </h2>
                        {isGenerating && (
                            <div className="flex items-center gap-3 text-sm">
                                <div className="flex items-center gap-2 text-[var(--color-primary)] opacity-80">
                                    <Loader2 className="animate-spin" size={16} />
                                    <span>{generationProgress.current}/{generationProgress.total}</span>
                                </div>
                                <span className="text-gray-400">{generationProgress.status}</span>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
                        Google Gemini Veo 또는 Replicate API를 통해 이미지로부터 직접 영상을 생성합니다.<br />
                        생성할 모델을 선택한 후, 리스트에서 컷을 골라 고품질 AI 비디오를 만들어보세요.
                    </p>

                    {/* Provider Tabs */}
                    <div className="flex gap-2 mb-4 shrink-0">
                        <button
                            onClick={() => setSelectedProvider('gemini-veo')}
                            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${selectedProvider === 'gemini-veo'
                                ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/20'
                                : 'bg-[var(--color-bg)] text-gray-400 hover:text-white hover:bg-[var(--color-bg)]/80'
                                }`}
                        >
                            Gemini Veo
                        </button>
                        <button
                            onClick={() => setSelectedProvider('replicate')}
                            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${selectedProvider === 'replicate'
                                ? 'bg-stone-600 text-white shadow-lg shadow-stone-500/20'
                                : 'bg-[var(--color-bg)] text-gray-400 hover:text-white hover:bg-[var(--color-bg)]/80'
                                }`}
                        >
                            Replicate API
                        </button>
                    </div>

                    {/* Model Selection & Actions (Flex-1 to fill height if needed, but contents are static usually) */}
                    <div className="bg-[var(--color-bg)] rounded-lg p-4 flex-1 flex flex-col">
                        {selectedProvider === 'gemini-veo' ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Model</label>
                                        <select
                                            value={selectedVeoModel}
                                            onChange={(e) => setSelectedVeoModel(e.target.value as VeoModel)}
                                            className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-white focus:border-[var(--color-primary)] outline-none"
                                        >
                                            {getVeoModels().map(model => (
                                                <option key={model.id} value={model.id}>
                                                    {model.name} - {model.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* API Key Warning */}
                                {!apiKeys.gemini && (
                                    <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-500/10 px-3 py-2 rounded-lg">
                                        <AlertCircle size={16} />
                                        <span>Gemini API 키가 필요합니다. Step 1에서 설정하세요.</span>
                                    </div>
                                )}

                                {/* Feature Badge */}
                                <div className="flex gap-2 flex-wrap">
                                    {selectedVeoModel === 'veo-3.1-generate-preview' && (
                                        <>
                                            <span className="px-2 py-1 bg-[var(--color-primary-dim)] text-[var(--color-primary)] text-xs rounded-full">4K 지원</span>
                                            <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full">Image-to-Video</span>
                                            <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Native Audio</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Model</label>
                                        <select
                                            value={selectedReplicateModel}
                                            onChange={(e) => setSelectedReplicateModel(e.target.value as ReplicateVideoModel)}
                                            className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-white focus:border-gray-500 outline-none"
                                        >
                                            {getVideoModels().map(model => (
                                                <option key={model.id} value={model.id}>
                                                    {model.name} - {model.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* API Key Warning */}
                                {!apiKeys.replicate && (
                                    <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-500/10 px-3 py-2 rounded-lg">
                                        <AlertCircle size={16} />
                                        <span>Replicate API 키가 필요합니다. Step 1에서 설정하세요.</span>
                                    </div>
                                )}

                                {/* Feature Badge */}
                                <div className="flex gap-2 flex-wrap">
                                    {selectedReplicateModel.includes('wan-2.2') && (
                                        <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded-full">Open Source</span>
                                    )}
                                    {selectedReplicateModel.includes('i2v') && (
                                        <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full">Image-to-Video</span>
                                    )}
                                    {selectedReplicateModel.includes('720p') && (
                                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">720p HD</span>
                                    )}
                                    {selectedReplicateModel.includes('kling') && (
                                        <span className="px-2 py-1 bg-pink-500/20 text-pink-300 text-xs rounded-full">Cinematic</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Generation Progress */}
                        {isGenerating && (
                            <div className="mt-4 space-y-2">
                                <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[#FF9A5C] transition-all duration-300"
                                        style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 text-center">{generationProgress.status}</p>
                            </div>
                        )}

                        {/* Spacer to push buttons down */}
                        <div className="flex-1 min-h-[20px]"></div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 mt-4 shrink-0">
                            <button
                                onClick={() => handleAIVideoGeneration('selected')}
                                disabled={isGenerating || selectedCuts.size === 0}
                                className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${isGenerating || selectedCuts.size === 0
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-[var(--color-primary)] text-black hover:brightness-110 shadow-lg shadow-[var(--color-primary)]/20'
                                    }`}
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                                선택 컷 생성 ({selectedCuts.size}개)
                            </button>
                            <button
                                onClick={() => handleAIVideoGeneration('all')}
                                disabled={isGenerating}
                                className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${isGenerating
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-stone-700 text-white hover:bg-stone-600 shadow-lg shadow-stone-500/20'
                                    }`}
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Video size={18} />}
                                미생성 컷 전체
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. External Tools (Right) - Modified to Stack Vertically */}
                <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors h-full flex flex-col">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                        <Upload size={22} className="text-[var(--color-primary)]" />
                        외부 비디오 업로드 모드
                    </h2>

                    <div className="flex flex-col gap-6 flex-1">

                        {/* Top: Export Kit */}
                        <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[var(--color-primary)]/50 transition-all group">
                            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                                <Download size={20} className="text-[var(--color-primary)]" />
                                1. 외부 Video 생성 Kit
                            </h3>
                            <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
                                각 컷의 이미지 파일과 기술적으로 보강된 비디오 프롬프트를 묶어 다운로드합니다.<br />
                                Runway, Luma, Kling 등의 외부 서비스에서 이 파일들을 사용하여 고품질 비디오를 생성하세요.
                            </p>
                            <button
                                onClick={handleExportKit}
                                disabled={isExportingKit}
                                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700 border border-white/10 group-hover:border-[var(--color-primary)]/30 transition-colors"
                            >
                                {isExportingKit ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                                <span className="font-semibold">Generation Kit 다운로드 (.zip)</span>
                            </button>
                        </div>

                        {/* Arrow separator (Visual only) */}
                        <div className="flex justify-center text-gray-600">
                            <ChevronLeft className="rotate-[-90deg]" size={24} />
                        </div>

                        {/* Bottom: Import */}
                        <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[var(--color-primary)]/50 transition-all group">
                            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                                <Upload size={20} className="text-[var(--color-primary)]" />
                                2. 생성된 비디오 업로드
                            </h3>
                            <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
                                외부에서 생성한 영상 파일들을 이곳에 일괄 업로드하세요.<br />
                                파일명을 'cut_001.mp4' 등으로 유지하면 자동으로 매칭됩니다.
                            </p>
                            <button
                                onClick={() => setShowBulkUploadModal(true)}
                                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700 border border-white/10 group-hover:border-[var(--color-primary)]/30 transition-colors"
                            >
                                <Upload size={20} />
                                <span className="font-semibold">비디오 일괄 업로드</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Selection Actions */}
            {
                selectedCuts.size > 0 && (
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
                )
            }


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
                    {script.map((cut, idx) => (
                        <VideoCompositionRow
                            key={cut.id}
                            index={idx}
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
            {
                showPromptEditor !== null && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-[var(--color-surface)] rounded-xl p-6 max-w-2xl w-full border border-[var(--color-border)]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">Edit Video Prompt - Cut #{showPromptEditor}</h3>
                                <button
                                    onClick={() => setEditingPrompt('')}
                                    className="px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors flex items-center gap-1.5 text-xs font-bold"
                                    title="내용 지우기 (저장 시 자동 생성됨)"
                                >
                                    <Trash2 size={12} /> CLEAR
                                </button>
                            </div>
                            <textarea
                                value={editingPrompt}
                                onChange={(e) => setEditingPrompt(e.target.value)}
                                className="w-full h-40 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-white resize-none focus:border-[var(--color-primary)] outline-none"
                            />
                            <div className="flex justify-end gap-2 mt-4">
                                <button
                                    onClick={() => setShowPromptEditor(null)}
                                    className="px-4 py-2 bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded-lg"
                                    disabled={isGeneratingPrompt}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => saveVideoPrompt(showPromptEditor)}
                                    className="px-4 py-2 bg-[var(--color-primary)] text-black font-semibold rounded-lg flex items-center gap-2"
                                    disabled={isGeneratingPrompt}
                                >
                                    {isGeneratingPrompt ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        'Save'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Bulk Upload Modal */}
            {
                showBulkUploadModal && (
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
                )
            }

            {/* Video Preview Modal with Audio Comparison */}
            {
                previewVideoUrl && previewCutId !== null && (() => {
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
                })()
            }
        </div >
    );
};
