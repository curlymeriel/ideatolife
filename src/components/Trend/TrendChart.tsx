/**
 * TrendChart Component
 * Bar chart visualization for YouTube trend topics (hashtags & categories)
 * Bubble chart removed per user request
 */

import React, { useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import type { YouTubeTrendTopic } from '../../store/types';
import { formatViewCount } from '../../services/youtube';
import { Hash, Tag, BarChart2 } from 'lucide-react';

interface TrendChartProps {
    topics: YouTubeTrendTopic[];
    onTopicClick: (topic: YouTubeTrendTopic) => void;
    selectedTopicId?: string;
}

type SortMode = 'views' | 'engagement' | 'videoCount';

export const TrendChart: React.FC<TrendChartProps> = ({
    topics,
    onTopicClick,
    selectedTopicId
}) => {
    const [sortMode, setSortMode] = useState<SortMode>('views');

    // Sort topics based on mode
    const sortedTopics = [...topics].sort((a, b) => {
        if (sortMode === 'views') return b.avgViews - a.avgViews;
        if (sortMode === 'engagement') return b.avgEngagement - a.avgEngagement;
        return b.videoCount - a.videoCount;
    });

    // Prepare data for charts
    const chartData = sortedTopics.slice(0, 12).map(topic => ({
        ...topic,
        name: topic.translatedTopic ? `${topic.topic} (${topic.translatedTopic})` : topic.topic, // Full name without truncation
        fullName: topic.topic,
        displayName: topic.translatedTopic
            ? `${topic.topic} (${topic.translatedTopic})`
            : topic.topic,
        views: topic.avgViews,
        engagement: topic.avgEngagement,
        videoCount: topic.videoCount, // Add videoCount for chart data
    }));

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="glass-panel p-3 border border-[var(--color-border-highlight)] shadow-xl max-w-xs z-50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            {data.topicType === 'hashtag' ? <Hash size={14} /> : <Tag size={14} />}
                        </div>
                        <p className="font-bold text-white break-words">{data.fullName}</p>
                    </div>
                    {data.translatedTopic && (
                        <p className="text-xs text-[var(--color-text-muted)] mb-1">
                            {data.translatedTopic}
                        </p>
                    )}
                    {data.topicMeaning && (
                        <p className="text-xs text-gray-400 mb-2 italic">
                            💡 {data.topicMeaning}
                        </p>
                    )}
                    <div className="space-y-1 text-sm bg-black/20 p-2 rounded">
                        <p className="text-gray-400 flex justify-between">
                            <span>조회수:</span> <span className="text-white font-mono">{formatViewCount(data.avgViews)}</span>
                        </p>
                        <p className="text-gray-400 flex justify-between">
                            <span>참여율:</span> <span className="text-[var(--color-primary)] font-mono">{data.avgEngagement}%</span>
                        </p>
                        <p className="text-gray-400 flex justify-between">
                            <span>영상 수:</span> <span className="text-gray-300 font-mono">{data.videoCount}개</span>
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };


    return (
        <div className="glass-panel p-6">
            {/* Controls */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart2 size={18} className="text-[var(--color-primary)]" />
                    Top 12 트렌드 키워드
                    <span className="text-[10px] text-[var(--color-text-muted)] font-normal px-2 py-0.5 bg-[var(--color-surface)] rounded-full border border-[var(--color-border)]">
                        * 막대를 클릭하여 영상 필터링
                    </span>
                </span>

                {/* Sort */}
                <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-[var(--color-border)]">
                    <span className="text-[10px] text-gray-400 px-2">정렬:</span>
                    <button
                        onClick={() => setSortMode('views')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${sortMode === 'views'
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        조회수
                    </button>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <button
                        onClick={() => setSortMode('engagement')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${sortMode === 'engagement'
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        참여율
                    </button>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <button
                        onClick={() => setSortMode('videoCount')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${sortMode === 'videoCount'
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        영상 수
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px] w-full">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                            <XAxis
                                type="number"
                                tickFormatter={(value) => sortMode === 'engagement' ? `${value}%` : formatViewCount(value)}
                                stroke="rgba(255,255,255,0.2)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: 'rgba(255,255,255,0.4)' }}
                            />
                            <YAxis
                                dataKey="displayName"
                                type="category"
                                width={180}
                                stroke="rgba(255,255,255,0.2)"
                                fontSize={12}
                                tick={{ fill: 'rgba(255,255,255,0.8)' }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar
                                dataKey={sortMode === 'views' ? 'views' : sortMode === 'engagement' ? 'engagement' : 'videoCount'}
                                radius={[0, 4, 4, 0]}
                                cursor="pointer"
                                barSize={20}
                                onClick={(data: any) => {
                                    const topic = topics.find(t => t.topic === data?.fullName);
                                    if (topic) onTopicClick(topic);
                                }}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill="var(--color-primary)" // Base fill
                                        style={{
                                            // Apply opacity via CSS custom property or directly if supported, 
                                            // but since fill is set, we use opacity for fading effect
                                            opacity: entry.id === selectedTopicId
                                                ? 1
                                                : 0.3 + (0.7 * (chartData.length - index) / chartData.length) // Gradient opacity based on rank
                                        }}
                                        stroke={entry.id === selectedTopicId ? "var(--color-primary)" : "none"}
                                        strokeWidth={2}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 flex-col gap-3">
                        <div className="p-4 rounded-full bg-white/5">
                            <BarChart2 size={32} className="opacity-50" />
                        </div>
                        <span>선택한 분류에 해당하는 데이터가 없습니다.</span>
                    </div>
                )}
            </div>
        </div>
    );
};
