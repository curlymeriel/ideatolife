/**
 * Step 0: YouTube Trend Analyzer & Benchmarking Advisor
 * 
 * Market research tool for analyzing YouTube trends and benchmarking content
 */

import React, { useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import {
    TrendingUp, Search, Loader2, Globe, AlertCircle, Download, ArrowRight,
    BarChart3, Users, Sparkles, CheckCircle2, ChevronRight, RefreshCw,
    Film, ImageIcon, Type, Clock, Calendar, Menu, Vote, Video
} from 'lucide-react';

import type { RegionCode, YouTubeTrendTopic, YouTubeTrendVideo, TrendAnalysisInsights, YouTubeCategoryId } from '../store/types';
import { YOUTUBE_CATEGORIES } from '../store/types';
import { fetchTrendingVideos, fetchVideosByCategory, searchVideos, extractTopTopics, REGION_NAMES, formatViewCount } from '../services/youtube';
import { analyzeTrendVideos } from '../services/gemini';
import { TrendChart } from '../components/Trend/TrendChart';
import { TrendVideoCard } from '../components/Trend/TrendVideoCard';
import { ChannelAnalyzer } from '../components/Trend/ChannelAnalyzer';

type TabType = 'trends' | 'channel' | 'apply';

export const Step0_TrendAnalyzer: React.FC = () => {
    const { apiKeys, setProjectInfo } = useWorkflowStore();
    const navigate = useNavigate();

    // Tab state
    const [activeTab, setActiveTab] = useState<TabType>('trends');

    // Trend Analysis State
    const [selectedRegion, setSelectedRegion] = useState<RegionCode>('KR');
    const [selectedCategory, setSelectedCategory] = useState<YouTubeCategoryId | 'all'>('10'); // Default to Music
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [trendingVideos, setTrendingVideos] = useState<YouTubeTrendVideo[]>([]);
    const [topics, setTopics] = useState<YouTubeTrendTopic[]>([]);
    const [selectedTopic, setSelectedTopic] = useState<YouTubeTrendTopic | null>(null);
    const [topicVideos, setTopicVideos] = useState<YouTubeTrendVideo[]>([]);
    const [isLoadingTopicVideos, setIsLoadingTopicVideos] = useState(false);

    // AI Analysis State
    const [insights, setInsights] = useState<TrendAnalysisInsights | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Workflow Apply State
    const [storytellingInsights, setStorytellingInsights] = useState('');
    const [thumbnailInsights, setThumbnailInsights] = useState('');
    const [applySuccess, setApplySuccess] = useState<{ step1?: boolean; step5?: boolean }>({});

    const geminiApiKey = apiKeys?.gemini || '';

    // Fetch trending videos
    const handleFetchTrends = async () => {
        if (!geminiApiKey) {
            setError('Gemini API 키가 필요합니다. 설정에서 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSelectedTopic(null);
        setTopicVideos([]);
        setInsights(null);

        try {
            let videos: YouTubeTrendVideo[] = [];

            if (selectedCategory === 'all') {
                // Use general trending for 'all' (will return Music/Gaming/Movies mix post-July 2025)
                videos = await fetchTrendingVideos(geminiApiKey, selectedRegion, 50);
            } else {
                // Fetch category-specific trending videos
                videos = await fetchVideosByCategory(geminiApiKey, selectedRegion, selectedCategory, 50);
            }

            setTrendingVideos(videos);

            // Extract topics
            const extractedTopics = extractTopTopics(videos);
            setTopics(extractedTopics);

        } catch (err: any) {
            setError(err.message || 'Failed to fetch trends');
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch videos for a specific topic
    const handleTopicClick = async (topic: YouTubeTrendTopic) => {
        setSelectedTopic(topic);
        setIsLoadingTopicVideos(true);

        try {
            // Use the actual videos that constituted this trend topic
            if (topic.relatedVideos && topic.relatedVideos.length > 0) {
                setTopicVideos(topic.relatedVideos);
                setIsLoadingTopicVideos(false);
                return;
            }

            // Fallback: Search if no related videos (should rarely happen)
            const videos = await searchVideos(geminiApiKey, topic.topic, selectedRegion, 10);
            setTopicVideos(videos);
        } catch (err: any) {
            console.error('Failed to fetch topic videos:', err);
            // Use filtered trending videos as fallback
            setTopicVideos(trendingVideos.slice(0, 10));
        } finally {
            setIsLoadingTopicVideos(false);
        }
    };

    // Generate AI Insights
    const handleGenerateInsights = async () => {
        if (!geminiApiKey) return;

        setIsAnalyzing(true);
        try {
            const videosToAnalyze = selectedTopic ? topicVideos : trendingVideos;
            const result = await analyzeTrendVideos(videosToAnalyze, geminiApiKey, selectedRegion === 'KR' ? 'ko' : selectedRegion.toLowerCase());
            setInsights(result.insights);

            // Store keyword meanings for tooltip display
            if (result.keywordMeanings && Object.keys(result.keywordMeanings).length > 0) {
                // Update topics with meanings
                setTopics(prev => prev.map(topic => {
                    const meaning = result.keywordMeanings[topic.topic] || result.keywordMeanings[topic.topic.replace('#', '')];
                    const translation = result.translations[topic.topic] || result.translations[topic.topic.replace('#', '')];
                    return {
                        ...topic,
                        topicMeaning: meaning || undefined,
                        translatedTopic: translation || topic.translatedTopic
                    };
                }));
            }

            // Pre-fill comprehensive insights for workflow
            if (result.insights.storytelling || result.insights.title) {
                const storyText = [
                    result.insights.storytelling?.hookMethods && `🎣 **후킹 기법 (0~10초)**\n${result.insights.storytelling.hookMethods}`,
                    result.insights.storytelling?.narrativeStructure && `📖 **스토리 구성**\n${result.insights.storytelling.narrativeStructure}`,
                    result.insights.storytelling?.cameraWorkPatterns && `🎥 **카메라 워크**\n${result.insights.storytelling.cameraWorkPatterns}`,
                    result.insights.title?.keywords && `🏷️ **제목 키워드**\n${result.insights.title.keywords}`,
                    result.insights.title?.emotionalTriggers && `💥 **감정 트리거**\n${result.insights.title.emotionalTriggers}`,
                    result.insights.videoLength?.optimalRange && `⏱️ **최적 영상 길이**\n${result.insights.videoLength.optimalRange}`,
                    result.insights.uploadSchedule?.frequency && `📅 **업로드 주기**\n${result.insights.uploadSchedule.frequency}`,
                    result.insights.storytelling?.recommendations?.length && `\n✅ **추천사항**\n${result.insights.storytelling.recommendations.map(r => `• ${r}`).join('\n')}`
                ].filter(Boolean).join('\n\n');
                setStorytellingInsights(storyText);
            }

            if (result.insights.thumbnail) {
                const thumbText = [
                    result.insights.thumbnail.colorScheme && `🎨 **색상 패턴**\n${result.insights.thumbnail.colorScheme}`,
                    result.insights.thumbnail.textStyle && `📝 **텍스트 스타일**\n${result.insights.thumbnail.textStyle}`,
                    result.insights.thumbnail.composition && `📐 **구도**\n${result.insights.thumbnail.composition}`,
                    result.insights.thumbnail.faceExpression && `😀 **표정/인물**\n${result.insights.thumbnail.faceExpression}`,
                    result.insights.thumbnail.recommendations?.length && `\n✅ **추천사항**\n${result.insights.thumbnail.recommendations.map(r => `• ${r}`).join('\n')}`
                ].filter(Boolean).join('\n\n');
                setThumbnailInsights(thumbText);
            }

        } catch (err: any) {
            console.error('AI analysis failed:', err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Apply insights to workflow
    const handleApplyToStep1 = () => {
        if (!storytellingInsights) return;
        setProjectInfo({
            trendInsights: {
                storytelling: storytellingInsights,
                thumbnail: thumbnailInsights,
                appliedAt: Date.now()
            }
        } as any);
        setApplySuccess(prev => ({ ...prev, step1: true }));
    };

    const handleApplyToStep5 = () => {
        if (!thumbnailInsights) return;
        setProjectInfo({
            trendInsights: {
                storytelling: storytellingInsights,
                thumbnail: thumbnailInsights,
                appliedAt: Date.now()
            }
        } as any);
        setApplySuccess(prev => ({ ...prev, step5: true }));
    };

    // Export report
    const handleExportReport = () => {
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `${date}_${selectedRegion}_TrendReport.md`;

        let content = `# YouTube Trend Report\n\n`;
        content += `**Region:** ${REGION_NAMES[selectedRegion].flag} ${REGION_NAMES[selectedRegion].name}\n`;
        content += `**Analyzed:** ${new Date().toLocaleDateString('ko-KR')}\n\n`;

        content += `## 📊 Top 10 Topics\n\n`;
        topics.forEach((topic, i) => {
            content += `${i + 1}. **${topic.topic}** - ${formatViewCount(topic.avgViews)} avg views, ${topic.avgEngagement}% engagement\n`;
        });

        if (selectedTopic) {
            content += `\n## 🔍 Deep Dive: ${selectedTopic.topic}\n\n`;
            topicVideos.forEach((video, i) => {
                content += `${i + 1}. **${video.title}**\n`;
                content += `   - Channel: ${video.channelName}\n`;
                content += `   - Views: ${formatViewCount(video.viewCount)}\n`;
                content += `   - Link: https://youtube.com/watch?v=${video.id}\n\n`;
            });
        }

        if (insights) {
            content += `\n## 🤖 AI Insights\n\n`;
            content += `### 썸네일 분석\n${thumbnailInsights || 'N/A'}\n\n`;
            content += `### 스토리텔링 분석\n${storytellingInsights || 'N/A'}\n`;
        }

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-[1600px] mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
                    <TrendingUp className="text-[var(--color-primary)]" size={32} />
                    <span className="text-gradient">YouTube Market Research</span>
                </h1>
                <p className="text-[var(--color-text-muted)]">
                    트렌드 분석, 채널 벤치마킹, 콘텐츠 전략 수립을 위한 시장조사 도구
                </p>
            </div>

            {/* API Key Warning */}
            {!geminiApiKey && (
                <div className="mb-6 p-4 glass-panel border border-red-500/30 flex items-center gap-3">
                    <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                    <div>
                        <p className="text-red-400 font-medium">Gemini API 키가 필요합니다</p>
                        <p className="text-red-400/70 text-sm">사이드바 API Config에서 입력해주세요. YouTube Data API가 활성화된 프로젝트의 키를 사용하세요.</p>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-8 bg-[var(--color-surface)] p-1 rounded-xl w-fit border border-[var(--color-border)]">
                <button
                    onClick={() => setActiveTab('trends')}
                    className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'trends'
                        ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-orange-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <BarChart3 size={18} />
                    트렌드 분석
                </button>
                <button
                    onClick={() => setActiveTab('channel')}
                    className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'channel'
                        ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-orange-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Users size={18} />
                    내 채널 분석
                </button>
                <button
                    onClick={() => setActiveTab('apply')}
                    className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'apply'
                        ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-orange-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Sparkles size={18} />
                    워크플로우 적용
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'trends' && (
                <div className="space-y-8">
                    {/* Region & Timeframe Filter */}
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Region Selection */}
                        <div className="flex-1 glass-panel p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Globe size={20} className="text-[var(--color-primary)]" />
                                국가 선택
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {(Object.keys(REGION_NAMES) as RegionCode[]).map(code => (
                                    <button
                                        key={code}
                                        onClick={() => setSelectedRegion(code)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedRegion === code
                                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/50'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                                            }`}
                                    >
                                        <span className="mr-2">{REGION_NAMES[code].flag}</span>
                                        {REGION_NAMES[code].name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Selection */}
                        <div className="w-full md:w-[360px] glass-panel p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <BarChart3 size={20} className="text-[var(--color-primary)]" />
                                카테고리 선택
                            </h3>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {(Object.entries(YOUTUBE_CATEGORIES) as [YouTubeCategoryId, { title: string; icon: string }][]).map(([id, cat]) => (
                                    <button
                                        key={id}
                                        onClick={() => setSelectedCategory(id)}
                                        className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group ${selectedCategory === id
                                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                                            }`}
                                    >
                                        <span className="flex items-center gap-2 text-lg">
                                            <span className="opacity-70 group-hover:opacity-100 transition-opacity">{cat.icon}</span>
                                            <span className={`text-sm ${selectedCategory === id ? 'font-bold' : ''}`}>{cat.title}</span>
                                        </span>
                                        {selectedCategory === id && <CheckCircle2 size={16} />}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setSelectedCategory('all')}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group ${selectedCategory === 'all'
                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                                        }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span>🔥</span>
                                        <span className={`text-sm ${selectedCategory === 'all' ? 'font-bold' : ''}`}>전체 인기 (Mix)</span>
                                    </span>
                                    {selectedCategory === 'all' && <CheckCircle2 size={16} />}
                                </button>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-4 p-3 bg-black/20 rounded-lg">
                                ※ 2025년 7월 YouTube 정책 변경: 일반 Trending 폐지, 카테고리별 차트만 제공
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleFetchTrends}
                            disabled={isLoading || !geminiApiKey}
                            className="btn-primary flex items-center gap-2 px-12 py-4 text-lg"
                        >
                            {isLoading ? (
                                <Loader2 className="animate-spin" size={24} />
                            ) : (
                                <Search size={24} />
                            )}
                            트렌드 분석 시작
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 glass-panel border-red-500/30 p-4 flex items-center gap-3 text-red-400 justify-center">
                            <AlertCircle size={20} />
                            {error}
                        </div>
                    )}


                    {/* Results */}
                    {topics.length > 0 && (
                        <>

                            {/* Chart */}
                            < TrendChart
                                topics={topics}
                                onTopicClick={handleTopicClick}
                                selectedTopicId={selectedTopic?.id}
                            />

                            {/* YouTube 집계 기준 안내 */}
                            <div className="glass-panel p-4 flex items-start gap-3 bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20">
                                <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)]">
                                    <BarChart3 size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white mb-1">YouTube 인기 차트 집계 기준</h4>
                                    <ul className="text-sm text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
                                        <li><strong>갱신 주기:</strong> 약 30분마다 업데이트</li>
                                        <li><strong>집계 기간:</strong> 실시간 ~ 최근 24~48시간 (정확한 기간 비공개)</li>
                                        <li><strong>선정 기준:</strong> 단순 조회수가 아닌 <em>조회수 급등 속도</em>, 업로드 시점, 채널 성과 대비 등 종합 평가</li>
                                    </ul>
                                </div>
                            </div>

                            {/* AI Insights Button */}
                            <div className="flex justify-center py-4">
                                <button
                                    onClick={handleGenerateInsights}
                                    disabled={isAnalyzing}
                                    className="btn-secondary flex items-center gap-2 border-[var(--color-primary)]/30 hover:border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                                >
                                    {isAnalyzing ? (
                                        <Loader2 className="animate-spin" size={20} />
                                    ) : (
                                        <Sparkles size={20} />
                                    )}
                                    AI 인사이트 심층 분석
                                </button>
                            </div>

                            {/* Topic Deep Dive */}
                            {selectedTopic && (
                                <div className="glass-panel p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
                                        <Search size={24} className="text-[var(--color-primary)]" />
                                        Deep Dive: {selectedTopic.topic}
                                        {selectedTopic.translatedTopic && (
                                            <span className="text-[var(--color-text-muted)] text-base font-normal">
                                                ({selectedTopic.translatedTopic})
                                            </span>
                                        )}
                                    </h3>

                                    {isLoadingTopicVideos ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="animate-spin text-[var(--color-primary)]" size={48} />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                                            {topicVideos.map((video, index) => (
                                                <TrendVideoCard key={video.id} video={video} rank={index + 1} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI Insights Panel - Unified Style */}
                            {insights && (
                                <div className="space-y-6">
                                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <Sparkles className="text-[var(--color-primary)]" size={28} />
                                        <span className="text-gradient">AI 분석 리포트</span>
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Thumbnail Analysis */}
                                        <div className="glass-panel p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <ImageIcon size={100} className="text-[var(--color-primary)]" />
                                            </div>
                                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                                <ImageIcon size={20} className="text-[var(--color-primary)]" />
                                                썸네일 전략
                                            </h4>
                                            <div className="space-y-3 text-sm text-gray-300 relative z-10">
                                                {insights.thumbnail.colorScheme && (
                                                    <div className="p-3 bg-black/20 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-[var(--color-primary)] font-bold block mb-1">🎨 색상 패턴</span>
                                                        {insights.thumbnail.colorScheme}
                                                    </div>
                                                )}
                                                {insights.thumbnail.textStyle && (
                                                    <div className="p-3 bg-black/20 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-[var(--color-primary)] font-bold block mb-1">📝 텍스트 스타일</span>
                                                        {insights.thumbnail.textStyle}
                                                    </div>
                                                )}
                                                {insights.thumbnail.composition && (
                                                    <div className="p-3 bg-black/20 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-[var(--color-primary)] font-bold block mb-1">📐 구도</span>
                                                        {insights.thumbnail.composition}
                                                    </div>
                                                )}
                                                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                                                    <span className="text-white font-bold block mb-2">✅ 추천 사항</span>
                                                    {insights.thumbnail.recommendations?.map((r, i) => (
                                                        <div key={i} className="flex items-start gap-2 mb-1 text-[var(--color-text-muted)]">
                                                            <CheckCircle2 size={14} className="mt-0.5 text-[var(--color-primary)] shrink-0" />
                                                            <span>{r}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title Analysis */}
                                        <div className="glass-panel p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Type size={100} className="text-[var(--color-primary)]" />
                                            </div>
                                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                                <Type size={20} className="text-[var(--color-primary)]" />
                                                제목 전략
                                            </h4>
                                            <div className="space-y-3 text-sm text-gray-300 relative z-10">
                                                {insights.title?.keywords && (
                                                    <div className="p-3 bg-black/20 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-[var(--color-primary)] font-bold block mb-1">🏷️ 핵심 키워드</span>
                                                        {insights.title.keywords}
                                                    </div>
                                                )}
                                                {insights.title?.emotionalTriggers && (
                                                    <div className="p-3 bg-black/20 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-[var(--color-primary)] font-bold block mb-1">💥 감정 트리거</span>
                                                        {insights.title.emotionalTriggers}
                                                    </div>
                                                )}
                                                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                                                    <span className="text-white font-bold block mb-2">✅ 추천 사항</span>
                                                    {insights.title?.recommendations?.map((r, i) => (
                                                        <div key={i} className="flex items-start gap-2 mb-1 text-[var(--color-text-muted)]">
                                                            <CheckCircle2 size={14} className="mt-0.5 text-[var(--color-primary)] shrink-0" />
                                                            <span>{r}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Storytelling */}
                                    <div className="glass-panel p-6 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-3 opacity-5">
                                            <Film size={150} className="text-[var(--color-primary)]" />
                                        </div>
                                        <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                            <Film size={20} className="text-[var(--color-primary)]" />
                                            스토리텔링 & 후킹 (0~10초)
                                        </h4>
                                        <div className="grid md:grid-cols-3 gap-6 relative z-10">
                                            <div className="p-4 bg-black/20 rounded-xl border border-[var(--color-border)]">
                                                <span className="text-[var(--color-primary)] font-bold flex items-center gap-2 mb-2">
                                                    <Vote size={16} /> 후킹 기법
                                                </span>
                                                <p className="text-sm text-gray-300 leading-relaxed">{insights.storytelling.hookMethods}</p>
                                            </div>
                                            <div className="p-4 bg-black/20 rounded-xl border border-[var(--color-border)]">
                                                <span className="text-[var(--color-primary)] font-bold flex items-center gap-2 mb-2">
                                                    <Menu size={16} /> 전개 구조
                                                </span>
                                                <p className="text-sm text-gray-300 leading-relaxed">{insights.storytelling.narrativeStructure}</p>
                                            </div>
                                            <div className="p-4 bg-black/20 rounded-xl border border-[var(--color-border)]">
                                                <span className="text-[var(--color-primary)] font-bold flex items-center gap-2 mb-2">
                                                    <Video size={16} /> 카메라 워크
                                                </span>
                                                <p className="text-sm text-gray-300 leading-relaxed">{insights.storytelling.cameraWorkPatterns}</p>
                                            </div>
                                        </div>
                                        {insights.storytelling.recommendations && (
                                            <div className="mt-6 pt-6 border-t border-[var(--color-border)] flex flex-wrap gap-2 relative z-10">
                                                {insights.storytelling.recommendations.map((r, i) => (
                                                    <span key={i} className="px-3 py-1.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-full text-xs font-medium flex items-center gap-1.5">
                                                        <CheckCircle2 size={12} /> {r}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Additional Stats */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {insights.videoLength && (
                                            <div className="glass-panel p-6">
                                                <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                                                    <Clock size={18} className="text-[var(--color-text-muted)]" />
                                                    영상 길이 전략
                                                </h4>
                                                <div className="flex items-center gap-4">
                                                    <div className="px-4 py-2 bg-black/30 rounded-lg border border-[var(--color-border)]">
                                                        <span className="text-xs text-[var(--color-text-muted)] block">평균 길이</span>
                                                        <span className="text-[var(--color-primary)] font-mono font-bold">{insights.videoLength.avgDuration}</span>
                                                    </div>
                                                    <ArrowRight size={16} className="text-[var(--color-text-muted)]" />
                                                    <div className="px-4 py-2 bg-black/30 rounded-lg border border-[var(--color-primary)]/30 box-shadow-primary-glow">
                                                        <span className="text-xs text-[var(--color-text-muted)] block">최적 범위</span>
                                                        <span className="text-[var(--color-primary)] font-mono font-bold">{insights.videoLength.optimalRange}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {insights.uploadSchedule && (
                                            <div className="glass-panel p-6">
                                                <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                                                    <Calendar size={18} className="text-[var(--color-text-muted)]" />
                                                    업로드 일정 추천
                                                </h4>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between border-b border-[var(--color-border)] pb-2 mb-2">
                                                        <span className="text-gray-400">추천 요일</span>
                                                        <span className="text-white font-medium">{insights.uploadSchedule.bestDays}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">골든 타임</span>
                                                        <span className="text-[var(--color-primary)] font-bold">{insights.uploadSchedule.bestTimes}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Export Button */}
                            <button
                                onClick={handleExportReport}
                                className="w-full py-4 glass-panel text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-primary)] transition-all flex items-center justify-center gap-2 group"
                            >
                                <Download size={20} className="group-hover:text-[var(--color-primary)] transition-colors" />
                                리포트 다운로드 (.md)
                            </button>

                        </>
                    )}
                </div>
            )}


            {
                activeTab === 'channel' && (
                    <ChannelAnalyzer apiKey={geminiApiKey} />
                )
            }

            {
                activeTab === 'apply' && (
                    <div className="space-y-6">
                        <div className="glass-panel p-8">
                            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                <Sparkles className="text-[var(--color-primary)]" size={24} />
                                워크플로우 적용
                            </h3>
                            <p className="text-[var(--color-text-muted)] mb-8">
                                트렌드 분석에서 얻은 인사이트를 실제 제작 단계(Step 1~6)에 바로 적용합니다.
                            </p>

                            {(!storytellingInsights && !thumbnailInsights) ? (
                                <div className="text-center py-12 text-[var(--color-text-muted)] bg-black/20 rounded-xl border border-[var(--color-border)] border-dashed">
                                    <RefreshCw size={48} className="mx-auto mb-4 opacity-30" />
                                    <p className="mb-4">적용할 인사이트가 없습니다.</p>
                                    <button
                                        onClick={() => setActiveTab('trends')}
                                        className="btn-primary px-6 py-2"
                                    >
                                        트렌드 분석하러 가기
                                    </button>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-8">
                                    {/* Step 1 Application */}
                                    <div className="glass-panel p-6 border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-bold text-white text-lg flex items-center gap-2">
                                                <Film size={20} className="text-[var(--color-primary)]" />
                                                Step 1 (기획)에 적용
                                            </h4>
                                            {applySuccess.step1 && (
                                                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> 적용 완료
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--color-text-muted)] mb-4">
                                            스토리텔링 구도, 후킹 멘트, 전개 방식 등 기획 단계의 AI 프롬프트에 반영됩니다.
                                        </p>
                                        <textarea
                                            value={storytellingInsights}
                                            onChange={(e) => setStorytellingInsights(e.target.value)}
                                            className="input-field h-40 resize-none mb-4"
                                            placeholder="스토리텔링 인사이트..."
                                        />
                                        <button
                                            onClick={handleApplyToStep1}
                                            disabled={!storytellingInsights}
                                            className="w-full py-3 btn-secondary hover:bg-[var(--color-primary)] hover:text-black hover:border-[var(--color-primary)] flex items-center justify-center gap-2"
                                        >
                                            <ArrowRight size={18} />
                                            기획안(Step 1)에 반영하기
                                        </button>
                                    </div>

                                    {/* Step 5 Application */}
                                    <div className="glass-panel p-6 border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-bold text-white text-lg flex items-center gap-2">
                                                <ImageIcon size={20} className="text-[var(--color-primary)]" />
                                                Step 5 (썸네일)에 적용
                                            </h4>
                                            {applySuccess.step5 && (
                                                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> 적용 완료
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--color-text-muted)] mb-4">
                                            썸네일 색상 조합, 텍스트 배치, 이미지 구도 가이드를 썸네일 생성기에 전달합니다.
                                        </p>
                                        <textarea
                                            value={thumbnailInsights}
                                            onChange={(e) => setThumbnailInsights(e.target.value)}
                                            className="input-field h-40 resize-none mb-4"
                                            placeholder="썸네일 인사이트..."
                                        />
                                        <button
                                            onClick={handleApplyToStep5}
                                            disabled={!thumbnailInsights}
                                            className="w-full py-3 btn-secondary hover:bg-[var(--color-primary)] hover:text-black hover:border-[var(--color-primary)] flex items-center justify-center gap-2"
                                        >
                                            <ArrowRight size={18} />
                                            썸네일(Step 5)에 반영하기
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Navigate to Steps */}
                            {(applySuccess.step1 || applySuccess.step5) && (
                                <div className="mt-8 flex gap-4 justify-center animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        onClick={() => navigate('/step/1')}
                                        className="btn-primary flex items-center gap-2"
                                    >
                                        Step 1으로 이동 <ChevronRight size={18} />
                                    </button>
                                    <button
                                        onClick={() => navigate('/step/5')}
                                        className="btn-secondary flex items-center gap-2"
                                    >
                                        Step 5으로 이동 <ChevronRight size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
};
