import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { ResearchReporter } from '../services/ResearchReporter';
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
    Send,
    Bot,
    TrendingUp,
    User,
    RotateCw,
    Palette,
    Image as ImageIcon,
    Wand2,
    RefreshCw,
    Trash2
} from 'lucide-react';
import { generateStrategyInsight, generateText } from '../services/gemini';
import { generateImage } from '../services/imageGen';
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
        deleteStrategyInsight,
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
    const [activeTab, setActiveTab] = useState<'summary' | 'pillars' | 'series' | 'episodes' | 'identity'>('summary');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Branding / Identity State
    const [channelIdentity, setChannelIdentity] = useState({
        channelName: '',
        handle: '',
        bio: '',
        colorPalette: [] as string[],
        bannerPrompt: '',
        bannerUrl: '',
        profilePrompt: '',
        profileUrl: ''
    });
    const [isIdentityGenerating, setIsIdentityGenerating] = useState(false);
    const [isArtGenerating, setIsArtGenerating] = useState<'banner' | 'profile' | null>(null);

    // Chat State
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model', text: string }>>([
        { role: 'model', text: '안녕하세요! 전략기획팀장입니다. 분석된 경쟁사 데이터를 바탕으로 우리 채널의 차별화된 전략을 수립해 드릴까요?' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isChatProcessing, setIsChatProcessing] = useState(false);

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
            const existing = Object.values(strategyInsights).find(
                s => s.competitorSnapshotId === selectedCompetitor.id
            );
            if (existing) {
                console.log(`[Strategy] Restoring existing strategy insight: ${existing.id}`);
                setStrategyResult(existing);
                if (existing.channelIdentity) {
                    setChannelIdentity({
                        channelName: existing.channelIdentity.channelName || '',
                        handle: existing.channelIdentity.handle || '',
                        bio: existing.channelIdentity.bio || '',
                        colorPalette: existing.channelIdentity.colorPalette || [],
                        bannerPrompt: existing.channelIdentity.bannerPrompt || '',
                        bannerUrl: existing.channelIdentity.bannerUrl || '',
                        profilePrompt: existing.channelIdentity.profilePrompt || '',
                        profileUrl: existing.channelIdentity.profileUrl || ''
                    });
                }
                setSaveStatus('saved');
            } else {
                if (!isGenerating) {
                    setStrategyResult(null);
                    setSaveStatus('idle');
                    setChannelIdentity({
                        channelName: '', handle: '', bio: '', colorPalette: [],
                        bannerPrompt: '', bannerUrl: '', profilePrompt: '', profileUrl: ''
                    });
                }
            }
        }
    }, [isHydrated, snapshotId, selectedCompetitor, strategyInsights]);

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
    };

    const handleSaveAllToPool = () => {
        if (!strategyResult) return;
        let count = 0;
        strategyResult.recommendedEpisodes.forEach(episode => {
            const exists = ideaPool.some(item =>
                item.title === episode.ideaTitle && item.sourceId === strategyResult.id
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
        if (count > 0) alert(`${count}개의 아이디어가 아이디어 풀에 저장되었습니다.`);
        else alert('이미 모든 아이디어가 저장되어 있습니다.');
    };

    const handleGenerateStrategy = async () => {
        if (!selectedCompetitor || !geminiApiKey) return;
        setIsGenerating(true);
        try {
            const trendSnapshot = trendSnapshots[selectedCompetitor.trendSnapshotId || ''];
            const result = await generateStrategyInsight(
                trendSnapshot || { queryContext: 'Unknown', keywords: [], description: '' },
                selectedCompetitor,
                geminiApiKey
            );
            setStrategyResult(result);
            saveStrategyInsight(result);
            setActiveTab('report');
            setSaveStatus('saved');
        } catch (error) {
            console.error('Strategy generation failed:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveStrategy = () => {
        if (!strategyResult) return;
        setSaveStatus('saving');
        const updated = { ...strategyResult, channelIdentity };
        setStrategyResult(updated);
        saveStrategyInsight(updated);
        setSaveStatus('saved');
    };

    const handleChatSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!chatInput.trim() || !geminiApiKey || isChatProcessing) return;
        const userMessage = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setIsChatProcessing(true);
        try {
            const context = {
                trendSnapshot: selectedCompetitor ? trendSnapshots[selectedCompetitor.trendSnapshotId || ''] : null,
                competitor: selectedCompetitor,
                currentStrategy: strategyResult,
                ideaPoolSnippet: ideaPool.slice(0, 5)
            };
            const systemPrompt = `당신은 'AI 전략기획팀장'입니다. 경쟁 분석 데이터를 바탕으로 유튜브 채널 성장 전략을 수립합니다. 현재 컨텍스트: ${JSON.stringify(context)}`;
            const response = await generateText(userMessage, geminiApiKey, systemPrompt);
            setChatMessages(prev => [...prev, { role: 'model', text: response }]);
        } catch (error) {
            setChatMessages(prev => [...prev, { role: 'model', text: '오류가 발생했습니다.' }]);
        } finally {
            setIsChatProcessing(false);
        }
    };

    const handleGenerateIdentityText = async () => {
        if (!geminiApiKey || !strategyResult) return;
        setIsIdentityGenerating(true);
        try {
            const prompt = `Based on the following strategy, generate a YouTube channel name, handle, bio, banner prompt, and profile prompt:
            Executive Summary: ${strategyResult.executiveSummary}
            Key Opportunities: ${strategyResult.keyOpportunities.join(', ')}
            Recommended Series: ${strategyResult.recommendedSeries[0]?.title}
            Return as JSON: { channelName, handle, bio, colorPalette: [], bannerPrompt, profilePrompt }`;

            const text = await generateText(prompt, geminiApiKey, "application/json");
            const result = JSON.parse(text);

            setChannelIdentity(prev => ({
                ...prev,
                ...result
            }));
            setSaveStatus('idle');
        } catch (error) {
            console.error('Branding generation failed:', error);
        } finally {
            setIsIdentityGenerating(false);
        }
    };

    const handleGenerateArt = async (type: 'banner' | 'profile') => {
        if (!geminiApiKey) return;
        let prompt = type === 'banner' ? channelIdentity.bannerPrompt : channelIdentity.profilePrompt;

        if (!prompt) {
            // If prompt is empty, try to generate it first or use a fallback
            if (channelIdentity.channelName) {
                prompt = `${type === 'banner' ? 'YouTube banner background' : 'YouTube profile icon'} for a channel named "${channelIdentity.channelName}" focused on ${strategyResult?.executiveSummary.substring(0, 100)}`;
            } else {
                alert('속성(프롬프트) 정보가 비어있습니다. "자동 생성"을 먼저 누르거나 직접 입력해주세요.');
                return;
            }
        }

        setIsArtGenerating(type);
        try {
            const aspectRatio = type === 'banner' ? '16:9' : '1:1';
            const result = await generateImage(prompt, geminiApiKey, undefined, aspectRatio);
            if (result.urls?.[0]) {
                setChannelIdentity(prev => ({ ...prev, [type === 'banner' ? 'bannerUrl' : 'profileUrl']: result.urls[0] }));
                setSaveStatus('idle');
            } else {
                alert('이미지 생성에 실패했습니다. 구글 서버 상태를 확인해주세요.');
            }
        } catch (error: any) {
            console.error('Art generation failed:', error);
            alert(`이미지 생성 오류: ${error.message}`);
        } finally {
            setIsArtGenerating(null);
        }
    };

    const handlePromoteToProject = async (series: any, episode?: any) => {
        if (saveStatus !== 'saved' && strategyResult) saveStrategyInsight(strategyResult);
        const newProjectId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const currentApiKeys = useWorkflowStore.getState().apiKeys;
        const { resetToDefault, saveProject } = useWorkflowStore.getState();
        resetToDefault();
        setProjectInfo({
            id: newProjectId, apiKeys: currentApiKeys, seriesName: series.title, seriesStory: series.description,
            episodeName: episode?.ideaTitle || 'New Episode', episodePlot: episode?.oneLiner || '',
            lastModified: Date.now(), currentStep: 1,
            trendInsights: {
                target: series.expectedAudience, vibe: episode?.angle || '',
                references: series.benchmarkVideos || [], storytelling: episode?.notes || '', appliedAt: Date.now()
            }
        });
        setScript([]);
        await saveProject();
        navigate('/step/1');
    };

    const renderSelectionArea = () => {
        const isCompact = !!strategyResult;

        return (
            <div className={`space-y-4 transition-all duration-500 ${isCompact ? 'bg-white/5 p-4 rounded-2xl border border-white/10' : ''}`}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <LayoutGrid size={20} className="text-[var(--color-primary)]" />
                        분석된 경쟁 데이터 선택
                    </h2>
                    {isCompact && (
                        <span className="text-[10px] text-gray-500 font-medium">선택됨: {selectedCompetitor?.summary.substring(0, 30)}...</span>
                    )}
                </div>

                <div className={`${isCompact ? 'flex gap-3 overflow-x-auto pb-2 no-scrollbar' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                    {competitors.length === 0 ? (
                        <div className="col-span-full h-40 flex flex-col items-center justify-center text-gray-500 border border-dashed border-[var(--color-border)] rounded-xl bg-white/5">
                            <Target className="mb-2 opacity-30" size={32} />
                            <p>분석된 경쟁자 스냅샷이 없습니다.</p>
                            <button onClick={() => navigate('/research/competitor')} className="mt-2 text-[var(--color-primary)] hover:underline text-sm">
                                Phase 2에서 경쟁 분석을 먼저 수행하세요
                            </button>
                        </div>
                    ) : (
                        competitors.map(comp => (
                            <div
                                key={comp.id}
                                onClick={() => handleSelectCompetitor(comp)}
                                className={`rounded-xl border transition-all cursor-pointer relative group flex-shrink-0 ${isCompact ? 'w-64 p-3' : 'p-4'} ${selectedCompetitor?.id === comp.id
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]'
                                    : 'border-[var(--color-border)] bg-white/5 hover:border-white/30'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] text-gray-500">{new Date(comp.createdAt).toLocaleDateString()}</span>
                                    <div className="flex items-center gap-2">
                                        {selectedCompetitor?.id === comp.id && <CheckCircle2 className="text-[var(--color-primary)]" size={16} />}
                                    </div>
                                </div>
                                <h3 className={`text-white font-bold mb-1 ${isCompact ? 'text-sm line-clamp-1' : 'line-clamp-1'}`}>{comp.summary || '경쟁자 심층 분석'}</h3>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderStrategyDashboard = () => {
        if (!selectedCompetitor) return null;
        if (!strategyResult) {
            return (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
                    <Sparkles size={48} className="text-[var(--color-primary)] animate-pulse" />
                    <h3 className="text-2xl font-bold text-white">전략 컨설팅 준비 완료</h3>
                    <button onClick={handleGenerateStrategy} disabled={isGenerating || !geminiApiKey} className="px-10 py-4 bg-[var(--color-primary)] text-black font-bold rounded-2xl hover:scale-105 transition-all flex items-center gap-3 shadow-xl shadow-[var(--color-primary)]/20">
                        {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <BrainCircuit size={24} />}
                        <span>전략 수립 시작</span>
                    </button>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full bg-[#0A0A0A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="bg-[#151515] border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {['report', 'summary', 'pillars', 'series', 'episodes', 'identity'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize ${activeTab === tab ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {tab === 'report' ? 'Full Report' : tab}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${saveStatus === 'saved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                            {saveStatus === 'saved' ? '저장됨' : '저장 필요'}
                        </div>

                        {/* Export Menu */}
                        <div className="relative group">
                            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 text-xs border border-white/10 transition-all font-bold">
                                <Save size={14} />
                                내보내기
                            </button>
                            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-48 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                <button
                                    onClick={() => ResearchReporter.exportToDocx(strategyResult!)}
                                    className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    Word (.docx)
                                </button>
                                <button
                                    onClick={() => ResearchReporter.exportToPptx(strategyResult!)}
                                    className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    PowerPoint (.pptx)
                                </button>
                                <button
                                    onClick={() => ResearchReporter.exportToPdf(strategyResult!)}
                                    className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    PDF (.pdf)
                                </button>
                            </div>
                        </div>

                        <button onClick={handleSaveStrategy} disabled={saveStatus !== 'idle'} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${saveStatus === 'saved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[var(--color-primary)] text-black hover:opacity-90'}`}>
                            <Save size={14} /> {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '완료' : '전체 저장'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-gradient-to-b from-[#111] to-black">
                    <div className="max-w-4xl mx-auto space-y-16">
                        {activeTab === 'report' && (
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 bg-white/[0.02] p-12 rounded-[48px] border border-white/5 shadow-2xl">
                                <div className="text-center space-y-4 mb-16">
                                    <div className="inline-block px-4 py-1.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-black uppercase tracking-widest rounded-full mb-4">Strategic Intelligence Report</div>
                                    <h1 className="text-5xl font-black text-white tracking-tight">{channelIdentity.channelName || 'YouTube Strategy'}</h1>
                                    <p className="text-gray-500 font-medium">Generated by Gemini AI • {new Date(strategyResult.createdAt).toLocaleDateString()}</p>
                                </div>

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">1. Executive Summary</h2>
                                    <p className="text-xl text-gray-300 leading-relaxed italic border-l-4 border-[var(--color-primary)] pl-6">"{strategyResult.executiveSummary}"</p>
                                </section>

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">2. Strategic Pillars</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {strategyResult.recommendedPillars.map((p, i) => (
                                            <div key={i} className="bg-white/5 p-6 rounded-2xl">
                                                <h3 className="font-bold text-[var(--color-primary)] mb-2">{p.pillarName}</h3>
                                                <p className="text-sm text-gray-400">{p.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">3. Recommended Series</h2>
                                    {strategyResult.recommendedSeries.map((s, i) => (
                                        <div key={i} className="bg-white/5 p-8 rounded-3xl space-y-4">
                                            <h3 className="text-2xl font-bold text-white">{s.title}</h3>
                                            <p className="text-gray-400">{s.description}</p>
                                            <div className="flex gap-4 text-xs font-bold text-[var(--color-primary)] uppercase">
                                                <span>Pillar: {s.targetPillar}</span>
                                                <span className="text-gray-600">|</span>
                                                <span>Audience: {s.expectedAudience}</span>
                                            </div>
                                        </div>
                                    ))}
                                </section>

                                <div className="h-px bg-white/5 my-12" />
                                <div className="text-center text-gray-600 text-[10px] uppercase tracking-widest">End of Intelligence Report</div>
                            </div>
                        )}

                        {activeTab === 'summary' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <h3 className="text-3xl font-black text-white">Executive Strategy Summary</h3>
                                <div className="p-8 bg-white/5 border-l-4 border-[var(--color-primary)] rounded-r-2xl text-xl text-gray-200 leading-relaxed italic">
                                    "{strategyResult.executiveSummary}"
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-green-500/5 border border-green-500/20 p-6 rounded-3xl">
                                        <h4 className="text-green-400 font-bold flex items-center gap-2 mb-4"><Zap size={20} /> 핵심 기회 요인</h4>
                                        <ul className="space-y-2">
                                            {strategyResult.keyOpportunities.map((item, i) => (
                                                <li key={i} className="text-gray-300 text-sm flex gap-2">
                                                    <span className="text-green-500">•</span> {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-3xl">
                                        <h4 className="text-red-400 font-bold flex items-center gap-2 mb-4"><ShieldAlert size={20} /> 주요 리스크</h4>
                                        <ul className="space-y-2">
                                            {strategyResult.keyRisks.map((item, i) => (
                                                <li key={i} className="text-gray-300 text-sm flex gap-2">
                                                    <span className="text-red-500">•</span> {item}
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
                                    <div key={i} className="bg-white/5 border border-white/10 p-8 rounded-3xl relative overflow-hidden group hover:border-[var(--color-primary)]/30 transition-all">
                                        <div className="absolute -top-4 -right-4 opacity-[0.03] group-hover:opacity-[0.1] transition-opacity">
                                            <Target size={160} />
                                        </div>
                                        <div className="text-[var(--color-primary)] font-bold text-xs uppercase tracking-widest mb-3">Pillar 0{i + 1}</div>
                                        <h3 className="text-xl font-bold text-white mb-4">{pillar.pillarName}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{pillar.reason}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeTab === 'episodes' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-2xl font-bold text-white">Recommended Episodes</h3>
                                    <button onClick={handleSaveAllToPool} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold border border-white/10 transition-all flex items-center gap-2">
                                        <BookmarkPlus size={14} /> 전체 아이디어 담기
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {strategyResult.recommendedEpisodes.map((episode, i) => (
                                        <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl flex items-center justify-between group hover:bg-white/[0.07] transition-all">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold rounded">Idea 0{i + 1}</span>
                                                    <span className="text-gray-500 text-[10px] font-bold uppercase">{episode.format}</span>
                                                </div>
                                                <h4 className="text-lg font-bold text-white">{episode.ideaTitle}</h4>
                                                <p className="text-sm text-gray-400">{episode.oneLiner}</p>
                                            </div>
                                            <button
                                                onClick={() => handleSaveToPool(episode, strategyResult.recommendedSeries[0])}
                                                className="p-3 bg-white/5 text-gray-400 rounded-xl hover:bg-[var(--color-primary)] hover:text-black transition-all"
                                                title="아이디어 풀에 담기"
                                            >
                                                <BookmarkPlus size={20} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Additional Tab Content Renders Here - Keeping it concise for fix */}
                        {activeTab === 'series' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                {strategyResult.recommendedSeries.map((series, i) => (
                                    <div key={i} className="bg-white/5 border border-white/10 rounded-[32px] p-10 flex flex-col lg:flex-row gap-10">
                                        <div className="flex-1 space-y-6">
                                            <h3 className="text-3xl font-black text-white">{series.title}</h3>
                                            <p className="text-lg text-gray-400">{series.description}</p>
                                        </div>
                                        <button onClick={() => handlePromoteToProject(series)} className="px-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-[var(--color-primary)] transition-all flex items-center gap-3">
                                            <Rocket size={24} /> 제작 시작
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeTab === 'identity' && (
                            <div className="space-y-12 animate-in fade-in duration-300">
                                <div className="bg-white/5 border border-white/10 p-10 rounded-[32px]">
                                    <div className="flex justify-between items-center mb-10">
                                        <h3 className="text-3xl font-black text-white flex items-center gap-3"><Palette className="text-[var(--color-primary)]" /> Brand Identity</h3>
                                        <button onClick={handleGenerateIdentityText} disabled={isIdentityGenerating} className="px-6 py-3 bg-[var(--color-primary)] text-black rounded-2xl flex items-center gap-3 font-black text-sm">
                                            {isIdentityGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />} 자동 생성
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 text-white">
                                        <div className="space-y-6">
                                            <label className="block text-xs text-gray-400 uppercase font-black">Channel Name</label>
                                            <input value={channelIdentity.channelName} onChange={e => setChannelIdentity(p => ({ ...p, channelName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl font-black" />
                                            <label className="block text-xs text-gray-400 uppercase font-black">Bio</label>
                                            <textarea value={channelIdentity.bio} onChange={e => setChannelIdentity(p => ({ ...p, bio: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 h-32" />
                                        </div>
                                        <div className="space-y-6">
                                            <div className="aspect-[3/1] bg-white/5 border border-white/10 rounded-[32px] overflow-hidden relative">
                                                {channelIdentity.bannerUrl ? <img src={channelIdentity.bannerUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><ImageIcon size={48} /></div>}
                                                <div className="absolute bottom-4 left-4 flex items-center gap-4">
                                                    <div className="w-16 h-16 rounded-full border-2 border-black bg-gray-800 overflow-hidden">
                                                        {channelIdentity.profileUrl ? <img src={channelIdentity.profileUrl} className="w-full h-full object-cover" /> : <User className="w-full h-full p-4" />}
                                                    </div>
                                                    <div className="font-black text-lg drop-shadow-lg">{channelIdentity.channelName || 'Name'}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <button onClick={() => handleGenerateArt('profile')} disabled={isArtGenerating === 'profile'} className="flex-1 py-3 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-inner">
                                                    {isArtGenerating === 'profile' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                    컨셉 생성 (Profile)
                                                </button>
                                                <button onClick={() => handleGenerateArt('banner')} disabled={isArtGenerating === 'banner'} className="flex-1 py-3 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-inner">
                                                    {isArtGenerating === 'banner' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                    컨셉 생성 (Banner)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-16 pt-12 border-t border-white/5 flex flex-col lg:flex-row items-center justify-between gap-10 bg-[var(--color-primary)]/5 p-12 rounded-[40px]">
                            <h3 className="text-3xl font-black text-white flex items-center gap-4"><Lightbulb className="text-[var(--color-primary)]" size={36} /> 전략 실행 포인트</h3>
                            <button onClick={() => navigate('/research/ideas')} className="px-10 py-5 bg-[var(--color-primary)] text-black font-black rounded-[24px] flex items-center gap-3">아이디어 관리 시작 <ChevronRight /></button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-[#0A0A0A]">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0F0F0F]">
                <div>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-primary)] font-bold uppercase tracking-widest mb-1"><TrendingUp size={14} /> Intelligence Layer</div>
                    <h1 className="text-xl font-bold text-white leading-none">Phase 3 : AI Strategic Planning</h1>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/research/competitor')}
                        className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm"
                    >
                        <ArrowLeft size={16} />
                        경쟁 분석 (P2)
                    </button>
                    <button
                        onClick={() => navigate('/research/ideas')}
                        disabled={!strategyResult}
                        className="px-5 py-2 bg-white/10 text-white font-bold rounded-lg hover:bg-[var(--color-primary)] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-all"
                    >
                        아이디어 풀 (Next)
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="w-[400px] border-r border-white/5 flex flex-col bg-black/40 backdrop-blur-sm">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Bot size={24} className="text-[var(--color-primary)]" />
                            <h3 className="font-bold text-sm">AI 전략기획팀장</h3>
                        </div>
                        <button onClick={() => setChatMessages([])}><RotateCw size={14} className="text-gray-500" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-[var(--color-primary)] text-black' : 'bg-white/10 text-gray-200'}`}>
                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-white/5">
                        <form onSubmit={handleChatSubmit} className="relative">
                            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="전략 제안..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[var(--color-primary)] outline-none" />
                            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[var(--color-primary)] text-black rounded-lg"><Send size={16} /></button>
                        </form>
                    </div>
                </div>

                <div className="flex-1 flex flex-col h-full bg-black overflow-hidden p-8 space-y-8 custom-scrollbar">
                    {renderSelectionArea()}
                    {renderStrategyDashboard()}
                </div>
            </div>
        </div>
    );
};
