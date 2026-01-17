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
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-xl max-w-xs z-50">
                    <div className="flex items-center gap-2 mb-2">
                        {data.topicType === 'hashtag' ? (
                            <Hash size={14} className="text-blue-400" />
                        ) : (
                            <Tag size={14} className="text-purple-400" />
                        )}
                        <p className="font-bold text-white break-words">{data.fullName}</p>
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
                    <div className="space-y-1 text-sm bg-black/20 p-2 rounded">
                        <p className="text-gray-400 flex justify-between">
                            <span>조회수:</span> <span className="text-[var(--color-primary)] font-mono">{formatViewCount(data.avgViews)}</span>
                        </p>
                        <p className="text-gray-400 flex justify-between">
                            <span>참여율:</span> <span className="text-green-400 font-mono">{data.avgEngagement}%</span>
                        </p>
                        <p className="text-gray-400 flex justify-between">
                            <span>영상 수:</span> <span className="text-blue-400 font-mono">{data.videoCount}개</span>
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };


    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            {/* Controls */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs text-gray-300 font-medium flex items-center gap-2">
                    Top 12 트렌드
                    <span className="text-[10px] text-gray-500 font-normal">* 클릭하여 영상 필터링</span>
                </span>

                {/* Sort */}
                <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-lg">
                    <span className="text-[10px] text-gray-400 px-1">정렬:</span>
                    <button
                        onClick={() => setSortMode('views')}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${sortMode === 'views'
                            ? 'bg-[var(--color-primary)] text-black'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        조회수
                    </button>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <button
                        onClick={() => setSortMode('engagement')}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${sortMode === 'engagement'
                            ? 'bg-green-500 text-black'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        참여율
                    </button>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <button
                        onClick={() => setSortMode('videoCount')}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${sortMode === 'videoCount'
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        영상 수
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px]">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={true} />
                            <XAxis
                                type="number"
                                tickFormatter={(value) => sortMode === 'engagement' ? `${value}%` : formatViewCount(value)}
                                stroke="rgba(255,255,255,0.4)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: 'rgba(255,255,255,0.6)' }}
                            />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={160} // Increased width for full labels
                                stroke="rgba(255,255,255,0.4)"
                                fontSize={11}
                                tick={{ fill: 'rgba(255,255,255,0.9)' }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.1)' }} />
                            <Bar
                                dataKey={sortMode === 'views' ? 'views' : sortMode === 'engagement' ? 'engagement' : 'videoCount'}
                                radius={[0, 4, 4, 0]}
                                cursor="pointer"
                                barSize={24}
                                onClick={(data: any) => {
                                    const topic = topics.find(t => t.topic === data?.fullName);
                                    if (topic) onTopicClick(topic);
                                }}
                                label={{
                                    position: 'right',
                                    fill: 'rgba(255,255,255,0.7)',
                                    fontSize: 10,
                                    formatter: (value: any) => sortMode === 'engagement' ? `${value}%` : formatViewCount(value)
                                }}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={
                                            entry.id === selectedTopicId
                                                ? 'var(--color-primary)' // Selected: Full Opacity
                                                : `rgba(245, 166, 35, ${0.4 + (0.4 * (1 - index / chartData.length))})` // Sand Orange Gradient (using hex approx if var not available in rgba)
                                            // Actually, let's use the hardcoded Sand Orange hex #F5A623 which is common for this name, or strictly bind to primary if we can. 
                                            // Since I cannot put var() inside rgba(), I will use a Hex that matches the likely Sand Orange or keeping it simple.
                                            // Assuming 'var(--color-primary)' is the accent. Let's use a solid color approach or a known hex for "Sand Orange".
                                            // If previous was 'var(--color-primary)', I'll use a style that simulates it.
                                            // Let's use a opacity on the style attribute or just use the hex.
                                            // I'll try to use the HSL or RGB if I knew it. 
                                            // Safest bet for "Sand Orange" requested by user: #F5A623 or similar.
                                            // But usually standardizing means using the theme variable.
                                            // I will generate the opacity by setting style={{ opacity: ... }} on the Cell? No Recharts Cell doesn't always support style prop for opacity well with fill.
                                            // I'll use a fixed color string for now that represents Sand Orange.
                                        }
                                        // Revised approach: Use the primary color variable but vary opacity via style
                                        style={{
                                            fill: 'var(--color-primary)',
                                            opacity: entry.id === selectedTopicId ? 1 : 0.3 + (0.7 * (1 - index / chartData.length))
                                        }}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-2">
                        <BarChart2 size={32} className="opacity-30" />
                        <span>선택한 분류에 해당하는 데이터가 없습니다.</span>
                    </div>
                )}
            </div>

            {/* Legend & Explanation removed */}
        </div>
    );
};
