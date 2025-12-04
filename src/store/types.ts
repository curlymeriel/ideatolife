import type { ScriptCut, ChatMessage } from '../services/gemini';

// ====================
// Domain Types
// ====================

export type TtsModel = 'standard' | 'wavenet' | 'neural2' | 'chirp3-hd';
export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3.0-pro-image';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2.35:1';

export interface ApiKeys {
    gemini: string;
    googleCloud: string;
    elevenLabs: string;
    elevenLabsModelId: string;
}

export interface Character {
    id: string;
    name: string;
    role: string;
    description: string;
    voiceId?: string;                       // e.g., 'en-US-Neural2-C' or 'ko-KR-Chirp3-HD-Aoede'
    voiceLanguage?: 'en-US' | 'ko-KR';      // Voice language
    voicePitch?: string;                    // e.g., '+2st', '-1st' (Neural2 only)
    voiceRate?: string;                     // e.g., '110%', 'slow'
}

export interface Location {
    id: string;
    name: string;
    description: string;
}

export interface MasterStyle {
    description: string;
    referenceImage: string | null;
    characterModifier?: string;
    backgroundModifier?: string;
}

export interface StyleAnchor {
    referenceImage: string | null;
    prompts: {
        font: string;
        layout: string;
        color: string;
    };
}

export interface ThumbnailSettings {
    scale: number;
    imagePosition: { x: number; y: number };
    textPosition: { x: number; y: number };
    titleSize: number;
    epNumSize: number;
    textColor: string;
    fontFamily: string;
    frameImage: string;
}

export interface Asset {
    audioUrl?: string;
    imageUrl?: string;
}

export interface AssetDefinition {
    id: string;
    type: 'character' | 'location' | 'style';
    name: string;
    description: string;
    referenceImage?: string;
    draftImage?: string;
    masterImage?: string;
    lastUpdated?: number;
}

// ====================
// Project Data (Persisted Domain State)
// ====================

export interface ProjectData {
    id: string;
    lastModified: number;

    // Step 1: Setup
    seriesName: string;
    episodeName: string;
    episodeNumber: number;
    seriesStory: string;
    mainCharacters: string;
    characters: Character[];
    seriesLocations: Location[];
    episodePlot: string;
    episodeCharacters: Character[];
    episodeLocations: Location[];
    targetDuration: number;
    aspectRatio: AspectRatio;
    apiKeys: ApiKeys;
    chatHistory: ChatMessage[];

    // Step 2: Style & Asset Definition
    masterStyle: MasterStyle;
    styleAnchor: StyleAnchor;
    assetDefinitions: Record<string, AssetDefinition>;

    // Step 3: Thumbnail
    thumbnailUrl: string | null;
    thumbnailSettings: ThumbnailSettings;

    // Step 4: Script
    script: ScriptCut[];
    ttsModel: TtsModel;
    imageModel: ImageModel;

    // Step 5: Production
    assets: Record<number, Asset>;

    // Navigation (could move to UI state)
    currentStep: number;
}

// ====================
// UI State (Ephemeral)
// ====================

export interface UIState {
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    isHydrated: boolean;
    debugMessage: string;
}

// ====================
// Project Metadata (For List View)
// ====================

export interface ProjectMetadata {
    id: string;
    seriesName: string;
    episodeName: string;
    episodeNumber: number;
    lastModified: number;
    thumbnailUrl: string | null;
}
