import type { ScriptCut } from '../services/gemini';

/**
 * Generate SRT (SubRip Subtitle) format from script
 * Format:
 * 1
 * 00:00:00,000 --> 00:00:05,000
 * Dialogue text
 * 
 * 2
 * 00:00:05,000 --> 00:00:08,000
 * Next dialogue
 */
export const generateSRT = (script: ScriptCut[]): string => {
    let currentTime = 0;

    return script.map((cut, index) => {
        const start = formatSRTTime(currentTime);
        currentTime += cut.estimatedDuration;
        const end = formatSRTTime(currentTime);

        return `${index + 1}
${start} --> ${end}
${cut.dialogue}
`;
    }).join('\n');
};

/**
 * Format seconds to SRT time format: HH:MM:SS,mmm
 */
const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${pad(hours)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
};

/**
 * Pad number with leading zeros
 */
const pad = (num: number, length: number = 2): string => {
    return num.toString().padStart(length, '0');
};
