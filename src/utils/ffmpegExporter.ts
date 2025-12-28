/**
 * FFmpeg.wasm Video Exporter
 * Uses FFmpeg compiled to WebAssembly for high-quality MP4 export
 */

import type { RecordingCut } from './canvasVideoRecorder';

let ffmpegInstance: any = null;
let isFFmpegLoaded = false;

/**
 * Lazy load FFmpeg.wasm
 */
async function loadFFmpeg(
    onProgress?: (progress: number, status: string) => void
): Promise<any> {
    if (ffmpegInstance && isFFmpegLoaded) {
        return ffmpegInstance;
    }

    onProgress?.(0, 'Loading FFmpeg engine...');

    try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { toBlobURL } = await import('@ffmpeg/util');

        ffmpegInstance = new FFmpeg();

        // Restore logging for debugging
        ffmpegInstance.on('log', ({ message }: { message: string }) => {
            console.log('[FFmpeg]', message);
        });

        // Load FFmpeg core from CDN
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpegInstance.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        isFFmpegLoaded = true;
        onProgress?.(15, 'FFmpeg ready!');

        return ffmpegInstance;
    } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        throw new Error('Failed to load FFmpeg. Make sure SharedArrayBuffer is enabled.');
    }
}

/**
 * Download a font for subtitles (Korean support)
 */
async function loadSubtitleFont(ffmpeg: any, onProgress?: (progress: number, status: string) => void) {
    try {
        onProgress?.(10, 'Loading Korean font for subtitles...');
        // Stable Noto Sans KR from jsDelivr (avoid raw.githubusercontent 404/throttling)
        const fontURL = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf';
        const response = await fetch(fontURL);
        if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
        const fontData = await response.arrayBuffer();
        await ffmpeg.writeFile('font.otf', new Uint8Array(fontData));
        console.log('[FFmpeg] Korean font loaded successfully as font.otf');
        return 'font.otf';
    } catch (e) {
        console.warn('[FFmpeg] Failed to load Korean font:', e);
        return null;
    }
}



/**
 * Estimate pixel width of a string for Noto Sans KR Bold at 48px
 */
function estimatePixelWidth(text: string, fontSize: number = 48): number {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        // Rough estimation: CJK characters are usually full-width
        if (charCode > 255) {
            width += fontSize; // 48px
        } else if (charCode === 32) {
            width += fontSize * 0.3; // Space ~14px
        } else {
            width += fontSize * 0.55; // Latin ~26px
        }
    }
    return width;
}

/**
 * Wrap text and return lines with their estimated widths
 */
function wrapTextDynamic(text: string, maxCharsPerLine: number = 48): { text: string; width: number }[] {
    if (!text) return [];

    const lines: { text: string; width: number }[] = [];
    const paragraphs = text.split('\n');

    paragraphs.forEach(para => {
        const words = para.trim().split(/\s+/);
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine.length + word.length + 1) > maxCharsPerLine) {
                if (currentLine) {
                    lines.push({ text: currentLine, width: estimatePixelWidth(currentLine) });
                    currentLine = word;
                } else {
                    lines.push({ text: word, width: estimatePixelWidth(word) });
                    currentLine = '';
                }
            } else {
                currentLine = currentLine ? `${currentLine} ${word}` : word;
            }
        });

        if (currentLine) {
            lines.push({ text: currentLine, width: estimatePixelWidth(currentLine) });
        }
    });

    return lines;
}

export interface FFmpegExportOptions {
    width?: number;
    height?: number;
    fps?: number;
    quality?: 'low' | 'medium' | 'high';
}

export interface FFmpegExportResult {
    blob: Blob;
    format: 'mp4';
    duration: number;
}

/**
 * Export video using FFmpeg.wasm (High Quality MP4)
 */
