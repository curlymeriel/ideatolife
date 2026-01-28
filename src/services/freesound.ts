/**
 * Freesound.org API Service
 * 
 * Free sound effects library with 500,000+ sounds
 * API Docs: https://freesound.org/docs/api/
 * 
 * Rate Limits: 60 requests/minute, 2000 requests/day (free tier)
 */

import axios from 'axios';

const FREESOUND_API_BASE = 'https://freesound.org/apiv2';

export interface FreesoundResult {
    id: number;
    name: string;
    description: string;
    duration: number;
    previews: {
        'preview-hq-mp3': string;
        'preview-lq-mp3': string;
        'preview-hq-ogg': string;
        'preview-lq-ogg': string;
    };
    license: string;
    username: string;
    tags: string[];
    avg_rating: number;
    num_downloads: number;
}

export interface FreesoundSearchResponse {
    count: number;
    results: FreesoundResult[];
    next: string | null;
    previous: string | null;
}

export async function searchSounds(
    query: string,
    apiKey: string,
    options: {
        pageSize?: number;
        page?: number;
        sort?: 'score' | 'duration_desc' | 'duration_asc' | 'created_desc' | 'created_asc' | 'downloads_desc' | 'rating_desc';
        filter?: string;
    } = {}
): Promise<FreesoundSearchResponse> {
    const token = apiKey?.trim();

    if (!token) {
        throw new Error('Freesound API key is required. Get one free at freesound.org');
    }

    const { pageSize = 15, page = 1, sort = 'rating_desc', filter } = options;

    try {
        // Use query parameter for CORS compatibility (Freesound doesn't support Authorization header from browsers)
        const params: Record<string, string | number> = {
            query,
            token: token,
            page_size: pageSize,
            page,
            sort,
            fields: 'id,name,description,duration,previews,license,username,tags,avg_rating,num_downloads'
        };

        if (filter) {
            params.filter = filter;
        }

        console.log('[Freesound] Searching with params:', { query, apiKey: apiKey.substring(0, 8) + '...' });

        const response = await axios.get<FreesoundSearchResponse>(
            `${FREESOUND_API_BASE}/search/text/`,
            { params }
        );

        console.log(`[Freesound] Found ${response.data.count} results for "${query}"`);
        return response.data;

    } catch (error: any) {
        console.error('[Freesound] Search failed:', error);

        if (error.response?.status === 401) {
            throw new Error('Invalid Freesound API key. Please check your key in Settings.');
        } else if (error.response?.status === 429) {
            throw new Error('Freesound rate limit exceeded. Please try again later.');
        }

        throw new Error(`Freesound search failed: ${error.message}`);
    }
}

export function getPreviewUrl(sound: FreesoundResult, quality: 'high' | 'low' = 'high'): string {
    return quality === 'high'
        ? sound.previews['preview-hq-mp3']
        : sound.previews['preview-lq-mp3'];
}

export async function downloadSoundPreview(sound: FreesoundResult): Promise<string> {
    const previewUrl = getPreviewUrl(sound, 'high');

    try {
        const response = await axios.get(previewUrl, {
            responseType: 'arraybuffer'
        });

        const base64 = btoa(
            new Uint8Array(response.data)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        return `data:audio/mp3;base64,${base64}`;
    } catch (error: any) {
        console.error('[Freesound] Download failed:', error);
        throw new Error(`Failed to download sound: ${error.message}`);
    }
}

export async function suggestSfxKeywords(
    sceneDescription: string,
    geminiApiKey: string
): Promise<string[]> {
    if (!geminiApiKey) {
        return ['ambient', 'background', 'effect'];
    }

    try {
        const { generateText } = await import('./gemini');
        const prompt = `Based on this scene description, suggest 3-5 sound effect search keywords that would work well as background audio or SFX. Return ONLY a JSON array of simple English keywords, no explanations.

Scene: "${sceneDescription}"

Example output: ["rain heavy", "thunder distant", "wind howling"]

Keywords:`;

        const text = await generateText(
            prompt,
            geminiApiKey,
            "application/json",
            undefined, // images
            undefined, // system
            { temperature: 0.7, response_mime_type: "application/json" }
        );

        const match = text.match(/\[.*\]/s);
        if (match) {
            const keywords = JSON.parse(match[0]);
            console.log('[Freesound] Gemini suggested keywords:', keywords);
            return keywords;
        }

        return ['ambient', 'background'];
    } catch (error) {
        console.error('[Freesound] Keyword suggestion failed:', error);
        return ['ambient', 'background'];
    }
}

export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getLicenseShort(license: string): string {
    if (license.includes('cc0') || license.includes('publicdomain')) return 'CC0';
    if (license.includes('Attribution')) return 'CC BY';
    if (license.includes('NonCommercial')) return 'CC BY-NC';
    return 'CC';
}
