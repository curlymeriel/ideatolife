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
import { Hash, Tag } from 'lucide-react';

interface TrendChartProps {
    topics: YouTubeTrendTopic[];
    onTopicClick: (topic: YouTubeTrendTopic) => void;
    selectedTopicId?: string;
    onFilterChange?: (filter: 'all' | 'hashtag' | 'category') => void;
}

type SortMode = 'views' | 'engagement';
type FilterMode = 'all' | 'hashtag' | 'category';

export const TrendChart: React.FC<TrendChartProps> = ({
    topics,
    onTopicClick,
    selectedTopicId,
    onFilterChange
}) => {
    const [sortMode, setSortMode] = useState<SortMode>('views');
    const [filterMode, setFilterMode] = useState<FilterMode>('all');

    // Handle filter change
    const handleFilterChange = (mode: FilterMode) => {
        setFilterMode(mode);
        onFilterChange?.(mode);
    };

    // Filter topics based on mode
    const filteredTopics = filterMode === 'all'
        ? topics
        : topics.filter(t => t.topicType === filterMode);

    // Sort topics based on mode
    const sortedTopics = [...filteredTopics].sort((a, b) => {
        if (sortMode === 'views') {
            return b.avgViews - a.avgViews;
        }
        return b.avgEngagement - a.avgEngagement;
    });

    // Prepare data for charts
    const chartData = sortedTopics.slice(0, 12).map(topic => ({
        ...topic,
        name: topic.topic.length > 12 ? topic.topic.slice(0, 12) + '...' : topic.topic,
        fullName: topic.topic,
        displayName: topic.translatedTopic
            ? `${topic.topic} (${topic.translatedTopic})`
            : topic.topic,
        views: topic.avgViews,
        engagement: topic.avgEngagement,
    }));

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-xl max-w-xs">
                    <div className="flex items-center gap-2 mb-2">
                        {data.topicType === 'hashtag' ? (
                            <Hash size={14} className="text-blue-400" />
                        ) : (
                            <Tag size={14} className="text-purple-400" />
                        )}
                        <p className="font-bold text-white">{data.fullName}</p>
                    </div>
                    {data.translatedTopic && (
                        <p className="text-xs text-[var(--color-primary)] mb-1">
                            {data.translatedTopic}
                        </p>
                    )}
                    {data.topicMeaning && (
                        <p className="text-xs text-gray-400 mb-2 italic">
                            💡 {data.topicMeaning}
                        </p>
                    )}
                    <div className="space-y-1 text-sm">
                        <p className="text-gray-400">
                            조회수: <span className="text-[var(--color-primary)]">{formatViewCount(data.avgViews)}</span>
                        </p>
                        <p className="text-gray-400">
                            참여율: <span className="text-green-400">{data.avgEngagement}%</span>
                        </p>
                        <p className="text-gray-400">
                            영상 수: <span className="text-blue-400">{data.videoCount}</span>
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };

    const hashtagCount = topics.filter(t => t.topicType === 'hashtag').length;
    const categoryCount = topics.filter(t => t.topicType === 'category').length;

    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            {/* Controls */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                {/* Filter: Hashtag vs Category */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">분류:</span>
                    <button
                        onClick={() => handleFilterChange('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${filterMode === 'all'
                                ? 'bg-[var(--color-primary)] text-black'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        📊 전체
                    </button>
                    <button
                        onClick={() => handleFilterChange('hashtag')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${filterMode === 'hashtag'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <Hash size={12} /> 해시태그 ({hashtagCount})
                    </button>
                    <button
                        onClick={() => handleFilterChange('category')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${filterMode === 'category'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        <Tag size={12} /> 주제 ({categoryCount})
                    </button>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">정렬:</span>
                    <button
                        onClick={() => setSortMode('views')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortMode === 'views'
                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        조회수 ▼
                    </button>
                    <button
                        onClick={() => setSortMode('engagement')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortMode === 'engagement'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        참여율 ▼
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="h-80">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                                type="number"
                                tickFormatter={(value) => formatViewCount(value)}
                                stroke="rgba(255,255,255,0.3)"
                                fontSize={10}
                            />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={100}
                                stroke="rgba(255,255,255,0.3)"
                                fontSize={11}
                                tick={{ fill: 'rgba(255,255,255,0.7)' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar
                                dataKey={sortMode === 'views' ? 'views' : 'engagement'}
                                radius={[0, 4, 4, 0]}
                                cursor="pointer"
                                onClick={(data: any) => {
                                    const topic = topics.find(t => t.topic === data?.fullName);
                                    if (topic) onTopicClick(topic);
                                }}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={
                                            entry.id === selectedTopicId
                                                ? 'var(--color-primary)'
                                                : entry.topicType === 'hashtag'
                                                    ? `rgba(59, 130, 246, ${0.4 + (0.6 * (1 - index / chartData.length))})`
                                                    : `rgba(168, 85, 247, ${0.4 + (0.6 * (1 - index / chartData.length))})`
                                        }
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        선택한 분류에 해당하는 데이터가 없습니다.
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-blue-500" /> #해시태그
                </span>
                <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-purple-500" /> 주제/카테고리
                </span>
                <span className="text-gray-600">• 클릭하면 상세 영상 확인</span>
            </div>
        </div>
    );
};
