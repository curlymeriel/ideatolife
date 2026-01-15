/**
 * YouTube Data API v3 Service
 * 
 * Uses the same Gemini API key (requires YouTube Data API v3 to be enabled in Google Cloud Console)
 */

import type { RegionCode, YouTubeTrendTopic, YouTubeTrendVideo, ChannelAnalysis, YouTubeCategoryId } from '../store/types';
import { YOUTUBE_CATEGORIES } from '../store/types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Region code to YouTube region mapping
const REGION_MAP: Record<RegionCode, string> = {
    'KR': 'KR',
    'JP': 'JP',
    'FR': 'FR',
    'DE': 'DE',
    'ES': 'ES',
    'US': 'US',
    'Global': 'US', // Global uses US trending as default
};

// Region display names (for UI)
export const REGION_NAMES: Record<RegionCode, { name: string; flag: string }> = {
    'KR': { name: '한국', flag: '🇰🇷' },
    'JP': { name: '日本', flag: '🇯🇵' },
    'FR': { name: 'France', flag: '🇫🇷' },
    'DE': { name: 'Deutschland', flag: '🇩🇪' },
    'ES': { name: 'España', flag: '🇪🇸' },
    'US': { name: 'USA', flag: '🇺🇸' },
    'Global': { name: 'Global', flag: '🌍' },
};

/**
 * Fetch trending videos for a specific region
 * Fetches up to 200 videos to ensure better topic clustering
 */
/**
 * Fetch "Mix" trending videos by aggregating from multiple categories
 * This replaces the deprecated general "mostPopular" chart which now returns limited/empty results.
 */
export async function fetchTrendingVideos(
    apiKey: string,
    regionCode: RegionCode,
    maxResults: number = 50
): Promise<YouTubeTrendVideo[]> {
    const categories: YouTubeCategoryId[] = ['10', '20', '25', '44']; // Music, Gaming, News, Movies
    const resultsPerCategory = Math.ceil(maxResults / categories.length);
    let allVideos: YouTubeTrendVideo[] = [];

    // Fetch from each category in parallel
    const promises = categories.map(catId =>
        fetchVideosByCategory(apiKey, regionCode, catId, resultsPerCategory)
            .catch(e => {
                console.warn(`[YouTube Mix] Failed to fetch category ${catId}:`, e);
                return [];
            })
    );

    const results = await Promise.all(promises);

    // Combine and shuffle results for a "Mix" feel
    results.forEach(videoList => {
        allVideos = [...allVideos, ...videoList];
    });

    // Sort by view count to keep some relevance, or shuffle?
    // Let's sort by view count to show "Top" mix
    allVideos.sort((a, b) => b.viewCount - a.viewCount);

    return allVideos.slice(0, maxResults);
}

/**
 * Search videos by keyword/hashtag
 */
export async function searchVideos(
    apiKey: string,
    query: string,
    regionCode: RegionCode,
    maxResults: number = 25
): Promise<YouTubeTrendVideo[]> {
    const region = REGION_MAP[regionCode];

    try {
        // Search for videos
        const searchResponse = await fetch(
            `${YOUTUBE_API_BASE}/search?` +
            `part=snippet&` +
            `type=video&` +
            `q=${encodeURIComponent(query)}&` +
            `regionCode=${region}&` +
            `order=viewCount&` +
            `maxResults=${maxResults}&` +
            `key=${apiKey}`
        );

        if (!searchResponse.ok) {
            const error = await searchResponse.json();
            throw new Error(error.error?.message || 'Failed to search videos');
        }

        const searchData = await searchResponse.json();
        const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

        if (!videoIds) return [];

        // Get video details (views, likes, etc.)
        const detailsResponse = await fetch(
            `${YOUTUBE_API_BASE}/videos?` +
            `part=snippet,statistics,contentDetails&` +
            `id=${videoIds}&` +
            `key=${apiKey}`
        );

        if (!detailsResponse.ok) {
            const error = await detailsResponse.json();
            throw new Error(error.error?.message || 'Failed to get video details');
        }

        const detailsData = await detailsResponse.json();

        return detailsData.items.map((item: any) => ({
            id: item.id,
            title: item.snippet.title,
            channelName: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
            viewCount: parseInt(item.statistics.viewCount || '0'),
            likeCount: parseInt(item.statistics.likeCount || '0'),
            commentCount: parseInt(item.statistics.commentCount || '0'),
            publishedAt: item.snippet.publishedAt,
            duration: item.contentDetails?.duration,
        }));
    } catch (error) {
        console.error('[YouTube API] Error searching videos:', error);
        throw error;
    }
}

