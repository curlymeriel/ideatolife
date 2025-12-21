/**
 * Migration utility for converting Base64 images/audio to IndexedDB storage
 * 
 * This migrates existing project data where large Base64 strings are stored
 * directly in the Zustand persist state, causing slow load times.
 */

import { get, set } from 'idb-keyval';
import { saveToIdb, generateCutImageKey, generateAudioKey, generateAssetImageKey } from './imageStorage';

interface MigrationResult {
    projectId: string;
    imagesConverted: number;
    audiosConverted: number;
    assetsConverted: number;
    bytesFreed: number;
    success: boolean;
    error?: string;
}

/**
 * Check if a string is a Base64 data URL (not already migrated)
 */
export function isBase64DataUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    return url.startsWith('data:');
}

/**
 * Get the size of a Base64 string in bytes
 */
function getBase64Size(base64: string): number {
    // Base64 adds ~33% overhead, so actual data is ~75% of string length
    return Math.round(base64.length * 0.75);
}

/**
 * Migrate a single project's images and audio to IndexedDB
 */
export async function migrateProjectToIdb(projectId: string): Promise<MigrationResult> {
    const result: MigrationResult = {
        projectId,
        imagesConverted: 0,
        audiosConverted: 0,
        assetsConverted: 0,
        bytesFreed: 0,
        success: false
    };


    try {
        // Load project data from IndexedDB
        const projectData = await get(`project-${projectId}`);
        if (!projectData) {
            result.error = 'Project not found';
            return result;
        }

        // --- SIZE INSPECTOR (DEEP SCAN) ---

        // 1. Shallow Key Profiler (Finds fragmented bloat like 1000 small items)
        const keySizes: Record<string, number> = {};
        Object.keys(projectData).forEach(key => {
            try {
                const val = projectData[key];
                if (val !== undefined) {
                    keySizes[key] = JSON.stringify(val).length;
                }
            } catch (e) { keySizes[key] = 0; }
        });
        const sortedKeys = Object.keys(keySizes).sort((a, b) => keySizes[b] - keySizes[a]);

        // Log Top-Level Sizes OUTSIDE group if project is large
        const projectSize = JSON.stringify(projectData).length;
        if (projectSize > 1024 * 1024 * 5) {
            console.log(`\n📊 [Project ${projectId}] Top Level Field Sizes:`);
            sortedKeys.forEach(key => {
                const mb = (keySizes[key] / 1024 / 1024).toFixed(2);
                if (parseFloat(mb) > 0.1) {
                    console.log(`   - ${key}: ${mb} MB`);
                }
            });
            console.log("-----------------------------\n");
        }

        console.groupCollapsed(`[Migration] Deep Scan for Project ${projectId}`);

        let totalSize = 0;
        let largeStringsFound = 0; // Initialize largeStringsFound

        const visited = new WeakSet();
        const stack: { obj: any; path: string }[] = [{ obj: projectData, path: 'root' }];

        while (stack.length > 0) {
            const { obj, path } = stack.pop()!;

            if (!obj) continue;

            if (typeof obj === 'object') {
                if (visited.has(obj)) continue;
                visited.add(obj); // Detect circular refs
            }

            // Check strings
            if (typeof obj === 'string') {
                const len = obj.length;
                totalSize += len;
                if (len > 10000) { // Log strings > 10KB
                    const mb = (len / 1024 / 1024).toFixed(2);
                    console.warn(`[Big Data] ${path}: ${mb} MB`);
                    largeStringsFound++;
                }
                continue;
            }

            // Check Blobs/Files (Binary Bloat)
            if (obj instanceof Blob) {
                const len = obj.size;
                totalSize += len;
                const mb = (len / 1024 / 1024).toFixed(2);
                console.warn(`[Big Data] ${path} is a BLOB/FILE of size ${mb} MB!`);
                largeStringsFound++;
                continue;
            }

            // Check ArrayBuffers
            if (obj instanceof ArrayBuffer) {
                const len = obj.byteLength;
                totalSize += len;
                const mb = (len / 1024 / 1024).toFixed(2);
                console.warn(`[Big Data] ${path} is an ArrayBuffer of size ${mb} MB!`);
                largeStringsFound++;
                continue;
            }

            // Push Arrays to Stack
            if (Array.isArray(obj)) {
                for (let i = obj.length - 1; i >= 0; i--) {
                    stack.push({ obj: obj[i], path: `${path}[${i}]` });
                }
                continue;
            }

            // Push Objects to Stack
            if (typeof obj === 'object') {
                const keys = Object.keys(obj);
                for (let i = keys.length - 1; i >= 0; i--) {
                    const key = keys[i];
                    stack.push({ obj: obj[key], path: `${path}.${key}` });
                }
            }
        }

        const totalMB = (totalSize / 1024 / 1024).toFixed(2);
        console.groupEnd(); // End the detailed group

        // Log Summary OUTSIDE the group if large
        if (totalSize > 1024 * 1024 * 5) { // If > 5MB
            console.warn(`🚨 [Project ${projectId}] Total Size: ${totalMB} MB. This is abnormally large!`);
            if (largeStringsFound === 0) {
                console.warn(`   (Note: No large individual items found. This indicates huge fragmentation or hidden binary data.)`);
            }
        } else {
            console.log(`[Project ${projectId}] Total Size: ${totalMB} MB (Clean)`);
        }
        // ----------------------

        let hasChanges = false;

        // NEW: Binary Object Migration (Blob/File -> IDB)
        // We'll scan for common places first.

        // 1. Script Video Blobs (Step 6 leftovers)
        if (projectData.script && Array.isArray(projectData.script)) {
            for (let i = 0; i < projectData.script.length; i++) {
                const cut = projectData.script[i];
                // Check if videoUrl is actually a Blob object (legacy error)
                if (cut.videoUrl && typeof cut.videoUrl === 'object' && (cut.videoUrl instanceof Blob || (cut.videoUrl as any).size)) {
                    console.warn(`[Migration] Found Blob in videoUrl for cut ${cut.id}`);
                    // Convert Blob to IDB
                    const blob = cut.videoUrl as unknown as Blob;
                    const reader = new FileReader();
                    const base64 = await new Promise<string>((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });

                    const videoKey = `${cut.id}-video-blob`;
                    const idbUrl = await saveToIdb('video', videoKey, base64);
                    result.bytesFreed += blob.size;
                    projectData.script[i].videoUrl = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted video Blob → ${idbUrl}`);
                }
            }
        }

        // 1. Migrate script images
        if (projectData.script && Array.isArray(projectData.script)) {
            for (let i = 0; i < projectData.script.length; i++) {
                const cut = projectData.script[i];

                // Migrate finalImageUrl
                if (isBase64DataUrl(cut.finalImageUrl)) {
                    const imageKey = generateCutImageKey(projectId, cut.id, 'final');
                    const idbUrl = await saveToIdb('images', imageKey, cut.finalImageUrl);
                    result.bytesFreed += getBase64Size(cut.finalImageUrl);
                    projectData.script[i].finalImageUrl = idbUrl;
                    result.imagesConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted cut ${cut.id} image → ${idbUrl}`);
                }

                // Migrate draftImageUrl
                if (isBase64DataUrl(cut.draftImageUrl)) {
                    const imageKey = generateCutImageKey(projectId, cut.id, 'draft');
                    const idbUrl = await saveToIdb('images', imageKey, cut.draftImageUrl);
                    result.bytesFreed += getBase64Size(cut.draftImageUrl);
                    projectData.script[i].draftImageUrl = idbUrl;
                    result.imagesConverted++;
                    hasChanges = true;
                }

                // Migrate audioUrl
                if (isBase64DataUrl(cut.audioUrl)) {
                    const audioKey = generateAudioKey(projectId, cut.id);
                    const idbUrl = await saveToIdb('audio', audioKey, cut.audioUrl);
                    result.bytesFreed += getBase64Size(cut.audioUrl);
                    projectData.script[i].audioUrl = idbUrl;
                    result.audiosConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted cut ${cut.id} audio → ${idbUrl}`);
                }

                // Migrate sfxUrl
                if (isBase64DataUrl(cut.sfxUrl)) {
                    // Use audio storage for SFX, suffix key with -sfx
                    const sfxKey = `${cut.id}-sfx`;
                    const idbUrl = await saveToIdb('audio', sfxKey, cut.sfxUrl);
                    result.bytesFreed += getBase64Size(cut.sfxUrl);
                    projectData.script[i].sfxUrl = idbUrl;
                    result.audiosConverted++; // Count as audio
                    hasChanges = true;
                    console.log(`[Migration] Converted cut ${cut.id} sfx → ${idbUrl}`);
                }

                // Migrate videoUrl
                if (isBase64DataUrl(cut.videoUrl)) {
                    const videoKey = `${cut.id}-video`;
                    const idbUrl = await saveToIdb('video', videoKey, cut.videoUrl);
                    result.bytesFreed += getBase64Size(cut.videoUrl);
                    projectData.script[i].videoUrl = idbUrl;
                    result.assetsConverted++; // Count as asset
                    hasChanges = true;
                    console.log(`[Migration] Converted cut ${cut.id} video → ${idbUrl}`);
                }

                // Auto-confirm if content exists (fix progress calculation for migrated projects)
                if ((projectData.script[i].finalImageUrl || projectData.script[i].draftImageUrl) && !projectData.script[i].isImageConfirmed) {
                    projectData.script[i].isImageConfirmed = true;
                    result.assetsConverted++; // Count as asset conversion to show progress
                    hasChanges = true;
                    console.log(`[Migration] Auto-confirmed image for cut ${cut.id}`);
                }
                if (projectData.script[i].audioUrl && projectData.script[i].audioUrl !== 'mock:beep' && !projectData.script[i].isAudioConfirmed) {
                    projectData.script[i].isAudioConfirmed = true;
                    // Count audio confirmation as conversion too
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Auto-confirmed audio for cut ${cut.id}`);
                }
            }
        }

        // 2. Migrate asset definition images
        if (projectData.assetDefinitions) {
            for (const assetId of Object.keys(projectData.assetDefinitions)) {
                const asset = projectData.assetDefinitions[assetId];

                // Migrate referenceImage
                if (isBase64DataUrl(asset.referenceImage)) {
                    const imageKey = generateAssetImageKey(projectId, assetId, 'ref');
                    const idbUrl = await saveToIdb('assets', imageKey, asset.referenceImage);
                    result.bytesFreed += getBase64Size(asset.referenceImage);
                    projectData.assetDefinitions[assetId].referenceImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted asset ${asset.name} ref → ${idbUrl}`);
                }

                // Migrate draftImage
                if (isBase64DataUrl(asset.draftImage)) {
                    const imageKey = generateAssetImageKey(projectId, assetId, 'draft');
                    const idbUrl = await saveToIdb('assets', imageKey, asset.draftImage);
                    result.bytesFreed += getBase64Size(asset.draftImage);
                    projectData.assetDefinitions[assetId].draftImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                }

                // Migrate masterImage
                if (isBase64DataUrl(asset.masterImage)) {
                    const imageKey = generateAssetImageKey(projectId, assetId, 'master');
                    const idbUrl = await saveToIdb('assets', imageKey, asset.masterImage);
                    result.bytesFreed += getBase64Size(asset.masterImage);
                    projectData.assetDefinitions[assetId].masterImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                }
            }
        }

        // 3. Migrate masterStyle referenceImage
        if (projectData.masterStyle?.referenceImage && isBase64DataUrl(projectData.masterStyle.referenceImage)) {
            const imageKey = generateAssetImageKey(projectId, 'master-style', 'ref');
            const idbUrl = await saveToIdb('assets', imageKey, projectData.masterStyle.referenceImage);
            result.bytesFreed += getBase64Size(projectData.masterStyle.referenceImage);
            projectData.masterStyle.referenceImage = idbUrl;
            result.assetsConverted++;
            hasChanges = true;
            console.log(`[Migration] Converted masterStyle ref → ${idbUrl}`);
        }

        // 4. Migrate Project Thumbnail (CRITICAL for Dashboard performance)
        if (isBase64DataUrl(projectData.thumbnailUrl)) {
            const imageKey = `${projectId}-thumbnail`;
            const idbUrl = await saveToIdb('images', imageKey, projectData.thumbnailUrl!);
            result.bytesFreed += getBase64Size(projectData.thumbnailUrl!);
            projectData.thumbnailUrl = idbUrl;
            result.imagesConverted++;
            hasChanges = true;
            console.log(`[Migration] Converted thumbnail → ${idbUrl}`);
        }

        // 5. Migrate Chat History (Hidden bloat source)
        if (projectData.chatHistory && Array.isArray(projectData.chatHistory)) {
            for (let i = 0; i < projectData.chatHistory.length; i++) {
                const msg = projectData.chatHistory[i];
                if (isBase64DataUrl(msg.image)) {
                    // Chat images are often just for reference, but can satisfy "images" type
                    const imageKey = `${projectId}-chat-${i}-${Date.now()}`;
                    const idbUrl = await saveToIdb('images', imageKey, msg.image!);
                    result.bytesFreed += getBase64Size(msg.image!);
                    projectData.chatHistory[i].image = idbUrl;
                    result.imagesConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted chat image ${i} → ${idbUrl}`);
                }
            }
        }

        // 6. Migrate Visual Assets (Step 1/2 Previews)
        if (projectData.visualAssets) {
            for (const assetId of Object.keys(projectData.visualAssets)) {
                const asset = projectData.visualAssets[assetId];
                if (isBase64DataUrl(asset.previewImageUrl)) {
                    const imageKey = generateAssetImageKey(projectId, assetId, 'visual-preview');
                    const idbUrl = await saveToIdb('images', imageKey, asset.previewImageUrl!);
                    result.bytesFreed += getBase64Size(asset.previewImageUrl!);
                    projectData.visualAssets[assetId].previewImageUrl = idbUrl;
                    result.imagesConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted visual asset ${assetId} → ${idbUrl}`);
                }
            }
        }

        // 7. Migrate Thumbnail Frame Image
        if (projectData.thumbnailSettings?.frameImage && isBase64DataUrl(projectData.thumbnailSettings.frameImage)) {
            const imageKey = `${projectId}-thumb-frame`;
            const idbUrl = await saveToIdb('images', imageKey, projectData.thumbnailSettings.frameImage);
            result.bytesFreed += getBase64Size(projectData.thumbnailSettings.frameImage);
            projectData.thumbnailSettings.frameImage = idbUrl;
            result.imagesConverted++;
            hasChanges = true;
            console.log(`[Migration] Converted thumbnail frame → ${idbUrl}`);
        }

        // 8. Migrate Thumbnail Preview (Often missed)
        if (isBase64DataUrl(projectData.thumbnailPreview)) {
            const imageKey = `${projectId}-thumb-preview`;
            const idbUrl = await saveToIdb('images', imageKey, projectData.thumbnailPreview!);
            result.bytesFreed += getBase64Size(projectData.thumbnailPreview!);
            projectData.thumbnailPreview = idbUrl;
            result.imagesConverted++;
            hasChanges = true;
            console.log(`[Migration] Converted thumbnail preview → ${idbUrl}`);
        }

        // 9. Migrate PRODUCTION ASSETS (The 25MB Culprit)
        if (projectData.assets) {
            console.log(`[Migration] Checking ${Object.keys(projectData.assets).length} production assets...`);
            for (const cutId of Object.keys(projectData.assets)) {
                const asset = projectData.assets[cutId];
                if (!asset) continue;

                // Check Master Image
                if (isBase64DataUrl(asset.masterImage)) {
                    const imageKey = `${projectId}-asset-${cutId}-master`;
                    const idbUrl = await saveToIdb('assets', imageKey, asset.masterImage);
                    result.bytesFreed += getBase64Size(asset.masterImage);
                    projectData.assets[cutId].masterImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted asset master image → ${idbUrl}`);
                }

                // Check Draft Image
                if (isBase64DataUrl(asset.draftImage)) {
                    const imageKey = `${projectId}-asset-${cutId}-draft`;
                    const idbUrl = await saveToIdb('assets', imageKey, asset.draftImage);
                    result.bytesFreed += getBase64Size(asset.draftImage);
                    projectData.assets[cutId].draftImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted asset draft image → ${idbUrl}`);
                }

                // Check Reference Image (if any)
                if (asset.referenceImage && isBase64DataUrl(asset.referenceImage)) {
                    const imageKey = `${projectId}-asset-${cutId}-ref`;
                    const idbUrl = await saveToIdb('assets', imageKey, asset.referenceImage);
                    result.bytesFreed += getBase64Size(asset.referenceImage);
                    projectData.assets[cutId].referenceImage = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted asset ref image → ${idbUrl}`);
                }

                // Check Image URL (The main 25MB culprit)
                if (asset.imageUrl && isBase64DataUrl(asset.imageUrl)) {
                    const imageKey = `${projectId}-asset-${cutId}-final`;
                    const idbUrl = await saveToIdb('assets', imageKey, asset.imageUrl);
                    result.bytesFreed += getBase64Size(asset.imageUrl);
                    projectData.assets[cutId].imageUrl = idbUrl;
                    result.assetsConverted++;
                    hasChanges = true;
                    console.log(`[Migration] Converted asset final imageUrl → ${idbUrl}`);
                }
            }
        }

        // 10. Migrate Style Anchor (0.7MB bloat)
        if (projectData.styleAnchor && isBase64DataUrl(projectData.styleAnchor.referenceImage)) {
            const imageKey = generateAssetImageKey(projectId, 'style-anchor', 'ref');
            const idbUrl = await saveToIdb('assets', imageKey, projectData.styleAnchor.referenceImage);
            result.bytesFreed += getBase64Size(projectData.styleAnchor.referenceImage);
            projectData.styleAnchor.referenceImage = idbUrl;
            result.assetsConverted++;
            hasChanges = true;
            console.log(`[Migration] Converted styleAnchor ref → ${idbUrl}`);
        }

        // Save updated project data (This logic already exists at end of file)
        if (hasChanges) {
            await set(`project-${projectId}`, projectData);
            console.log(`[Migration] ✅ Project ${projectId} saved. Freed ${(result.bytesFreed / 1024 / 1024).toFixed(2)}MB`);

            // Sync with Global Store (Update Metadata)
            try {
                const { useWorkflowStore } = await import('../store/workflowStore');
                const store = useWorkflowStore.getState();

                // 1. Update Metadata in savedProjects
                const savedProjects = { ...store.savedProjects };
                if (savedProjects[projectId]) {
                    savedProjects[projectId] = {
                        ...savedProjects[projectId],
                        thumbnailUrl: projectData.thumbnailUrl
                    };
                    // Update metadata
                    useWorkflowStore.setState({ savedProjects });
                }

                // 2. CRITICAL: Avoid syncing heavy data to memory directly to prevent OOM (RESULT_CODE_HUNG)
                // Instead, we will rely on a page reload to fetch the fresh, optimized data from IDB.
                if (store.id === projectId) {
                    console.log(`[Migration] Project ${projectId} is active. Requesting reload...`);
                    // We don't set state here because it duplicates memory usage.
                    // The caller (Dashboard) should handle reload.
                }

            } catch (e) {
                console.warn('[Migration] Failed to sync with global store:', e);
            }

        } else {
            console.log(`[Migration] Project ${projectId} already migrated or has no Base64 data`);
        }

        result.success = true;
        return result;

    } catch (error) {
        console.error(`[Migration] ❌ Failed for project ${projectId}:`, error);
        result.error = error instanceof Error ? error.message : 'Unknown error';
        return result;
    }
}

/**
 * Migrate all projects
 */
export async function migrateAllProjects(projectIds: string[]): Promise<{
    totalImages: number;
    totalAudios: number;
    totalAssets: number;
    totalBytesFreed: number;
    results: MigrationResult[];
}> {
    console.log(`[Migration] Starting migration for ${projectIds.length} project(s)...`);

    const results: MigrationResult[] = [];
    let totalImages = 0;
    let totalAudios = 0;
    let totalAssets = 0;
    let totalBytesFreed = 0;

    for (const projectId of projectIds) {
        const result = await migrateProjectToIdb(projectId);
        results.push(result);
        totalImages += result.imagesConverted;
        totalAudios += result.audiosConverted;
        totalAssets += result.assetsConverted;
        totalBytesFreed += result.bytesFreed;
    }

    console.log(`[Migration] ✅ Complete!`);
    console.log(`  - Images: ${totalImages}`);
    console.log(`  - Audios: ${totalAudios}`);
    console.log(`  - Assets: ${totalAssets}`);
    console.log(`  - Freed: ${(totalBytesFreed / 1024 / 1024).toFixed(2)}MB`);

    return { totalImages, totalAudios, totalAssets, totalBytesFreed, results };
}
