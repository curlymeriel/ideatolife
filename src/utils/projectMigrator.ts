
import type { ProjectData } from '../store/types';
import { saveToIdb } from './imageStorage';

export interface MigrationResult {
    success: boolean;
    migratedCount: number;
    errors: string[];
    newSize: number;
    oldSize: number;
}

/**
 * Migrate a single project's assets to IndexedDB
 */
export async function migrateProject(project: ProjectData): Promise<ProjectData> {
    const newProject = { ...project };
    // let scriptChanged = false;

    // 1. Migrate Script Images & Audio
    if (newProject.script && Array.isArray(newProject.script)) {
        newProject.script = await Promise.all(newProject.script.map(async (cut, index) => {
            const newCut = { ...cut };
            // let cutChanged = false;

            // Helper to migrate a single field
            const migrateField = async (field: 'finalImageUrl' | 'draftImageUrl' | 'audioUrl' | 'sfxUrl' | 'videoUrl', type: 'images' | 'audio' | 'video') => {
                const val = newCut[field];
                if (val && val.startsWith('data:')) {
                    try {
                        const id = `${project.id}-cut-${index}-${field}`;
                        const newUrl = await saveToIdb(type, id, val);
                        newCut[field] = newUrl;
                        // cutChanged = true;
                    } catch (e) {
                        console.error(`[Migrator] Failed to migrate ${field} for cut ${index}:`, e);
                    }
                }
            };

            await migrateField('finalImageUrl', 'images');
            await migrateField('draftImageUrl', 'images');
            await migrateField('audioUrl', 'audio');
            await migrateField('sfxUrl', 'audio');
            await migrateField('videoUrl', 'video');

            // if (cutChanged) scriptChanged = true;
            return newCut;
        }));
    }

    // 2. Migrate Asset Definitions (Character References)
    if (newProject.assetDefinitions) {
        // Deep copy
        const newAssetDefs = { ...newProject.assetDefinitions };
        let assetsChanged = false;

        for (const [key, def] of Object.entries(newAssetDefs)) {
            const newDef = { ...def };
            let defChanged = false;

            const migrateAssetParam = async (param: 'referenceImage' | 'masterImage' | 'draftImage') => {
                const val = newDef[param];
                if (val && val.startsWith('data:')) {
                    try {
                        const id = `${project.id}-asset-${key}-${param}`;
                        const newUrl = await saveToIdb('assets', id, val);
                        newDef[param] = newUrl;
                        defChanged = true;
                    } catch (e) {
                        console.error(`[Migrator] Failed to migrate asset ${key} ${param}:`, e);
                    }
                }
            };

            await migrateAssetParam('referenceImage');
            await migrateAssetParam('masterImage');
            await migrateAssetParam('draftImage');

            if (defChanged) {
                newAssetDefs[key] = newDef;
                assetsChanged = true;
            }
        }

        if (assetsChanged) {
            newProject.assetDefinitions = newAssetDefs;
        }
    }

    // 3. Migrate Master Style Reference
    if (newProject.masterStyle && newProject.masterStyle.referenceImage) {
        const val = newProject.masterStyle.referenceImage;
        if (val.startsWith('data:')) {
            try {
                const id = `${project.id}-master-style`;
                const newUrl = await saveToIdb('images', id, val);
                newProject.masterStyle = { ...newProject.masterStyle, referenceImage: newUrl };
            } catch (e) {
                console.error(`[Migrator] Failed to migrate master style:`, e);
            }
        }
    }

    return newProject;
}
