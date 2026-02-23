import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { AspectRatio } from '../store/types';
import { resolveUrl, isIdbUrl } from './imageStorage';

let ffmpegInstance: FFmpeg | null = null;

export interface ExportOptions {
    width: number;
    height: number;
    quality: 'high' | 'medium' | 'low';
    aspectRatio: AspectRatio;
    showSubtitles?: boolean;
    bgmTracks?: any[];
    cutStartTimeMap?: number[];
    attachThumbnail?: boolean;
    thumbnailData?: Uint8Array;
}

/**
 * Load FFmpeg.wasm
 */
export async function loadFFmpeg(
    onProgress?: (progress: number, status: string) => void,
    forceReload: boolean = false
): Promise<FFmpeg> {
    if (ffmpegInstance && !forceReload) return ffmpegInstance;

    onProgress?.(0, 'Initializing FFmpeg engine...');

    if (forceReload && ffmpegInstance) {
        try {
            await ffmpegInstance.terminate();
        } catch (e) {
            console.warn("Failed to terminate existing ffmpeg instance", e);
        }
        ffmpegInstance = null;
    }

    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
        // Filter out too verbose logs if needed
        if (message.includes('frame=') || message.includes('speed=')) {
            // progress logs
        } else {
            console.log('[FFmpeg Log]', message);
        }
    });

    // Load FFmpeg core from CDN
    // Use a specific version for stability
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    // Check SharedArrayBuffer support
    if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error('SharedArrayBuffer is not available. Please ensure COOP/COEP headers are set.');
    }

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
    } catch (e) {
        console.error("FFmpeg load failed:", e);
        throw new Error('Failed to load FFmpeg engine. Please check your internet connection or browser compatibility.');
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
}

/**
 * Load Noto Sans KR font
 */
async function loadSubtitleFont(ffmpeg: FFmpeg) {
    try {
        // Use a lightweight Korean font
        // Using a CDN that allows CORS. Noto Sans KR is heavy, but necessary.
        const fontData = await fetchFile('https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/KR/NotoSansCJKkr-VF.ttf');
        await ffmpeg.writeFile('/tmp/font.ttf', fontData);
        return '/tmp/font.ttf';
    } catch (e) {
        console.warn("Failed to load custom font, subtitles might look generic.", e);
        return null;
    }
}

/**
 * Helper to wrap text
 */
function wrapTextDynamic(text: string, maxCharsPerLine: number) {
    const words = text.split(' ');
    const lines: { text: string, width: number }[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        if (currentLine.length + 1 + words[i].length <= maxCharsPerLine) {
            currentLine += ' ' + words[i];
        } else {
            lines.push({ text: currentLine, width: currentLine.length * 10 }); // Approx width
            currentLine = words[i];
        }
    }
    lines.push({ text: currentLine, width: currentLine.length * 10 });
    return lines;
}

/**
 * Main Export Function
 */
