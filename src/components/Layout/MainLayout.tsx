import React, { useState } from 'react';
import { useWorkflowStore } from '../../store/workflowStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Film, Image, Palette, FileText, Play, Home, CheckCircle2, Circle, Settings, ChevronDown, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { downloadBackup } from '../../hooks/useAutoBackup';

interface MainLayoutProps {
    children: React.ReactNode;
}

const STEPS = [
    { id: 1, name: 'Setup', path: '/step/1', icon: Film },
    { id: 2, name: 'Key Visuals', path: '/step/2', icon: Palette },
    { id: 3, name: 'Production', path: '/step/3', icon: FileText },
    { id: 4, name: 'Review', path: '/step/4', icon: CheckCircle2 },
    { id: 5, name: 'Thumbnail', path: '/step/5', icon: Image },
    { id: 6, name: 'Final', path: '/step/6', icon: Play },
];

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const store = useWorkflowStore();
    const {
        currentStep, seriesName, episodeName, episodeNumber, apiKeys, setApiKeys, restoreData,
        script, styleAnchor
    } = store;
    const [showApiConfig, setShowApiConfig] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Helper function to check if a step is completed
    const isStepCompleted = (stepId: number): boolean => {
        switch (stepId) {
            case 1: // Setup
                return !!(seriesName && episodeName);
            case 2: // Key Visuals
                return !!styleAnchor?.referenceImage;
            case 3: // Script
                return script.length > 0;
            case 4: // Production
                return script.length > 0 && script.every(cut => cut.isConfirmed);
            case 5: // Thumbnail
                return true; // Thumbnail step is always considered complete once visited
            case 6: // Final
                return script.length > 0 && script.every(cut => cut.isConfirmed && cut.finalImageUrl && cut.audioUrl);
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

                    {/* Save Status Indicator */}
                    <div className="mt-2 flex items-center gap-2">
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
                    </div>
                </div>

                {/* Dashboard Link - Moved to top */}
                <button
                    onClick={() => navigate('/')}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-all mt-14 mb-14 ${isDashboard
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
                                onClick={() => navigate(step.path)}
                                className={`w-full px-4 py-3 flex items-center gap-3 transition-all relative ${isActive
                                    ? 'bg-[rgba(255,173,117,0.15)] text-[var(--color-primary)] font-semibold border-r-2 border-[var(--color-primary)]'
                                    : isCompleted
                                        ? 'text-green-400 hover:bg-[rgba(255,255,255,0.05)]'
                                        : isCurrent
                                            ? 'text-white hover:bg-[rgba(255,255,255,0.05)]'
                                            : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                                    } ${isLast ? 'border-b border-[var(--color-primary)]' : ''}`}
                            >
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

                {/* Footer Actions */}
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    {/* Restore Data Button */}
                    <button
                        onClick={restoreData}
                        className="w-full p-3 flex items-center gap-3 text-[var(--color-text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-colors border-b border-[var(--color-border)]"
                        title="Restore data from Database or LocalStorage"
                    >
                        <RotateCcw size={16} />
                        <span className="text-sm font-medium">Restore Data</span>
                    </button>

                    {/* Rescue Center Button */}
                    <button
                        onClick={() => navigate('/rescue')}
                        className="w-full p-3 flex items-center gap-3 text-red-400 hover:text-red-300 hover:bg-[rgba(255,0,0,0.1)] transition-colors border-b border-[var(--color-border)]"
                        title="Emergency Data Recovery"
                    >
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">Rescue Center</span>
                    </button>

                    {/* Save Project Button - Always Visible */}
                    <button
                        onClick={downloadBackup}
                        className="w-full p-3 flex items-center gap-3 text-[var(--color-text-muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-colors border-b border-[var(--color-border)]"
                    >
                        <Save size={16} />
                        <span className="text-sm font-medium">Backup Project</span>
                    </button>

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
                                <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Google Cloud Key</label>
                                <input
                                    type="password"
                                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                    value={apiKeys?.googleCloud || ''}
                                    onChange={(e) => setApiKeys({ ...apiKeys, googleCloud: e.target.value })}
                                    placeholder="For TTS"
                                />
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
                        <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
                            <span className="hover:text-white cursor-pointer transition-colors">Docs</span>
                            <span className="hover:text-white cursor-pointer transition-colors">Support</span>
                        </div>
                    </div>
                </div>

                {/* Page Content */}
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};
