
import JSZip from 'jszip';
import { saveToIdb } from './imageStorage';
import type { ProjectData } from '../store/types';

/**
 * Imports a project from a ZIP file (buffer or blob)
 * restoring assets to IndexedDB and updating the ProjectData.
 */
export const importProjectFromZip = async (zipData: Blob | ArrayBuffer): Promise<ProjectData | null> => {
    try {
        const zip = await JSZip.loadAsync(zipData);

        // 1. Locate project.json
        // It might be at root, or inside a folder (e.g. "Series - Ep/project.json")
        let projectJsonFile = zip.file("project.json");
        let rootPath = "";

        if (!projectJsonFile) {
            // Search recursively
            const files = Object.keys(zip.files);
            const found = files.find(path => path.endsWith("project.json"));
            if (found) {
                projectJsonFile = zip.file(found);
                // "Series - Ep/project.json" -> rootPath = "Series - Ep/"
                rootPath = found.substring(0, found.lastIndexOf("project.json"));
            }
        }

        if (!projectJsonFile) {
            console.warn("No project.json found in ZIP. Is this a helper backup?");
            return null;
        }

        const jsonStr = await projectJsonFile.async("string");
        const projectData = JSON.parse(jsonStr) as ProjectData;

        // Force a new ID to avoid collisions? 
        // Or keep original ID? 
        // If we keep original ID, we overwrite. Users might want to "Transfer", so overwriting is often desired.
        // But if it's a "Clone", we might want a new ID.
        // For now: Keep ID. If collision, store will handle (overwrite).

        console.log(`[ZipImport] Restoring project ${projectData.id} (${projectData.episodeName})...`);

        // Helper to convert Blob to Base64
        const blobToBase64 = (blob: Blob): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        resolve(reader.result);
                    } else {
                        reject(new Error("Failed to convert blob to base64"));
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        // Helper to extract and save file
        const restoreFile = async (subPath: string): Promise<string | null> => {
            if (!subPath) return null;

            // Handle idb:// URLs - extract the key portion for matching
            let searchPath = subPath;
            if (subPath.startsWith('idb://')) {
                // Extract key from idb:// URL, e.g. "idb://images/key_name" -> "key_name"
                const parts = subPath.split('/');
                searchPath = parts[parts.length - 1] || subPath;
                console.log(`[ZipImport] Extracted search key from idb URL: ${searchPath}`);
            }

            // subPath is e.g. "images/cut_001.png"
            // We need to look at rootPath + subPath
            const fullPath = rootPath + searchPath;
            const file = zip.file(fullPath);

            let blob: Blob | null = null;
            let type: 'images' | 'audio' = 'images';
            let name = searchPath.split('/').pop() || 'file';
            // Get base name without extension for flexible matching
            const baseName = name.replace(/\.[^/.]+$/, '');

            console.log(`[ZipImport] 🔍 Looking for: ${fullPath}, file found: ${!!file}, baseName: ${baseName}`);

            if (!file) {
                // Try loose matching if exact path fails (robustness)
                // e.g. "images/cut_001.png" vs "cut_001.png" at root
                const nameOnly = searchPath.split('/').pop();
                if (nameOnly) {
                    name = nameOnly;
                    const baseNameOnly = nameOnly.replace(/\.[^/.]+$/, '');

                    // Image extension priority order (prefer real images over .bin)
                    const preferredImageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
                    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
                    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

                    // Find all files matching by base name
                    const matchingFiles = Object.keys(zip.files).filter(f => {
                        const fileName = f.split('/').pop() || '';
                        const fileBaseName = fileName.replace(/\.[^/.]+$/, '');
                        return fileBaseName === baseNameOnly && !zip.files[f].dir;
                    });

                    console.log(`[ZipImport] 📂 Loose matching for "${baseNameOnly}": found ${matchingFiles.length} candidates:`, matchingFiles);

                    let looseMatch: string | undefined = undefined;

                    if (matchingFiles.length > 0) {
                        // Prioritize by extension: prefer real images over .bin
                        looseMatch = matchingFiles.find(f => {
                            const ext = f.split('.').pop()?.toLowerCase() || '';
                            return preferredImageExts.includes(ext);
                        });

                        // If no preferred image, try video
                        if (!looseMatch) {
                            looseMatch = matchingFiles.find(f => {
                                const ext = f.split('.').pop()?.toLowerCase() || '';
                                return videoExts.includes(ext);
                            });
                        }

                        // If no video, try audio
                        if (!looseMatch) {
                            looseMatch = matchingFiles.find(f => {
                                const ext = f.split('.').pop()?.toLowerCase() || '';
                                return audioExts.includes(ext);
                            });
                        }

                        // Fallback to .bin or any other
                        if (!looseMatch) {
                            looseMatch = matchingFiles[0];
                        }

                        if (looseMatch) {
                            console.log(`[ZipImport] Prioritized match: ${looseMatch} (from ${matchingFiles.length} candidates for ${nameOnly})`);
                        }
                    }

                    if (looseMatch) {
                        const matchFile = zip.file(looseMatch);
                        if (matchFile) {
                            blob = await matchFile.async("blob");
                            // Determine type from extension (support more formats)
                            const ext = looseMatch.split('.').pop()?.toLowerCase() || '';
                            if (audioExts.includes(ext)) {
                                type = 'audio';
                            } else {
                                type = 'images'; // Default to images for png, jpg, jpeg, webp, bin, mp4, etc.
                            }
                        }
                    }
                }

                if (!blob) {
                    console.warn(`[ZipImport] Asset not found: ${fullPath} (search: ${searchPath})`);
                    return null;
                }
            } else {
                // File found! But if it's a .bin file, check for a better alternative
                const foundExt = fullPath.split('.').pop()?.toLowerCase() || '';
                const preferredImageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

                if (foundExt === 'bin') {
                    // Look for a better alternative with same base name
                    const foundBaseName = name.replace(/\.[^/.]+$/, '');
                    const betterMatch = Object.keys(zip.files).find(f => {
                        const fileName = f.split('/').pop() || '';
                        const fileBaseName = fileName.replace(/\.[^/.]+$/, '');
                        const fileExt = f.split('.').pop()?.toLowerCase() || '';
                        return fileBaseName === foundBaseName && preferredImageExts.includes(fileExt) && !zip.files[f].dir;
                    });

                    if (betterMatch) {
                        console.log(`[ZipImport] 🔄 Found better alternative: ${betterMatch} (replacing .bin)`);
                        const betterFile = zip.file(betterMatch);
                        if (betterFile) {
                            blob = await betterFile.async("blob");
                            name = betterMatch.split('/').pop() || name; // Update name to reflect actual file
                        }
                    } else {
                        // No better alternative, use the .bin file
                        blob = await file.async("blob");
                    }
                } else {
                    blob = await file.async("blob");
                }
                type = searchPath.includes('audio') ? 'audio' : 'images';
            }

            if (!blob) return null;

            // Convert to Base64 for IndexedDB storage
            const base64Data = await blobToBase64(blob);
            const key = `${projectData.id}_${name}`; // Simple unique key

            // saveToIdb expects Base64 string
            return await saveToIdb(type, key, base64Data);
        };

        // Helper to migrate Base64 string directly to IDB
        const migrateBase64ToIdb = async (base64: string, type: 'images' | 'audio', keySuffix: string): Promise<string> => {
            const key = `${projectData.id}_${keySuffix}`;
            // saveToIdb expects Base64, so we pass it directly
            return await saveToIdb(type, key, base64);
        };

        // 2. Restore Script Assets
        if (projectData.script) {
            for (let i = 0; i < projectData.script.length; i++) {
                const cut = projectData.script[i];
                const cutId = cut.id ?? i;

                // Final Image
                if (cut.finalImageUrl) {
                    if (cut.finalImageUrl.startsWith('data:')) {
                        cut.finalImageUrl = await migrateBase64ToIdb(cut.finalImageUrl, 'images', `cut_${cutId}_final`);
                    } else {
                        // Even if it starts with idb://, we try to see if ZIP has a fresher/actual file
                        // This allows manual "repair" of ZIPs by dropping files in
                        const newUrl = await restoreFile(cut.finalImageUrl);
                        if (newUrl) cut.finalImageUrl = newUrl;
                    }
                }

                // Draft Image
                if (cut.draftImageUrl) {
                    if (cut.draftImageUrl.startsWith('data:')) {
                        cut.draftImageUrl = await migrateBase64ToIdb(cut.draftImageUrl, 'images', `cut_${cutId}_draft`);
                    } else {
                        const newUrl = await restoreFile(cut.draftImageUrl);
                        if (newUrl) cut.draftImageUrl = newUrl;
                    }
                }

                // Audio
                if (cut.audioUrl) {
                    if (cut.audioUrl.startsWith('data:')) {
                        cut.audioUrl = await migrateBase64ToIdb(cut.audioUrl, 'audio', `cut_${cutId}_audio`);
                    } else if (!cut.audioUrl.startsWith('mock:')) {
                        const newUrl = await restoreFile(cut.audioUrl);
                        if (newUrl) cut.audioUrl = newUrl;
                    }
                }

                // SFX (New)
                if (cut.sfxUrl) {
                    console.log(`[ZipImport] Found SFX URL: ${cut.sfxUrl} for cut ${cutId}`);
                    if (cut.sfxUrl.startsWith('data:')) {
                        cut.sfxUrl = await migrateBase64ToIdb(cut.sfxUrl, 'audio', `cut_${cutId}_sfx`);
                    } else {
                        const newUrl = await restoreFile(cut.sfxUrl);
                        console.log(`[ZipImport] Restored SFX to: ${newUrl}`);
                        if (newUrl) cut.sfxUrl = newUrl;
                    }
                }

                // Step 4.5: Video Clips
                if (cut.videoUrl) {
                    console.log(`[ZipImport] Found Video URL: ${cut.videoUrl} for cut ${cutId}`);
                    if (cut.videoUrl.startsWith('data:')) {
                        cut.videoUrl = await migrateBase64ToIdb(cut.videoUrl, 'images', `cut_${cutId}_video`);
                    } else {
                        const newUrl = await restoreFile(cut.videoUrl);
                        console.log(`[ZipImport] Restored Video to: ${newUrl}`);
                        if (newUrl) cut.videoUrl = newUrl;
                    }
                }
            }
        }

        // 3. Restore Key Visuals / Asset Definitions
        if (projectData.assetDefinitions) {
            for (const asset of Object.values(projectData.assetDefinitions)) {
                const assetId = asset.id || 'unknown';
                console.log(`[ZipImport] Processing asset: ${asset.name} (${assetId}), type: ${asset.type}`);

                // Reference Image
                if (asset.referenceImage) {
                    if (asset.referenceImage.startsWith('data:')) {
                        asset.referenceImage = await migrateBase64ToIdb(asset.referenceImage, 'images', `asset_${assetId}_ref`);
                    } else {
                        // Always try to restore from ZIP (including idb:// URLs for repair)
                        const newUrl = await restoreFile(asset.referenceImage);
                        if (newUrl) {
                            console.log(`[ZipImport] ✅ Restored referenceImage for ${asset.name}`);
                            asset.referenceImage = newUrl;
                        } else {
                            console.warn(`[ZipImport] ❌ Could not restore referenceImage for ${asset.name}: ${asset.referenceImage}`);
                        }
                    }
                }

                // Draft Image
                if (asset.draftImage) {
                    if (asset.draftImage.startsWith('data:')) {
                        asset.draftImage = await migrateBase64ToIdb(asset.draftImage, 'images', `asset_${assetId}_draft`);
                    } else {
                        const newUrl = await restoreFile(asset.draftImage);
                        if (newUrl) {
                            console.log(`[ZipImport] ✅ Restored draftImage for ${asset.name}`);
                            asset.draftImage = newUrl;
                        }
                    }
                }

                // Master Image
                if (asset.masterImage) {
                    if (asset.masterImage.startsWith('data:')) {
                        asset.masterImage = await migrateBase64ToIdb(asset.masterImage, 'images', `asset_${assetId}_master`);
                    } else {
                        const newUrl = await restoreFile(asset.masterImage);
                        if (newUrl) {
                            console.log(`[ZipImport] ✅ Restored masterImage for ${asset.name}`);
                            asset.masterImage = newUrl;
                        } else {
                            console.warn(`[ZipImport] ❌ Could not restore masterImage for ${asset.name}: ${asset.masterImage}`);
                        }
                    }
                }
            }
        }

        // 4. Restore Thumbnail
        if (projectData.thumbnailUrl) {
            if (projectData.thumbnailUrl.startsWith('data:')) {
                projectData.thumbnailUrl = await migrateBase64ToIdb(projectData.thumbnailUrl, 'images', 'thumbnail');
            } else if (!projectData.thumbnailUrl.startsWith('idb://')) {
                const newUrl = await restoreFile(projectData.thumbnailUrl);
                if (newUrl) projectData.thumbnailUrl = newUrl;
            }
        }

        // 5. Restore Chat History Images (Common source of bloat)
        if (projectData.chatHistory) {
            for (let i = 0; i < projectData.chatHistory.length; i++) {
                const msg = projectData.chatHistory[i];
                if (msg.image && msg.image.startsWith('data:')) {
                    const newUrl = await migrateBase64ToIdb(msg.image, 'images', `chat_${i}_${Date.now()}`); // timestamp to ensure unique
                    msg.image = newUrl;
                }
            }
        }

        return projectData;

    } catch (e) {
        console.error("Failed to parse project zip:", e);
        return null;
    }
};

/**
 * Handles a generic ZIP import.
 * Detects if it's a single project or a bulk backup (multiple ZIPs).
 * Returns array of restored ProjectData objects.
 */
export const processImportZip = async (file: File): Promise<ProjectData[]> => {
    const zip = await JSZip.loadAsync(file);
    const importedProjects: ProjectData[] = [];

    // Check content strategy
    // 1. Is it a Master Backup? (Look for .zip files inside)
    const nestedZips = Object.keys(zip.files).filter(path => path.endsWith('.zip') && !path.startsWith('__MACOSX'));

    if (nestedZips.length > 0) {
        console.log(`[ZipImport] Detected Master Backup with ${nestedZips.length} nested files.`);

        for (const zipPath of nestedZips) {
            const innerZipBlob = await zip.file(zipPath)?.async("blob");
            if (innerZipBlob) {
                const project = await importProjectFromZip(innerZipBlob);
                if (project) {
                    importedProjects.push(project);
                }
            }
        }
    } else {
        // 2. Check if it's a single project
        const singleProject = await importProjectFromZip(file);
        if (singleProject) {
            importedProjects.push(singleProject);
        }
    }

    return importedProjects;
};
