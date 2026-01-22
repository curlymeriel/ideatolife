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
    Lightbulb,
    Zap,
    ShieldAlert,
    ArrowLeft,
    ArrowRight,
    Save,
    Sparkles,
    BookmarkPlus,
    BrainCircuit,
    ChevronRight,
    Send,
    Bot,
    TrendingUp,
    User,
    RotateCw,
    Palette,
    Image as ImageIcon,
    Wand2,
    Trophy,
    MessageSquare,
    Maximize2
} from 'lucide-react';
import { generateStrategyInsight, generateText } from '../services/gemini';
import type { CompetitorSnapshot, StrategyInsight } from '../store/types';
import { ChannelArtModal } from '../components/ChannelArtModal';

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
    const [strategyHistory, setStrategyHistory] = useState<StrategyInsight[]>([]);
    const [activeTab, setActiveTab] = useState<'report' | 'summary' | 'pillars' | 'series' | 'episodes' | 'characters' | 'techStack' | 'marketing' | 'identity' | 'references'>('summary');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Branding / Identity State
    const [channelIdentity, setChannelIdentity] = useState({
        channelName: '',
        handle: '',
        bio: '',
        mission: '',
        targetAudience: '',
        toneOfVoice: '',
        slogan: '',
        coreValues: [] as string[],
        colorPalette: [] as string[],
        bannerPrompt: '',
        bannerUrl: '',
        profilePrompt: '',
        profileUrl: '',
        seoTags: [] as string[],
        hashtags: [] as string[],
        introText: ''
    });
    const [isIdentityGenerating, setIsIdentityGenerating] = useState(false);
    const [showArtModal, setShowArtModal] = useState<'banner' | 'profile' | null>(null);

    // Chat State
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model', text: string }>>([
        { role: 'model', text: '안녕하세요! 전략기획팀장입니다. 분석된 경쟁사 데이터를 바탕으로 우리 채널의 차별화된 전략을 수립해 드릴까요?' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isChatProcessing, setIsChatProcessing] = useState(false);

    // Restoration and URL Selection Effect
    React.useEffect(() => {
        if (!isHydrated) return;

        // 1. Auto-selection from URL (snapshotId is trendSnapshotId from Phase 2)
        if (snapshotId && (!selectedCompetitor || selectedCompetitor.trendSnapshotId !== snapshotId)) {
            // Find competitor snapshot that matches this trend snapshot ID
            const found = Object.values(competitorSnapshots).find(c => c.trendSnapshotId === snapshotId);
            if (found) {
                console.log(`[Strategy] Auto-selecting competitor from trend snapshot URL: ${snapshotId}`);
                setSelectedCompetitor(found);
            }
        }

        // 2. Data Restoration (Find all versions for this competitor)
        if (selectedCompetitor) {
            const allVersions = Object.values(strategyInsights)
                .filter(s => s.competitorSnapshotId === selectedCompetitor.id)
                .sort((a, b) => b.createdAt - a.createdAt);

            setStrategyHistory(allVersions);

            if (allVersions.length > 0) {
                // If we don't have a result selected yet, or if we switched competitors, pick the latest
                if (!strategyResult || strategyResult.competitorSnapshotId !== selectedCompetitor.id) {
                    const latest = allVersions[0];
                    setStrategyResult(latest);
                    restoreIdentity(latest);
                }
                setSaveStatus('saved');
            } else {
                if (!isGenerating) {
                    setStrategyResult(null);
                    setSaveStatus('idle');
                    resetIdentity();
                }
            }
        }
    }, [isHydrated, snapshotId, selectedCompetitor, strategyInsights]);

    const restoreIdentity = (insight: StrategyInsight) => {
        const identity = insight.channelIdentity;
        setChannelIdentity({
            channelName: identity?.channelName || '',
            handle: identity?.handle || '',
            bio: identity?.bio || '',
            mission: (identity as any)?.mission || '',
            targetAudience: (identity as any)?.targetAudience || '',
            toneOfVoice: (identity as any)?.toneOfVoice || '',
            slogan: (identity as any)?.slogan || '',
            coreValues: (identity as any)?.coreValues || [],
            colorPalette: identity?.colorPalette || [],
            bannerPrompt: identity?.bannerPrompt || '',
            bannerUrl: identity?.bannerUrl || '',
            profilePrompt: identity?.profilePrompt || '',
            profileUrl: identity?.profileUrl || '',
            seoTags: identity?.seoTags || [],
            hashtags: identity?.hashtags || [],
            introText: identity?.introText || ''
        });
    };

    const resetIdentity = () => {
        setChannelIdentity({
            channelName: '', handle: '', bio: '', mission: '', targetAudience: '', toneOfVoice: '',
            slogan: '', coreValues: [],
            colorPalette: [], bannerPrompt: '', bannerUrl: '', profilePrompt: '', profileUrl: '',
            seoTags: [], hashtags: [], introText: ''
        });
    };

    const handleSelectCompetitor = (comp: CompetitorSnapshot) => {
        setSelectedCompetitor(comp);
        // Provide a kickoff message in chat when a competitor is selected
        setChatMessages([
            { role: 'model', text: `입력하신 '${comp.summary}' 분석 데이터를 확인했습니다. 이 기반으로 어떤 방향의 채널을 기획하고 싶으신가요? (예: 타겟 시청자 변경, 특정 콘텐츠 스타일 강조 등)` }
        ]);
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
                notes: episode.notes,
                seriesTitle: series.title,
                seriesDescription: series.description,
                characters: strategyResult?.characters || []
            }
        });
    };

    const handleSaveAllToPool = () => {
        if (!strategyResult) return;
        let count = 0;
        // NEW: Iterate over each series, then its nested episodes
        strategyResult.recommendedSeries.forEach(series => {
            (series.episodes || []).forEach(episode => {
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
                        category: series.title, // Correct parent series
                        status: 'pending',
                        metadata: {
                            targetAudience: series.expectedAudience,
                            angle: episode.angle,
                            format: episode.format,
                            notes: episode.notes,
                            seriesTitle: series.title,
                            seriesDescription: series.description,
                            characters: strategyResult.characters || []
                        }
                    });
                    count++;
                }
            });
        });
        if (count > 0) alert(`${count}개의 아이디어가 아이디어 풀에 저장되었습니다.`);
        else alert('이미 모든 아이디어가 저장되어 있습니다.');
    };

    const handleGenerateStrategy = async (mode: 'new' | 'overwrite' = 'new') => {
        if (!selectedCompetitor || !geminiApiKey) return;
        setIsGenerating(true);
        try {
            const trendSnapshot = trendSnapshots[selectedCompetitor.trendSnapshotId || ''];
            // Pass chatMessages to allow generation based on discussion
            const result = await generateStrategyInsight(
                trendSnapshot || { queryContext: 'Unknown', keywords: [], description: '' },
                selectedCompetitor,
                geminiApiKey,
                chatMessages.length > 1 ? chatMessages : undefined
            );

            // Create new ID if 'new' mode, else use existing
            const targetId = mode === 'new' || !strategyResult
                ? `strategy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
                : strategyResult.id;

            const newInsight = {
                ...result,
                id: targetId,
                competitorSnapshotId: selectedCompetitor.id,
                createdAt: mode === 'new' ? Date.now() : strategyResult?.createdAt || Date.now(),
                channelIdentity: mode === 'overwrite' ? channelIdentity : result.channelIdentity
            };

            setStrategyResult(newInsight);
            saveStrategyInsight(newInsight);
            setActiveTab('report');
            setSaveStatus('saved');

            // Feedback in chat
            const msg = mode === 'new'
                ? '성공적으로 **새로운 버전**의 전략 보고서가 생성되었습니다.'
                : '현재 보고서가 대화 내용을 바탕으로 **업데이트(Overwrite)** 되었습니다.';
            setChatMessages(prev => [...prev, { role: 'model', text: msg }]);
        } catch (error) {
            console.error('Strategy generation failed:', error);
            alert('전략 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeleteVersion = (id: string) => {
        if (!window.confirm('이전 버전의 전략을 삭제하시겠습니까?')) return;
        deleteStrategyInsight(id);

        // If we deleted the active one, pick another
        if (strategyResult?.id === id) {
            const remaining = strategyHistory.filter(s => s.id !== id);
            if (remaining.length > 0) {
                setStrategyResult(remaining[0]);
                restoreIdentity(remaining[0]);
            } else {
                setStrategyResult(null);
                resetIdentity();
            }
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
        console.log('[Chat] 1. handleChatSubmit called');
        console.log('[Chat] 2. chatInput:', chatInput, 'geminiApiKey:', !!geminiApiKey, 'isChatProcessing:', isChatProcessing);
        if (!chatInput.trim() || !geminiApiKey || isChatProcessing) {
            console.log('[Chat] 3. Early return - conditions not met');
            return;
        }
        const userMessage = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setIsChatProcessing(true);
        console.log('[Chat] 4. Starting API call with message:', userMessage);
        try {
            // TRIMMED CONTEXT: Only include essential summaries, not full data objects
            const context = {
                trendSummary: selectedCompetitor ? (trendSnapshots[selectedCompetitor.trendSnapshotId || '']?.queryContext || 'N/A') : null,
                competitorSummary: selectedCompetitor?.summary || 'N/A',
                competitorFocusKeywords: selectedCompetitor?.focusKeywords?.slice(0, 5) || [],
                currentStrategyTitle: strategyResult?.executiveSummary?.substring(0, 200) || 'N/A',
                ideaPoolCount: ideaPool.length
            };
            const systemPrompt = `당신은 'AI 전략기획팀장'입니다. 경쟁 분석 데이터를 바탕으로 유튜브 채널 성장 전략을 수립합니다. 현재 컨텍스트: ${JSON.stringify(context)}`;
            console.log('[Chat] 5. Calling generateText...');
            const response = await generateText(userMessage, geminiApiKey, undefined, undefined, systemPrompt);
            console.log('[Chat] 6. Response received:', response?.substring(0, 100));
            setChatMessages(prev => [...prev, { role: 'model', text: response }]);

            // If the AI suggests updating the strategy, provide a call to action
            if (response.includes('보고서') || response.includes('전략') || response.includes('반영')) {
                setChatMessages(prev => [...prev, {
                    role: 'model',
                    text: '💡 논의된 내용을 바탕으로 오른쪽의 전략 보고서를 업데이트하시겠습니까?'
                }]);
            }
        } catch (error: any) {
            console.error('[Chat] 7. ERROR:', error);
            setChatMessages(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${error?.message || 'Unknown error'}` }]);
        } finally {
            console.log('[Chat] 8. Finally block - setting isChatProcessing to false');
            setIsChatProcessing(false);
        }
    };

    const handleGenerateIdentityText = async () => {
        if (!geminiApiKey || !strategyResult) return;
        setIsIdentityGenerating(true);
        try {
            const prompt = `Based on the following strategy, generate a comprehensive YouTube channel branding set.
            The branding MUST feel premium, professional, and strategic.
            
            Strategy Summary: ${strategyResult.executiveSummary}
            Key Opportunities: ${strategyResult.keyOpportunities.join(', ')}
            Strategic Pillars: ${strategyResult.recommendedPillars.map(p => p.pillarName).join(', ')}
            
            Return a JSON object with these EXACT fields:
            {
                "channelName": "Creative name that stands out",
                "handle": "unique_handle",
                "bio": "Compelling 150-char bio that hooks viewers",
                "mission": "Core purpose and value proposition of the channel (1-2 sentences)",
                "targetAudience": "Detailed description of who we are targeting and why (2-3 sentences)",
                "toneOfVoice": "Personality and style of communication (e.g., Wit with Professionalism, Friendly Expert, Bold Disruptor)",
                "colorPalette": ["Hex code 1", "Hex code 2", "Hex code 3"],
                "bannerPrompt": "High-quality professional image generation prompt for a YouTube banner background",
                "profilePrompt": "High-quality professional image generation prompt for a profile icon",
                "seoTags": ["keyword1", "keyword2", "keyword3"],
                "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
                "introText": "A professional channel welcome/about script including a hook, mission, and call to action"
            }`;

            // Pass 'application/json' as the 3rd argument (responseMimeType)
            const text = await generateText(prompt, geminiApiKey, "application/json");

            // Robust JSON parsing (strip markdown code blocks if present)
            let cleanedText = text.trim();
            if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/```$/, '').trim();
            }

            const result = JSON.parse(cleanedText);

            setChannelIdentity(prev => ({
                ...prev,
                ...result
            }));
            setSaveStatus('idle');
        } catch (error) {
            console.error('Branding generation failed:', error);
            alert('브랜딩 자동 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsIdentityGenerating(false);
        }
    };

    const handleGenerateArt = async (type: 'banner' | 'profile') => {
        setShowArtModal(type);
    };

    const handleSaveArt = (url: string, artPrompt: string) => {
        const type = showArtModal;
        if (!type) return;

        setChannelIdentity(prev => ({
            ...prev,
            [type === 'banner' ? 'bannerUrl' : 'profileUrl']: url,
            [type === 'banner' ? 'bannerPrompt' : 'profilePrompt']: artPrompt
        }));
        setSaveStatus('idle');
        setShowArtModal(null);
    };

    const handlePromoteToProject = async (series: any, episode?: any) => {
        if (saveStatus !== 'saved' && strategyResult) saveStrategyInsight(strategyResult);
        const newProjectId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const currentApiKeys = useWorkflowStore.getState().apiKeys;
        const { resetToDefault, saveProject } = useWorkflowStore.getState();
        resetToDefault();
        setProjectInfo({
            id: newProjectId, apiKeys: currentApiKeys,
            seriesName: series.title,
            seriesStory: series.description,
            episodeName: episode?.ideaTitle || 'New Episode',
            episodePlot: episode?.oneLiner || '',
            characters: strategyResult?.characters || [],
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
                                className={`rounded-xl border transition-all cursor-pointer relative group flex-shrink-0 ${isCompact ? 'w-[512px] p-4' : 'p-4'} ${selectedCompetitor?.id === comp.id
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
        if (!selectedCompetitor) {
            return (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
                    <Target size={48} className="text-gray-600 opacity-20" />
                    <h3 className="text-xl font-bold text-gray-500">분석된 경쟁 데이터(Snapshot)를 먼저 선택해주세요.</h3>
                    <p className="text-sm text-gray-600">위의 리스트에서 분석을 진행할 항목을 클릭하면 전략 수립이 가능합니다.</p>
                </div>
            );
        }
        if (!strategyResult) {
            return (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
                    <Sparkles size={48} className="text-[var(--color-primary)] animate-pulse" />
                    <h3 className="text-2xl font-bold text-white">전략 컨설팅 준비 완료</h3>
                    <button onClick={() => handleGenerateStrategy('new')} disabled={isGenerating || !geminiApiKey} className="px-10 py-4 bg-[var(--color-primary)] text-black font-bold rounded-2xl hover:scale-105 transition-all flex items-center gap-3 shadow-xl shadow-[var(--color-primary)]/20">
                        {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <BrainCircuit size={24} />}
                        <span>전략 수립 시작</span>
                    </button>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full bg-[#0A0A0A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="bg-[#151515] border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Version Selector */}
                        {strategyHistory.length > 0 && (
                            <div className="flex items-center gap-1 pr-4 mr-4 border-r border-white/10 shrink-0">
                                <span className="text-[10px] text-gray-500 font-bold uppercase whitespace-nowrap">Versions:</span>
                                {strategyHistory.map((v, i) => (
                                    <div key={v.id} className="relative group/v">
                                        <button
                                            onClick={() => {
                                                setStrategyResult(v);
                                                restoreIdentity(v);
                                            }}
                                            className={`w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-black transition-all ${strategyResult?.id === v.id ? 'bg-[var(--color-primary)] text-black ring-2 ring-[var(--color-primary)]/50' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                            title={new Date(v.createdAt).toLocaleString()}
                                        >
                                            {strategyHistory.length - i}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.id); }}
                                            className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover/v:opacity-100 transition-opacity hover:scale-125"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                            {['report', 'summary', 'pillars', 'series', 'episodes', 'characters', 'techStack', 'marketing', 'identity', 'references'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all capitalize whitespace-nowrap ${activeTab === tab ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    {tab === 'report' ? 'Full Report' : tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        {/* Export Menu */}
                        <div className="relative group">
                            <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 text-[10px] border border-white/10 transition-all font-bold h-8">
                                <Save size={12} />
                                내보내기
                            </button>
                            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-40 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                <button
                                    onClick={() => ResearchReporter.exportToDocx(strategyResult!)}
                                    className="w-full text-left px-3 py-2 hover:bg-white/5 text-[10px] text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    Word (.docx)
                                </button>
                                <button
                                    onClick={() => ResearchReporter.exportToPptx(strategyResult!)}
                                    className="w-full text-left px-3 py-2 hover:bg-white/5 text-[10px] text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    PowerPoint (.pptx)
                                </button>
                                <button
                                    onClick={() => ResearchReporter.exportToPdf(strategyResult!)}
                                    className="w-full text-left px-3 py-2 hover:bg-white/5 text-[10px] text-gray-300 hover:text-white flex items-center gap-2"
                                >
                                    PDF (.pdf)
                                </button>
                            </div>
                        </div>

                        <button onClick={handleSaveStrategy} disabled={saveStatus !== 'idle'} className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-[10px] font-bold transition-all h-8 ${saveStatus === 'saved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[var(--color-primary)] text-black hover:opacity-90'}`}>
                            <Save size={12} /> {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '완료' : '전체 저장'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-gradient-to-b from-[#111] to-black">
                    <div className="max-w-7xl mx-auto space-y-16">
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
                                    <div className="space-y-6">
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
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">4. Episode Recommendations</h2>
                                    {strategyResult.recommendedSeries.map((series, sIdx) => (
                                        <div key={series.id || sIdx} className="space-y-4">
                                            <h3 className="text-lg font-bold text-indigo-400">{series.title}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {(series.episodes || []).map((ep, i) => (
                                                    <div key={ep.id || i} className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                                        <div className="text-[var(--color-primary)] font-black text-xs mb-2 uppercase tracking-tighter">Ep.{i + 1} • {ep.format}</div>
                                                        <h4 className="text-lg font-bold text-white mb-2">{ep.ideaTitle}</h4>
                                                        <p className="text-sm text-gray-400 mb-4 line-clamp-2 italic">"{ep.oneLiner}"</p>
                                                        <div className="mt-4 flex justify-end">
                                                            <button
                                                                onClick={() => handlePromoteToProject(series, ep)}
                                                                className="px-3 py-1.5 bg-[var(--color-primary)] text-black text-[10px] font-black rounded-lg flex items-center gap-2 hover:scale-105 transition-all"
                                                            >
                                                                <Rocket size={12} /> 제작 시작
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </section>

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">5. Channel Brand Identity</h2>
                                    <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-10 rounded-[40px] border border-white/10">
                                        <div className="flex flex-col md:flex-row gap-10 items-center mb-10">
                                            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[var(--color-primary)] shadow-2xl flex-shrink-0 bg-white/5">
                                                {channelIdentity.profileUrl ? <img src={channelIdentity.profileUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-700 font-black text-4xl">{channelIdentity.channelName?.charAt(0)}</div>}
                                            </div>
                                            <div className="flex-1 text-center md:text-left">
                                                <h3 className="text-4xl font-black text-white mb-1">{channelIdentity.channelName || 'Unset Name'}</h3>
                                                <div className="text-[var(--color-primary)] font-bold mb-2 tracking-widest uppercase text-xs italic">
                                                    {(channelIdentity as any).slogan || 'Slogan undefined'}
                                                </div>
                                                <div className="text-[var(--color-primary)] font-mono text-xl mb-4">@{channelIdentity.handle || 'handle'}</div>
                                                <p className="text-gray-300 text-lg leading-relaxed max-w-2xl">{channelIdentity.bio}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="bg-black/40 p-6 rounded-2xl">
                                                <h4 className="text-[10px] text-gray-400 font-black uppercase mb-3">Core Mission</h4>
                                                <p className="text-xs text-white font-medium leading-relaxed">{(channelIdentity as any).mission || '핵심 가치가 정의되지 않았습니다.'}</p>
                                            </div>
                                            <div className="bg-black/40 p-6 rounded-2xl">
                                                <h4 className="text-[10px] text-gray-400 font-black uppercase mb-3">Tone of Voice</h4>
                                                <p className="text-xs text-white font-medium italic">{(channelIdentity as any).toneOfVoice || '소통 스타일이 정의되지 않았습니다.'}</p>
                                            </div>
                                            <div className="bg-black/40 p-6 rounded-2xl">
                                                <h4 className="text-[10px] text-gray-400 font-black uppercase mb-3">Core Values</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {(channelIdentity as any).coreValues?.map((val: string, i: number) => (
                                                        <span key={i} className="px-2 py-1 bg-white/5 text-[10px] text-gray-400 rounded-md border border-white/10">{val}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="bg-black/40 p-6 rounded-2xl md:col-span-3">
                                                <h4 className="text-[10px] text-gray-400 font-black uppercase mb-3">Brand Introduction</h4>
                                                <p className="text-xs text-gray-400 leading-relaxed italic border-t border-white/5 pt-3 mt-1">
                                                    {channelIdentity.introText || '인트로 텍스트가 생성되지 않았습니다.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {strategyResult.characters && strategyResult.characters.length > 0 && (
                                    <section className="space-y-6">
                                        <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">6. Character Personas</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {strategyResult.characters.map((char, i) => (
                                                <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-xl font-bold text-[var(--color-primary)]">{char.name}</h3>
                                                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-gray-400 font-bold tracking-widest">{char.role}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-300 leading-relaxed font-medium">{char.personality}</p>
                                                    <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                                                        <div className="text-[10px] text-gray-500 font-black uppercase mb-2 tracking-widest text-center">Visual Prompt Guide</div>
                                                        <p className="text-[10px] text-gray-400 leading-relaxed italic">{char.visualGuide}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {strategyResult.techStack && strategyResult.techStack.length > 0 && (
                                    <section className="space-y-6">
                                        <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">7. Recommended AI Tech Stack</h2>
                                        <div className="overflow-hidden rounded-2xl border border-white/10">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-white/5 text-gray-500 font-black uppercase tracking-widest">
                                                    <tr>
                                                        <th className="px-6 py-4">Phase</th>
                                                        <th className="px-6 py-4">Tool</th>
                                                        <th className="px-6 py-4">Usage</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5 bg-black/20">
                                                    {strategyResult.techStack.map((item, i) => (
                                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-[var(--color-primary)]">{item.phase}</td>
                                                            <td className="px-6 py-4 text-white font-medium">{item.tool}</td>
                                                            <td className="px-6 py-4 text-gray-400 italic">{item.usage}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                )}

                                {strategyResult.marketingStrategy && (
                                    <section className="space-y-6">
                                        <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">8. Marketing & KPI Strategy</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="bg-gradient-to-br from-indigo-500/10 to-transparent p-8 rounded-3xl border border-indigo-500/20">
                                                <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2"><Trophy size={18} className="text-yellow-500" /> Target KPIs</h3>
                                                <ul className="space-y-4">
                                                    {strategyResult.marketingStrategy.kpis.map((kpi, i) => (
                                                        <li key={i} className="flex items-center gap-3 text-sm text-gray-300">
                                                            <div className="w-2 h-2 rounded-full bg-indigo-500" /> {kpi}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-gradient-to-br from-pink-500/10 to-transparent p-8 rounded-3xl border border-pink-500/20">
                                                <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2"><Sparkles size={18} className="text-pink-500" /> Viral Elements</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {strategyResult.marketingStrategy.viralElements.map((v, i) => (
                                                        <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 font-medium">{v}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                <section className="space-y-6">
                                    <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4">9. Strategic Research References</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {selectedCompetitor.competitorChannels.slice(0, 3).map((ch, i) => (
                                            <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                                                <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-white truncate">{ch.channelName}</div>
                                                    <div className="text-[10px] text-gray-500">Subs: {(ch.subscriberCount / 10000).toFixed(1)}만</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 text-center italic">Supported by deep analysis of {selectedCompetitor.competitorVideos.length} related trend videos.</p>
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
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-2xl font-bold text-white">Recommended Episodes</h3>
                                    <button onClick={handleSaveAllToPool} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold border border-white/10 transition-all flex items-center gap-2">
                                        <BookmarkPlus size={14} /> 전체 아이디어 담기
                                    </button>
                                </div>
                                {/* NEW: Grouped by Series */}
                                {strategyResult.recommendedSeries.map((series, sIdx) => (
                                    <div key={series.id || sIdx} className="space-y-4">
                                        <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                                            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg">Series {sIdx + 1}</span>
                                            <h4 className="text-lg font-bold text-white">{series.title}</h4>
                                            <span className="text-xs text-gray-500 italic truncate max-w-[300px]">{series.description}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 pl-4 border-l-2 border-indigo-500/30">
                                            {(series.episodes || []).map((episode, eIdx) => (
                                                <div key={episode.id || eIdx} className="bg-white/5 border border-white/10 p-6 rounded-2xl flex items-center justify-between group hover:bg-white/[0.07] transition-all">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold rounded">Ep.0{eIdx + 1}</span>
                                                            <span className="text-gray-500 text-[10px] font-bold uppercase">{episode.format}</span>
                                                        </div>
                                                        <h4 className="text-lg font-bold text-white">{episode.ideaTitle}</h4>
                                                        <p className="text-sm text-gray-400">{episode.oneLiner}</p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <button
                                                            onClick={() => handleSaveToPool(episode, series)}
                                                            className="p-3 bg-white/5 text-gray-400 rounded-xl hover:bg-white/10 transition-all"
                                                            title="아이디어 풀에 담기"
                                                        >
                                                            <BookmarkPlus size={20} />
                                                        </button>
                                                        <button
                                                            onClick={() => handlePromoteToProject(series, episode)}
                                                            className="px-4 py-2 bg-[var(--color-primary)] text-black text-xs font-black rounded-xl hover:scale-105 transition-all flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/10"
                                                        >
                                                            <Rocket size={16} /> 제작 시작
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'characters' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                                {strategyResult.characters?.map((char, i) => (
                                    <div key={i} className="bg-white/5 border border-white/10 p-8 rounded-[32px] space-y-6 hover:border-[var(--color-primary)]/30 transition-all group">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-2xl font-black text-white">{char.name}</h3>
                                            <span className="px-3 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black rounded-lg uppercase tracking-widest">{char.role}</span>
                                        </div>
                                        <p className="text-gray-300 leading-relaxed font-medium">{char.personality}</p>
                                        <div className="pt-6 border-t border-white/5 space-y-3">
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Visual Style Guide</div>
                                            <div className="bg-black/40 p-5 rounded-2xl text-xs text-gray-400 italic leading-relaxed relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity"><ImageIcon size={40} /></div>
                                                {char.visualGuide}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'techStack' && (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-white/5 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                                            <tr>
                                                <th className="px-8 py-6">제작 단계 (Phase)</th>
                                                <th className="px-8 py-6">추천 AI 도구</th>
                                                <th className="px-8 py-6">구체적 활용 방안</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {strategyResult.techStack?.map((item, i) => (
                                                <tr key={i} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-8 py-6 font-black text-[var(--color-primary)]">{item.phase}</td>
                                                    <td className="px-8 py-6 text-white font-bold">{item.tool}</td>
                                                    <td className="px-8 py-6 text-gray-400 text-sm italic">{item.usage}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'marketing' && strategyResult.marketingStrategy && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-white/5 border border-white/10 p-10 rounded-[40px] space-y-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400"><Target size={24} /></div>
                                            <h3 className="text-2xl font-black text-white">Target KPIs</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {strategyResult.marketingStrategy.kpis.map((kpi, i) => (
                                                <div key={i} className="flex items-center gap-4 bg-black/20 p-5 rounded-2xl border border-white/5">
                                                    <div className="text-[var(--color-primary)] font-black text-lg">0{i + 1}</div>
                                                    <div className="text-gray-200 font-bold">{kpi}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="bg-white/5 border border-white/10 p-10 rounded-[40px] space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-pink-500/20 flex items-center justify-center text-pink-400"><Zap size={24} /></div>
                                                <h3 className="text-xl font-black text-white">Viral Elements</h3>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                {strategyResult.marketingStrategy.viralElements.map((v, i) => (
                                                    <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 font-medium">#{v}</span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-white/5 border border-white/10 p-10 rounded-[40px] space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-400"><MessageSquare size={24} /></div>
                                                <h3 className="text-xl font-black text-white">Interactive Ideas</h3>
                                            </div>
                                            <ul className="space-y-3">
                                                {strategyResult.marketingStrategy.interactiveIdeas?.map((idea, i) => (
                                                    <li key={i} className="text-sm text-gray-400 flex gap-3 italic">
                                                        <span className="text-[var(--color-primary)]">•</span> {idea}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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
                                    <div className="space-y-10 text-white">
                                        <div className="space-y-6">
                                            <div className="aspect-[21/9] lg:aspect-[4/1] bg-white/5 border border-white/10 rounded-[32px] overflow-hidden relative w-full group shadow-2xl">
                                                {channelIdentity.bannerUrl ? <img src={channelIdentity.bannerUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><ImageIcon size={48} /></div>}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button onClick={() => setShowArtModal('banner')} className="p-4 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-md text-white transition-all transform scale-150">
                                                        <Maximize2 size={24} />
                                                    </button>
                                                </div>
                                                <div className="absolute bottom-6 left-6 flex items-center gap-6">
                                                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-black bg-gray-800 overflow-hidden relative group/p shadow-2xl">
                                                        {channelIdentity.profileUrl ? <img src={channelIdentity.profileUrl} className="w-full h-full object-cover" /> : <User className="w-full h-full p-6 text-gray-600" />}
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/p:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button onClick={(e) => { e.stopPropagation(); setShowArtModal('profile'); }} className="p-3 bg-white/20 rounded-full text-white">
                                                                <Maximize2 size={20} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="font-black text-2xl md:text-4xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] text-white tracking-tight">{channelIdentity.channelName || 'Name'}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <button onClick={() => handleGenerateArt('profile')} className="flex-1 py-4 bg-[var(--color-primary)] text-black hover:opacity-90 rounded-2xl text-sm font-black flex items-center justify-center gap-3 shadow-xl shadow-[var(--color-primary)]/10">
                                                    <Sparkles size={18} />
                                                    프로필 디자인 (Studio)
                                                </button>
                                                <button onClick={() => handleGenerateArt('banner')} className="flex-1 py-4 bg-[var(--color-primary)] text-black hover:opacity-90 rounded-2xl text-sm font-black flex items-center justify-center gap-3 shadow-xl shadow-[var(--color-primary)]/10">
                                                    <Sparkles size={18} />
                                                    배너 디자인 (Studio)
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                            <div className="space-y-6">
                                                <label className="block text-xs text-gray-400 uppercase font-black">Channel Name</label>
                                                <input value={channelIdentity.channelName} onChange={e => setChannelIdentity(p => ({ ...p, channelName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl font-black" />
                                                <label className="block text-xs text-gray-400 uppercase font-black">Bio</label>
                                                <textarea value={channelIdentity.bio} onChange={e => setChannelIdentity(p => ({ ...p, bio: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 h-24 text-sm" />

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs text-gray-400 uppercase font-black mb-2">Core Mission</label>
                                                        <textarea value={channelIdentity.mission} onChange={e => setChannelIdentity(p => ({ ...p, mission: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs h-20" placeholder="채널의 핵심 존재 이유와 목표" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-400 uppercase font-black mb-2">Tone of Voice</label>
                                                        <textarea value={channelIdentity.toneOfVoice} onChange={e => setChannelIdentity(p => ({ ...p, toneOfVoice: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs h-20" placeholder="시청자와 소통하는 스타일 (예: 유머러스한 전문가)" />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs text-gray-400 uppercase font-black mb-2">Slogan</label>
                                                        <input value={(channelIdentity as any).slogan || ''} onChange={e => setChannelIdentity(p => ({ ...p, slogan: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs" placeholder="채널의 한 줄 슬로건" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-400 uppercase font-black mb-2">Core Values (Comma separated)</label>
                                                        <input value={(channelIdentity as any).coreValues?.join(', ') || ''} onChange={e => setChannelIdentity(p => ({ ...p, coreValues: e.target.value.split(',').map((v: string) => v.trim()) }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs" placeholder="핵심 가치들" />
                                                    </div>
                                                </div>

                                                <label className="block text-xs text-gray-400 uppercase font-black">Target Audience</label>
                                                <textarea value={channelIdentity.targetAudience} onChange={e => setChannelIdentity(p => ({ ...p, targetAudience: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs h-20" placeholder="구체적인 타겟 시청자 층에 대한 설명" />
                                            </div>

                                            <div className="space-y-6">
                                                {/* SEO & Metadata Details */}
                                                <div className="grid grid-cols-1 gap-6">
                                                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                                        <h4 className="text-xs font-black text-gray-500 uppercase mb-4 tracking-widest">Recommended Keywords</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {channelIdentity.seoTags?.map((tag, i) => (
                                                                <span key={i} className="px-3 py-1 bg-[var(--color-primary)]/5 text-[var(--color-primary)] text-[10px] font-bold rounded-lg border border-[var(--color-primary)]/20">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                            {(!channelIdentity.seoTags || channelIdentity.seoTags.length === 0) && <span className="text-gray-600 text-[10px]">자동 생성 버튼을 눌러주세요</span>}
                                                        </div>
                                                    </div>
                                                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                                        <h4 className="text-xs font-black text-gray-500 uppercase mb-4 tracking-widest">Trending Hashtags</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {channelIdentity.hashtags?.map((tag, i) => (
                                                                <span key={i} className="px-3 py-1 bg-white/5 text-gray-400 text-[10px] font-bold rounded-lg border border-white/10">
                                                                    #{tag}
                                                                </span>
                                                            ))}
                                                            {(!channelIdentity.hashtags || channelIdentity.hashtags.length === 0) && <span className="text-gray-600 text-[10px]">자동 생성 버튼을 눌러주세요</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                                    <h4 className="text-xs font-black text-gray-500 uppercase mb-4 tracking-widest">Channel Introduction Script</h4>
                                                    <p className="text-sm text-gray-400 leading-relaxed italic">
                                                        {channelIdentity.introText || '"브랜딩 자동 생성"을 누르면 채널의 환영 인사말과 소개글이 작성됩니다.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'references' && (
                            <div className="space-y-10 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-3xl font-black text-white italic">Research References</h3>
                                    <div className="text-xs text-gray-500">Based on Deep Competitive Analysis</div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-[var(--color-primary)] uppercase tracking-widest">Benchmark Channels</h4>
                                        <div className="space-y-3">
                                            {selectedCompetitor.competitorChannels.map((ch, i) => (
                                                <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-center gap-4 hover:bg-white/10 transition-colors">
                                                    <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center font-bold text-[var(--color-primary)]">
                                                        {ch.channelName.charAt(0)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-white truncate">{ch.channelName}</div>
                                                        <div className="text-[10px] text-gray-500">구독자: {(ch.subscriberCount / 10000).toFixed(1)}만 • 영상: {ch.videoCount}개</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-[var(--color-primary)] uppercase tracking-widest">Key Reference Content</h4>
                                        <div className="space-y-3">
                                            {selectedCompetitor.competitorVideos.slice(0, 5).map((vid, i) => (
                                                <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/10 flex gap-3 group">
                                                    <div className="w-24 aspect-video bg-white/10 rounded overflow-hidden flex-shrink-0">
                                                        <img src={vid.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 py-1">
                                                        <div className="text-xs font-bold text-gray-200 line-clamp-2 leading-snug">{vid.title}</div>
                                                        <div className="text-[10px] text-gray-500 mt-1">{vid.channelName} • {(vid.viewCount / 10000).toFixed(0)}만회</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 rounded-3xl">
                                    <h4 className="text-sm font-black text-white mb-4">AI Research Summary</h4>
                                    <p className="text-sm text-gray-400 leading-relaxed">{selectedCompetitor.summary}</p>
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
                    <h1 className="text-xl font-bold text-white flex items-center gap-2 leading-none">
                        Phase 3 : AI Strategic Planning
                        <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-[10px] text-green-500 border border-green-500/20 font-medium font-bold">
                            <CheckCircle2 size={10} /> Auto-saved to Browser
                        </span>
                    </h1>
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
                <div className="w-[600px] border-r border-white/5 flex flex-col bg-black/40 backdrop-blur-sm">
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

                    {/* Permanent Generation Actions */}
                    {selectedCompetitor && (
                        <div className="px-4 py-3 bg-white/[0.03] border-t border-white/5 space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Quick Actions</span>
                                <div className="h-px bg-white/5 flex-1" />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleGenerateStrategy('new')}
                                    disabled={isGenerating || !geminiApiKey}
                                    className="flex-1 py-3 bg-[var(--color-primary)] text-black rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-lg active:scale-95 disabled:opacity-30"
                                >
                                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    새 버전으로 생성
                                </button>
                                {strategyResult && (
                                    <button
                                        onClick={() => handleGenerateStrategy('overwrite')}
                                        disabled={isGenerating || !geminiApiKey}
                                        className="flex-1 py-3 bg-white/10 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-white/20 transition-all border border-white/5 active:scale-95 disabled:opacity-30"
                                    >
                                        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                                        현재 보고서 교체
                                    </button>
                                )}
                            </div>
                            <p className="text-[9px] text-center text-gray-600">대화 내용을 바탕으로 전략 리포트를 {strategyResult ? '업데이트하거나 새로운 안을 만듭니다.' : '구성합니다.'}</p>
                        </div>
                    )}
                    <div className="p-4 border-t border-white/5">
                        <form onSubmit={handleChatSubmit} className="relative">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder={strategyResult ? "보고서 수정 요청..." : "기획 방향 제안..."}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[var(--color-primary)] outline-none"
                            />
                            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[var(--color-primary)] text-black rounded-lg"><Send size={16} /></button>
                        </form>
                    </div>
                </div>

                <div className="flex-1 flex flex-col h-full bg-black overflow-hidden p-8 space-y-8 custom-scrollbar">
                    {renderSelectionArea()}
                    {renderStrategyDashboard()}
                </div>
            </div>

            {/* Modal Layer */}
            {showArtModal && (
                <ChannelArtModal
                    isOpen={!!showArtModal}
                    onClose={() => setShowArtModal(null)}
                    type={showArtModal}
                    channelName={channelIdentity.channelName}
                    initialPrompt={showArtModal === 'banner' ? channelIdentity.bannerPrompt : channelIdentity.profilePrompt}
                    initialUrl={showArtModal === 'banner' ? channelIdentity.bannerUrl : channelIdentity.profileUrl}
                    apiKey={geminiApiKey}
                    strategyContext={`
Channel Name: ${channelIdentity.channelName}
Slogan: ${(channelIdentity as any).slogan}
Mission: ${(channelIdentity as any).mission}
Target Audience: ${(channelIdentity as any).targetAudience}
Tone of Voice: ${(channelIdentity as any).toneOfVoice}
Strategy Executive Summary: ${strategyResult?.executiveSummary || ''}
`.trim()}
                    characters={strategyResult?.characters}
                    onSave={handleSaveArt}
                />
            )}
        </div>
    );
};
