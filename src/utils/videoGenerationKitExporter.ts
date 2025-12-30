
import JSZip from 'jszip';
import type { ScriptCut } from '../services/gemini';
import { resolveUrl, isIdbUrl } from './imageStorage';

// Helper to get extension from mimetype
const getExtension = (mimeType: string): string => {
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    if (mimeType.includes('webp')) return 'webp';
    return 'png'; // Default
};

// Re-using/Adapting fetchResource logic
const fetchResource = async (url: string | null | undefined): Promise<{ payload: Blob | string, mimeType: string, isBase64: boolean } | null> => {
    if (!url) return null;
    try {
        if (isIdbUrl(url)) {
            const resolved = await resolveUrl(url);
            if (!resolved) return null;
            return await fetchResource(resolved);
        }

        if (url.startsWith('data:')) {
            if (!url.includes(',')) return null;
            const split = url.split(',');
            const typeInfo = split[0].split(':')[1];
            const mimeType = typeInfo.split(';')[0];
            const base64Data = split[1];
            return { payload: base64Data, mimeType, isBase64: true };
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
        const blob = await res.blob();
        return { payload: blob, mimeType: blob.type, isBase64: false };

    } catch (e) {
        console.error("Failed to fetch resource:", url, e);
        return null;
    }
};

// Rule-based prompt enhancer
const enhancePrompt = (originalPrompt: string, dialogue: string): string => {
    const base = originalPrompt || "A scene";
    const technicalTerms = "cinematic, 4k, highly detailed, photorealistic, depth of field, slow motion, smooth movement";

    let enhanced = `${base}, ${technicalTerms}`;

    // Add dialogue-based context
    if (dialogue && dialogue.trim().length > 0) {
        enhanced += ", character speaking, subtle facial movements, lip sync";
    }

    return enhanced;
};

interface VideoKitCut {
    id: number;
    filename: string;
    videoPrompt: string;
    originalVisualPrompt: string;
    dialogue: string;
    duration: number;
    useVideoAudio?: boolean;
}

export const exportVideoGenerationKit = async (
    script: ScriptCut[],
    seriesName: string,
    episodeName: string
): Promise<Blob> => {
    const zip = new JSZip();
    const folderName = `VideoKit_${seriesName}_${episodeName}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const root = zip.folder(folderName);
    if (!root) throw new Error("Failed to create ZIP folder");

    const imagesFolder = root.folder("images");
    const manifest: VideoKitCut[] = [];

    console.log(`[VideoKit] Starting export for ${script.length} cuts...`);

    for (let i = 0; i < script.length; i++) {
        const cut = script[i];

        // Only include cuts that have images
        const imageUrl = cut.finalImageUrl || cut.draftImageUrl;
        if (!imageUrl) continue;

        console.log(`[VideoKit] Processing Cut ${cut.id}...`);

        // 1. Fetch Image
        const res = await fetchResource(imageUrl);
        let imageFilename = "";

        if (res) {
            const ext = getExtension(res.mimeType);
            // Use Index for filename to ensure sequential numbering (matches Bulk Upload logic)
            imageFilename = `cut_${String(i + 1).padStart(3, '0')}.${ext}`;

            // Add to ZIP
            if (imagesFolder) {
                if (res.isBase64) {
                    // Manually decode base64
                    try {
                        const binaryString = atob(res.payload as string);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let k = 0; k < binaryString.length; k++) {
                            bytes[k] = binaryString.charCodeAt(k);
                        }
                        imagesFolder.file(imageFilename, bytes);
                    } catch (e) {
                        imagesFolder.file(imageFilename, res.payload as string, { base64: true });
                    }
                } else {
                    imagesFolder.file(imageFilename, res.payload as Blob);
                }
            }
        }

        // 2. Enhance Prompt
        // Use existing videoPrompt if user edited it, otherwise generate one
        const finalVideoPrompt = cut.videoPrompt || enhancePrompt(cut.visualPrompt, cut.dialogue);

        // 3. Add to Manifest
        manifest.push({
            id: cut.id,
            filename: imageFilename, // Relative path in zip
            videoPrompt: finalVideoPrompt,
            originalVisualPrompt: cut.visualPrompt,
            dialogue: cut.dialogue,
            duration: cut.videoDuration || cut.estimatedDuration || 5,
            useVideoAudio: cut.useVideoAudio
        });
    }

    // 4. Save JSON Manifest
    root.file("video_generation_manifest.json", JSON.stringify(manifest, null, 2));

    // 5. Save CSV Manifest (for easy copy-paste)
    // 5. Save TXT Manifest (User Requested replacement for CSV)
    // Format designed for easy copy-pasting into Image-to-Video tools
    const txtContent = manifest.map(m => {
        return `[Cut ${m.id}]
Filename: ${m.filename}
Duration: ${m.duration}s
Audio Source: ${m.useVideoAudio ? 'VIDEO (Use Original Audio)' : 'TTS (AI Voice)'}
Video Prompt: ${m.videoPrompt}
Dialogue: "${m.dialogue}"
----------------------------------------`;
    }).join("\n\n");
    root.file("prompts.txt", txtContent);

    // 6. Save README
    const readme = `
External Video Generation Kit
-----------------------------
Series: ${seriesName}
Episode: ${episodeName}

How to use:
1. Use the images in the 'images' folder as "Image-to-Video" inputs (First Frame).
2. Copy the "Video Prompt" from 'prompts.txt' for each cut.
   - The prompts are optimized for camera movement and action.
3. Generate your videos using external tools (Runway, Luma, Kling, etc.).
4. Return to Step 4.5 in the application.
5. Use "Bulk Upload" (일괄 업로드) to import your generated videos back into the project.
   - Tip: If you keep the filenames like 'cut_001.mp4', 'cut_002.mp4', the bulk uploader will match them automatically!
`.trim();
    root.file("README.txt", readme);

    return await zip.generateAsync({ type: "blob" });
};
