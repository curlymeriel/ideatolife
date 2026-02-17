// UnifiedStudio Types
// Consolidates types from ChannelArtModal, AssetGenerationModal, VisualSettingsStudio

import type { AspectRatio } from '../../store/types';
import type { ScriptCut } from '../../services/gemini';

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface TaggedReference {
    id: string;
    url: string;
    categories: string[];
    name?: string;
    isAuto?: boolean;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    image?: string;
    suggestedPrompt?: string;
    timestamp: number;
}

export const DEFAULT_CATEGORIES = [
    { value: 'face', label: '얼굴' },
    { value: 'style', label: '화풍/스타일' },
    { value: 'costume', label: '의상' },
    { value: 'hair', label: '헤어' },
    { value: 'color', label: '색감' },
    { value: 'background', label: '배경' },
    { value: 'composition', label: '구도' },
];

export const ASSET_CATEGORIES = [
    { value: 'face', label: '얼굴 / Face' },
    { value: 'body', label: '신체 / Body' },
    { value: 'costume', label: '의상 / Costume' },
    { value: 'props', label: '소품 / Props' },
    { value: 'style', label: '스타일 / Style' },
    { value: 'color', label: '색감 / Color' },
    { value: 'pose', label: '포즈 / Pose' },
    { value: 'background', label: '배경 / Background' },
];

// ============================================================================
// RESULT TYPES (per mode)
// ============================================================================

export interface ChannelArtResult {
    url: string;
    prompt: string;
}

export interface AssetGenerationResult {
    description: string;
    taggedReferences: TaggedReference[];
    selectedDraft: string | null;
    draftHistory: string[];
}

export interface VisualSettingsResult {
    visualPrompt: string;
    visualPromptKR?: string;
    videoPrompt?: string;
    finalImageUrl: string | null;
    draftHistory: string[];
    taggedReferences: TaggedReference[];
}

// ============================================================================
// MODE-SPECIFIC CONFIGS (Discriminated Union)
// ============================================================================

export interface ChannelArtConfig {
    mode: 'channelArt';
    type: 'banner' | 'profile';
    channelName: string;
    initialPrompt: string;
    initialUrl?: string;
    strategyContext: string;
    characters?: Array<{ name: string }>;
    onSave: (url: string, prompt: string) => void;
}

export interface AssetConfig {
    mode: 'asset';
    assetId: string;
    assetType: 'character' | 'location' | 'prop';
    assetName: string;
    initialDescription: string;
    initialReferenceImage?: string | null;
    initialDraftImage?: string | null;
    aspectRatio: string;
    projectContext?: string;
    existingAssets?: { id: string; name: string; url: string; type: string }[];
    onSave: (result: AssetGenerationResult) => void;
}

export interface VisualConfig {
    mode: 'visual';
    cutId: number;
    cutIndex: number;
    initialVisualPrompt: string;
    initialVisualPromptKR?: string;
    initialFinalImageUrl?: string;
    initialVideoPrompt?: string;
    aspectRatio: AspectRatio;
    assetDefinitions: any;
    existingCuts?: ScriptCut[];
    autoMatchedAssets?: any[];
    manualAssetObjs?: any[];
    initialSpeaker?: string;
    initialDialogue?: string;
    onSave: (result: VisualSettingsResult) => void;
}

export type StudioModeConfig = ChannelArtConfig | AssetConfig | VisualConfig;

// ============================================================================
// UNIFIED PROPS
// ============================================================================

export interface UnifiedStudioProps {
    isOpen: boolean;
    onClose: () => void;
    apiKey: string;
    masterStyle?: string;
    config: StudioModeConfig;
}
