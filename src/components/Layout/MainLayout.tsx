import React, { useState, useEffect } from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import { useLocation, useNavigate } from 'react-router-dom';

import { Film, Palette, FileText, CheckCircle2, Image, Play, Box, Home, RotateCcw, Settings, ChevronDown, Circle, HelpCircle, BookOpen, MessageCircle } from 'lucide-react';
import { WelcomeGuide } from '../WelcomeGuide';
import { SupportModal } from '../SupportModal';
import { RescueModal } from '../RescueModal';
import { AppSupportChatbot } from '../AppSupportChatbot';


interface MainLayoutProps {
    children: React.ReactNode;
}

const STEPS = [
    { id: 1, name: 'Setup', path: '/step/1', icon: Film },
    { id: 2, name: 'Key Visuals', path: '/step/2', icon: Palette },
    { id: 3, name: 'Production', path: '/step/3', icon: FileText },
    { id: 4, name: 'Review', path: '/step/4', icon: CheckCircle2 },
    { id: 4.5, name: 'Video', path: '/step/4.5', icon: Film },
    { id: 5, name: 'Thumbnail', path: '/step/5', icon: Image },
    { id: 6, name: 'Final', path: '/step/6', icon: Play },
];

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const store = useWorkflowStore();
    const {
        currentStep, seriesName, episodeName, episodeNumber, episodePlot, apiKeys, setApiKeys,
        script, masterStyle, characters, episodeCharacters, seriesLocations, episodeLocations,
        seriesProps, episodeProps, assetDefinitions
    } = store;
    const [showApiConfig, setShowApiConfig] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    // const currentPath = location.pathname;

    // Modal States
    const [showGuide, setShowGuide] = useState(false);
    const [showSupport, setShowSupport] = useState(false);
    const [showRescue, setShowRescue] = useState(false);
    const [showChatbot, setShowChatbot] = useState(false);

    // Listen for custom event to open guide (from other components)
    useEffect(() => {
        const handleOpenGuide = () => setShowGuide(true);
        const handleOpenRescue = () => setShowRescue(true);
        window.addEventListener('openWelcomeGuide', handleOpenGuide);
        window.addEventListener('openRescueModal', handleOpenRescue);
        return () => {
            window.removeEventListener('openWelcomeGuide', handleOpenGuide);
            window.removeEventListener('openRescueModal', handleOpenRescue);
        };
    }, []);

    // === ZOMBIE PROJECT CLEANUP ===
    // If the active project ID is NOT found in savedProjects (and we are hydrated),
    // it means the project was deleted (possibly from another tab/window).
    // We must reset to default to avoid showing "Ghost" data.
    React.useEffect(() => {
        if (!store.isHydrated) return;

        const currentId = store.id;
        // Skip check for 'default-project' initial state string, though resetToDefault makes a real ID now.
        if (currentId === 'default-project') return;

        const savedKeys = Object.keys(store.savedProjects || {});
        // If savedProjects is empty relative to current ID, or ID not found
        if (!savedKeys.includes(currentId)) {
            console.warn(`[MainLayout] Zombie Project Detected (ID: ${currentId}). cleanup triggered.`);
            store.resetToDefault();
            // Optional: Alert user?
            // alert("The active project was deleted. Starting fresh.");
        }
    }, [store.id, store.savedProjects, store.isHydrated]); // Dependencies ensure this runs when projects change

    // Helper function to check if a step is completed
    const isStepCompleted = (stepId: number): boolean => {
        switch (stepId) {
            case 1: // Setup
                return !!(seriesName && episodeName && episodePlot);
            case 2: // Key Visuals
                {
                    const safeMasterStyle = masterStyle || { description: '', referenceImage: null };
                    const safeCharacters = Array.isArray(characters) ? characters : [];
                    const safeEpisodeCharacters = Array.isArray(episodeCharacters) ? episodeCharacters : [];
                    const safeSeriesLocations = Array.isArray(seriesLocations) ? seriesLocations : [];
                    const safeEpisodeLocations = Array.isArray(episodeLocations) ? episodeLocations : [];
                    const safeAssetDefinitions = assetDefinitions || {};

                    const safeSeriesProps = Array.isArray(seriesProps) ? seriesProps : [];
                    const safeEpisodeProps = Array.isArray(episodeProps) ? episodeProps : [];

                    const isDefined = (id: string) => !!safeAssetDefinitions[id];

                    const allRequiredAssetIds = [
                        ...safeCharacters.map((c: any) => c.id),
                        ...safeSeriesLocations.map((l: any) => l.id),
                        ...safeSeriesProps.map((p: any) => p.id),
                        ...safeEpisodeCharacters.map((c: any) => c.id),
                        ...safeEpisodeLocations.map((l: any) => l.id),
                        ...safeEpisodeProps.map((p: any) => p.id)
                    ].filter((id, i, arr) => arr.indexOf(id) === i);

                    const isSeriesComplete = !!safeMasterStyle.description && allRequiredAssetIds.length > 0 &&
                        allRequiredAssetIds.every(id => isDefined(id));

                    return isSeriesComplete;
                }
            case 3: // Production (Script Generation + Image/Audio)
                // Complete when all cuts have BOTH confirmed image AND audio with actual URLs
                return script.length > 0 && script.every(cut =>
                    (cut.isImageConfirmed && cut.finalImageUrl) &&
                    (cut.isAudioConfirmed && (cut.audioUrl || cut.speaker === 'SILENT'))
                );
            case 4: // Review (QA)
                // Same as Step 3 - all cuts must be fully confirmed
                return script.length > 0 && script.every(cut =>
                    (cut.isImageConfirmed && cut.finalImageUrl) &&
                    (cut.isAudioConfirmed && (cut.audioUrl || cut.speaker === 'SILENT'))
                );
            case 4.5: // Video Composition
                // Complete when all cuts have confirmed videos
                return script.length > 0 && script.every(cut => cut.isVideoConfirmed);
            case 5: // Thumbnail
                return !!store.thumbnailUrl;
            case 6: // Final
                const isScriptFullyConfirmed = script.length > 0 && script.every(cut =>
                    (cut.isImageConfirmed && cut.finalImageUrl) &&
                    (cut.isAudioConfirmed && (cut.audioUrl || cut.speaker === 'SILENT'))
                );
                const isVideoFullyConfirmed = script.length > 0 && script.every(cut => cut.isVideoConfirmed);
                return isScriptFullyConfirmed && isVideoFullyConfirmed && !!store.thumbnailUrl;
            default:
                return false;
        }
    };

    // Calculate real progress based on completed steps
    const completedSteps = STEPS.filter(step => isStepCompleted(step.id)).length;
    const progressPercent = Math.round((completedSteps / STEPS.length) * 100);

    const isDashboard = location.pathname === '/';
    const currentStepObj = STEPS.find(s => s.path === location.pathname);
    const displayStep = currentStepObj ? currentStepObj.id : Math.floor(currentStep);

    // Check for Presentation Mode
    const searchParams = new URLSearchParams(location.search);
    const isPresentationMode = searchParams.get('mode') === 'presentation';

    if (isPresentationMode) {
        return (
            <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans overflow-hidden">
                <main className="flex-1 relative overflow-hidden flex flex-col">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col fixed h-screen z-50">
                {/* Logo Area */}
                <div className="p-6 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="text-[var(--color-primary)]">
                            <Box size={28} strokeWidth={2.5} />
                        </div>
                        <h1 className="text-lg font-bold text-white">
                            Idea to Life
                        </h1>
                    </div>
                    <p className="text-xs text-[var(--color-primary)] font-medium">
                        Meriel's Idea Lab
                    </p>

                    {/* Save Status Indicator & Manual Save */}
                    <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {useWorkflowStore(state => state.saveStatus) === 'saving' && (
                                <span className="text-[10px] text-yellow-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                                    Saving...
                                </span>
                            )}
                            {useWorkflowStore(state => state.saveStatus) === 'saved' && (
                                <span className="text-[10px] text-green-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Saved
                                </span>
                            )}
                            {useWorkflowStore(state => state.saveStatus) === 'error' && (
                                <span className="text-[10px] text-red-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    Save Error
                                </span>
                            )}
                            {useWorkflowStore(state => state.saveStatus) === 'idle' && (
                                <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                                    Idle
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => store.saveProject()}
                            className="p-1.5 rounded hover:bg-white/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors group"
                            title="Force Manual Save"
                        >
                            <RotateCcw size={14} className="group-active:rotate-180 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* Dashboard Link - Moved to top */}
                <button
                    onClick={() => navigate('/')}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-all mt-2 mb-2 ${isDashboard
                        ? 'bg-[var(--color-primary)] text-black font-semibold'
                        : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                        }`}
                >
                    <Home size={20} />
                    <span>Dashboard</span>
                </button>

                {/* Project Info & Progress */}
                {
                    (seriesName || episodeName) && (
                        <div className="px-4 py-4 border-b border-b-[var(--color-border)] border-t border-t-[var(--color-primary)] bg-[rgba(255,173,117,0.05)]">
                            <div className="text-xs text-[var(--color-text-muted)] mb-1">Current Project</div>
                            <div className="text-sm font-semibold text-white truncate">{seriesName || 'Untitled Series'}</div>
                            <div className="text-xs text-[var(--color-primary)] truncate mb-3">
                                {episodeName ? `EP.${episodeNumber || 1} ${episodeName}` : 'New Episode'}
                            </div>

                            {/* Progress Bar */}
                            <div className="text-xs text-[var(--color-text-muted)]">
                                <div className="flex justify-between items-center mb-1">
                                    <span>Progress</span>
                                    <span className="text-[var(--color-primary)] font-bold">
                                        {progressPercent}%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-orange-400 transition-all duration-500"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto pb-4 pt-1">
                    {/* Dashboard Link */}


                    <div className="px-4 py-2 mt-4">
                        <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                            Workflow Steps
                        </div>
                    </div>

                    {STEPS.map((step, index) => {
                        const isActive = location.pathname === step.path;
                        const isCompleted = isStepCompleted(step.id);
                        const isCurrent = Math.floor(currentStep) === Math.floor(step.id);
                        const Icon = step.icon;
                        const isLast = index === STEPS.length - 1;

                        return (
                            <button
                                key={step.id}
                                onClick={() => {
                                    store.setStep(step.id);
                                    navigate(step.path);
                                }}
                                className={`w-full px-4 py-3 flex items-center gap-3 transition-all relative ${isActive
                                    ? 'bg-[rgba(255,173,117,0.15)] text-[var(--color-primary)] font-semibold border-r-2 border-[var(--color-primary)]'
                                    : isCompleted
                                        ? 'text-green-400 hover:bg-[rgba(255,255,255,0.05)]'
                                        : isCurrent
                                            ? 'text-white hover:bg-[rgba(255,255,255,0.05)]'
                                            : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                                    } ${isLast ? 'border-b border-[var(--color-primary)]' : ''}`}
                            >
                                <span className={`text-[10px] font-bold min-w-[24px] ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>#{step.id}</span>
                                <Icon size={18} />
                                <span className="flex-1 text-left text-sm">
                                    {step.name}
                                </span>
                                {isCompleted && <CheckCircle2 size={16} className="text-green-400" />}
                                {isCurrent && !isCompleted && <Circle size={16} className="animate-pulse" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    {/* API Config Toggle with Status */}
                    <button
                        onClick={() => setShowApiConfig(!showApiConfig)}
                        className="w-full p-3 flex items-center justify-between hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                        title={
                            !apiKeys?.gemini && !apiKeys?.googleCloud
                                ? 'Missing: Gemini API Key, Google Cloud Key'
                                : !apiKeys?.gemini
                                    ? 'Missing: Gemini API Key'
                                    : !apiKeys?.googleCloud
                                        ? 'Missing: Google Cloud Key'
                                        : 'All API keys configured'
                        }
                    >
                        <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
                            <Settings size={16} />
                            <span className="text-sm font-medium">API Config</span>
                            <div className={`w-2 h-2 rounded-full ${(apiKeys?.gemini && apiKeys?.googleCloud) ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                        </div>
                        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${showApiConfig ? 'rotate-180' : ''}`} />
                    </button>

                    {showApiConfig && (
                        <div className="px-4 pb-4 space-y-3 animate-fade-in bg-[rgba(0,0,0,0.2)] border-b border-[var(--color-border)]">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Gemini API Key</label>
                                <input
                                    type="password"
                                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                    value={apiKeys?.gemini || ''}
                                    onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                                    placeholder="Required"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-purple-400 uppercase">🔊 Freesound API Key</label>
                                <input
                                    type="password"
                                    className="w-full bg-[var(--color-bg)] border border-purple-500/30 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"
                                    value={apiKeys?.freesound || ''}
                                    onChange={(e) => setApiKeys({ ...apiKeys, freesound: e.target.value })}
                                    placeholder="For SFX search (freesound.org)"
                                />
                                <a
                                    href="https://freesound.org/apiv2/apply/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] text-purple-400 hover:underline"
                                >
                                    → Get key at freesound.org
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Bar */}

            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 bg-[var(--color-bg)] h-full overflow-y-auto min-h-0">
                {/* Top Bar */}
                <div className="sticky top-0 z-40 bg-[var(--color-bg)]/80 backdrop-blur-lg border-b border-[var(--color-border)] px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-[var(--color-text-muted)]">
                            {isDashboard ? 'Overview' : `Step ${displayStep} of 6`}
                        </div>
                        {/* Help & Support - NOW IN HEADER */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowGuide(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all text-xs"
                            >
                                <BookOpen size={14} />
                                시작 가이드
                            </button>
                            <button
                                onClick={() => setShowSupport(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all text-xs"
                            >
                                <HelpCircle size={14} />
                                Support
                            </button>
                            <button
                                onClick={() => setShowChatbot(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-all text-xs font-bold border border-[var(--color-primary)]/30"
                            >
                                <MessageCircle size={14} />
                                AI Q&A
                            </button>
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="p-8">
                    {children}
                </div>
            </main>
            {/* Global Modals */}
            <WelcomeGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
            <SupportModal isOpen={showSupport} onClose={() => setShowSupport(false)} />
            <RescueModal isOpen={showRescue} onClose={() => setShowRescue(false)} />
            <AppSupportChatbot isOpen={showChatbot} onClose={() => setShowChatbot(false)} />
        </div>
    );
};
