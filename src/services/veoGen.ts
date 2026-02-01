/**
 * Veo Video Generation Service using Google Gemini API
 * Supports Veo 3.0 and Veo 3.1 models for AI video generation
 */

import type { VeoModel, AspectRatio } from '../store/types';

export interface VeoGenerationOptions {
    prompt: string;
    imageUrl?: string;          // For image-to-video generation
    duration?: number;          // In seconds (5-8 for Veo)
    aspectRatio?: AspectRatio;
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
/**
 * Generate video using Google Veo API with automatic fallback
 */
export async function generateVideoWithVeo(
    apiKey: string,
    options: VeoGenerationOptions,
    onProgress?: (status: string, progress?: number) => void
): Promise<VeoGenerationResult> {
    // If a specific model is requested, try only that. Otherwise, use the fallback chain.
    const modelsToTry = options.model
        ? [options.model]
        : ['veo-3.1-generate-preview', 'veo-3.0-generate-preview', 'veo-2.0-generate-preview'];

    let lastError: any = null;

    for (const model of modelsToTry) {
        try {
            console.log(`[Veo] Attempting generation with model: ${model}`);
            onProgress?.(`Starting generation with ${model}...`, 0);

            return await generateWithSingleModel(apiKey, { ...options, model: model as VeoModel }, onProgress);
        } catch (error: any) {
            console.warn(`[Veo] Model ${model} failed: ${error.message}`);
            lastError = error;

            // If it's a critical auth error, don't try other models
            if (error.message.includes('401') || error.message.includes('API key')) {
                throw error;
            }

            // Continue to next model
            onProgress?.(`Model ${model} failed. Trying next model...`, 0);
        }
    }

    throw lastError || new Error(`All Veo models failed. Last tried: ${modelsToTry[modelsToTry.length - 1]}`);
}

/**
 * Internal helper to generate with a single model including retry logic
 */
async function generateWithSingleModel(
    apiKey: string,
    options: VeoGenerationOptions,
    onProgress?: (status: string, progress?: number) => void
): Promise<VeoGenerationResult> {
    const model = options.model || 'veo-3.1-generate-preview';

    // Build the request body based on Veo API spec
    // Note: Veo 2.0 might have slightly different params, but usually 3.0/2.0 share the predictLongRunning signature.
    const requestBody: Record<string, any> = {
        instances: [{
            prompt: options.prompt,
        }],
        parameters: {
            aspectRatio: (() => {
                const r = options.aspectRatio || '16:9';
                if (r === '9:16' || r === '4:5' || r === '3:4') return '9:16';
                if (r === '1:1') return '1:1';
                return '16:9';
            })(),
            // Ensure duration is within bounds (Veo usually 5-8s)
            durationSeconds: Math.ceil(Math.max(5, Math.min(options.duration || 5, 8))),
        }
    };

    // Add image for image-to-video if provided
    if (options.imageUrl) {
        if (options.imageUrl.startsWith('data:')) {
            const base64Match = options.imageUrl.match(/base64,(.+)/);
            const mimeMatch = options.imageUrl.match(/data:([^;]+);/);

            if (base64Match) {
                requestBody.instances[0].image = {
                    bytesBase64Encoded: base64Match[1],
                    mimeType: mimeMatch ? mimeMatch[1] : 'image/png'
                };
            }
        } else {
            requestBody.instances[0].image = {
                gcsUri: options.imageUrl
            };
        }
    }

    // Resolution
    if (options.resolution) {
        requestBody.parameters.resolution = options.resolution;
    }

    // Start generation with Retry Logic
    let response: Response | null = null;
    let attempts = 0;
    const maxAttempts = 5; // Increased retry count

    while (attempts < maxAttempts) {
        try {
            response = await fetch(`${API_BASE}/models/${model}:predictLongRunning?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (response.status === 429) {
                attempts++;
                if (attempts >= maxAttempts) break;
                const waitTime = attempts * 10000; // 10s backoff
                console.warn(`[Veo] Rate limit (429) on ${model}. Retrying in ${waitTime}ms...`);
                onProgress?.(`Rate limit hit on ${model}. Retrying in ${waitTime / 1000}s...`, 0);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            break; // Success or non-retriable error
        } catch (e) {
            console.error('Fetch error:', e);
            throw e; // Network error, let outer loop handle or bubble up
        }
    }

    if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'No response';
        let errorMessage = response?.statusText || 'Unknown error';
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorMessage;
        } catch { }

        throw new Error(`Veo API error (${model}): ${errorMessage}`);
    }

    const operation = await response.json();
    console.log(`[Veo] Operation created (${model}):`, operation.name);

    if (!operation.name) throw new Error('No operation ID returned');

    onProgress?.(`Video generation started (${model}), waiting...`, 10);

    // Poll for completion
    const result = await pollVeoOperation(apiKey, operation.name, onProgress);

    // Inject model name into result for tracking
    return { ...result, model };
}

/**
 * Get available Veo models with their info
 */
export function getVeoModels(): VeoModelInfo[] {
    return [
        {
            id: 'veo-3.1-generate-preview',
            name: 'Veo 3.1 (Latest)',
            description: '최고 품질, 4K 지원, 자연스러운 사람 동작 및 오디오 생성',
            features: ['4K', 'Native Audio', 'Smart Motion'],
            maxDuration: 8,
            supportsImageToVideo: true,
            supportsAudio: true,
            resolutions: ['720p', '1080p', '4k'],
        },
        {
            id: 'veo-3.0-generate-preview',
            name: 'Veo 3.0',
            description: '고품질 비디오 생성, 1080p 지원',
            features: ['1080p', 'Native Audio'],
            maxDuration: 8,
            supportsImageToVideo: true,
            supportsAudio: true,
            resolutions: ['720p', '1080p'],
        },
        {
            id: 'veo-2.0-generate-preview',
            name: 'Veo 2.0 (Legacy)',
            description: '빠른 생성 속도, 안정적인 구형 모델',
            features: ['1080p', 'Fast Generation'],
            maxDuration: 5,
            supportsImageToVideo: true,
            supportsAudio: false,
            resolutions: ['720p', '1080p'],
        }
    ];
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

                // Extract result from operation
                const result = operation.response || operation.result;
                console.log('[Veo] Operation finished. Done:', operation.done, 'Result keys:', result ? Object.keys(result) : 'null');
                if (result) console.log('[Veo] Full result structure:', JSON.stringify(result).substring(0, 500));

                if (!result) {
                    throw new Error(`Operation marked as done but no response/result found. Full operation: ${JSON.stringify(operation).substring(0, 300)}`);
                }

                // Check for Safety Filters (RAI)
                // The logs show the structure is typically nested under generateVideoResponse
                const safetyResponse = result.generateVideoResponse || result;
                if (safetyResponse.raiMediaFilteredCount > 0) {
                    const reasons = safetyResponse.raiMediaFilteredReasons?.join(', ') || 'Unknown safety reason';
                    throw new Error(`Video generation blocked by safety filters: ${reasons}`);
                }

                let videoUrl = '';

                // 1. Handle Google AI Studio / Generative Language API format (video: { uri: '...' })
                if (result.video?.uri) {
                    videoUrl = result.video.uri;
                } else if (result.video?.bytesBase64Encoded) {
                    videoUrl = `data:video/mp4;base64,${result.video.bytesBase64Encoded}`;
                }
                // 2. Handle Vertex AI / Prediction format (predictions: [ { video: { uri: '...' } } ])
                else if (result.predictions && result.predictions.length > 0) {
                    const prediction = result.predictions[0];
                    if (prediction.video?.uri) {
                        videoUrl = prediction.video.uri;
                    } else if (prediction.video?.bytesBase64Encoded) {
                        videoUrl = `data:video/mp4;base64,${prediction.video.bytesBase64Encoded}`;
                    } else if (prediction.bytesBase64Encoded) {
                        videoUrl = `data:video/mp4;base64,${prediction.bytesBase64Encoded}`;
                    } else if (typeof prediction === 'string') {
                        videoUrl = prediction;
                    }
                }
                // 3. Handle possible 'outputs' array
                else if (result.outputs && result.outputs.length > 0) {
                    const output = result.outputs[0];
                    if (output.video?.uri) videoUrl = output.video.uri;
                    else if (output.uri) videoUrl = output.uri;
                }
                // 4. Handle direct uri in result
                else if (result.uri) {
                    videoUrl = result.uri;
                }
                // 5. Handle Veo 3.1 specific PredictLongRunningResponse format (found in logs)
                else if (result.generateVideoResponse?.generatedSamples && result.generateVideoResponse.generatedSamples.length > 0) {
                    const sample = result.generateVideoResponse.generatedSamples[0];
                    if (sample.video?.uri) {
                        videoUrl = sample.video.uri;
                    } else if (sample.video?.bytesBase64Encoded) {
                        videoUrl = `data:video/mp4;base64,${sample.video.bytesBase64Encoded}`;
                    }
                }

                // 6. ULTIMATE FALLBACK: Recursive deep search for ANY URI or Base64 video data
                if (!videoUrl) {
                    console.log('[Veo] Falling back to deep search...');
                    const findUrl = (obj: any): string | null => {
                        if (!obj || typeof obj !== 'object') return null;

                        // Check common video data patterns
                        if (obj.video?.uri && typeof obj.video.uri === 'string' && obj.video.uri.startsWith('http')) return obj.video.uri;
                        if (obj.uri && typeof obj.uri === 'string' && obj.uri.startsWith('http')) return obj.uri;
                        if (obj.video?.bytesBase64Encoded) return `data:video/mp4;base64,${obj.video.bytesBase64Encoded}`;
                        if (obj.bytesBase64Encoded) return `data:video/mp4;base64,${obj.bytesBase64Encoded}`;

                        // Recurse into arrays and objects
                        for (const key in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                const found = findUrl(obj[key]);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    videoUrl = findUrl(result) || '';
                }

                if (!videoUrl) {
                    throw new Error(`No video URL found in response. Checked all standard paths and deep search. Available top-level keys: ${Object.keys(result).join(', ')}`);
                }

                onProgress?.('Video generation complete!', 100);

                return {
                    videoUrl,
                    duration: 5, // Veo typically generates 5-8 second clips
                    model: operationName.includes('models/') ? operationName.split('/')[1] : 'veo',
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
