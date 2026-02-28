import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { AspectRatio } from '../store/types';
import { resolveUrl, isIdbUrl } from './imageStorage';

let ffmpegInstance: FFmpeg | null = null;
// Global font cache to persist across engine reloads
let cachedFontData: Uint8Array | null = null;

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
 * 추출 파라미터 옵션
 */
export interface FrameExtractionOptions {
    fps: number;
    width: number;
    height: number;
    maxFrames: number;
    trimStart?: number; // seconds
    trimEnd?: number; // seconds
}

/**
 * 브라우저 네이티브 API (HTMLVideoElement + Canvas)를 사용하여
 * WebM 등 비디오에서 지정된 FPS로 JPEG 프레임 시퀀스를 추출합니다.
 */
export async function extractVideoFrames(videoUrl: string, options: FrameExtractionOptions): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;

        const canvas = document.createElement('canvas');
        canvas.width = options.width;
        canvas.height = options.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error('Canvas 2D context not supported'));
            return;
        }

        const frames: Uint8Array[] = [];
        const frameInterval = 1 / options.fps;
        const trimStart = options.trimStart || 0;

        let targetTime = trimStart;
        let frameCount = 0;

        video.style.position = 'absolute';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);

        let isResolved = false;
        let watchdogTimer: any = null;

        const cleanup = () => {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            if (document.body.contains(video)) {
                document.body.removeChild(video);
            }
            video.src = '';
            video.load();
        };

        const resetWatchdog = () => {
            if (watchdogTimer) clearTimeout(watchdogTimer);
            watchdogTimer = setTimeout(() => {
                safeReject(new Error('Frame extraction timed out (Tab hidden or video frozen?)'));
            }, 10000); // 10 seconds timeout per frame
        };

        const safeResolve = (data: Uint8Array[]) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(data);
            }
        };

        const safeReject = (err: any) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(err);
            }
        };

        video.onerror = () => safeReject(new Error(`Video load error: ${video.error?.code} - ${video.error?.message}`));

        video.onloadedmetadata = () => {
            console.log(`[FFmpeg:Extractor] onloadedmetadata: duration=${video.duration}, size=${video.videoWidth}x${video.videoHeight}`);
        };

        video.onloadeddata = async () => {
            try {
                console.log(`[FFmpeg:Extractor] onloadeddata fired. Seeking to ${targetTime}`);
                resetWatchdog();
                video.currentTime = targetTime;
            } catch (err) {
                safeReject(err);
            }
        };

        video.onseeked = async () => {
            try {
                resetWatchdog();
                // Draw current frame
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Maintain aspect ratio with black bars (object-fit: contain logic)
                const vRatio = canvas.width / video.videoWidth;
                const hRatio = canvas.height / video.videoHeight;
                const ratio = Math.min(vRatio, hRatio);
                const drawW = video.videoWidth * ratio;
                const drawH = video.videoHeight * ratio;
                const drawX = (canvas.width - drawW) / 2;
                const drawY = (canvas.height - drawH) / 2;

                ctx.drawImage(video, drawX, drawY, drawW, drawH);

                // Convert to JPEG Uint8Array
                const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
                if (blob) {
                    const arrayBuffer = await blob.arrayBuffer();
                    frames.push(new Uint8Array(arrayBuffer));
                    frameCount++;
                }

                targetTime += frameInterval;

                // Stop if we hit limits
                const endLimit = options.trimEnd || 999;
                const isEnded = targetTime >= endLimit || frameCount >= options.maxFrames || targetTime > video.duration;

                if (isEnded) {
                    console.log(`[FFmpeg:Extractor] Ended. Extracted ${frameCount} frames.`);
                    safeResolve(frames);
                } else {
                    // Next frame
                    video.currentTime = targetTime;
                }
            } catch (err) {
                safeReject(err);
            }
        };

        // Start process
        resetWatchdog();
        video.src = videoUrl;
        video.load();
    });
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
        onProgress?.(1, 'Downloading FFmpeg core (this may take a moment)...');

        // [FIX] Add timeout to toBlobURL calls - CDN downloads can hang indefinitely
        const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>((_, reject) =>
                    setTimeout(() => reject(new Error(`${label} download timed out after ${timeoutMs / 1000}s. Please check your internet connection.`)), timeoutMs)
                )
            ]);
        };

        const coreURL = await withTimeout(
            toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            30000, 'FFmpeg core JS'
        );
        onProgress?.(2, 'Downloading FFmpeg WASM module...');
        const wasmURL = await withTimeout(
            toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            60000, 'FFmpeg core WASM'  // WASM is larger, give it more time
        );
        onProgress?.(3, 'Initializing FFmpeg...');
        await ffmpeg.load({ coreURL, wasmURL });
    } catch (e) {
        console.error("FFmpeg load failed:", e);
        throw new Error(`FFmpeg 엔진 로딩 실패: ${(e as any)?.message || '인터넷 연결을 확인하세요.'}`);
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
}