/**
 * Get channel information and recent videos
 */
export async function getChannelAnalysis(
    apiKey: string,
    channelInput: string
): Promise<ChannelAnalysis> {
    try {
        let channelId = channelInput;

        // If input looks like a URL, extract channel ID or handle
        if (channelInput.includes('youtube.com') || channelInput.includes('youtu.be')) {
            const urlMatch = channelInput.match(/(?:channel\/|@)([^\/\?]+)/);
            if (urlMatch) {
                channelId = urlMatch[1];
            }
        }

        // If it starts with @, it's a handle - need to search for it
        let actualChannelId = channelId;
        if (channelId.startsWith('@') || !channelId.startsWith('UC')) {
            const searchResponse = await fetch(
                `${YOUTUBE_API_BASE}/search?` +
                `part=snippet&` +
                `type=channel&` +
                `q=${encodeURIComponent(channelId)}&` +
                `maxResults=1&` +
                `key=${apiKey}`
            );

            if (!searchResponse.ok) {
                throw new Error('Failed to find channel');
            }

            const searchData = await searchResponse.json();
            if (searchData.items && searchData.items.length > 0) {
                actualChannelId = searchData.items[0].snippet.channelId;
            } else {
                throw new Error('Channel not found');
            }
        }

        // Get channel details
        const channelResponse = await fetch(
            `${YOUTUBE_API_BASE}/channels?` +
            `part=snippet,statistics,contentDetails&` +
            `id=${actualChannelId}&` +
            `key=${apiKey}`
        );

        if (!channelResponse.ok) {
            const error = await channelResponse.json();
            throw new Error(error.error?.message || 'Failed to get channel info');
        }

        const channelData = await channelResponse.json();

        if (!channelData.items || channelData.items.length === 0) {
            throw new Error('Channel not found');
        }

        const channel = channelData.items[0];
        const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

        // Get recent videos from uploads playlist
        const playlistResponse = await fetch(
            `${YOUTUBE_API_BASE}/playlistItems?` +
            `part=contentDetails&` +
            `playlistId=${uploadsPlaylistId}&` +
            `maxResults=20&` +
            `key=${apiKey}`
        );

        if (!playlistResponse.ok) {
            throw new Error('Failed to get channel videos');
        }

        const playlistData = await playlistResponse.json();
        const videoIds = playlistData.items.map((item: any) => item.contentDetails.videoId).join(',');

        // Get video details
        let recentVideos: YouTubeTrendVideo[] = [];
        if (videoIds) {
            const videosResponse = await fetch(
                `${YOUTUBE_API_BASE}/videos?` +
                `part=snippet,statistics,contentDetails&` +
                `id=${videoIds}&` +
                `key=${apiKey}`
            );

            if (videosResponse.ok) {
                const videosData = await videosResponse.json();
                recentVideos = videosData.items.map((item: any) => ({
                    id: item.id,
                    title: item.snippet.title,
                    channelName: item.snippet.channelTitle,
                    channelId: item.snippet.channelId,
                    thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                    viewCount: parseInt(item.statistics.viewCount || '0'),
                    likeCount: parseInt(item.statistics.likeCount || '0'),
                    commentCount: parseInt(item.statistics.commentCount || '0'),
                    publishedAt: item.snippet.publishedAt,
                    duration: item.contentDetails?.duration,
                }));
            }
        }

        // Calculate average views and engagement
        const totalViews = recentVideos.reduce((sum, v) => sum + v.viewCount, 0);
        const avgViews = recentVideos.length > 0 ? Math.round(totalViews / recentVideos.length) : 0;

        const totalEngagement = recentVideos.reduce((sum, v) =>
            sum + (v.viewCount > 0 ? (v.likeCount + v.commentCount) / v.viewCount : 0), 0);
        const avgEngagement = recentVideos.length > 0 ? totalEngagement / recentVideos.length : 0;

        // Sort by views to get top videos
        const topVideos = [...recentVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);

        return {
            channelId: actualChannelId,
            channelName: channel.snippet.title,
            channelThumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.default?.url,
            subscriberCount: parseInt(channel.statistics.subscriberCount || '0'),
            videoCount: parseInt(channel.statistics.videoCount || '0'),
            viewCount: parseInt(channel.statistics.viewCount || '0'),
            avgViews,
            avgEngagement: Math.round(avgEngagement * 10000) / 100, // Convert to percentage with 2 decimals
            topVideos,
            recentVideos,
        };
    } catch (error) {
        console.error('[YouTube API] Error getting channel analysis:', error);
        throw error;
    }
}

