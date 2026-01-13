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
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-hidden hover:border-[var(--color-primary)]/50 transition-all group">
            {/* Thumbnail */}
            <div className="relative aspect-video">
                <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                {rank && (
                    <div className="absolute top-2 left-2 w-8 h-8 bg-[var(--color-primary)] text-black font-bold rounded-full flex items-center justify-center text-sm">
                        {rank}
                    </div>
                )}
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                    {parseDuration(video.duration)}
                </div>
                {/* YouTube Link Overlay */}
                <a
                    href={`https://youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                    <ExternalLink className="text-white" size={24} />
                </a>
            </div>

            {/* Content */}
            <div className="p-3">
                {/* Title */}
                <h3 className="font-medium text-sm text-white line-clamp-2 mb-1 leading-tight">
                    {video.title}
                </h3>
                {video.titleKorean && video.titleKorean !== video.title && (
                    <p className="text-xs text-[var(--color-primary)] line-clamp-1 mb-2">
                        {video.titleKorean}
                    </p>
                )}

                {/* Channel */}
                <p className="text-xs text-gray-400 truncate mb-2">{video.channelName}</p>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {formatViewCount(video.viewCount)}
                    </span>
                    <span className="flex items-center gap-1">
                        <ThumbsUp size={12} />
                        {formatViewCount(video.likeCount)}
                    </span>
                    <span className="flex items-center gap-1">
                        <MessageCircle size={12} />
                        {formatViewCount(video.commentCount)}
                    </span>
                </div>

                {/* Engagement Badge */}
                <div className="mt-2 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${engagementRate > 5 ? 'bg-green-500/20 text-green-400' :
                        engagementRate > 2 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                        }`}>
                        참여율 {engagementRate}%
                    </span>
                </div>

                {/* Analysis Section (if provided) */}
                {showAnalysis && video.analysis && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                        {video.analysis.hookStyle && (
                            <p className="text-xs text-gray-400 mb-1">
                                <span className="text-purple-400">🎣 후킹:</span> {video.analysis.hookStyle}
                            </p>
                        )}
                        {video.analysis.thumbnailKeyElements && (
                            <p className="text-xs text-gray-400 mb-1">
                                <span className="text-blue-400">🖼️ 썸네일:</span> {video.analysis.thumbnailKeyElements}
                            </p>
                        )}
                        {video.analysis.titlePattern && (
                            <p className="text-xs text-gray-400">
                                <span className="text-green-400">📝 제목:</span> {video.analysis.titlePattern}
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
            className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-all"
        >
            {/* Rank */}
            {rank && (
                <div className="w-6 h-6 bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-bold rounded-full flex items-center justify-center text-xs flex-shrink-0">
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
                <h4 className="text-sm text-white truncate">{video.title}</h4>
                <p className="text-xs text-gray-500 truncate">{video.channelName}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <span>{formatViewCount(video.viewCount)} views</span>
                    <span className="text-green-400">{calculateEngagementRate(video)}% 참여</span>
                </div>
            </div>

            <ExternalLink size={14} className="text-gray-500 flex-shrink-0" />
        </a>
    );
};
