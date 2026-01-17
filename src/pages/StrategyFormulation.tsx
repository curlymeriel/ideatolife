import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
    LayoutGrid,
    Target,
    CheckCircle2,
    Loader2,
    Rocket,
    FileText,
    Clapperboard,
    Lightbulb,
    Zap,
    ShieldAlert,
    ArrowLeft,
    Plus,
    Save,
    Sparkles,
    BookmarkPlus,
    BrainCircuit,
    ShieldCheck,
    ChevronRight,
} from 'lucide-react';
import { generateStrategyInsight } from '../services/gemini';
import type { CompetitorSnapshot, StrategyInsight } from '../store/types';

export const StrategyFormulation: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const snapshotId = searchParams.get('snapshotId');

    const {
        trendSnapshots,
        competitorSnapshots,
        strategyInsights,
        ideaPool,
        apiKeys,
        saveStrategyInsight,
        addIdeaToPool,
        setProjectInfo,
        setScript,
        isHydrated
    } = useWorkflowStore();

    const geminiApiKey = apiKeys?.gemini || '';

    // State
    const competitors = Object.values(competitorSnapshots).sort((a, b) => b.createdAt - a.createdAt);
    const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorSnapshot | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [strategyResult, setStrategyResult] = useState<StrategyInsight | null>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'pillars' | 'series' | 'episodes'>('summary');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Restoration and URL Selection Effect
    React.useEffect(() => {
        if (!isHydrated) return;

        // 1. Auto-selection from URL
        if (snapshotId && (!selectedCompetitor || selectedCompetitor.id !== snapshotId)) {
            const found = competitorSnapshots[snapshotId];
            if (found) {
                console.log(`[Strategy] Auto-selecting competitor from URL: ${snapshotId}`);
                setSelectedCompetitor(found);
            }
        }

        // 2. Data Restoration
        if (selectedCompetitor) {
            // Check if we already have a strategy for this competitor
            const existing = Object.values(strategyInsights).find(
                s => s.competitorSnapshotId === selectedCompetitor.id
            );
            if (existing) {
                console.log(`[Strategy] Restoring existing strategy insight: ${existing.id}`);
                setStrategyResult(existing);
                setSaveStatus('saved');
            } else {
                // IMPORTANT: Only clear if it's NOT currently generating
                // This prevented the "disappearing during generation" bug in Phase 2
                if (!isGenerating) {
                    setStrategyResult(null);
                    setSaveStatus('idle');
                }
            }
        }
    }, [isHydrated, snapshotId, selectedCompetitor, strategyInsights, isGenerating]);

    const handleSelectCompetitor = (comp: CompetitorSnapshot) => {
        setSelectedCompetitor(comp);
    };

    const handleSaveToPool = (episode: any, series: any) => {
        addIdeaToPool({
            id: Math.random().toString(36).substring(2, 9),
            createdAt: Date.now(),
            title: episode.ideaTitle,
            description: episode.oneLiner,
            source: 'Phase3',
            sourceId: strategyResult?.id,
            category: series.title,
            status: 'pending',
            metadata: {
                targetAudience: series.expectedAudience,
                angle: episode.angle,
                format: episode.format,
                notes: episode.notes
            }
        });
        // Could add a toast or success state here
    };

    const handleSaveAllToPool = () => {
        if (!strategyResult) return;

        let count = 0;
        strategyResult.recommendedEpisodes.forEach(episode => {
            // Check if already in pool to avoid duplicates
            const exists = ideaPool.some(item =>
                item.title === episode.ideaTitle &&
                item.sourceId === strategyResult.id
            );

            if (!exists) {
                addIdeaToPool({
                    id: Math.random().toString(36).substring(2, 9),
                    createdAt: Date.now(),
                    title: episode.ideaTitle,
                    description: episode.oneLiner,
                    source: 'Phase3',
                    sourceId: strategyResult.id,
                    category: strategyResult.recommendedSeries[0]?.title || 'Strategy',
                    status: 'pending',
                    metadata: {
                        targetAudience: strategyResult.recommendedSeries[0]?.expectedAudience || '',
                        angle: episode.angle,
                        format: episode.format,
                        notes: episode.notes
                    }
                });
                count++;
            }
        });

        if (count > 0) {
            alert(`${count}개의 아이디어가 아이디어 풀에 저장되었습니다.`);
        } else {
            alert('이미 모든 아이디어가 저장되어 있습니다.');
        }
    };

    const handleGenerateStrategy = async () => {
        if (!selectedCompetitor || !geminiApiKey) return;

        setIsGenerating(true);
        try {
            // Find parent trend snapshot for more context
            const trendSnapshot = trendSnapshots[selectedCompetitor.trendSnapshotId || ''];

            const result = await generateStrategyInsight(
                trendSnapshot || { queryContext: 'Unknown', keywords: [], description: '' },
                selectedCompetitor,
                geminiApiKey
            );

            setStrategyResult(result);
            setActiveTab('summary');
        } catch (error) {
            console.error('Strategy generation failed:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveStrategy = () => {
        if (!strategyResult) return;
        setSaveStatus('saving');
        saveStrategyInsight(strategyResult);
        setSaveStatus('saved');
    };

    const handlePromoteToProject = async (series: any, episode?: any) => {
        // 1. Auto-save strategy if not yet saved (important for the Bridge)
        if (saveStatus !== 'saved' && strategyResult) {
            saveStrategyInsight(strategyResult);
        }

        // 2. Workflow Bridge: ALWAYS create a NEW project for a new series/episode promotion
        // This prevents overwriting the currently active project
        const newProjectId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        console.log(`[Strategy] Promoting to NEW project: ${series.title}. New ID: ${newProjectId}`);

        // Get current API keys to preserve them
        const currentApiKeys = useWorkflowStore.getState().apiKeys;

        // Reset to default but with a NEW ID and existing API keys
        const { resetToDefault } = useWorkflowStore.getState();
        resetToDefault(); // This resets most state to empty/defaults

        // Now set the new ID and strategy info
        setProjectInfo({
            id: newProjectId,
            apiKeys: currentApiKeys, // Restore keys
            seriesName: series.title,
            seriesStory: series.description,
            episodeName: episode?.ideaTitle || 'New Episode',
            episodePlot: episode?.oneLiner || '',
            lastModified: Date.now(),
            currentStep: 1,
            trendInsights: {
                target: series.expectedAudience,
                vibe: episode?.angle || '',
                references: series.benchmarkVideos || [],
                storytelling: episode?.notes || '',
                appliedAt: Date.now()
            }
        });

        // Initialize script
        setScript([]);

        // Force a save to disk immediately so Step 1 can load it reliably
        const { saveProject } = useWorkflowStore.getState();
        await saveProject();

        // Navigate to Step 1 for refinement
        navigate('/step/1');
    };

    const renderSelectionArea = () => (
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LayoutGrid size={20} className="text-[var(--color-primary)]" />
                분석된 경쟁 데이터 선택
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {competitors.length === 0 ? (
                    <div className="col-span-full h-40 flex flex-col items-center justify-center text-gray-500 border border-dashed border-[var(--color-border)] rounded-xl bg-white/5">
                        <Target className="mb-2 opacity-30" size={32} />
                        <p>분석된 경쟁자 스냅샷이 없습니다.</p>
                        <button
                            onClick={() => navigate('/research/competitor')}
                            className="mt-2 text-[var(--color-primary)] hover:underline text-sm"
                        >
                            Phase 2에서 경쟁 분석을 먼저 수행하세요
                        </button>
                    </div>
                ) : (
                    competitors.map(comp => (
                        <div
                            key={comp.id}
                            onClick={() => handleSelectCompetitor(comp)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer ${selectedCompetitor?.id === comp.id
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]'
                                : 'border-[var(--color-border)] bg-white/5 hover:border-white/30'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] text-gray-500">{new Date(comp.createdAt).toLocaleDateString()}</span>
                                {selectedCompetitor?.id === comp.id && <CheckCircle2 className="text-[var(--color-primary)]" size={16} />}
                            </div>
                            <h3 className="text-white font-bold mb-1 line-clamp-1">{comp.summary || '경쟁자 심층 분석'}</h3>
                            <div className="flex gap-1 mt-2">
                                {comp.focusKeywords.slice(0, 3).map((kw, i) => (
                                    <span key={i} className="px-1 py-0.5 bg-black/30 text-[9px] text-gray-400 rounded">#{kw}</span>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const renderStrategyDashboard = () => {
        if (!selectedCompetitor) return null;

        if (!strategyResult) {
            return (
                <div className="h-64 flex flex-col items-center justify-center border border-[var(--color-border)] rounded-2xl bg-white/5 space-y-4">
                    <Sparkles size={48} className="text-[var(--color-primary)] opacity-50" />
                    <div className="text-center">
                        <p className="text-white font-bold">전략 컨설팅 준비 완료</p>
                        <p className="text-sm text-gray-400">Gemini가 시장 트렌드와 경쟁자 데이터를 결합하여 맞춤형 전략을 수립합니다.</p>
                    </div>
                    <button
                        onClick={handleGenerateStrategy}
                        disabled={isGenerating || !geminiApiKey}
                        className="px-8 py-3 bg-[var(--color-primary)] text-black font-bold rounded-xl hover:bg-[var(--color-primary)]/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
                    >
                        {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Rocket size={20} />}
                        전략 수립 AI 컨설팅 시작
                    </button>
                </div>
            );
        }

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Tabs */}
                <div className="flex border-b border-[var(--color-border)] gap-8">
                    {[
                        { id: 'summary', label: 'Executive Summary', icon: <FileText size={18} /> },
                        { id: 'pillars', label: 'Content Pillars', icon: <Target size={18} /> },
                        { id: 'series', label: 'Series Plan', icon: <Clapperboard size={18} /> },
                        { id: 'episodes', label: 'Episode Ideas', icon: <Lightbulb size={18} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-3 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === tab.id ? 'text-[var(--color-primary)]' : 'text-gray-500 hover:text-white'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]" />}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <button
                        onClick={handleSaveStrategy}
                        disabled={saveStatus !== 'idle'}
                        className={`mb-2 px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-all ${saveStatus === 'saved'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                            }`}
                    >
                        {saveStatus === 'saved' ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '전략 저장됨' : '전략 리포트 저장'}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                    {activeTab === 'summary' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-6 rounded-2xl">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <FileText className="text-[var(--color-primary)]" />
                                    핵심 제작 전략
                                </h3>
                                <p className="text-gray-300 leading-relaxed text-lg italic border-l-4 border-[var(--color-primary)] pl-4 py-2">
                                    "{strategyResult.executiveSummary}"
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-green-500/5 border border-green-500/20 p-5 rounded-2xl">
                                    <h4 className="text-green-400 font-bold flex items-center gap-2 mb-3">
                                        <Zap size={18} /> 핵심 기회 요인 (Opportunities)
                                    </h4>
                                    <ul className="space-y-2">
                                        {strategyResult.keyOpportunities.map((item, i) => (
                                            <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                                                <Plus size={14} className="text-green-500 mt-1 flex-shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-red-500/5 border border-red-500/20 p-5 rounded-2xl">
                                    <h4 className="text-red-400 font-bold flex items-center gap-2 mb-3">
                                        <ShieldAlert size={18} /> 주요 리스크 관리 (Risks)
                                    </h4>
                                    <ul className="space-y-2">
                                        {strategyResult.keyRisks.map((item, i) => (
                                            <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pillars' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            {strategyResult.recommendedPillars.map((pillar, i) => (
                                <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] p-6 rounded-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Target size={120} />
                                    </div>
                                    <div className="text-[var(--color-primary)] font-bold text-xs uppercase tracking-widest mb-2">Pillar 0{i + 1}</div>
                                    <h3 className="text-xl font-bold text-white mb-3">{pillar.pillarName}</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">{pillar.reason}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'series' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {strategyResult.recommendedSeries.map((series, i) => (
                                <div key={i} className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-8 flex flex-col md:flex-row gap-8">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="px-2 py-1 bg-[var(--color-primary)] text-black text-[10px] font-bold rounded">SERIES 기획</span>
                                            <span className="text-gray-500 text-xs tracking-widest">TARGET: {series.targetPillar}</span>
                                        </div>
                                        <h3 className="text-2xl font-bold text-white mb-3">{series.title}</h3>
                                        <p className="text-gray-400 mb-6">{series.description}</p>
                                        <div className="flex items-center gap-6 text-sm">
                                            <div>
                                                <p className="text-gray-500 text-[10px] uppercase mb-1">예상 시청자</p>
                                                <p className="text-white font-medium">{series.expectedAudience}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-[10px] uppercase mb-1">에피소드 개수 (추천)</p>
                                                <p className="text-white font-medium">10+ 에피소드</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-72 flex flex-col justify-center">
                                        <button
                                            onClick={() => handlePromoteToProject(series)}
                                            className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-[var(--color-primary)] hover:text-black transition-all flex items-center justify-center gap-2 shadow-xl"
                                        >
                                            <Rocket size={20} />
                                            이 시리즈로 제작 시작
                                        </button>
                                        <p className="text-center text-gray-500 text-[10px] mt-4">클릭 시 Step 1 설정으로 자동 매핑됩니다</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'episodes' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                            {strategyResult.recommendedEpisodes.map((ep, i) => (
                                <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-2xl group hover:border-[var(--color-primary)]/50 transition-all">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="px-2 py-0.5 bg-white/10 text-gray-400 text-[10px] rounded uppercase tracking-tighter">{ep.format}</span>
                                        <button
                                            onClick={() => {
                                                const series = strategyResult.recommendedSeries[0]; // Simple fallback
                                                handlePromoteToProject(series, ep);
                                            }}
                                            className="p-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Rocket size={16} />
                                        </button>
                                    </div>
                                    <h4 className="text-lg font-bold text-white mb-2">{ep.ideaTitle}</h4>
                                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">{ep.oneLiner}</p>
                                    <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                                        <div className="flex-1 flex items-center gap-2">
                                            <Zap size={14} className="text-orange-400" />
                                            <span className="text-xs text-orange-400/80 font-medium tracking-tight">Angle: {ep.angle}</span>
                                        </div>
                                        <button
                                            onClick={() => handleSaveToPool(ep, strategyResult.recommendedSeries[0])}
                                            className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all"
                                            title="아이디어 풀에 저장"
                                        >
                                            <BookmarkPlus size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action Bridge Section */}
                    {strategyResult && (
                        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 bg-indigo-500/5 p-8 rounded-3xl">
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                    <Lightbulb className="text-yellow-400" />
                                    전략 실행 포인트 (Execution Point)
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    도출된 전략적 방향성을 기반으로 실제 콘텐츠 제작을 위한 아이디어 풀을 구축하세요.<br />
                                    모든 추천 에피소드를 저장하고 관리할 수 있습니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handleSaveAllToPool}
                                    className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all flex items-center gap-2"
                                >
                                    <BookmarkPlus size={20} />
                                    전체 아이디어 담기
                                </button>
                                <button
                                    onClick={() => navigate('/research/ideas')}
                                    className="px-6 py-3 bg-[var(--color-primary)] text-black font-bold rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
                                >
                                    아이디어 풀 (Phase 4) 이동
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
            {/* Phase Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
                <div>
                    <div className="flex items-center gap-2 text-xs text-orange-400 font-bold uppercase tracking-widest mb-1">
                        <Sparkles size={14} /> Production Bridge
                    </div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2 leading-none">
                        Phase 3: 전략 수립 및 프로젝트 자동 생성
                    </h1>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate(selectedCompetitor?.trendSnapshotId
                            ? `/research/competitor?snapshotId=${selectedCompetitor.trendSnapshotId}`
                            : '/research/competitor'
                        )}
                        className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm"
                    >
                        <ArrowLeft size={16} />
                        경쟁 분석
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm"
                    >
                        대시보드로
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-12 custom-scrollbar">
                    {renderSelectionArea()}
                    {renderStrategyDashboard()}
                </div>
            </div>

            {/* Banner info */}
            <div className="px-6 py-2 bg-indigo-500/10 border-t border-indigo-500/20 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-4 text-indigo-400">
                    <span className="flex items-center gap-1"><BrainCircuit size={12} /> Gemini 3.0 Pro 기반 전략 수립</span>
                    <span className="flex items-center gap-1"><Target size={12} /> Content Pillars & Series Planning</span>
                </div>
                {geminiApiKey ? (
                    <span className="text-green-500 flex items-center gap-1"><ShieldCheck size={12} /> Deep Research Engine Connected</span>
                ) : (
                    <span className="text-orange-500 flex items-center gap-1"><Zap size={12} /> API Key required for AI Consulting</span>
                )}
            </div>
        </div>
    );
};
