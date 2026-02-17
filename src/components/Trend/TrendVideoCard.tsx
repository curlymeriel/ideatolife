/**
 * TrendVideoCard Component
 * Individual video card for trend analysis display
 */

import React from 'react';
import { ExternalLink, ThumbsUp, MessageCircle, Eye } from 'lucide-react';
import type { YouTubeTrendVideo } from '../../store/types';
import { formatViewCount, parseDuration, calculateEngagementRate } from '../../services/youtube';

interface TrendVideoCardProps {
    video: YouTubeTrendVideo;
    rank?: number;
    showAnalysis?: boolean;
}

export const TrendVideoCard: React.FC<TrendVideoCardProps> = ({
    video,
    rank,
    showAnalysis = false
}) => {
    const engagementRate = calculateEngagementRate(video);

    return (
        <div className="glass-panel border-transparent hover:border-[var(--color-primary)]/50 transition-all group relative overflow-hidden">
            {/* Thumbnail */}
            <div className="relative aspect-video rounded-lg overflow-hidden mb-3">
                <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                {rank && (
                    <div className="absolute top-2 left-2 w-8 h-8 bg-[var(--color-primary)] text-black font-bold rounded-lg flex items-center justify-center text-sm shadow-lg">
                        {rank}
                    </div>
                )}
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {parseDuration(video.duration)}
                </div>
                {/* YouTube Link Overlay */}
                <a
                    href={`https://youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                    <ExternalLink className="text-white drop-shadow-lg" size={32} />
                </a>
            </div>

            {/* Content */}
            <div>
                {/* Title */}
                <h3 className="font-bold text-sm text-white line-clamp-2 mb-1 leading-snug group-hover:text-[var(--color-primary)] transition-colors">
                    {video.title}
                </h3>
                {video.titleKorean && video.titleKorean !== video.title && (
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-1 mb-2">
                        {video.titleKorean}
                    </p>
                )}

                {/* Channel & Date */}
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-400 truncate flex-1 hover:text-white transition-colors">{video.channelName}</p>
                    <p className="text-[10px] text-gray-500 flex-shrink-0">
                        {new Date(video.publishedAt).toLocaleDateString()}
                    </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] bg-black/20 p-2 rounded-lg justify-between">
                    <span className="flex items-center gap-1.5">
                        <Eye size={12} className="text-[var(--color-primary)]" />
                        {formatViewCount(video.viewCount)}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <ThumbsUp size={12} />
                        {formatViewCount(video.likeCount)}
                    </span>
                </div>

                {/* Engagement Badge */}
                <div className="mt-3 flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${engagementRate > 3
                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                        : 'bg-white/5 text-gray-400 border border-white/10'
                        }`}>
                        참여율 {engagementRate}%
                    </span>
                </div>

                {/* Analysis Section (if provided) */}
                {showAnalysis && video.analysis && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1.5">
                        {video.analysis.hookStyle && (
                            <p className="text-xs text-gray-400 flex items-start gap-2">
                                <span className="text-[var(--color-primary)] min-w-[30px] font-medium">후킹</span>
                                <span className="text-gray-300">{video.analysis.hookStyle}</span>
                            </p>
                        )}
                        {video.analysis.thumbnailKeyElements && (
                            <p className="text-xs text-gray-400 flex items-start gap-2">
                                <span className="text-[var(--color-primary)] min-w-[30px] font-medium">썸네일</span>
                                <span className="text-gray-300">{video.analysis.thumbnailKeyElements}</span>
                            </p>
                        )}
                        {video.analysis.titlePattern && (
                            <p className="text-xs text-gray-400 flex items-start gap-2">
                                <span className="text-[var(--color-primary)] min-w-[30px] font-medium">제목</span>
                                <span className="text-gray-300">{video.analysis.titlePattern}</span>
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Compact version for list views
 */
export const TrendVideoCardCompact: React.FC<TrendVideoCardProps> = ({
    video,
    rank
}) => {
    return (
        <a
            href={`https://youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-all group"
        >
            {/* Rank */}
            {rank && (
                <div className="w-6 h-6 bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-bold rounded-md flex items-center justify-center text-xs flex-shrink-0">
                    {rank}
                </div>
            )}

            {/* Thumbnail */}
            <div className="relative w-24 h-14 flex-shrink-0 rounded overflow-hidden">
                <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                    {parseDuration(video.duration)}
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <h4 className="text-sm text-gray-200 truncate group-hover:text-[var(--color-primary)] transition-colors">{video.title}</h4>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-gray-500 truncate flex-1">{video.channelName}</p>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">
                        {new Date(video.publishedAt).toLocaleDateString()}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>{formatViewCount(video.viewCount)}</span>
                    <span className={`${calculateEngagementRate(video) > 3 ? 'text-[var(--color-primary)]' : 'text-gray-500'}`}>
                        {calculateEngagementRate(video)}% 참여
                    </span>
                </div>
            </div>

            <ExternalLink size={14} className="text-gray-600 group-hover:text-white transition-colors flex-shrink-0" />
        </a>
    );
};
