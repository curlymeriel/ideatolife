import axios from 'axios';

// Gemini TTS 모델
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;

// 사용 가능한 Gemini TTS 음성 목록 (30 voices - Full Google AI Studio List)
export const GEMINI_TTS_VOICES = [
    // Female voices
    { id: 'Aoede', label: 'Aoede', gender: 'female', style: 'Warm, clear, conversational, engaging', lang: 'multilingual' },
    { id: 'Kore', label: 'Kore', gender: 'female', style: 'Energetic, youthful, confident, bright', lang: 'multilingual' },
    { id: 'Leda', label: 'Leda', gender: 'female', style: 'Vibrant, high-energy, positive, friendly', lang: 'multilingual' },
    { id: 'Zephyr', label: 'Zephyr', gender: 'female', style: 'Energetic, bright, warm, modern', lang: 'multilingual' },
    { id: 'Callirrhoe', label: 'Callirrhoe', gender: 'female', style: 'Crisp, confident, professional, upbeat', lang: 'multilingual' },
    { id: 'Autonoe', label: 'Autonoe', gender: 'female', style: 'High-energy, friendly, vibrant, approachable', lang: 'multilingual' },
    { id: 'Despina', label: 'Despina', gender: 'female', style: 'High-energy, youthful, warm, inviting', lang: 'multilingual' },
    { id: 'Erinome', label: 'Erinome', gender: 'female', style: 'Bright, polished, helpful, professional', lang: 'multilingual' },
    { id: 'Laomedeia', label: 'Laomedeia', gender: 'female', style: 'High-energy, friendly, clear, upbeat', lang: 'multilingual' },
    { id: 'Achernar', label: 'Achernar', gender: 'female', style: 'Soft, bubbly, modern, youthful', lang: 'multilingual' },
    { id: 'Gacrux', label: 'Gacrux', gender: 'female', style: 'Mature, warm, engaging, conversational', lang: 'multilingual' },
    { id: 'Pulcherrima', label: 'Pulcherrima', gender: 'female', style: 'Bright, energetic, youthful, polished', lang: 'multilingual' },
    { id: 'Vindemiatrix', label: 'Vindemiatrix', gender: 'female', style: 'Lively, dynamic, engaging, upbeat', lang: 'multilingual' },
    { id: 'Sulafat', label: 'Sulafat', gender: 'female', style: 'Warm, confident, articulate, clear', lang: 'multilingual' },
    // Male voices
    { id: 'Puck', label: 'Puck', gender: 'male', style: 'Energetic, expressive, upbeat, enthusiastic', lang: 'multilingual' },
    { id: 'Charon', label: 'Charon', gender: 'male', style: 'Rich, deep, mature, reassuring, informative', lang: 'multilingual' },
    { id: 'Fenrir', label: 'Fenrir', gender: 'male', style: 'Bright, youthful, eager, conversational', lang: 'multilingual' },
    { id: 'Orus', label: 'Orus', gender: 'male', style: 'Lively, energetic, professional, clear', lang: 'multilingual' },
    { id: 'Enceladus', label: 'Enceladus', gender: 'male', style: 'Clear, confident, mature, professional', lang: 'multilingual' },
    { id: 'Iapetus', label: 'Iapetus', gender: 'male', style: 'Polished, approachable, warm, friendly', lang: 'multilingual' },
    { id: 'Umbriel', label: 'Umbriel', gender: 'male', style: 'Smooth, authoritative, friendly, engaging', lang: 'multilingual' },
    { id: 'Algieba', label: 'Algieba', gender: 'male', style: 'Warm, conversational, crisp, confident', lang: 'multilingual' },
    { id: 'Algenib', label: 'Algenib', gender: 'male', style: 'Warm, velvety, helpful, professional', lang: 'multilingual' },
    { id: 'Rasalgethi', label: 'Rasalgethi', gender: 'male', style: 'Energetic, youthful, enthusiastic, bouncy', lang: 'multilingual' },
    { id: 'Alnilam', label: 'Alnilam', gender: 'male', style: 'Energetic, firm, fast-paced, modern', lang: 'multilingual' },
    { id: 'Schedar', label: 'Schedar', gender: 'male', style: 'Even, mature, crisp, confident, versatile', lang: 'multilingual' },
    { id: 'Achird', label: 'Achird', gender: 'male', style: 'Friendly, high-energy, approachable', lang: 'multilingual' },
    { id: 'Zubenelgenubi', label: 'Zubenelgenubi', gender: 'male', style: 'Crisp, energetic, confident, engaging', lang: 'multilingual' },
    { id: 'Sadachbia', label: 'Sadachbia', gender: 'male', style: 'High-energy, friendly, confident, warm', lang: 'multilingual' },
    { id: 'Sadaltager', label: 'Sadaltager', gender: 'male', style: 'Warm, relaxed, natural, conversational', lang: 'multilingual' },
];

