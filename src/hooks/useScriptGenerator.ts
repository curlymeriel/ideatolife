import { useState } from 'react';
import { generateScript } from '../services/gemini';
import type { ScriptCut } from '../services/gemini';
import type { Character, Location } from '../store/types';

interface UseScriptGeneratorParams {
    seriesName: string;
    episodeName: string;
    targetDuration: number;
    stylePrompts: {
        font: string;
        layout: string;
        color: string;
    };
    apiKey: string;
    episodePlot: string;
    characters: Character[];
    seriesLocations: Location[];
    episodeCharacters: Character[];
    episodeLocations: Location[];
}

interface UseScriptGeneratorReturn {
    isGenerating: boolean;
    generateNewScript: (params: UseScriptGeneratorParams, existingScript?: ScriptCut[]) => Promise<ScriptCut[]>;
    error: Error | null;
}

/**
 * Custom hook to handle script generation logic
 * Separates API calls and state management from UI components
 */
export const useScriptGenerator = (): UseScriptGeneratorReturn => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const generateNewScript = async (params: UseScriptGeneratorParams, existingScript: ScriptCut[] = []): Promise<ScriptCut[]> => {
        setIsGenerating(true);
        setError(null);

        try {
            const allCharacters = [...params.characters, ...params.episodeCharacters];
            const allLocations = [...params.seriesLocations, ...params.episodeLocations];

            const generated = await generateScript(
                params.seriesName,
                params.episodeName,
                params.targetDuration,
                params.stylePrompts,
                params.apiKey,
                params.episodePlot,
                allCharacters,
                allLocations
            );

            // Merge with confirmed cuts (preserve user-confirmed content)
            const mergedScript = generated.map((newCut, index) => {
                const existingCut = existingScript[index];
                if (existingCut && existingCut.isConfirmed) {
                    return existingCut;
                }
                return newCut;
            });

            return mergedScript;
        } catch (err) {
            console.error('Script generation failed:', err);
            setError(err as Error);

            // Return fallback script on error
            return [
                {
                    id: 1,
                    speaker: 'Narrator',
                    dialogue: 'In a world of pure imagination...',
                    visualPrompt: 'Wide shot of a fantasy landscape, golden hour',
                    estimatedDuration: 5
                },
                {
                    id: 2,
                    speaker: 'Hero',
                    dialogue: 'We have to keep moving.',
                    visualPrompt: 'Close up of hero looking determined',
                    estimatedDuration: 3
                },
            ];
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        isGenerating,
        generateNewScript,
        error
    };
};
