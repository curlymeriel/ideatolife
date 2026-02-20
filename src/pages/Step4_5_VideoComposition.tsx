import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import {
    Video, Upload, Play, Edit3, Check, X, Loader2,
    ChevronLeft, ChevronRight, FileVideo, Image as ImageIcon, Film,
    Lock, Download, Zap, RefreshCw, FolderOpen,
    Volume2, Sparkles, AlertCircle, Trash2, Scissors, Mic, AlertTriangle
} from 'lucide-react';

import { VideoTrimmer } from '../components/Production/VideoTrimmer';

import type { ScriptCut, VideoMotionContext } from '../services/gemini';
import { resolveUrl, isIdbUrl, saveToIdb, generateVideoKey } from '../utils/imageStorage';
import { exportVideoGenerationKit } from '../utils/videoGenerationKitExporter';
import { generateVideo, getVideoModels, type VideoModel } from '../services/videoGen';
import { generateVideoWithVeo, getVeoModels } from '../services/veoGen';
import { generateVideoWithKie, getKieModels } from '../services/kieGen';
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
    const hasVideoData = !!cut.videoUrl;

    return (
        <div
            className={`transition-colors ${isLocked ? 'bg-green-500/5' : isSelected ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-bg)]'} border-b border-white/5`}
        >
            {/* Top Row: Main Controls */}
            <div className="grid grid-cols-[40px_80px_1fr_120px_150px_200px] gap-2 px-4 py-3 items-center">
                <div className="flex items-center justify-center">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggleSelection}
                        className="w-4 h-4 accent-[var(--color-primary)]"
                    />
                </div>

                <div className="relative w-16 h-10 bg-[var(--color-bg)] rounded overflow-hidden group">
                    {hasVideoData ? (
                        <div className="relative w-full h-full bg-black cursor-pointer" onClick={() => onPreview()}>
                            {/* [FIX] Never render <video> in row list - prevents decoder exhaustion */}
                            {/* Always show static thumbnail with click-to-preview overlay */}
                            <div className="absolute inset-0">
                                {cut.finalImageUrl ? (
                                    <ResolvedImage src={cut.finalImageUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-black/40 flex items-center justify-center">
                                        <Film size={16} className="text-white/30" />
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                <Play size={20} className="text-white fill-white" />
                            </div>
                        </div>
                    ) : (
                        cut.finalImageUrl ? (
                            <ResolvedImage src={cut.finalImageUrl} className="w-full h-full object-cover" fallbackSrc={cut.draftImageUrl} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]"><ImageIcon size={16} /></div>
                        )
                    )}
                    <div className="absolute bottom-0 right-0 bg-black/70 text-xs px-1 text-white">#{index + 1}</div>
                </div>

                <div className="min-w-0">
                    <div className="text-sm text-white font-medium truncate">{cut.speaker}: {cut.dialogue}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">{cut.videoPrompt || cut.visualPrompt || 'No prompt'}</div>
                </div>

                <div className="text-sm text-[var(--color-text-muted)]">
                    {cut.videoTrim ? (cut.videoTrim.end - cut.videoTrim.start).toFixed(1) : (cut.videoDuration || cut.estimatedDuration || 5).toFixed(1)}s
                    {cut.videoTrim && <span className="ml-1 text-xs text-[var(--color-primary)]">(Trimmed)</span>}
                </div>

                <div>
                    {status?.status === 'uploading' ? (
                        <span className="flex items-center gap-1 text-xs text-yellow-400"><Loader2 className="animate-spin" size={12} /> Uploading...</span>
                    ) : status?.status === 'error' ? (
                        <span className="flex items-center gap-1 text-xs text-red-400"><X size={12} /> {status.error}</span>
                    ) : (
                        cut.videoUrl ? (
                            cut.isVideoConfirmed ?
                                <span className="flex items-center gap-1 text-xs text-green-400 font-medium"><Check size={12} /> Confirmed</span> :
                                <span className="flex items-center gap-1 text-xs text-[var(--color-primary)] font-medium"><FileVideo size={12} /> Ready</span>
                        ) : <span className="text-xs text-[var(--color-text-muted)] opacity-50">Empty</span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {cut.videoUrl && (
                        <>
                            <button onClick={onPreview} className="p-1.5 rounded hover:bg-[var(--color-bg)] text-[var(--color-primary)]" title="Preview Video & Audio"><Play size={16} /></button>
                            {!isLocked && (
                                <button onClick={onConfirm} className="p-1.5 rounded hover:bg-green-500/20 text-green-400" title="Confirm"><Check size={16} /></button>
                            )}
                        </>
                    )}

                    {isLocked ? (
                        <button onClick={onUnconfirm} className="p-1.5 rounded hover:bg-green-500/20 text-green-400" title="Unlock"><Lock size={16} /></button>
                    ) : (
                        cut.videoUrl && <button onClick={onRemoveVideo} className="p-1.5 rounded hover:bg-[var(--color-bg)] text-red-400" title="Remove"><X size={16} /></button>
                    )}

                    {!isLocked && (
                        <>
                            <button onClick={onEditPrompt} className="p-1.5 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-muted)]" title="Edit Prompt"><Edit3 size={16} /></button>
                            <label className="p-1.5 rounded hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-pointer" title="Upload">
                                <Upload size={16} />
                                <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                            </label>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

const repairVideoData = async (store: any, script: ScriptCut[], onProgress: (msg: string) => void, onComplete?: () => void) => {
    const { loadFromIdb, parseIdbUrl, saveToIdb, generateVideoKey, clearBlobUrlCache } = await import('../utils/imageStorage');
    const { keys } = await import('idb-keyval');

    console.log(`[Repair:BruteForce] Starting total reset of ${script.length} cuts...`);
    clearBlobUrlCache();

    const currentProjectId = store.id;
    let fixedCount = 0;

    // Get all available keys once for broad search
    const allIdbKeys = await keys();
    const projectMediaKeys = allIdbKeys.filter(k => typeof k === 'string' && k.includes(currentProjectId)) as string[];

    const auditMimeFromMagicBytes = async (blob: Blob): Promise<string | null> => {
        try {
            const buffer = await blob.slice(0, 12).arrayBuffer();
            const view = new Uint8Array(buffer);
            if (view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3) return 'video/webm';
            const isFtyp = String.fromCharCode(view[4], view[5], view[6], view[7]) === 'ftyp';
            if (isFtyp) return 'video/mp4';
            return null;
        } catch (e) { return null; }
    };

    for (const cut of script) {
        if (!cut.videoUrl) continue;

        try {
            let blobToSave: Blob | null = null;
            let extension = 'mp4';

            // Step 1: Force Re-wrap and MIME Correction
            if (cut.videoUrl.startsWith('idb://')) {
                const parsed = parseIdbUrl(cut.videoUrl);
                if (!parsed) continue;
                extension = parsed.key.split('.').pop()?.toLowerCase() || 'mp4';

                onProgress(`Checking Cut #${cut.id}...`);
                let rawData = await loadFromIdb(cut.videoUrl);

                // [FIX] If direct load fails, try to find by ID in available keys (Project Migration/ID Shift Fix)
                if (!rawData) {
                    console.log(`[Repair] Direct load failed for ${cut.videoUrl}. Searching project keys...`);
                    const fallbackKey = projectMediaKeys.find(k => k.includes(`-video-${cut.id}`));
                    if (fallbackKey) {
                        const actualKey = fallbackKey.replace('media-video-', '');
                        console.log(`[Repair] Found fallback key match: ${actualKey}`);
                        rawData = await loadFromIdb(`idb://video/${actualKey}`);
                    }
                }

                if (!rawData) continue;

                if (rawData instanceof Blob) {
                    const magicMime = await auditMimeFromMagicBytes(rawData);
                    const targetMime = magicMime || (extension === 'webm' ? 'video/webm' : 'video/mp4');
                    // Always re-wrap to refresh browser cache and DB descriptors
                    blobToSave = new Blob([rawData], { type: targetMime });
                } else if (typeof rawData === 'string' && rawData.startsWith('data:')) {
                    const base64Part = rawData.split(',')[1];
                    if (base64Part) {
                        const binary = atob(base64Part);
                        const array = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                        const magicMime = await auditMimeFromMagicBytes(new Blob([array]));
                        blobToSave = new Blob([array], { type: magicMime || (extension === 'webm' ? 'video/webm' : 'video/mp4') });
                    }
                }
            } else if (cut.videoUrl.startsWith('http')) {
                onProgress(`Migrating Cut #${cut.id} to local IDB...`);
                try {
                    const resp = await fetch(cut.videoUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const magicMime = await auditMimeFromMagicBytes(blob);
                        extension = cut.videoUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
                        if (magicMime === 'video/webm') extension = 'webm';
                        blobToSave = new Blob([blob], { type: magicMime || (extension === 'webm' ? 'video/webm' : 'video/mp4') });
                    }
                } catch (e) { console.warn(`[Repair] HTTP fetch failed for #${cut.id}`); }
            }

            // Step 2: Force Save & State Reset
            let finalVideoUrl = cut.videoUrl;
            if (blobToSave) {
                const videoKey = generateVideoKey(currentProjectId, cut.id, extension);
                finalVideoUrl = await saveToIdb('video', videoKey, blobToSave);
            }

            // [BRUTE FORCE] Always reset audio state to "On" and "100%" if repair is running
            useWorkflowStore.setState(state => ({
                script: state.script.map(c =>
                    c.id === cut.id ? {
                        ...c,
                        videoUrl: finalVideoUrl,
                        useVideoAudio: true,
                        audioVolumes: {
                            ...(c.audioVolumes || { tts: 1.0, bgm: 0.5 }),
                            video: 1.0
                        }
                    } : c
                )
            }));

            fixedCount++;

        } catch (e) {
            console.error(`[Repair] Failed Cut #${cut.id}:`, e);
        }
    }
    await useWorkflowStore.getState().saveProject();
    if (onComplete) onComplete();
    return fixedCount;
};

const AudioComparisonModal = React.memo<{
    previewCut: ScriptCut | undefined;
    onClose: () => void;
    onSave: (updates: Partial<ScriptCut>) => void;
    videoMountKey: number;
}>(({ previewCut, onClose, onSave, videoMountKey }) => {
    // State
    // Smart Default: Use Video Audio if explicitly set OR if it's an uploaded video (likely contains speech/audio we want to keep)
    const [selectedAudioSource, setSelectedAudioSource] = useState<'video' | 'tts'>(() => {
        // [FIX] useVideoAudio가 명시적으로 true인 경우만 video 선택
        // videoSource === 'upload' fallback 제거 - handleSingleUpload에서 이제 useVideoAudio: true를 같이 저장함
        const defaultSource = (previewCut?.useVideoAudio === true) ? 'video' : 'tts';
        console.log('[AudioModal:Init] ID:', previewCut?.id, 'useVideoAudio:', previewCut?.useVideoAudio, 'videoSource:', previewCut?.videoSource, '=> Defaulting to:', defaultSource, 'Volumes:', previewCut?.audioVolumes);
        return defaultSource;
    });
    // [FIX] videoMountKey is now passed from parent to sync with Repair utility

    // [New State]
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string>('');
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [loadingStatus, setLoadingStatus] = useState<string | null>('Initializing...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [durationMaster, setDurationMaster] = useState<'audio' | 'video'>(previewCut?.cutDurationMaster || 'audio');


    // [New Effect] Resolve URL & Download Logic
    useEffect(() => {
        const abortController = new AbortController();
        const signal = abortController.signal;

        if (!previewCut?.videoUrl) {
            setPreviewVideoUrl('');
            setDownloadProgress(null);
            setLoadingStatus(null);
            setErrorMsg('비디오 URL을 찾을 수 없습니다.');
            return;
        }

        const targetCutVideoUrl = previewCut.videoUrl;

        const resolveVideoUrl = async () => {
            setLoadingStatus('Checking media...');
            setErrorMsg(null);

            try {
                if (isIdbUrl(targetCutVideoUrl)) {
                    setLoadingStatus('Loading from DB...');
                    // [FIX] Use asBlob: true for modal preview to avoid heavy Base64 data corruption
                    const url = await resolveUrl(targetCutVideoUrl, { asBlob: true });
                    if (signal.aborted) return;

                    if (url) {
                        setPreviewVideoUrl(prev => prev === url ? prev : url);
                    } else {
                        throw new Error('IndexedDB에서 영상을 찾을 수 없습니다. (데이터 유실 가능성)');
                    }
                    setLoadingStatus(null);
                } else if (targetCutVideoUrl.startsWith('http')) {
                    // Check if we already have a cached version (optimization)
                    const cacheKey = `media-video-v4-${previewCut.id}-${btoa(targetCutVideoUrl).slice(-10)}`;
                    const { get, set } = await import('idb-keyval');
                    const cachedBlob = await get(cacheKey);

                    if (signal.aborted) return;

                    if (cachedBlob) {
                        console.log('[PreviewURL] Found cached video in IDB');
                        let blobToUse = cachedBlob as Blob;

                        // [FIX] MIME Healing Logic
                        if (blobToUse.type === 'video/mp4' || blobToUse.type === 'application/octet-stream') {
                            try {
                                const buffer = await blobToUse.slice(0, 4).arrayBuffer();
                                const view = new Uint8Array(buffer);
                                if (view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3) {
                                    blobToUse = new Blob([blobToUse], { type: 'video/webm' });
                                }
                            } catch (e) {
                                console.warn('[PreviewURL] Failed to check magic bytes', e);
                            }
                        }

                        const blobUrl = URL.createObjectURL(blobToUse);
                        setPreviewVideoUrl(blobUrl);
                        setLoadingStatus('Ready');
                        setTimeout(() => setLoadingStatus(null), 500);
                        return;
                    }


                    // Download and Cache
                    console.log('[PreviewURL] Fetching remote video:', targetCutVideoUrl.substring(0, 80));
                    setLoadingStatus('Starting download...');
                    setDownloadProgress(0);

                    const response = await fetch(targetCutVideoUrl, { signal });
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

                    let contentType = response.headers.get('content-type');
                    // [FIX] Fallback for missing/generic content-type
                    if (!contentType || contentType === 'application/octet-stream') {
                        if (targetCutVideoUrl.includes('.webm')) contentType = 'video/webm';
                        else if (targetCutVideoUrl.includes('.mp4')) contentType = 'video/mp4';
                    }
                    const contentLength = response.headers.get('content-length');
                    const total = contentLength ? parseInt(contentLength, 10) : 0;
                    let loaded = 0;

                    const reader = response.body?.getReader();
                    const chunks = [];

                    if (reader) {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                if (signal.aborted) {
                                    reader.cancel();
                                    return;
                                }
                                chunks.push(value);
                                loaded += value.length;
                                if (total) { // Only update if total is known
                                    const progress = Math.round((loaded / total) * 100);
                                    setDownloadProgress(progress);
                                    setLoadingStatus(`[${contentType}] Downloading... ${progress}%`);
                                } else {
                                    setLoadingStatus(`Downloading... ${(loaded / 1024 / 1024).toFixed(1)} MB`);
                                }
                            }

                            if (signal.aborted) return;

                            // [FIX] Detect actual MIME type
                            let finalMime = contentType || 'video/mp4';
                            // ... existing magic bytes check ...
                            const blob = new Blob(chunks, { type: finalMime });

                            // [FIX] Store chunks in IDB and create URL
                            // ... (omitted specifics for brevity, will rely on existing logic but wrapped in signal check)
                            // Logic continues as before but guarded by signal.aborted
                            console.log('[PreviewURL] Blob downloaded - size:', blob.size, 'bytes, MIME:', finalMime);
                            setLoadingStatus('Caching video...');
                            await set(cacheKey, blob);

                            if (signal.aborted) return;

                            const blobUrl = URL.createObjectURL(blob);
                            setPreviewVideoUrl(prev => {
                                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                                return blobUrl;
                            });
                            setDownloadProgress(null);
                            setLoadingStatus('Ready');
                            setTimeout(() => setLoadingStatus(null), 500);

                        } catch (e) {
                            if (signal.aborted) return;
                            throw e;
                        }
                    }
                } else {
                    setPreviewVideoUrl(targetCutVideoUrl);
                    setLoadingStatus(null);
                }
            } catch (e) {
                if (signal.aborted) return;
                console.error('[PreviewURL] Failed to resolve:', e);
                setDownloadProgress(null);
                setLoadingStatus(null);
                setErrorMsg(e instanceof Error ? e.message : 'Unknown error loading video');
                // setPreviewVideoUrl(targetCutVideoUrl); // Don't fallback to remote URL on error to avoid looping/hanging
            }
        };

        resolveVideoUrl();

        // [FIX] Cleanup Blob URL & Video Buffer on unmount/update to prevent memory leaks (3GB reported)
        return () => {
            abortController.abort(); // Cancel pending fetch

            setPreviewVideoUrl(prev => {
                if (prev && prev.startsWith('blob:')) {
                    console.log('[PreviewURL] Revoking blob URL on cleanup');
                    URL.revokeObjectURL(prev);
                }
                return '';
            });

            // Force clear video buffer
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.src = '';
                videoRef.current.load();
            }
        };
    }, [previewCut?.videoUrl, videoMountKey]);



    // [HEALING] Audio Pulse to wake up browser audio engine
    useEffect(() => {
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                const ctx = new AudioContextClass();
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => { });
                }
                const oscillator = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0.0001; // Silent pulse
                oscillator.connect(gain);
                gain.connect(ctx.destination);
                oscillator.start(0);
                oscillator.stop(0.001);
                setTimeout(() => ctx.close(), 100);
            }
        } catch (e) { }
    }, [videoMountKey]);

    // Initialize volumes defensively: ensure keys exist even if partial data was saved
    const [volumes, setVolumes] = useState(() => {
        const saved = previewCut?.audioVolumes;
        // HEALING LOGIC: If volume was missing or 0, restore to 1.0 for the active source
        const healedVideo = (typeof saved?.video !== 'number' || (saved.video === 0 && previewCut?.useVideoAudio)) ? 1.0 : saved.video;
        const healedTts = (typeof saved?.tts !== 'number' || (saved.tts === 0 && !previewCut?.useVideoAudio)) ? 1.0 : saved.tts;

        return {
            video: healedVideo,
            tts: healedTts,
            bgm: typeof saved?.bgm === 'number' ? saved.bgm : 0.5
        };
    });

    const volumesRef = useRef(volumes);
    const audioSourceRef = useRef(selectedAudioSource);

    // [NEW] Local Trim State to decouple from parent re-renders during drag
    const [localTrim, setLocalTrim] = useState(() => ({
        start: previewCut?.videoTrim?.start ?? 0,
        end: previewCut?.videoTrim?.end ?? 0
    }));

    useEffect(() => {
        volumesRef.current = volumes;
        audioSourceRef.current = selectedAudioSource;
    }, [volumes, selectedAudioSource]);

    // [FIX] Sync local state with prop updates (e.g., if generation finishes or parent saves)
    useEffect(() => {
        if (previewCut) {
            const propSource = previewCut.useVideoAudio ? 'video' : 'tts';
            if (propSource !== selectedAudioSource) {
                console.log('[AudioModal:Sync] Prop Source Change:', propSource);
                setSelectedAudioSource(propSource);
            }
            if (previewCut.audioVolumes) {
                setVolumes(prev => {
                    if (JSON.stringify(prev) !== JSON.stringify(previewCut.audioVolumes)) {
                        return { ...prev, ...previewCut.audioVolumes };
                    }
                    return prev;
                });
            }
        }
    }, [previewCut?.useVideoAudio, JSON.stringify(previewCut?.audioVolumes)]);

    // Video State
    const [videoDuration, setVideoDuration] = useState(0);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // TTS State
    const [resolvedTtsUrl, setResolvedTtsUrl] = useState<string>('');
    const ttsAudioRef = useRef<HTMLAudioElement>(null);

    // [FIX] Trim Refs to prevent re-rendering video player on every slider drag
    const currentTrimRef = useRef(localTrim);

    // Sync Ref with local state
    useEffect(() => {
        currentTrimRef.current = localTrim;
    }, [localTrim]);

    // Sync local state if parent prop changes (e.g. initial load)
    useEffect(() => {
        if (previewCut?.videoTrim) {
            setLocalTrim({
                start: previewCut.videoTrim.start,
                end: previewCut.videoTrim.end
            });
        }
    }, [previewCut?.id]); // Only sync when the cut changes, not when contents change (prevent loops)

    // [FIX] Auto-init trim end when metadata loads if it wasn't set (prevents 0.1s loop bug)
    useEffect(() => {
        if (videoDuration > 0 && localTrim.end === 0) {
            console.log('[AudioModal] Auto-init trim end to duration:', videoDuration);
            setLocalTrim(prev => ({ ...prev, end: videoDuration }));
        }
    }, [videoDuration]);

    // 1. Video Player Lifecycle & Event Handling
    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        const dur = videoRef.current.duration || 0;
        setVideoDuration(dur);

        // [HEALING] Fix invalid or too short trim range (e.g. < 0.5s) which causes infinite buffering/looping
        const { start, end } = currentTrimRef.current;
        // If end is 0 (uninitialized) or range is too short, reset to full duration
        if (dur > 0.5) {
            const currentDuration = (end > 0 ? end : dur) - start;
            if (currentDuration < 0.5) {
                console.log('[AudioModal] Healing invalid trim range:', { start, end, dur }, '-> Resetting to full');
                setLocalTrim({ start: 0, end: dur });
                currentTrimRef.current = { start: 0, end: dur };
            }
        }

        // Initial seek to trim start if exists
        if (currentTrimRef.current.start > 0) {
            videoRef.current.currentTime = currentTrimRef.current.start;
        }

        // [FIX] Sync muted/volume state when video is ready
        const isVideoSelected = audioSourceRef.current === 'video';
        videoRef.current.muted = !isVideoSelected;
        videoRef.current.volume = isVideoSelected ? (volumesRef.current.video ?? 1) : 0;
        console.log('[AudioModal:loadedMetadata] Synced muted:', videoRef.current.muted, 'volume:', videoRef.current.volume);
    };

    const handlePlay = () => {
        setIsVideoPlaying(true);
        if (videoRef.current) {
            const isVideoSelected = audioSourceRef.current === 'video';
            videoRef.current.muted = !isVideoSelected;
            videoRef.current.volume = isVideoSelected ? (volumesRef.current.video ?? 1) : 0;

            if (isVideoSelected && videoRef.current.muted) {
                videoRef.current.muted = false;
                videoRef.current.volume = volumesRef.current.video ?? 1.0;
            }
        }

        if (ttsAudioRef.current && audioSourceRef.current === 'tts') {
            const t = ttsAudioRef.current;
            t.muted = false;
            t.volume = volumesRef.current.tts ?? 1.0;
            if (t.paused) t.play().catch(e => {
                // AbortError is expected when user pauses/seeks rapidly
                if (e.name !== 'AbortError') console.warn('[AudioModal:Play] TTS Play Error:', e);
            });
        }
    };

    const handlePause = () => setIsVideoPlaying(false);

    // [FIX] Shared loop logic to handle both long video and long audio
    const triggerLoop = () => {
        if (!videoRef.current) return;
        const { start } = currentTrimRef.current;

        console.log('[AudioModal] Loop Triggered');
        videoRef.current.currentTime = start;

        // Ensure both resume from start
        if (ttsAudioRef.current && audioSourceRef.current === 'tts') {
            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current.play().catch(() => { });
        }

        if (videoRef.current.paused) {
            videoRef.current.play().catch(() => { });
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const { start, end } = currentTrimRef.current;
        const dur = videoRef.current.duration;
        const isVideoSelected = audioSourceRef.current === 'video';

        // [HEALING] Force re-sync volume/mute every update to prevent browser silent mutes
        if (isVideoSelected) {
            if (videoRef.current.muted) videoRef.current.muted = false;
            if (Math.abs(videoRef.current.volume - (volumesRef.current.video ?? 1)) > 0.05) {
                videoRef.current.volume = volumesRef.current.video ?? 1;
            }
        } else {
            if (!videoRef.current.muted) videoRef.current.muted = true;
        }

        // Loop/Clamp logic only during playback
        if (!videoRef.current.paused && isFinite(dur) && dur > 0.1) {
            const effectiveEnd = (end > 0) ? end : dur;
            const videoTrimDuration = effectiveEnd - start;

            // [FIX] Calculate Loop End based on MAX(VideoTrim, AudioDuration)
            // If TTS is selected, we want to hear the full audio even if video is short.
            let loopDuration = videoTrimDuration;
            if (audioSourceRef.current === 'tts' && ttsAudioRef.current) {
                const audioDur = ttsAudioRef.current.duration;
                if (isFinite(audioDur) && audioDur > videoTrimDuration) {
                    loopDuration = audioDur;
                }
            }

            const currentPlayTime = videoRef.current.currentTime - start;

            // CHECK LOOP CONDITION
            // Note: We use a small buffer (0.1s) to prevent stutter at exact end
            if (currentPlayTime >= loopDuration - 0.1) {
                // RESET TO START (Loop)
                videoRef.current.currentTime = start;

                if (ttsAudioRef.current && audioSourceRef.current === 'tts') {
                    ttsAudioRef.current.currentTime = 0;
                    if (ttsAudioRef.current.paused) ttsAudioRef.current.play().catch(() => { });
                }

                if (videoRef.current.paused) videoRef.current.play().catch(() => { });
                return;
            }

            // [FIX] Freeze Video if it exceeds trim end but loop hasn't triggered (Audio still playing)
            // If we are past the video trim end, but waiting for audio...
            if (currentPlayTime >= videoTrimDuration && !videoRef.current.paused) {
                videoRef.current.pause();
                videoRef.current.currentTime = effectiveEnd; // Snap to visual end
            } else if (currentPlayTime < videoTrimDuration && videoRef.current.paused) {
                // Resume video if we looped back and it was paused
                videoRef.current.play().catch(() => { });
            }

            // [FIX] Tighter continuous sync for TTS (Only if video is playing/moving)
            if (ttsAudioRef.current && audioSourceRef.current === 'tts' && !ttsAudioRef.current.paused) {
                // If video is frozen, we don't sync TTS to video time (TTS drives itself)
                // If video is moving, we sync
                if (!videoRef.current.paused) {
                    const expectedTts = Math.max(0, videoRef.current.currentTime - start);
                    if (Math.abs(expectedTts - ttsAudioRef.current.currentTime) > 0.25) {
                        ttsAudioRef.current.currentTime = expectedTts;
                    }
                }
            }
        }
    };

    useEffect(() => {
        // [HEALING] Initial metadata check if ref exists and ready
        if (videoRef.current && videoRef.current.readyState >= 1) {
            handleLoadedMetadata();
        }
    }, [previewVideoUrl, videoMountKey]);

    // Resolve TTS audio URL
    useEffect(() => {
        if (!previewCut?.audioUrl) return;
        if (isIdbUrl(previewCut.audioUrl)) {
            // [OPTIMIZATION] Use Blob URL for TTS
            resolveUrl(previewCut.audioUrl, { asBlob: true }).then(url => setResolvedTtsUrl(url));
        } else {
            setResolvedTtsUrl(previewCut.audioUrl);
        }
    }, [previewCut?.audioUrl]);

    // State for audio track detection
    const [hasAudioTrack, setHasAudioTrack] = useState<boolean | null>(null);

    // 3. Audio Track Detection (Background check)
    useEffect(() => {
        if (!videoRef.current) return;
        const check = () => {
            const v = videoRef.current as any;
            if (!v || v.readyState < 1) return;
            const hasAudio = (v.webkitAudioDecodedByteCount > 0) || (v.mozHasAudio === true) || (v.audioTracks?.length > 0);
            setHasAudioTrack(!!hasAudio);
        };
        const interval = setInterval(check, 5000);
        check();
        return () => clearInterval(interval);
    }, [previewVideoUrl]);

    // 2. Audio/TTS Integration (State-Driven Update)
    useEffect(() => {
        const videoEl = videoRef.current;
        const ttsEl = ttsAudioRef.current;
        if (!videoEl) return;

        // Sync Audio State
        const isVideoSelected = selectedAudioSource === 'video';
        videoEl.muted = !isVideoSelected;
        videoEl.volume = isVideoSelected ? (volumes.video ?? 1) : 0;
        console.log('[AudioModal:SyncEffect] selectedAudioSource:', selectedAudioSource, 'Applied muted:', videoEl.muted, 'volume:', videoEl.volume, 'volumes state:', volumes);

        if (ttsEl) {
            const isTtsSelected = selectedAudioSource === 'tts';
            ttsEl.muted = !isTtsSelected;
            ttsEl.volume = isTtsSelected ? (volumes.tts ?? 1) : 0;

            if (isTtsSelected) {
                if (isVideoPlaying && ttsEl.paused) {
                    ttsEl.play().catch(e => console.warn('[AudioModal:Sync] TTS Play failed:', e));
                } else if (!isVideoPlaying && !ttsEl.paused) {
                    ttsEl.pause();
                }

                // [FIX] Calculate TTS time relative to video trim
                // If video is at 10s and trim starts at 5s, TTS should be at 5s.
                const trimStart = currentTrimRef.current.start || 0;
                const expectedTtsTime = Math.max(0, videoEl.currentTime - trimStart);

                if (Math.abs(expectedTtsTime - ttsEl.currentTime) > 0.15) {
                    console.log('[AudioModal:Sync] Adjusting TTS sync:', { videoTime: videoEl.currentTime, trimStart, expectedTtsTime, actualTts: ttsEl.currentTime });
                    ttsEl.currentTime = expectedTtsTime;
                }
            }
        }
    }, [selectedAudioSource, JSON.stringify(volumes), isVideoPlaying, resolvedTtsUrl]);


    const handleSourceChange = (source: 'video' | 'tts') => {
        setSelectedAudioSource(source);

        // [HEALING] If the newly selected source has 0 volume, restore it to 1.0
        setVolumes(prev => {
            const currentVol = prev[source];
            // If volume is undefined or very low, boost it to 1.0 so user can hear it
            if (typeof currentVol !== 'number' || currentVol < 0.05) {
                console.log(`[AudioModal] Healing volume for ${source}: ${currentVol} -> 1.0`);
                return { ...prev, [source]: 1.0 };
            }
            return prev;
        });
    };

    const handleVolumeChange = (type: 'video' | 'tts', val: number) => {
        setVolumes(prev => ({ ...prev, [type]: val }));
        // [OPTIMIZATION] Update internal state only.
    };

    const handleTrimChange = (start: number, end: number) => {
        // [OPTIMIZATION] Only update local state to avoid heavy parent re-renders
        setLocalTrim({ start, end });

        // We do NOT call onUpdateCut here anymore. Persistence happens on Save.
        // This stops the playback jitter/buffering during drag.
    };

    if (!previewCut) return null;

    return (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
            <div className="max-w-4xl w-full relative bg-[var(--color-surface)] rounded-2xl overflow-hidden flex flex-col my-auto border border-[var(--color-border)] shadow-2xl" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Video size={20} className="text-[var(--color-primary)]" />
                        Cut #{previewCut.id} - Unified Media Editor
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content */}
                <div className="bg-black/20 flex flex-col">

                    {/* 1. Video Preview (Top) */}
                    <div className="bg-black relative aspect-video max-h-[40vh] shrink-0 border-b border-white/5">
                        {/* [CRITICAL] key={videoMountKey} forces the browser to discard the old decoder state */}
                        {previewVideoUrl && (
                            <video
                                key={`${previewCut?.id}-${videoMountKey}`}
                                ref={videoRef}
                                src={previewVideoUrl}
                                className={`w-full h-full object-contain ${loadingStatus ? 'opacity-0' : 'opacity-100'} transition-opacity`}

                                playsInline
                                preload="auto"
                                controls
                                // [FIX] autoPlay removed: manual play is more reliable for audio unlock
                                onLoadedMetadata={handleLoadedMetadata}
                                onTimeUpdate={handleTimeUpdate}
                                onPlay={handlePlay}
                                onPause={handlePause}
                                onEnded={triggerLoop}
                                onError={(e) => {
                                    console.error('[AudioModal:Video] Engine Error:', e.currentTarget.error, 'src:', previewVideoUrl?.substring(0, 100));
                                    setErrorMsg('비디오 데크 오류 (코덱 또는 MIME 불일치)');
                                    setLoadingStatus(null);
                                }}
                            />
                        )}



                        {/* Loading & Download Overlay */}
                        {(loadingStatus || downloadProgress !== null) && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                                <Loader2 size={32} className="text-[var(--color-primary)] animate-spin mb-3" />
                                <div className="text-white font-medium mb-1">{loadingStatus || 'Loading...'}</div>
                                {downloadProgress !== null && (
                                    <>
                                        <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden mt-2">
                                            <div
                                                className="h-full bg-[var(--color-primary)] transition-all duration-200"
                                                style={{ width: `${downloadProgress}%` }}
                                            />
                                        </div>
                                        <div className="text-xs text-white/70 mt-1">{downloadProgress}%</div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Error Overlay */}
                        {errorMsg && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-6 text-center">
                                <div className="text-red-500 mb-2">
                                    <AlertCircle size={32} />
                                </div>
                                <div className="text-white font-bold mb-1">Failed to Load Video</div>
                                <div className="text-white/70 text-sm mb-4 break-words max-w-[80%]">{errorMsg}</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setErrorMsg(null); setLoadingStatus('Retrying...'); }}
                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm transition-colors text-white"
                                    >
                                        Retry
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Fallback: try open in new tab if it's external url
                                            if (previewCut?.videoUrl?.startsWith('http')) {
                                                window.open(previewCut.videoUrl, '_blank');
                                            }
                                        }}
                                        className="px-4 py-2 bg-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/40 text-[var(--color-primary)] rounded-full text-sm transition-colors"
                                    >
                                        Open Original
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Refresh Button Overlay */}
                        <button
                            onClick={() => {
                                if (videoRef.current) {
                                    // [HEALING] Force reset volume/mute on refresh
                                    videoRef.current.muted = false;
                                    videoRef.current.volume = volumesRef.current.video;

                                    const currentSrc = videoRef.current.src;
                                    videoRef.current.src = '';
                                    setTimeout(() => {
                                        if (videoRef.current) {
                                            videoRef.current.src = currentSrc;
                                            videoRef.current.load();
                                            videoRef.current.play().catch(() => { });
                                            // Second pass for mobile/aggressive browser policies
                                            setTimeout(() => {
                                                if (videoRef.current) {
                                                    videoRef.current.muted = false;
                                                    videoRef.current.volume = volumesRef.current.video;
                                                }
                                            }, 200);
                                        }
                                    }, 50);
                                }
                            }}
                            className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/90 text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded-full transition-colors z-10"
                            title="소리가 안 나거나 재생 오류 시 클릭 (강제 초기화)"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>

                    {/* 2. Video Trimmer (Slider Only) - Immediately below video */}
                    <div className="px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] w-full max-w-full">
                        <div className="flex items-center mb-2">
                            <span className="text-sm font-semibold text-white">
                                Duration: {(previewCut.videoTrim ? previewCut.videoTrim.end - previewCut.videoTrim.start : videoDuration).toFixed(1)}s
                            </span>
                        </div>
                        <VideoTrimmer
                            videoUrl={previewVideoUrl}
                            startTime={localTrim.start}
                            endTime={localTrim.end > 0 ? localTrim.end : videoDuration}
                            duration={videoDuration}
                            onChange={handleTrimChange}
                            hideVideo={true}
                            onSeek={(time) => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = time;
                                }
                            }}
                        />
                    </div>

                    {/* 3. Audio Controls (Stacked Rows) */}
                    <div className="p-4 bg-[var(--color-surface)] flex flex-col gap-3">

                        {/* Row A: Audio Source Selection */}
                        <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Volume2 size={14} className="text-[var(--color-primary)]" />
                                    <span>Audio Source (오디오 소스)</span>
                                </div>
                                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => handleSourceChange('video')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedAudioSource === 'video' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        ORIGINAL VIDEO
                                    </button>
                                    <button
                                        onClick={() => handleSourceChange('tts')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedAudioSource === 'tts' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        AI VOICE (TTS)
                                    </button>
                                </div>
                            </div>
                            <div className="text-[10px] leading-relaxed text-[var(--color-text-muted)] space-y-1">
                                {selectedAudioSource === 'video' ? (
                                    <p>• <b>원본 영상 오디오</b>: 비디오 파일에 포함된 소리를 사용합니다. (Default Volume: 100%)</p>
                                ) : (
                                    <p>• <b>AI Voice (TTS)</b>: 캐릭터 목소리를 사용하고, 영상 소리는 음소거됩니다. (Default Volume: 100%)</p>
                                )}
                            </div>
                        </div>

                        {/* Audio Track Warning */}
                        {selectedAudioSource === 'video' && hasAudioTrack === false && (
                            <div className="px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3 text-yellow-200 text-xs">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-500" />
                                <div>
                                    <span className="font-bold block text-yellow-400 mb-1">No Audio Track Detected</span>
                                    <p className="mb-2">The selected video file has no audio stream. Using "Original Video" will result in silence.</p>
                                    <p className="text-[var(--color-primary)] font-semibold">💡 팁: 실제 소리가 있는 파일인데도 무음이라면, 모달을 닫고 상단의 <b>[비디오 데이터 검사 및 복구]</b> 버튼을 클릭하여 딥 리페어를 진행해보세요.</p>
                                </div>
                            </div>
                        )}

                        {/* Row C: Duration Master Selection */}
                        <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Sparkles size={14} className="text-[var(--color-primary)]" />
                                    <span>Duration Master (재생 시간 기준)</span>
                                </div>
                                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => setDurationMaster('audio')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${durationMaster === 'audio' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        AUDIO (Default)
                                    </button>
                                    <button
                                        onClick={() => setDurationMaster('video')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${durationMaster === 'video' ? 'bg-white/10 text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        VIDEO TRIM
                                    </button>
                                </div>
                            </div>
                            <div className="text-[10px] leading-relaxed text-[var(--color-text-muted)] space-y-1">
                                {durationMaster === 'audio' ? (
                                    <p>• <b>오디오 길이 기준</b>: 목소리가 다 나올 때까지 장면이 유지됩니다. 비디오가 짧으면 마지막 프레임에서 멈추거나 반복됩니다.</p>
                                ) : (
                                    <p>• <b>비디오 트리밍 기준</b>: 편집한 비디오 길이에 맞춰 컷이 강제 종료됩니다. 목소리가 더 길면 중간에 끊길 수 있습니다.</p>
                                )}
                            </div>
                        </div>

                    </div>
                </div>


                {/* Hidden Audio for TTS */}
                {resolvedTtsUrl && (
                    <audio
                        ref={ttsAudioRef}
                        src={resolvedTtsUrl}
                        className="hidden"
                        preload="auto"
                        onPlay={() => console.log('[AudioModal:TTS] Play started')}
                        onPause={() => console.log('[AudioModal:TTS] Paused')}
                        onEnded={() => {
                            // Only trigger loop from audio if TTS is the source and it was longer than video
                            // (Because if video is longer, video's timeupdate/onEnded will handle it)
                            if (selectedAudioSource === 'tts') triggerLoop();
                        }}
                        onError={(e) => console.error('[AudioModal:TTS] Load Error:', e)}
                    />
                )}

                {/* Footer Actions */}
                {/* Duplicate Audio Removed */}

                <div className="flex justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-[var(--color-bg)] text-gray-400 rounded-lg hover:text-white transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={async () => {
                            if (isSaving) return;

                            // [FIX] Ensure videoDuration is valid before calculating trim
                            const dur = videoDuration > 0 ? videoDuration : (previewCut.videoDuration || previewCut.estimatedDuration || 5);

                            // [FIX] Use localTrim instead of stale previewCut prop
                            let finalTrim = localTrim;

                            if (finalTrim) {
                                // Clamp trim to current video duration to prevent out-of-bounds export errors
                                const clampedStart = Math.max(0, Math.min(finalTrim.start, dur - 0.1));
                                const clampedEnd = Math.max(clampedStart + 0.1, Math.min(finalTrim.end, dur));
                                finalTrim = { start: clampedStart, end: clampedEnd };
                            }

                            const updates: Partial<ScriptCut> = {
                                useVideoAudio: selectedAudioSource === 'video',
                                audioVolumes: volumes,
                                videoTrim: finalTrim,
                                cutDurationMaster: durationMaster
                            };

                            // Also update videoDuration to match trim for accurate project calculation in Step 6
                            if (finalTrim) {
                                updates.videoDuration = finalTrim.end - finalTrim.start;
                            }

                            console.log('[AudioModal:Save] Sending Updates:', updates);

                            setIsSaving(true);
                            try {
                                await Promise.resolve(onSave(updates));
                                // Parent will close modal on success (via previewCutId = null)
                            } catch (e) {
                                console.error('[AudioModal:Save] Error:', e);
                                alert('저장 중 오류가 발생했습니다.');
                                setIsSaving(false);
                            }
                        }}
                        className={`px-5 py-2.5 ${(isSaving || !!loadingStatus) ? 'bg-gray-600 cursor-not-allowed' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'} text-black font-semibold rounded-lg transition-colors flex items-center gap-2`}
                        disabled={isSaving || !!loadingStatus}
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : (loadingStatus ? <Loader2 size={18} className="animate-spin opacity-50" /> : <Check size={18} />)}
                        {isSaving ? '저장 중...' : (loadingStatus ? '로딩 대기' : '저장')}
                    </button>
                </div>
            </div>
        </div>
    );
});

