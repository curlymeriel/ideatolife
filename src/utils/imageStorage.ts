/**
 * IndexedDB Image Storage Utility
 * 
 * Stores large binary data (images, audio) in IndexedDB to reduce Zustand state size.
 * Uses idb:// URLs as references that can be resolved back to base64 when needed.
 * 
 * URL Format: idb://{type}/{key}
 * Examples:
 *   - idb://images/cut-123 (script cut image)
 *   - idb://assets/char-abc (asset definition image)
 *   - idb://audio/cut-456 (audio file)
 */

import { get, set, del, keys } from 'idb-keyval';

/**
 * Compress a base64 image string
 */
async function compressImage(
    base64Data: string,
    maxWidth: number = 1920,
    quality: number = 0.85,
    format: 'image/jpeg' | 'image/webp' = 'image/jpeg'
): Promise<string> {
    // If it's already a small string or not an image, return as-is
    if (base64Data.length < 10000 || !base64Data.startsWith('data:image')) return base64Data;

    return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
            console.warn(`[ImageStorage] Compression timed out for an image`);
            resolve(base64Data);
        }, 5000);

        img.onload = () => {
            clearTimeout(timeout);
            // Calculate new dimensions
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Data);
                return;
            }

            // Fill white background (for JPG transparency fallback)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);

            ctx.drawImage(img, 0, 0, width, height);

            try {
                const compressed = canvas.toDataURL(format, quality);
                // Only return compressed if it's actually smaller
                resolve(compressed.length < base64Data.length ? compressed : base64Data);
            } catch (e) {
                console.error("[ImageStorage] toDataURL failed:", e);
                resolve(base64Data);
            }
        };
        img.onerror = () => {
            clearTimeout(timeout);
            resolve(base64Data);
        };
        img.src = base64Data;
    });
}

// Prefix for all image storage keys to avoid conflicts
const STORAGE_PREFIX = 'media-';

/**
 * Generate an idb:// URL for a given type and key
 */
export function generateIdbUrl(type: 'images' | 'assets' | 'audio' | 'video', key: string): string {
    return `idb://${type}/${key}`;
}

/**
 * Parse an idb:// URL into its components
 */
export function parseIdbUrl(url: string): { type: string; key: string } | null {
    if (!url?.startsWith('idb://')) return null;

    // Strip query params for clean key lookup
    const cleanUrl = url.split('?')[0];

    const parts = cleanUrl.slice(6).split('/');
    if (parts.length < 2) return null;

    // Use decodeURIComponent to handle keys with spaces or special characters
    try {
        return {
            type: parts[0],
            key: decodeURIComponent(parts.slice(1).join('/'))
        };
    } catch (e) {
        return { type: parts[0], key: parts.slice(1).join('/') };
    }
}

/**
 * Check if a URL is an idb:// reference
 */
export function isIdbUrl(url: string | null | undefined): boolean {
    return !!url?.startsWith('idb://');
}

/**
 * Save binary data (base64) to IndexedDB and return an idb:// reference URL
 * 
 * @param type - Category of data (images, assets, audio, video)
 * @param key - Unique identifier within the category
 * @param base64Data - The base64 data URL (data:image/png;base64,...)
 * @param options - Optional compression settings
 * @returns The idb:// reference URL
 */
