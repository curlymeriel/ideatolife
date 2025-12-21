import React, { useEffect, useState } from 'react';
import { keys as idbKeys, get as idbGet, del as idbDel } from 'idb-keyval';
import { HardDrive, Image, Music, FileText, Trash2, RefreshCw, AlertTriangle, X, ShieldCheck, Film, Wand2 } from 'lucide-react';
import { useWorkflowStore } from '../store/workflowStore';
import { parseIdbUrl, optimizeAllStoredImages } from '../utils/imageStorage';

interface StorageStats {
    images: { count: number; size: number };
    audio: { count: number; size: number };
    projects: { count: number; size: number };
    backups: { count: number; size: number };
    total: { count: number; size: number };
}

interface StorageManagerProps {
    onClose: () => void;
}

export const StorageManager: React.FC<StorageManagerProps> = ({ onClose }) => {
    const [stats, setStats] = useState<StorageStats>({
        images: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        projects: { count: 0, size: 0 },
        backups: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        total: { count: 0, size: 0 }
    });
    const [loading, setLoading] = useState(false);
    const [orphanCount, setOrphanCount] = useState(0);
    const [orphanSize, setOrphanSize] = useState(0);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizeProgress, setOptimizeProgress] = useState({ current: 0, total: 0 });
    const { recoverOrphanedProjects, savedProjects } = useWorkflowStore();

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const scanOrphans = async (allKeys: IDBValidKey[]) => {
        // Collect ALL referenced keys from known projects
        const referencedKeys = new Set<string>();

        // 1. Get List of Project IDs
        const projectIds = Object.keys(savedProjects);

        for (const pid of projectIds) {
            // Load full project data to find references (idbGet returns Promise)
            const projectData = await idbGet(`project-${pid}`);
            if (!projectData) continue;

            // Helper to add ref
            const addRef = (url: string | undefined | null) => {
                const parsed = parseIdbUrl(url || '');
                if (parsed) {
                    // Reconstruct the actual IDB key: media-{type}-{key}
                    referencedKeys.add(`media-${parsed.type}-${parsed.key}`);
                }
            };

            // Scan Script
            if (Array.isArray(projectData.script)) {
                projectData.script.forEach((cut: any) => {
                    addRef(cut.finalImageUrl);
                    addRef(cut.audioUrl);
                    addRef(cut.videoUrl);
                });
            }

            // Scan Assets
            if (projectData.assetDefinitions) {
                Object.values(projectData.assetDefinitions).forEach((asset: any) => {
                    addRef(asset.referenceImage);
                    addRef(asset.masterImage);
                    addRef(asset.draftImage);
                });
            }

            addRef(projectData.thumbnailUrl);
            if (projectData.masterStyle) addRef(projectData.masterStyle.referenceImage);
        }

        // 2. Compare against all media keys
        let count = 0;
        let size = 0;

        for (const key of allKeys) {
            const keyStr = String(key);
            // Only consider media-* keys as potential orphans
            if (keyStr.startsWith('media-')) {
                if (!referencedKeys.has(keyStr)) {
                    count++;
                    const val = await idbGet(key);
                    size += val ? JSON.stringify(val).length : 0;
                }
            }
        }

        setOrphanCount(count);
        setOrphanSize(size);
    };

    const scanStorage = async () => {
        setLoading(true);
        try {
            const keys = await idbKeys();
            const newStats: StorageStats = {
                images: { count: 0, size: 0 },
                audio: { count: 0, size: 0 },
                projects: { count: 0, size: 0 },
                backups: { count: 0, size: 0 },
                video: { count: 0, size: 0 },
                total: { count: 0, size: 0 }
            };

            for (const key of keys) {
                const keyStr = String(key);
                const value = await idbGet(key);

                let size = 0;
                if (typeof value === 'string') {
                    size = value.length;
                } else if (value) {
                    size = JSON.stringify(value).length;
                }

                newStats.total.count++;
                newStats.total.size += size;

                const isImageKey = keyStr.startsWith('media-images') ||
                    keyStr.startsWith('media-assets') ||
                    keyStr.startsWith('image_') ||
                    keyStr.includes('thumbnail') ||
                    keyStr.includes('asset');

                if (isImageKey) {
                    newStats.images.count++;
                    newStats.images.size += size;
                } else if (keyStr.startsWith('media-audio') || keyStr.startsWith('audio_')) {
                    newStats.audio.count++;
                    newStats.audio.size += size;
                } else if (keyStr === 'workflow-storage' || keyStr.startsWith('project-')) {
                    newStats.projects.count++;
                    newStats.projects.size += size;
                } else if (keyStr.startsWith('backup_') || keyStr.includes('backup')) {
                    newStats.backups.count++;
                    newStats.backups.size += size;
                } else if (keyStr.startsWith('media-video') || keyStr.startsWith('video_')) {
                    newStats.video.count++;
                    newStats.video.size += size;
                }
            }
            setStats(newStats);

            // Auto-scan orphans
            await scanOrphans(keys);

        } catch (error) {
            console.error("Failed to scan storage:", error);
        } finally {
            setLoading(false);
        }
    };

    const cleanOrphans = async () => {
        if (!confirm(`Delete ${orphanCount} unused files (${formatSize(orphanSize)})? This is safe.`)) return;
        setLoading(true);
        try {
            const keys = await idbKeys();
            // Re-run scan logic to be safe (ensure up-to-date)
            const referencedKeys = new Set<string>();
            const projectIds = Object.keys(savedProjects);

            for (const pid of projectIds) {
                const projectData = await idbGet(`project-${pid}`);
                if (!projectData) continue;
                const addRef = (url: string | undefined | null) => {
                    const parsed = parseIdbUrl(url || '');
                    if (parsed) referencedKeys.add(`media-${parsed.type}-${parsed.key}`);
                };
                if (Array.isArray(projectData.script)) {
                    projectData.script.forEach((cut: any) => {
                        addRef(cut.finalImageUrl);
                        addRef(cut.audioUrl);
                        addRef(cut.videoUrl);
                    });
                }
                if (projectData.assetDefinitions) {
                    Object.values(projectData.assetDefinitions).forEach((asset: any) => {
                        addRef(asset.referenceImage);
                        addRef(asset.masterImage);
                        addRef(asset.draftImage);
                    });
                }
                addRef(projectData.thumbnailUrl);
                if (projectData.masterStyle) addRef(projectData.masterStyle.referenceImage);
            }

            for (const key of keys) {
                const keyStr = String(key);
                if (keyStr.startsWith('media-') && !referencedKeys.has(keyStr)) {
                    await idbDel(key);
                }
            }
            await scanStorage();
            alert("Orphans Cleaned Successfully.");
        } catch (e) {
            console.error("Clean failed", e);
        } finally {
            setLoading(false);
        }
    };

    const cleanCategory = async (category: 'images' | 'audio' | 'video' | 'backups') => {
        if (!confirm(`Are you sure you want to delete ALL ${category}? This cannot be undone and may break projects.`)) return;

        setLoading(true);
        try {
            const keys = await idbKeys();
            for (const key of keys) {
                const keyStr = String(key);
                if (
                    (category === 'images' && (keyStr.startsWith('media-images') || keyStr.startsWith('image_'))) ||
                    (category === 'audio' && (keyStr.startsWith('media-audio') || keyStr.startsWith('audio_'))) ||
                    (category === 'video' && (keyStr.startsWith('media-video') || keyStr.startsWith('video_'))) ||
                    (category === 'backups' && keyStr.startsWith('backup_'))
                ) {
                    await idbDel(key);
                }
            }
            await scanStorage();
            alert(`${category} cleared successfully.`);
        } catch (error) {
            console.error(`Failed to clean ${category}:`, error);
            alert(`Failed to clean ${category}.`);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkOptimize = async () => {
        if (!confirm("This will compress ALL existing large PNG images to optimized JPG inside your storage. This is safe and will save significant space. Proceed?")) return;

        setOptimizing(true);
        try {
            const result = await optimizeAllStoredImages((current, total) => {
                setOptimizeProgress({ current, total });
            });

            await scanStorage();
            alert(`Optimization Complete!\n\n- Files Optimized: ${result.optimized}\n- Space Saved: ${formatSize(result.savedBytes)}`);
        } catch (e) {
            console.error("Optimization failed", e);
            alert("Optimization failed. See console for details.");
        } finally {
            setOptimizing(false);
        }
    };

    useEffect(() => {
        scanStorage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg">
                            <HardDrive size={24} className="text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">Storage Manager</h1>
                            <p className="text-[var(--color-text-muted)] text-xs">
                                Manage local storage.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleBulkOptimize}
                            disabled={optimizing || stats.images.count === 0}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${optimizing
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-purple-500 hover:bg-purple-400 text-black shadow-lg shadow-purple-500/20'
                                }`}
                        >
                            <Wand2 size={14} className={optimizing ? 'animate-spin' : ''} />
                            {optimizing ? `Optimizing (${optimizeProgress.current}/${optimizeProgress.total})` : 'Optimize Images'}
                        </button>
                        <button
                            onClick={scanStorage}
                            className="p-2 hover:bg-[var(--color-surface-highlight)] rounded-full transition-colors text-[var(--color-text-muted)] hover:text-white"
                            title="Refresh"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto space-y-4 flex-1">

                    {/* Total Usage Bar (Compact) */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-white">Total Used</h2>
                                <span className="text-sm text-[var(--color-text-muted)]">({formatSize(stats.total.size)})</span>
                            </div>

                            {/* Simple Legend */}
                            <div className="flex gap-3 text-xs font-medium">
                                <span className="flex items-center gap-1.5 text-blue-400"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Images</span>
                                <span className="flex items-center gap-1.5 text-purple-400"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Audio</span>
                                <span className="flex items-center gap-1.5 text-pink-400"><div className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Video</span>
                                <span className="flex items-center gap-1.5 text-green-400"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Backup</span>
                            </div>
                        </div>

                        <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden flex">
                            <div className="h-full bg-blue-500" style={{ width: stats.total.size > 0 ? `${(stats.images.size / stats.total.size) * 100}%` : '0%' }} />
                            <div className="h-full bg-purple-500" style={{ width: stats.total.size > 0 ? `${(stats.audio.size / stats.total.size) * 100}%` : '0%' }} />
                            <div className="h-full bg-pink-500" style={{ width: stats.total.size > 0 ? `${(stats.video.size / stats.total.size) * 100}%` : '0%' }} />
                            <div className="h-full bg-green-500" style={{ width: stats.total.size > 0 ? `${(stats.backups.size / stats.total.size) * 100}%` : '0%' }} />
                        </div>
                    </div>

                    {/* Orphan Management (Always Visible) */}
                    <div className={`border rounded-xl p-3 flex items-center justify-between gap-4 transition-colors ${orphanCount > 0
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-green-500/5 border-green-500/20'
                        }`}>
                        <div className="flex items-center gap-3">
                            {orphanCount > 0 ? (
                                <AlertTriangle size={20} className="text-yellow-500 shrink-0" />
                            ) : (
                                <ShieldCheck size={20} className="text-green-500 shrink-0" />
                            )}
                            <div>
                                <h3 className="text-sm font-bold text-white">
                                    {orphanCount > 0
                                        ? `Found ${orphanCount} Unused Files (${formatSize(orphanSize)})`
                                        : 'Storage Healthy: No unused files found'}
                                </h3>
                                <p className={`${orphanCount > 0 ? 'text-yellow-200/70' : 'text-green-200/50'} text-xs`}>
                                    {orphanCount > 0 ? 'Safe to remove these temporary files.' : 'All media files are correctly linked to your projects.'}
                                </p>
                            </div>
                        </div>
                        {orphanCount > 0 && (
                            <button
                                onClick={cleanOrphans}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-lg shadow-yellow-500/20 whitespace-nowrap"
                            >
                                <Trash2 size={14} />
                                Clean Orphans
                            </button>
                        )}
                    </div>


                    {/* Categories Grid (Compact 3-cols) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Images */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-500/10 rounded-md">
                                        <Image className="text-blue-500" size={16} />
                                    </div>
                                    <span className="font-bold text-white text-sm">Images</span>
                                </div>
                                <span className="font-mono text-sm text-[var(--color-primary)]">{formatSize(stats.images.size)}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] flex-1">{stats.images.count} files</p>
                            <button
                                onClick={() => cleanCategory('images')}
                                disabled={stats.images.count === 0}
                                className="w-full py-1.5 flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        </div>

                        {/* Audio */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-purple-500/10 rounded-md">
                                        <Music className="text-purple-500" size={16} />
                                    </div>
                                    <span className="font-bold text-white text-sm">Audio</span>
                                </div>
                                <span className="font-mono text-sm text-[var(--color-primary)]">{formatSize(stats.audio.size)}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] flex-1">{stats.audio.count} files</p>
                            <button
                                onClick={() => cleanCategory('audio')}
                                disabled={stats.audio.count === 0}
                                className="w-full py-1.5 flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        </div>

                        {/* Video */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-pink-500/10 rounded-md">
                                        <Film className="text-pink-500" size={16} />
                                    </div>
                                    <span className="font-bold text-white text-sm">Video</span>
                                </div>
                                <span className="font-mono text-sm text-[var(--color-primary)]">{formatSize(stats.video.size)}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] flex-1">{stats.video.count} files</p>
                            <button
                                onClick={() => cleanCategory('video')}
                                disabled={stats.video.count === 0}
                                className="w-full py-1.5 flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        </div>

                        {/* Backups */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-green-500/10 rounded-md">
                                        <RefreshCw className="text-green-500" size={16} />
                                    </div>
                                    <span className="font-bold text-white text-sm">Backups</span>
                                </div>
                                <span className="font-mono text-sm text-[var(--color-primary)]">{formatSize(stats.backups.size)}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] flex-1">{stats.backups.count} backups</p>
                            <button
                                onClick={() => cleanCategory('backups')}
                                disabled={stats.backups.count === 0}
                                className="w-full py-1.5 flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        </div>

                        {/* Projects (Protected) */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden opacity-80">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-[var(--color-surface-highlight)] rounded-md">
                                        <FileText className="text-white" size={16} />
                                    </div>
                                    <span className="font-bold text-white text-sm">Projects</span>
                                </div>
                                <span className="font-mono text-sm text-[var(--color-primary)]">{formatSize(stats.projects.size)}</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] flex-1">Active data</p>
                            <div className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-[var(--color-surface-highlight)]/50 rounded-lg cursor-not-allowed text-xs font-medium text-[var(--color-text-muted)]">
                                <ShieldCheck size={12} /> Protected
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

    );
};
