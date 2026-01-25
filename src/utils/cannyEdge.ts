/**
 * Canny Edge Detection Utility
 * 
 * Client-side implementation using Canvas API.
 * Uses a simplified Sobel filter approach for edge detection.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CannyOptions {
    lowThreshold: number;   // 0-255, default: 100
    highThreshold: number;  // 0-255, default: 200
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert image to grayscale
 */
const toGrayscale = (imageData: ImageData): Uint8ClampedArray => {
    const gray = new Uint8ClampedArray(imageData.width * imageData.height);
    const data = imageData.data;

    for (let i = 0; i < gray.length; i++) {
        const idx = i * 4;
        // Luminosity method: 0.299R + 0.587G + 0.114B
        gray[i] = Math.round(
            data[idx] * 0.299 +
            data[idx + 1] * 0.587 +
            data[idx + 2] * 0.114
        );
    }

    return gray;
};

/**
 * Apply Gaussian blur for noise reduction
 */
const gaussianBlur = (
    gray: Uint8ClampedArray,
    width: number,
    height: number
): Uint8ClampedArray => {
    const kernel = [
        1, 2, 1,
        2, 4, 2,
        1, 2, 1
    ];
    const kernelSum = 16;
    const result = new Uint8ClampedArray(gray.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            let ki = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = (y + ky) * width + (x + kx);
                    sum += gray[idx] * kernel[ki++];
                }
            }

            result[y * width + x] = Math.round(sum / kernelSum);
        }
    }

    return result;
};

/**
 * Apply Sobel operator for gradient detection
 */
const sobelOperator = (
    gray: Uint8ClampedArray,
    width: number,
    height: number
): { magnitude: Float32Array; direction: Float32Array } => {
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    const magnitude = new Float32Array(gray.length);
    const direction = new Float32Array(gray.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0;
            let gy = 0;
            let ki = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = (y + ky) * width + (x + kx);
                    gx += gray[idx] * sobelX[ki];
                    gy += gray[idx] * sobelY[ki++];
                }
            }

            const idx = y * width + x;
            magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
            direction[idx] = Math.atan2(gy, gx);
        }
    }

    return { magnitude, direction };
};

/**
 * Non-maximum suppression for edge thinning
 */
const nonMaxSuppression = (
    magnitude: Float32Array,
    direction: Float32Array,
    width: number,
    height: number
): Float32Array => {
    const result = new Float32Array(magnitude.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const angle = direction[idx] * (180 / Math.PI);
            const mag = magnitude[idx];

            let neighbor1 = 0;
            let neighbor2 = 0;

            // Quantize angle to 4 directions
            if ((angle >= -22.5 && angle < 22.5) || (angle >= 157.5 || angle < -157.5)) {
                neighbor1 = magnitude[idx - 1];
                neighbor2 = magnitude[idx + 1];
            } else if ((angle >= 22.5 && angle < 67.5) || (angle >= -157.5 && angle < -112.5)) {
                neighbor1 = magnitude[(y - 1) * width + (x + 1)];
                neighbor2 = magnitude[(y + 1) * width + (x - 1)];
            } else if ((angle >= 67.5 && angle < 112.5) || (angle >= -112.5 && angle < -67.5)) {
                neighbor1 = magnitude[(y - 1) * width + x];
                neighbor2 = magnitude[(y + 1) * width + x];
            } else {
                neighbor1 = magnitude[(y - 1) * width + (x - 1)];
                neighbor2 = magnitude[(y + 1) * width + (x + 1)];
            }

            result[idx] = (mag >= neighbor1 && mag >= neighbor2) ? mag : 0;
        }
    }

    return result;
};

/**
 * Double threshold and hysteresis
 */