/**
 * Load Noto Sans KR font
 */
async function loadSubtitleFont(ffmpeg: FFmpeg) {
    try {
        // Return immediately if font is already in virtual FS
        try {
            const dir = await ffmpeg.listDir('.');
            if (dir.some(f => f.name === 'font.ttf')) {
                console.log("[FFmpeg:Font] font.ttf already exists in FS.");
                return 'font.ttf';
            }
        } catch (e) { }

        // 1. Use cached data if available (e.g. after engine reload)
        if (cachedFontData) {
            console.log(`[FFmpeg:Font] Restoring font from memory cache (${cachedFontData.length}B)...`);
            await ffmpeg.writeFile('font.ttf', cachedFontData);
            return 'font.ttf';
        }

        // 2. Otherwise download
        // Switched to a reliable static BOLD TTF for extreme visibility and FFmpeg compatibility
        const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf';
        const fallbackUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf';

        console.log(`[FFmpeg:Font] Downloading static BOLD font from: ${fontUrl}`);
        let fontData: Uint8Array;
        try {
            fontData = await fetchFile(fontUrl);
            console.log(`[FFmpeg:Font] Primary static BOLD font downloaded: ${fontData.length}B`);
        } catch (e) {
            console.warn(`[FFmpeg:Font] Primary BOLD font download failed, trying fallback...`, e);
            fontData = await fetchFile(fallbackUrl);
        }

        if (fontData.length < 50000) {
            throw new Error(`Font download failed or file too small: ${fontData.length}B`);
        }

        console.log(`[FFmpeg:Font] Downloaded font successfully: ${fontData.length}B`);
        cachedFontData = fontData;

        await ffmpeg.writeFile('font.ttf', fontData);
        return 'font.ttf';
    } catch (e) {
        console.warn("[FFmpeg:Font] Failed (Font might fail to render):", e);
        return null;
    }
}

/**
 * Helper to wrap text with CJK (Korean) awareness
 * Korean often doesn't use spaces for wrapping in the same way English does,
 * so we need to be able to break at character boundaries if necessary.
 */