export async function saveToIdb(
    type: 'images' | 'assets' | 'audio' | 'video',
    key: string,
    data: string | Blob,
    options: { compress?: boolean; quality?: number; maxWidth?: number } = {}
): Promise<string> {
    let dataToSave: string | Blob = data;

    // Auto-compress images/assets if it's a base64 string
    if (typeof data === 'string' && data.startsWith('data:image')) {
        const isFrame = key.toLowerCase().includes('frame');
        const shouldCompress = !isFrame && (options.compress || (data.length > 1024 * 512 && (type === 'images' || type === 'assets')));

        if (shouldCompress) {
            const startTime = performance.now();
            dataToSave = await compressImage(data, options.maxWidth || 1920, options.quality || 0.85);
            const ratio = Math.round((dataToSave.length / data.length) * 100);
            console.log(`[ImageStorage] Compressed ${key}: ${ratio}% of original (${Math.round((performance.now() - startTime))}ms)`);
        }
    }

    // Convert data URLs to Blobs for more efficient storage if not already a Blob
    if (typeof dataToSave === 'string' && dataToSave.startsWith('data:')) {
        try {
            const [header, base64] = dataToSave.split(',');
            if (base64) {
                const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
                const binary = atob(base64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    array[i] = binary.charCodeAt(i);
                }
                dataToSave = new Blob([array], { type: mime });
            }
        } catch (e) {
            console.warn(`[ImageStorage] Manual Blob conversion failed, saving as string: ${key}`);
        }
    }

    const storageKey = `${STORAGE_PREFIX}${type}-${key}`;
    await set(storageKey, dataToSave);
    const idbUrl = generateIdbUrl(type, key);
    console.log(`[ImageStorage] Saved ${type}/${key} (${typeof dataToSave === 'string' ? Math.round(dataToSave.length / 1024) : Math.round((dataToSave as Blob).size / 1024)}KB)`);
    return idbUrl;
}

/**
 * Load base64 data from IndexedDB using an idb:// URL
 * 
 * @param idbUrl - The idb:// reference URL
 * @returns The original base64 data, or null if not found
 */
export async function loadFromIdb(idbUrl: string): Promise<any> {
    const parsed = parseIdbUrl(idbUrl);
    if (!parsed) return null;

    const storageKey = `${STORAGE_PREFIX}${parsed.type}-${parsed.key}`;
    const data = await get(storageKey);
    return data || null;
}

/**
 * Delete data from IndexedDB using an idb:// URL
 */
export async function deleteFromIdb(idbUrl: string): Promise<void> {
    const parsed = parseIdbUrl(idbUrl);
    if (!parsed) return;

    const storageKey = `${STORAGE_PREFIX}${parsed.type}-${parsed.key}`;
    await del(storageKey);
    console.log(`[ImageStorage] Deleted ${parsed.type}/${parsed.key}`);
}

/**
 * Resolve any URL to a displayable format
 * - If it's an idb:// URL, loads from IndexedDB
 * - If it's already a data: URL or http URL, returns as-is
 * 
 * @param url - The URL to resolve
 * @param options - Resolution options (e.g., return as blob URL)
 */
export async function resolveUrl(
    url: string | null | undefined,
    options: { asBlob?: boolean } = {}
): Promise<string> {
    if (!url) return '';
    if (!isIdbUrl(url)) return url;

    try {
        const rawData = await loadFromIdb(url);
        if (!rawData) return '';

        // Case 1: Already a Blob (modern storage)
        if (rawData instanceof Blob) {
            if (options.asBlob) return URL.createObjectURL(rawData);

            // Convert to Data URL if needed as string
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(rawData);
            });
        }

        // Case 2: String/Data URL (legacy storage)
        const dataStr = typeof rawData === 'string' ? rawData : String(rawData);
        if (!dataStr) return '';

        if (options.asBlob) {
            try {
                const dataStr = typeof rawData === 'string' ? rawData : String(rawData);
                if (dataStr.startsWith('data:')) {
                    const [header, base64] = dataStr.split(',');
                    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
                    const binary = atob(base64);
                    const array = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        array[i] = binary.charCodeAt(i);
                    }
                    return URL.createObjectURL(new Blob([array], { type: mime }));
                }
                return dataStr;
            } catch (e) {
                console.error("[ImageStorage] resolveUrl manual conversion failed:", e);
                return typeof rawData === 'string' ? rawData : String(rawData);
            }
        }

        return dataStr;
    } catch (e) {
        console.error(`[ImageStorage] Failed to resolve URL ${url}:`, e);
        return '';
    }
}

/**
 * Resolve multiple URLs in parallel (for batch operations like export)
 */
