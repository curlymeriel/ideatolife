/**
 * Video Generation Service using Replicate API
 * Supports multiple video AI models through Replicate's unified API
 */

import type { AspectRatio } from '../store/types';

export type VideoModel =
    | 'kling-1.6'
    | 'kling-2.0'
    | 'runway-gen3'
    | 'stable-video'
    | 'wan-2.2-t2v-480p'
    | 'wan-2.2-t2v-720p'
    | 'wan-2.2-i2v';

interface VideoGenerationOptions {
    prompt: string;
    imageUrl?: string; // For image-to-video
    duration?: number; // In seconds (default 5)
    aspectRatio?: AspectRatio;
    model?: VideoModel;
}

interface VideoGenerationResult {
    videoUrl: string;
    duration: number;
    model: string;
}

// Replicate model identifiers (updated January 2026)
// These are model owner/name pairs, NOT version hashes
const REPLICATE_MODELS: Record<VideoModel, string> = {
    'kling-1.6': 'kwaivgi/kling-v1.6-pro',
    'kling-2.0': 'kwaivgi/kling-v2.1', // Using 2.1 as it's the latest stable
    'runway-gen3': 'minimax/video-01', // Alternative: MiniMax Video-01
    'stable-video': 'stability-ai/stable-video-diffusion',
    // Wan 2.2 models (Alibaba Cloud - open source)
    'wan-2.2-t2v-480p': 'wan-ai/wan2.2-t2v-480p',
    'wan-2.2-t2v-720p': 'wan-ai/wan2.2-t2v-720p',
    'wan-2.2-i2v': 'wan-ai/wan2.2-i2v',
};

/**
 * Generate video using Replicate API
 */
