/**
 * YouTube Data API v3 Service
 * 
 * Uses the same Gemini API key (requires YouTube Data API v3 to be enabled in Google Cloud Console)
 */

import type { RegionCode, YouTubeTrendTopic, YouTubeTrendVideo, ChannelAnalysis, YouTubeCategoryId } from '../store/types';
import { YOUTUBE_CATEGORIES } from '../store/types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Simple memory cache for YouTube API calls
const youtubeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

function getCachedData(key: string) {
    const cached = youtubeCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCachedData(key: string, data: any) {
    youtubeCache.set(key, { data, timestamp: Date.now() });
    
    // Cleanup old cache entries if it gets too large
    if (youtubeCache.size > 50) {
        const oldestKey = youtubeCache.keys().next().value;
        if (oldestKey !== undefined) {
            youtubeCache.delete(oldestKey);
        }
    }
}


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
    maxResults: number = 25,
    publishedAfter?: string, // Optional RFC 3339 date
    order: 'relevance' | 'viewCount' | 'date' | 'rating' = 'relevance',
    videoDuration: 'any' | 'short' | 'medium' | 'long' = 'any'
): Promise<YouTubeTrendVideo[]> {
    const region = REGION_MAP[regionCode];

    try {
        // Search for videos
        let searchUrl = `${YOUTUBE_API_BASE}/search?` +
            `part=snippet&` +
            `type=video&` +
            `q=${encodeURIComponent(query)}&` +
            `regionCode=${region}&` +
            `order=${order}&` +
            `maxResults=${maxResults}&` +
            `key=${apiKey}`;

        if (videoDuration !== 'any') {
            searchUrl += `&videoDuration=${videoDuration}`;
        }

        const cacheKey = `search-${query}-${region}-${order}-${maxResults}-${videoDuration}-${publishedAfter || ''}`;
        const cached = getCachedData(cacheKey);
        if (cached) return cached;

        const searchResponse = await fetch(searchUrl);

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

        const videos: YouTubeTrendVideo[] = detailsData.items.map((item: any) => {
            const catId = item.snippet.categoryId;
            const catInfo = YOUTUBE_CATEGORIES[catId as YouTubeCategoryId];

            return {
                id: item.id,
                title: item.snippet.title,
                channelName: item.snippet.channelTitle,
                channelId: item.snippet.channelId,
                categoryId: catId,
                categoryName: catInfo ? `${catInfo.icon} ${catInfo.title}` : `Category ${catId}`,
                thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                viewCount: parseInt(item.statistics.viewCount || '0'),
                likeCount: parseInt(item.statistics.likeCount || '0'),
                commentCount: parseInt(item.statistics.commentCount || '0'),
                publishedAt: item.snippet.publishedAt,
                duration: item.contentDetails?.duration,
            };
        });

        setCachedData(cacheKey, videos);
        return videos;
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
    const cacheKey = `channel-${channelInput}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

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

        const result: ChannelAnalysis = {
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
        setCachedData(cacheKey, result);
        return result;
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
                keys = [video.categoryName];
            } else if (video.categoryId) {
                const catInfo = YOUTUBE_CATEGORIES[video.categoryId as YouTubeCategoryId];
                const title = catInfo ? `${catInfo.icon} ${catInfo.title}` : `Category ${video.categoryId}`;
                keys = [title];
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
 * Consolidated analytics extraction: Processes videos once to get topics, keywords, and hashtags.
 * This is much faster than calling extractTopTopics 3 separate times.
 */
export function extractAllAnalytics(videos: YouTubeTrendVideo[]): {
    categories: YouTubeTrendTopic[];
    keywords: YouTubeTrendTopic[];
    hashtags: YouTubeTrendTopic[];
} {
    if (!videos || videos.length === 0) {
        return { categories: [], keywords: [], hashtags: [] };
    }

    // Reuse the existing logic but optimized into one pass
    const categoryData = new Map<string, { videos: YouTubeTrendVideo[]; viewSum: number; engagementSum: number }>();
    const keywordData = new Map<string, { videos: YouTubeTrendVideo[]; viewSum: number; engagementSum: number }>();
    const hashtagData = new Map<string, { videos: YouTubeTrendVideo[]; viewSum: number; engagementSum: number }>();

    const STOPWORDS = new Set([
        '의', '를', '을', '이', '가', '에', '에서', '으로', '로', '와', '과', '은', '는',
        'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'is', 'are',
        '그', '저', '이런', '저런', '합니다', '있다', '없다', '한다', '된다',
    ]);

    videos.forEach(video => {
        const engagement = video.viewCount > 0
            ? (video.likeCount + video.commentCount) / video.viewCount
            : 0;

        // 1. Process Category
        let catKey = '';
        if (video.categoryName) {
            catKey = video.categoryName;
        } else if (video.categoryId) {
            const catInfo = YOUTUBE_CATEGORIES[video.categoryId as YouTubeCategoryId];
            catKey = catInfo ? `${catInfo.icon} ${catInfo.title}` : `Category ${video.categoryId}`;
        }
        if (catKey) {
            const d = categoryData.get(catKey) || { videos: [], viewSum: 0, engagementSum: 0 };
            d.videos.push(video);
            d.viewSum += video.viewCount;
            d.engagementSum += engagement;
            categoryData.set(catKey, d);
        }

        // 2. Process Keywords
        const cleaned = video.title
            .replace(/#[\w가-힣]+/g, '') 
            .replace(/[\[\]【】「」『』()（）]/g, ' ')
            .replace(/[|｜\-:：]/g, ' ')
            .toLowerCase()
            .trim();

        const words = cleaned.split(/\s+/).filter(w =>
            w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)
        ).slice(0, 5);

        words.forEach(word => {
            const d = keywordData.get(word) || { videos: [], viewSum: 0, engagementSum: 0 };
            if (!d.videos.some(v => v.id === video.id)) {
                d.videos.push(video);
                d.viewSum += video.viewCount;
                d.engagementSum += engagement;
            }
            keywordData.set(word, d);
        });

        // 3. Process Hashtags
        const hashtagMatches = video.title.match(/#[\w가-힣]+/g) || [];
        hashtagMatches.forEach(tag => {
            const lowerTag = tag.toLowerCase();
            const d = hashtagData.get(lowerTag) || { videos: [], viewSum: 0, engagementSum: 0 };
            if (!d.videos.some(v => v.id === video.id)) {
                d.videos.push(video);
                d.viewSum += video.viewCount;
                d.engagementSum += engagement;
            }
            hashtagData.set(lowerTag, d);
        });
    });

    const mapToTopics = (dataMap: Map<string, any>, type: string): YouTubeTrendTopic[] => {
        const result: YouTubeTrendTopic[] = [];
        dataMap.forEach((data, key) => {
            result.push({
                id: `${type}-${key}`,
                topic: type === 'hashtag' && !key.startsWith('#') ? `#${key}` : key,
                topicType: type === 'category' ? 'category' : (type as any),
                avgViews: Math.round(data.viewSum / data.videos.length),
                avgEngagement: Math.round((data.engagementSum / data.videos.length) * 10000) / 100,
                videoCount: data.videos.length,
                thumbnailUrl: data.videos[0]?.thumbnailUrl,
                relatedVideos: data.videos,
            });
        });
        return result.sort((a, b) => b.avgViews - a.avgViews).slice(0, 15);
    };

    return {
        categories: mapToTopics(categoryData, 'category'),
        keywords: mapToTopics(keywordData, 'keyword'),
        hashtags: mapToTopics(hashtagData, 'hashtag')
    };
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
    categoryId: YouTubeCategoryId,
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

            const cacheKey = `cat-${categoryId}-${region}-${fetchCount}-${nextPageToken || ''}`;
            const cached = getCachedData(cacheKey);
            
            let data: any;
            if (cached) {
                data = cached;
            } else {
                console.log(`[YouTube API] Fetching category ${categoryId} videos:`, url);
                const response = await fetch(url);

                if (!response.ok) {
                    const error: any = await response.json();
                    throw new Error(error.error?.message || `Failed to fetch category ${categoryId} videos`);
                }

                data = await response.json();
                setCachedData(cacheKey, data);
            }

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
                    categoryName: catInfo ? `${catInfo.icon} ${catInfo.title}` : `Category ${catId}`,
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