export async function resolveUrls(urls: (string | null | undefined)[]): Promise<string[]> {
    return Promise.all(urls.map(url => resolveUrl(url)));
}

/**
 * Generate a unique key for a script cut image
 */
export function generateCutImageKey(projectId: string, cutId: number, type: 'final' | 'draft' = 'final'): string {
    return `${projectId}-cut-${cutId}-${type}`;
}

/**
 * Generate a unique key for an asset image
 */

export const generateAssetImageKey = (projectId: string, assetId: string, type: 'ref' | 'draft' | 'master' | 'visual-preview') => {
    return `${projectId}-asset-${assetId}-${type}`;
};


/**
 * Generate a unique key for audio
 */
export function generateAudioKey(projectId: string, cutId: number): string {
    return `${projectId}-audio-${cutId}`;
}

/**
 * Generate a unique key for video
 */
export function generateVideoKey(projectId: string, cutId: number, extension?: string): string {
    const suffix = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : '';
    return `${projectId}-video-${cutId}${suffix}`;
}

/**
 * Debug: List all keys in IndexedDB
 */
export async function debugListKeys(): Promise<void> {
    const allKeys = await keys();
    console.log("=== IDB Keys Dump ===");
    console.log(allKeys);
    console.log("=====================");
}
/**
 * Bulk Optimize: Iterate through all stored images and compress them if they are large
 */
export async function optimizeAllStoredImages(
    onProgress?: (progress: number, total: number, key: string) => void
): Promise<{ processed: number; optimized: number; savedBytes: number }> {
    const allKeys = await keys();
    const mediaKeys = allKeys.filter(k =>
        typeof k === 'string' && (
            k.startsWith('media-') ||
            k.startsWith('image_') ||
            k.includes('thumbnail') ||
            k.includes('asset')
        )
    ) as string[];

    console.log(`[Optimizer] Starting deep scan of ${mediaKeys.length} potential image keys...`);

    let processed = 0;
    let optimized = 0;
    let savedBytes = 0;

    for (const key of mediaKeys) {
        processed++;
        onProgress?.(processed, mediaKeys.length, key);

        try {
            const rawData = await get<any>(key);
            if (!rawData) continue;

            let base64Data = '';
            if (typeof rawData === 'string') {
                // IMPORTANT: Handle images saved with 'application/octet-stream' instead of 'image/png'
                if (rawData.startsWith('data:image/') || rawData.startsWith('data:application/octet-stream')) {
                    base64Data = rawData;
                }
            } else if (rawData instanceof Blob && rawData.type.startsWith('image/')) {
                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(rawData);
                });
            }

            if (!base64Data) continue;

            // Detect PNG or large blobs
            const isPng = base64Data.includes('image/png') || (base64Data.includes('application/octet-stream') && base64Data.length > 50000);
            const isLarge = base64Data.length > 150 * 1024; // 150KB threshold

            if (!isPng && !isLarge) continue;

            // EXEMPTION: Skip anything with 'frame' for transparency
            if (key.toLowerCase().includes('frame')) {
                console.log(`[Optimizer] Skipping transparent frame: ${key}`);
                continue;
            }

            // Normalize MIME type for compression
            let normalizedData = base64Data;
            if (base64Data.startsWith('data:application/octet-stream')) {
                normalizedData = base64Data.replace('data:application/octet-stream', 'data:image/png');
            }

            const compressed = await compressImage(normalizedData, 1920, 0.80, 'image/jpeg');

            if (compressed && compressed.length < base64Data.length) {
                const diff = base64Data.length - compressed.length;
                savedBytes += diff;
                optimized++;
                await set(key, compressed);
                console.log(`[Optimizer] ✅ FIXED ${key}: ${Math.round(base64Data.length / 1024)}KB -> ${Math.round(compressed.length / 1024)}KB (Saved ${Math.round(diff / 1024)}KB)`);
            }
        } catch (e) {
            console.error(`[Optimizer] ❌ Error processing ${key}:`, e);
        }

        if (processed % 2 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return { processed, optimized, savedBytes };
}
