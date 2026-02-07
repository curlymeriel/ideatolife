import type { StateCreator } from 'zustand';
import type {
    ProjectData,
    ApiKeys,
    MasterStyle,
    StyleAnchor,
    TtsModel,
    ImageModel,
    Asset,
    BGMTrack
} from './types';
import type { ScriptCut, ChatMessage } from '../services/gemini';

// Project Slice: Manages all domain/project data
export interface ProjectSlice extends Omit<ProjectData, 'id' | 'lastModified'> {
    // Actions
    setProjectInfo: (info: Partial<ProjectData>) => void;
    setApiKeys: (keys: Partial<ApiKeys>) => void;
    setChatHistory: (history: ChatMessage[]) => void;
    setThumbnail: (url: string | null) => void;
    setThumbnailSettings: (settings: Partial<ProjectData['thumbnailSettings']>) => void;
    setMasterStyle: (style: Partial<MasterStyle>) => void;
    setStyleAnchor: (style: Partial<StyleAnchor>) => void;
    setScript: (script: ScriptCut[]) => void;
    setTtsModel: (model: TtsModel) => void;
    setImageModel: (model: ImageModel) => void;
    setAssets: (assets: Record<string, Asset[]>) => void;
    updateAsset: (cutId: number, asset: Partial<Asset>) => void;
    setProductionChatHistory: (history: ChatMessage[]) => void;
    setBGMTracks: (tracks: BGMTrack[]) => void;
    cleanupOrphanedAssets: () => void;
}

const sampleProjectDefaults = {
    seriesName: '',
    episodeName: '',
    episodeNumber: 1,
    seriesStory: '',
    mainCharacters: '',
    characters: [],
    seriesLocations: [],
    episodePlot: '',
    episodeCharacters: [],
    episodeLocations: [],
    seriesProps: [],
    episodeProps: [],
    storylineTable: [],
    targetDuration: 60,
    aspectRatio: '16:9' as const,
    apiKeys: {
        gemini: '',
        googleCloud: '',
        elevenLabs: '',
        elevenLabsModelId: 'eleven_monolingual_v1',
    },
    chatHistory: [],
    productionChatHistory: [],
    thumbnailUrl: null,
    thumbnailSettings: {
        mode: 'framing' as const,
        scale: 1,
        imagePosition: { x: 0, y: 0 },
        textPosition: { x: 0, y: 0 },
        titleSize: 48,
        epNumSize: 60,
        textColor: '#ffffff',
        fontFamily: 'Inter',
        frameImage: '/frame_bg.svg'
    },
    masterStyle: {
        description: '',
        referenceImage: null,
    },
    styleAnchor: {
        referenceImage: null,
        prompts: {
            font: 'Inter, sans-serif',
            layout: 'Cinematic wide shot',
            color: 'Dark, high contrast, sand orange accents',
        },
    },
    assetDefinitions: {},
    visualAssets: {},
    script: [],
    ttsModel: 'neural2' as const,
    imageModel: 'gemini-3-pro-image-preview' as const,
    assets: {},
    currentStep: 1,
    bgmTracks: [],
};

