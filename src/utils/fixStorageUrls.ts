import type { ScriptCut } from '../services/gemini';

/**
 * REPAIR SCRIPT: Fixes URLs that were incorrectly migrated to .appspot.com
 * AND handles any potential malformed URLs.
 * 
 * Target Domain: 'ideatolife-meriel.firebasestorage.app'
 * Incorrect Domain: 'ideatolife-meriel.appspot.com'
 * 
 * @param script The current script array
 * @returns The fixed script array, or null if no changes were needed
 */
export const fixProjectScriptUrls = (script: ScriptCut[]): ScriptCut[] | null => {
    let hasChanges = false;
    const WRONG_DOMAIN = 'ideatolife-meriel.appspot.com';
    const CORRECT_DOMAIN = 'ideatolife-meriel.firebasestorage.app';

    const fixUrl = (url: string | undefined): string | undefined => {
        if (!url) return url;

        // If URL has the WRONG domain (.appspot.com), revert it to the CORRECT one (.firebasestorage.app)
        if (url.includes(WRONG_DOMAIN)) {
            hasChanges = true;
            return url.replace(WRONG_DOMAIN, CORRECT_DOMAIN);
        }
        return url;
    };

    const newScript = script.map(cut => {
        const newCut = { ...cut };

        // Fix all potential URL fields
        newCut.videoUrl = fixUrl(cut.videoUrl);
        newCut.audioUrl = fixUrl(cut.audioUrl);
        newCut.sfxUrl = fixUrl(cut.sfxUrl);
        newCut.finalImageUrl = fixUrl(cut.finalImageUrl);
        newCut.draftImageUrl = fixUrl(cut.draftImageUrl);

        return newCut;
    });

    return hasChanges ? newScript : null;
};
