import axios from 'axios';
import { saveToIdb } from '../utils/imageStorage';

// Gemini 3.1 Pro Preview (Supports AUDIO modality)
const GEMINI_MUSIC_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_MUSIC_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MUSIC_MODEL}:generateContent`;

export interface GeminiMusicConfig {
    prompt: string;
    projectId: string;
}

/**
 * Generates BGM using Gemini 3.1 Pro Preview
 */
export const generateGeminiMusic = async (
    config: GeminiMusicConfig,
    apiKeysRaw: string | string[]
): Promise<{ idbUrl: string; duration: number }> => {
    if (!apiKeysRaw) {
        throw new Error('🔑 Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
    }

    const apiKeys = Array.isArray(apiKeysRaw) ? apiKeysRaw : apiKeysRaw.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) throw new Error("At least one valid API key is required");

    if (!config.prompt || config.prompt.trim().length === 0) {
        throw new Error('Prompt is required for music generation');
    }

    let lastError: any = null;

    for (const apiKey of apiKeys) {
        try {
            console.log(`[Gemini Music] Generating with key ${apiKey.substring(0, 5)}... Model: ${GEMINI_MUSIC_MODEL}`);

            // System instruction to guide the model towards music generation
            const systemInstruction = "You are a professional music composer. Generate high-quality background music (instrumental) based on the user's description. The output should be only the audio data.";

            const response = await axios.post(
                `${GEMINI_MUSIC_URL}?key=${apiKey}`,
                {
                    contents: [{
                        parts: [{
                            text: config.prompt
                        }]
                    }],
                    system_instruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    generationConfig: {
                        response_modalities: ['AUDIO'],
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 180000 // 3 minutes for generation
                }
            );

            if (response.data.error) {
                if (response.data.error.code === 429) {
                    console.warn(`[Gemini Music] 429 Rate Limit for key ${apiKey.substring(0, 5)}... Trying next key.`);
                    continue;
                }
                throw new Error(`Gemini API Error: ${response.data.error.message}`);
            }

            const candidate = response.data.candidates?.[0];
            if (candidate?.finishReason === 'SAFETY') {
                throw new Error('🚫 프롬프트 내용이 안전 정책에 의해 차단되었습니다. 내용을 수정한 후 다시 시도해주세요.');
            }

            const audioPart = candidate?.content?.parts?.find(
                (p: any) => p.inlineData?.mimeType?.startsWith('audio/')
            );
            const textPart = candidate?.content?.parts?.find((p: any) => p.text);

            let rawData: string;
            let mimeType: string;

            if (!audioPart?.inlineData?.data) {
                console.warn('[Gemini Music] No native audio part found. Checking for text-wrapped data...');

                if (textPart?.text) {
                    // Regex to find data URL in text (markdown or raw)
                    const dataUrlMatch = textPart.text.match(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/);

                    if (dataUrlMatch) {
                        console.log('[Gemini Music] ✨ Successfully extracted audio data URL from text response.');
                        const dataUrl = dataUrlMatch[0];
                        rawData = dataUrl.split(',')[1];
                        mimeType = dataUrl.split(';')[0].split(':')[1] || 'audio/mpeg';
                    } else {
                        console.error('[Gemini Music] Model responded with text instead:', textPart.text);
                        throw new Error(`Gemini API가 음악 대신 텍스트로 응답했습니다: "${textPart.text.substring(0, 50)}..."`);
                    }
                } else {
                    console.error('[Gemini Music] No audio data or parsable text found.');
                    console.error('[Gemini Music] Full Response:', JSON.stringify(response.data, null, 2));
                    throw new Error('Gemini API 응답에 오디오 데이터가 없습니다.');
                }
            } else {
                rawData = audioPart.inlineData.data;
                mimeType = audioPart.inlineData.mimeType || 'audio/mpeg';
            }

            // Save to IDB
            const dataUrl = `data:${mimeType};base64,${rawData}`;
            const timestamp = Date.now();
            const key = `ai_bgm_${timestamp}`;
            const idbUrl = await saveToIdb('audio', key, dataUrl);

            // Get duration (optional but helpful)
            const duration = await getAudioDuration(dataUrl);

            return { idbUrl, duration };

        } catch (error: any) {
            const status = error.response?.status;
            if (status === 429) {
                console.warn(`[Gemini Music] 429 Rate Limit for key ${apiKey.substring(0, 5)}... Trying next key.`);
                continue;
            }
            console.error('[Gemini Music] Generation attempt failed:', error.response?.data?.error?.message || error.message);
            lastError = error;
        }
    }

    throw lastError || new Error('All API keys failed for music generation.');
};

/**
 * Helper to get duration from audio data URL
 */
async function getAudioDuration(dataUrl: string): Promise<number> {
    return new Promise((resolve) => {
        const audio = new Audio(dataUrl);
        audio.onloadedmetadata = () => {
            resolve(Math.round(audio.duration));
        };
        audio.onerror = () => {
            console.warn("[Gemini Music] Failed to get audio duration, defaulting to 0.");
            resolve(0);
        };
        // Safety timeout
        setTimeout(() => resolve(0), 5000);
    });
}
