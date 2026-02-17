/**
 * Shared Aspect Ratio → Resolution Map
 * Used by Step5 (Thumbnail), Step6 (Export), and other modules that need
 * to convert an aspect ratio string into pixel dimensions.
 */
import type { AspectRatio } from '../store/types';

export const RESOLUTIONS: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '21:9': { width: 2560, height: 1080 },
    '2.35:1': { width: 1920, height: 817 },
    '4:5': { width: 1080, height: 1350 },
    '3:4': { width: 1080, height: 1440 },
};

/**
 * Get pixel resolution for a given aspect ratio.
 * Falls back to 16:9 (1920×1080) if the ratio is unknown.
 */
export function getResolution(ratio: AspectRatio | string | undefined): { width: number; height: number } {
    return RESOLUTIONS[ratio || '16:9'] || RESOLUTIONS['16:9'];
}
