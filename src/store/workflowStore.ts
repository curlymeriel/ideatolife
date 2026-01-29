import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
// seriesUtils are imported dynamically in createProject for tree-shaking

// Import types and slices
import type { ProjectData, ProjectMetadata } from './types';
import { createProjectSlice, type ProjectSlice } from './projectSlice';
import { createIntelligenceSlice, type IntelligenceSlice } from './intelligenceSlice';
import { createUISlice, type UISlice } from './uiSlice';
import { saveToIdb, generateAudioKey, generateCutImageKey, generateAssetImageKey, resolveUrl, loadFromIdb, parseIdbUrl } from '../utils/imageStorage';
import { selectLocalFolder, saveFileToHandle, readFilesFromDirectory, verifyPermission, requestPermission, getSubFolder, deleteFileFromHandle, deleteDirectoryFromHandle, type LocalFolderHandle } from '../utils/localFileSystem';

// ====================
// Multi-Project Actions
// ====================

interface MultiProjectActions {
    // Project Management
    id: string;
    lastModified: number;
    createProject: (sourceSeries?: string) => Promise<void>;
    loadProject: (id: string) => Promise<void>;
    saveProject: () => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    duplicateProject: (id: string) => Promise<void>;
    deleteSeries: (seriesName: string) => Promise<void>;

    // Navigation
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;

    // Data Recovery
    restoreData: () => Promise<void>;
    recoverFromLocalStorage: () => Promise<void>;
    recoverOrphanedProjects: () => Promise<void>;
    importData: (jsonString: string) => void;
    importZip: (file: File) => Promise<void>;
    resetToDefault: () => void;

    // Prep Phase Data Management
    exportResearchData: () => Promise<void>;
    importResearchData: (jsonString: string) => Promise<void>;

    // Local Sync
    localFolder: LocalFolderHandle | null;
    localFolderPermission: 'prompt' | 'granted' | 'denied';
    isSyncingLibrary: boolean;
    connectLocalFolder: (profileName: string, isDirect?: boolean) => Promise<void>;
    requestLocalFolderPermission: () => Promise<boolean>;
    disconnectLocalFolder: () => void;
    forceSyncLibrary: () => Promise<void>;
}

// Combined Store Type
type WorkflowStore = ProjectSlice & IntelligenceSlice & UISlice & MultiProjectActions;

// ====================
// Storage Helpers
// ====================

const generateId = () => Math.random().toString(36).substring(2, 9);
const getProjectKey = (id: string) => `project-${id}`;

/**
 * Returns a clean, default state for a new project.
 * Used during 'New Series', 'New Episode', and 'Duplicate' to prevent cross-project state pollution.
 */
const getEmptyProjectState = (id: string, apiKeys: any = {}): ProjectData => ({
    id,
    lastModified: Date.now(),
    seriesName: 'New Series',
    episodeName: 'New Episode',
    episodeNumber: 1,
    seriesStory: '',
    mainCharacters: '',
    characters: [],
    seriesLocations: [],
    seriesProps: [],
    episodePlot: '',
    episodeCharacters: [],
    episodeLocations: [],
    episodeProps: [],
    storylineTable: [],
    targetDuration: 60,
    aspectRatio: '16:9',
    apiKeys: apiKeys,
    chatHistory: [],
    thumbnailUrl: null,
    thumbnailPreview: null,
    thumbnailSettings: {
        mode: 'framing',
        scale: 1,
        imagePosition: { x: 0, y: 0 },
        textPosition: { x: 0, y: 0 },
        titleSize: 60,
        seriesTitleSize: 36,
        textColor: '#ffffff',
        fontFamily: 'Inter',
        frameImage: ''
    },
    masterStyle: { description: '', referenceImage: null },
    styleAnchor: {
        referenceImage: null,
        prompts: { font: 'Inter, sans-serif', layout: 'Cinematic wide shot', color: 'Dark, high contrast, sand orange accents' }
    },
    assetDefinitions: {},
    script: [],
    ttsModel: 'neural2',
    imageModel: 'gemini-1.5-flash',
    assets: {},
    currentStep: 1,
});


// Debounce map to track pending saves per project
const pendingSaves = new Map<string, NodeJS.Timeout>();

// Cross-tab synchronization
const syncChannel = new BroadcastChannel('idea-lab-sync');

syncChannel.onmessage = (event) => {
    if (event.data.type === 'PROJECT_SAVED' || event.data.type === 'STORAGE_UPDATED') {
        console.log(`[Store] Remote storage update detected (${event.data.type}). Reloading...`);
        // We only want to reload if we are not currently saving to avoid loops
        const state = useWorkflowStore.getState();
        if (state.saveStatus === 'idle') {
            // Re-hydrate metadata list at minimum
            idbGet('idea-lab-storage').then(raw => {
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        const { savedProjects } = parsed.state || parsed;
                        if (savedProjects) {
                            useWorkflowStore.setState({ savedProjects });
                            console.log('[Store] Metadata synced from other tab.');
                        }
                    } catch (e) { }
                }
            });
        }
    }
};

const saveProjectToDisk = async (project: ProjectData) => {
    const projectId = project.id;

    // Clear existing timeout for this project
    if (pendingSaves.has(projectId)) {
        clearTimeout(pendingSaves.get(projectId));
    }

    // Set new timeout (debounce)
    const timeout = setTimeout(async () => {
        // Safety valve: If saving takes > 10s, force idle to prevent stuck UI
        const safetyTimer = setTimeout(() => {
            if (useWorkflowStore.getState().saveStatus === 'saving') {
                console.warn(`[Store] Save operation timed out for ${projectId}. Resetting UI.`);
                useWorkflowStore.getState().setSaveStatus('error');
                setTimeout(() => useWorkflowStore.getState().setSaveStatus('idle'), 2000);
            }
        }, 10000);

        try {
            useWorkflowStore.getState().setSaveStatus('saving'); // Start saving
            await idbSet(getProjectKey(projectId), project);
            console.log(`[Store] Saved project ${projectId} to disk (Throttle: 1000ms).`);

            // Broadcast the change to other tabs
            syncChannel.postMessage({ type: 'PROJECT_SAVED', projectId });

            useWorkflowStore.getState().setSaveStatus('saved'); // Finish saving

            // Reset to idle after 2 seconds
            setTimeout(() => {
                useWorkflowStore.getState().setSaveStatus('idle');
            }, 2000);

            pendingSaves.delete(projectId);
        } catch (e) {
            console.error(`[Store] Failed to save project ${projectId} to disk:`, e);
            useWorkflowStore.getState().setSaveStatus('error');
            setTimeout(() => useWorkflowStore.getState().setSaveStatus('idle'), 2000);
        } finally {
            clearTimeout(safetyTimer);
        }
    }, 1000); // 1 second coalescing window

    pendingSaves.set(projectId, timeout);
};


const loadProjectFromDisk = async (id: string): Promise<ProjectData | null> => {
    // const start = performance.now();
    const key = getProjectKey(id);
    try {
        // 1. Raw Load
        console.log(`[Store] Loading project from disk: ${key}`);
        let project = await idbGet<ProjectData>(key);

        if (!project) {
            console.error(`[Store] Critical: Project data NULL for key ${key}. Checking all keys...`);
            const keys = await idbKeys();
            console.log(`[Store] Available IDB keys:`, keys);
            return null;
        }

        console.log(`[Store] Project found. Size: ${JSON.stringify(project).length} chars. Checking for legacy data...`);

        // 2. JIT Migration (Fix OOM by stripping Base64 BEFORE it hits State)
        let wasMigrated = false;

        // Helper to process a single URL
        const migrateUrl = async (url: string | undefined | null, type: 'images' | 'audio' | 'assets', key: string): Promise<string | undefined | null> => {
            // Check for large Base64 (ignore existing idb:// or short strings)
            if (url && typeof url === 'string' && url.startsWith('data:') && url.length > 50000) { // > 50KB roughly
                try {
                    console.log(`[JIT] Migrating large ${type} (${Math.round(url.length / 1024)}KB)...`);
                    const idbUrl = await saveToIdb(type, key, url);
                    wasMigrated = true;
                    return idbUrl;
                } catch (e) {
                    console.error(`[JIT] Failed to migrate ${type} ${key}`, e);
                    return url; // Keep original if fail
                }
            }
            return url;
        };

        // A. Migrate Script (Audio & Images) - IN-PLACE MUTATION to minimize memory
        if (project.script && Array.isArray(project.script)) {
            const migrationStart = Date.now();
            const MAX_MIGRATION_TIME = 30000; // 30 seconds max per load

            for (let i = 0; i < project.script.length; i++) {
                // Yield to UI thread often AND check total time
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    if (Date.now() - migrationStart > MAX_MIGRATION_TIME) {
                        console.warn("[JIT] Time limit reached. Stripping remaining heavy data to prevent crash.");
                        // PANIC MODE: Iterate remaining items and NULLIFY any heavy/base64 data
                        // This ensures the object returned to React is lightweight, even if incomplete.
                        for (let j = i; j < project.script.length; j++) {
                            const c = project.script[j];
                            if (c.audioUrl?.startsWith('data:')) c.audioUrl = undefined;
                            if (c.finalImageUrl?.startsWith('data:')) c.finalImageUrl = undefined;
                            if (c.draftImageUrl?.startsWith('data:')) c.draftImageUrl = undefined;
                        }
                        wasMigrated = true; // FORCE SAVE the stripped version so next load is fast/clean
                        break;
                    }
                }

                const cut = project.script[i];
                const cutId = cut.id ?? i;

                // Process fields and MUTATE directly if changed
                // This prevents duplicating the object in memory
                const newAudio = await migrateUrl(cut.audioUrl, 'audio', generateAudioKey(project.id, cutId));
                if (newAudio !== cut.audioUrl && newAudio !== undefined) {
                    cut.audioUrl = newAudio ?? undefined;
                    wasMigrated = true;
                }

                const newFinal = await migrateUrl(cut.finalImageUrl, 'images', generateCutImageKey(project.id, cutId, 'final'));
                if (newFinal !== cut.finalImageUrl && newFinal !== undefined) {
                    cut.finalImageUrl = newFinal ?? undefined;
                    wasMigrated = true;
                }

                const newDraft = await migrateUrl(cut.draftImageUrl, 'images', generateCutImageKey(project.id, cutId, 'draft'));
                if (newDraft !== cut.draftImageUrl && newDraft !== undefined) {
                    cut.draftImageUrl = newDraft ?? undefined;
                    wasMigrated = true;
                }
            }
        }

        // B. Migrate Assets - IN-PLACE MUTATION
        if (project.assetDefinitions) {
            const entries = Object.entries(project.assetDefinitions);

            for (const [assetId, asset] of entries) {
                // @ts-ignore
                const newRef = await migrateUrl(asset.referenceImage, 'assets', generateAssetImageKey(project.id, assetId, 'ref'));
                // @ts-ignore
                if (newRef !== asset.referenceImage) {
                    // @ts-ignore
                    asset.referenceImage = newRef;
                    wasMigrated = true;
                }

                // @ts-ignore
                const newMaster = await migrateUrl(asset.masterImage, 'assets', generateAssetImageKey(project.id, assetId, 'master'));
                // @ts-ignore
                if (newMaster !== asset.masterImage) {
                    // @ts-ignore
                    asset.masterImage = newMaster;
                    wasMigrated = true;
                }

                // @ts-ignore
                const newDraft = await migrateUrl(asset.draftImage, 'assets', generateAssetImageKey(project.id, assetId, 'draft'));
                // @ts-ignore
                if (newDraft !== asset.draftImage) {
                    // @ts-ignore
                    asset.draftImage = newDraft;
                    wasMigrated = true;
                }
            }
        }

        // C. Migrate Master Style & Thumbnail
        if (project.masterStyle?.referenceImage) {
            const newRef = await migrateUrl(project.masterStyle.referenceImage, 'assets', `${project.id}-master-style-ref`);
            if (newRef !== project.masterStyle.referenceImage && newRef) {
                project.masterStyle.referenceImage = newRef;
                wasMigrated = true;
            }
        }

        if (project.thumbnailUrl) {
            const newThumb = await migrateUrl(project.thumbnailUrl, 'images', `${project.id}-thumbnail`);
            if (newThumb !== project.thumbnailUrl && newThumb) {
                project.thumbnailUrl = newThumb;
                wasMigrated = true;
            }
        }

        if (project.thumbnailSettings?.frameImage) {
            const newFrame = await migrateUrl(project.thumbnailSettings.frameImage, 'images', `${project.id}-thumbnail-frame`);
            if (newFrame !== project.thumbnailSettings.frameImage && newFrame) {
                project.thumbnailSettings.frameImage = newFrame;
                wasMigrated = true;
            }
        }

        // 3. Save Back if Modified (Permanent Fix)
        if (wasMigrated) {
            console.log(`[Store] JIT Migration completed for ${id}. Saving optimized version.`);
            await idbSet(getProjectKey(id), project);
        }

        return project;
    } catch (e) {
        console.error(`[Store] Failed to load project ${id} from disk:`, e);
        return null;
    }
};

