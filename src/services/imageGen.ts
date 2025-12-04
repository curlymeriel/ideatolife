import axios from 'axios';

export interface ImageGenResponse {
    url: string;
}

export const generateImage = async (
    _prompt: string,
    apiKey: string,
    referenceImages?: string | string[], // Optional base64 string(s) for Image-to-Image
    aspectRatio?: string, // Target aspect ratio (e.g., '16:9', '9:16', '1:1', '2.35:1')
    modelName: string = 'gemini-2.5-flash-image'
): Promise<{ url: string }> => {
    if (!apiKey) {
        // Mock response if no key provided
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({ url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800' });
            }, 2000); // All images take 2 seconds in mock mode
        });
    }

    try {
        // Gemini 2.5 Flash Image API call (using generateContent endpoint)

        // Build the prompt with aspect ratio if specified
        let finalPrompt = _prompt;
        if (aspectRatio) {
            finalPrompt = `CRITICAL REQUIREMENT: The output image MUST be in ${aspectRatio} aspect ratio. This is non-negotiable. \n\n${_prompt}`;
        }

        const parts: any[] = [
            { text: `Generate an image of: ${finalPrompt}` }
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
                // Format: data:image/jpeg;base64,......
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

            // Update text prompt to explicitly mention the reference images AND aspect ratio
            if (aspectRatio) {
                if (refImages.length === 1) {
                    parts[0].text = `PRIMARY DIRECTIVE: Create ${aspectRatio} aspect ratio image. CRITICAL: Output dimensions MUST BE ${aspectRatio}. Reference image is for STYLE/SUBJECT INSPIRATION ONLY - completely ignore its dimensions/aspect ratio. Generate: ${finalPrompt}. REMINDER: Final output = ${aspectRatio} aspect ratio, NO EXCEPTIONS.`;
                } else {
                    parts[0].text = `PRIMARY DIRECTIVE: Create ${aspectRatio} aspect ratio image. CRITICAL: Output dimensions MUST BE ${aspectRatio}. The ${refImages.length} reference images are for STYLE/SUBJECT INSPIRATION ONLY - completely ignore their dimensions/aspect ratios. Generate: ${finalPrompt}. REMINDER: Final output = ${aspectRatio} aspect ratio, NO EXCEPTIONS.`;
                }
            } else {
                if (refImages.length === 1) {
                    parts[0].text = `Using the provided image as a strong visual reference, generate: ${finalPrompt}. Maintain the key features and style from the reference image.`;
                } else {
                    parts[0].text = `Using the ${refImages.length} provided reference images, generate: ${finalPrompt}. Maintain consistency with all reference images - use their visual features, styles, and characteristics.`;
                }
            }
        }

        console.log(`[ImageGen] Generating with model: ${modelName}`);
        console.log(`[ImageGen] Reference images count: ${refImages.length}`);

        // Retry logic for 500 errors
        let retries = 0;
        const maxRetries = 2;

        while (retries <= maxRetries) {
            try {
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                    {
                        contents: [{
                            parts: parts
                        }],
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // Check for inline image data in the response
                if (response.data && response.data.candidates && response.data.candidates[0]?.content?.parts) {
                    const parts = response.data.candidates[0].content.parts;
                    // Look for a part that has inlineData with an image mimeType
                    const imagePart = parts.find((part: any) => part.inlineData && part.inlineData.mimeType.startsWith('image/'));

                    if (imagePart) {
                        return { url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
                    }
                }

                // If we get here, response was 200 but no image found
                throw new Error('No image data found in Gemini response');

            } catch (error: any) {
                if (error.response?.status === 500 && retries < maxRetries) {
                    console.warn(`[ImageGen] 500 Error encountered. Retrying (${retries + 1}/${maxRetries})...`);
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // Exponential backoff
                    continue;
                }
                throw error; // Re-throw if not 500 or max retries reached
            }
        }

        throw new Error('Max retries exceeded');

    } catch (error: any) {
        console.error('Gemini Image Generation Failed:', error.response?.data || error.message);

        let errorMessage = error.message;
        if (error.response) {
            if (error.response.status === 404) {
                errorMessage = `Model '${modelName}' not found (404). This model might not be available to your API key yet, or the name is incorrect.`;
            } else if (error.response.status === 429) {
                // Get next reset time (tomorrow 9 AM KST)
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0);

                const hoursUntilReset = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));

                errorMessage = `⏰ API 할당량 초과!\n\n` +
                    `무료 플랜은 하루 약 15-50개 이미지만 생성할 수 있습니다.\n` +
                    `약 ${hoursUntilReset}시간 후 (내일 오전 9시경)에 다시 시도해주세요.\n\n` +
                    `💡 지금 할 수 있는 것:\n` +
                    `- 텍스트 프롬프트만 작성하고 저장\n` +
                    `- 다른 Google 계정으로 새 API 키 생성\n` +
                    `- Google Cloud에서 유료 플랜 활성화`;
            } else if (error.response.status === 400) {
                errorMessage = `Bad Request (400): ${JSON.stringify(error.response.data.error?.message || error.response.data)}`;
            } else if (error.response.status === 403) {
                errorMessage = `Permission Denied (403). Please check if your API key has the correct permissions.`;
            } else if (error.response.status === 500) {
                errorMessage = `Server Error (500). Google's servers are having trouble. Please try again later or try a different model.`;
            } else {
                errorMessage = `API Error (${error.response.status}): ${JSON.stringify(error.response.data.error?.message || error.message)}`;
            }
        }

        alert(`Gemini Image Generation Failed: ${errorMessage}`);

        // Fallback to mock response
        console.warn('Falling back to mock generation due to API error.');
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({ url: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800` });
            }, 1000);
        });
    }
};
