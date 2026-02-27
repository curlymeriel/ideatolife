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
export interface ProjectSlice extends Omit<ProjectData, 'id' | 'lastModified' | 'nextCutId'> {
    isDirty: boolean;
    nextCutId: number; // For stable ID generation
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
    setDirty: (dirty: boolean) => void;
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
    ttsModel: 'gemini-tts' as const,
    imageModel: 'gemini-3-pro-image-preview' as const,
    assets: {},
    currentStep: 1,
    bgmTracks: [],
    nextCutId: 1,
    isDirty: false,
};

export const createProjectSlice: StateCreator<ProjectSlice> = (set, get) => ({
    ...sampleProjectDefaults,

    setDirty: (dirty) => set({ isDirty: dirty }),

    setProjectInfo: (info) => set((state) => ({ ...state, ...info, isDirty: true })),

    setApiKeys: (keys) => set((state) => ({
        apiKeys: { ...state.apiKeys, ...keys },
        isDirty: true
    })),

    setChatHistory: (history) => set({ chatHistory: history, isDirty: true }),

    setThumbnail: (url) => set({ thumbnailUrl: url, isDirty: true }),

    setThumbnailSettings: (settings) => set((state) => ({
        thumbnailSettings: { ...state.thumbnailSettings, ...settings },
        isDirty: true
    })),

    setMasterStyle: (style) => set((state) => ({
        masterStyle: { ...state.masterStyle, ...style },
        isDirty: true
    })),

    setStyleAnchor: (style) => set((state) => ({
        styleAnchor: { ...state.styleAnchor, ...style },
        isDirty: true
    })),

    setScript: async (script) => {
        // [PHASE 1] Initial Sync Update
        const maxId = script.reduce((max, cut) => Math.max(max, cut.id || 0), 0);
        set((state) => ({
            script: script,
            nextCutId: Math.max(state.nextCutId || 1, maxId + 1),
            isDirty: true
        }));

        (get() as any).saveProject?.();

        // [PHASE 2] Async Sanitization
        const currentId = (get() as any).id;
        const { saveToIdb, generateAudioKey, generateCutImageKey } = await import('../utils/imageStorage');
        const originalScriptForSanitization = [...script];
        const patches: Record<number, Partial<ScriptCut>> = {};

        for (const cut of originalScriptForSanitization) {
            const updates: Partial<ScriptCut> = {};
            const cutId = cut.id;

            if (cut.audioUrl?.startsWith('data:') && cut.audioUrl.length > 50000) {
                try {
                    updates.audioUrl = await saveToIdb('audio', generateAudioKey(currentId, cutId), cut.audioUrl);
                } catch (e) { console.error("[Sanitizer] Audio failed", e); }
            }
            if (cut.finalImageUrl?.startsWith('data:') && cut.finalImageUrl.length > 50000) {
                try {
                    updates.finalImageUrl = await saveToIdb('images', generateCutImageKey(currentId, cutId, 'final' as any), cut.finalImageUrl);
                } catch (e) { console.error("[Sanitizer] Final image failed", e); }
            }
            if (cut.draftImageUrl?.startsWith('data:') && cut.draftImageUrl.length > 50000) {
                try {
                    updates.draftImageUrl = await saveToIdb('images', generateCutImageKey(currentId, cutId, 'draft' as any), cut.draftImageUrl);
                } catch (e) { console.error("[Sanitizer] Draft image failed", e); }
            }

            if (Object.keys(updates).length > 0) {
                patches[cutId] = updates;
            }
        }

        // [PHASE 3] Final Patch Update
        if (Object.keys(patches).length > 0) {
            const currentState = get().script;
            const finalScript = currentState.map(cut => {
                const patch = patches[cut.id];
                if (patch) {
                    return {
                        ...cut,
                        ...patch,
                        dialogue: cut.dialogue, // LIVE dialogue takes precedence
                        isAudioConfirmed: cut.isAudioConfirmed,
                        isImageConfirmed: cut.isImageConfirmed
                    };
                }
                return cut;
            });

            set({ script: finalScript, isDirty: true });
            (get() as any).saveProject?.();
            console.log("[Store] Script patched while preserving live user edits.");
        }
    },

    setTtsModel: (model) => set({ ttsModel: model, isDirty: true }),

    setImageModel: (model) => set({ imageModel: model, isDirty: true }),

    setAssets: (assets) => set({ assets, isDirty: true }),

    updateAsset: async (cutId, asset) => {
        let sanitizedAsset = { ...asset };
        const currentId = (get() as any).id;
        let wasModified = false;

        const { saveToIdb, generateAudioKey, generateCutImageKey } = await import('../utils/imageStorage');

        const imageFields: (keyof Asset & string)[] = ['imageUrl', 'audioUrl'];
        for (const field of imageFields) {
            const val = sanitizedAsset[field];
            if (typeof val === 'string' && val.startsWith('data:') && val.length > 50000) {
                try {
                    const idbUrl = await saveToIdb(field === 'imageUrl' ? 'images' : 'audio',
                        field === 'imageUrl' ? generateCutImageKey(currentId, cutId, 'final' as any) : generateAudioKey(currentId, cutId), val);
                    sanitizedAsset[field] = idbUrl;
                    wasModified = true;
                } catch (e) { console.error(`[Sanitizer] Asset ${field} failed`, e); }
            }
        }

        set((state) => ({
            assets: {
                ...state.assets,
                [cutId]: { ...state.assets[cutId], ...sanitizedAsset }
            },
            isDirty: true
        }));

        if (wasModified) {
            (get() as any).saveProject?.();
        }
    },

    setProductionChatHistory: (history) => set({ productionChatHistory: history, isDirty: true }),

    setBGMTracks: (tracks) => set({ bgmTracks: tracks, isDirty: true }),

    cleanupOrphanedAssets: () => set((state) => {
        const validIds = new Set<string>();
        state.characters?.forEach(c => validIds.add(c.id));
        state.seriesLocations?.forEach(l => validIds.add(l.id));
        state.episodeCharacters?.forEach(c => validIds.add(c.id));
        state.episodeLocations?.forEach(l => validIds.add(l.id));
        state.seriesProps?.forEach(p => validIds.add(p.id));
        state.episodeProps?.forEach(p => validIds.add(p.id));

        if (validIds.size === 0) return {};

        const currentAssetDefs = state.assetDefinitions || {};
        const cleanedAssetDefs: Record<string, any> = {};
        Object.entries(currentAssetDefs).forEach(([id, def]) => {
            if (validIds.has(id)) cleanedAssetDefs[id] = def;
        });

        const currentVisualAssets = state.visualAssets || {};
        const cleanedVisualAssets: Record<string, any> = {};
        Object.entries(currentVisualAssets).forEach(([id, asset]) => {
            if (validIds.has(id)) cleanedVisualAssets[id] = asset;
        });

        const currentAssets = state.assets || {};
        const cleanedAssets: Record<string, any> = {};
        Object.entries(currentAssets).forEach(([id, asset]) => {
            if (validIds.has(id)) cleanedAssets[id] = asset;
        });

        return {
            assetDefinitions: cleanedAssetDefs,
            visualAssets: cleanedVisualAssets,
            assets: cleanedAssets,
            isDirty: true
        };
    }),
});