/**
 * Extract top topics from a list of trending videos
 * Supports three types: topic (first word), keyword (all significant words), hashtag
 */
export function extractTopTopics(videos: YouTubeTrendVideo[], topicType: 'hashtag' | 'keyword' | 'topic' = 'topic'): YouTubeTrendTopic[] {
    const dataMap = new Map<string, { videos: YouTubeTrendVideo[]; viewSum: number; engagementSum: number }>();

    // Korean/common stopwords to filter out
    const STOPWORDS = new Set([
        '의', '를', '을', '이', '가', '에', '에서', '으로', '로', '와', '과', '은', '는',
        'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'is', 'are',
        '그', '저', '이런', '저런', '합니다', '있다', '없다', '한다', '된다',
    ]);

    videos.forEach(video => {
        const engagement = video.viewCount > 0
            ? (video.likeCount + video.commentCount) / video.viewCount
            : 0;

        let keys: string[] = [];

        if (topicType === 'hashtag') {
            // Extract hashtags from title
            const hashtagMatches = video.title.match(/#[\w가-힣]+/g) || [];
            keys = hashtagMatches.map(tag => tag.toLowerCase());
        } else if (topicType === 'keyword') {
            // Extract all significant words from title
            const cleaned = video.title
                .replace(/#[\w가-힣]+/g, '') // Remove hashtags
                .replace(/[\[\]【】「」『』()（）]/g, ' ')
                .replace(/[|｜\-:：]/g, ' ')
                .toLowerCase()
                .trim();

            const words = cleaned.split(/\s+/).filter(w =>
                w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)
            );
            keys = words.slice(0, 5); // Max 5 keywords per video
        } else if (topicType === 'topic') {
            // Use official YouTube category (e.g., "Music", "Gaming", "News")
            if (video.categoryName) {
                keys = [video.categoryName.toLowerCase()];
            } else if (video.categoryId) {
                // Fallback to category ID if name not available
                const catInfo = YOUTUBE_CATEGORIES[video.categoryId as YouTubeCategoryId];
                keys = [(catInfo?.title || `Category ${video.categoryId}`).toLowerCase()];
            }
        }

        // Add video to each key's cluster
        keys.forEach(key => {
            const existing = dataMap.get(key) || { videos: [], viewSum: 0, engagementSum: 0 };
            // Avoid duplicate videos in same cluster
            if (!existing.videos.some(v => v.id === video.id)) {
                existing.videos.push(video);
                existing.viewSum += video.viewCount;
                existing.engagementSum += engagement;
            }
            dataMap.set(key, existing);
        });
    });

    const topics: YouTubeTrendTopic[] = [];
    // Show all items (no minimum filter - each video contributes to at least one topic)

    dataMap.forEach((data, key) => {
        // No minimum filter - show all extracted topics/keywords/hashtags
        topics.push({
            id: `${topicType}-${key}`,
            topic: topicType === 'hashtag' && !key.startsWith('#') ? `#${key}` : key,
            topicType: topicType === 'topic' ? 'category' : topicType, // Map 'topic' to 'category' for compatibility
            avgViews: Math.round(data.viewSum / data.videos.length),
            avgEngagement: Math.round((data.engagementSum / data.videos.length) * 10000) / 100,
            videoCount: data.videos.length,
            thumbnailUrl: data.videos[0]?.thumbnailUrl,
            relatedVideos: data.videos,
        });
    });

    // Sort by average views
    return topics.sort((a, b) => b.avgViews - a.avgViews).slice(0, 15);
}


/**
 * Calculate engagement rate for a video
 */
export function calculateEngagementRate(video: YouTubeTrendVideo): number {
    if (video.viewCount === 0) return 0;
    return Math.round(((video.likeCount + video.commentCount) / video.viewCount) * 10000) / 100;
}

/**
 * Format view count for display (e.g., 1.5M, 123K)
 */
export function formatViewCount(count: number): string {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
}

/**
 * Parse ISO 8601 duration to human readable (e.g., PT1H30M15S -> 1:30:15)
 */
export function parseDuration(isoDuration: string | undefined): string {
    if (!isoDuration) return '--:--';

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '--:--';

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
/**
 * Fetch trending videos by category (Post July 2025 YouTube Policy)
 * Uses chart=mostPopular with videoCategoryId filter
 * 
 * Supported categories: Music (10), Gaming (20), News (25), Trailers/Movies (44)
 * 
 * @see https://developers.google.com/youtube/v3/docs/videos/list
 */
export async function fetchVideosByCategory(
    apiKey: string,
    regionCode: RegionCode,
    categoryId: '10' | '20' | '25' | '44',
    maxResults: number = 50
): Promise<YouTubeTrendVideo[]> {
    const region = REGION_MAP[regionCode];
    let videos: YouTubeTrendVideo[] = [];
    let nextPageToken: string | undefined = undefined;
    let itemsToFetch = maxResults;

    try {
        while (itemsToFetch > 0) {
            const fetchCount = Math.min(itemsToFetch, 50);

            const url = `${YOUTUBE_API_BASE}/videos?` +
                `part=snippet,statistics,contentDetails&` +
                `chart=mostPopular&` +
                `videoCategoryId=${categoryId}&` +
                `regionCode=${region}&` +
                `maxResults=${fetchCount}&` +
                (nextPageToken ? `pageToken=${nextPageToken}&` : '') +
                `key=${apiKey}`;

            console.log(`[YouTube API] Fetching category ${categoryId} videos:`, url);
            const response = await fetch(url);

            if (!response.ok) {
                const error: any = await response.json();
                throw new Error(error.error?.message || `Failed to fetch category ${categoryId} videos`);
            }

            const data: any = await response.json();

            // Enhanced logging for debugging
            console.log(`[YouTube API] Category ${categoryId} response:`, {
                totalResults: data.pageInfo?.totalResults,
                resultsPerPage: data.pageInfo?.resultsPerPage,
                itemsReceived: data.items?.length || 0,
                hasNextPage: !!data.nextPageToken
            });

            if (!data.items || data.items.length === 0) {
                console.warn(`[YouTube API] Category ${categoryId} returned 0 items!`);
                break;
            }

            const pageVideos = data.items.map((item: any) => {
                const catId = item.snippet.categoryId || categoryId;
                const catInfo = YOUTUBE_CATEGORIES[catId as YouTubeCategoryId];
                return {
                    id: item.id,
                    title: item.snippet.title,
                    channelName: item.snippet.channelTitle,
                    channelId: item.snippet.channelId,
                    categoryId: catId,
                    categoryName: catInfo?.title || `Category ${catId}`,
                    thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                    viewCount: parseInt(item.statistics.viewCount || '0'),
                    likeCount: parseInt(item.statistics.likeCount || '0'),
                    commentCount: parseInt(item.statistics.commentCount || '0'),
                    publishedAt: item.snippet.publishedAt,
                    duration: item.contentDetails?.duration,
                };
            });

            videos = [...videos, ...pageVideos];
            nextPageToken = data.nextPageToken;
            itemsToFetch -= pageVideos.length;

            console.log(`[YouTube API] Category ${categoryId}: Fetched ${pageVideos.length} videos, total so far: ${videos.length}`);

            if (!nextPageToken || pageVideos.length === 0) break;
        }

        console.log(`[YouTube API] Category ${categoryId} FINAL: Returning ${videos.length} videos`);
        return videos;
    } catch (error) {
        console.error(`[YouTube API] Error fetching category ${categoryId} videos:`, error);
        throw error;
    }
}
