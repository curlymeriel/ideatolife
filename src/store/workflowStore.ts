import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { extractSeriesData, getNextEpisodeNumber } from '../utils/seriesUtils';

// Import types and slices
import type { ProjectData, ProjectMetadata } from './types';
import { createProjectSlice, type ProjectSlice } from './projectSlice';
import { createUISlice, type UISlice } from './uiSlice';

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

    // Navigation
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;

    // Data Recovery
    restoreData: () => Promise<void>;
    recoverFromLocalStorage: () => Promise<void>;
    importData: (jsonString: string) => void;
}

// Combined Store Type
type WorkflowStore = ProjectSlice & UISlice & MultiProjectActions;

// ====================
// Storage Helpers
// ====================

const generateId = () => Math.random().toString(36).substring(2, 9);
const getProjectKey = (id: string) => `project-${id}`;

const saveProjectToDisk = async (project: ProjectData) => {
    try {
        await idbSet(getProjectKey(project.id), project);
        console.log(`[Store] Saved project ${project.id} to disk.`);
    } catch (e) {
        console.error(`[Store] Failed to save project ${project.id} to disk:`, e);
    }
};

const loadProjectFromDisk = async (id: string): Promise<ProjectData | null> => {
    try {
        const project = await idbGet(getProjectKey(id));
        return project || null;
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
                    // Safety Net: Check for potential data wipe
                    const existing = await idbGet(name);
                    if (existing) {
                        const existingStr = typeof existing === 'string' ? existing : JSON.stringify(existing);
                        if (existingStr.length > 5000 && value.length < 3000) {
                            const backupKey = `${name}-backup-${Date.now()}`;
                            console.warn(`[Store] Potential data wipe detected! Backing up to ${backupKey}`);
                            await idbSet(backupKey, existingStr);
                        }
                    }

                    await idbSet(name, value);

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
            }, 500); // Increased from 100ms to reduce UI lag during rapid changes
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
            },
            setApiKeys: (keys) => {
                set((state: any) => ({ apiKeys: { ...state.apiKeys, ...keys } }));
            },
            setChatHistory: (history) => {
                set({ chatHistory: history });
            },
            setThumbnail: (url) => {
                set({ thumbnailUrl: url });
            },
            setThumbnailSettings: (settings) => {
                set((state: any) => ({ thumbnailSettings: { ...state.thumbnailSettings, ...settings } }));
            },
            setMasterStyle: (style) => {
                set((state: any) => ({ masterStyle: { ...state.masterStyle, ...style } }));
            },
            setStyleAnchor: (style) => {
                set((state: any) => ({ styleAnchor: { ...state.styleAnchor, ...style } }));
            },
            setScript: (script) => {
                set({ script });
            },
            setTtsModel: (model) => {
                set({ ttsModel: model });
            },
            setImageModel: (model) => {
                set({ imageModel: model });
            },
            setAssets: (assets) => {
                set({ assets });
            },
            updateAsset: (cutId, asset) => {
                set((state: any) => ({
                    assets: {
                        ...state.assets,
                        [cutId]: { ...state.assets[cutId], ...asset }
                    }
                }));
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
                    episodePlot: state.episodePlot,
                    episodeCharacters: state.episodeCharacters,
                    episodeLocations: state.episodeLocations,
                    targetDuration: state.targetDuration,
                    aspectRatio: state.aspectRatio,
                    apiKeys: state.apiKeys,
                    chatHistory: state.chatHistory,
                    masterStyle: state.masterStyle,
                    styleAnchor: state.styleAnchor,
                    assetDefinitions: state.assetDefinitions,
                    thumbnailUrl: state.thumbnailUrl,
                    thumbnailSettings: state.thumbnailSettings,
                    script: state.script,
                    ttsModel: state.ttsModel,
                    imageModel: state.imageModel,
                    assets: state.assets,
                    currentStep: state.currentStep,
                };

                await saveProjectToDisk(projectData);

                const metadata: ProjectMetadata = {
                    id: projectData.id,
                    seriesName: projectData.seriesName,
                    episodeName: projectData.episodeName,
                    episodeNumber: projectData.episodeNumber,
                    lastModified: projectData.lastModified,
                    thumbnailUrl: projectData.thumbnailUrl,
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

                // Base template for new project
                const newProject: ProjectData = {
                    id: newId,
                    lastModified: Date.now(),
                    seriesName: 'New Series',
                    episodeName: 'New Episode',
                    episodeNumber: 1,
                    seriesStory: '',
                    mainCharacters: '',
                    characters: [],
                    seriesLocations: [],
                    episodePlot: '',
                    episodeCharacters: [],
                    episodeLocations: [],
                    targetDuration: 60,
                    aspectRatio: '16:9',
                    apiKeys: state.apiKeys,
                    chatHistory: [],
                    thumbnailUrl: null,
                    thumbnailSettings: {
                        scale: 1,
                        imagePosition: { x: 0, y: 0 },
                        textPosition: { x: 0, y: 0 },
                        titleSize: 48,
                        epNumSize: 60,
                        textColor: '#ffffff',
                        fontFamily: 'Inter',
                        frameImage: '' // Fixed: don't auto-load frame
                    },
                    masterStyle: { description: '', referenceImage: null },
                    styleAnchor: {
                        referenceImage: null,
                        prompts: { font: 'Inter, sans-serif', layout: 'Cinematic wide shot', color: 'Dark, high contrast, sand orange accents' }
                    },
                    assetDefinitions: {},
                    script: [],
                    ttsModel: 'neural2',
                    imageModel: 'gemini-2.5-flash-image',
                    assets: {},
                    currentStep: 1,
                };

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
                await get().saveProject();
                console.log(`[Store] Loading project ${id}...`);
                const projectData = await loadProjectFromDisk(id);

                if (projectData) {
                    set({ ...projectData } as any);
                    console.log(`[Store] Project ${id} loaded successfully.`);
                } else {
                    console.error(`[Store] Project ${id} not found on disk.`);
                    alert("Failed to load project data. It may be missing or corrupted.");
                }
            },

            deleteProject: async (id: string) => {
                const state = get() as any;
                const { [id]: deleted, ...remainingProjects } = state.savedProjects;

                // Update store state
                set({ savedProjects: remainingProjects });

                // Remove from IndexedDB
                await deleteProjectFromDisk(id);
                console.log(`[Store] Deleted project ${id}`);
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

            importData: async (jsonString: string) => {
                try {
                    console.log("[Store] Importing data...", jsonString.substring(0, 100));
                    const parsed = JSON.parse(jsonString);
                    const stateToLoad = parsed.state || parsed;

                    if (stateToLoad) {
                        console.log("[Store] State found, analyzing structure...");
                        let restoredCount = 0;
                        let hasActiveProject = false;

                        if (stateToLoad.seriesName || (stateToLoad.script && stateToLoad.script.length > 0)) {
                            hasActiveProject = true;
                            console.log("[Store] Found active project data.");
                        }

                        const newSavedProjects: Record<string, ProjectMetadata> = {};
                        const projectsToSave: ProjectData[] = [];

                        if (stateToLoad.savedProjects) {
                            Object.entries(stateToLoad.savedProjects).forEach(([key, proj]: [string, any]) => {
                                if (proj.script || proj.assets || proj.characters) {
                                    console.log(`[Store] Found full project data for ${key} in import.`);
                                    newSavedProjects[key] = {
                                        id: proj.id,
                                        seriesName: proj.seriesName,
                                        episodeName: proj.episodeName,
                                        episodeNumber: proj.episodeNumber,
                                        lastModified: proj.lastModified,
                                        thumbnailUrl: proj.thumbnailUrl,
                                    };
                                    projectsToSave.push(proj);
                                } else {
                                    newSavedProjects[key] = proj;
                                }
                            });
                        }

                        if (projectsToSave.length > 0) {
                            console.log(`[Store] Migrating ${projectsToSave.length} archived projects to disk...`);
                            await Promise.all(projectsToSave.map(p => saveProjectToDisk(p)));
                            restoredCount = projectsToSave.length;
                        }

                        const migratedState = {
                            ...stateToLoad,
                            savedProjects: { ...stateToLoad.savedProjects, ...newSavedProjects },
                            isHydrated: true
                        };

                        set(migratedState);

                        console.log("[Store] Forcing immediate persistence of main state...");
                        const stateToPersist = {
                            state: { ...migratedState, saveStatus: 'idle', isHydrated: false },
                            version: 7
                        };
                        await idbSet('idea-lab-storage', JSON.stringify(stateToPersist));
                        console.log("[Store] Main state persisted.");

                        await get().saveProject();

                        const message = hasActiveProject
                            ? `Import successful!\n\n- Active Project: Restored ("${stateToLoad.seriesName || 'Untitled'}")\n- Archived Projects: ${restoredCount} restored`
                            : `Import successful!\n\n- Archived Projects: ${restoredCount} restored`;

                        alert(`${message}\n\nThe app will now reload.`);
                        window.location.reload();
                    } else {
                        alert("Invalid project file format.");
                    }
                } catch (e: any) {
                    console.error("Import failed:", e);
                    alert(`Failed to import project.\n\nError: ${e.message}\n\nIf the file is too large (>200MB), it might exceed browser memory limits.`);
                }
            }
        }),
        {
            name: 'idea-lab-storage',
            storage: createJSONStorage(() => storage),
            version: 7,
            partialize: (state) => {
                const { saveStatus, isHydrated, ...rest } = state as any;
                return rest;
            },
            onRehydrateStorage: () => (state) => {
                if (state) {
                    storeApi = { getState: () => state };
                    state.setIsHydrated(true);
                }
            }
        }
    )
);

// Export types for backward compatibility
export type { ProjectData, ProjectMetadata, ApiKeys, Character, Location, Asset, AssetDefinition, MasterStyle, StyleAnchor, ThumbnailSettings, AspectRatio, TtsModel, ImageModel } from './types';
export type { ChatMessage, ScriptCut } from '../services/gemini';