/**
 * Search for channels by keyword and return detailed analysis
 * Performs a 2-step process:
 * 1. Search for channels (get IDs)
 * 2. Fetch detailed statistics (subscriber count, etc)
 * 3. Sort by subscriber count (influence)
 */
export async function searchChannels(
    apiKey: string,
    query: string,
    regionCode: RegionCode,
    maxResults: number = 10
): Promise<ChannelAnalysis[]> {
    try {
        // Step 1: Search for channels
        const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}` +
            `&type=channel&regionCode=${REGION_MAP[regionCode]}&maxResults=${maxResults}&key=${apiKey}`;

        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            throw new Error(`Channel search failed: ${searchResponse.statusText}`);
        }
        const searchData = await searchResponse.json();

        if (!searchData.items || searchData.items.length === 0) {
            return [];
        }

        const channelIds = searchData.items.map((item: any) => item.snippet.channelId);

        // Step 2: Get detailed statistics
        return await getChannelsDetails(apiKey, channelIds);

    } catch (error) {
        console.error('[YouTube API] Error searching channels:', error);
        throw error;
    }
}

/**
 * Fetch detailed stats for multiple channels
 */
export async function getChannelsDetails(
    apiKey: string,
    channelIds: string[]
): Promise<ChannelAnalysis[]> {
    if (channelIds.length === 0) return [];

    try {
        const ids = channelIds.join(',');
        const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,contentDetails,brandingSettings` +
            `&id=${ids}&key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Channel details fetch failed: ${response.statusText}`);
        }
        const data = await response.json();

        if (!data.items) return [];

        // Map to ChannelAnalysis
        const channels: ChannelAnalysis[] = data.items.map((item: any) => ({
            channelId: item.id,
            channelName: item.snippet.title,
            channelThumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
            subscriberCount: parseInt(item.statistics.subscriberCount || '0'),
            videoCount: parseInt(item.statistics.videoCount || '0'),
            viewCount: parseInt(item.statistics.viewCount || '0'),
            avgViews: 0, // Calculated in Phase 2 or separate detailed fetch
            avgEngagement: 0,
            topVideos: [], // Populated in Phase 2
            recentVideos: [],
            description: item.snippet.description, // Optional but useful for Phase 2
            publishedAt: item.snippet.publishedAt,
            country: item.snippet.country,
            keywords: item.brandingSettings?.channel?.keywords
        }));

        // Sort by subscriber count descending
        return channels.sort((a, b) => b.subscriberCount - a.subscriberCount);

    } catch (error) {
        console.error('[YouTube API] Error fetching channel details:', error);
        return [];
    }
}
