/**
 * KieAI Video Generation Service
 * API for https://kie.ai - Unified interface for Veo 3.1, Runway Aleph, etc.
 */

import type { AspectRatio } from '../store/types';

export interface KieVideoModel {
    id: string;
    name: string;
    description: string;
    maxDuration: number;
    points: number;
}

export interface KieGenerationOptions {
    prompt: string;
    imageUrl?: string;
    model?: string;
    aspectRatio?: AspectRatio;
    duration?: number;
}

/**
 * Get available KieAI models
 */
export function getKieModels(): KieVideoModel[] {
    return [
        {
            id: 'grok-vision-video',
            name: 'Grok Vision Video',
            description: 'xAI의 새로운 비디오 생성 모델',
            maxDuration: 10,
            points: 60,
        },
        {
            id: 'veo-3.1',
            name: 'Veo 3.1 (Kie)',
            description: 'Google의 최신 고성능 비디오 모델',
            maxDuration: 10,
            points: 50,
        },
        {
            id: 'kling-v2.0',
            name: 'Kling 2.0 (Kie)',
            description: '가장 발전된 Kling 비디오 생성 모델',
            maxDuration: 10,
            points: 55,
        },
        {
            id: 'kling-v1.6',
            name: 'Kling 1.6 (Kie)',
            description: '영화 같은 고해상도 비디오',
            maxDuration: 10,
            points: 45,
        },
        {
            id: 'runway-aleph-turbo',
            name: 'Runway Aleph Turbo',
            description: '고속 생성 및 부드러운 움직임',
            maxDuration: 10,
            points: 40,
        }
    ];
}

/**
 * Generate video using KieAI API
 */
export async function generateVideoWithKie(
    apiKey: string,
    options: KieGenerationOptions,
    onProgress?: (status: string, progress?: number) => void
): Promise<{ videoUrl: string; duration: number; model: string }> {
    const model = options.model || 'veo-3.1';

    onProgress?.('Initializing KieAI request...', 0);

    const payload = {
        model: model,
        prompt: options.prompt,
        image_url: options.imageUrl,
        aspect_ratio: options.aspectRatio || '16:9',
        duration: options.duration || 5,
    };

    // Note: This is an architectural stub. Actual implementation should handle
    // KieAI's specific polling/webhook mechanisms.
    const response = await fetch('https://api.kie.ai/v1/video/generate', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`KieAI API error: ${error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const requestId = data.id;

    onProgress?.('Generating with KieAI...', 20);

    // Polling logic
    let status = 'processing';
    let videoUrl = '';
    let attempts = 0;
    const maxAttempts = 120;

    while (status !== 'succeeded' && status !== 'failed') {
        if (attempts >= maxAttempts) throw new Error('KieAI generation timed out');

        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        const statusRes = await fetch(`https://api.kie.ai/v1/video/status/${requestId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const statusData = await statusRes.json();
        status = statusData.status;

        if (status === 'succeeded') {
            videoUrl = statusData.video?.url || statusData.output;
        } else if (status === 'failed') {
            throw new Error(`KieAI generation failed: ${statusData.error || 'Unknown error'}`);
        }

        onProgress?.(`KieAI Status: ${status}...`, Math.min(20 + attempts, 95));
    }

    return {
        videoUrl,
        duration: options.duration || 5,
        model: model
    };
}
