import axios from 'axios';

export interface ImageGenResponse {
    urls: string[];
}

export const generateImage = async (
    _prompt: string,
    apiKey: string,
    referenceImages?: string | string[], // Optional base64 string(s) for Image-to-Image
    aspectRatio?: string, // Target aspect ratio (e.g., '16:9', '9:16', '1:1', '2.35:1')
    modelName: string = 'gemini-3-pro-image-preview',
    candidateCount: number = 1
): Promise<{ urls: string[] }> => {
    if (!apiKey) {
        // Mock response if no key provided
        return new Promise((resolve) => {
            setTimeout(() => {
                const mockUrls = Array.from({ length: candidateCount }).map((_, i) =>
                    `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&sig=${i}`
                );
                resolve({ urls: mockUrls });
            }, 2000); // All images take 2 seconds in mock mode
        });
    }

    // Fallback models
    const fallbackModels = [
        'imagen-4.0-generate-001',
        'gemini-2.5-flash-image'
    ];

    // Add primary model to the start of the list if it's not already there
    const allModels = [modelName];
    fallbackModels.forEach(m => {
        if (m !== modelName) allModels.push(m);
    });

    // Helper to try generating a single image with a specific model
    const tryGenerateWithModel = async (currentModel: string): Promise<string | null> => {
        const parts: any[] = [
            { text: `Generate an image of: ${_prompt}` }
        ];

        // Normalize to array and filter out non-string values
        const refImages = referenceImages
            ? (Array.isArray(referenceImages) ? referenceImages : [referenceImages])
                .filter(img => typeof img === 'string' && img.length > 0)
            : [];

        // If reference images are provided, add them to the payload
        if (refImages.length > 0) {
            refImages.forEach((referenceImage) => {
                // Extract base64 data and mime type
                const matches = referenceImage.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const data = matches[2];

                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: data
                        }
                    });
                }
            });

            // Update text prompt
            if (refImages.length === 1) {
                parts[0].text = `Using the provided image as a strong visual reference, generate: ${_prompt}. Maintain the key features and style from the reference image.`;
            } else {
                parts[0].text = `Using the ${refImages.length} provided reference images, generate: ${_prompt}. Maintain consistency with all reference images - use their visual features, styles, and characteristics.`;
            }
        }

        // Convert aspect ratio
        const getApiAspectRatio = (ratio?: string): string => {
            if (!ratio) return '16:9';
            const ratioMap: Record<string, string> = {
                '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '2.35:1': '21:9',
                '21:9': '21:9', '4:3': '4:3', '3:4': '3:4', '3:2': '3:2',
                '2:3': '2:3', '5:4': '5:4', '4:5': '4:5'
            };
            return ratioMap[ratio] || '16:9';
        };
        const apiAspectRatio = getApiAspectRatio(aspectRatio);

        console.log(`[ImageGen] Trying model: ${currentModel}, AspectRatio: ${apiAspectRatio}`);

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: parts }],
                generationConfig: {
                    responseModalities: ["IMAGE", "TEXT"],
                    imageConfig: { aspectRatio: apiAspectRatio },
                    candidateCount: 1
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 45000
            }
        );

        if (response.data && response.data.candidates?.[0]?.content?.parts) {
            const imagePart = response.data.candidates[0].content.parts.find((part: any) =>
                part.inlineData && part.inlineData.mimeType.startsWith('image/')
            );
            if (imagePart) {
                return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
            }
        }
        throw new Error('No image data found in response');
    };

    let lastError: any = null;

    // Try each model in sequence
    for (const model of allModels) {
        try {
            const urls: string[] = [];
            // Generate requested number of candidates
            for (let i = 0; i < candidateCount; i++) {
                const url = await tryGenerateWithModel(model);
                if (url) urls.push(url);
                if (i < candidateCount - 1) await new Promise(r => setTimeout(r, 500));
            }

            if (urls.length > 0) return { urls };

        } catch (error: any) {
            console.warn(`[ImageGen] Model ${model} failed:`, error.response?.data?.error?.message || error.message);
            lastError = error;
            // Continue to next model in loop
        }
    }

    // If all models failed, process the last error to return a user-friendly message
    let errorMessage = lastError?.message || "Unknown error";
    if (lastError?.code === 'ECONNABORTED' || lastError?.message?.includes('timeout')) {
        errorMessage = `⏱️ 연결 시간 초과 (Timeout). 구글 서버 응답이 너무 늦습니다.`;
    } else if (lastError?.response) {
        const status = lastError.response.status;
        if (status === 404) errorMessage = `Model not found (404).`;
        else if (status === 429) errorMessage = `⏰ API 할당량 초과!`;
        else if (status === 503) errorMessage = `🔥 서버 과부하 (503). 현재 구글 서버에 사용자가 너무 많습니다.`;
        else errorMessage = `API Error (${status}): ${lastError.response.data.error?.message}`;
    }

    throw new Error(`All image generation models failed. Last error: ${errorMessage}`);
};