export async function exportWithFFmpeg(
    cuts: any[],
    options: ExportOptions,
    onProgress?: (progress: number, status: string) => void,
    signal?: AbortSignal
): Promise<{ blob: Blob, format: string, duration: number }> {
    let ffmpeg = await loadFFmpeg(onProgress);
    const { width, height, quality, aspectRatio } = options;

    // Quality settings (CRF)
    const crf = quality === 'high' ? 18 : quality === 'medium' ? 23 : 28;

    const concatList: string[] = [];
    const tempFiles: string[] = [];

    let isFFmpegLoaded = true;

    // Load Font (once)
    onProgress?.(5, 'Loading fonts...');
    const fontFile = await loadSubtitleFont(ffmpeg);

    // Process each cut
    for (let i = 0; i < cuts.length; i++) {
        if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
        }

        const cut = cuts[i];
        const progressPerCut = 80 / cuts.length;
        const currentProgress = 10 + (i * progressPerCut);

        onProgress?.(currentProgress, `Processing cut ${i + 1}/${cuts.length}...`);

        const padNum = String(i).padStart(3, '0');
        const segmentName = `segment_${padNum}.mp4`;

        let hasVideo = !!cut.videoUrl;
        let hasAudio = !!cut.audioUrl;
        let hasSfx = !!cut.sfxUrl;

        try {
            // Write input files with size validation
            const imgData = await fetchFile(cut.imageUrl);
            await ffmpeg.writeFile(`img_${padNum}.jpg`, imgData);
            tempFiles.push(`img_${padNum}.jpg`);
            console.log(`[FFmpeg] Cut ${i}: img=${imgData.length}B`);

            if (hasVideo) {
                const vidData = await fetchFile(cut.videoUrl!);
                console.log(`[FFmpeg] Cut ${i}: video=${vidData.length}B, url=${cut.videoUrl?.substring(0, 60)}`);
                if (vidData.length < 1000) {
                    console.warn(`[FFmpeg] Cut ${i}: Video file suspiciously small (${vidData.length}B)! May cause black screen.`);
                }

                // [FIX] Auto-detect video format via magic bytes to prevent demuxer mismatch
                // WebM files written as .mp4 will cause FFmpeg to fail silently → black screen
                let videoExt = 'mp4';
                if (vidData.length >= 4) {
                    const header = new Uint8Array(vidData instanceof ArrayBuffer ? vidData : (vidData as any).buffer || vidData);
                    if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) {
                        videoExt = 'webm';
                        console.log(`[FFmpeg] Cut ${i}: Detected WebM format via magic bytes`);
                    } else {
                        // Check for MP4 (ftyp box at offset 4)
                        const ftyp = String.fromCharCode(header[4] || 0, header[5] || 0, header[6] || 0, header[7] || 0);
                        if (ftyp === 'ftyp') {
                            videoExt = 'mp4';
                        } else {
                            console.warn(`[FFmpeg] Cut ${i}: Unknown video format, magic bytes: [${header[0]?.toString(16)}, ${header[1]?.toString(16)}, ${header[2]?.toString(16)}, ${header[3]?.toString(16)}]`);
                        }
                    }
                }

                const videoFileName = `video_${padNum}.${videoExt}`;
                await ffmpeg.writeFile(videoFileName, vidData);
                tempFiles.push(videoFileName);
                // Store the detected filename for later use in encoding
                (cut as any)._videoFileName = videoFileName;
            }

            if (hasAudio) {
                const audData = await fetchFile(cut.audioUrl!);
                console.log(`[FFmpeg] Cut ${i}: audio=${audData.length}B`);
                // [FIX] 0-byte audio file crashes FFmpeg entirely (Aborted()).
                // Override hasAudio to false so anullsrc is used instead.
                if (audData.length < 100) {
                    console.warn(`[FFmpeg] Cut ${i}: ⚠️ Audio file is empty/corrupt (${audData.length}B). Using silence instead.`);
                    hasAudio = false;
                } else {
                    await ffmpeg.writeFile(`audio_${padNum}.mp3`, audData);
                    tempFiles.push(`audio_${padNum}.mp3`);
                }
            }
            if (hasSfx) {
                const sfxData = await fetchFile(cut.sfxUrl!);
                if (sfxData.length < 100) {
                    console.warn(`[FFmpeg] Cut ${i}: ⚠️ SFX file is empty/corrupt (${sfxData.length}B). Using silence instead.`);
                    hasSfx = false;
                } else {
                    await ffmpeg.writeFile(`sfx_${padNum}.mp3`, sfxData);
                    tempFiles.push(`sfx_${padNum}.mp3`);
                }
            }

            // Execute Encoding with Smart Rescue
            const runEncoding = async (attempt: number = 0): Promise<void> => {
                const isVideo = hasVideo && attempt < 3;  // Keep video mode for attempts 0, 1, 2
                const useTranscode = attempt >= 1 && attempt < 3;  // Transcode on attempts 1 and 2

                // Final fallback: Black Screen (Attempt 3)
                if (attempt >= 3) {
                    console.warn(`[FFmpeg] Cut ${i}: Fatal error, using BLACK SCREEN fallback.`);
                    await ffmpeg.exec([
                        '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=30`,
                        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                        '-c:v', 'libx264', '-t', String(Math.max(0.1, cut.duration)),
                        '-c:a', 'aac', '-t', String(Math.max(0.1, cut.duration)),
                        '-pix_fmt', 'yuv420p', '-y', segmentName
                    ]);
                    return;
                }

                try {
                    let currentInputs: string[] = [];
                    let currentFilters = '';
                    // [FIX] Use the format-detected filename instead of hardcoded .mp4
                    let vidInputFile = (cut as any)._videoFileName || `video_${padNum}.mp4`;

                    // Video Input Setup
                    if (isVideo) {
                        if (useTranscode) {
                            console.log(`[FFmpeg] Cut ${i}: Retrying with Safe Video-Only Transcode (Attempt ${attempt})...`);
                            const cleanVid = `clean_${padNum}.mp4`;
                            // [FIX] All inputs MUST be declared before any output options.
                            // Since WebM audio/duration info is often corrupt, we transcode 
                            // video ONLY (-an) to guarantee a clean stream, avoiding -shortest 
                            // mapping bugs that cause infinite hangs and Black Screens.
                            await ffmpeg.exec([
                                // --- INPUTS ---
                                '-i', vidInputFile,
                                // --- OUTPUT options ---
                                '-c:v', 'libx264', '-preset', 'ultrafast',
                                '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
                                '-r', '30',
                                '-an', // Strip audio to prevent demux/duration errors from corrupt webm
                                '-y', cleanVid
                            ]);
                            vidInputFile = cleanVid;
                            tempFiles.push(cleanVid);
                        }

                        // [HEALING] Robust Seek & Loop: Put -ss before -i for accuracy in short clips
                        const trimStart = (cut as any).videoTrim?.start || 0;
                        if (trimStart > 0) {
                            currentInputs.push('-ss', String(trimStart));
                        }
                        currentInputs.push('-stream_loop', '-1', '-i', vidInputFile);
                    } else {
                        // Image Mode
                        currentInputs.push('-loop', '1', '-i', `img_${padNum}.jpg`);
                    }

                    // Audio Inputs
                    // Input 1: TTS/Audio
                    if (hasAudio) currentInputs.push('-i', `audio_${padNum}.mp3`);
                    else currentInputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

                    // Input 2: SFX
                    if (hasSfx) currentInputs.push('-i', `sfx_${padNum}.mp3`);
                    else currentInputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

                    // Filter Construction
                    currentFilters += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30[vscaled];`;

                    // Subtitles
                    let lastVid = 'vscaled';
                    const shouldAddSubtitles = options.showSubtitles !== false;
                    if (cut.dialogue && fontFile && shouldAddSubtitles) {
                        const isVertical = aspectRatio === '9:16';
                        const fontSize = isVertical ? 34 : 48;
                        const lineHeight = isVertical ? 46 : 65;
                        const maxChars = isVertical ? 25 : 48;
                        const lines = wrapTextDynamic(cut.dialogue, maxChars);
                        if (lines.length > 0) {
                            const totalHeight = lines.length * lineHeight;
                            const bottomMargin = isVertical ? 240 : 140;
                            const startY = height - bottomMargin - totalHeight;
                            const maxW = Math.max(...lines.map(l => l.width));
                            const boxW = Math.min(width * 0.9, maxW + 120);
                            const boxH = totalHeight + 50;
                            const boxX = (width - boxW) / 2;
                            const boxY = startY - 25;
                            currentFilters += `[${lastVid}]drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.6:t=fill[vbox];`;
                            lastVid = 'vbox';
                            for (let l = 0; l < lines.length; l++) {
                                const subFile = `sub_${padNum}_${l}.txt`;
                                await ffmpeg.writeFile(subFile, lines[l].text);
                                tempFiles.push(subFile);
                                const lineY = Math.round(startY + (l * lineHeight));
                                currentFilters += `[${lastVid}]drawtext=fontfile=${fontFile}:textfile=${subFile}:expansion=none:fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${lineY}[vsub_${l}];`;
                                lastVid = `vsub_${l}`;
                            }
                        }
                    }
                    currentFilters += `[${lastVid}]null[vout];`;

                    // Audio Mixing with Resilience
                    const sfxVol = cut.sfxVolume ?? 0.3;
                    const shouldUseVideoAudio = cut.useVideoAudio && isVideo && hasVideo && !useTranscode;

                    if (shouldUseVideoAudio) {
                        // Use a complex map that falls back to silence if 0:a is missing
                        // In Attempt 0, we try to use 0:a. If it fails due to missing track, Attempt 1 (Transcode) will provide a reliable track.
                        currentFilters += `[0:a]volume=1.0[a_base];[2:a]volume=${sfxVol}[a_sfx];[a_base][a_sfx]amix=inputs=2:duration=first[aout]`;
                    } else {
                        currentFilters += `[1:a]volume=1.0[a_base];[2:a]volume=${sfxVol}[a_sfx];[a_base][a_sfx]amix=inputs=2:duration=first[aout]`;
                    }

                    // EXEC
                    await ffmpeg.exec([
                        ...currentInputs,
                        '-filter_complex', currentFilters,
                        '-map', '[vout]',
                        '-map', '[aout]',
                        '-c:v', 'libx264',
                        '-preset', attempt === 0 ? 'superfast' : 'ultrafast',
                        '-crf', String(crf + (attempt * 2)),
                        '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', String(Math.max(0.1, cut.duration)),
                        '-y', segmentName
                    ]);

                    // [CRITICAL FIX] Verify file existence immediately inside recursion
                    try {
                        const checkFile = await ffmpeg.readFile(segmentName);
                        if (!checkFile || checkFile.length === 0) {
                            throw new Error("Encoded file is empty");
                        }
                    } catch (verifyErr) {
                        throw new Error("Output file missing or empty after exec");
                    }

                } catch (err: any) {
                    console.error(`[FFmpeg] Cut ${i} attempt ${attempt} failed:`, err);

                    if (err.message?.includes('Aborted')) {
                        throw err; // Stop completely on abort
                    }

                    if (err.message?.includes('OOM') || !isFFmpegLoaded) {
                        console.warn('[FFmpeg] Reloading engine...');
                        try { ffmpeg = await loadFFmpeg(onProgress, true); } catch (e) { }
                    }
                    // Trigger next attempt
                    await runEncoding(attempt + 1);
                }
            };

            await runEncoding(0);

            // Double Check (Should pass if runEncoding succeeded)
            try {
                const segmentFileInfo = await ffmpeg.readFile(segmentName);
                if (segmentFileInfo && segmentFileInfo.length > 0) {
                    console.log(`[FFmpeg:Export] Successfully encoded ${segmentName} (${segmentFileInfo.length} bytes)`);
                    concatList.push(`file '${segmentName}'`);
                } else {
                    console.error(`[FFmpeg:Export] Segment ${segmentName} is empty!`);
                }
            } catch (readErr) {
                console.error(`[FFmpeg:Export] Segment ${segmentName} file NOT FOUND after exec!`, readErr);
            }

            // Cleanup
            for (const file of tempFiles) {
                try { await ffmpeg.deleteFile(file); } catch { }
            }
            tempFiles.length = 0;

        } catch (e) {
            console.error(`[FFmpeg] Failed to encode cut ${i}:`, e);
            // If runEncoding threw a real error (Abort), stop loop.
            if ((e as any).message === 'Export cancelled' || (e as any).name === 'AbortError') {
                throw e;
            }

            // [FIX] Guarantee segment exists to prevent cut from being skipped entirely.
            // Generate a black screen fallback so the timeline stays in sync.
            try {
                console.warn(`[FFmpeg] Cut ${i}: All attempts failed. Generating emergency black screen segment.`);
                await ffmpeg.exec([
                    '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=30`,
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                    '-c:v', 'libx264', '-t', String(Math.max(0.1, cut.duration)),
                    '-c:a', 'aac', '-t', String(Math.max(0.1, cut.duration)),
                    '-pix_fmt', 'yuv420p', '-y', segmentName
                ]);
                const emergencyCheck = await ffmpeg.readFile(segmentName);
                if (emergencyCheck && emergencyCheck.length > 0) {
                    concatList.push(`file '${segmentName}'`);
                    console.log(`[FFmpeg] Cut ${i}: Emergency segment created (${emergencyCheck.length}B)`);
                }
            } catch (emergencyErr) {
                console.error(`[FFmpeg] Cut ${i}: Even emergency fallback failed!`, emergencyErr);
            }
        }
    }

    // CHECK ABORT before merge
    if (signal?.aborted) {
        throw new DOMException('Export cancelled by user', 'AbortError');
    }

    if (concatList.length === 0) {
        throw new Error("No segments were successfully encoded.");
    }

    // ... Merge logic ...
    console.log(`[FFmpeg:Export] Merging ${concatList.length} segments...`);
    console.log(`[FFmpeg:Export] ConcatList:`, concatList);
    onProgress?.(90, 'Merging all segments into final MP4...');
    await ffmpeg.writeFile('concat.txt', concatList.join('\n'));

    try {
        // [FIX] Always re-encode during concat to normalize timestamps and codec params.
        // Previous `-c copy` approach caused black frames when segments had different
        // timebase (e.g., 12288 tbn vs 15360 tbn) or slightly different codec settings.
        // Re-encode is slower but guarantees consistent output.
        console.log(`[FFmpeg:Export] Using re-encode merge for timestamp normalization...`);
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c:v', 'libx264',
            '-crf', String(crf),
            '-preset', 'superfast',
            '-pix_fmt', 'yuv420p',
            '-r', '30',
            '-g', '60',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ar', '44100',
            '-ac', '2',
            '-movflags', '+faststart',
            '-y',
            'output.mp4'
        ]);
    } catch (e) {
        console.error("[FFmpeg] Re-encode merge failed:", e);
        // Fallback: try stream copy as last resort
        console.warn("[FFmpeg] Attempting stream copy merge as fallback...");
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            '-movflags', '+faststart',
            '-y',
            'output.mp4'
        ]);
    }

    // 4. BGM Mixing Pass
    const bgmTracks = options.bgmTracks || [];
    const cutStartTimeMap = options.cutStartTimeMap || [];

    if (bgmTracks.length > 0 && cutStartTimeMap.length > 0) {
        onProgress?.(95, 'Mixing background music...');

        try {
            // Rename Manual (read -> write -> delete)
            const videoData = await ffmpeg.readFile('output.mp4');
            await ffmpeg.writeFile('output_temp.mp4', videoData);

            const bgmInputs: string[] = ['-i', 'output_temp.mp4'];
            let mixFilter = '';
            const mixLabels: string[] = ['[0:a]'];

            for (let b = 0; b < bgmTracks.length; b++) {
                const track = bgmTracks[b];
                const trackName = `bgm_${b}.mp3`;
                try {
                    let finalBgmUrl = track.url;
                    if (isIdbUrl(track.url)) {
                        const resolvedBgm = await resolveUrl(track.url, { asBlob: true });
                        if (resolvedBgm) finalBgmUrl = resolvedBgm;
                    }

                    const bgmData = await fetchFile(finalBgmUrl);
                    await ffmpeg.writeFile(trackName, bgmData);

                    bgmInputs.push('-i', trackName);
                    const inputIdx = b + 1;

                    const startIndex = cuts.findIndex((c: any) => String(c.id) === String(track.startCutId));
                    if (startIndex === -1) {
                        console.warn(`[FFmpeg:BGM] Start Cut ID not found: ${track.startCutId}. Available IDs:`, cuts.map((c: any) => c.id));
                    }
                    const startTime = startIndex !== -1 ? cutStartTimeMap[startIndex] : 0;
                    const delayMs = Math.round(startTime * 1000);

                    const label = `bgm_ready_${b}`;
                    mixFilter += `[${inputIdx}:a]volume=${track.volume || 0.5},adelay=${delayMs}|${delayMs}[${label}];`;
                    mixLabels.push(`[${label}]`);

                    tempFiles.push(trackName);
                } catch (bgmErr) {
                    console.warn(`[FFmpeg:BGM] Failed to load BGM track ${b}:`, bgmErr);
                }
            }

            if (mixLabels.length > 1) {
                // Determine duration based on inputs to prevent cutting short 
                // duration=first: Since input 0 is the video, this keeps video length.
                // dropout_transition=2: Smooth transition
                mixFilter += `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2[final_a]`;

                await ffmpeg.exec([
                    ...bgmInputs,
                    '-filter_complex', mixFilter,
                    '-map', '0:v',
                    '-map', '[final_a]',
                    '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '192k',
                    '-y', 'output.mp4'
                ]);
                try { await ffmpeg.deleteFile('output_temp.mp4'); } catch { }
            }

        } catch (mixErr) {
            console.error('[FFmpeg:BGM] BGM Mixing failed:', mixErr);
            try { await ffmpeg.deleteFile('output_temp.mp4'); } catch { }
        }
    }

    // 5. Attach Thumbnail (Cover Art)
    if (options.attachThumbnail && options.thumbnailData) {
        onProgress?.(97, 'Attaching thumbnail as cover art...');
        try {
            console.log('[FFmpeg:Thumbnail] Writing cover art to FS...');
            await ffmpeg.writeFile('cover.jpg', options.thumbnailData);

            // Rename current output to temp
            await ffmpeg.exec(['-mv', 'output.mp4', 'output_pre_cover.mp4']);

            // Merge cover
            // -c:v:1 mjpeg: Encode cover as MJPEG (standard for ID3 tags)
            // -disposition:v:1 attached_pic: Mark as attached picture
            // -id3v2_version 3: Max compatibility for Windows
            await ffmpeg.exec([
                '-i', 'output_pre_cover.mp4',
                '-i', 'cover.jpg',
                '-map', '0',
                '-map', '1',
                '-c', 'copy',
                '-c:v:1', 'mjpeg',
                '-disposition:v:1', 'attached_pic',
                '-metadata:s:v:1', 'title="Cover (Front)"',
                '-metadata:s:v:1', 'comment="Cover (Front)"',
                '-y', 'output.mp4'
            ]);

            // Clean up
            tempFiles.push('cover.jpg');
            try { await ffmpeg.deleteFile('output_pre_cover.mp4'); } catch { }
        } catch (thumbErr) {
            console.warn('[FFmpeg:Thumbnail] Failed to attach thumbnail:', thumbErr);
            // Attempt restore
            try {
                const dir = await ffmpeg.listDir('.');
                if (!dir.find(d => d.name === 'output.mp4') && dir.find(d => d.name === 'output_pre_cover.mp4')) {
                    await ffmpeg.exec(['-mv', 'output_pre_cover.mp4', 'output.mp4']);
                }
            } catch { }
        }
    }

    // 6. Final Output (Validated)
    onProgress?.(98, 'Reading final project file...');

    // Validate Output Check before reading
    try {
        const dir = await ffmpeg.listDir('.');
        const outFile = dir.find(d => d.name === 'output.mp4');
        if (!outFile) {
            // Last ditch effort check
        }
    } catch (e) { /* ignore listDir error */ }

    let data: any;
    try {
        data = await ffmpeg.readFile('output.mp4');
    } catch (e) {
        throw new Error('최종 비디오 파일(output.mp4)을 읽을 수 없습니다. 인코딩 또는 병합에 실패했습니다.');
    }

    if (!data || data.length < 1000) {
        throw new Error(`생성된 비디오 파일이 유효하지 않습니다 (${data ? data.length : 0} bytes).`);
    }

    // Blob Casting
    const blob = new Blob([(data as any).buffer || data], { type: 'video/mp4' });

    // Global Cleanup
    try {
        if (fontFile) await ffmpeg.deleteFile(fontFile);
        for (const f of tempFiles) await ffmpeg.deleteFile(f);
        await ffmpeg.deleteFile('concat.txt');
        await ffmpeg.deleteFile('output.mp4');
    } catch (e) { /* ignore */ }

    onProgress?.(100, 'Complete!');

    return {
        blob,
        format: 'mp4',
        duration: cuts.reduce((sum, c) => sum + c.duration, 0)
    };
}

export function isFFmpegSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined';
}

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