function wrapTextDynamic(text: string, maxCharsPerLine: number) {
    if (!text) return [];

    const lines: { text: string, charWeight: number }[] = [];

    // Split by manual line breaks first
    const manualLines = text.split('\n');

    const getWeight = (str: string) => {
        return Array.from(str).reduce((acc, c) => acc + (c.match(/[\u3131-\uD79D\uAC00-\uD7A3]/) ? 2 : 1), 0);
    };

    for (const mLine of manualLines) {
        if (!mLine.trim()) {
            lines.push({ text: ' ', charWeight: 0 });
            continue;
        }

        const words = mLine.split(' ');
        let currentLine = "";

        for (const word of words) {
            const wordWeight = getWeight(word);
            const currentLineWeight = getWeight(currentLine);

            if (currentLineWeight === 0) {
                currentLine = word;
            } else if (currentLineWeight + 1 + wordWeight <= maxCharsPerLine * 2.1) {
                currentLine += " " + word;
            } else {
                lines.push({ text: currentLine, charWeight: getWeight(currentLine) });
                currentLine = word;
            }
        }

        if (currentLine) {
            lines.push({ text: currentLine.trim(), charWeight: getWeight(currentLine.trim()) });
        }
    }

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

    // FFmpeg loaded state tracked by instance existence

    // Load Font (once)
    onProgress?.(5, 'Loading fonts...');
    const fontFile = await loadSubtitleFont(ffmpeg);

    // [FIX] Resilient asset fetcher that handles idb:// and stale blob: URLs
    // KEY INSIGHT: resolveUrl({asBlob:true}) returns a Blob URL (blob:http://...) which
    // may fail in fetchFile() due to cross-context restrictions. Instead, we load the
    // raw Blob directly from IDB and pass it to fetchFile(blob) which handles Blob→Uint8Array natively.
    const fetchAssetResilient = async (url: string, label: string, cutIndex: number): Promise<Uint8Array> => {
        // 1. If idb:// URL, load raw Blob directly from IndexedDB (NOT via resolveUrl)
        if (isIdbUrl(url)) {
            console.log(`[FFmpeg] Cut ${cutIndex} ${label}: Loading from IDB directly...`);
            try {
                // loadFromIdb returns the raw stored data (Blob or string)
                const { loadFromIdb } = await import('./imageStorage');
                const rawData = await loadFromIdb(url);
                if (rawData) {
                    if (rawData instanceof Blob) {
                        // Pass Blob directly to fetchFile - it handles Blob→Uint8Array natively
                        const data = await fetchFile(rawData);
                        if (data.length > 0) {
                            console.log(`[FFmpeg] Cut ${cutIndex} ${label}: Loaded from IDB (Blob) → ${data.length}B`);
                            return data;
                        }
                    } else if (typeof rawData === 'string') {
                        // Legacy: data: URL string stored in IDB
                        const data = await fetchFile(rawData);
                        if (data.length > 0) {
                            console.log(`[FFmpeg] Cut ${cutIndex} ${label}: Loaded from IDB (string) → ${data.length}B`);
                            return data;
                        }
                    }
                }
                console.warn(`[FFmpeg] Cut ${cutIndex} ${label}: IDB data is empty or null`);
            } catch (e) {
                console.warn(`[FFmpeg] Cut ${cutIndex} ${label}: IDB direct load failed:`, e);
            }
            // If IDB direct load fails, try resolveUrl fallback
            try {
                const resolved = await resolveUrl(url, { asBlob: true });
                if (resolved) {
                    const data = await fetchFile(resolved);
                    if (data.length > 0) return data;
                }
            } catch (e2) {
                console.warn(`[FFmpeg] Cut ${cutIndex} ${label}: resolveUrl fallback also failed`);
            }
            throw new Error(`Failed to load ${label} for cut ${cutIndex} from IDB`);
        }

        // 2. For blob: or data: or http URLs, try direct fetch
        try {
            const data = await fetchFile(url);
            if (data.length > 100) {
                return data;
            }
            console.warn(`[FFmpeg] Cut ${cutIndex} ${label}: Fetched only ${data.length}B from ${url.substring(0, 40)}`);
        } catch (e) {
            console.warn(`[FFmpeg] Cut ${cutIndex} ${label}: fetchFile failed for ${url.substring(0, 40)}:`, e);
        }

        // 3. If the cut has an original IDB reference, try loading from there
        const originalUrl = (cuts[cutIndex] as any)?.[`_original_${label}`];
        if (originalUrl && isIdbUrl(originalUrl)) {
            console.log(`[FFmpeg] Cut ${cutIndex} ${label}: Retrying from original IDB URL...`);
            try {
                const { loadFromIdb } = await import('./imageStorage');
                const rawData = await loadFromIdb(originalUrl);
                if (rawData) {
                    const blobData = rawData instanceof Blob ? rawData : rawData;
                    const data = await fetchFile(blobData);
                    if (data.length > 0) {
                        console.log(`[FFmpeg] Cut ${cutIndex} ${label}: Recovered from original IDB → ${data.length}B`);
                        return data;
                    }
                }
            } catch (e2) {
                console.error(`[FFmpeg] Cut ${cutIndex} ${label}: Original IDB recovery also failed`);
            }
        }

        // 4. Final attempt: fetch the URL as-is
        return await fetchFile(url);
    };

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
        let hasSfx = !!cut.sfxUrl;

        // Configuration from Step 4.5
        // [HEALING] Fallback to legacy useVideoAudio if audioConfig is missing (due to a previous save bug)
        const audioSource = cut.audioConfig?.primarySource || (cut.useVideoAudio ? 'video' : 'tts');
        const durationMaster = cut.cutDurationMaster || 'audio'; // 'audio' or 'video'

        let hasTtsAudio = !!cut.audioUrl;
        // If user wants 'video' audio, we only use it if video exists.
        const useVideoAudio = audioSource === 'video' && hasVideo;
        // Should we use TTS?
        const useTtsAudio = audioSource === 'tts' && hasTtsAudio;

        try {
            // Write input files with resilient fetching
            const imgData = await fetchAssetResilient(cut.imageUrl, 'image', i);
            if (imgData.length < 100) {
                console.error(`[FFmpeg] Cut ${i}: ⚠️ Image data is empty/corrupt (${imgData.length}B)! Will produce black screen.`);
            }
            await ffmpeg.writeFile(`img_${padNum}.jpg`, imgData);
            tempFiles.push(`img_${padNum}.jpg`);
            console.log(`[FFmpeg] Cut ${i}: img=${imgData.length}B`);

            if (hasVideo) {
                const vidData = await fetchAssetResilient(cut.videoUrl!, 'video', i);
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

            if (hasTtsAudio) {
                const audData = await fetchAssetResilient(cut.audioUrl!, 'audio', i);
                console.log(`[FFmpeg] Cut ${i}: tts_audio=${audData.length}B`);
                if (audData.length < 100) {
                    console.warn(`[FFmpeg] Cut ${i}: ⚠️ TTS Audio file is empty/corrupt (${audData.length}B). Using silence instead.`);
                    hasTtsAudio = false;
                } else {
                    await ffmpeg.writeFile(`audio_${padNum}.mp3`, audData);
                    tempFiles.push(`audio_${padNum}.mp3`);
                }
            }
            if (hasSfx) {
                const sfxData = await fetchAssetResilient(cut.sfxUrl!, 'sfx', i);
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
                // Strategy:
                //  Attempt 0: Pre-transcode video to safe MP4, then encode with audio
                //  Attempt 1: Skip video entirely, use IMAGE mode with audio
                //  Attempt 2: Image + silence (emergency fallback)

                if (attempt >= 2) {
                    // Emergency fallback: Use IMAGE with silence
                    console.warn(`[FFmpeg] Cut ${i}: All attempts failed. Using IMAGE + silence fallback.`);
                    try {
                        await ffmpeg.exec([
                            '-loop', '1', '-i', `img_${padNum}.jpg`,
                            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                            '-c:v', 'libx264', '-preset', 'ultrafast',
                            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
                            '-pix_fmt', 'yuv420p', '-r', '30',
                            '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
                            '-t', String(Math.max(0.1, cut.duration)),
                            '-shortest',
                            '-y', segmentName
                        ]);
                    } catch (fallbackErr) {
                        // Absolute last resort: black screen
                        console.error(`[FFmpeg] Cut ${i}: Even IMAGE fallback failed! Using black screen.`);
                        await ffmpeg.exec([
                            '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=30`,
                            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                            '-c:v', 'libx264', '-t', String(Math.max(0.1, cut.duration)),
                            '-c:a', 'aac', '-t', String(Math.max(0.1, cut.duration)),
                            '-pix_fmt', 'yuv420p', '-y', segmentName
                        ]);
                    }
                    return;
                }

                const useVideoMode = hasVideo && attempt === 0;
                const vidInputFile = (cut as any)._videoFileName || `video_${padNum}.mp4`;

                try {
                    // [HEAL] If font is missing from FS (e.g. after crash), restore it from cache
                    if (options.showSubtitles !== false && cut.dialogue) {
                        await loadSubtitleFont(ffmpeg); // This will restore from cachedFontData
                    }

                    let currentInputs: string[] = [];
                    let currentFilters = '';

                    if (useVideoMode) {
                        // [OPTIMIZED] Skip browser-native frame extraction. 
                        // Instead of extracting frames to JPEGs, we let FFmpeg decode the video directly.
                        console.log(`[FFmpeg] Cut ${i}: Using native FFmpeg decoding for maximum speed.`);

                        const trimStart = (cut as any).videoTrim?.start || 0;
                        const duration = Math.max(0.1, cut.duration);

                        // We use the original video file as the primary video input (index 0)
                        // but with seek and duration controls.
                        currentInputs.push(
                            '-ss', String(trimStart),
                            '-t', String(duration),
                            '-i', vidInputFile
                        );
                    } else {
                        // Image Mode (attempt 1 or no video)
                        console.log(`[FFmpeg] Cut ${i}: Using IMAGE mode (attempt ${attempt})`);
                        currentInputs.push('-loop', '1', '-i', `img_${padNum}.jpg`);
                    }

                    // Audio Inputs
                    let audioInputIndex = 1;

                    if (useVideoMode && useVideoAudio) {
                        // Use original video's audio track as primary audio
                        currentInputs.push('-i', vidInputFile);
                        audioInputIndex++;
                    } else if (useTtsAudio) {
                        // Use TTS
                        currentInputs.push('-i', `audio_${padNum}.mp3`);
                        audioInputIndex++;
                    } else {
                        // Silence
                        currentInputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                        audioInputIndex++;
                    }

                    if (hasSfx) {
                        currentInputs.push('-i', `sfx_${padNum}.mp3`);
                    } else {
                        currentInputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    }
                    const sfxInputIndex = audioInputIndex;

                    // Filter: Scale + Pad + FPS
                    currentFilters += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30[vscaled];`;

                    // Subtitles
                    let lastVid = 'vscaled';
                    const shouldAddSubtitles = options.showSubtitles !== false;

                    if (cut.dialogue && shouldAddSubtitles) {
                        // [RESILIENT] Ensure font is loaded into this specific FFmpeg instance
                        const activeFont = await loadSubtitleFont(ffmpeg);

                        if (activeFont) {
                            const isVertical = aspectRatio === '9:16';
                            // 줄바꿈이 최대한 생기지 않도록 폰트 크기를 조금 조절하고 글자수 제한을 크게 늘림
                            const fontSize = isVertical ? 46 : 64;
                            const lineHeight = isVertical ? 64 : 88;
                            const maxChars = isVertical ? 26 : 50;
                            const lines = wrapTextDynamic(cut.dialogue, maxChars);

                            if (lines.length > 0) {
                                const totalHeight = lines.length * lineHeight;
                                // 쇼츠 하단 UI 및 설명란을 피해 자막을 2줄 정도 위로 올림
                                const bottomMargin = isVertical ? 380 : 200;
                                const startY = height - bottomMargin - totalHeight;
                                // [FIXED] Reduced box padding for cleaner look
                                const maxW = Math.max(...lines.map(l => l.charWeight * (fontSize * 0.55)));
                                const boxW = Math.min(width * 0.96, maxW + 40); // Add 40px for comfortable padding
                                const boxH = totalHeight + 40; // Increase vertical padding for more top space
                                const boxX = (width - boxW) / 2;
                                const boxY = startY - 25; // Shift box higher up to increase top padding

                                currentFilters += `[${lastVid}]drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.4:t=fill[vbox];`;
                                lastVid = 'vbox';

                                for (let l = 0; l < lines.length; l++) {
                                    const subFile = `sub_${padNum}_${l}.txt`;
                                    // [FIX] Explicitly encode as UTF-8 Uint8Array for FFmpeg filesystem
                                    const encodedText = new TextEncoder().encode(lines[l].text);
                                    await ffmpeg.writeFile(subFile, encodedText);
                                    tempFiles.push(subFile);

                                    const lineY = Math.round(startY + (l * lineHeight));
                                    // Use quoted paths for fontfile and textfile for maximum compatibility
                                    currentFilters += `[${lastVid}]drawtext=fontfile='font.ttf':textfile='${subFile}':expansion=none:fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${lineY}[vsub_${l}];`;
                                    lastVid = `vsub_${l}`;
                                }
                            }
                        } else {
                            console.warn(`[FFmpeg] Cut ${i}: Subtitles skipped because font could not be loaded.`);
                        }
                    }
                    currentFilters += `[${lastVid}]null[vout];`;

                    // Audio Mixing with Resilience (Force 44100Hz to prevent amix crash from sample rate mismatch)
                    const sfxVol = cut.sfxVolume ?? 0.3;
                    const primaryVol = (useVideoAudio) ? (cut.audioVolumes?.video ?? 1.0) : (cut.audioVolumes?.tts ?? 1.0);

                    // The primary audio is either TTS or original video at index 1.
                    // The SFX is at sfxInputIndex (usually 2).
                    currentFilters += `[1:a]aresample=44100,volume=${primaryVol}[a_base];[${sfxInputIndex}:a]aresample=44100,volume=${sfxVol}[a_sfx];[a_base][a_sfx]amix=inputs=2:duration=first:dropout_transition=0[aout]`;

                    // Duration logic
                    // cut.duration contains the master duration calculated from step 4.5.
                    // But if it's explicitly set to 'video' duration master, ensure we respect the exact extracted video length.
                    let exportDuration = cut.duration;
                    if (useVideoMode && durationMaster === 'video' && cut.videoTrim?.end && cut.videoTrim?.start !== undefined) {
                        const trimDur = cut.videoTrim.end - cut.videoTrim.start;
                        // [HEALING] Ignore impossibly short trims (<= 0.2s) likely caused by early save bugs
                        if (trimDur > 0.2) {
                            exportDuration = trimDur;
                        }
                    }
                    const finalDuration = String(Math.max(0.1, exportDuration));

                    // EXEC
                    await ffmpeg.exec([
                        ...currentInputs,
                        '-filter_complex', currentFilters,
                        '-map', '[vout]',
                        '-map', '[aout]',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-crf', String(crf),
                        '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
                        '-video_track_timescale', '15360',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', finalDuration,
                        '-y', segmentName
                    ]);

                    // Verify output
                    const checkFile = await ffmpeg.readFile(segmentName);
                    if (!checkFile || checkFile.length === 0) {
                        throw new Error("Encoded file is empty");
                    }
                    // If we made it here, SUCCESS
                    console.log(`[FFmpeg] ✅ Cut ${i} encoding SUCCESS on Attempt ${attempt}`);
                    return; // EXIT runEncoding
                } catch (err: any) {
                    console.error(`[FFmpeg] ❌ Cut ${i} attempt ${attempt} failed: ${err.message}`, err);

                    // IF it's an aborted error and the output file actually exists, it might be the FFmpeg WASM teardown crash.
                    // We can check if `segmentName` was actually written successfully before falling back!
                    if (err.message?.includes('Aborted') || err.message?.includes('exit')) {
                        try {
                            const checkFile = await ffmpeg.readFile(segmentName);
                            if (checkFile && checkFile.length > 1000) {
                                console.warn(`[FFmpeg] ⚠️ Ignored Aborted() crash because segment was correctly written!`);
                                return; // EXIT runEncoding as success!
                            }
                        } catch (e) { }
                    }

                    if (err.message?.includes('Aborted') || err.message?.includes('OOM') || err.message?.includes('exit')) {
                        console.warn('[FFmpeg] Reloading engine because of crash...');
                        try { ffmpeg = await loadFFmpeg(onProgress, true); } catch (e) { }
                    }
                    // Next attempt
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
            // Use the already-uploaded IMAGE as fallback (not black screen).
            try {
                console.warn(`[FFmpeg] Cut ${i}: All attempts failed. Generating emergency IMAGE segment.`);
                await ffmpeg.exec([
                    '-loop', '1', '-i', `img_${padNum}.jpg`,
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                    '-c:v', 'libx264', '-preset', 'ultrafast',
                    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
                    '-pix_fmt', 'yuv420p', '-r', '30',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
                    '-t', String(Math.max(0.1, cut.duration)),
                    '-shortest',
                    '-y', segmentName
                ]);
                const emergencyCheck = await ffmpeg.readFile(segmentName);
                if (emergencyCheck && emergencyCheck.length > 0) {
                    concatList.push(`file '${segmentName}'`);
                    console.log(`[FFmpeg] Cut ${i}: Emergency IMAGE segment created (${emergencyCheck.length}B)`);
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
        // [OPTIMIZED] Try stream copy first. 
        // Since we normalized '-video_track_timescale 15360' and other params 
        // during segment encoding, '-c copy' should be safe and extremely fast.
        console.log(`[FFmpeg:Export] Attempting lightning-fast stream copy merge...`);
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            '-movflags', '+faststart',
            '-y',
            'output.mp4'
        ]);
        console.log(`[FFmpeg:Export] Stream copy merge SUCCESS!`);
    } catch (e) {
        console.error("[FFmpeg] Stream copy merge failed, falling back to re-encode:", e);
        // Fallback: Re-encode if copy fails (e.g. if parameters somehow differed)
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

            // Rename current output to temp (using FS operations instead of bash 'mv')
            const currentOutputData = await ffmpeg.readFile('output.mp4');
            await ffmpeg.writeFile('output_pre_cover.mp4', currentOutputData);
            await ffmpeg.deleteFile('output.mp4');

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
                    const preCoverData = await ffmpeg.readFile('output_pre_cover.mp4');
                    await ffmpeg.writeFile('output.mp4', preCoverData);
                    await ffmpeg.deleteFile('output_pre_cover.mp4');
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
