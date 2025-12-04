import html2canvas from 'html2canvas';

/**
 * Configuration options for thumbnail capture
 */
export interface ThumbnailCaptureOptions {
    width?: number;
    height?: number;
    backgroundColor?: string;
    scale?: number;
}

/**
 * Result of thumbnail capture operation
 */
export interface ThumbnailResult {
    dataUrl: string;
    canvas: HTMLCanvasElement;
}

/**
 * Captures a DOM element as a thumbnail image using html2canvas
 * Handles font loading, rendering delays, and memory cleanup
 * 
 * @param element - The DOM element to capture
 * @param options - Capture configuration options
 * @returns Promise resolving to thumbnail data URL and canvas
 */
export async function captureThumbnail(
    element: HTMLElement,
    options: ThumbnailCaptureOptions = {}
): Promise<ThumbnailResult> {
    const {
        width = 1920,
        height = 1080,
        backgroundColor = '#000000',
        scale = 1
    } = options;

    // 1. Ensure fonts are loaded
    await document.fonts.ready;

    // 2. Additional delay for rendering stability
    await new Promise(resolve => setTimeout(resolve, 300));

    // 3. Capture with html2canvas
    const canvas = await html2canvas(element, {
        scale,
        width,
        height,
        backgroundColor,
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: false, // Better text rendering
        imageTimeout: 0,
    });

    // 4. Generate data URL
    const dataUrl = canvas.toDataURL('image/png');

    return { dataUrl, canvas };
}

/**
 * Downloads a thumbnail image from a data URL
 * 
 * @param dataUrl - The image data URL
 * @param filename - The filename for the download
 */
export function downloadThumbnail(dataUrl: string, filename: string): void {
    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

/**
 * Clears canvas memory to prevent memory leaks
 * 
 * @param canvas - The canvas to clear
 */
export function cleanupCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
}

/**
 * Complete thumbnail generation workflow
 * Captures, downloads, and cleans up in one operation
 * 
 * @param element - The DOM element to capture
 * @param filename - The filename for the download
 * @param options - Capture configuration options
 * @returns Promise resolving to the data URL
 */
export async function generateAndDownloadThumbnail(
    element: HTMLElement,
    filename: string,
    options: ThumbnailCaptureOptions = {}
): Promise<string> {
    try {
        const { dataUrl, canvas } = await captureThumbnail(element, options);
        downloadThumbnail(dataUrl, filename);
        cleanupCanvas(canvas);
        return dataUrl;
    } catch (error) {
        console.error('Thumbnail generation failed:', error);
        throw new Error('Failed to generate thumbnail. Please try again.');
    }
}
