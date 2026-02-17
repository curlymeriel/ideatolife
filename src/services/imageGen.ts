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

    // Fallback models (3.0 Pro -> 2.5 Pro -> 2.5 Flash -> 3.0 Flash)
    const fallbackModels = [
        'gemini-2.5-pro-image',
        'gemini-2.5-flash-image',
        'gemini-3.0-flash-image'
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
                    let mimeType = matches[1];
                    const data = matches[2];

                    // Safely normalize MIME type (some browsers/tools default to octet-stream)
                    if (mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
                        mimeType = 'image/jpeg';
                    }

                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: data
                        }
                    });
                }
            });

            // NEW: Simplified and highly authoritative mapping
            const anchorLines = refImages.map((_, i) => `- IMAGE_${i + 1} is "Reference #${i + 1}"`).join('\n');
            const mappingPreamble = `### MANDATORY VISUAL ANCHORS (PREVIOUS SESSIONS)
${anchorLines}

MANDATORY INSTRUCTIONS:
1. Every time the prompt mentions "Reference #N", you MUST perfectly replicate the facial features, hair, body, and specific visual identity shown in IMAGE_N.
2. The identities in these images are the ABSOLUTE VISUAL TRUTH. Ignore any text descriptions that contradict the provided images.
3. Maintain 100% consistency with the visual references for characters and locations.

### SCENE TO GENERATE:
`;
            parts[0].text = mappingPreamble + _prompt;
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

/**
 * Edit an image using AI chat instructions
 * Sends the image + user instruction to Gemini and returns modified image
 */
export const editImageWithChat = async (
    imageUrl: string,
    instruction: string,
    apiKey: string,
    maskImage?: string | null, // [NEW] Optional mask for region-based editing
    referenceImages?: string[], // [NEW] Optional tagged references
    modelName: string = 'gemini-2.5-flash-image' // [NEW] Dynamic model selection
): Promise<{ image?: string; explanation: string }> => {
    if (!apiKey) {
        return { explanation: 'API key is required for image editing.' };
    }

    try {
        // Prepare primary image data
        let imageData: string;
        let mimeType: string = 'image/jpeg';
        let maskData: string | null = null;
        let maskMimeType: string = 'image/png';

        // Helper for normalization
        const getNormalizedMime = (mime: string) => {
            if (mime === 'application/octet-stream' || !mime.startsWith('image/')) {
                return 'image/jpeg';
            }
            return mime;
        };

        // 1. Process Main Image
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = getNormalizedMime(matches[1]);
                imageData = matches[2];
            } else {
                throw new Error('Invalid image data URL format');
            }
        } else {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            // Safer binary to base64 conversion using FileReader
            imageData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            mimeType = getNormalizedMime(blob.type);
        }

        // 2. Process Mask Image (if provided)
        if (maskImage && maskImage.startsWith('data:')) {
            const maskMatches = maskImage.match(/^data:(.+);base64,(.+)$/);
            if (maskMatches && maskMatches.length === 3) {
                maskMimeType = maskMatches[1];
                maskData = maskMatches[2];
            }
        }

        // 3. Construct Payload using INTERLEAVED TEXT-IMAGE structure
        // This ensures the AI clearly identifies each image by its preceding label
        const requestParts: any[] = [];

        // System instruction first
        let systemText = `# IMAGE EDITING TASK\n`;
        systemText += `You are an expert image editor. Your ONLY job is to modify the TARGET IMAGE based on the instruction.\n\n`;
        systemText += `## CRITICAL RULES\n`;
        systemText += `1. **MODIFY ONLY THE TARGET**: The image immediately following "### TARGET IMAGE" is the ONLY image you should edit.\n`;
        systemText += `2. **REFERENCE IMAGES ARE READ-ONLY**: Images labeled as "### REFERENCE" are for visual guidance ONLY. Never modify or return them.\n`;
        systemText += `3. **OUTPUT**: Return a modified version of the TARGET IMAGE.\n\n`;
        systemText += `## USER INSTRUCTION\n${instruction}\n`;
        requestParts.push({ text: systemText });

        // TARGET IMAGE (with explicit label immediately before)
        requestParts.push({ text: `\n### TARGET IMAGE (This is the image you MUST edit and return):\n` });
        requestParts.push({
            inlineData: {
                mimeType: mimeType,
                data: imageData
            }
        });

        // MASK IMAGE (if exists)
        if (maskData) {
            requestParts.push({ text: `\n### INPAINTING MASK (White = edit area, Black = preserve):\n` });
            requestParts.push({
                inlineData: {
                    mimeType: maskMimeType,
                    data: maskData
                }
            });
        }

        // REFERENCE IMAGES (each with explicit label)
        if (referenceImages && referenceImages.length > 0) {
            referenceImages.forEach((ref, i) => {
                const matches = ref.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    requestParts.push({ text: `\n### REFERENCE #${i + 1} (Visual guide only - DO NOT EDIT THIS):\n` });
                    requestParts.push({
                        inlineData: {
                            mimeType: getNormalizedMime(matches[1]),
                            data: matches[2]
                        }
                    });
                }
            });
        }

        // Final reminder
        requestParts.push({ text: `\n### FINAL INSTRUCTION\nNow apply the user instruction to the TARGET IMAGE and output ONLY the modified TARGET IMAGE.` });

        // Use Gemini for image editing
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: requestParts }],
                    generationConfig: {
                        responseModalities: ["IMAGE", "TEXT"]
                    }
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            console.error('[ImageEdit] API Error:', data.error);
            return { explanation: `편집 실패: ${data.error.message || 'Unknown error'}` };
        }

        // Extract the edited image and explanation
        const parts = data.candidates?.[0]?.content?.parts || [];
        let editedImage: string | undefined;
        let explanation = '이미지를 수정했습니다.';

        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                editedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text) {
                explanation = part.text;
            }
        }

        if (!editedImage) {
            // Fallback: Try with the same model but simpler prompt
            console.warn('[ImageEdit] No image in response, trying simplified fallback...');
            const fallbackResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: `Inpaint the masked area (IMAGE_1) of the image (IMAGE_0) based on this instruction: ${instruction}. Keep the rest identical.` },
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: imageData
                                    }
                                },
                                ...(maskData ? [{
                                    inlineData: {
                                        mimeType: maskMimeType,
                                        data: maskData
                                    }
                                }] : [])
                            ]
                        }],
                        generationConfig: {
                            responseModalities: ["IMAGE", "TEXT"]
                        }
                    })
                }
            );

            const fallbackData = await fallbackResponse.json();
            const fallbackParts = fallbackData.candidates?.[0]?.content?.parts || [];

            for (const part of fallbackParts) {
                if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                    editedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
                if (part.text) {
                    explanation = part.text;
                }
            }
        }

        return { image: editedImage, explanation };

    } catch (error: any) {
        console.error('[ImageEdit] Error:', error);
        return {
            explanation: `편집 중 오류 발생: ${error.message || 'Unknown error'}`
        };
    }
};
