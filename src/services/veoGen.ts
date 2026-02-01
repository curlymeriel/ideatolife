/**
 * Veo Video Generation Service using Google Gemini API
 * Supports Veo 3.0 and Veo 3.1 models for AI video generation
 */

import type { VeoModel } from '../store/types';

export interface VeoGenerationOptions {
    prompt: string;
    imageUrl?: string;          // For image-to-video generation
    duration?: number;          // In seconds (5-8 for Veo)
    aspectRatio?: '16:9' | '9:16';
    model?: VeoModel;
    resolution?: '720p' | '1080p' | '4k';
}

export interface VeoGenerationResult {
    videoUrl: string;
    duration: number;
    model: string;
    hasAudio: boolean;
}

export interface VeoOperationStatus {
    id: string;
    status: 'pending' | 'processing' | 'succeeded' | 'failed';
    progress?: number;
    result?: VeoGenerationResult;
    error?: string;
}

export interface VeoModelInfo {
    id: VeoModel;
    name: string;
    description: string;
    features: string[];
    maxDuration: number;
    supportsImageToVideo: boolean;
    supportsAudio: boolean;
    resolutions: string[];
}

// API endpoint via proxy
const API_BASE = '/api/google-ai/v1beta';

/**
 * Generate video using Google Veo API
 * Note: Veo uses long-running operations (LRO) pattern
 */
export async function generateVideoWithVeo(
    apiKey: string,
    options: VeoGenerationOptions,
    onProgress?: (status: string, progress?: number) => void
): Promise<VeoGenerationResult> {
    const model = options.model || 'veo-3.1-generate-preview';

    onProgress?.('Starting Veo video generation...', 0);

    // Build the request body based on Veo API spec
    const requestBody: Record<string, any> = {
        instances: [{
            prompt: options.prompt,
        }],
        parameters: {
            aspectRatio: options.aspectRatio || '16:9',
            // Duration in seconds (Veo typically generates 5-8 second clips)
            durationSeconds: Math.min(options.duration || 5, 8),
        }
    };

    // Add image for image-to-video if provided
    if (options.imageUrl) {
        // Extract base64 from data URL if present
        if (options.imageUrl.startsWith('data:')) {
            const base64Match = options.imageUrl.match(/base64,(.+)/);
            if (base64Match) {
                requestBody.instances[0].image = {
                    bytesBase64Encoded: base64Match[1]
                };
            }
        } else {
            // Assume it's a URL
            requestBody.instances[0].image = {
                gcsUri: options.imageUrl
            };
        }
    }

    // Resolution (Veo 3.1 supports 720p, 1080p, 4k)
    if (options.resolution) {
        requestBody.parameters.resolution = options.resolution;
    }

    try {
        // Start the video generation (returns a long-running operation)
        const response = await fetch(`${API_BASE}/models/${model}:predictLongRunning?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`Veo API error: ${error.error?.message || 'Unknown error'}`);
        }

        const operation = await response.json();
        const operationName = operation.name;

        if (!operationName) {
            throw new Error('No operation ID returned from Veo API');
        }

        onProgress?.('Video generation started, waiting for completion...', 10);

        // Poll for operation completion
        const result = await pollVeoOperation(apiKey, operationName, onProgress);

        return result;
    } catch (error: any) {
        throw new Error(`Veo generation failed: ${error.message}`);
    }
}

/**
 * Poll for Veo operation completion
 */
async function pollVeoOperation(
    apiKey: string,
    operationName: string,
    onProgress?: (status: string, progress?: number) => void
): Promise<VeoGenerationResult> {
    const maxAttempts = 180; // 3 minutes max (video generation can take a while)
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;

        try {
            const response = await fetch(`${API_BASE}/${operationName}?key=${apiKey}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                // Retry on temporary errors
                if (response.status >= 500 || response.status === 429) {
                    continue;
                }
                const error = await response.json().catch(() => ({}));
                throw new Error(`Failed to check operation status: ${error.error?.message || response.statusText}`);
            }

            const operation = await response.json();

            // Check if operation is complete
            if (operation.done) {
                if (operation.error) {
                    throw new Error(`Video generation failed: ${operation.error.message}`);
                }

                // Extract video URL from response
                const result = operation.response;
                if (!result || !result.predictions || result.predictions.length === 0) {
                    throw new Error('No video generated in response');
                }

                const prediction = result.predictions[0];
                let videoUrl = '';

                // Handle different response formats
                if (prediction.video?.uri) {
                    videoUrl = prediction.video.uri;
                } else if (prediction.video?.bytesBase64Encoded) {
                    // Convert base64 to data URL
                    videoUrl = `data:video/mp4;base64,${prediction.video.bytesBase64Encoded}`;
                } else if (typeof prediction === 'string') {
                    videoUrl = prediction;
                }

                if (!videoUrl) {
                    throw new Error('No video URL in response');
                }

                onProgress?.('Video generation complete!', 100);

                return {
                    videoUrl,
                    duration: 5, // Veo typically generates 5-8 second clips
                    model: operationName.split('/')[3] || 'veo',
                    hasAudio: true, // Veo 3+ supports native audio
                };
            }

            // Update progress based on attempts
            const progress = Math.min(10 + (attempts / maxAttempts) * 85, 95);
            onProgress?.('Generating video...', progress);

        } catch (error: any) {
            if (attempts >= maxAttempts - 1) {
                throw error;
            }
            // Continue polling on non-fatal errors
        }
    }

    throw new Error('Video generation timed out');
}

/**
 * Get available Veo models with their info
 */
export function getVeoModels(): VeoModelInfo[] {
    return [
        {
            id: 'veo-3.1-generate-preview',
            name: 'Veo 3.1 (Latest)',
            description: '최신 모델 - 4K 지원, 향상된 모션, 캐릭터 일관성',
            features: ['4K Resolution', 'Native Audio', 'Image-to-Video', 'Video Extension'],
            maxDuration: 8,
            supportsImageToVideo: true,
            supportsAudio: true,
            resolutions: ['720p', '1080p', '4k'],
        },
        {
            id: 'veo-3.0-generate-preview',
            name: 'Veo 3.0',
            description: '안정적 - 네이티브 오디오, 시네마틱 스타일',
            features: ['1080p Resolution', 'Native Audio', 'Text-to-Video'],
            maxDuration: 8,
            supportsImageToVideo: false,
            supportsAudio: true,
            resolutions: ['720p', '1080p'],
        },
    ];
}

/**
 * Check if Gemini API key has Veo access
 */
export async function validateVeoAccess(apiKey: string): Promise<boolean> {
    try {
        // Try to list models to verify API key and Veo access
        const response = await fetch(`${API_BASE}/models?key=${apiKey}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        // Check if Veo models are available
        const hasVeo = data.models?.some((m: any) =>
            m.name?.includes('veo') || m.supportedGenerationMethods?.includes('generateVideo')
        );

        return hasVeo;
    } catch {
        return false;
    }
}
