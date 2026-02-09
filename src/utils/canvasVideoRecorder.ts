/**
 * Canvas-based Video Recorder
 * Uses Canvas + MediaRecorder API for quick WebM export
 */

export interface RecordingCut {
    imageUrl: string;
    videoUrl?: string;    // Supported if playbackMode is hybrid
    videoTrim?: { start: number; end: number }; // [NEW] Support trimming
    audioUrl?: string;
    sfxUrl?: string;      // Sound effect URL
    sfxVolume?: number;   // SFX volume (0.0 to 1.0, default 0.3)
    useVideoAudio?: boolean; // If true, use video's embedded audio instead of TTS
    duration: number; // seconds
    dialogue?: string;
    speaker?: string;
}

export interface RecordingOptions {
    width?: number;
    height?: number;
    fps?: number;
    showSubtitles?: boolean;
    aspectRatio?: string;
}

export interface RecordingResult {
    blob: Blob;
    format: 'webm' | 'mp4';
    duration: number;
}

/**
 * Record presentation as WebM video using Canvas + MediaRecorder
 */
export async function recordCanvasVideo(
    cuts: RecordingCut[],
    options: RecordingOptions = {},
    onProgress?: (progress: number, status: string) => void
): Promise<RecordingResult> {
    const {
        width = 1920,
        height = 1080,
        fps = 30,
        showSubtitles = true,
        aspectRatio = '16:9'
    } = options;

    onProgress?.(0, 'Initializing recorder...');

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Create audio context for mixing
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    // Get canvas stream
    const canvasStream = canvas.captureStream(fps);

    // Combine video and audio tracks
    const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
    ]);

    // Determine best codec
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm';

    const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for good quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    // Start recording
    recorder.start(100); // Collect data every 100ms

    // Safety: Handle recorder errors
    recorder.onerror = (e) => {
        console.error("MediaRecorder Error:", e);
    };

    const totalDuration = cuts.reduce((sum, cut) => sum + (cut.duration || 5), 0); // Safety default
    let elapsedTime = 0;

    // HELPER: JIT Asset Loader (Loads only ONE cut's assets)
    const loadCutAssets = async (cut: RecordingCut, index: number) => {
        // 1. Image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
                console.warn(`Failed to load image ${index}`);
                resolve();
            };
            img.src = cut.imageUrl;
        });

        // 2. Video (if exists)
        let video: HTMLVideoElement | null = null;
        if (cut.videoUrl) {
            video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src = cut.videoUrl;
            video.muted = true; // Start muted
            video.preload = 'auto';
            await new Promise<void>((resolve) => {
                video!.onloadedmetadata = () => resolve();
                video!.onerror = () => { video = null; resolve(); }; // Soft fail
                setTimeout(resolve, 2000); // Timeout
            });
        }

        // 3. Audio (TTS)
        let audioBuffer: AudioBuffer | null = null;
        if (cut.audioUrl) {
            try {
                const response = await fetch(cut.audioUrl);
                const arrayBuffer = await response.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } catch (e) { console.warn(`Failed to load audio ${index}`, e); }
        }

        // 4. SFX
        let sfxBuffer: AudioBuffer | null = null;
        if (cut.sfxUrl) {
            try {
                const response = await fetch(cut.sfxUrl);
                const arrayBuffer = await response.arrayBuffer();
                sfxBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } catch (e) { console.warn(`Failed to load SFX ${index}`, e); }
        }

        return { img, video, audioBuffer, sfxBuffer };
    };

    // Process each cut SEQUENTIALLY (JIT Loading)
    for (let cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
        onProgress?.(
            5 + ((cutIndex) / cuts.length) * 90,
            `Recording cut ${cutIndex + 1}/${cuts.length} (Loading assets...)`
        );

        const cut = cuts[cutIndex];
        const safeDuration = Math.max(cut.duration, 0.5);

        // A. Load Assets Just-In-Time
        const assets = await loadCutAssets(cut, cutIndex);
        let { img, video, audioBuffer, sfxBuffer } = assets;

        onProgress?.(
            5 + ((cutIndex) / cuts.length) * 90,
            `Recording cut ${cutIndex + 1}/${cuts.length} (Rendering...)`
        );

        // B. Play Audio/Video
        const now = audioContext.currentTime;

        // B-1. Video Audio vs TTS
        let videoSourceNode: MediaElementAudioSourceNode | null = null;
        const shouldUseVideoAudio = cut.useVideoAudio && video;

        if (shouldUseVideoAudio && video) {
            video.muted = false;
            video.volume = 1;
            try {
                // Connect video audio to destination
                videoSourceNode = audioContext.createMediaElementSource(video);
                videoSourceNode.connect(destination);
            } catch (e) { console.warn('Video audio connect failed:', e); }
        } else if (audioBuffer) {
            // Play TTS
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);
            source.start(now);
            source.stop(now + safeDuration);
        }

        // B-2. SFX
        if (sfxBuffer) {
            const sfxSource = audioContext.createBufferSource();
            sfxSource.buffer = sfxBuffer;
            const gain = audioContext.createGain();
            gain.gain.value = cut.sfxVolume ?? 0.3;
            sfxSource.connect(gain);
            gain.connect(destination);
            sfxSource.start(now);
            sfxSource.stop(now + safeDuration);
        }

        // B-3. Start Video Playback
        if (video) {
            // [FIX] Respect Trim Start
            const trimStart = cut.videoTrim?.start || 0;
            video.currentTime = trimStart;
            if (!shouldUseVideoAudio) video.muted = true;
            try { await video.play(); } catch (e) { console.warn('Record video play failed', e); }
        }

        // C. Render Loop
        const cutStartTime = performance.now();
        const cutDurationMs = safeDuration * 1000;

        while (performance.now() - cutStartTime < cutDurationMs) {
            // Clear
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            // Draw Source
            let drawSource: CanvasImageSource = img;
            let srcW = img.naturalWidth;
            let srcH = img.naturalHeight;

            if (video && video.videoWidth > 0) {
                // [FIX] Loop video if it ends before the cut duration is over
                if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.1)) {
                    console.log(`[Recorder] Looping video for Cut ${cutIndex}`);
                    video.currentTime = 0;
                    video.play().catch(() => { });
                }
                drawSource = video;
                srcW = video.videoWidth;
                srcH = video.videoHeight;
            }

            if (srcW > 0) {
                const scale = Math.min(width / srcW, height / srcH);
                const dw = srcW * scale;
                const dh = srcH * scale;
                const dx = (width - dw) / 2;
                const dy = (height - dh) / 2;
                ctx.drawImage(drawSource, dx, dy, dw, dh);
            }

            // Draw Subtitles (Bottom Overlay)
            if (showSubtitles && cut.dialogue) {
                // ... (Subtitle logic preserved) ...
                const isVertical = aspectRatio === '9:16';
                const fontSize = isVertical ? 25 : 36;
                const lineHeight = isVertical ? 34 : 48;
                ctx.font = `bold ${fontSize}px sans-serif`;

                const paragraphs = cut.dialogue.split('\n');
                const lines: string[] = [];
                const maxWidth = width * 0.8;

                paragraphs.forEach(para => {
                    const words = para.split(' ');
                    let currentLine = '';
                    words.forEach(word => {
                        const testLine = currentLine + (currentLine ? ' ' : '') + word;
                        if (ctx.measureText(testLine).width > maxWidth) {
                            if (currentLine) lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    });
                    if (currentLine) lines.push(currentLine);
                });

                if (lines.length > 0) {
                    const paddingX = 40;
                    const paddingY = 20;
                    const totalTextHeight = lines.length * lineHeight;
                    let maxLineWidth = 0;
                    lines.forEach(l => maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width));

                    const boxWidth = maxLineWidth + (paddingX * 2);
                    const boxHeight = totalTextHeight + (paddingY * 2);
                    const bottomMargin = 80;
                    const startY = height - bottomMargin - boxHeight;
                    const centerX = width / 2;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(centerX - boxWidth / 2, startY, boxWidth, boxHeight, 16);
                        ctx.fill();
                    } else {
                        ctx.fillRect(centerX - boxWidth / 2, startY, boxWidth, boxHeight);
                    }

                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;

                    lines.forEach((line, i) => {
                        ctx.fillText(line, centerX, startY + paddingY + (i * lineHeight) - 5);
                    });
                    ctx.shadowColor = 'transparent';
                }
            }

            await new Promise(r => setTimeout(r, 1000 / fps));
        }

        // D. Cleanup (Memory Release)
        if (video) {
            video.pause();
            video.src = '';
            video.load();
            if (videoSourceNode) videoSourceNode.disconnect();
            video.remove();
            video = null;
        }
        img.src = ''; // Detach
        // img = null; // GC will handle

        // Audio buffers are shared with Context? No, decodeAudioData creates new ones.
        // We just let them go out of scope.
        elapsedTime += safeDuration;
    }

    // Stop recording
    onProgress?.(100, 'Finalizing video...');

    // Cleanup Streams
    canvasStream.getTracks().forEach(track => track.stop());
    destination.stream.getTracks().forEach(track => track.stop());

    return new Promise((resolve, reject) => {
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            audioContext.close();
            console.log(`[Recorder] Finished. Blob size: ${blob.size}`);
            if (blob.size === 0) {
                reject(new Error("Empty Output"));
                return;
            }
            resolve({ blob, format: 'webm', duration: totalDuration });
        };
        // ... err handlers same ...
        recorder.onerror = (e) => {
            console.error("Recorder Error", e);
            audioContext.close();
            reject(e);
        };
        recorder.stop();
    });
}

/**
 * Check if Canvas Recording is supported
 */
export function isCanvasRecordingSupported(): boolean {
    return !!(
        typeof MediaRecorder !== 'undefined' &&
        typeof HTMLCanvasElement.prototype.captureStream !== 'undefined' &&
        MediaRecorder.isTypeSupported('video/webm')
    );
}
