import axios from 'axios';
import { parseRate, parsePitch, parseVolume } from './tts_parsers';
import { generateGeminiSpeech } from './geminiTts';

export interface AudioAsset {
    cutId: number;
    url: string;
    duration: number;
}

export interface VoiceConfig {
    language: 'en-US' | 'ko-KR';
    pitch?: string;     // Neural2 only (e.g., '+2st', '-1st')
    rate?: string;      // All models (e.g., '110%', 'slow')
    volume?: string;    // All models (e.g., 'loud', '+3dB')
    style?: 'apologetic' | 'calm' | 'empathetic' | 'firm' | 'lively';  // Neural2-F/J only
}

/**
 * Builds SSML markup with language-aware prosody controls
 * Chirp 3 HD: only rate and volume (no pitch)
 * Neural2: rate, volume, and pitch
 */
function buildSSML(text: string, config: VoiceConfig): string {
    let ssml = '<speak>';

    // Google Style support (English Neural2-F, Neural2-J only)
    if (config.style && config.language === 'en-US') {
        ssml += `<google:style name="${config.style}">`;
    }

    // Prosody attributes
    const prosodyAttrs: string[] = [];

    // Chirp 3 HD (Korean): rate, volume only
    // Neural2 (English): rate, volume, pitch all supported
    if (config.rate) prosodyAttrs.push(`rate="${config.rate}"`);
    if (config.volume) prosodyAttrs.push(`volume="${config.volume}"`);
    if (config.pitch && config.language === 'en-US') {
        // Only add pitch for English Neural2 voices
        prosodyAttrs.push(`pitch="${config.pitch}"`);
    }

    if (prosodyAttrs.length > 0) {
        ssml += `<prosody ${prosodyAttrs.join(' ')}>`;
    }

    ssml += text;

    if (prosodyAttrs.length > 0) {
        ssml += '</prosody>';
    }

    if (config.style && config.language === 'en-US') {
        ssml += '</google:style>';
    }

    ssml += '</speak>';
    return ssml;
}

export const generateSpeech = async (
    text: string,
    voiceName: string,
    apiKey: string,
    model: 'standard' | 'wavenet' | 'neural2' | 'chirp3-hd' | 'gemini-tts' = 'neural2',
    voiceConfig?: VoiceConfig
): Promise<string> => {
    if (!apiKey) {
        // Mock response
        return Promise.resolve('mock:beep');
    }

    // Route to Gemini TTS if selected
    if (model === 'gemini-tts') {
        try {
            // Find the character's gender/age from voiceConfig or assume default
            const geminiVoiceName = voiceName.includes('-') ? voiceName.split('-').pop() || 'Aoede' : voiceName;

            // Import GEMINI_TTS_VOICES to look up voice style
            const { GEMINI_TTS_VOICES } = await import('./geminiTts');
            const voiceDef = GEMINI_TTS_VOICES.find(v => v.id === geminiVoiceName);
            const baseStyle = voiceDef?.style || '';

            // Combine scene-specific acting direction (from voiceConfig extended prop) with base style
            // Note: voiceConfig currently lacks 'actingDirection' type definition in this file, we cast it
            const sceneDirection = (voiceConfig as any)?.actingDirection || '';

            let combinedDirection = baseStyle;
            if (sceneDirection) {
                combinedDirection = baseStyle ? `${baseStyle}. ${sceneDirection}` : sceneDirection;
            }

            const result = await generateGeminiSpeech(text, apiKey, {
                voiceName: geminiVoiceName,
                languageCode: voiceConfig?.language || 'en-US',
                rate: voiceConfig?.rate ? parseRate(voiceConfig.rate) : 1.0,
                volume: voiceConfig?.volume ? 1.0 : 1.0, // Simple mapping for now
                actingDirection: combinedDirection // Pass the combined direction
            });

            if (result instanceof Blob) {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(result);
                });
            }
            return result;
        } catch (e) {
            console.error('[TTS] Gemini fallback failed, trying Google:', e);
            // Fallback to Google if Gemini fails? Or just throw? 
            // For build fix, we just need the type to match.
        }
    }

    try {
        // Construct proper voice name for Google Cloud TTS
        let fullVoiceName = voiceName;

        // If voiceName doesn't look like a full Google Cloud voice name, construct one
        if (!voiceName.includes('-')) {
            // Use model parameter to construct full voice name
            if (model === 'chirp3-hd') {
                fullVoiceName = `ko-KR-Chirp3-HD-Aoede`; // Default Korean Chirp 3 HD voice
            } else {
                // neural2/wavenet/standard voices use format: en-US-{Model}-{A-J}
                const modelSuffix = model === 'neural2' ? 'Neural2' : model === 'wavenet' ? 'Wavenet' : 'Standard';
                fullVoiceName = `en-US-${modelSuffix}-C`;
            }
        }

        const language = voiceConfig?.language || 'en-US';

        console.log(`[TTS] Generating speech with voice: ${fullVoiceName}, model: ${model}, language: ${language}`);
        console.log(`[TTS] Text length: ${text.length} characters`);
        if (voiceConfig) {
            console.log(`[TTS] VoiceConfig:`, voiceConfig);
        }

        // Generate SSML if voiceConfig provided
        const inputPayload = voiceConfig
            ? { ssml: buildSSML(text, voiceConfig) }
            : { text };

        if (voiceConfig) {
            console.log(`[TTS] Generated SSML:`, inputPayload.ssml);
        }

        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            {
                input: inputPayload,
                voice: {
                    languageCode: language,
                    name: fullVoiceName
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    // Pass speakingRate and pitch explicitly for models that might ignore SSML prosody (like Chirp)
                    ...(voiceConfig?.rate && { speakingRate: parseRate(voiceConfig.rate) }),
                    ...(voiceConfig?.pitch && { pitch: parsePitch(voiceConfig.pitch) }),
                    ...(voiceConfig?.volume && { volumeGainDb: parseVolume(voiceConfig.volume) }),
                }
            }
        );

        // The API returns base64-encoded audio in audioContent
        const audioContent = response.data.audioContent;

        if (!audioContent) {
            throw new Error('No audio content returned from TTS API');
        }

        // Convert base64 to data URL for direct playback
        const audioDataUrl = `data:audio/mp3;base64,${audioContent}`;

        console.log(`[TTS] Successfully generated audio (${audioDataUrl.length} chars)`);
        return audioDataUrl;

    } catch (error: any) {
        console.error('TTS Generation Failed:', error);
        console.error('Error response:', error.response?.data);

        // User-friendly error messages
        if (error.response?.status === 429) {
            throw new Error('⏳ Google Cloud TTS API quota exceeded. Please try again later or upgrade your plan.');
        } else if (error.response?.status === 403) {
            throw new Error('🔑 Invalid Google Cloud API key or TTS API not enabled. Please check your API key in Settings.');
        } else if (error.response?.status === 400) {
            const errorDetails = error.response?.data?.error?.message || 'Unknown error';
            throw new Error(`❌ Invalid TTS request: ${errorDetails}\n\nPlease check:\n- Text content is not empty\n- API key has TTS API enabled\n- Voice name is valid`);
        }

        throw new Error(`Failed to generate speech: ${error.message}`);
    }
};
