import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
// seriesUtils are imported dynamically in createProject for tree-shaking

// Import types and slices
import type { ProjectData, ProjectMetadata } from './types';
import { createProjectSlice, type ProjectSlice } from './projectSlice';
import { createUISlice, type UISlice } from './uiSlice';
import { saveToIdb, generateAudioKey, generateCutImageKey, generateAssetImageKey } from '../utils/imageStorage';

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
}

// Combined Store Type
type WorkflowStore = ProjectSlice & UISlice & MultiProjectActions;

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

// ====================
// Store Creation
// ====================

export const useWorkflowStore = create<WorkflowStore>()(
    persist(
        (set, get) => ({
            // Combine slices
            ...createProjectSlice(set as any, get as any, storeApi as any),
            ...createUISlice(set as any, get as any, storeApi as any),

            // Project metadata
            id: 'default-project',
            lastModified: Date.now(),

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
                        // We update the store with the merged list
                        // And we set the ACTIVE project to the one we just imported
                        const migratedState = {
                            ...stateToLoad, // Set active project properties
                            id: validProjectId,
                            savedProjects: newSavedProjects, // Set merged list
                            isHydrated: true,
                            saveStatus: 'idle', // FORCE IDLE
                        };

                        set(migratedState);

                        console.log("[Store] Forcing immediate persistence of main state...");
                        const stateToPersist = {
                            state: { ...migratedState, saveStatus: 'idle', isHydrated: false },
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
                const { saveStatus, isHydrated, ...rest } = state as any;

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
                }
            }
        }
    )
);

// Export types for backward compatibility
export type { ProjectData, ProjectMetadata, ApiKeys, Character, Location, Asset, AssetDefinition, MasterStyle, StyleAnchor, ThumbnailSettings, AspectRatio, TtsModel, ImageModel } from './types';
export type { ChatMessage, ScriptCut } from '../services/gemini';
