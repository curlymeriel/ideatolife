import type { StateCreator } from 'zustand';
import type {
    ProjectData,
    ApiKeys,
    MasterStyle,
    StyleAnchor,
    TtsModel,
    ImageModel,
    Asset
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
    setAssets: (assets: Record<number, Asset>) => void;
    updateAsset: (cutId: number, asset: Partial<Asset>) => void;
}

const sampleProjectDefaults = {
    seriesName: 'Red Dust Mysteries',
    episodeName: 'The First Signal',
    episodeNumber: 1,
    seriesStory: 'In the year 2150, Mars has been terraformed, but secrets lie beneath the red dust.',
    mainCharacters: 'Detective Kael, Dr. Aris',
    characters: [
        { id: '1', name: 'Detective Kael', role: 'Protagonist', description: 'Cynical but brilliant detective.' },
        { id: '2', name: 'Dr. Aris', role: 'Scientist', description: 'Terraforming expert with a secret.' }
    ],
    seriesLocations: [],
    episodePlot: 'Kael discovers a strange signal coming from the old mines.',
    episodeCharacters: [],
    episodeLocations: [],
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
    thumbnailUrl: null,
    thumbnailSettings: {
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
    imageModel: 'gemini-2.5-flash-image' as const,
    assets: {},
    currentStep: 1,
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
});
