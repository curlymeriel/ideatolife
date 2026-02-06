/**
 * Media Compressor Utility
 * 
 * 이미지와 비디오를 업로드 전에 압축하여 Storage 용량을 절약합니다.
 */

// =====================
// 이미지 압축
// =====================

export interface ImageCompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'image/webp' | 'image/jpeg' | 'image/png';
}

const DEFAULT_IMAGE_OPTIONS: ImageCompressionOptions = {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.8,
    format: 'image/webp',
};

/**
 * 이미지 압축 (Blob → Blob)
 */
export const compressImageBlob = async (
    blob: Blob,
    options: ImageCompressionOptions = {}
): Promise<Blob> => {
    const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options };

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // 리사이즈 비율 계산
            if (opts.maxWidth && width > opts.maxWidth) {
                height = (height * opts.maxWidth) / width;
                width = opts.maxWidth;
            }
            if (opts.maxHeight && height > opts.maxHeight) {
                width = (width * opts.maxHeight) / height;
                height = opts.maxHeight;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (compressedBlob) => {
                    if (compressedBlob) {
                        console.log(
                            `[Compressor] Image: ${blob.size} → ${compressedBlob.size} bytes ` +
                            `(${Math.round((1 - compressedBlob.size / blob.size) * 100)}% reduction)`
                        );
                        resolve(compressedBlob);
                    } else {
                        reject(new Error('Failed to compress image'));
                    }
                },
                opts.format,
                opts.quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
};

/**
 * Base64 이미지 압축
 */
export const compressImageBase64 = async (
    base64: string,
    options: ImageCompressionOptions = {}
): Promise<string> => {
    // Base64를 Blob으로 변환
    const response = await fetch(base64);
    const blob = await response.blob();

    // 압축
    const compressedBlob = await compressImageBlob(blob, options);

    // 다시 Base64로 변환
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Failed to convert to base64'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedBlob);
    });
};

// =====================
// 비디오 압축
// =====================

export interface VideoCompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    videoBitsPerSecond?: number;
    audioBitsPerSecond?: number;
}

const DEFAULT_VIDEO_OPTIONS: VideoCompressionOptions = {
    maxWidth: 720,
    maxHeight: 720,
    videoBitsPerSecond: 1500000, // 1.5 Mbps
    audioBitsPerSecond: 128000,  // 128 kbps
};

/**
 * 비디오 압축 (MediaRecorder 사용)
 * 
 * 참고: 이 방법은 실시간 트랜스코딩이 아닌 리레코딩 방식입니다.
 * 더 정교한 압축이 필요하면 FFmpeg.wasm을 사용할 수 있습니다.
 */
export const compressVideoBlob = async (
    blob: Blob,
    options: VideoCompressionOptions = {},
    onProgress?: (progress: number) => void
): Promise<Blob> => {
    const opts = { ...DEFAULT_VIDEO_OPTIONS, ...options };

    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;

        const url = URL.createObjectURL(blob);

        video.onloadedmetadata = async () => {
            // 비디오 크기 계산
            let { videoWidth: width, videoHeight: height } = video;
            const aspectRatio = width / height;

            if (opts.maxWidth && width > opts.maxWidth) {
                width = opts.maxWidth;
                height = width / aspectRatio;
            }
            if (opts.maxHeight && height > opts.maxHeight) {
                height = opts.maxHeight;
                width = height * aspectRatio;
            }

            // Canvas 설정
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            // MediaRecorder 설정
            const stream = canvas.captureStream(30);

            // 오디오 트랙 추가 시도
            try {
                const audioContext = new AudioContext();
                const source = audioContext.createMediaElementSource(video);
                const destination = audioContext.createMediaStreamDestination();
                source.connect(destination);
                destination.stream.getAudioTracks().forEach(track => {
                    stream.addTrack(track);
                });
            } catch (e) {
                console.log('[Compressor] No audio track or audio processing failed');
            }

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm';

            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: opts.videoBitsPerSecond,
                audioBitsPerSecond: opts.audioBitsPerSecond,
            });

            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            recorder.onstop = () => {
                URL.revokeObjectURL(url);
                const compressedBlob = new Blob(chunks, { type: mimeType });

                console.log(
                    `[Compressor] Video: ${blob.size} → ${compressedBlob.size} bytes ` +
                    `(${Math.round((1 - compressedBlob.size / blob.size) * 100)}% reduction)`
                );

                resolve(compressedBlob);
            };

            recorder.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(new Error('MediaRecorder error'));
            };

            // 녹화 시작
            recorder.start();

            // 비디오 재생 및 캔버스에 그리기
            video.play();

            const drawFrame = () => {
                if (video.ended || video.paused) {
                    recorder.stop();
                    return;
                }

                ctx.drawImage(video, 0, 0, width, height);

                if (onProgress) {
                    const progress = video.currentTime / video.duration;
                    onProgress(progress);
                }

                requestAnimationFrame(drawFrame);
            };

            drawFrame();
        };

        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video'));
        };

        video.src = url;
    });
};

/**
 * 비디오 압축이 필요한지 확인
 */
export const shouldCompressVideo = (blob: Blob, maxSizeMB: number = 2): boolean => {
    const sizeMB = blob.size / (1024 * 1024);
    return sizeMB > maxSizeMB;
};

/**
 * 이미지 압축이 필요한지 확인
 */
export const shouldCompressImage = (blob: Blob, maxSizeKB: number = 100): boolean => {
    const sizeKB = blob.size / 1024;
    return sizeKB > maxSizeKB;
};

// =====================
// 유틸리티
// =====================

/**
 * Data URL을 Blob으로 변환
 */
export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return await response.blob();
};

/**
 * Blob을 Data URL로 변환
 */
export const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Failed to convert blob to data URL'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
