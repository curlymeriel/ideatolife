/**
 * Prompt Utilities - Clean and prepare prompts for AI image generation
 */

/**
 * Remove markdown formatting from prompts before sending to image generation API
 * This prevents formatting like **bold** from appearing in generated images
 */
export const cleanPromptForGeneration = (prompt: string): string => {
    if (!prompt) return '';

    return prompt
        // Remove bold: **text** or __text__
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // Remove italic: *text* or _text_
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove strikethrough: ~~text~~
        .replace(/~~([^~]+)~~/g, '$1')
        // Remove inline code: `text`
        .replace(/`([^`]+)`/g, '$1')
        // Clean up extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Extract the visual-relevant part of a description, removing metadata markers
 */
export const extractVisualContent = (description: string): string => {
    if (!description) return '';

    // Remove common metadata patterns like [Master Style: ...] or [Character Modifier: ...]
    let cleaned = description
        .replace(/\[Master Visual Style:[^\]]+\]/gi, '')
        .replace(/\[Character Modifier:[^\]]+\]/gi, '')
        .replace(/\[Background Modifier:[^\]]+\]/gi, '')
        .trim();

    // Clean markdown after removing metadata
    return cleanPromptForGeneration(cleaned);
};