export const GEMINI_TTS_SAMPLES: Record<string, string> = {};

export interface GeminiTtsConfig {
    voiceName: string;         // 'Puck', 'Aoede', etc.
    languageCode: string;      // 'ko-KR', 'en-US', etc.
    actingDirection?: string;  // Natural language prompt for style/emotion
    volume?: number;           // Volume multiplier (0.5 - 1.5)
    rate?: number;             // Speaking rate multiplier
}

/**
 * Generates speech using Gemini 2.5 Flash TTS
 * v9.9 Obsidian Fix: Pure Binary (Blob) Pipeline + 60% Normalization + Global Scan.
 */
export const generateGeminiSpeech = async (
    text: string,
    apiKey: string,
    config: GeminiTtsConfig
): Promise<Blob | string> => {
    if (!apiKey) {
        throw new Error('🔑 Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
    }

    if (!text || text.trim().length === 0) {
        throw new Error('Text is required for speech generation');
    }

    try {
        let promptText = text;
        const styleInstructions: string[] = [];
        if (config.actingDirection) styleInstructions.push(config.actingDirection);

        // Inject numeric hints as natural language if they deviate from normal
        if (config.rate && (config.rate > 1.05 || config.rate < 0.95)) {
            const speedTerm = config.rate > 1.0 ? 'fast' : 'slow';
            styleInstructions.push(`Speak ${speedTerm} (speed: ${config.rate}x)`);
        }
        if (config.volume && (config.volume > 1.05 || config.volume < 0.95)) {
            const volTerm = config.volume > 1.0 ? 'loud' : 'soft';
            styleInstructions.push(`Speak ${volTerm} (volume: ${config.volume}x)`);
        }

        if (styleInstructions.length > 0) {
            promptText = `[Style: ${styleInstructions.join(', ')}]\n\n"${text}"`;
        }

        console.log(`[Gemini TTS v9.9] Requesting: voice=${config.voiceName}, lang=${config.languageCode}`);

        const response = await axios.post(
            `${GEMINI_TTS_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voiceName
                            }
                        },
                        languageCode: config.languageCode
                    }
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
                timeout: 120000
            }
        );

        if (response.data.error) {
            throw new Error(`Gemini API Error: ${response.data.error.message}`);
        }

        const candidate = response.data.candidates?.[0];
        if (candidate?.finishReason === 'SAFETY') {
            throw new Error('🚫 내용이 안전 정책에 의해 차단되었습니다. 대사 내용을 확인해주세요.');
        }

        const audioPart = candidate?.content?.parts?.find(
            (p: any) => p.inlineData?.mimeType?.startsWith('audio/')
        );

        if (!audioPart?.inlineData?.data) {
            throw new Error('Gemini TTS 응답에 오디오 데이터가 없습니다.');
        }

        const rawData = audioPart.inlineData.data;
        const mimeType = audioPart.inlineData.mimeType || '';

        // v9.9: Wrapping as 48kHz Stereo (Pure Binary/Blob Pipeline)
        if (mimeType.includes('L16') || mimeType.includes('pcm')) {
            const rateMatch = mimeType.match(/rate=(\d+)/);
            const rate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
            console.log(`[Gemini TTS v9.9] Processing PCM -> 48kHz Stereo (Source: ${rate}Hz)`);
            return await wrapPcmInWav(rawData, rate, config.volume);
        }

        return `data:${mimeType};base64,${rawData}`;

    } catch (error: any) {
        console.error('[Gemini TTS] v9.9 Generation failed:', error);
        throw error;
    }
};

/**
 * Wraps raw Mono PCM data in a high-fidelity 48kHz STEREO WAV (v9.9 Obsidian)
 * Features: Pure Binary Output + 60% Normalization + Global Scanning.
 */
async function wrapPcmInWav(base64Pcm: string, sourceRate: number = 24000, volumeMultiplier: number = 1.0): Promise<Blob> {
    try {
        const binaryString = atob(base64Pcm);
        const pcmLen = binaryString.length;
        const pcmUint8 = new Uint8Array(pcmLen);
        for (let i = 0; i < pcmLen; i++) pcmUint8[i] = binaryString.charCodeAt(i);

        const sourceSamples = Math.floor(pcmLen / 2);
        const sourceDataView = new DataView(pcmUint8.buffer);

        // --- 1. Global Signal Scanning (Format Detection) ---
        let isLittleEndian = true;
        let mavLE = 0;
        let mavBE = 0;
        let nonZeroSamples = 0;

        for (let i = 0; i < sourceSamples && nonZeroSamples < 5000; i++) {
            const b1 = pcmUint8[i * 2];
            const b2 = pcmUint8[i * 2 + 1];
            if (b1 !== 0 || b2 !== 0) {
                mavLE += Math.abs(sourceDataView.getInt16(i * 2, true));
                mavBE += Math.abs(sourceDataView.getInt16(i * 2, false));
                nonZeroSamples++;
            }
        }

        if (mavBE > mavLE * 1.5) isLittleEndian = true;
        else if (mavLE > mavBE * 1.5) isLittleEndian = false;

        console.log(`[Gemini TTS v9.9] Global Scan: isLE=${isLittleEndian} (MAV LE: ${Math.round(mavLE / (nonZeroSamples || 1))}, BE: ${Math.round(mavBE / (nonZeroSamples || 1))})`);

        // --- 2. Phase A: Convert to Float32 & High-Quality Resample ---
        const targetRate = 48000;
        const resampleRatio = targetRate / sourceRate;
        const targetSamples = Math.floor(sourceSamples * resampleRatio);

        const floatBuffer = new Float32Array(targetSamples);
        let maxPeak = 0;

        for (let i = 0; i < targetSamples; i++) {
            const sourcePos = i / resampleRatio;
            const index = Math.floor(sourcePos);
            const fraction = sourcePos - index;

            let s1 = sourceDataView.getInt16(index * 2, isLittleEndian) / 32768.0;
            let s2 = (index < sourceSamples - 1)
                ? sourceDataView.getInt16((index + 1) * 2, isLittleEndian) / 32768.0
                : s1;

            let sample = s1 + (s2 - s1) * fraction;
            const absVal = Math.abs(sample);
            if (absVal > maxPeak) maxPeak = absVal;

            floatBuffer[i] = sample;
        }

        // --- 3. Phase B: Obsidian Normalization (-4.4dB / 60%) ---
        const targetPeak = 0.6; // Obsidian Tier 60%
        let normFactor = volumeMultiplier;

        const currentPeak = maxPeak * volumeMultiplier;
        if (currentPeak > targetPeak) {
            normFactor = targetPeak / maxPeak;
            console.log(`[Gemini TTS v9.9] Normalization Applied: Signal Peak ${Math.round(currentPeak * 100)}% -> Scaled to ${Math.round(targetPeak * 100)}%`);
        }

        const fadeSmp = Math.min(Math.floor(targetRate * 0.005), 120);

        // --- 4. Phase C: Final Conversion: Float32 -> Int16 Stereo WAV Blob ---
        const wavDataLen = targetSamples * 2 * 2;
        const wavBuffer = new ArrayBuffer(44 + wavDataLen);
        const wavView = new DataView(wavBuffer);

        // Header
        wavView.setUint32(0, 0x52494646, false);
        wavView.setUint32(4, 36 + wavDataLen, true);
        wavView.setUint32(8, 0x57415645, false);
        wavView.setUint32(12, 0x666d7420, false);
        wavView.setUint32(16, 16, true);
        wavView.setUint16(20, 1, true);
        wavView.setUint16(22, 2, true);
        wavView.setUint32(24, targetRate, true);
        wavView.setUint32(28, targetRate * 4, true);
        wavView.setUint16(32, 4, true);
        wavView.setUint16(34, 16, true);
        wavView.setUint32(36, 0x64617461, false);
        wavView.setUint32(40, wavDataLen, true);

        for (let i = 0; i < targetSamples; i++) {
            let sample = floatBuffer[i] * normFactor;

            if (i < fadeSmp) sample *= (i / fadeSmp);
            else if (i > targetSamples - fadeSmp) sample *= ((targetSamples - i) / fadeSmp);

            const finalInt16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
            wavView.setInt16(44 + (i * 4), finalInt16, true);
            wavView.setInt16(44 + (i * 4) + 2, finalInt16, true);
        }

        console.log(`[Gemini TTS v9.9] Telemetry: Final Peak: ${Math.round((maxPeak * normFactor) * 100)}%, Samples: ${targetSamples}, Buffer: ${wavBuffer.byteLength} bytes`);
        return new Blob([wavBuffer], { type: 'audio/wav' });

    } catch (e) {
        console.error('[Gemini TTS] v9.9 wrapping failed:', e);
        throw e;
    }
}

export const getDefaultGeminiVoice = (gender?: string, age?: string): string => {
    if (gender === 'female') {
        if (age === 'child' || age === 'young') return 'Leda';
        return 'Aoede';
    } else if (gender === 'male') {
        if (age === 'child' || age === 'young') return 'Puck';
        if (age === 'senior') return 'Charon';
        return 'Fenrir';
    }
    return 'Zephyr';
};

export const isGeminiTtsVoice = (voiceId: string): boolean => {
    return GEMINI_TTS_VOICES.some(v => v.id === voiceId);
};
