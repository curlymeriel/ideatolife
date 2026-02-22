import axios from 'axios';

export interface ImageGenResponse {
    urls: string[];
}

export interface ReferenceImage {
    name: string;
    url: string;
}

/**
 * Main Image Generation Service
 */
export const generateImage = async (
    _prompt: string,
    apiKey: string,
    referenceImages?: (string | ReferenceImage)[],
    aspectRatio?: string,
    modelName: string = 'gemini-3-pro-image-preview',
    candidateCount: number = 1
): Promise<{ urls: string[] }> => {
    if (!apiKey) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const mockUrls = Array.from({ length: candidateCount }).map((_, i) =>
                    `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&sig=${i}`
                );
                resolve({ urls: mockUrls });
            }, 1000);
        });
    }

    const fallbackModels = [
        'gemini-2.5-pro-image',
        'gemini-2.5-flash-image',
        'gemini-3.0-flash-image'
    ];

    const allModels = [modelName];
    fallbackModels.forEach(m => {
        if (m !== modelName) allModels.push(m);
    });

    // Helper to try generating a single image with a specific model
    const tryGenerateWithModel = async (currentModel: string, prompt: string, ratio: string, refImages: ReferenceImage[]): Promise<string | null> => {
        const parts: any[] = [];

        if (refImages.length > 0) {
            parts.push({
                text: `### MANDATORY VISUAL ANCHORS (ABSOLUTE SOURCE OF TRUTH)
The following images define the visual identity of the characters and assets. 
1. The identities in these images are the ABSOLUTE VISUAL TRUTH. 
2. **IGNORE ANY TEXT DESCRIPTIONS** in the prompt that contradict the provided images.
3. Every time the prompt mentions "(Ref: Name)", you MUST perfectly replicate the facial features, hair style, bone structure, and specific visual identity shown in the corresponding image below.
4. **NO HALLUCINATIONS**: Do NOT add glasses, hats, or accessories unless they are clearly visible in the reference image.
5. **COSTUME CONSISTENCY**: Replicate the clothing shown in the reference image exactly.

---
`
            });

            for (let i = 0; i < refImages.length; i++) {
                const ref = refImages[i];
                const referenceImage = ref.url;
                const refName = ref.name || `Asset_${i + 1}`;
                let mimeType = 'image/jpeg';
                let data = '';

                if (referenceImage.startsWith('data:')) {
                    const commaIdx = referenceImage.indexOf(',');
                    if (commaIdx !== -1) {
                        const header = referenceImage.substring(0, commaIdx);
                        mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                        data = referenceImage.substring(commaIdx + 1);
                    }
                } else if (referenceImage.startsWith('http') || referenceImage.startsWith('blob:')) {
                    try {
                        // Browser-safe fetch and base64 conversion
                        const res = await fetch(referenceImage);
                        const blob = await res.blob();
                        mimeType = blob.type || 'image/jpeg';
                        data = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                resolve(result.split(',')[1]);
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        console.error(`[ImageGen] Failed to fetch reference image ${i + 1}:`, e);
                        continue;
                    }
                }

                if (data) {
                    if (mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
                        mimeType = 'image/jpeg';
                    }

                    parts.push({ text: `### REFERENCE: ${refName}` });
                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: data
                        }
                    });
                }
            }
            // [DIAGNOSTIC] Log delivery confirmation
            const imagePartCount = parts.filter(p => p.inlineData).length;
            const namesSent = refImages.map(r => r.name).join(', ');
            console.log(`[ImageGen] Sending ${imagePartCount} reference images to API... (Names: ${namesSent})`);

            // [TRIPLE ANCHORING - TAIL]
            const tailAnchor = `\n\n---
### FINAL VISUAL REMINDER (MANDATORY):
1. Review all provided reference images again.
2. The character identity and facial features MUST match the corresponding (Ref: Name) exhibit exactly.
3. Priority is Visual Identity Preservation > Text Description.
4. DO NOT DRIFT from the provided character faces.`;

            parts.push({ text: `\n--- \n### SCENE TO GENERATE:\n${prompt}${tailAnchor}` });
        } else {
            parts.push({ text: `Generate an image of: ${prompt}` });
        }

        const getApiAspectRatio = (r?: string): string => {
            if (!r) return '16:9';
            const ratioMap: Record<string, string> = {
                '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '2.35:1': '21:9',
                '21:9': '21:9', '4:3': '4:3', '3:4': '3:4', '3:2': '3:2',
                '2:3': '2:3', '5:4': '5:4', '4:5': '4:5'
            };
            return ratioMap[r] || '16:9';
        };
        const apiAspectRatio = getApiAspectRatio(ratio);

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
                timeout: 60000
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

    const refImagesArray = referenceImages
        ? referenceImages
            .filter(img => img !== null && img !== undefined)
            .map(img => {
                if (typeof img === 'string') return { name: '', url: img };
                return img;
            })
            .filter(img => img.url && img.url.length > 0)
        : [];

    let lastError: any = null;

    for (const model of allModels) {
        try {
            const urls: string[] = [];
            for (let i = 0; i < candidateCount; i++) {
                const url = await tryGenerateWithModel(model, _prompt, aspectRatio || '16:9', refImagesArray);
                if (url) urls.push(url);
                if (i < candidateCount - 1) await new Promise(r => setTimeout(r, 500));
            }

            if (urls.length > 0) return { urls };

        } catch (error: any) {
            console.warn(`[ImageGen] Model ${model} failed:`, error.response?.data?.error?.message || error.message);
            lastError = error;
        }
    }

    let errorMessage = lastError?.message || "Unknown error";
    if (lastError?.code === 'ECONNABORTED' || lastError?.message?.includes('timeout')) {
        errorMessage = `⏱️ 연결 시간 초과 (Timeout)`;
    } else if (lastError?.response) {
        errorMessage = `API Error (${lastError.response.status}): ${lastError.response.data.error?.message}`;
    }

    throw new Error(`All image generation models failed. Last error: ${errorMessage}`);
};