const deleteProjectFromDisk = async (id: string) => {
    try {
        await idbDel(getProjectKey(id));
        console.log(`[Store] Deleted project ${id} from disk.`);
    } catch (e) {
        console.error(`[Store] Failed to delete project ${id} from disk:`, e);
    }
};

// ====================
// Custom Storage Adapter
// ====================

let saveTimeout: any;
let pendingResolve: (() => void) | null = null;
let storeApi: any = null;
let lastSavedValue: string | null = null;

const storage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        console.log(`[Store] Loading ${name} from storage...`);
        const value = await idbGet(name);
        if (value) {
            console.log(`[Store] Loaded ${name} from IndexedDB (Size: ${value.length} chars)`);
            lastSavedValue = value;
            return value;
        }

        // Fallback to localStorage for migration
        const localValue = localStorage.getItem(name);
        if (localValue) {
            console.log('[Store] Migrating data from localStorage to IndexedDB...');
            await idbSet(name, localValue);
            lastSavedValue = localValue;
            return localValue;
        }

        console.log(`[Store] No data found for ${name}`);
        return null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        if (value === lastSavedValue) return;
        lastSavedValue = value;

        if (storeApi) {
            const currentStatus = storeApi.getState().saveStatus;
            if (currentStatus !== 'saving') {
                storeApi.getState().setSaveStatus('saving');
            }
        }

        if (saveTimeout) {
            clearTimeout(saveTimeout);
            if (pendingResolve) {
                pendingResolve();
                pendingResolve = null;
            }
        }

        return new Promise((resolve) => {
            pendingResolve = resolve;
            saveTimeout = setTimeout(async () => {
                try {
                    // Direct write without "Read-Before-Write" to avoid lag on large stores
                    await idbSet(name, value);

                    // Broadcast global state update (savedProjects etc)
                    if (name === 'idea-lab-storage') {
                        syncChannel.postMessage({ type: 'STORAGE_UPDATED' });
                    }

                    if (storeApi) {
                        storeApi.getState().setSaveStatus('saved');
                        setTimeout(() => storeApi.getState().setSaveStatus('idle'), 2000);
                    }
                } catch (e) {
                    console.error(`[Store] Failed to save ${name}:`, e);
                    if (storeApi) {
                        storeApi.getState().setSaveStatus('error');
                        setTimeout(() => storeApi.getState().setSaveStatus('idle'), 3000);
                    }
                } finally {
                    if (pendingResolve) {
                        pendingResolve();
                        pendingResolve = null;
                    }
                }
            }, 500);
        });
    },
    removeItem: async (name: string): Promise<void> => {
        console.log(`[Store] Removing ${name} from storage`);
        await idbDel(name);
    },
};

/**
 * Helper to sync all project assets (images/audio) to a connected local folder
 */
