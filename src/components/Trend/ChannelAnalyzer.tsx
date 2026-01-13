/**
 * ChannelAnalyzer Component
 * Panel for analyzing user's own YouTube channel
 */

import React, { useState } from 'react';
import { Search, Loader2, Users, Video, Eye, TrendingUp, AlertCircle, Download } from 'lucide-react';
import type { ChannelAnalysis as ChannelAnalysisType } from '../../store/types';
import { getChannelAnalysis, formatViewCount } from '../../services/youtube';
import { TrendVideoCardCompact } from './TrendVideoCard';

interface ChannelAnalyzerProps {
    apiKey: string;
    onAnalysisComplete?: (analysis: ChannelAnalysisType) => void;
}

export const ChannelAnalyzer: React.FC<ChannelAnalyzerProps> = ({
    apiKey,
    onAnalysisComplete
}) => {
    const [channelUrl, setChannelUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<ChannelAnalysisType | null>(null);
    const [aiInsights, setAiInsights] = useState<string | null>(null);
    const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

    const handleAnalyze = async () => {
        if (!channelUrl.trim() || !apiKey) return;

        setIsLoading(true);
        setError(null);
        setAnalysis(null);
        setAiInsights(null);

        try {
            const result = await getChannelAnalysis(apiKey, channelUrl);
            setAnalysis(result);
            onAnalysisComplete?.(result);
        } catch (err: any) {
            setError(err.message || 'Failed to analyze channel');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateInsights = async () => {
        if (!analysis || !apiKey) return;

        setIsGeneratingInsights(true);
        try {
            // Import gemini dynamically to avoid circular deps
            const { analyzeChannelForInsights } = await import('../../services/gemini');
            const insights = await analyzeChannelForInsights(apiKey, analysis);
            setAiInsights(insights);
        } catch (err: any) {
            console.error('Failed to generate AI insights:', err);
            setError('AI 분석 생성 실패: ' + (err.message || 'Unknown error'));
        } finally {
            setIsGeneratingInsights(false);
        }
    };

    const handleExportReport = () => {
        if (!analysis) return;

        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `${date}_채널분석_${analysis.channelName.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.md`;

        let content = `# 채널 분석 리포트: ${analysis.channelName}\n\n`;
        content += `**분석일:** ${new Date().toLocaleDateString('ko-KR')}\n\n`;
        content += `## 📊 채널 개요\n\n`;
        content += `- **구독자:** ${formatViewCount(analysis.subscriberCount)}\n`;
        content += `- **총 영상 수:** ${analysis.videoCount}\n`;
        content += `- **총 조회수:** ${formatViewCount(analysis.viewCount)}\n`;
        content += `- **평균 조회수:** ${formatViewCount(analysis.avgViews)}\n`;
        content += `- **평균 참여율:** ${analysis.avgEngagement}%\n\n`;

        content += `## 🏆 인기 영상 Top 5\n\n`;
        analysis.topVideos.forEach((video, i) => {
            content += `${i + 1}. **${video.title}**\n`;
            content += `   - 조회수: ${formatViewCount(video.viewCount)} | 참여율: ${((video.likeCount + video.commentCount) / video.viewCount * 100).toFixed(2)}%\n`;
            content += `   - 링크: https://youtube.com/watch?v=${video.id}\n\n`;
        });

        if (aiInsights) {
            content += `## 🤖 AI 개선 제안\n\n${aiInsights}\n`;
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
        <div className="space-y-6">
            {/* Search Input */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Users size={20} className="text-[var(--color-primary)]" />
                    내 채널 분석
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                    유튜브 채널 URL 또는 @핸들을 입력하면 채널의 성과를 분석하고 개선 사항을 제안합니다.
                </p>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={channelUrl}
                        onChange={(e) => setChannelUrl(e.target.value)}
                        placeholder="https://youtube.com/@channelname 또는 @channelname"
                        className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-[var(--color-primary)] outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                    />
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading || !channelUrl.trim()}
                        className="px-4 py-2 bg-[var(--color-primary)] text-black font-bold rounded-lg hover:bg-[var(--color-primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <Search size={18} />
                        )}
                        분석
                    </button>
                </div>

                {error && (
                    <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}
            </div>

            {/* Analysis Results */}
            {analysis && (
                <>
                    {/* Channel Overview */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                        <div className="flex items-start gap-4 mb-4">
                            {analysis.channelThumbnail && (
                                <img
                                    src={analysis.channelThumbnail}
                                    alt={analysis.channelName}
                                    className="w-20 h-20 rounded-full object-cover border-2 border-[var(--color-primary)]"
                                />
                            )}
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white">{analysis.channelName}</h3>
                                <div className="flex flex-wrap gap-4 mt-2 text-sm">
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <Users size={14} className="text-blue-400" />
                                        <span className="text-white font-medium">{formatViewCount(analysis.subscriberCount)}</span>
                                        구독자
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <Video size={14} className="text-purple-400" />
                                        <span className="text-white font-medium">{analysis.videoCount}</span>
                                        영상
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <Eye size={14} className="text-green-400" />
                                        <span className="text-white font-medium">{formatViewCount(analysis.viewCount)}</span>
                                        총 조회
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                                <div className="text-xs text-gray-500 mb-1">평균 조회수</div>
                                <div className="text-xl font-bold text-white">{formatViewCount(analysis.avgViews)}</div>
                            </div>
                            <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                                <div className="text-xs text-gray-500 mb-1">평균 참여율</div>
                                <div className={`text-xl font-bold ${analysis.avgEngagement > 5 ? 'text-green-400' : analysis.avgEngagement > 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {analysis.avgEngagement}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Top Videos */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                        <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                            <TrendingUp size={16} className="text-[var(--color-primary)]" />
                            인기 영상 Top 5
                        </h4>
                        <div className="space-y-2">
                            {analysis.topVideos.map((video, index) => (
                                <TrendVideoCardCompact key={video.id} video={video} rank={index + 1} />
                            ))}
                        </div>
                    </div>

                    {/* AI Insights */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-md font-bold text-white flex items-center gap-2">
                                🤖 AI 개선 제안
                            </h4>
                            {!aiInsights && (
                                <button
                                    onClick={handleGenerateInsights}
                                    disabled={isGeneratingInsights}
                                    className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/30 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isGeneratingInsights ? (
                                        <Loader2 className="animate-spin" size={14} />
                                    ) : (
                                        '✨ 분석 생성'
                                    )}
                                </button>
                            )}
                        </div>

                        {aiInsights ? (
                            <div className="prose prose-invert prose-sm max-w-none">
                                <div className="whitespace-pre-wrap text-gray-300 text-sm leading-relaxed">
                                    {aiInsights}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                "분석 생성" 버튼을 클릭하면 AI가 채널 개선 사항을 분석해드립니다.
                            </p>
                        )}
                    </div>

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
    );
};