const doubleThreshold = (
    edges: Float32Array,
    width: number,
    height: number,
    lowThreshold: number,
    highThreshold: number
): Uint8ClampedArray => {
    const result = new Uint8ClampedArray(edges.length);
    const STRONG = 255;
    const WEAK = 75;

    // First pass: classify edges
    for (let i = 0; i < edges.length; i++) {
        if (edges[i] >= highThreshold) {
            result[i] = STRONG;
        } else if (edges[i] >= lowThreshold) {
            result[i] = WEAK;
        } else {
            result[i] = 0;
        }
    }

    // Hysteresis: connect weak edges to strong edges
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            if (result[idx] === WEAK) {
                // Check 8-connected neighbors for strong edge
                let hasStrongNeighbor = false;

                for (let ky = -1; ky <= 1 && !hasStrongNeighbor; ky++) {
                    for (let kx = -1; kx <= 1 && !hasStrongNeighbor; kx++) {
                        if (result[(y + ky) * width + (x + kx)] === STRONG) {
                            hasStrongNeighbor = true;
                        }
                    }
                }

                result[idx] = hasStrongNeighbor ? STRONG : 0;
            }
        }
    }

    return result;
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Extract Canny edges from an image
 * 
 * @param imageSource - HTMLImageElement, HTMLCanvasElement, or base64 string
 * @param options - Canny threshold options
 * @returns Base64 encoded edge image (white edges on black background)
 */
export const extractCannyEdges = async (
    imageSource: HTMLImageElement | HTMLCanvasElement | string,
    options: CannyOptions = { lowThreshold: 100, highThreshold: 200 }
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const processImage = (img: HTMLImageElement | HTMLCanvasElement) => {
            try {
                // Create canvas from image
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;

                const width = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
                const height = img instanceof HTMLImageElement ? img.naturalHeight : img.height;

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, width, height);

                // Step 1: Convert to grayscale
                const gray = toGrayscale(imageData);

                // Step 2: Gaussian blur
                const blurred = gaussianBlur(gray, width, height);

                // Step 3: Sobel operator
                const { magnitude, direction } = sobelOperator(blurred, width, height);

                // Step 4: Non-maximum suppression
                const thinned = nonMaxSuppression(magnitude, direction, width, height);

                // Step 5: Double threshold and hysteresis
                const edges = doubleThreshold(
                    thinned,
                    width,
                    height,
                    options.lowThreshold,
                    options.highThreshold
                );

                // Step 6: Dilation (Make edges thicker)
                const dilated = new Uint8ClampedArray(edges.length);
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const idx = y * width + x;
                        if (edges[idx] === 255) {
                            // Set 3x3 block to strong
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    // Ensure coordinates are within bounds
                                    const ny = y + dy;
                                    const nx = x + dx;
                                    if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                                        dilated[ny * width + nx] = 255;
                                    }
                                }
                            }
                        }
                    }
                }

                // Create output image (Red edges on transparent background)
                const outputData = ctx.createImageData(width, height);
                for (let i = 0; i < dilated.length; i++) {
                    const idx = i * 4;
                    const value = dilated[i];
                    outputData.data[idx] = 255;       // R (Always Red)
                    outputData.data[idx + 1] = 0;     // G
                    outputData.data[idx + 2] = 0;     // B
                    outputData.data[idx + 3] = value; // A (Transparent if not an edge)
                }

                ctx.putImageData(outputData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (error) {
                reject(error);
            }
        };

        // Handle different input types
        if (typeof imageSource === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => processImage(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageSource;
        } else {
            processImage(imageSource);
        }
    });
};

/**
 * Create a blank edge canvas for manual drawing
 */
export const createBlankEdgeCanvas = (
    width: number,
    height: number
): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    return canvas;
};

/**
 * Combine original edges with user edits
 */
export const combineEdges = (
    originalEdges: string,
    userEdits: HTMLCanvasElement
): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = userEdits.width;
            canvas.height = userEdits.height;
            const ctx = canvas.getContext('2d')!;

            // Draw original edges
            ctx.drawImage(img, 0, 0);

            // Composite user edits on top
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(userEdits, 0, 0);

            resolve(canvas.toDataURL('image/png'));
        };
        img.src = originalEdges;
    });
};