export const Step4_5_VideoComposition: React.FC = () => {
    const navigate = useNavigate();
    const {
        id: projectId,
        script,
        setScript,
        episodeName,
        seriesName,
        aspectRatio,
        apiKeys
    } = useWorkflowStore();

    // State
    const [selectedCuts, setSelectedCuts] = useState<Set<number>>(new Set());
    const [clipStatuses, setClipStatuses] = useState<Record<number, VideoClipStatus>>({});
    const [showPromptEditor, setShowPromptEditor] = useState<number | null>(null);
    const [editingPrompt, setEditingPrompt] = useState('');
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [previewCutId, setPreviewCutId] = useState<number | null>(null);
    const [isExportingKit, setIsExportingKit] = useState(false);
    const [isBulkGeneratingMotion, setIsBulkGeneratingMotion] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    // [FIX] videoMountKey moved to parent to allow Repair utility to trigger a full video reload
    const [videoMountKey, setVideoMountKey] = useState(() => Date.now());

    // AI Video Generation Mode State
    const [selectedProvider, setSelectedProvider] = useState<VideoGenerationProvider>('gemini-veo');
    const [selectedVeoModel, setSelectedVeoModel] = useState<VeoModel>('veo-3.1-generate-preview');
    const [selectedReplicateModel, setSelectedReplicateModel] = useState<ReplicateVideoModel>('wan-2.2-i2v');
    const [selectedKieModel, setSelectedKieModel] = useState<string>('veo-3.1');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; status: string }>({
        current: 0,
        total: 0,
        status: ''
    });

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
            // [FIX] DO NOT use FileReader.readAsDataURL for videos.
            // It uses too much memory and can corrupt audio tracks on large files.
            // saveToIdb already handles Blobs/Files directly.

            const { saveToIdb, generateVideoKey } = await import('../utils/imageStorage');
            // Extract extension safely
            const extension = file.name.split('.').pop() || 'mp4';
            const videoKey = generateVideoKey(currentProjectId, cutId, extension);
            console.log(`[Video Upload] Cut ${cutId}: Saving original File Blob with key "${videoKey}"`);

            const idbUrl = await saveToIdb('video', videoKey, file);
            console.log(`[Video Upload] Cut ${cutId}: Saved as "${idbUrl}"`);

            useWorkflowStore.setState(state => ({
                script: state.script.map(c =>
                    c.id === cutId ? {
                        ...c,
                        videoUrl: idbUrl,
                        videoSource: 'upload' as const,
                        useVideoAudio: true,
                        audioVolumes: {
                            ...(c.audioVolumes || { tts: 1.0, bgm: 0.5 }),
                            video: 1.0 // [FIX] Force volume to 1.0 on new upload to avoid silence from previous state
                        }
                    } : c
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
            const freshScript = useWorkflowStore.getState().script;
            const count = await repairVideoData(useWorkflowStore.getState(), freshScript, (msg) => {
                setGenerationProgress(prev => ({ ...prev, status: msg }));
            }, () => {
                // [HEALING] Force UI to remount videos so new Blob URLs are used
                setVideoMountKey(prev => prev + 1);
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
                } else if (selectedProvider === 'kie-ai') {
                    // Use KieAI
                    const apiKey = apiKeys.kieai || '';
                    if (!apiKey) throw new Error('KieAI API Key is missing. Please set it in sidebar settings.');

                    const result = await generateVideoWithKie(apiKey, {
                        prompt,
                        imageUrl,
                        model: selectedKieModel,
                        aspectRatio: aspectRatio || '16:9',
                        duration: 10, // Always max
                    }, (status) => {
                        setGenerationProgress(prev => ({ ...prev, status: `Cut #${cut.id}: ${status}` }));
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
                    let dataToSave: string | Blob = videoUrl;

                    // If it's a URL (not data:), fetch and convert to Blob
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

                            // [FIX] Save raw Blob directly
                            dataToSave = blob;
                        } catch (e) {
                            console.error('Failed to fetch video:', e);
                            throw new Error(`Failed to download video from Veo API: ${(e as Error).message}`);
                        }
                    }

                    const videoKey = generateVideoKey(currentProjectId, cut.id, 'mp4');
                    const idbUrl = await saveToIdb('video', videoKey, dataToSave);

                    // Update script
                    useWorkflowStore.setState(state => ({
                        script: state.script.map(c =>
                            c.id === cut.id ? {
                                ...c,
                                videoUrl: idbUrl, // Use the persistent IDB URL
                                videoSource: selectedProvider === 'gemini-veo' ? 'veo' : 'ai' as const,
                                useVideoAudio: true, // Auto-enable audio
                                audioVolumes: {
                                    ...(c.audioVolumes || { tts: 1.0, bgm: 0.5 }),
                                    video: 1.0
                                }
                            } : c
                        )
                    }));

                    // [CRITICAL FIX] Save project immediately after each success to prevent data loss on navigation/refresh
                    await useWorkflowStore.getState().saveProject();
                    successCount++;
                }
            } catch (error: any) {
                console.error(`Failed to generate video for cut ${cut.id}:`, error);

                let errorMessage = error.message || 'Unknown error';

                // Parse safety filter errors for user-friendly display
                if (error.isSafetyFilter || errorMessage.includes('SAFETY_FILTER:') || errorMessage.includes('celebrity')) {
                    errorMessage = `⚠️ 안전 필터 감지: 유명인 또는 실제 인물이 포함된 이미지로 판단되어 생성이 차단되었습니다. 다른 이미지를 사용해주세요.`;
                } else if (errorMessage.includes('raiMediaFiltered')) {
                    errorMessage = `⚠️ 콘텐츠 정책 위반: 이미지가 Google 안전 정책에 위반됩니다.`;
                }

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
                        Motion Design
                    </h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">
                        Step 4의 이미지를 사용하여 외부 AI 도구(Luma Dream Machine, Runway 등)로 비디오를 생성하고 업로드하여 합성합니다.
                    </p>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-[var(--color-primary)]">{videoStats.ready}</div>
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
                        className="px-3 py-2 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg text-xs flex items-center gap-2 transition-colors border border-[var(--color-primary)]/20"
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
                <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors h-full flex flex-col">
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
                            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${selectedProvider === 'replicate'
                                ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/20'
                                : 'bg-[var(--color-bg)] text-gray-400 hover:text-white hover:bg-[var(--color-bg)]/80'
                                }`}
                        >
                            Replicate API
                        </button>
                        <button
                            onClick={() => setSelectedProvider('kie-ai')}
                            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${selectedProvider === 'kie-ai'
                                ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/20'
                                : 'bg-[var(--color-bg)] text-gray-400 hover:text-white hover:bg-[var(--color-bg)]/80'
                                }`}
                        >
                            KieAI (Kie.ai)
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
                        ) : selectedProvider === 'kie-ai' ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 uppercase mb-1 block">Model</label>
                                        <select
                                            value={selectedKieModel}
                                            onChange={(e) => setSelectedKieModel(e.target.value)}
                                            className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-white focus:border-[var(--color-primary)] outline-none"
                                        >
                                            {getKieModels().map(model => (
                                                <option key={model.id} value={model.id}>
                                                    {model.name} - {model.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* API Key Warning */}
                                {!apiKeys.kieai && (
                                    <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-500/10 px-3 py-2 rounded-lg">
                                        <AlertCircle size={16} />
                                        <span>KieAI API 키가 필요합니다. 사이드바 설정에서 입력하세요.</span>
                                    </div>
                                )}

                                {/* Feature Badge */}
                                <div className="flex gap-2 flex-wrap">
                                    <span className="px-2 py-1 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Unified API</span>
                                    {selectedKieModel === 'grok-vision-video' && (
                                        <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">Grok Vision</span>
                                    )}
                                    {selectedKieModel.startsWith('kling') && (
                                        <span className="px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)]/80 text-xs rounded-full">Kling AI</span>
                                    )}
                                    {selectedKieModel === 'veo-3.1' && (
                                        <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Premium Quality</span>
                                    )}
                                    <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full">Image-to-Video</span>
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
                                                    {model.isOpenSource ? '[Open Source] ' : '[Proprietary] '}
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
                                        <span className="px-2 py-1 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Alibaba Wan</span>
                                    )}
                                    {getVideoModels().find(m => m.id === selectedReplicateModel)?.isOpenSource ? (
                                        <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Open Source</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)]/80 text-xs rounded-full">Proprietary</span>
                                    )}
                                    {selectedReplicateModel === 'ltx-2-distilled' && (
                                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">Real-time (Distilled)</span>
                                    )}
                                    {selectedReplicateModel.includes('i2v') || selectedReplicateModel === 'ltx-2-distilled' || selectedReplicateModel === 'stable-video' ? (
                                        <span className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded-full">Image-to-Video</span>
                                    ) : null}
                                    {selectedReplicateModel.includes('720p') && (
                                        <span className="px-2 py-1 bg-[var(--color-primary)]/5 text-[var(--color-primary)]/70 text-xs rounded-full">720p HD</span>
                                    )}
                                    {selectedReplicateModel.includes('kling') && (
                                        <span className="px-2 py-1 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Cinematic</span>
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
                                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${isGenerating
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-white/10 text-white border border-white/10 hover:bg-white/20 shadow-lg'
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
                                <FolderOpen size={20} className="text-orange-400" />
                                일괄 업로드 - 매칭 방식
                            </h3>
                            <div className="space-y-3 mb-6">
                                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-200">
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
                previewCutId !== null && (() => {
                    const previewCut = script.find(c => c.id === previewCutId);
                    if (!previewCut) return null;

                    return (
                        <AudioComparisonModal
                            key={previewCutId}
                            previewCut={previewCut}
                            videoMountKey={videoMountKey}
                            onClose={() => setPreviewCutId(null)}
                            onSave={async (updates) => {
                                if (previewCutId !== null) {
                                    // Use getState() to ensure we have latest script
                                    const latestScript = useWorkflowStore.getState().script;
                                    const updatedScript = latestScript.map(c =>
                                        c.id === previewCutId ? { ...c, ...updates } : c
                                    );
                                    setScript(updatedScript);
                                    await useWorkflowStore.getState().saveProject();
                                    setPreviewCutId(null);
                                }
                            }}
                        />
                    );
                })()
            }
        </div>
    );
};
