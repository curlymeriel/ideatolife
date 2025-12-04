import type { ScriptCut, StorylineScene } from '../services/gemini';

/**
 * Link script cuts to their source storyline scenes based on timing
 */
export function linkCutsToStoryline(
    cuts: ScriptCut[],
    storylineTable: StorylineScene[] | undefined
): ScriptCut[] {
    if (!storylineTable || storylineTable.length === 0) return cuts;

    // Calculate cumulative duration for each cut
    let currentTime = 0;
    let sceneIndex = 0;

    return cuts.map(cut => {
        // Find which scene this cut belongs to based on accumulated time
        while (sceneIndex < storylineTable.length - 1) {
            const scene = storylineTable[sceneIndex];
            const [, endTime] = parseTimeRange(scene.estimatedTime);

            // If current time is beyond this scene's end, move to next scene
            if (currentTime + cut.estimatedDuration > endTime) {
                sceneIndex++;
            } else {
                break;
            }
        }

        currentTime += cut.estimatedDuration;

        const scene = storylineTable[sceneIndex];
        return {
            ...cut,
            storylineSceneId: scene.id || `scene-${scene.sceneNumber}`
        };
    });
}

/**
 * Parse time range string like "0:00-0:30" to [startSeconds, endSeconds]
 */
function parseTimeRange(timeStr: string): [number, number] {
    const parts = timeStr.split('-');
    if (parts.length !== 2) return [0, 60]; // Default to 1 minute

    const start = parseTimeCode(parts[0].trim());
    const end = parseTimeCode(parts[1].trim());
    return [start, end];
}

/**
 * Parse time code like "1:30" or "0:30" to seconds
 */
function parseTimeCode(timeCode: string): number {
    const parts = timeCode.split(':').map(Number);
    if (parts.length === 2) {
        // MM:SS format
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

/**
 * Group cuts by their storyline scene
 */
export function groupCutsByScene(cuts: ScriptCut[]): Map<string, ScriptCut[]> {
    const sceneGroups = new Map<string, ScriptCut[]>();

    cuts.forEach(cut => {
        if (cut.storylineSceneId) {
            const group = sceneGroups.get(cut.storylineSceneId) || [];
            group.push(cut);
            sceneGroups.set(cut.storylineSceneId, group);
        }
    });

    return sceneGroups;
}

/**
 * Sync cut changes back to storyline table
 */
export function syncCutsToStoryline(
    cuts: ScriptCut[],
    storylineTable: StorylineScene[]
): StorylineScene[] {
    const sceneGroups = groupCutsByScene(cuts);

    return storylineTable.map(scene => {
        const sceneId = scene.id || `scene-${scene.sceneNumber}`;
        const sceneCuts = sceneGroups.get(sceneId) || [];

        if (sceneCuts.length > 0) {
            // Aggregate dialogue from cuts
            const combinedDialogue = sceneCuts
                .map(c => c.dialogue)
                .join(' ')
                .substring(0, 200); // Limit to 200 chars

            // Aggregate visual prompts
            const combinedVisual = sceneCuts
                .map(c => c.visualPrompt)
                .join('; ')
                .substring(0, 200);

            return {
                ...scene,
                id: sceneId, // Ensure ID exists
                content: combinedDialogue || scene.content,
                directionNotes: combinedVisual || scene.directionNotes,
                linkedCutIds: sceneCuts.map(c => c.id)
            };
        }

        return {
            ...scene,
            id: sceneId  // Ensure ID exists
        };
    });
}
