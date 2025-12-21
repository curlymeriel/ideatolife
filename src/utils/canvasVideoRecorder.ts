/**
 * Canvas-based Video Recorder
 * Uses Canvas + MediaRecorder API for quick WebM export
 */

export interface RecordingCut {
    imageUrl: string;
    videoUrl?: string;    // Supported if playbackMode is hybrid
    audioUrl?: string;
    sfxUrl?: string;      // Sound effect URL
    sfxVolume?: number;   // SFX volume (0.0 to 1.0, default 0.3)
    duration: number; // seconds
    dialogue?: string;
    speaker?: string;
}

export interface RecordingOptions {
    width?: number;
    height?: number;
    fps?: number;
    showSubtitles?: boolean;
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
        showSubtitles = true
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

    // Preload all images and videos
    onProgress?.(5, 'Loading assets...');
    const images: HTMLImageElement[] = [];
    const videos: (HTMLVideoElement | null)[] = [];

    for (let i = 0; i < cuts.length; i++) {
        // Image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
                console.warn(`Failed to load image ${i}`);
                resolve();
            };
            img.src = cuts[i].imageUrl;
        });
        images.push(img);

        // Video
        if (cuts[i].videoUrl) {
            const v = document.createElement('video');
            v.crossOrigin = 'anonymous';
            v.src = cuts[i].videoUrl!;
            v.muted = true; // Required for autoplay usually
            v.preload = 'auto';

            // Wait for metadata to ensure dimensions are known
            await new Promise<void>((resolve) => {
                v.onloadedmetadata = () => resolve();
                v.onerror = () => {
                    console.warn(`Failed to load video ${i}`);
                    resolve();
                }
                // Timeout fallback
                setTimeout(resolve, 3000);
            });
            videos.push(v);
        } else {
            videos.push(null);
        }
    }

    // Preload all audio (TTS + SFX)
    onProgress?.(10, 'Loading audio...');
    const audioBuffers: (AudioBuffer | null)[] = [];
    const sfxBuffers: (AudioBuffer | null)[] = [];
    for (let i = 0; i < cuts.length; i++) {
        // Load TTS audio
        if (cuts[i].audioUrl) {
            try {
                const response = await fetch(cuts[i].audioUrl!);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                audioBuffers.push(audioBuffer);
            } catch (e) {
                console.warn(`Failed to load audio ${i}:`, e);
                audioBuffers.push(null);
            }
        } else {
            audioBuffers.push(null);
        }

        // Load SFX audio
        if (cuts[i].sfxUrl) {
            try {
                const response = await fetch(cuts[i].sfxUrl!);
                const arrayBuffer = await response.arrayBuffer();
                const sfxBuffer = await audioContext.decodeAudioData(arrayBuffer);
                sfxBuffers.push(sfxBuffer);
            } catch (e) {
                console.warn(`Failed to load SFX ${i}:`, e);
                sfxBuffers.push(null);
            }
        } else {
            sfxBuffers.push(null);
        }
    }

    // Start recording
    recorder.start(100); // Collect data every 100ms

    // Safety: Handle recorder errors
    recorder.onerror = (e) => {
        console.error("MediaRecorder Error:", e);
    };

    const totalDuration = cuts.reduce((sum, cut) => sum + (cut.duration || 5), 0); // Safety default
    let elapsedTime = 0;

    // Process each cut
    for (let cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
        const cut = cuts[cutIndex];
        const img = images[cutIndex];
        const video = videos[cutIndex];
        const audioBuffer = audioBuffers[cutIndex];

        // Safety: Ensure duration is positive
        const safeDuration = Math.max(cut.duration, 0.5);

        const progressPercent = 5 + ((cutIndex) / cuts.length) * 90;
        onProgress?.(progressPercent, `Recording cut ${cutIndex + 1}/${cuts.length}...`);

        // Start audio playback for this cut (TTS + SFX)
        const now = audioContext.currentTime;
        if (audioBuffer) {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);
            source.start(now);
            source.stop(now + safeDuration);
        }

        // Start SFX playback (at configured volume)
        const sfxBuffer = sfxBuffers[cutIndex];
        if (sfxBuffer) {
            const sfxSource = audioContext.createBufferSource();
            sfxSource.buffer = sfxBuffer;

            // Create gain node for volume control
            const gainNode = audioContext.createGain();
            gainNode.gain.value = cut.sfxVolume ?? 0.3;

            sfxSource.connect(gainNode);
            gainNode.connect(destination);
            sfxSource.start(now);
            sfxSource.stop(now + safeDuration);
        }

        // Prepare Video Playback
        if (video) {
            video.currentTime = 0;
            try {
                await video.play();
            } catch (e) {
                console.warn("Video play failed for recording:", e);
            }
        }

        // Render frames for this cut's duration
        const cutStartTime = performance.now();
        const cutDurationMs = safeDuration * 1000;

        // Use a frame-limiter based on time to ensure we don't skip logic completely
        // But mainly rely on time for sync
        while (performance.now() - cutStartTime < cutDurationMs) {
            // Clear canvas
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            // Draw content (Video OR Image)
            let drawSource: CanvasImageSource = img;
            let srcWidth = img.naturalWidth;
            let srcHeight = img.naturalHeight;

            if (video && !video.paused && video.videoWidth > 0) {
                drawSource = video;
                srcWidth = video.videoWidth;
                srcHeight = video.videoHeight;
            }

            // Draw (Contain mode)
            if (srcWidth > 0) {
                const scale = Math.min(width / srcWidth, height / srcHeight);
                const drawWidth = srcWidth * scale;
                const drawHeight = srcHeight * scale;
                const x = (width - drawWidth) / 2;
                const y = (height - drawHeight) / 2;
                ctx.drawImage(drawSource, x, y, drawWidth, drawHeight);
            }

            // Draw Subtitles (Updated Style: Bottom Overlay)
            if (showSubtitles && cut.dialogue) {
                const fontSize = 36;
                const lineHeight = 48;
                // Use a modern font stack
                ctx.font = `bold ${fontSize}px sans-serif`;

                // Robust Line Splitting with \n support
                const paragraphs = cut.dialogue.split('\n');
                const lines: string[] = [];

                const maxWidth = width * 0.8;

                paragraphs.forEach(para => {
                    const words = para.split(' ');
                    let currentLine = '';
                    words.forEach(word => {
                        const testLine = currentLine + (currentLine ? ' ' : '') + word;
                        const metric = ctx.measureText(testLine);
                        const lineWidth = metric.width;

                        if (lineWidth > maxWidth) {
                            if (currentLine) lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    });
                    if (currentLine) lines.push(currentLine);
                });

                // Render Background Box (Semi-transparent Black)
                if (lines.length > 0) {
                    const paddingX = 40;
                    const paddingY = 20;
                    const totalTextHeight = lines.length * lineHeight;

                    // Find max line width for the box
                    let maxLineWidth = 0;
                    lines.forEach(line => {
                        const w = ctx.measureText(line).width;
                        if (w > maxLineWidth) maxLineWidth = w;
                    });

                    const boxWidth = maxLineWidth + (paddingX * 2);
                    const boxHeight = totalTextHeight + (paddingY * 2);

                    // Position: Bottom 10% (approx bottom-16 equivalent ~64px-100px)
                    const bottomMargin = 80;
                    const startY = height - bottomMargin - boxHeight;
                    const centerX = width / 2;

                    // Draw rounded rect (fallback to rect if roundRect missing)
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(centerX - boxWidth / 2, startY, boxWidth, boxHeight, 16);
                        ctx.fill();
                    } else {
                        ctx.fillRect(centerX - boxWidth / 2, startY, boxWidth, boxHeight);
                    }

                    // Draw Text
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';

                    // Subtle Shadow
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;

                    lines.forEach((line, i) => {
                        ctx.fillText(line, centerX, startY + paddingY + (i * lineHeight) - 5); // -5 visual tweak
                    });

                    // Reset shadow
                    ctx.shadowColor = 'transparent';
                }
            }

            // Wait for next frame target
            await new Promise(resolve => setTimeout(resolve, 1000 / fps));
        }

        // Pause video cleanup
        if (video) {
            video.pause();
        }

        elapsedTime += safeDuration;
    }

    // Stop recording
    onProgress?.(100, 'Finalizing video...');

    return new Promise((resolve, reject) => {
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            audioContext.close();

            console.log(`[Recorder] Finished. Blob size: ${blob.size}, Format: webm`);
            if (blob.size === 0) {
                console.error("Generated video blob is empty!");
                reject(new Error("Video generation failed: Empty output"));
                return;
            }

            resolve({
                blob,
                format: 'webm',
                duration: totalDuration
            });
        };

        recorder.onerror = (e) => {
            console.error("MediaRecorder stopped with error:", e);
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
