import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
    Users,
    ArrowRight,
    ArrowLeft,
    TrendingUp,
    PlayCircle,
    CheckCircle2,
    Search,
    BrainCircuit,
    Target,
    Zap,
    Palette,
    Heart,
    ShieldCheck,
    Lightbulb,
    Loader2,
    Save,
    Trash2
} from 'lucide-react';
import { analyzeCompetitorStrategy } from '../services/gemini';
import type { StrategicAnalysis, TrendSnapshot, YouTubeTrendVideo } from '../store/types';

export const CompetitorAnalysis: React.FC = () => {
    const navigate = useNavigate();
    const {
        trendSnapshots,
        competitorSnapshots,
        apiKeys,
        saveCompetitorSnapshot,
        deleteTrendSnapshot
    } = useWorkflowStore();
    const geminiApiKey = apiKeys?.gemini || '';

    // State
    const snapshots = Object.values(trendSnapshots).sort((a, b) => b.createdAt - a.createdAt);
    const [selectedSnapshot, setSelectedSnapshot] = useState<TrendSnapshot | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<StrategicAnalysis | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const handleSelectSnapshot = (snapshot: TrendSnapshot) => {
        setSelectedSnapshot(snapshot);
        setAnalysisResult(null);
        setSaveStatus('idle');
    };

    // Restore state from URL
    const [searchParams] = useSearchParams();
    React.useEffect(() => {
        const snapshotId = searchParams.get('snapshotId');
        if (snapshotId && trendSnapshots[snapshotId]) {
            setSelectedSnapshot(trendSnapshots[snapshotId]);

            // Check if analysis already exists and restore it
            const existingComp = Object.values(competitorSnapshots).find(c => c.trendSnapshotId === snapshotId);
            if (existingComp && existingComp.analysis) {
                setAnalysisResult(existingComp.analysis);
                setSaveStatus('saved');
            }
        }
    }, [searchParams, trendSnapshots, competitorSnapshots]);

    const handleDeepDive = async () => {
        if (!selectedSnapshot || !geminiApiKey) return;

        setIsAnalyzing(true);
        try {
            // Get videos from snapshot (stored in rawData.videos)
            const videos = selectedSnapshot.rawData?.videos || [];

            const result = await analyzeCompetitorStrategy(
                videos,
                geminiApiKey,
                selectedSnapshot.queryContext
            );

            setAnalysisResult(result);
        } catch (error) {
            console.error('Deep Dive failed:', error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleProceedToPhase3 = () => {
        if (!selectedSnapshot || !analysisResult) return;

        // If not saved yet, save it first
        if (saveStatus !== 'saved') {
            handleSaveAnalysis();
        }

        // Navigate immediately with snapshot context
        navigate(`/research/strategy?snapshotId=${selectedSnapshot.id}`);
    };

    const handleSaveAnalysis = () => {
        if (!selectedSnapshot || !analysisResult) return;

        setSaveStatus('saving');
        const competitorId = Math.random().toString(36).substring(2, 9);

        saveCompetitorSnapshot({
            id: competitorId,
            createdAt: Date.now(),
            trendSnapshotId: selectedSnapshot.id,
            focusKeywords: selectedSnapshot.keywords,
            competitorChannels: [], // Could extract from videos if needed
            competitorVideos: selectedSnapshot.rawData?.videos || [],
            summary: analysisResult.targetAudience, // Temporary summary
            analysis: analysisResult
        });

        setSaveStatus('saved');
    };

    const renderSnapshotList = () => (
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Search size={20} className="text-[var(--color-primary)]" />
                분석할 시장 스냅샷 선택
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {snapshots.length === 0 ? (
                    <div className="col-span-full h-40 flex flex-col items-center justify-center text-gray-500 border border-dashed border-[var(--color-border)] rounded-xl bg-white/5">
                        <Users className="mb-2 opacity-30" size={32} />
                        <p>저장된 스냅샷이 없습니다.</p>
                        <button
                            onClick={() => navigate('/research')}
                            className="mt-2 text-[var(--color-primary)] hover:underline text-sm"
                        >
                            Phase 1에서 먼저 시장 조사를 수행하세요
                        </button>
                    </div>
                ) : (
                    snapshots.map(snapshot => (
                        <div
                            key={snapshot.id}
                            onClick={() => handleSelectSnapshot(snapshot)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer relative group ${selectedSnapshot?.id === snapshot.id
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]'
                                : 'border-[var(--color-border)] bg-white/5 hover:border-white/30'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] text-gray-500">{new Date(snapshot.createdAt).toLocaleDateString()}</span>
                                <div className="flex items-center gap-2">
                                    {selectedSnapshot?.id === snapshot.id && <CheckCircle2 className="text-[var(--color-primary)]" size={16} />}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('정말 이 리서치 데이터를 삭제하시겠습니까?')) {
                                                deleteTrendSnapshot(snapshot.id);
                                                if (selectedSnapshot?.id === snapshot.id) {
                                                    setSelectedSnapshot(null);
                                                    setAnalysisResult(null);
                                                }
                                            }
                                        }}
                                        className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                        title="삭제"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-white font-bold mb-1 line-clamp-1">{snapshot.queryContext}</h3>
                            <p className="text-xs text-gray-400 line-clamp-1">{snapshot.description}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const renderPreviewPane = () => {
        if (!selectedSnapshot) return (
            <div className="h-full flex items-center justify-center text-gray-500">
                <p>스냅샷을 선택하면 분석 가능한 경쟁 채널/영상이 여기에 표시됩니다.</p>
            </div>
        );

        const videos: YouTubeTrendVideo[] = selectedSnapshot.rawData?.videos || [];

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Snapshot Summary */}
                <div className="bg-white/5 rounded-xl p-4 border border-[var(--color-border)] flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-bold">{selectedSnapshot.queryContext}</h3>
                        <div className="flex gap-2 mt-1">
                            {selectedSnapshot.keywords.slice(0, 5).map((kw, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-black/30 text-[10px] text-gray-400 rounded">#{kw}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Competitor Channels Section (NEW) */}
                {selectedSnapshot.channels && selectedSnapshot.channels.length > 0 ? (
                    <div className="bg-white/5 rounded-xl p-4 border border-[var(--color-border)]">
                        <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                            <TrendingUp size={18} className="text-[var(--color-primary)]" />
                            경쟁 채널 심층 프로필 ({selectedSnapshot.channels.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedSnapshot.channels.slice(0, 4).map((channel, idx) => (
                                <div key={channel.channelId} className="bg-black/20 p-4 rounded-lg border border-white/5 hover:border-[var(--color-primary)]/50 transition-colors">
                                    <div className="flex items-start gap-3 mb-3">
                                        <img src={channel.channelThumbnail} alt={channel.channelName} className="w-14 h-14 rounded-full object-cover border-2 border-white/10" />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-white text-sm truncate">{channel.channelName}</h4>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                                                <span className="text-[var(--color-primary)] font-bold">{idx + 1}위</span>
                                                <span>•</span>
                                                <span>구독자 {channel.subscriberCount.toLocaleString()}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{channel.description || '채널 설명이 없습니다.'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className="bg-white/5 p-2 rounded">
                                            <span className="block text-[10px] text-gray-500 mb-1">영상 수</span>
                                            <span className="text-gray-300 font-medium">{channel.videoCount}</span>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded">
                                            <span className="block text-[10px] text-gray-500 mb-1">총 조회수</span>
                                            <span className="text-gray-300 font-medium">{(channel.viewCount / 10000).toFixed(0)}만</span>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded">
                                            <span className="block text-[10px] text-gray-500 mb-1">평균 조회</span>
                                            <span className="text-[var(--color-primary)] font-bold">{(channel.viewCount / (channel.videoCount || 1)).toFixed(0)}</span>
                                        </div>
                                    </div>
                                    {channel.keywords && (
                                        <div className="mt-3 pt-3 border-t border-white/10">
                                            <div className="flex flex-wrap gap-1">
                                                {channel.keywords.split(' ').slice(0, 3).map((k: string, i: number) => (
                                                    <span key={i} className="text-[9px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded-full border border-white/5">
                                                        {k.replace(/"/g, '')}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Fallback: Channel List from Videos */
                    <div className="bg-white/5 rounded-xl p-4 border border-[var(--color-border)]">
                        <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                            <Users size={18} className="text-[var(--color-primary)]" />
                            주요 경쟁 채널 (비디오 기반)
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {Array.from(new Set(videos.map(v => v.channelName))).slice(0, 10).map((channelName, i) => (
                                <span key={i} className="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-xs text-gray-300">
                                    {channelName}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Deep Dive Action Area */}
                <div className="bg-white/5 rounded-xl p-6 border border-[var(--color-border)] text-center">
                    <h3 className="text-lg font-bold text-white mb-2">🚀 AI 심층 전략 분석</h3>
                    <p className="text-sm text-gray-400 mb-4">선택된 리서치 데이터를 바탕으로 경쟁사의 핵심 성공 전략을 분석합니다.</p>
                    <button
                        onClick={handleDeepDive}
                        disabled={isAnalyzing || !geminiApiKey}
                        className="mx-auto px-8 py-3 bg-[var(--color-primary)] text-black font-bold rounded-xl hover:bg-[var(--color-primary)]/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[var(--color-primary)]/20 transition-all hover:scale-105"
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <BrainCircuit size={20} />}
                        분석 시작 (Deep Dive)
                    </button>
                    {!geminiApiKey && <p className="text-xs text-red-400 mt-2">* API 키 설정이 필요합니다.</p>}
                </div>

                {/* Analysis Results Display */}
                {analysisResult && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in zoom-in-95 duration-500">
                        {/* 1. Target Audience */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                            <h4 className="text-[var(--color-primary)] font-bold flex items-center gap-2 mb-3">
                                <Target size={20} /> 타겟 시청자 (Persona)
                            </h4>
                            <div className="text-sm text-gray-300 leading-relaxed bg-white/5 p-4 rounded-lg">
                                {analysisResult.targetAudience}
                            </div>
                        </div>

                        {/* 2. Hooks */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                            <h4 className="text-orange-400 font-bold flex items-center gap-2 mb-3">
                                <Zap size={20} /> 필승 후킹 전략 (Hook)
                            </h4>
                            <div className="space-y-2">
                                {analysisResult.hookPatterns.map((hook, i) => (
                                    <div key={i} className="flex gap-2 items-start text-sm text-gray-300">
                                        <div className="w-5 h-5 bg-orange-400/20 text-orange-400 rounded flex items-center justify-center flex-shrink-0 text-xs mt-0.5">{i + 1}</div>
                                        {hook}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. Visual Strategy */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                            <h4 className="text-blue-400 font-bold flex items-center gap-2 mb-3">
                                <Palette size={20} /> 시각적 연출 가이드
                            </h4>
                            <div className="space-y-2">
                                {analysisResult.visualStrategies.map((item, i) => (
                                    <div key={i} className="flex gap-2 items-start text-sm text-gray-300">
                                        <CheckCircle2 className="text-blue-400/50 flex-shrink-0 mt-0.5" size={16} />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. Emotional Triggers */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
                            <h4 className="text-pink-400 font-bold flex items-center gap-2 mb-3">
                                <Heart size={20} /> 감정 자극 요소
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {analysisResult.emotionalTriggers.map((item, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-pink-400/10 text-pink-300 text-xs rounded-full border border-pink-400/20">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* 5. Competitive Edge & Gaps (Full Width) */}
                        <div className="lg:col-span-2 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-indigo-400 font-bold flex items-center gap-2">
                                    <Lightbulb size={24} /> 시장 격차 분석 및 블루오션 기회 (Opportunity)
                                </h4>
                                <button
                                    onClick={handleSaveAnalysis}
                                    disabled={saveStatus !== 'idle'}
                                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${saveStatus === 'saved'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'bg-white/10 text-white hover:bg-white/20'
                                        }`}
                                >
                                    {saveStatus === 'saved' ? <CheckCircle2 size={18} /> : <Save size={18} />}
                                    {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '스냅샷 저장됨' : '분석 결과 저장'}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <ShieldCheck size={12} /> 경쟁자 핵심 강점
                                    </p>
                                    <ul className="space-y-2">
                                        {analysisResult.competitiveEdges.map((item, i) => (
                                            <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-white/5 p-4 rounded-lg border border-white/5">
                                    <p className="text-[10px] text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <Zap size={12} /> 빈틈 공략 포인트 (Gaps)
                                    </p>
                                    <ul className="space-y-2">
                                        {analysisResult.contentGapOpportunities.map((item, i) => (
                                            <li key={i} className="text-sm text-white font-medium flex items-start gap-2">
                                                <ArrowRight size={14} className="text-orange-400 mt-0.5 flex-shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Video Previews (Collapsible or bottom) */}
                <div className="space-y-3">
                    <h4 className="text-gray-400 text-xs uppercase tracking-widest flex items-center gap-2">
                        참고한 경합 채널/동영상 {videos.length}개
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {videos.slice(0, 12).map((video, i) => (
                            <div key={i} className="group relative aspect-video rounded-lg overflow-hidden border border-white/10 opacity-60 hover:opacity-100 transition-opacity">
                                <img
                                    src={video.thumbnailUrl}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                    alt={video.title}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <PlayCircle className="text-white" size={24} />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black text-[8px] text-white line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {video.title}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
            {/* Phase Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
                <div>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-primary)] font-bold uppercase tracking-widest mb-1">
                        <TrendingUp size={14} /> Intelligence Layer
                    </div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2 leading-none">
                        Phase 2: 경합 영상과 채널 심도 분석 (Deep Research)
                        <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-[10px] text-green-500 border border-green-500/20 font-medium">
                            <CheckCircle2 size={10} /> Auto-saved to Browser
                        </span>
                    </h1>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/research')}
                        className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm"
                    >
                        <ArrowLeft size={16} />
                        시장 조사
                    </button>
                    <button
                        onClick={handleProceedToPhase3}
                        disabled={!analysisResult}
                        className="px-5 py-2 bg-white/10 text-white font-bold rounded-lg hover:bg-[var(--color-primary)] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-all"
                    >
                        전략 리포트 수립
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {renderSnapshotList()}
                    <div className="h-px bg-white/10" />
                    {renderPreviewPane()}
                </div>
            </div>

            {/* Banner info */}
            <div className="px-6 py-2 bg-indigo-500/10 border-t border-indigo-500/20 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-4 text-indigo-400">
                    <span className="flex items-center gap-1"><BrainCircuit size={12} /> Gemini 3.0 Pro 기반 분석</span>
                    <span className="flex items-center gap-1"><Target size={12} /> 시청자 페르소나 및 훅 추출</span>
                </div>
                {geminiApiKey ? (
                    <span className="text-green-500 flex items-center gap-1"><ShieldCheck size={12} /> Deep Research Engine Connected</span>
                ) : (
                    <span className="text-orange-500 flex items-center gap-1"><Zap size={12} /> API Key required for real analysis</span>
                )}
            </div>
        </div>
    );
};
