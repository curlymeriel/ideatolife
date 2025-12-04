import React from 'react';
import { useWorkflowStore, type ProjectData, type ProjectMetadata } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { Image, FileText, Music, CheckCircle, ArrowRight, TrendingUp, BarChart3, Plus, Download } from 'lucide-react';

import { StorageInspector } from '../components/StorageInspector';
import { useAutoBackup } from '../hooks/useAutoBackup';

export const Dashboard: React.FC = () => {
    const store = useWorkflowStore();
    const { savedProjects, loadProject, createProject, id: activeProjectId } = store;
    const navigate = useNavigate();
    const [showInspector, setShowInspector] = React.useState(false);
    const [projectsData, setProjectsData] = React.useState<Record<string, ProjectData>>({});

    // Activate auto-backup (every 60 seconds)
    // Activate auto-backup (every 60 seconds)
    useAutoBackup();

    const handleCreateProject = () => {
        createProject();
        navigate('/step/1');
    };

    const handleLoadProject = (projectId: string) => {
        loadProject(projectId);
        navigate(`/step/1`); // Always start at step 1 when loading from dashboard
    };

    // Group projects by series
    const seriesMap = new Map<string, ProjectMetadata[]>();

    // Ensure we have at least the current project if savedProjects is empty (edge case)
    const projectsToRender = Object.keys(savedProjects).length > 0
        ? Object.values(savedProjects)
        : [];

    // Load actual project data for statistics
    React.useEffect(() => {
        const loadAllProjects = async () => {
            const idbKeyval = await import('idb-keyval');
            const loaded: Record<string, ProjectData> = {};
            for (const [id] of Object.entries(savedProjects)) {
                try {
                    // Use the same key format as workflowStore: project-{id}
                    const fullData = await idbKeyval.get(`project-${id}`);
                    if (fullData) {
                        loaded[id] = fullData as ProjectData;
                        console.log(`[Dashboard] Loaded project ${id}:`, {
                            scriptLength: fullData.script?.length,
                            assetsCount: fullData.assetDefinitions ? Object.keys(fullData.assetDefinitions).length : 0
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to load project ${id}:`, error);
                }
            }
            setProjectsData(loaded);
        };
        loadAllProjects();
    }, [savedProjects]);

    projectsToRender.forEach(p => {
        const series = p.seriesName || 'Untitled Series';
        if (!seriesMap.has(series)) seriesMap.set(series, []);
        seriesMap.get(series)!.push(p);
    });

    // Helper to calculate step completion (same logic as MainLayout)
    const isStepCompleted = (projectData: ProjectData | undefined, stepId: number): boolean => {
        if (!projectData) return false;
        switch (stepId) {
            case 1: return !!(projectData.seriesName && projectData.episodeName);
            case 2: return !!projectData.styleAnchor?.referenceImage;
            case 3: return projectData.script.length > 0;
            case 4: return projectData.script.length > 0 && projectData.script.every(cut => cut.isConfirmed);
            case 5: return true;
            case 6: return projectData.script.length > 0 && projectData.script.every(cut =>
                cut.isConfirmed && cut.finalImageUrl && cut.audioUrl
            );
            default: return false;
        }
    };

    const allSeries = Array.from(seriesMap.entries()).map(([seriesName, projects], index) => ({
        id: index,
        name: seriesName,
        episodes: projects.map(p => {
            const projectData = projectsData[p.id];
            const totalSteps = 6;

            // Calculate real progress based on completed steps
            const completedSteps = projectData
                ? [1, 2, 3, 4, 5, 6].filter(stepId => isStepCompleted(projectData, stepId)).length
                : 0;
            const progressPercent = Math.round((completedSteps / totalSteps) * 100);

            // Calculate script progress (confirmed cuts)
            const scriptLength = projectData?.script.length || 0;
            const confirmedCuts = projectData?.script.filter(c => c.isConfirmed).length || 0;
            const scriptProgress = scriptLength > 0 ? Math.round((confirmedCuts / scriptLength) * 100) : 0;

            // Count assets
            const assetsCount = projectData?.assetDefinitions
                ? Object.keys(projectData.assetDefinitions).length
                : 0;

            // Determine thumbnail URL with fallback
            let displayThumbnail = p.thumbnailUrl;

            if (!displayThumbnail && projectData) {
                // Fallback 1: First Cut Image
                const firstCut = projectData.script?.[0];
                if (firstCut) {
                    displayThumbnail = firstCut.finalImageUrl || firstCut.draftImageUrl || null;
                }

                // Fallback 2: First Asset Image
                if (!displayThumbnail && projectData.assetDefinitions) {
                    const firstAsset = Object.values(projectData.assetDefinitions)[0];
                    if (firstAsset) {
                        displayThumbnail = firstAsset.referenceImage || firstAsset.masterImage || firstAsset.draftImage || null;
                    }
                }
            }

            return {
                id: p.id,
                name: p.episodeName || '(T.B.D)',
                number: p.episodeNumber || 1,
                progress: progressPercent,
                scriptProgress: scriptProgress,
                assetsProgress: assetsCount > 0 ? 100 : 0,
                currentStep: projectData?.currentStep || 1,
                thumbnailUrl: displayThumbnail,
                styleAnchor: projectData?.styleAnchor,
                scriptLength: scriptLength,
                assetsCount: assetsCount
            };
        })
    }));

    return (
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
            <div className="col-span-12 lg:col-span-4 space-y-8">
                <div className="py-6">
                    <h1 className="text-5xl font-bold text-white tracking-tight mb-2">Idea to Life</h1>
                    <p className="text-2xl text-[var(--color-primary)] font-medium">Meriel's Idea Lab</p>
                </div>

                <div className="space-y-2 max-w-[200px]">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-[var(--color-primary)] flex-shrink-0" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Quick Actions</h3>
                    </div>
                    <div className="space-y-1.5">
                        <button onClick={handleCreateProject} className="w-full flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-[var(--color-primary)]/20 hover:border-[var(--color-primary)] border border-[var(--color-border)] transition-all text-xs text-white group">
                            <span className="flex items-center gap-2">
                                <Plus size={14} className="text-[var(--color-primary)]" />
                                New Project
                            </span>
                            <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                        <button onClick={() => navigate('/step/6')} className="w-full flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-[var(--color-primary)]/20 hover:border-[var(--color-primary)] border border-[var(--color-border)] transition-all text-xs text-white">
                            <span>Export Assets</span>
                            <ArrowRight size={10} />
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (e) => {
                                        const content = e.target?.result as string;
                                        if (content) {
                                            useWorkflowStore.getState().importData(content);
                                        }
                                    };
                                    reader.readAsText(file);
                                    // Reset input
                                    e.target.value = '';
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button className="w-full flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-blue-500/20 hover:border-blue-500 border border-[var(--color-border)] transition-all text-xs text-white">
                                <span>Import Project</span>
                                <Download size={10} className="rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Content - Series Cards */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
                {allSeries.length === 0 && (
                    <div className="glass-panel p-8 text-center text-[var(--color-text-muted)]">
                        No projects found. Start a new one!
                    </div>
                )}

                {allSeries.map((series) => (
                    <div key={series.id} className="glass-panel p-8 space-y-6 hover:border-[var(--color-primary)] transition-all">
                        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                            <h2 className="text-3xl font-bold text-white">{series.name}</h2>
                            <span className="text-sm text-[var(--color-text-muted)]">{series.episodes.length} episode(s)</span>
                        </div>
                        {series.episodes.map((episode) => {
                            const isActive = episode.id === activeProjectId;
                            const totalSteps = 6; // Defined here for rendering context

                            return (
                                <div
                                    key={episode.id}
                                    onClick={() => handleLoadProject(episode.id)}
                                    className={`space-y-6 p-6 rounded-xl border transition-all cursor-pointer relative group/card ${isActive
                                        ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]'
                                        : 'bg-transparent border-transparent hover:bg-[var(--color-surface)] hover:border-[var(--color-border-highlight)]'
                                        }`}
                                >
                                    {isActive && (
                                        <div className="absolute top-4 right-4 px-2 py-1 bg-[var(--color-primary)] text-black text-[10px] font-bold uppercase tracking-wider rounded">
                                            Active
                                        </div>
                                    )}

                                    <h3 className="text-xl font-semibold text-[var(--color-primary)] flex items-center gap-2">
                                        <span>EP.{episode.number}</span>
                                        <span className="text-white">{episode.name}</span>
                                    </h3>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        {/* Left: Image placeholders */}
                                        <div className="lg:col-span-2 flex flex-col space-y-4">
                                            {/* Character / Thumbnail Image */}
                                            <div className="w-full h-96 bg-[var(--color-surface)] rounded border border-[var(--color-border)] overflow-hidden relative group/img">
                                                {episode.thumbnailUrl ? (
                                                    <>
                                                        <img src={episode.thumbnailUrl} alt="Episode Thumbnail" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                            <span className="text-white text-sm font-medium">Episode Thumbnail</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white opacity-30">
                                                        <Image size={48} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Right: Stats */}
                                        <div className="space-y-4">
                                            {/* Workflow Progress */}
                                            <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--color-primary)] rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity" />
                                                <div className="relative z-10 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-orange-600">
                                                            <BarChart3 size={20} className="text-black" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-lg font-bold text-white">Workflow Progress</h4>
                                                            <p className="text-xs text-[var(--color-text-muted)]">Step {episode.currentStep} of {totalSteps}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-[var(--color-text-muted)] mb-1 flex items-center gap-1 justify-end">
                                                            <TrendingUp size={12} />
                                                            Completion
                                                        </div>
                                                        <div className="text-3xl font-bold text-[var(--color-primary)] relative">
                                                            {episode.progress}%
                                                            <div className="absolute -inset-1 bg-[var(--color-primary)] opacity-20 blur-xl rounded-full" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-2 w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-[var(--color-primary)] to-orange-400" style={{ width: `${episode.progress}%` }} />
                                                </div>
                                            </div>
                                            {/* Script & Assets */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {/* Assets */}
                                                <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-orange-600">
                                                                <Music size={16} className="text-black" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-white">Assets</h4>
                                                                <p className="text-xs text-[var(--color-text-muted)]">{episode.assetsCount} items</p>
                                                            </div>
                                                        </div>
                                                        {episode.assetsProgress === 100 && <CheckCircle size={16} className="text-green-400" />}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-[var(--color-text-muted)] mb-1">Production</div>
                                                        <div className="text-3xl font-bold text-[var(--color-primary)] relative">
                                                            {episode.assetsProgress}%
                                                            <div className="absolute -inset-1 bg-[var(--color-primary)] opacity-20 blur-lg rounded-full" />
                                                        </div>
                                                    </div>
                                                    <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-[var(--color-primary)] to-orange-400" style={{ width: `${episode.assetsProgress}%` }} />
                                                    </div>
                                                </div>
                                                {/* Script */}
                                                <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-orange-600">
                                                                <FileText size={16} className="text-black" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-white">Script</h4>
                                                                <p className="text-xs text-[var(--color-text-muted)]">{episode.scriptLength} cuts</p>
                                                            </div>
                                                        </div>
                                                        {episode.scriptProgress === 100 && <CheckCircle size={16} className="text-green-400" />}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-[var(--color-text-muted)] mb-1">Status</div>
                                                        <div className="text-3xl font-bold text-[var(--color-primary)] relative">
                                                            {episode.scriptProgress}%
                                                            <div className="absolute -inset-1 bg-[var(--color-primary)] opacity-20 blur-lg rounded-full" />
                                                        </div>
                                                    </div>
                                                    <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-[var(--color-primary)] to-orange-400" style={{ width: `${episode.scriptProgress}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};
