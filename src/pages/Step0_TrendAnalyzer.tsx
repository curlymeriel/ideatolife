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
    BarChart3, Users, Sparkles, CheckCircle2, ChevronRight, RefreshCw
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
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
                    <TrendingUp className="text-[var(--color-primary)]" size={32} />
                    YouTube Market Research
                </h1>
                <p className="text-gray-400">
                    트렌드 분석, 채널 벤치마킹, 콘텐츠 전략 수립을 위한 시장조사 도구
                </p>
            </div>

            {/* API Key Warning */}
            {!geminiApiKey && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                    <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                    <div>
                        <p className="text-red-400 font-medium">Gemini API 키가 필요합니다</p>
                        <p className="text-red-400/70 text-sm">사이드바 API Config에서 입력해주세요. YouTube Data API가 활성화된 프로젝트의 키를 사용하세요.</p>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6 bg-[var(--color-surface)] p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('trends')}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'trends'
                        ? 'bg-[var(--color-primary)] text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <BarChart3 size={16} />
                    🔥 트렌드 분석
                </button>
                <button
                    onClick={() => setActiveTab('channel')}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'channel'
                        ? 'bg-[var(--color-primary)] text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Users size={16} />
                    📺 내 채널 분석
                </button>
                <button
                    onClick={() => setActiveTab('apply')}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'apply'
                        ? 'bg-[var(--color-primary)] text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Sparkles size={16} />
                    📤 워크플로우 적용
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'trends' && (
                <div className="space-y-6">
                    {/* Region & Timeframe Filter */}
                    <div className="flex gap-4">
                        {/* Region Selection */}
                        <div className="flex-1 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                <Globe size={20} className="text-[var(--color-primary)]" />
                                국가 선택
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {(Object.keys(REGION_NAMES) as RegionCode[]).map(code => (
                                    <button
                                        key={code}
                                        onClick={() => setSelectedRegion(code)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedRegion === code
                                            ? 'bg-[var(--color-primary)] text-black'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                            }`}
                                    >
                                        <span className="mr-1.5">{REGION_NAMES[code].flag}</span>
                                        {REGION_NAMES[code].name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Selection (Post July 2025 Policy) */}
                        <div className="w-[320px] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                <BarChart3 size={20} className="text-[var(--color-primary)]" />
                                카테고리 선택
                            </h3>
                            <div className="space-y-2">
                                {(Object.entries(YOUTUBE_CATEGORIES) as [YouTubeCategoryId, { title: string; icon: string }][]).map(([id, cat]) => (
                                    <button
                                        key={id}
                                        onClick={() => setSelectedCategory(id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${selectedCategory === id
                                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                                            }`}
                                    >
                                        <span>{cat.icon} {cat.title}</span>
                                        {selectedCategory === id && <CheckCircle2 size={14} />}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setSelectedCategory('all')}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${selectedCategory === 'all'
                                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                                        }`}
                                >
                                    <span>🔥 전체 인기 (Mix)</span>
                                    {selectedCategory === 'all' && <CheckCircle2 size={14} />}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-3">
                                ※ 2025년 7월 YouTube 정책 변경: 일반 Trending 폐지, 카테고리별 차트만 제공
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleFetchTrends}
                        disabled={isLoading || !geminiApiKey}
                        className="px-6 py-3 bg-[var(--color-primary)] text-black font-bold rounded-lg hover:bg-[var(--color-primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <Search size={18} />
                        )}
                        🔍 분석 시작
                    </button>

                    {error && (
                        <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} />
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
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300/80">
                                <p className="font-medium text-blue-300 mb-1">ℹ️ YouTube 인기 차트 집계 기준</p>
                                <ul className="space-y-0.5 list-disc list-inside text-blue-300/70">
                                    <li><strong>갱신 주기:</strong> 약 30분마다 업데이트</li>
                                    <li><strong>집계 기간:</strong> 실시간 ~ 최근 24~48시간 (정확한 기간 비공개)</li>
                                    <li><strong>선정 기준:</strong> 단순 조회수가 아닌 <em>조회수 급등 속도</em>, 업로드 시점, 채널 성과 대비 등 종합 평가</li>
                                </ul>
                            </div>

                            {/* AI Insights Button */}
                            <div className="flex justify-center">
                                <button
                                    onClick={handleGenerateInsights}
                                    disabled={isAnalyzing}
                                    className="px-6 py-3 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-medium hover:bg-purple-500/30 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isAnalyzing ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (
                                        <Sparkles size={18} />
                                    )}
                                    ✨ AI 인사이트 생성
                                </button>
                            </div>

                            {/* Topic Deep Dive */}
                            {selectedTopic && (
                                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        🔬 Deep Dive: {selectedTopic.topic}
                                        {selectedTopic.translatedTopic && (
                                            <span className="text-[var(--color-primary)] text-sm font-normal">
                                                ({selectedTopic.translatedTopic})
                                            </span>
                                        )}
                                    </h3>

                                    {isLoadingTopicVideos ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="animate-spin text-[var(--color-primary)]" size={32} />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                            {topicVideos.map((video, index) => (
                                                <TrendVideoCard key={video.id} video={video} rank={index + 1} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI Insights Panel - Expanded with all benchmarking categories */}
                            {insights && (
                                <div className="space-y-4">
                                    {/* Row 1: Thumbnail & Title */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="bg-[var(--color-surface)] rounded-xl border border-purple-500/30 p-4">
                                            <h4 className="text-md font-bold text-purple-400 mb-3">🖼️ 썸네일 분석</h4>
                                            <div className="text-sm text-gray-300 space-y-2">
                                                {insights.thumbnail.colorScheme && (
                                                    <p><span className="text-purple-400">🎨 색상:</span> {insights.thumbnail.colorScheme}</p>
                                                )}
                                                {insights.thumbnail.textStyle && (
                                                    <p><span className="text-purple-400">📝 텍스트:</span> {insights.thumbnail.textStyle}</p>
                                                )}
                                                {insights.thumbnail.composition && (
                                                    <p><span className="text-purple-400">📐 구도:</span> {insights.thumbnail.composition}</p>
                                                )}
                                                {insights.thumbnail.faceExpression && (
                                                    <p><span className="text-purple-400">😀 표정:</span> {insights.thumbnail.faceExpression}</p>
                                                )}
                                                {insights.thumbnail.recommendations?.map((r, i) => (
                                                    <p key={i} className="text-gray-400 text-xs">✓ {r}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-[var(--color-surface)] rounded-xl border border-green-500/30 p-4">
                                            <h4 className="text-md font-bold text-green-400 mb-3">📝 제목 분석</h4>
                                            <div className="text-sm text-gray-300 space-y-2">
                                                {insights.title?.keywords && (
                                                    <p><span className="text-green-400">🏷️ 키워드:</span> {insights.title.keywords}</p>
                                                )}
                                                {insights.title?.length && (
                                                    <p><span className="text-green-400">📏 길이:</span> {insights.title.length}</p>
                                                )}
                                                {insights.title?.emotionalTriggers && (
                                                    <p><span className="text-green-400">💥 트리거:</span> {insights.title.emotionalTriggers}</p>
                                                )}
                                                {insights.title?.recommendations?.map((r, i) => (
                                                    <p key={i} className="text-gray-400 text-xs">✓ {r}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 2: Storytelling */}
                                    <div className="bg-[var(--color-surface)] rounded-xl border border-blue-500/30 p-4">
                                        <h4 className="text-md font-bold text-blue-400 mb-3">🎬 스토리텔링/후킹 분석 (0~10초)</h4>
                                        <div className="text-sm text-gray-300 grid md:grid-cols-3 gap-4">
                                            <div>
                                                {insights.storytelling.hookMethods && (
                                                    <p><span className="text-blue-400">🎣 후킹:</span> {insights.storytelling.hookMethods}</p>
                                                )}
                                            </div>
                                            <div>
                                                {insights.storytelling.narrativeStructure && (
                                                    <p><span className="text-blue-400">📖 구성:</span> {insights.storytelling.narrativeStructure}</p>
                                                )}
                                            </div>
                                            <div>
                                                {insights.storytelling.cameraWorkPatterns && (
                                                    <p><span className="text-blue-400">🎥 카메라:</span> {insights.storytelling.cameraWorkPatterns}</p>
                                                )}
                                            </div>
                                        </div>
                                        {insights.storytelling.recommendations && insights.storytelling.recommendations.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-blue-500/20 flex flex-wrap gap-2">
                                                {insights.storytelling.recommendations.map((r, i) => (
                                                    <span key={i} className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs">
                                                        ✓ {r}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Row 3: Video Length & Upload Schedule */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {insights.videoLength && (
                                            <div className="bg-[var(--color-surface)] rounded-xl border border-orange-500/30 p-4">
                                                <h4 className="text-md font-bold text-orange-400 mb-3">⏱️ 영상 길이 분석</h4>
                                                <div className="text-sm text-gray-300 space-y-2">
                                                    {insights.videoLength.avgDuration && (
                                                        <p><span className="text-orange-400">평균:</span> {insights.videoLength.avgDuration}</p>
                                                    )}
                                                    {insights.videoLength.optimalRange && (
                                                        <p><span className="text-orange-400">최적 범위:</span> {insights.videoLength.optimalRange}</p>
                                                    )}
                                                    {insights.videoLength.recommendations?.map((r, i) => (
                                                        <p key={i} className="text-gray-400 text-xs">✓ {r}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {insights.uploadSchedule && (
                                            <div className="bg-[var(--color-surface)] rounded-xl border border-cyan-500/30 p-4">
                                                <h4 className="text-md font-bold text-cyan-400 mb-3">📅 업로드 전략 분석</h4>
                                                <div className="text-sm text-gray-300 space-y-2">
                                                    {insights.uploadSchedule.bestDays && (
                                                        <p><span className="text-cyan-400">추천 요일:</span> {insights.uploadSchedule.bestDays}</p>
                                                    )}
                                                    {insights.uploadSchedule.bestTimes && (
                                                        <p><span className="text-cyan-400">추천 시간:</span> {insights.uploadSchedule.bestTimes}</p>
                                                    )}
                                                    {insights.uploadSchedule.frequency && (
                                                        <p><span className="text-cyan-400">업로드 주기:</span> {insights.uploadSchedule.frequency}</p>
                                                    )}
                                                    {insights.uploadSchedule.recommendations?.map((r, i) => (
                                                        <p key={i} className="text-gray-400 text-xs">✓ {r}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Export Button */}
                            <button
                                onClick={handleExportReport}
                                className="w-full py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-gray-400 hover:text-white hover:border-[var(--color-primary)] transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
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
                        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                <Sparkles className="text-[var(--color-primary)]" size={20} />
                                분석 결과를 워크플로우에 적용
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">
                                트렌드 분석에서 얻은 인사이트를 실제 제작 워크플로우에 적용합니다.
                            </p>

                            {(!storytellingInsights && !thumbnailInsights) ? (
                                <div className="text-center py-8 text-gray-500">
                                    <RefreshCw size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>먼저 "트렌드 분석" 탭에서 AI 인사이트를 생성해주세요.</p>
                                    <button
                                        onClick={() => setActiveTab('trends')}
                                        className="mt-4 text-[var(--color-primary)] hover:underline"
                                    >
                                        트렌드 분석으로 이동 →
                                    </button>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Step 1 Application */}
                                    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-bold text-white flex items-center gap-2">
                                                📝 Step 1에 적용
                                            </h4>
                                            {applySuccess.step1 && (
                                                <span className="text-green-400 text-sm flex items-center gap-1">
                                                    <CheckCircle2 size={14} /> 적용됨
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3">
                                            후킹멘트, 스토리 전개방식, 카메라 워크 팁 → Step 3 대본 생성에 영향
                                        </p>
                                        <textarea
                                            value={storytellingInsights}
                                            onChange={(e) => setStorytellingInsights(e.target.value)}
                                            className="w-full h-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-gray-300 resize-none focus:border-[var(--color-primary)] outline-none"
                                            placeholder="스토리텔링 인사이트..."
                                        />
                                        <button
                                            onClick={handleApplyToStep1}
                                            disabled={!storytellingInsights}
                                            className="mt-3 w-full py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg font-medium hover:bg-blue-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            <ArrowRight size={16} />
                                            Step 1에 적용
                                        </button>
                                    </div>

                                    {/* Step 5 Application */}
                                    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-bold text-white flex items-center gap-2">
                                                🖼️ Step 5에 적용
                                            </h4>
                                            {applySuccess.step5 && (
                                                <span className="text-green-400 text-sm flex items-center gap-1">
                                                    <CheckCircle2 size={14} /> 적용됨
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3">
                                            썸네일 색감, 텍스트 배치, 구도 팁 → Step 5 썸네일 제작에 참고
                                        </p>
                                        <textarea
                                            value={thumbnailInsights}
                                            onChange={(e) => setThumbnailInsights(e.target.value)}
                                            className="w-full h-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-gray-300 resize-none focus:border-[var(--color-primary)] outline-none"
                                            placeholder="썸네일 인사이트..."
                                        />
                                        <button
                                            onClick={handleApplyToStep5}
                                            disabled={!thumbnailInsights}
                                            className="mt-3 w-full py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-medium hover:bg-purple-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            <ArrowRight size={16} />
                                            Step 5에 적용
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Navigate to Steps */}
                            {(applySuccess.step1 || applySuccess.step5) && (
                                <div className="mt-6 flex gap-4 justify-center">
                                    <button
                                        onClick={() => navigate('/step/1')}
                                        className="px-4 py-2 bg-[var(--color-primary)] text-black font-medium rounded-lg flex items-center gap-2"
                                    >
                                        Step 1으로 이동 <ChevronRight size={16} />
                                    </button>
                                    <button
                                        onClick={() => navigate('/step/5')}
                                        className="px-4 py-2 bg-white/10 text-white font-medium rounded-lg flex items-center gap-2 hover:bg-white/20"
                                    >
                                        Step 5으로 이동 <ChevronRight size={16} />
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