/**
 * Edit an image using AI chat instructions
 */
export const editImageWithChat = async (
    imageUrl: string,
    instruction: string,
    apiKey: string,
    maskImage?: string | null,
    referenceImages?: string[],
    modelName: string = 'gemini-2.5-flash-image'
): Promise<{ image?: string; explanation: string }> => {
    if (!apiKey) return { explanation: 'API key is required for image editing.' };

    try {
        let imageData: string;
        let mimeType: string = 'image/jpeg';
        let maskData: string | null = null;
        let maskMimeType: string = 'image/png';

        const getNormalizedMime = (mime: string) => {
            if (mime === 'application/octet-stream' || !mime.startsWith('image/')) return 'image/jpeg';
            return mime;
        };

        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = getNormalizedMime(matches[1]);
                imageData = matches[2];
            } else throw new Error('Invalid image data URL format');
        } else {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            imageData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            mimeType = getNormalizedMime(blob.type);
        }

        if (maskImage && maskImage.startsWith('data:')) {
            const maskMatches = maskImage.match(/^data:(.+);base64,(.+)$/);
            if (maskMatches && maskMatches.length === 3) {
                maskMimeType = maskMatches[1];
                maskData = maskMatches[2];
            }
        }

        const requestParts: any[] = [];
        let systemText = `# IMAGE EDITING TASK\n... (System Instruction) ...\n${instruction}\n`;
        requestParts.push({ text: systemText });

        requestParts.push({ text: `\n### TARGET IMAGE:\n` });
        requestParts.push({ inlineData: { mimeType, data: imageData } });

        if (maskData) {
            requestParts.push({ text: `\n### INPAINTING MASK:\n` });
            requestParts.push({ inlineData: { mimeType: maskMimeType, data: maskData } });
        }

        if (referenceImages && referenceImages.length > 0) {
            referenceImages.forEach((ref, i) => {
                const matches = ref.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    requestParts.push({ text: `\n### REFERENCE #${i + 1}:\n` });
                    requestParts.push({
                        inlineData: {
                            mimeType: getNormalizedMime(matches[1]),
                            data: matches[2]
                        }
                    });
                }
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: requestParts }],
                    generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
                })
            }
        );

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        let editedImage: string | undefined;
        let explanation = '이미지를 수정했습니다.';

        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                editedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text) explanation = part.text;
        }

        return { image: editedImage, explanation };
    } catch (error: any) {
        console.error('[ImageEdit] Error:', error);
        return { explanation: `편집 중 오류 발생: ${error.message || 'Unknown error'}` };
    }
};
