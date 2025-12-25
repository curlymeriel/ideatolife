import React from 'react';
import { useWorkflowStore, type ProjectData, type ProjectMetadata } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { Image, FileText, Music, ArrowRight, BarChart3, Plus, Download, Trash2, Database, Loader2, Copy, Check } from 'lucide-react';

import { StorageInspector } from '../components/StorageInspector';
import { migrateAllProjects } from '../utils/migration';

import { debugListKeys, loadFromIdb, resolveUrl } from '../utils/imageStorage';

export const Dashboard: React.FC = () => {
    // Expose for debugging
    React.useEffect(() => {
        (window as any).debugListKeys = debugListKeys;
    }, []);

    const store = useWorkflowStore();
    const { savedProjects, loadProject, createProject, deleteProject, duplicateProject, deleteSeries, isHydrated } = store;
    const isLoadingProjects = !isHydrated;
    const navigate = useNavigate();
    const [showInspector, setShowInspector] = React.useState(false);
    // Removed projectsData state - we now use savedProjects metadata exclusively

    // Local state for resolved IDB thumbnails and first cut images (lazy loaded)
    const [resolvedThumbnails, setResolvedThumbnails] = React.useState<Record<string, string>>({});

    const [isMigrating, setIsMigrating] = React.useState(false);
    const [migrationResult, setMigrationResult] = React.useState<{ images: number; audios: number; assets: number; freed: string } | null>(null);
    const [selectedProjects, setSelectedProjects] = React.useState<Set<string>>(new Set());
    const [isBulkExporting, setIsBulkExporting] = React.useState(false);

    // UI Loading State (Generic fallback)
    const [isOpeningProject, setIsOpeningProject] = React.useState(false);

    // Pagination
    const INITIAL_LOAD_COUNT = 12;
    const [visibleCount, setVisibleCount] = React.useState(INITIAL_LOAD_COUNT);

    // Safety: Reset loading state on mount/unmount and after timeout
    React.useEffect(() => {
        return () => setIsOpeningProject(false);
    }, []);

    const handleCreateProject = async () => {
        if (isOpeningProject) return;
        setIsOpeningProject(true);
        try {
            await createProject();
            navigate('/step/1');
        } catch (e) {
            console.error("Create project failed:", e);
            setIsOpeningProject(false);
        }
    };

    const handleLoadProject = async (projectId: string) => {
        console.log(`[Dashboard] Attempting to load project ${projectId}`);

        if (isOpeningProject) return;
        setIsOpeningProject(true);

        // Safety timeout to prevent UI lockup
        const safetyTimer = setTimeout(() => {
            if (isOpeningProject) {
                console.warn("[Dashboard] Load taking too long, offering recovery...");
                // We don't force false here yet, let the user decide or the actual load finish
            }
        }, 10000);

        try {
            const loadPromise = loadProject(projectId);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 45000)
            );

            await Promise.race([loadPromise, timeoutPromise]);
            clearTimeout(safetyTimer);
            navigate(`/step/1`);
        } catch (e) {
            clearTimeout(safetyTimer);
            console.error("Failed to load project:", e);
            alert(`Failed to load: ${(e as Error).message}`);
            setIsOpeningProject(false);
        }
    };

    const handleNewEpisode = async (seriesName: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click
        await createProject(seriesName);
        navigate('/step/1');
    };

    const handleDeleteProject = async (projectId: string, episodeName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${episodeName}"? This cannot be undone.`)) {
            await deleteProject(projectId);
        }
    };

    const handleDuplicateProject = async (projectId: string, episodeName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Duplicate "${episodeName}"?`)) {
            await duplicateProject(projectId);
        }
    };

    const handleDeleteSeries = async (seriesName: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent accordion toggle if implemented
        if (confirm(`WARNING: Are you sure you want to delete the entire series "${seriesName}"? \n\nThis will delete ALL episodes in this series. This cannot be undone.`)) {
            await deleteSeries(seriesName);
        }
    };

    // Migration handler - converts Base64 images to IndexedDB storage
    const handleMigrateProjects = async () => {
        console.log('[Migration] Button clicked. savedProjects:', Object.keys(savedProjects));
        const projectIds = Object.keys(savedProjects);
        if (projectIds.length === 0) {
            alert('No projects to migrate.');
            return;
        }

        if (!confirm(`Migrate ${projectIds.length} project(s) to optimize storage?\n\nThis will convert Base64 images/audio to IndexedDB, reducing memory usage significantly.\n\nThis may take a few moments.`)) {
            return;
        }

        setIsMigrating(true);
        setMigrationResult(null);

        try {
            const result = await migrateAllProjects(projectIds);
            setMigrationResult({
                images: result.totalImages,
                audios: result.totalAudios,
                assets: result.totalAssets,
                freed: (result.totalBytesFreed / 1024 / 1024).toFixed(2)
            });
            alert(`Migration complete!\n\n📷 Images: ${result.totalImages}\n🔊 Audio: ${result.totalAudios}\n🎨 Assets: ${result.totalAssets}\n💾 Freed: ${(result.totalBytesFreed / 1024 / 1024).toFixed(2)}MB\n\nRefresh the page to see the changes.`);
            window.location.reload();
        } catch (error) {
            console.error('Migration failed:', error);
            alert('Migration failed. Check console for details.');
        } finally {
            setIsMigrating(false);
        }
    };

    const toggleProjectSelection = (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelection = new Set(selectedProjects);
        if (newSelection.has(projectId)) {
            newSelection.delete(projectId);
        } else {
            newSelection.add(projectId);
        }
        setSelectedProjects(newSelection);
    };

    const handleSelectAll = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click
        if (selectedProjects.size === Object.keys(savedProjects).length) {
            setSelectedProjects(new Set());
        } else {
            setSelectedProjects(new Set(Object.keys(savedProjects)));
        }
    };

    const handleBulkDuplicate = async () => {
        if (selectedProjects.size === 0) return;
        if (!confirm(`Duplicate ${selectedProjects.size} projects?`)) return;

        for (const pid of selectedProjects) {
            await duplicateProject(pid);
        }
        setSelectedProjects(new Set());
    };

    const handleBulkDelete = async () => {
        if (selectedProjects.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedProjects.size} projects? This cannot be undone.`)) return;

        for (const pid of selectedProjects) {
            await deleteProject(pid);
        }
        setSelectedProjects(new Set());
    };

    const handleBulkExport = async () => {
        const projectIds = Array.from(selectedProjects);
        if (projectIds.length === 0) {
            alert("No projects selected.");
            return;
        }

        setIsBulkExporting(true);
        try {
            const JSZip = (await import('jszip')).default;
            const { exportProjectToZip } = await import('../utils/zipExporter');
            const idbKeyval = await import('idb-keyval');

            const masterZip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // Helper to extract clean project data from state
            const getProjectDataFromStore = (state: any): ProjectData => ({
                id: state.id,
                lastModified: state.lastModified || Date.now(),
                seriesName: state.seriesName,
                episodeName: state.episodeName,
                episodeNumber: state.episodeNumber,
                seriesStory: state.seriesStory,
                mainCharacters: state.mainCharacters,
                characters: state.characters,
                seriesLocations: state.seriesLocations,
                seriesProps: state.seriesProps || [],
                episodePlot: state.episodePlot,
                episodeCharacters: state.episodeCharacters,
                episodeLocations: state.episodeLocations,
                episodeProps: state.episodeProps || [],
                storylineTable: state.storylineTable || [],
                targetDuration: state.targetDuration,
                aspectRatio: state.aspectRatio,
                apiKeys: state.apiKeys,
                chatHistory: state.chatHistory,
                masterStyle: state.masterStyle,
                styleAnchor: state.styleAnchor,
                assetDefinitions: state.assetDefinitions,
                thumbnailUrl: state.thumbnailUrl,
                thumbnailSettings: state.thumbnailSettings,
                script: state.script,
                ttsModel: state.ttsModel,
                imageModel: state.imageModel,
                assets: state.assets,
                currentStep: state.currentStep
            });

            // Single project optimization
            if (projectIds.length === 1) {
                const pid = projectIds[0];
                let projectData: ProjectData | undefined;

                const activeProject = useWorkflowStore.getState();
                if (activeProject.id === pid) {
                    console.log(`[Dashboard] Exporting ACTIVE project from Memory: ${pid}`);
                    projectData = getProjectDataFromStore(activeProject);
                }

                if (!projectData) {
                    const loaded = await idbKeyval.get(`project-${pid}`);
                    if (loaded) projectData = loaded as ProjectData;
                }

                if (projectData) {
                    const blob = await exportProjectToZip(projectData);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${projectData.seriesName} - ${projectData.episodeName} (Backup).zip`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            } else {
                // Bulk export
                for (const pid of projectIds) {
                    let projectData: ProjectData | undefined;

                    const activeProject = useWorkflowStore.getState();
                    if (activeProject.id === pid) {
                        projectData = getProjectDataFromStore(activeProject);
                    }

                    if (!projectData) {
                        const loaded = await idbKeyval.get(`project-${pid}`);
                        if (loaded) projectData = loaded as ProjectData;
                    }

                    if (projectData) {
                        const zipBlob = await exportProjectToZip(projectData);
                        const safeName = `${projectData.seriesName}_Ep${projectData.episodeNumber}_${projectData.episodeName}`.replace(/[^a-zA-Z0-9가-힣]/g, '_');
                        masterZip.file(`${safeName}.zip`, zipBlob);
                    }
                }

                const content = await masterZip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement("a");
                a.href = url;
                a.download = `Bulk_Export_${timestamp}.zip`;
                a.click();
                URL.revokeObjectURL(url);
            }
            setSelectedProjects(new Set());
        } catch (e) {
            console.error("Bulk export failed:", e);
            alert("Failed to export projects.");
        } finally {
            setIsBulkExporting(false);
        }
    };

    // Group projects by series based on Metadata
    const seriesMap = new Map<string, ProjectMetadata[]>();

    // Ensure we have at least the current project if savedProjects is empty (edge case)
    const allProjects = React.useMemo(() => {
        const projects = Object.values(savedProjects);
        // Sort all projects by lastModified once for the entire list
        return projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    }, [savedProjects]);

    // PAGINATION: Only render visible Series (previously it was episodes, which hid older series)
    // We group ALL projects first, then decide how many series to show.
    allProjects.forEach(p => {
        const series = p.seriesName || 'Untitled Series';
        if (!seriesMap.has(series)) seriesMap.set(series, []);
        seriesMap.get(series)!.push(p);
    });

    const allSeriesData = Array.from(seriesMap.entries()).map(([seriesName, projects], index) => {
        return {
            id: index,
            name: seriesName,
            // Get most recent lastModified from all episodes in this series
            latestModified: Math.max(...projects.map(p => p.lastModified || 0)),
            projects: projects
        };
    }).sort((a, b) => b.latestModified - a.latestModified);

    const visibleSeries = allSeriesData.slice(0, visibleCount);
    const hasMoreSeries = allSeriesData.length > visibleCount;

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 12);
    };

    /* 
       PERFORMANCE OPTIMIZATION:
       Lazy load thumbnails for projects belonging to visible series.
    */
    React.useEffect(() => {
        if (!isHydrated || visibleSeries.length === 0) return;

        const loadThumbnails = async () => {
            const updates: Record<string, string> = {};
            let hasNewData = false;

            const visibleProjectList = visibleSeries.flatMap(s => s.projects);

            for (const p of visibleProjectList) {
                // If we already have it, skip
                if (resolvedThumbnails[p.id]) continue;

                // Case 1: IDB URL (Fastest, direct lookup)
                if (p.thumbnailUrl?.startsWith('idb://')) {
                    try {
                        const resolved = await resolveUrl(p.thumbnailUrl);
                        if (resolved) {
                            updates[p.id] = resolved;
                            hasNewData = true;
                        }
                    } catch (e) { console.warn('Thumbnail load failed', e); }
                }
            }

            if (hasNewData) {
                setResolvedThumbnails(prev => ({ ...prev, ...updates }));
            }
        };

        const timer = setTimeout(loadThumbnails, 100);
        return () => clearTimeout(timer);
    }, [visibleSeries, isHydrated]);

    const allSeries = visibleSeries.map(seriesData => ({
        id: seriesData.id,
        name: seriesData.name,
        latestModified: seriesData.latestModified,
        episodes: seriesData.projects.map(p => {
            const cached = p.cachedProgress;

            // Prefer cached progress, fallback gracefully
            const progressPercent = cached?.workflowPercent || 0;
            const scriptProgress = cached?.scriptLength && cached.scriptLength > 0
                ? Math.round((cached.scriptConfirmed / cached.scriptLength) * 100)
                : 0;
            const assetsProgress = cached?.assetsTotal && cached.assetsTotal > 0
                ? Math.round((cached.assetsDefined / cached.assetsTotal) * 100)
                : 0;

            // Resolve thumbnail source
            // 1. Resolved IDB image (loaded via effect)
            // 2. Metadata URL (if http/data)
            let displayThumbnail = resolvedThumbnails[p.id];

            if (!displayThumbnail && p.thumbnailUrl && !p.thumbnailUrl.startsWith('idb://')) {
                displayThumbnail = p.thumbnailUrl;
            }

            return {
                id: p.id,
                name: p.episodeName || '(T.B.D)',
                number: p.episodeNumber || 1,
                progress: progressPercent,
                scriptProgress: scriptProgress,
                assetsProgress: assetsProgress,
                thumbnailUrl: displayThumbnail,
                scriptLength: cached?.scriptLength || 0,
                assetsCount: cached?.assetsTotal || 0,
                lastModified: p.lastModified || 0,
                currentStep: cached?.completedStepsCount !== undefined ? cached.completedStepsCount : (p.currentStep || 1)
            };
        })
            // Sort episodes by lastModified (most recent first)
            .sort((a, b) => b.lastModified - a.lastModified)
    }));

    const handleSelectSeries = (seriesName: string) => {
        const series = seriesMap.get(seriesName);
        if (!series) return;

        const episodeIds = series.map(ep => ep.id);
        const allSelected = episodeIds.every(id => selectedProjects.has(id));
        const newSelection = new Set(selectedProjects);

        if (allSelected) {
            episodeIds.forEach(id => newSelection.delete(id));
        } else {
            episodeIds.forEach(id => newSelection.add(id));
        }
        setSelectedProjects(newSelection);
    };

    return (
        <>
            <div className="grid grid-cols-12 gap-8 relative">
                {showInspector && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInspector(false)} />
                        <div className="relative z-10 w-full max-w-4xl">
                            <StorageInspector />
                            <button
                                onClick={() => setShowInspector(false)}
                                className="absolute top-4 right-4 text-white hover:text-red-400"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* Left Sidebar */}
                <div className="col-span-12 lg:col-span-3 space-y-8">
                    <div className="py-6">
                        <h1 className="text-5xl font-bold text-white tracking-tight mb-2">Idea to Life</h1>
                        <p className="text-2xl text-[var(--color-primary)] font-medium">Meriel's Idea Lab</p>
                    </div>

                    {/* New Series Section */}
                    <div className="space-y-3 max-w-[220px]">
                        <div className="space-y-1">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Start Fresh</h3>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Create a completely new series with its own characters, locations, and style
                            </p>
                        </div>
                        <button
                            onClick={handleCreateProject}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gradient-to-r from-[var(--color-primary)] to-orange-500 hover:from-[var(--color-primary)]/90 hover:to-orange-500/90 border-2 border-[var(--color-primary)] transition-all text-sm text-black font-bold group shadow-lg shadow-[var(--color-primary)]/20"
                        >
                            <span className="flex items-center gap-2">
                                <Plus size={16} />
                                New Series
                            </span>
                            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>

                    {/* Data Management */}
                    <div className="space-y-2 max-w-[200px]">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 bg-gray-500 flex-shrink-0" />
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Data Management</h3>
                        </div>
                        <div className="space-y-1.5">
                            <button
                                onClick={() => setShowInspector(true)}
                                className="w-full flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-orange-500/20 hover:border-orange-500 border border-[var(--color-border)] transition-all text-xs text-white"
                            >
                                <span>🧹 Storage Cleanup</span>
                                <Trash2 size={10} />
                            </button>

                            {/* Migration Button */}
                            <button
                                onClick={handleMigrateProjects}
                                disabled={isMigrating}
                                className="w-full flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-blue-500/20 hover:border-blue-500 border border-[var(--color-border)] transition-all text-xs text-white disabled:opacity-50"
                            >
                                <span>{isMigrating ? '⏳ Migrating...' : '💾 Optimize Storage'}</span>
                                {isMigrating ? <Loader2 size={10} className="animate-spin" /> : <Database size={10} />}
                            </button>
                            {migrationResult && (
                                <p className="text-[10px] text-green-500 text-center">
                                    ✅ Freed {migrationResult.freed}MB
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Content - Series Cards */}
                <div className="col-span-12 lg:col-span-9 space-y-6">
                    {/* Top-Level Header Panel */}
                    <div className="glass-panel p-4 sticky top-20 z-20 flex items-center justify-between mb-8 shadow-xl bg-[#1e1e1e]/80 backdrop-blur-md border-[var(--color-border)]">
                        <div className="flex items-center gap-6">
                            {/* Select All & Stats */}
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleSelectAll}
                                    className="text-sm font-medium text-white flex items-center gap-2 hover:text-[var(--color-primary)] transition-colors"
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedProjects.size === Object.keys(savedProjects).length && Object.keys(savedProjects).length > 0
                                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                                        : 'border-white/30 hover:border-[var(--color-primary)]'
                                        }`}>
                                        {selectedProjects.size === Object.keys(savedProjects).length && Object.keys(savedProjects).length > 0 && (
                                            <Check size={14} className="text-black stroke-[3]" />
                                        )}
                                    </div>
                                    <span>
                                        {selectedProjects.size > 0 ? `${selectedProjects.size} Selected` : 'Total'}
                                    </span>
                                </button>
                                <div className="h-4 w-px bg-white/10" />
                                <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] font-mono">
                                    <span className="flex items-center gap-1.5">
                                        <b className="text-white">{allSeries.length}</b> Series
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <b className="text-white">{Object.values(allSeries).reduce((acc, s) => acc + s.episodes.length, 0)}</b> Episodes
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Context Actions (Show only when selected) */}
                            {selectedProjects.size > 0 && (
                                <>
                                    <button
                                        onClick={handleBulkDuplicate}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors text-xs"
                                    >
                                        <Copy size={14} />
                                        <span>Duplicate</span>
                                    </button>
                                    <button
                                        onClick={handleBulkDelete}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors text-xs"
                                    >
                                        <Trash2 size={14} />
                                        <span>Delete</span>
                                    </button>
                                    <div className="w-px h-4 bg-white/20 mx-1" />
                                </>
                            )}

                            {/* Always Visible Actions */}
                            <button
                                onClick={handleBulkExport}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-xs ${selectedProjects.size > 0
                                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary)]/20'
                                    : 'bg-white/5 text-gray-400 border-white/10 cursor-not-allowed opacity-50'
                                    }`}
                                disabled={selectedProjects.size === 0}
                            >
                                {isBulkExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                <span>Export ({selectedProjects.size})</span>
                            </button>

                            {/* Import Button with File Input */}
                            <div className="relative">
                                <input
                                    type="file"
                                    accept=".json,.zip"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        if (file.name.endsWith('.zip')) {
                                            if (confirm("Import projects from ZIP? This will restore projects and their assets.")) {
                                                useWorkflowStore.getState().importZip(file).then(() => {
                                                    // If direct import happened, we are active project. Navigate.
                                                    // Need check if store has ID?
                                                    const currentId = useWorkflowStore.getState().id;
                                                    if (currentId && currentId !== 'default-project') {
                                                        navigate('/step/1');
                                                    }
                                                });
                                            }
                                        } else {
                                            const reader = new FileReader();
                                            reader.onload = (e) => {
                                                const content = e.target?.result as string;
                                                if (content) {
                                                    useWorkflowStore.getState().importData(content);
                                                }
                                            };
                                            reader.readAsText(file);
                                        }
                                        e.target.value = '';
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors text-xs">
                                    <Download size={14} className="rotate-180" />
                                    <span>Import</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Loading State */}
                    {isLoadingProjects && Object.keys(savedProjects).length > 0 && (
                        <div className="glass-panel p-8 text-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                                <p className="text-[var(--color-text-muted)]">Loading {Object.keys(savedProjects).length} projects...</p>
                            </div>
                        </div>
                    )}

                    {/* Global Opening Loader Overlay */}
                    {isOpeningProject && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                            <div className="glass-panel p-8 text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
                                <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
                                <h3 className="text-xl font-bold text-white">Opening Project...</h3>
                                <p className="text-[var(--color-text-muted)]">Loading your masterpiece</p>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsOpeningProject(false);
                                    }}
                                    className="mt-4 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] text-xs transition-colors"
                                >
                                    Cancel & Return
                                </button>
                            </div>
                        </div>
                    )}

                    {!isLoadingProjects && allSeries.length === 0 && (
                        <div className="glass-panel p-8 text-center text-[var(--color-text-muted)]">
                            No projects found. Start a new one!
                        </div>
                    )}

                    {allSeries.map((series) => (
                        <div key={series.name} className="glass-panel p-8 space-y-6 hover:border-[var(--color-primary)] transition-all">
                            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                                <div className="flex items-center gap-4">
                                    {/* Series Checkbox */}
                                    <div
                                        onClick={() => handleSelectSeries(series.name)}
                                        className="cursor-pointer p-1 -ml-1 hover:bg-white/10 rounded transition-colors"
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${series.episodes.every(ep => selectedProjects.has(ep.id))
                                            ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                                            : 'border-gray-500'
                                            }`}>
                                            {series.episodes.every(ep => selectedProjects.has(ep.id)) && <div className="text-black text-[10px] font-bold">✓</div>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold bg-white/10 text-[var(--color-text-muted)] px-1.5 py-0.5 rounded uppercase tracking-wider">Series</span>
                                        <h2 className="text-3xl font-bold text-white">{series.name}</h2>
                                    </div>
                                    <button
                                        onClick={(e) => handleNewEpisode(series.name, e)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 hover:border-[var(--color-primary)] transition-all text-xs font-bold uppercase tracking-wider"
                                        title={`Create new episode for ${series.name}`}
                                    >
                                        <Plus size={14} />
                                        New Episode
                                    </button>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-[var(--color-text-muted)]">{series.episodes.length} episode(s)</span>
                                    <button
                                        onClick={(e) => handleDeleteSeries(series.name, e)}
                                        className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                        title={`Delete entire series "${series.name}"`}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            {series.episodes.map((episode) => {
                                // const isActive = episode.id === activeProjectId; // UNUSED
                                // const totalSteps = 6; // UNUSED
                                const isSelected = selectedProjects.has(episode.id);

                                return (
                                    <div key={episode.id} className="group/row flex items-center gap-4 p-3 rounded-lg border border-transparent hover:border-[var(--color-border-highlight)] hover:bg-[var(--color-surface)] transition-all relative">

                                        {/* Selection Checkbox */}
                                        <div
                                            onClick={(e) => toggleProjectSelection(episode.id, e)}
                                            className="cursor-pointer p-2 rounded-md hover:bg-white/5 transition-colors"
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected
                                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                                                : 'border-white/30 group-hover/row:border-white/50'
                                                }`}>
                                                {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                                            </div>
                                        </div>

                                        {/* Thumbnail (Small) */}
                                        <div
                                            onClick={() => handleLoadProject(episode.id)}
                                            className="w-24 h-16 flex-shrink-0 bg-black/20 rounded border border-[var(--color-border)] overflow-hidden relative cursor-pointer group/img"
                                        >
                                            {episode.thumbnailUrl ? (
                                                <img src={episode.thumbnailUrl} alt={episode.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/20">
                                                    <Image size={20} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Project Info */}
                                        <div
                                            onClick={() => handleLoadProject(episode.id)}
                                            className="flex-1 min-w-0 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[var(--color-primary)] font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10">EP.{episode.number}</span>
                                                <h3 className="text-white font-medium truncate">{episode.name}</h3>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
                                                <span className="flex items-center gap-1">
                                                    <BarChart3 size={10} />
                                                    Step {episode.currentStep}/7
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <FileText size={10} />
                                                    {episode.scriptLength || 0} cuts
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Music size={10} />
                                                    {episode.assetsCount || 0} assets
                                                </span>
                                                <span>{new Date(episode.lastModified).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        {/* Progress Bar (Compact) */}
                                        <div className="w-24 flex-shrink-0">
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="text-[var(--color-text-muted)]">Progress</span>
                                                <span className="text-[var(--color-primary)]">{episode.progress}%</span>
                                            </div>
                                            <div className="w-full h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                                <div className="h-full bg-[var(--color-primary)]" style={{ width: `${episode.progress}%` }} />
                                            </div>
                                        </div>

                                        {/* Row Actions */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => handleDuplicateProject(episode.id, episode.name, e)}
                                                className="p-1.5 rounded-md text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                                                title="Duplicate"
                                            >
                                                <Copy size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteProject(episode.id, episode.name, e)}
                                                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleLoadProject(episode.id)}
                                                className="p-1.5 rounded-md text-gray-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                                                title="Open Project"
                                            >
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Load More Button */}
                    {hasMoreSeries && (
                        <div className="flex justify-center pt-8 pb-16">
                            <button
                                onClick={handleLoadMore}
                                className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-white font-medium flex items-center gap-2 group"
                            >
                                <span>Load More Series</span>
                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] group-hover:bg-white/20">
                                    {allSeriesData.length - visibleCount}
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>


        </>
    );
};