export const createProjectSlice: StateCreator<ProjectSlice> = (set) => ({
    ...sampleProjectDefaults,

    setProjectInfo: (info) => set((state) => ({ ...state, ...info })),

    setApiKeys: (keys) => set((state) => ({
        apiKeys: { ...state.apiKeys, ...keys }
    })),

    setChatHistory: (history) => set({ chatHistory: history }),

    setThumbnail: (url) => set({ thumbnailUrl: url }),

    setThumbnailSettings: (settings) => set((state) => ({
        thumbnailSettings: { ...state.thumbnailSettings, ...settings }
    })),

    setMasterStyle: (style) => set((state) => ({
        masterStyle: { ...state.masterStyle, ...style }
    })),

    setStyleAnchor: (style) => set((state) => ({
        styleAnchor: { ...state.styleAnchor, ...style }
    })),

    setScript: (script) => set({ script }),

    setTtsModel: (model) => set({ ttsModel: model }),

    setImageModel: (model) => set({ imageModel: model }),

    setAssets: (assets) => set({ assets }),

    updateAsset: (cutId, asset) => set((state) => ({
        assets: {
            ...state.assets,
            [cutId]: { ...state.assets[cutId], ...asset }
        }
    })),

    setProductionChatHistory: (history) => set({ productionChatHistory: history }),

    setBGMTracks: (tracks) => set({ bgmTracks: tracks }),

    cleanupOrphanedAssets: () => set((state) => {
        const validIds = new Set<string>();

        // Collect all valid IDs from Step 1 data
        state.characters?.forEach(c => validIds.add(c.id));
        state.seriesLocations?.forEach(l => validIds.add(l.id));
        state.episodeCharacters?.forEach(c => validIds.add(c.id));
        state.episodeLocations?.forEach(l => validIds.add(l.id));
        state.seriesProps?.forEach(p => validIds.add(p.id));
        state.episodeProps?.forEach(p => validIds.add(p.id));

        // SAFETY CHECK: If no valid IDs found, skip cleanup entirely
        // This prevents accidental deletion when Step1 data is empty or being modified
        if (validIds.size === 0) {
            console.log(`[Cleanup] Skipped - no valid IDs found in Step1 data (possible data migration in progress)`);
            return {};
        }

        // 1. Clean assetDefinitions
        const currentAssetDefs = state.assetDefinitions || {};
        const cleanedAssetDefs: Record<string, any> = {};
        let assetDefCount = 0;

        // SAFETY CHECK: If orphan ratio is too high (>50%), skip cleanup
        const totalAssets = Object.keys(currentAssetDefs).length;
        const orphanCount = Object.keys(currentAssetDefs).filter(id => !validIds.has(id)).length;
        if (totalAssets > 0 && orphanCount > totalAssets * 0.5) {
            console.warn(`[Cleanup] Skipped - too many orphans (${orphanCount}/${totalAssets}). This may indicate a data sync issue.`);
            return {};
        }

        Object.entries(currentAssetDefs).forEach(([id, asset]) => {
            if (validIds.has(id)) {
                cleanedAssetDefs[id] = asset;
            } else {
                assetDefCount++;
                console.log(`[Cleanup] Removed orphaned asset definition: ${id} (${asset.name})`);
            }
        });

        // 2. Clean visualAssets (Step 1/2 prompts)
        const currentVisuals = state.visualAssets || {};
        const cleanedVisuals: Record<string, any> = {};
        let visualCount = 0;

        Object.entries(currentVisuals).forEach(([id, asset]) => {
            if (validIds.has(id)) {
                cleanedVisuals[id] = asset;
            } else {
                visualCount++;
                console.log(`[Cleanup] Removed orphaned visual asset: ${id} (${asset.name})`);
            }
        });

        // 3. Clean assets (Step 5 Production assets - keyed by cut ID)
        // Note: Cut IDs are different from character IDs, they are tied to script length.
        const currentProdAssets = state.assets || {};
        const cleanedProdAssets: Record<string, any> = {};
        let prodCount = 0;
        const validCutIds = new Set((state.script || []).map(c => String(c.id)));

        Object.entries(currentProdAssets).forEach(([id, asset]) => {
            if (validCutIds.has(id)) {
                cleanedProdAssets[id] = asset;
            } else {
                prodCount++;
                console.log(`[Cleanup] Removed orphaned production asset for cut: ${id}`);
            }
        });

        const totalCleaned = assetDefCount + visualCount + prodCount;

        if (totalCleaned > 0) {
            console.log(`[Cleanup] Complete. Removed ${totalCleaned} orphans. (${assetDefCount} defs, ${visualCount} visuals, ${prodCount} prod)`);
            return {
                assetDefinitions: cleanedAssetDefs,
                visualAssets: cleanedVisuals,
                assets: cleanedProdAssets
            };
        }

        return {};
    }),
});