async function syncProjectAssetsToPC(projectData: ProjectData, directoryHandle: FileSystemDirectoryHandle) {
    const assetsToSync: string[] = [];

    // 1. Collect all idb:// URLs
    // From script
    if (Array.isArray(projectData.script)) {
        projectData.script.forEach((cut: any) => {
            if (cut.finalImageUrl && cut.finalImageUrl.startsWith('idb://')) assetsToSync.push(cut.finalImageUrl);
            if (cut.draftImageUrl && cut.draftImageUrl.startsWith('idb://')) assetsToSync.push(cut.draftImageUrl);
            if (cut.audioUrl && cut.audioUrl.startsWith('idb://')) assetsToSync.push(cut.audioUrl);
            if (cut.userReferenceImage && cut.userReferenceImage.startsWith('idb://')) assetsToSync.push(cut.userReferenceImage);
        });
    }

    // From assetDefinitions
    if (projectData.assetDefinitions) {
        Object.values(projectData.assetDefinitions).forEach((asset: any) => {
            if (asset.referenceImage && asset.referenceImage.startsWith('idb://')) assetsToSync.push(asset.referenceImage);
            if (asset.masterImage && asset.masterImage.startsWith('idb://')) assetsToSync.push(asset.masterImage);
            if (asset.draftImage && asset.draftImage.startsWith('idb://')) assetsToSync.push(asset.draftImage);
        });
    }

    // From masterStyle
    if (projectData.masterStyle?.referenceImage && projectData.masterStyle.referenceImage.startsWith('idb://')) {
        assetsToSync.push(projectData.masterStyle.referenceImage);
    }

    // From thumbnailUrl
    if (projectData.thumbnailUrl && projectData.thumbnailUrl.startsWith('idb://')) {
        assetsToSync.push(projectData.thumbnailUrl);
    }

    // Deduplicate
    const uniqueAssets = Array.from(new Set(assetsToSync));
    if (uniqueAssets.length === 0) return;

    console.log(`[LocalSync] Deep scanning ${uniqueAssets.length} assets for PC sync...`);

    // 2. Resolve and save each asset
    for (const idbUrl of uniqueAssets) {
        try {
            const parsed = parseIdbUrl(idbUrl);
            if (!parsed) continue;

            const binaryData = await loadFromIdb(idbUrl);
            if (!binaryData) {
                console.warn(`[LocalSync] Asset data not found in IndexedDB: ${idbUrl}`);
                continue;
            }

            // Determine file extension
            let ext = '';
            if (parsed.type === 'images' || parsed.type === 'assets') ext = '.jpg';
            else if (parsed.type === 'audio') ext = '.mp3';
            else if (parsed.type === 'video') ext = '.mp4';

            // Clean up key for filename
            const safeKey = parsed.key.replace(/[/\\?%*:|"<>]/g, '-');
            const fileName = `${safeKey}${ext}`;

            await saveFileToHandle(directoryHandle, ['assets', parsed.type, fileName], binaryData);
        } catch (e) {
            console.error(`[LocalSync] Failed to sync asset ${idbUrl}:`, e);
        }
    }
}

/**
 * Sync global research data (intelligence layer) to PC
 */
async function syncIntelligenceLayerToPC(state: any, directoryHandle: FileSystemDirectoryHandle) {
    try {
        const intelligenceData = {
            trendSnapshots: state.trendSnapshots || {},
            competitorSnapshots: state.competitorSnapshots || {},
            strategyInsights: state.strategyInsights || {},
            ideaPool: state.ideaPool || [],
            lastModified: Date.now()
        };

        await saveFileToHandle(
            directoryHandle,
            ['global-research.json'],
            JSON.stringify(intelligenceData, null, 2)
        );
        console.log("[LocalSync] Synced global-research.json to PC");
    } catch (e) {
        console.error("[LocalSync] Failed to sync intelligence layer:", e);
    }
}

/**
 * Sync EVERY project and its assets to PC (Full Library Backup)
 */
async function syncAllToPC(state: any, directoryHandle: FileSystemDirectoryHandle) {
    console.log("[LocalSync] Deep library sync started...");

    // 1. Sync Intelligence Layer
    await syncIntelligenceLayerToPC(state, directoryHandle);

    // 2. Scan IndexedDB for ALL project-* keys (not just savedProjects metadata)
    //    This ensures orphaned projects are also synced!
    const allIdbKeys = await idbKeys();
    const projectKeys = (allIdbKeys as string[]).filter(
        (key: string) => typeof key === 'string' && key.startsWith('project-')
    );

    console.log(`[LocalSync] Found ${projectKeys.length} projects in IndexedDB (including orphaned):`, projectKeys);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const idbKey of projectKeys) {
        try {
            const projectData = await idbGet(idbKey);
            if (!projectData) {
                console.warn(`[LocalSync] SKIP: Key ${idbKey} exists but data is empty/null!`);
                skippedCount++;
                continue;
            }

            // Extract projectId from key (format: "project-{id}")
            const projectId = idbKey.replace('project-', '');

            // Sync JSON
            const fileName = `project-${projectId}.json`;
            await saveFileToHandle(
                directoryHandle,
                ['projects', fileName],
                JSON.stringify(projectData, null, 2)
            );
            console.log(`[LocalSync] Synced project: ${projectId} -> ${fileName}`);
            syncedCount++;

            // Sync Assets
            await syncProjectAssetsToPC(projectData, directoryHandle);

        } catch (e) {
            console.error(`[LocalSync] Failed to sync project ${idbKey} in full sync:`, e);
        }
    }

    console.log(`[LocalSync] Full library sync complete. Synced: ${syncedCount}, Skipped: ${skippedCount}`);
}

/**
 * Helper to scan and restore projects/assets from a connected local folder
 */
async function restoreFromLocalFolder(directoryHandle: FileSystemDirectoryHandle) {
    try {
        console.log("[LocalSync] Starting restore scan...");
        const files = await readFilesFromDirectory(directoryHandle);

        // 0. Process Global Research
        const globalFile = files.find(f => f.name === 'global-research.json');
        if (globalFile) {
            try {
                const text = await globalFile.file.text();
                const globalData = JSON.parse(text);
                // We DON'T auto-overwrite global DB here to avoid wiping current session
                // But we can merge it if needed. For now, let's at least log it found.
                console.log("[LocalSync] Found global-research.json in folder.");
                // Implementation note: Usually it's better to let the user decide to import research.
                // However, for "instant recovery" on a new PC, we might want to merge it.
                useWorkflowStore.setState((state: any) => ({
                    trendSnapshots: { ...state.trendSnapshots, ...(globalData.trendSnapshots || {}) },
                    competitorSnapshots: { ...state.competitorSnapshots, ...(globalData.competitorSnapshots || {}) },
                    strategyInsights: { ...state.strategyInsights, ...(globalData.strategyInsights || {}) },
                    ideaPool: [...state.ideaPool, ...(globalData.ideaPool || []).filter((newItem: any) => !state.ideaPool.some((oldItem: any) => oldItem.id === newItem.id))]
                }));
            } catch (e) {
                console.error("[LocalSync] Failed to restore global research:", e);
            }
        }

        // 1. Process Projects
        const projectFiles = files.filter(f => f.path[0] === 'projects' && f.name.endsWith('.json'));
        console.log(`[LocalSync] Found ${projectFiles.length} project files.`);

        const restoredProjects: Record<string, ProjectMetadata> = {};

        for (const pFile of projectFiles) {
            try {
                const text = await pFile.file.text();
                const projectData = JSON.parse(text);
                if (projectData.id) {
                    await idbSet(`project-${projectData.id}`, projectData);

                    // Construct metadata
                    restoredProjects[projectData.id] = {
                        id: projectData.id,
                        seriesName: projectData.seriesName || 'Untitled Series',
                        episodeName: projectData.episodeName || 'Untitled',
                        episodeNumber: projectData.episodeNumber || 1,
                        lastModified: projectData.lastModified || Date.now(),
                        thumbnailUrl: projectData.thumbnailUrl || null,
                        currentStep: projectData.currentStep,
                        cachedProgress: {
                            workflowPercent: 0,
                            scriptConfirmed: 0,
                            scriptLength: projectData.script?.length || 0,
                            assetsDefined: 0,
                            assetsTotal: projectData.script?.length || 0,
                            completedStepsCount: projectData.currentStep
                        }
                    };

                    console.log(`[LocalSync] Restored project metadata: ${projectData.id}`);
                }
            } catch (e) {
                console.error(`[LocalSync] Failed to parse project file ${pFile.name}:`, e);
            }
        }

        // 1.5 Update Store Metadata (Critical for UI)
        if (Object.keys(restoredProjects).length > 0) {
            useWorkflowStore.setState((state: any) => ({
                savedProjects: { ...state.savedProjects, ...restoredProjects }
            }));
            console.log(`[LocalSync] Merged ${Object.keys(restoredProjects).length} projects into Dashboard.`);
        }

        // 2. Process Assets
        const assetFiles = files.filter(f => f.path[0] === 'assets');
        console.log(`[LocalSync] Found ${assetFiles.length} potential asset files.`);

        for (const aFile of assetFiles) {
            try {
                // path is ['assets', 'images', 'fileName.jpg']
                const type = aFile.path[1] as any;
                if (!['images', 'assets', 'audio', 'video'].includes(type)) continue;

                // key is fileName without extension
                const key = aFile.name.split('.')[0];

                // Save to IDB if not already there (or overwrite to ensure sync)
                await saveToIdb(type, key, aFile.file);
                // No need to log every asset, can be hundreds
            } catch (e) {
                console.error(`[LocalSync] Failed to restore asset ${aFile.name}:`, e);
            }
        }

        console.log("[LocalSync] Restore complete.");
        syncChannel.postMessage({ type: 'STORAGE_UPDATED' }); // Trigger UI refresh

    } catch (error) {
        console.error("[LocalSync] Restore failed:", error);
    }
}

// ====================
// Store Creation
// ====================

export const useWorkflowStore = create<WorkflowStore>()(
    persist(
        (set, get) => ({
            // Combine slices
            ...createProjectSlice(set as any, get as any, storeApi as any),
            ...createIntelligenceSlice(set as any, get as any, storeApi as any),
            ...createUISlice(set as any, get as any, storeApi as any),

            // Project metadata
            id: 'default-project',
            lastModified: Date.now(),
            localFolder: null,
            localFolderPermission: 'prompt',
            isSyncingLibrary: false,

            connectLocalFolder: async (profileName: string, isDirect: boolean = false) => {
                const folder = await selectLocalFolder();
                if (folder) {
                    let subHandle: FileSystemDirectoryHandle;
                    let displayName: string;

                    if (isDirect) {
                        // Use root folder directly
                        subHandle = folder.handle;
                        displayName = `Direct: ${folder.name}`;
                    } else {
                        // Create/Get Subfolder for Profile
                        subHandle = await getSubFolder(folder.handle, profileName);
                        displayName = `${folder.name}/${profileName}`;
                    }

                    const profileFolder: LocalFolderHandle = {
                        handle: subHandle,
                        name: displayName
                    };

                    set({ localFolder: profileFolder, localFolderPermission: 'granted' });

                    // CRITICAL: Save handle to IDB because persist middleware can't serialize it to JSON
                    // We save the sub-handle as the main handle for the app to use transparently
                    await idbSet('local-folder-handle', profileFolder);

                    // NEW: SYNC & RESTORE
                    await restoreFromLocalFolder(subHandle);
                    await syncAllToPC(get(), subHandle);
                }
            },
            requestLocalFolderPermission: async () => {
                const { localFolder } = get();
                if (!localFolder?.handle) return false;
                const granted = await requestPermission(localFolder.handle, 'readwrite');
                set({ localFolderPermission: granted ? 'granted' : 'denied' });
                return granted;
            },
            disconnectLocalFolder: async () => {
                set({ localFolder: null });
                await idbDel('local-folder-handle');
            },
            forceSyncLibrary: async () => {
                const { localFolder } = get();
                if (localFolder?.handle) {
                    set({ isSyncingLibrary: true });
                    try {
                        await syncAllToPC(get(), localFolder.handle);
                        console.log("[LocalSync] Manual library sync success.");
                    } finally {
                        set({ isSyncingLibrary: false });
                    }
                } else {
                    console.error("[LocalSync] Cannot sync: No folder connected.");
                }
            },

            // Wrap project actions to trigger save
            setProjectInfo: (info) => {
                set((state) => ({ ...state, ...info }));
                get().saveProject();
            },
            setApiKeys: (keys) => {
                set((state: any) => ({ apiKeys: { ...state.apiKeys, ...keys } }));
                get().saveProject(); // Ensure keys are persisted immediately
            },
            setChatHistory: (history) => {
                set({ chatHistory: history });
            },
            setProductionChatHistory: (history) => {
                set({ productionChatHistory: history });
            },
            setThumbnail: (url) => {
                set({ thumbnailUrl: url });
                get().saveProject();
            },
            setThumbnailSettings: (settings) => {
                set((state: any) => ({ thumbnailSettings: { ...state.thumbnailSettings, ...settings } }));
                get().saveProject();
            },
            setMasterStyle: (style) => {
                set((state: any) => ({ masterStyle: { ...state.masterStyle, ...style } }));
                get().saveProject();
            },
            setStyleAnchor: (style) => {
                set((state: any) => ({ styleAnchor: { ...state.styleAnchor, ...style } }));
                get().saveProject();
            },
            setScript: (script) => {
                set({ script });
                get().saveProject();
            },
            setTtsModel: (model) => {
                set({ ttsModel: model });
                get().saveProject();
            },
            setImageModel: (model) => {
                set({ imageModel: model });
                get().saveProject();
            },
            setAssets: (assets) => {
                set({ assets });
                get().saveProject();
            },
            updateAsset: (cutId, asset) => {
                set((state: any) => ({
                    assets: {
                        ...state.assets,
                        [cutId]: { ...state.assets[cutId], ...asset }
                    }
                }));
                get().saveProject();
            },
            setStep: (step) => {
                set({ currentStep: step });
            },
            nextStep: () => {
                set((state: any) => ({ currentStep: Math.min(state.currentStep + 1, 6) }));
            },
            prevStep: () => {
                set((state: any) => ({ currentStep: Math.max(state.currentStep - 1, 1) }));
            },

            // OVERRIDE Intelligence Actions for PC Sync
            saveTrendSnapshot: (snapshot) => {
                set((state: any) => ({
                    trendSnapshots: { ...state.trendSnapshots, [snapshot.id]: snapshot }
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            deleteTrendSnapshot: (id) => {
                set((state: any) => {
                    const { [id]: deleted, ...rest } = state.trendSnapshots;
                    return { trendSnapshots: rest };
                });
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            saveCompetitorSnapshot: (snapshot) => {
                set((state: any) => ({
                    competitorSnapshots: { ...state.competitorSnapshots, [snapshot.id]: snapshot }
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            deleteCompetitorSnapshot: (id) => {
                set((state: any) => {
                    const { [id]: deleted, ...rest } = state.competitorSnapshots;
                    return { competitorSnapshots: rest };
                });
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            saveStrategyInsight: (insight) => {
                set((state: any) => ({
                    strategyInsights: { ...state.strategyInsights, [insight.id]: insight }
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            deleteStrategyInsight: (id) => {
                set((state: any) => {
                    const { [id]: deleted, ...rest } = state.strategyInsights;
                    return { strategyInsights: rest };
                });
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            addIdeaToPool: (idea) => {
                set((state: any) => ({
                    ideaPool: [...state.ideaPool, idea]
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            updateIdeaStatus: (id, status) => {
                set((state: any) => ({
                    ideaPool: state.ideaPool.map((i: any) => i.id === id ? { ...i, status } : i)
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },
            deleteIdeaFromPool: (id) => {
                set((state: any) => ({
                    ideaPool: state.ideaPool.filter((i: any) => i.id !== id)
                }));
                const { localFolder } = get();
                if (localFolder?.handle) syncIntelligenceLayerToPC(get(), localFolder.handle);
            },

            // Multi-project Actions
            saveProject: async () => {
                const state = get() as any;
                const projectId = state.id;

                // SAFETY CHECK 1: Validate project ID exists and is not the default volatile ID
                if (!projectId || projectId === 'default-project') {
                    console.log('[Store] Skipping save: No project ID set or is default-project');
                    return;
                }

                // OPTIMIZATION: Skip disk read if memory state appears valid
                // We only load from disk if we suspect data loss (empty script) or need metadata
                let existingData: ProjectData | null = null;
                const hasScript = Array.isArray(state.script) && state.script.length > 0;

                if (!hasScript) {
                    // Only check disk if memory script is empty, to prevent overwriting with empty data
                    // if the load failed or state is partial
                    console.log(`[Store] Memory script empty for ${projectId}, checking disk preservation...`);
                    existingData = await loadProjectFromDisk(projectId);
                }

                // SAFETY CHECK 2: Verify episodeName/seriesName consistency with existing data
                if (existingData && existingData.episodeName && state.episodeName) {
                    if (existingData.episodeName !== state.episodeName) {
                        console.warn(`[Store] ⚠️ Episode name mismatch detected!`);
                    }
                }

                // Merge script: preserve existing URLs and confirmed flags if current state has null/false
                // ONLY if we actually loaded existingData
                // IMPORTANT: Match by cut.id, NOT by array index, to prevent data corruption after cut deletion
                let mergedScript = state.script;
                if (existingData?.script && Array.isArray(state.script)) {
                    // Build a lookup map from existing disk data by cut.id for O(1) access
                    const existingCutMap = new Map<number, any>();
                    existingData.script.forEach((cut: any) => {
                        if (cut && cut.id !== undefined) {
                            existingCutMap.set(cut.id, cut);
                        }
                    });

                    mergedScript = state.script.map((cut: any) => {
                        const existingCut = existingCutMap.get(cut.id);
                        if (!existingCut) return cut;
                        return {
                            ...cut,
                            // Preserve URLs if current is null but existing has value
                            finalImageUrl: cut.finalImageUrl || existingCut.finalImageUrl,
                            draftImageUrl: cut.draftImageUrl || existingCut.draftImageUrl,
                            audioUrl: cut.audioUrl || existingCut.audioUrl,
                            // Preserve confirmed flags if existing has true but current has false/undefined
                            isImageConfirmed: cut.isImageConfirmed || existingCut.isImageConfirmed,
                            isAudioConfirmed: cut.isAudioConfirmed || existingCut.isAudioConfirmed,
                        };
                    });
                }

                // Merge assetDefinitions: preserve image URLs
                let mergedAssetDefs = state.assetDefinitions;
                if (existingData?.assetDefinitions && state.assetDefinitions) {
                    mergedAssetDefs = { ...state.assetDefinitions };
                    Object.keys(mergedAssetDefs).forEach(key => {
                        const existing = existingData?.assetDefinitions?.[key];
                        if (existing) {
                            mergedAssetDefs[key] = {
                                ...mergedAssetDefs[key],
                                referenceImage: mergedAssetDefs[key]?.referenceImage || existing.referenceImage,
                                masterImage: mergedAssetDefs[key]?.masterImage || existing.masterImage,
                                draftImage: mergedAssetDefs[key]?.draftImage || existing.draftImage,
                            };
                        }
                    });
                }

                const projectData: ProjectData = {
                    id: state.id,
                    lastModified: Date.now(),
                    seriesName: state.seriesName,
                    episodeName: state.episodeName,
                    episodeNumber: state.episodeNumber,
                    seriesStory: state.seriesStory,
                    mainCharacters: state.mainCharacters,
                    characters: state.characters,
                    seriesLocations: state.seriesLocations,
                    seriesProps: state.seriesProps,
                    episodePlot: state.episodePlot,
                    episodeCharacters: state.episodeCharacters,
                    episodeLocations: state.episodeLocations,
                    episodeProps: state.episodeProps,
                    storylineTable: state.storylineTable || [],
                    targetDuration: state.targetDuration,
                    aspectRatio: state.aspectRatio,
                    apiKeys: state.apiKeys,
                    chatHistory: state.chatHistory,
                    productionChatHistory: state.productionChatHistory,
                    masterStyle: state.masterStyle?.referenceImage
                        ? state.masterStyle
                        : { ...state.masterStyle, referenceImage: existingData?.masterStyle?.referenceImage || state.masterStyle?.referenceImage },
                    styleAnchor: state.styleAnchor,
                    assetDefinitions: mergedAssetDefs,
                    thumbnailUrl: state.thumbnailUrl || (existingData?.thumbnailUrl),
                    thumbnailPreview: state.thumbnailPreview,
                    thumbnailSettings: state.thumbnailSettings,
                    script: mergedScript,
                    ttsModel: state.ttsModel,
                    imageModel: state.imageModel,
                    assets: state.assets,
                    currentStep: state.currentStep,
                };

                await saveProjectToDisk(projectData);

                // LOCAL SYNC: Save to PC if folder is connected and permitted
                if (state.localFolder?.handle && state.localFolderPermission === 'granted') {
                    try {
                        const fileName = `project-${projectId}.json`;
                        await saveFileToHandle(
                            state.localFolder.handle,
                            ['projects', fileName],
                            JSON.stringify(projectData, null, 2)
                        );
                        console.log(`[LocalSync] Synced ${fileName} to PC`);

                        // NEW: LIVE ASSET SYNC
                        // We also sync binary assets (images, audio) to the local folder
                        await syncProjectAssetsToPC(projectData, state.localFolder.handle);

                    } catch (e) {
                        console.error("[LocalSync] Failed to sync to local folder:", e);
                    }
                }


                // Calculate progress for metadata cache (same logic as MainLayout/Dashboard)
                const safeScript = Array.isArray(state.script) ? state.script : [];
                const safeCharacters = Array.isArray(state.characters) ? state.characters : [];
                const safeEpisodeCharacters = Array.isArray(state.episodeCharacters) ? state.episodeCharacters : [];
                const safeSeriesLocations = Array.isArray(state.seriesLocations) ? state.seriesLocations : [];
                const safeSeriesProps = Array.isArray(state.seriesProps) ? state.seriesProps : [];
                const safeEpisodeLocations = Array.isArray(state.episodeLocations) ? state.episodeLocations : [];
                const safeEpisodeProps = Array.isArray(state.episodeProps) ? state.episodeProps : [];
                const safeAssetDefinitions = state.assetDefinitions || {};

                const isDefined = (id: string) => !!safeAssetDefinitions[id];
                const safeMasterStyle = state.masterStyle || { description: '' };

                // Assets progress
                const allAssetIds = [
                    ...safeCharacters.map((c: any) => c.id),
                    ...safeEpisodeCharacters.map((c: any) => c.id),
                    ...safeSeriesLocations.map((l: any) => l.id),
                    ...safeSeriesProps.map((p: any) => p.id),
                    ...safeEpisodeLocations.map((l: any) => l.id),
                    ...safeEpisodeProps.map((p: any) => p.id)
                ].filter((id, i, arr) => arr.indexOf(id) === i);
                const definedAssets = allAssetIds.filter(id => isDefined(id));

                // Step completion checks (Unified with MainLayout)
                const step1 = !!(state.seriesName && state.episodeName && state.episodePlot);
                const step2 = !!safeMasterStyle.description &&
                    allAssetIds.length > 0 &&
                    allAssetIds.every(id => isDefined(id));
                const step3 = safeScript.length > 0 && safeScript.every((cut: any) =>
                    (cut.isImageConfirmed && cut.finalImageUrl) &&
                    (cut.isAudioConfirmed && (cut.audioUrl || cut.speaker === 'SILENT'))
                );
                const step4 = step3;
                const step4_5 = safeScript.length > 0 && safeScript.every((cut: any) => cut.isVideoConfirmed);
                const step5 = !!state.thumbnailUrl;
                const step6 = step3 && step4_5 && step5;

                const completedSteps = [step1, step2, step3, step4, step4_5, step5, step6].filter(Boolean).length;
                const totalSteps = 7;

                // Script progress
                const scriptConfirmed = safeScript.filter((c: any) =>
                    c.isImageConfirmed &&
                    c.isAudioConfirmed &&
                    (c.audioUrl || c.speaker === 'SILENT')
                ).length;

                const metadata: ProjectMetadata = {
                    id: projectData.id,
                    seriesName: projectData.seriesName,
                    episodeName: projectData.episodeName,
                    episodeNumber: projectData.episodeNumber,
                    lastModified: projectData.lastModified,
                    thumbnailUrl: projectData.thumbnailUrl,
                    cachedProgress: {
                        workflowPercent: Math.round((completedSteps / totalSteps) * 100),
                        scriptLength: safeScript.length,
                        scriptConfirmed: scriptConfirmed,
                        assetsTotal: allAssetIds.length,
                        assetsDefined: definedAssets.length,
                        completedStepsCount: completedSteps,
                    },
                    storylineTable: projectData.storylineTable, // Sync to metadata
                    currentStep: projectData.currentStep
                };

                set((state: any) => ({
                    savedProjects: {
                        ...state.savedProjects,
                        [state.id]: metadata
                    },
                    lastModified: Date.now()
                }));
            },

            // ====================
            // Global Data Management (Phase 1-4)
            // ====================
            exportResearchData: async () => {
                const state = get() as any;
                const insights = { ...state.strategyInsights };

                // Resolve Channel Art to Base64 for backup portability
                const strategyIds = Object.keys(insights);
                for (const id of strategyIds) {
                    const insight = insights[id];
                    if (insight.channelIdentity) {
                        const identity = { ...insight.channelIdentity };
                        if (identity.bannerUrl && identity.bannerUrl.startsWith('idb://')) {
                            identity.bannerUrl = await resolveUrl(identity.bannerUrl);
                        }
                        if (identity.profileUrl && identity.profileUrl.startsWith('idb://')) {
                            identity.profileUrl = await resolveUrl(identity.profileUrl);
                        }
                        insights[id] = { ...insight, channelIdentity: identity };
                    }
                }

                const researchData = {
                    version: 2, // Increment version for asset support
                    exportedAt: Date.now(),
                    trendSnapshots: state.trendSnapshots,
                    competitorSnapshots: state.competitorSnapshots,
                    strategyInsights: insights,
                    ideaPool: state.ideaPool
                };

                const blob = new Blob([JSON.stringify(researchData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `research_backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            },

            importResearchData: async (jsonString: string) => {
                try {
                    const data = JSON.parse(jsonString);
                    if (!data.trendSnapshots && !data.strategyInsights) {
                        throw new Error('Invalid research data format');
                    }

                    const insights = { ...data.strategyInsights };
                    const strategyIds = Object.keys(insights);

                    // Restore Base64 assets to IndexedDB
                    for (const id of strategyIds) {
                        const insight = insights[id];
                        if (insight.channelIdentity) {
                            const identity = { ...insight.channelIdentity };

                            if (identity.bannerUrl && identity.bannerUrl.startsWith('data:image')) {
                                identity.bannerUrl = await saveToIdb('assets', `identity-${id}-banner`, identity.bannerUrl);
                            }
                            if (identity.profileUrl && identity.profileUrl.startsWith('data:image')) {
                                identity.profileUrl = await saveToIdb('assets', `identity-${id}-profile`, identity.profileUrl);
                            }
                            insights[id] = { ...insight, channelIdentity: identity };
                        }
                    }

                    set((state: any) => ({
                        trendSnapshots: { ...state.trendSnapshots, ...data.trendSnapshots },
                        competitorSnapshots: { ...state.competitorSnapshots, ...data.competitorSnapshots },
                        strategyInsights: { ...state.strategyInsights, ...insights },
                        ideaPool: [...state.ideaPool, ...(data.ideaPool || [])]
                    }));

                    syncChannel.postMessage({ type: 'STORAGE_UPDATED' });

                    alert(`Research data imported successfully.\nSnapshots: ${Object.keys(data.trendSnapshots || {}).length}\nStrategies: ${Object.keys(data.strategyInsights || {}).length}`);

                } catch (e) {
                    console.error('Failed to import research data:', e);
                    alert('Failed to import research data. Invalid file format.');
                }
            },

            createProject: async (sourceSeries?: string) => {
                await get().saveProject();
                const newId = generateId();
                const state = get() as any;

                // Base template for new project - ensures a clean slate
                const newProject = getEmptyProjectState(newId, state.apiKeys);

                // If sourceSeries is provided, inherit series-level data
                if (sourceSeries) {
                    const { getLatestProjectBySeries, extractSeriesData, getNextEpisodeNumber } = await import('../utils/seriesUtils');
                    const sourceProject = await getLatestProjectBySeries(sourceSeries);

                    if (sourceProject) {
                        console.log(`[Store] Inheriting series data from "${sourceSeries}"`);
                        const seriesData = extractSeriesData(sourceProject);
                        const nextEpisodeNum = await getNextEpisodeNumber(sourceSeries);

                        Object.assign(newProject, {
                            ...seriesData,
                            episodeNumber: nextEpisodeNum,
                            episodeName: `Episode ${nextEpisodeNum}`,
                            episodePlot: '',
                            episodeCharacters: [],
                            episodeLocations: [],
                            episodeProps: [],
                            storylineTable: [],
                            script: [],
                            assets: {},
                            thumbnailUrl: null,
                            thumbnailSettings: {
                                ...newProject.thumbnailSettings,
                                ...seriesData.thumbnailSettings
                            }
                        });
                    }
                }

                await saveProjectToDisk(newProject);

                const metadata: ProjectMetadata = {
                    id: newProject.id,
                    seriesName: newProject.seriesName,
                    episodeName: newProject.episodeName,
                    episodeNumber: newProject.episodeNumber,
                    lastModified: newProject.lastModified,
                    thumbnailUrl: newProject.thumbnailUrl,
                    storylineTable: [],
                };

                set({
                    ...newProject,
                    savedProjects: {
                        ...state.savedProjects,
                        [newId]: metadata
                    }
                } as any);
            },

            loadProject: async (id: string) => {
                // Optimize: prevent redundant save if loading the same project (or no project)
                // Actually, loading a new project means we should save the OLD one.
                const state = get() as any;
                if (state.id && state.script && state.script.length > 0) {
                    await get().saveProject();
                } else {
                    console.log('[Store] Skipping save before load (empty/default project)');
                }

                console.log(`[Store] Loading project ${id}...`);
                const projectData = await loadProjectFromDisk(id);

                if (projectData) {
                    // IMPORTANT: Preserve savedProjects when loading a project
                    // Otherwise, the entire savedProjects list gets overwritten
                    const currentState = get() as any;
                    const preservedSavedProjects = currentState.savedProjects || {};

                    // Log what we're loading for debugging
                    console.log(`[Store] Loaded project data:`, {
                        id: projectData.id,
                        seriesName: projectData.seriesName,
                        episodeName: projectData.episodeName,
                        scriptCuts: projectData.script?.length || 0,
                        firstDialogue: projectData.script?.[0]?.dialogue?.substring(0, 40) + '...'
                    });

                    // Start with an empty state to ensure no leftovers from previously loaded project
                    const baseState = getEmptyProjectState(id, projectData.apiKeys || currentState.apiKeys);

                    set({
                        ...baseState, // Overwrite with clean template
                        ...projectData, // Then apply loaded project data
                        storylineTable: projectData.storylineTable || [], // Ensure table is cleared if missing in saved data
                        savedProjects: preservedSavedProjects, // Keep existing savedProjects dashboard list
                    } as any);

                    // Auto-cleanup leaky or orphaned data immediately after load
                    get().cleanupOrphanedAssets();

                    console.log(`[Store] Project ${id} loaded successfully. State fully replaced and cleaned.`);
                } else {
                    console.error(`[Store] Project ${id} not found on disk.`);
                    alert("Failed to load project data. It may be missing or corrupted.");
                }
            },

            deleteProject: async (id: string) => {
                const state = get() as any;
                const { [id]: deleted, ...remainingProjects } = state.savedProjects;

                // Update store state for savedProjects
                set({ savedProjects: remainingProjects });

                // Remove from IndexedDB
                await deleteProjectFromDisk(id);

                // LOCAL SYNC: Delete from PC if connected
                if (state.localFolder?.handle && state.localFolderPermission === 'granted') {
                    try {
                        await deleteFileFromHandle(state.localFolder.handle, ['projects', `project-${id}.json`]);
                        await deleteDirectoryFromHandle(state.localFolder.handle, ['assets', `project-${id}`]);
                        console.log(`[LocalSync] Deleted project files for ${id} from PC.`);
                    } catch (e) {
                        console.warn(`[LocalSync] Failed to delete local files for ${id}:`, e);
                    }
                }

                // CRITICAL: If we just deleted the ACTIVE project, we must reset the in-memory state.
                // Otherwise, the heavy data (script, assets) remains in the store and gets 
                // persisted to 'idea-lab-storage', effectively keeping the project alive in a "zombie" state.
                if (state.id === id) {
                    console.log(`[Store] Deleted active project ${id}. Resetting state to default.`);
                    get().resetToDefault();
                }

                console.log(`[Store] Deleted project ${id}`);
            },

            duplicateProject: async (originalId: string) => {
                const state = get() as any;
                console.log(`[Store] Duplicating project ${originalId}...`);

                // 1. Load original project data
                // Try from memory first if it's the active project
                let projectToClone: ProjectData | null = null;
                if (state.id === originalId) {
                    // Deep copy state to strip functions/actions and ensure clean data
                    // We must filter out the store actions (createProject, loadProject, etc.)
                    // JSON.parse(JSON.stringify()) is a safe, easy way to strip functions
                    try {
                        const serialized = JSON.stringify(state);
                        projectToClone = JSON.parse(serialized);
                    } catch (e) {
                        console.error("Failed to serialize active project for cloning", e);
                        alert("Failed to prepare project for duplication.");
                        return;
                    }
                } else {
                    projectToClone = await loadProjectFromDisk(originalId);
                }

                if (!projectToClone) {
                    console.error(`[Store] Failed to duplicate: Project ${originalId} not found.`);
                    alert("Failed to duplicate project. Data not found.");
                    return;
                }

                // 2. Create new ID and update metadata
                const newId = generateId();
                const timestamp = Date.now();

                // 3. Clone and Modify Data
                // Use getEmptyProjectState as a base to ensure no store actions or UI state are cloned
                const newProject: ProjectData = {
                    ...getEmptyProjectState(newId, projectToClone.apiKeys),
                    ...projectToClone,
                    id: newId,
                    lastModified: timestamp,
                    episodeName: `${projectToClone.episodeName} (Copy)`
                };

                // CRITICAL: Deep Copy IndexedDB Blobs
                // We must iterate all idb:// references and copy the underlying blobs to new keys.
                // Otherwise, deleting the original project will delete these blobs, breaking the copy.
                const { resolveUrl, saveToIdb, generateAudioKey, generateCutImageKey, generateAssetImageKey } = await import('../utils/imageStorage');

                // Helper to copy a single blob
                const copyBlob = async (oldUrl: string | undefined | null, type: 'images' | 'audio' | 'assets', newKey: string): Promise<string | undefined> => {
                    if (!oldUrl || !oldUrl.startsWith('idb://')) return oldUrl || undefined;
                    try {
                        const blobUrl = await resolveUrl(oldUrl);
                        if (!blobUrl) return undefined;
                        const response = await fetch(blobUrl);
                        const blob = await response.blob();
                        const reader = new FileReader();

                        return new Promise((resolve) => {
                            reader.onloadend = async () => {
                                const base64 = reader.result as string;
                                const newIdbUrl = await saveToIdb(type, newKey, base64);
                                resolve(newIdbUrl);
                            };
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        console.error(`[Duplicate] Failed to copy blob ${oldUrl} to ${newKey}`, e);
                        return undefined;
                    }
                };

                // A. Copy Script Blobs (Audio & Images)
                if (newProject.script && Array.isArray(newProject.script)) {
                    for (let i = 0; i < newProject.script.length; i++) {
                        const cut = newProject.script[i];
                        const cutId = cut.id;

                        if (cut.audioUrl) {
                            cut.audioUrl = await copyBlob(cut.audioUrl, 'audio', generateAudioKey(newId, cutId)) || undefined;
                        }
                        if (cut.finalImageUrl) {
                            cut.finalImageUrl = await copyBlob(cut.finalImageUrl, 'images', generateCutImageKey(newId, cutId, 'final')) || undefined;
                        }
                        if (cut.draftImageUrl) {
                            cut.draftImageUrl = await copyBlob(cut.draftImageUrl, 'images', generateCutImageKey(newId, cutId, 'draft')) || undefined;
                        }
                    }
                }

                // B. Copy Asset Blobs
                if (newProject.assetDefinitions) {
                    const entries = Object.entries(newProject.assetDefinitions);
                    for (const [assetId, asset] of entries) {
                        asset.referenceImage = await copyBlob(asset.referenceImage, 'assets', generateAssetImageKey(newId, assetId, 'ref')) || undefined;
                        asset.masterImage = await copyBlob(asset.masterImage, 'assets', generateAssetImageKey(newId, assetId, 'master')) || undefined;
                        asset.draftImage = await copyBlob(asset.draftImage, 'assets', generateAssetImageKey(newId, assetId, 'draft')) || undefined;
                    }
                }

                // C. Copy Master Style
                if (newProject.masterStyle?.referenceImage) {
                    newProject.masterStyle.referenceImage = await copyBlob(newProject.masterStyle.referenceImage, 'assets', `${newId}-master-style-ref`) || null;
                }

                // D. Copy Thumbnail
                if (newProject.thumbnailUrl) {
                    newProject.thumbnailUrl = await copyBlob(newProject.thumbnailUrl, 'images', `${newId}-thumbnail`) || null;
                }

                // 4. Save to Disk
                await saveProjectToDisk(newProject);

                // 5. Update SavedProjects Metadata
                const savedProjects = state.savedProjects || {};
                const metadata: ProjectMetadata = {
                    id: newId,
                    seriesName: newProject.seriesName,
                    episodeName: newProject.episodeName,
                    episodeNumber: newProject.episodeNumber,
                    lastModified: timestamp,
                    thumbnailUrl: newProject.thumbnailUrl,
                    // Copy cached progress if available
                    cachedProgress: savedProjects[originalId]?.cachedProgress,
                    storylineTable: newProject.storylineTable // Copy storyline
                };

                set({
                    savedProjects: {
                        ...savedProjects,
                        [newId]: metadata
                    }
                } as any);

                console.log(`[Store] Duplicated project ${originalId} -> ${newId}`);
            },

            deleteSeries: async (seriesName: string) => {
                const state = get() as any;
                const projectIdsToDelete: string[] = [];
                const remainingProjects: Record<string, ProjectMetadata> = {};

                // Identify projects to delete
                Object.entries(state.savedProjects).forEach(([id, project]: [string, any]) => {
                    if (project.seriesName === seriesName) {
                        projectIdsToDelete.push(id);
                    } else {
                        remainingProjects[id] = project;
                    }
                });

                // Update store state
                set({ savedProjects: remainingProjects });

                // Remove from IndexedDB
                for (const id of projectIdsToDelete) {
                    await deleteProjectFromDisk(id);

                    // LOCAL SYNC: Delete from PC if connected
                    const appState = get() as any;
                    if (appState.localFolder?.handle && appState.localFolderPermission === 'granted') {
                        try {
                            await deleteFileFromHandle(appState.localFolder.handle, ['projects', `project-${id}.json`]);
                            await deleteDirectoryFromHandle(appState.localFolder.handle, ['assets', `project-${id}`]);
                            console.log(`[LocalSync] Deleted project files for ${id} from PC.`);
                        } catch (e) {
                            console.warn(`[LocalSync] Failed to delete local files for ${id}:`, e);
                        }
                    }
                }

                // CRITICAL: If the ACTIVE project belongs to the deleted series, we must reset the in-memory state.
                if (state.seriesName === seriesName) {
                    console.log(`[Store] Active project belongs to deleted series "${seriesName}". Resetting state to default.`);
                    get().resetToDefault();
                }

                console.log(`[Store] Deleted series "${seriesName}" (${projectIdsToDelete.length} episodes)`);
            },

            restoreData: async () => {
                console.log("[Store] Attempting manual restore...");
                try {
                    const idbValue = await idbGet('idea-lab-storage');
                    if (idbValue) {
                        if (confirm(`Found data in database. Overwrite current session?`)) {
                            const parsed = typeof idbValue === 'string' ? JSON.parse(idbValue) : idbValue;
                            if (parsed) {
                                const stateToRestore = parsed.state || parsed;
                                if (stateToRestore) {
                                    set(stateToRestore);
                                    alert("Restored from Database successfully.");
                                    return;
                                }
                            }
                        }
                    }
                    alert("No backup data found.");
                } catch (e: any) {
                    console.error("Restore failed:", e);
                    alert(`Failed to restore data.\nError: ${e.message}`);
                }
            },

            recoverFromLocalStorage: async () => {
                try {
                    const localValue = localStorage.getItem('idea-lab-storage');
                    if (localValue) {
                        if (confirm("Found legacy backup in LocalStorage. This will overwrite your current session. Continue?")) {
                            const parsed = JSON.parse(localValue);
                            const stateToRestore = parsed.state || parsed;
                            const migratedState = { ...stateToRestore, isHydrated: true };
                            set(migratedState);
                            get().saveProject();
                            alert("Successfully recovered data from LocalStorage!");
                            window.location.reload();
                        }
                    } else {
                        alert("No LocalStorage backup found.");
                    }
                } catch (e) {
                    console.error("Recovery failed:", e);
                    alert("Failed to recover data.");
                }
            },

            importZip: async (file: File) => {
                try {
                    let processImportZip;
                    try {
                        const module = await import('../utils/zipImporter');
                        processImportZip = module.processImportZip;
                        // Clear reload flag on success
                        window.sessionStorage.removeItem('chunk_load_error_reload');
                    } catch (error: any) {
                        const message = error?.message || '';
                        const isChunkError = message.includes('dynamically imported module') || message.includes('Importing a module script failed');

                        if (isChunkError) {
                            console.warn('[Store] Chunk load error detected for zipImporter, reloading...');
                            const storageKey = 'chunk_load_error_reload';
                            if (!window.sessionStorage.getItem(storageKey)) {
                                window.sessionStorage.setItem(storageKey, 'true');
                                window.location.reload();
                                return; // Stop execution
                            }
                        }
                        throw error;
                    }

                    const projects = await processImportZip(file);

                    if (projects.length === 0) {
                        alert("No valid projects found in the ZIP file.");
                        return;
                    }

                    console.log(`[Store] Importing ${projects.length} projects from ZIP...`);

                    const state = get() as any;
                    const newSavedProjects = { ...state.savedProjects };
                    // let lastImportedId: string | null = null;
                    // let lastImportedProject: ProjectData | null = null;

                    for (const project of projects) {
                        // Check for ID collision
                        let projectId = project.id;
                        if (newSavedProjects[projectId]) {
                            // ID collision - create new ID
                            projectId = generateId();
                            project.id = projectId;
                            project.episodeName = `${project.episodeName || 'Episode'} (Restored)`;
                            console.log(`[Store] ID collision detected, created new ID: ${projectId}`);
                        }

                        // Save project data to IndexedDB
                        await saveProjectToDisk(project);

                        // Calculate progress for metadata
                        const safeScript = Array.isArray(project.script) ? project.script : [];
                        const scriptConfirmed = safeScript.filter((c: any) => c.isImageConfirmed && c.isAudioConfirmed).length;

                        // Recalculate percent more accurately
                        let workflowPercent = 0;
                        if (safeScript.length > 0) {
                            const p = (scriptConfirmed / safeScript.length) * 100;
                            workflowPercent = Math.round(p);
                        }
                        if (project.thumbnailUrl) workflowPercent = 100; // If thumbnail exists, assume finished? No, that's step 5.

                        // Better heuristic: if it has script, it's at least step 3. 
                        // If it has confirmed cuts, it's step 3.5.
                        // If it has thumbnail, it's step 5.
                        // If all completed, step 6.

                        if (project.cachedProgress?.workflowPercent) {
                            workflowPercent = project.cachedProgress.workflowPercent;
                        }

                        // Create metadata entry for savedProjects
                        const metadata: ProjectMetadata = {
                            id: projectId,
                            seriesName: project.seriesName || 'Imported Series',
                            episodeName: project.episodeName || 'Imported Episode',
                            episodeNumber: project.episodeNumber || 1,
                            lastModified: project.lastModified || Date.now(),
                            thumbnailUrl: project.thumbnailUrl,
                            cachedProgress: {
                                workflowPercent: workflowPercent,
                                scriptLength: safeScript.length,
                                scriptConfirmed: scriptConfirmed,
                                assetsTotal: 0,
                                assetsDefined: 0,
                            },
                            storylineTable: project.storylineTable || [],
                        };

                        newSavedProjects[projectId] = metadata;
                        // lastImportedId = projectId;
                        // lastImportedProject = project;
                        console.log(`[Store] Added project "${metadata.seriesName} - ${metadata.episodeName}" to savedProjects`);
                    }

                    // Update savedProjects in state
                    set({ savedProjects: newSavedProjects } as any);

                    // Force persist the updated savedProjects list
                    lastSavedValue = null;
                    const currentState = get() as any;
                    const { saveStatus, isHydrated, ...stateToPersist } = currentState;
                    const persistPayload = JSON.stringify({ state: stateToPersist, version: 7 });
                    await idbSet('idea-lab-storage', persistPayload);

                    // DIRECT LOAD STRATEGY REMOVED:
                    // User requested to stay on Dashboard after import, not auto-load a random project.

                    console.log("[Store] Import complete. Updated project list.");
                    alert(`Successfully imported ${projects.length} project(s) to the Dashboard!`);

                    // No reload needed, React state update will reflect changes in Dashboard
                } catch (e) {
                    console.error("ZIP Import failed:", e);
                    alert("Failed to import project ZIP.");
                }
            },

            recoverOrphanedProjects: async () => {
                console.log("[Store] Scanning for orphaned projects...");
                const state = get() as any;
                const currentSaved = { ...state.savedProjects };
                const keys = await idbKeys();
                let recoveredCount = 0;

                for (const key of keys) {
                    const keyStr = String(key);
                    if (keyStr.startsWith('project-')) {
                        const projectId = keyStr.replace('project-', '');
                        if (!currentSaved[projectId]) {
                            try {
                                const projectData = await idbGet<ProjectData>(key);
                                if (projectData && projectData.id === projectId) {
                                    console.log(`[Store] Recovering orphaned project: ${projectId}`);

                                    // Reconstruct metadata
                                    currentSaved[projectId] = {
                                        id: projectData.id,
                                        seriesName: projectData.seriesName || 'Untitled Series',
                                        episodeName: projectData.episodeName || 'Untitled Episode',
                                        episodeNumber: projectData.episodeNumber || 1,
                                        lastModified: projectData.lastModified || Date.now(),
                                        thumbnailUrl: projectData.thumbnailUrl, // Keep internal, partialize handles clean up
                                        storylineTable: projectData.storylineTable || [],
                                    };
                                    recoveredCount++;
                                }
                            } catch (e) {
                                console.error(`[Store] Failed to recover orphan ${key}:`, e);
                            }
                        }
                    }
                }

                if (recoveredCount > 0) {
                    set({ savedProjects: currentSaved });
                    alert(`Recovered ${recoveredCount} missing projects to the Dashboard!`);
                } else {
                    alert("No hidden orphaned projects found.");
                }
            },

            importData: async (jsonString: string) => {
                try {
                    console.log("[Store] Importing data...", jsonString.substring(0, 100));
                    // Check if jsonString is purely a state object or complex wrapper
                    const parsed = JSON.parse(jsonString);
                    // Release jsonString memory early
                    jsonString = '';

                    const stateToLoad = parsed.state || parsed;

                    if (stateToLoad) {
                        console.log("[Store] State found, analyzing structure...");

                        // === SAFE IMPORT: ID COLLISION CHECK ===
                        const currentSavedProjects = get().savedProjects || {};
                        const originalId = stateToLoad.id;
                        let validProjectId = originalId;
                        let isRestoredCopy = false;

                        // Check if the project ID already exists in our storage
                        if (originalId && currentSavedProjects[originalId]) {
                            console.warn(`[Import] Collision detected for Project ID ${originalId}. Creating a restored copy.`);
                            validProjectId = generateId();
                            isRestoredCopy = true;

                            // Append (Restored) to name to indicate it's a copy
                            if (stateToLoad.episodeName) {
                                stateToLoad.episodeName = `${stateToLoad.episodeName} (Restored)`;
                            } else if (stateToLoad.seriesName) {
                                stateToLoad.seriesName = `${stateToLoad.seriesName} (Restored)`;
                            }
                        } else if (!originalId) {
                            validProjectId = generateId(); // Fallback for missing IDs
                        }

                        // Update the ID in the state object to the new safe ID
                        stateToLoad.id = validProjectId;

                        // INLINE MIGRATION: Convert Base64 to idb:// immediately to reduce memory
                        // Import saveToIdb dynamically
                        const { saveToIdb, generateCutImageKey, generateAudioKey, generateAssetImageKey } = await import('../utils/imageStorage');
                        let migratedCount = 0;

                        // Helper to check if URL is Base64
                        const isBase64 = (url: string | undefined | null) => url?.startsWith('data:');

                        // Migrate script cuts
                        if (stateToLoad.script && Array.isArray(stateToLoad.script)) {
                            console.log(`[Import] Migrating ${stateToLoad.script.length} cuts for Project ${validProjectId}...`);
                            for (let i = 0; i < stateToLoad.script.length; i++) {
                                const cut = stateToLoad.script[i];

                                if (isBase64(cut.finalImageUrl)) {
                                    const idbUrl = await saveToIdb('images', generateCutImageKey(validProjectId, cut.id, 'final'), cut.finalImageUrl);
                                    cut.finalImageUrl = idbUrl;
                                    migratedCount++;
                                }
                                if (isBase64(cut.draftImageUrl)) {
                                    const idbUrl = await saveToIdb('images', generateCutImageKey(validProjectId, cut.id, 'draft'), cut.draftImageUrl);
                                    cut.draftImageUrl = idbUrl;
                                    migratedCount++;
                                }
                                if (isBase64(cut.audioUrl)) {
                                    const idbUrl = await saveToIdb('audio', generateAudioKey(validProjectId, cut.id), cut.audioUrl);
                                    cut.audioUrl = idbUrl;
                                    migratedCount++;
                                }

                                // Auto-confirm if content exists (for imported projects)
                                if (cut.finalImageUrl || cut.draftImageUrl) {
                                    cut.isImageConfirmed = true;
                                }
                                if (cut.audioUrl && cut.audioUrl !== 'mock:beep') {
                                    cut.isAudioConfirmed = true;
                                }
                            }
                        }

                        // Migrate assetDefinitions
                        if (stateToLoad.assetDefinitions) {
                            const assetKeys = Object.keys(stateToLoad.assetDefinitions);
                            console.log(`[Import] Migrating ${assetKeys.length} assets...`);
                            for (const assetId of assetKeys) {
                                const asset = stateToLoad.assetDefinitions[assetId];
                                if (isBase64(asset.referenceImage)) {
                                    const idbUrl = await saveToIdb('assets', generateAssetImageKey(validProjectId, assetId, 'ref'), asset.referenceImage);
                                    asset.referenceImage = idbUrl;
                                    migratedCount++;
                                }
                                if (isBase64(asset.masterImage)) {
                                    const idbUrl = await saveToIdb('assets', generateAssetImageKey(validProjectId, assetId, 'master'), asset.masterImage);
                                    asset.masterImage = idbUrl;
                                    migratedCount++;
                                }
                                if (isBase64(asset.draftImage)) {
                                    const idbUrl = await saveToIdb('assets', generateAssetImageKey(validProjectId, assetId, 'draft'), asset.draftImage);
                                    asset.draftImage = idbUrl;
                                    migratedCount++;
                                }
                            }
                        }

                        // Migrate thumbnailUrl
                        if (isBase64(stateToLoad.thumbnailUrl)) {
                            const idbUrl = await saveToIdb('images', `thumbnail-${validProjectId}`, stateToLoad.thumbnailUrl);
                            stateToLoad.thumbnailUrl = idbUrl;
                            migratedCount++;
                        }

                        // Migrate masterStyle referenceImage
                        if (stateToLoad.masterStyle && isBase64(stateToLoad.masterStyle.referenceImage)) {
                            const idbUrl = await saveToIdb('assets', `master-style-${validProjectId}`, stateToLoad.masterStyle.referenceImage);
                            stateToLoad.masterStyle.referenceImage = idbUrl;
                            migratedCount++;
                        }

                        console.log(`[Import] Inline migration complete: ${migratedCount} items converted to idb://`);

                        let hasActiveProject = false;
                        if (stateToLoad.seriesName || (stateToLoad.script && stateToLoad.script.length > 0)) {
                            hasActiveProject = true;
                        }

                        // === SAVE PROJECTS TO DISK ===

                        // 1. Prepare Active Project Data
                        // We must explicitly construct this to ensure we don't carry over garbage
                        // and crucially, we use validProjectId
                        const activeProjectMetadata: ProjectMetadata = {
                            id: validProjectId,
                            seriesName: stateToLoad.seriesName,
                            episodeName: stateToLoad.episodeName,
                            episodeNumber: stateToLoad.episodeNumber,
                            lastModified: Date.now(),
                            thumbnailUrl: stateToLoad.thumbnailUrl,
                            storylineTable: stateToLoad.storylineTable || []
                        };

                        if (hasActiveProject) {
                            const activeProjectData: ProjectData = {
                                ...stateToLoad, // Start with loaded state
                                id: validProjectId, // Ensure ID is correct
                                lastModified: Date.now(),
                                // Explicitly preserve migrated structures
                                script: stateToLoad.script,
                                assetDefinitions: stateToLoad.assetDefinitions,
                            };
                            await saveProjectToDisk(activeProjectData);
                            console.log(`[Store] Saved active project ${validProjectId} to disk (Restored: ${isRestoredCopy})`);
                        }

                        // 2. Handle 'savedProjects' list from the backup
                        // These are other projects that were in the backup's list.
                        // We merge them CAREFULLY: Existing projects on disk take precedence to avoid overwriting pointers.
                        // We only add "orphan" projects from the backup that we don't have.
                        const newSavedProjects: Record<string, ProjectMetadata> = { ...currentSavedProjects };

                        // Add our Active Project (Restored or Imported)
                        newSavedProjects[validProjectId] = activeProjectMetadata;

                        if (stateToLoad.savedProjects) {
                            Object.entries(stateToLoad.savedProjects).forEach(([key, proj]: [string, any]) => {
                                // Skip if it's the one we just processed (original ID)
                                if (key === originalId) return;

                                // If this project does NOT exist in our current list, we can add it safely.
                                // BUT: We don't have its data! It's just a pointer. 
                                // Adding a pointer to missing data is confusing.
                                // However, IF the user is doing a full restore on a fresh machine, they might want these pointers 
                                // if they plan to import the individual project data later.
                                // Let's add them but maybe log a warning.
                                if (!newSavedProjects[key]) {
                                    console.log(`[Import] Restoring metadata pointer for project ${key}`);
                                    newSavedProjects[key] = {
                                        id: proj.id,
                                        seriesName: proj.seriesName,
                                        episodeName: proj.episodeName,
                                        episodeNumber: proj.episodeNumber,
                                        lastModified: proj.lastModified,
                                        thumbnailUrl: proj.thumbnailUrl,
                                        storylineTable: proj.storylineTable || []
                                    };
                                }
                            });
                        }

                        // === FINAL STATE UPDATE ===
                        // We calculate the merged state to PRESERVE global research data
                        // This prevents the "Import Wipes Research" bug.
                        const currentState = get() as any;
                        const mergedTrend = { ...(currentState.trendSnapshots || {}), ...(stateToLoad.trendSnapshots || {}) };
                        const mergedCompetitor = { ...(currentState.competitorSnapshots || {}), ...(stateToLoad.competitorSnapshots || {}) };
                        const mergedStrategy = { ...(currentState.strategyInsights || {}), ...(stateToLoad.strategyInsights || {}) };

                        const incomingIdeas = stateToLoad.ideaPool || [];
                        const existingIdeaTitles = new Set((currentState.ideaPool || []).map((i: any) => i.title));
                        const mergedIdeaPool = [...(currentState.ideaPool || []), ...incomingIdeas.filter((i: any) => !existingIdeaTitles.has(i.title))];

                        const finalState = {
                            ...stateToLoad,
                            id: validProjectId,
                            savedProjects: newSavedProjects,
                            trendSnapshots: mergedTrend,
                            competitorSnapshots: mergedCompetitor,
                            strategyInsights: mergedStrategy,
                            ideaPool: mergedIdeaPool,
                            apiKeys: (stateToLoad.apiKeys && Object.keys(stateToLoad.apiKeys).length >= 1)
                                ? stateToLoad.apiKeys
                                : (currentState.apiKeys || {}),
                            isHydrated: true,
                            saveStatus: 'idle',
                        };

                        set(finalState);

                        console.log("[Store] Forcing immediate persistence of main state...");
                        const stateToPersist = {
                            state: { ...finalState, saveStatus: 'idle', isHydrated: false },
                            version: 7
                        };
                        await idbSet('idea-lab-storage', JSON.stringify(stateToPersist));
                        console.log("[Store] Main state persisted.");

                        if (isRestoredCopy) {
                            alert(`Import Successful!\n\nA project with ID "${originalId}" already existed.\nTo prevent data loss, this backup was imported as a COPY:\n\n"${stateToLoad.episodeName || stateToLoad.seriesName}"`);
                        } else {
                            alert("Project imported successfully!");
                        }

                        // Reload to ensure all components sync up with new IDB state
                        window.location.reload();

                    }
                } catch (e: any) {
                    console.error("Import failed:", e);
                    alert(`Failed to import data.\nError: ${e.message}`);
                }
            },

            resetToDefault: () => {
                const state = get() as any;
                console.log("[Store] Resetting to volatile default state.");
                const defaultId = 'default-project';
                const defaultProject = getEmptyProjectState(defaultId, state.apiKeys);

                set({
                    ...defaultProject,
                    // We preserve savedProjects but DO NOT add the default project to it
                    savedProjects: state.savedProjects || {}
                } as any);

                // We DO NOT save to disk here. It's a temporary memory state.
            }

        }),
        {
            name: 'idea-lab-storage',
            storage: createJSONStorage(() => storage),
            version: 7,
            partialize: (state) => {
                const { saveStatus, isHydrated, localFolder, isSyncingLibrary, ...rest } = state as any;

                // Strip large Base64 data from script to prevent persist bloat
                // The full data is saved in individual project files (project-{id})
                if (rest.script && Array.isArray(rest.script)) {
                    rest.script = rest.script.map((cut: any) => ({
                        ...cut,
                        // Keep idb:// URLs (small), strip large data: URLs
                        audioUrl: cut.audioUrl?.startsWith('data:') ? null : cut.audioUrl,
                        finalImageUrl: cut.finalImageUrl?.startsWith('data:') ? null : cut.finalImageUrl,
                        draftImageUrl: cut.draftImageUrl?.startsWith('data:') ? null : cut.draftImageUrl,
                    }));
                }

                // Also strip large Base64 from assetDefinitions
                if (rest.assetDefinitions) {
                    const strippedAssets: any = {};
                    Object.entries(rest.assetDefinitions).forEach(([id, asset]: [string, any]) => {
                        strippedAssets[id] = {
                            ...asset,
                            referenceImage: asset.referenceImage?.startsWith('data:') ? null : asset.referenceImage,
                            masterImage: asset.masterImage?.startsWith('data:') ? null : asset.masterImage,
                            draftImage: asset.draftImage?.startsWith('data:') ? null : asset.draftImage,
                        };
                    });
                    rest.assetDefinitions = strippedAssets;
                }

                // Strip Base64 images from chatHistory
                if (rest.chatHistory && Array.isArray(rest.chatHistory)) {
                    rest.chatHistory = rest.chatHistory.map((msg: any) => ({
                        ...msg,
                        image: msg.image?.startsWith('data:') ? null : msg.image
                    }));
                }

                // Strip thumbnail if Base64
                if (rest.thumbnailUrl?.startsWith('data:')) {
                    rest.thumbnailUrl = null;
                }

                // Strip masterStyle referenceImage if Base64
                if (rest.masterStyle?.referenceImage?.startsWith('data:')) {
                    rest.masterStyle = { ...rest.masterStyle, referenceImage: null };
                }

                // CRITICAL: Sanitize savedProjects metadata to ensure no heavy Base64 exists there
                if (rest.savedProjects) {
                    const cleanSavedProjects: any = {};
                    Object.entries(rest.savedProjects).forEach(([id, meta]: [string, any]) => {
                        cleanSavedProjects[id] = {
                            ...meta,
                            // Ensure storylineTable is preserved in metadata for dashboard list
                            storylineTable: meta.storylineTable || [],
                            thumbnailUrl: meta.thumbnailUrl?.startsWith('data:') ? null : meta.thumbnailUrl
                        };
                    });
                    rest.savedProjects = cleanSavedProjects;
                }

                return rest;
            },
            onRehydrateStorage: () => (state) => {
                if (state) {
                    storeApi = { getState: () => state };
                    state.setIsHydrated(true);

                    // Auto-load full project data after hydration
                    // Because partialize strips Base64 URLs, we need to reload from project-{id}
                    const projectId = state.id;
                    if (projectId && projectId !== 'default-project') {
                        console.log(`[Store] Auto-loading full data for project ${projectId}...`);
                        loadProjectFromDisk(projectId).then(fullData => {
                            if (fullData) {
                                // CRITICAL: Check if the current project ID still matches
                                // to prevent loading wrong project data after a quick switch
                                const currentId = useWorkflowStore.getState().id;
                                if (currentId !== projectId) {
                                    console.warn(`[Store] Skipping auto-load: project changed from ${projectId} to ${currentId}`);
                                    return;
                                }

                                // Only update script and asset data (preserve UI state)
                                useWorkflowStore.setState({
                                    script: fullData.script || [],
                                    assetDefinitions: fullData.assetDefinitions || {},
                                    masterStyle: fullData.masterStyle,
                                    thumbnailUrl: fullData.thumbnailUrl,
                                } as any);
                                console.log(`[Store] Full data loaded for ${projectId}`);
                            } else {
                                // FIXED: If data is missing on disk, it's a zombie. Reset.
                                console.warn(`[Store] Ghost project detected: ${projectId} not found on disk. Resetting...`);
                                useWorkflowStore.getState().resetToDefault();
                            }
                        }).catch(err => {
                            console.warn(`[Store] Failed to auto-load project ${projectId}:`, err);
                        });
                    }

                    // MANUAL REHYDRATION: localFolder handle (cannot be JSON stringified)
                    idbGet('local-folder-handle').then(async handle => {
                        if (handle) {
                            console.log("[LocalSync] Restored folder handle from IDB:", (handle as any).name);
                            const h = handle as any;
                            // Check permission silently
                            const granted = await verifyPermission(h.handle, 'readwrite');
                            useWorkflowStore.setState({
                                localFolder: h,
                                localFolderPermission: granted ? 'granted' : 'prompt'
                            });
                            if (granted) console.log("[LocalSync] Permission verified (granted)");
                            else console.log("[LocalSync] Permission required (prompt)");
                        }
                    });
                }
            }
        }
    )
);


// Export types for backward compatibility



// Export types for backward compatibility
export type { ProjectData, ProjectMetadata, ApiKeys, Character, Location, Asset, AssetDefinition, MasterStyle, StyleAnchor, ThumbnailSettings, AspectRatio, TtsModel, ImageModel } from './types';
export type { ChatMessage, ScriptCut } from '../services/gemini';
