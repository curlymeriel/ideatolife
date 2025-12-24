import type { ScriptCut, ChatMessage } from '../services/gemini';

// ====================
// Domain Types
// ====================

export type TtsModel = 'standard' | 'wavenet' | 'neural2' | 'chirp3-hd' | 'gemini-tts';
export type ImageModel = 'gemini-1.5-flash' | 'gemini-2.0-flash-exp' | 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3.0-pro';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2.35:1';

export interface ApiKeys {
    gemini: string;
    googleCloud: string;
    elevenLabs: string;
    elevenLabsModelId: string;
    freesound?: string;  // Freesound.org API key for SFX search
}

export interface Character {
    id: string;
    name: string;
    role: string;
    description: string;
    visualSummary?: string;          // NEW: Pure visual description for Step 2
    gender?: 'male' | 'female' | 'other';   // Character gender
    age?: 'child' | 'young' | 'adult' | 'senior';  // Character age category
    voiceId?: string;                       // e.g., 'en-US-Neural2-C' or 'ko-KR-Chirp3-HD-Aoede'
    voiceLanguage?: 'en-US' | 'ko-KR';      // Voice language
    voicePitch?: string;                    // e.g., '+2st', '-1st' (Neural2 only)
    voiceRate?: string;                     // e.g., '110%', 'slow'
}

export interface Location {
    id: string;
    name: string;
    description: string;
    visualSummary?: string;  // NEW: Pure visual description
}

export interface Prop {
    id: string;
    name: string;
    description: string;
    visualSummary?: string;
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
    mode: 'framing' | 'ai-gen';
    scale: number;
    imagePosition: { x: number; y: number };
    textPosition: { x: number; y: number };
    titleSize: number;
    epNumSize: number;
    textColor: string;
    fontFamily: string;
    frameImage: string;
    aiPrompt?: string;
    aiTitle?: string;
    selectedReferenceIds?: string[];
    styleReferenceId?: string;
}

export interface Asset {
    audioUrl?: string;
    imageUrl?: string;
}

export interface AssetDefinition {
    id: string;
    type: 'character' | 'location' | 'prop' | 'style';
    name: string;
    description: string;
    referenceImage?: string;
    draftImage?: string;
    masterImage?: string;
    lastUpdated?: number;
}

export interface StorylineScene {
    id: string;
    sceneNumber: number;
    estimatedTime: string;  // e.g., '1:00 - 2:30'
    content: string;         // Scene summary/content
    directionNotes: string;  // Visual direction notes
}

export interface VisualAsset {
    id: string;              // character or location ID
    type: 'character' | 'location';
    name: string;
    visualPrompt: string;    // Detailed visual description
    previewImageUrl?: string; // Small preview image
    isConfirmed: boolean;    // Whether this is finalized for Step 3
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
    seriesProps: Prop[];     // NEW
    episodeProps: Prop[];    // NEW
    storylineTable?: StorylineScene[];  // NEW: Structured storyline table
    targetDuration: number;
    aspectRatio: AspectRatio;
    apiKeys: ApiKeys;
    chatHistory: ChatMessage[];

    // Step 2: Style & Asset Definition
    masterStyle: MasterStyle;
    styleAnchor: StyleAnchor;
    assetDefinitions: Record<string, AssetDefinition>;
    visualAssets?: Record<string, VisualAsset>;  // NEW: Visual prompts for characters/locations

    // Step 3: Thumbnail
    thumbnailUrl: string | null;
    thumbnailPreview?: string | null;  // Small preview for Dashboard cards
    thumbnailSettings: ThumbnailSettings;

    // Step 4: Script
    script: ScriptCut[];
    ttsModel: TtsModel;
    imageModel: ImageModel;

    // Step 5: Production
    assets: Record<string, Asset[]>;

    // Navigation (could move to UI state)
    currentStep: number;
    // Metadata for dashboard performance
    cachedProgress?: {
        workflowPercent: number;
        scriptLength: number;
        scriptConfirmed: number;
        assetsTotal: number;
        assetsDefined: number;
    };
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
    // Cached progress data for Dashboard (avoid loading full project)
    cachedProgress?: {
        workflowPercent: number;    // 0-100
        scriptLength: number;
        scriptConfirmed: number;
        assetsTotal: number;
        assetsDefined: number;
        completedStepsCount?: number;
    };
    storylineTable?: StorylineScene[];
    currentStep?: number;
}