export async function exportWithFFmpeg(
    cuts: RecordingCut[],
    options: FFmpegExportOptions = {},
    onProgress?: (progress: number, status: string) => void
): Promise<FFmpegExportResult> {
    const {
        width = 1920,
        height = 1080,
        quality = 'high'
    } = options;

    const ffmpeg = await loadFFmpeg(onProgress);
    const { fetchFile } = await import('@ffmpeg/util');

    // 1. Prepare Font
    const fontFile = await loadSubtitleFont(ffmpeg, onProgress);

    onProgress?.(15, 'Preparing assets and encoding cuts...');

    const concatList: string[] = [];
    const crf = quality === 'high' ? 18 : quality === 'medium' ? 23 : 28;

    // Track temporary files for cleanup
    const tempFiles: string[] = [];

    for (let i = 0; i < cuts.length; i++) {
        const cut = cuts[i];
        const padNum = String(i).padStart(4, '0');
        const segmentName = `segment_${padNum}.mp4`;

        // Update progress
        const baseProgress = 15 + (i / cuts.length) * 75;
        // const progressSpan = (1 / cuts.length) * 75;
        onProgress?.(baseProgress, `Encoding Cut ${i + 1}/${cuts.length}...`);

        try {
            // Write input files
            const imgData = await fetchFile(cut.imageUrl);
            await ffmpeg.writeFile(`img_${padNum}.jpg`, imgData);
            tempFiles.push(`img_${padNum}.jpg`);

            let hasVideo = false;
            if (cut.videoUrl) {
                try {
                    const videoData = await fetchFile(cut.videoUrl);
                    await ffmpeg.writeFile(`video_${padNum}.mp4`, videoData);
                    hasVideo = true;
                    tempFiles.push(`video_${padNum}.mp4`);
                } catch { /* ignore */ }
            }

            let hasAudio = false;
            if (cut.audioUrl) {
                try {
                    const audioData = await fetchFile(cut.audioUrl);
                    await ffmpeg.writeFile(`audio_${padNum}.mp3`, audioData);
                    hasAudio = true;
                    tempFiles.push(`audio_${padNum}.mp3`);
                } catch { /* ignore */ }
            }

            let hasSfx = false;
            if (cut.sfxUrl) {
                try {
                    const sfxData = await fetchFile(cut.sfxUrl);
                    await ffmpeg.writeFile(`sfx_${padNum}.mp3`, sfxData);
                    hasSfx = true;
                    tempFiles.push(`sfx_${padNum}.mp3`);
                } catch { /* ignore */ }
            }

            // Setup inputs and filters
            const inputs: string[] = [];
            let filterChain = '';

            // Input 0: Video or Image
            if (hasVideo) {
                inputs.push('-stream_loop', '-1', '-i', `video_${padNum}.mp4`);
            } else {
                inputs.push('-loop', '1', '-i', `img_${padNum}.jpg`);
            }

            // Input 1 & 2: Audio & SFX
            if (hasAudio) inputs.push('-i', `audio_${padNum}.mp3`);
            else inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

            if (hasSfx) inputs.push('-i', `sfx_${padNum}.mp3`);
            else inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

            // Build Filter Complex
            // 1. Video scaling and padding (Unified)
            filterChain += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30[vscaled];`;

            // 2. Add Subtitles
            let lastVideoOutput = 'vscaled';
            if (cut.dialogue && fontFile) {
                const lines = wrapTextDynamic(cut.dialogue, 48);
                const lineHeight = 65;
                const bottomMargin = 140;
                const totalHeight = lines.length * lineHeight;
                const startY = height - bottomMargin - totalHeight;

                if (lines.length > 0) {
                    // Calculate dynamic box width based on the longest line
                    const maxLineWidth = Math.max(...lines.map(l => l.width));
                    const boxPaddingH = 60; // Horizontal padding
                    const boxPaddingV = 25; // Vertical padding
                    const boxWidth = Math.min(width * 0.9, maxLineWidth + (boxPaddingH * 2));
                    const boxHeight = totalHeight + (boxPaddingV * 2);
                    const boxX = (width - boxWidth) / 2;
                    const boxY = startY - boxPaddingV;

                    const boxOutput = 'vbox';
                    filterChain += `[${lastVideoOutput}]drawbox=x=${boxX}:y=${boxY}:w=${boxWidth}:h=${boxHeight}:color=black@0.6:t=fill[${boxOutput}];`;
                    lastVideoOutput = boxOutput;

                    // Use for...of to handle awaits cleanly if needed, though map/Promise.all is faster. 
                    // Since ffmpeg.writeFile is async, we need to be careful inside filter generation.
                    // We'll prepare files first.
                    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                        const lineObj = lines[lineIdx];
                        const nextOutput = `vsub_${lineIdx}`;
                        const lineY = Math.round(startY + (lineIdx * lineHeight));

                        // v10.0: Robust Text Handling using textfile
                        // Prevents any escaping issues with special chars like %, ', :, etc.
                        const subFileName = `sub_${padNum}_${lineIdx}.txt`;
                        await ffmpeg.writeFile(subFileName, lineObj.text);
                        tempFiles.push(subFileName);

                        // Note: reload=1 is technically not needed for static file but good practice if reusing names
                        // expansion=none is CRITICAL here to prevent % from being interpreted
                        filterChain += `[${lastVideoOutput}]drawtext=fontfile=${fontFile}:textfile=${subFileName}:expansion=none:fontcolor=white:fontsize=48:x=(w-text_w)/2:y=${lineY}[${nextOutput}];`;
                        lastVideoOutput = nextOutput;
                    }
                }
            }
            filterChain += `[${lastVideoOutput}]null[vout];`;

            // 3. Audio Mixing
            const sfxVol = cut.sfxVolume ?? 0.3;
            filterChain += `[1:a]volume=1.0[a_base];[2:a]volume=${sfxVol}[a_sfx];[a_base][a_sfx]amix=inputs=2:duration=first[aout]`;

            // Execute Encoding
            await ffmpeg.exec([
                ...inputs,
                '-filter_complex', filterChain,
                '-map', '[vout]',
                '-map', '[aout]',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', String(crf),
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ar', '44100',
                '-ac', '2',
                '-t', String(Math.max(0.1, cut.duration)),
                '-y',
                segmentName
            ]);

            concatList.push(`file '${segmentName}'`);

            // Clean up files for this cut immediately to save memory (except segment)
            for (const file of tempFiles) {
                try { await ffmpeg.deleteFile(file); } catch { }
            }
            tempFiles.length = 0; // Clear list

        } catch (e) {
            console.error(`[FFmpeg] Failed to encode cut ${i}:`, e);
        }
    }

    if (concatList.length === 0) {
        throw new Error("No segments were successfully encoded.");
    }

    // 2. Merge Segments
    onProgress?.(90, 'Merging all segments into final MP4...');
    await ffmpeg.writeFile('concat.txt', concatList.join('\n'));

    try {
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            '-movflags', '+faststart',
            '-y',
            'output.mp4'
        ]);
    } catch (e) {
        console.warn("[FFmpeg] Fast merge failed, attempting re-encode merge...", e);
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c:v', 'libx264',
            '-crf', String(crf),
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y',
            'output.mp4'
        ]);
    }

    // 3. Final Output
    onProgress?.(98, 'Reading final project file...');
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    // Global Cleanup
    try {
        for (const line of concatList) {
            const fileName = line.match(/'([^']+)'/)?.[1];
            if (fileName) await ffmpeg.deleteFile(fileName);
        }
        await ffmpeg.deleteFile('concat.txt');
        await ffmpeg.deleteFile('output.mp4');
        if (fontFile) await ffmpeg.deleteFile(fontFile);
    } catch (e) { /* ignore */ }

    onProgress?.(100, 'Complete!');

    return {
        blob,
        format: 'mp4',
        duration: cuts.reduce((sum, c) => sum + c.duration, 0)
    };
}

/**
 * Check if FFmpeg.wasm is supported
 */
export function isFFmpegSupported(): boolean {
    try {
        return typeof SharedArrayBuffer !== 'undefined';
    } catch {
        return false;
    }
}

/**
 * Pre-load FFmpeg for faster export later
 */
export async function preloadFFmpeg(
    onProgress?: (progress: number, status: string) => void
): Promise<boolean> {
    try {
        await loadFFmpeg(onProgress);
        return true;
    } catch {
        return false;
    }
}