export async function generateVideo(
    apiKey: string,
    options: VideoGenerationOptions,
    onProgress?: (status: string, progress?: number) => void
): Promise<VideoGenerationResult> {
    const model = options.model || 'kling-1.6';
    const modelVersion = REPLICATE_MODELS[model];

    if (!modelVersion) {
        throw new Error(`Unknown model: ${model}`);
    }

    onProgress?.('Starting prediction...', 0);

    // Build input based on model type
    let input: Record<string, any> = {
        prompt: options.prompt,
    };

    // Add image for image-to-video
    if (options.imageUrl) {
        input.image = options.imageUrl;
    }

    // Model-specific input formatting
    if (model.startsWith('kling')) {
        input.duration = options.duration || 5;
        // Kling supports 16:9, 9:16, 1:1, 4:3, 3:4, 21:9
        // Map other ratios to closest supported
        let ratio: string = options.aspectRatio || '16:9';
        if (ratio === '4:5') ratio = '3:4'; // Closest approximation
        if (ratio === '2.35:1') ratio = '21:9';
        input.aspect_ratio = ratio;
    } else if (model === 'runway-gen3') {
        input.duration = Math.min(options.duration || 5, 10); // Runway max 10s
    } else if (model === 'stable-video') {
        input.frames = Math.round((options.duration || 5) * 24); // 24fps
    } else if (model.startsWith('wan-2.2')) {
        // Wan 2.2 specific parameters
        input.num_frames = 81; // ~5 seconds at 16fps
        input.fps = 16;

        // Calculate dimensions based on aspect ratio
        const ratio = options.aspectRatio || '16:9';
        let width = 832;
        let height = 480;

        const is720p = model.includes('720p');
        const baseSize = is720p ? 1280 : 832;
        const smallSize = is720p ? 720 : 480;

        switch (ratio) {
            case '16:9': width = baseSize; height = smallSize; break;
            case '9:16': width = smallSize; height = baseSize; break;
            case '1:1': width = is720p ? 1024 : 640; height = is720p ? 1024 : 640; break;
            case '4:3': width = baseSize; height = Math.round(baseSize * 0.75); break;
            case '3:4': width = Math.round(baseSize * 0.75); height = baseSize; break;
            case '21:9': width = baseSize; height = Math.round(baseSize * 0.42); break;
            case '2.35:1': width = baseSize; height = Math.round(baseSize / 2.35); break;
            case '4:5': width = Math.round(baseSize * 0.8); height = baseSize; break;
            default: width = baseSize; height = smallSize; break;
        }

        // Align to multiples of 16
        input.width = Math.round(width / 16) * 16;
        input.height = Math.round(height / 16) * 16;
    }

    // Start prediction
    // params: use proxy path '/api/replicate' instead of 'https://api.replicate.com' to avoid CORS
    const createResponse = await fetch('/api/replicate/v1/models/' + modelVersion + '/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait',  // Wait for result in same request if possible
        },
        body: JSON.stringify({
            input,
        }),
    });

    if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(`Replicate API error: ${error.detail || error.error || 'Unknown error'}`);
    }

    const prediction = await createResponse.json();
    const predictionId = prediction.id;

    onProgress?.('Generating video...', 10);

    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max (with 1s intervals)

    while (result.status !== 'succeeded' && result.status !== 'failed') {
        if (attempts >= maxAttempts) {
            throw new Error('Video generation timed out');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;

        const statusResponse = await fetch(`/api/replicate/v1/predictions/${predictionId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        result = await statusResponse.json();

        // Calculate progress based on status
        if (result.status === 'processing') {
            const progress = Math.min(10 + (attempts / maxAttempts) * 80, 90);
            onProgress?.('Processing...', progress);
        } else if (result.status === 'starting') {
            onProgress?.('Starting model...', 5);
        }
    }

    if (result.status === 'failed') {
        throw new Error(`Video generation failed: ${result.error || 'Unknown error'}`);
    }

    onProgress?.('Complete!', 100);

    // Extract video URL from output
    let videoUrl = '';
    if (typeof result.output === 'string') {
        videoUrl = result.output;
    } else if (Array.isArray(result.output) && result.output.length > 0) {
        videoUrl = result.output[0];
    } else if (result.output?.video) {
        videoUrl = result.output.video;
    }

    if (!videoUrl) {
        throw new Error('No video URL in response');
    }

    return {
        videoUrl,
        duration: options.duration || 5,
        model,
    };
}

/**
 * Get available video models with their info
 */
export function getVideoModels(): Array<{
    id: VideoModel;
    name: string;
    description: string;
    pricePerSecond: number;
    maxDuration: number;
    supportsImageToVideo: boolean;
}> {
    return [
        {
            id: 'kling-1.6',
            name: 'Kling 1.6 Pro',
            description: 'High quality, cinematic video generation',
            pricePerSecond: 0.028,
            maxDuration: 10,
            supportsImageToVideo: true,
        },
        {
            id: 'kling-2.0',
            name: 'Kling 2.0',
            description: 'Latest Kling model with improved motion',
            pricePerSecond: 0.04,
            maxDuration: 10,
            supportsImageToVideo: true,
        },
        {
            id: 'runway-gen3',
            name: 'Runway Gen3 Turbo',
            description: 'Fast and consistent video generation',
            pricePerSecond: 0.05,
            maxDuration: 10,
            supportsImageToVideo: true,
        },
        {
            id: 'stable-video',
            name: 'Stable Video Diffusion',
            description: 'Open source, good for motion loops',
            pricePerSecond: 0.02,
            maxDuration: 4,
            supportsImageToVideo: true,
        },
        // Wan 2.2 models (open source, high quality)
        {
            id: 'wan-2.2-t2v-480p',
            name: 'Wan 2.2 T2V (480p)',
            description: '빠른 생성, 저해상도 - 프리뷰용 권장',
            pricePerSecond: 0.015,
            maxDuration: 5,
            supportsImageToVideo: false,
        },
        {
            id: 'wan-2.2-t2v-720p',
            name: 'Wan 2.2 T2V (720p)',
            description: '고품질 오픈소스, MoE 아키텍처',
            pricePerSecond: 0.025,
            maxDuration: 5,
            supportsImageToVideo: false,
        },
        {
            id: 'wan-2.2-i2v',
            name: 'Wan 2.2 Image-to-Video',
            description: '이미지 → 비디오 변환, 최상의 일관성',
            pricePerSecond: 0.03,
            maxDuration: 5,
            supportsImageToVideo: true,
        },
    ];
}

/**
 * Check if Replicate API key is valid
 */
export async function validateReplicateKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch('/api/replicate/v1/account', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}
