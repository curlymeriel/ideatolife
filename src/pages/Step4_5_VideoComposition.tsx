import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import {
    Video, Upload, Play, Edit3, Check, X, Loader2,
    ChevronLeft, ChevronRight, FileVideo, Image as ImageIcon,
    FolderOpen, CheckCircle2, Lock, Download, Package, Zap
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
const repairVideoData = async (project: any, script: ScriptCut[], onProgress: (msg: string) => void) => {
    const { loadFromIdb, saveToIdb, parseIdbUrl, generateVideoKey } = await import('../utils/imageStorage');
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
        const updatedScript = script.map(c =>
            c.id === cutId ? { ...c, videoUrl: undefined, videoSource: undefined, isVideoConfirmed: false } : c
        );
        setScript(updatedScript);
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
            const idbUrl = await saveToIdb('video', videoKey, dataUrl);

            useWorkflowStore.setState(state => ({
                script: state.script.map(c =>
                    c.id === cutId ? { ...c, videoUrl: idbUrl, videoSource: 'upload' as const } : c
                )
            }));
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

        // Target cuts: if overwrite is true, target ALL cuts with images. If false, only unconfirmed.
        const targetCuts = script.filter(cut => cut.finalImageUrl && (overwrite || !cut.isVideoConfirmed));

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
                                    <div className="text-xs text-[var(--color-text-muted)]">이미 확정(Confirmed)된 컷의 비디오도 교체합니다.</div>
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

            {/* Video Preview Modal */}
            {previewVideoUrl && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setPreviewCutId(null)}>
                    <div className="max-w-4xl w-full relative" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setPreviewCutId(null)}
                            className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                        <video
                            src={previewVideoUrl}
                            controls
                            autoPlay
                            playsInline
                            className="w-full rounded-xl"
                            onError={(e) => {
                                console.error("Preview playback failed:", e);
                                alert("비디오 재생에 실패했습니다. 파일 형식이 브라우저에서 지원되지 않거나, 파일이 손상되었을 수 있습니다.");
                            }}
                        />
                        <div className="text-center mt-4 text-white">Cut #{previewCutId}</div>
                    </div>
                </div>
            )}
        </div>
    );
};
