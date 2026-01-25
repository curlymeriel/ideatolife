import type { ScriptCut, ChatMessage } from '../services/gemini';

// ====================
// Domain Types
// ====================

export type TtsModel = 'standard' | 'wavenet' | 'neural2' | 'chirp3-hd' | 'gemini-tts';
export type ImageModel = 'gemini-1.5-flash' | 'gemini-2.0-flash-exp' | 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-flash-image' | 'gemini-2.5-pro' | 'gemini-3.0-pro' | 'gemini-3-pro-image-preview' | 'gemini-3-flash-preview';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2.35:1' | '4:5' | '21:9' | '4:3' | '3:4';

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
    episodeTitle?: string;
    seriesTitle?: string;
    seriesTitleSize?: number;
    textAlign?: 'left' | 'center' | 'right';
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
// YouTube Trend Analyzer Types (Step 0)
// ====================

export type RegionCode = 'KR' | 'JP' | 'FR' | 'DE' | 'ES' | 'US' | 'Global';

export interface YouTubeTrendTopic {
    id: string;
    topic: string;                    // 원문 주제/해시태그
    translatedTopic?: string;         // 한국어 번역
    topicMeaning?: string;            // 키워드의 의미/설명 (한국어)
    topicType: 'hashtag' | 'keyword' | 'category'; // 해시태그 vs 키워드 vs 주제 분류
    avgViews: number;
    avgEngagement: number;            // (좋아요 + 댓글) / 조회수
    videoCount: number;
    thumbnailUrl?: string;
    relatedVideos?: YouTubeTrendVideo[]; // 트렌드를 생성한 원본 영상들
}

// YouTube 카테고리 (2025년 정책 변경 반영)
export interface YouTubeCategory {
    id: string;
    title: string;
    assignable: boolean;
}

// YouTube 카테고리 ID 상수 (자주 쓰이는 주요 카테고리 확장)
export type YouTubeCategoryId = '1' | '2' | '10' | '15' | '17' | '19' | '20' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '44';

export const YOUTUBE_CATEGORIES: Record<YouTubeCategoryId, { title: string; icon: string }> = {
    '1': { title: '영화/애니', icon: '🎬' },
    '2': { title: '자동차', icon: '🚗' },
    '10': { title: '음악', icon: '🎵' },
    '15': { title: '동물', icon: '🐶' },
    '17': { title: '스포츠', icon: '⚽' },
    '19': { title: '여행/이벤트', icon: '✈️' },
    '20': { title: '게임', icon: '🎮' },
    '22': { title: '블로그/인물', icon: '👤' },
    '23': { title: '코미디', icon: '😂' },
    '24': { title: '엔터테인먼트', icon: '🎭' },
    '25': { title: '뉴스/정치', icon: '📰' },
    '26': { title: '노하우/스타일', icon: '💄' },
    '27': { title: '교육', icon: '📚' },
    '28': { title: '과학/기술', icon: '🔬' },
    '44': { title: '예고편', icon: '🎞️' },
};

export interface YouTubeTrendVideo {
    id: string;
    title: string;
    titleKorean?: string;
    channelName: string;
    channelId: string;
    categoryId?: string;        // Official YouTube category ID (e.g., '20' for Gaming)
    categoryName?: string;      // Category name (e.g., 'Gaming')
    thumbnailUrl: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    publishedAt: string;
    duration?: string;
    analysis?: {
        hookStyle?: string;
        thumbnailKeyElements?: string;
        titlePattern?: string;
    };
}

// 워크플로우 연동을 위한 분석 결과 타입
export interface TrendAnalysisInsights {
    thumbnail: {
        colorScheme?: string;
        textStyle?: string;
        composition?: string;
        faceExpression?: string;      // 표정/구도 분석
        recommendations: string[];
    };
    title: {
        keywords?: string;            // 주요 키워드
        length?: string;              // 제목 길이 패턴
        emotionalTriggers?: string;   // 감정 트리거 (숫자, 질문, 충격)
        recommendations: string[];
    };
    storytelling: {
        hookMethods?: string;         // 0~10초 후킹 기법
        narrativeStructure?: string;
        cameraWorkPatterns?: string;
        recommendations: string[];
    };
    videoLength?: {
        avgDuration?: string;         // 평균 영상 길이
        optimalRange?: string;        // 최적 길이 범위
        recommendations: string[];
    };
    uploadSchedule?: {
        bestDays?: string;            // 최적 업로드 요일
        bestTimes?: string;           // 최적 업로드 시간
        frequency?: string;           // 업로드 주기
        recommendations: string[];
    };
}

// 채널 분석 타입
export interface ChannelAnalysis {
    channelId: string;
    channelName: string;
    channelThumbnail?: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    avgViews: number;
    avgEngagement: number;
    topVideos: YouTubeTrendVideo[];
    recentVideos: YouTubeTrendVideo[];
    description?: string;
    keywords?: string;
    publishedAt?: string;
    country?: string;
    improvementSuggestions?: {
        thumbnail: string[];
        title: string[];
        content: string[];
        uploadSchedule?: string;
    };
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
    productionChatHistory?: ChatMessage[]; // NEW: For Step 3 Assistant Director

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

    // Step 0: Market Research Insights (from YouTube Trend Analyzer)
    trendInsights?: {
        storytelling?: string;   // Step 1 → Step 3 전달용 (후킹멘트, 스토리 전개, 카메라워크)
        thumbnail?: string;      // Step 5 전달용 (썸네일 색감, 텍스트, 구도)
        target?: string;         // Target audience profile
        vibe?: string;           // Overall vibe/mood guide
        references?: string[];    // Benchmark video links
        appliedAt?: number;      // 적용 시간
    };
}

// ====================
// Intelligence Layer Entities (Phase 1-3)
// ====================

export interface TrendSnapshot {
    id: string;
    createdAt: number;
    queryContext: string;
    keywords: string[];
    description: string;
    trendTopics: YouTubeTrendTopic[];
    channels?: ChannelAnalysis[];
    rawData?: any;
}

export interface StrategicAnalysis {
    targetAudience: string;
    hookPatterns: string[];
    visualStrategies: string[];
    emotionalTriggers: string[];
    competitiveEdges: string[];
    contentGapOpportunities: string[];
}

export interface CompetitorSnapshot {
    id: string;
    createdAt: number;
    trendSnapshotId?: string;
    focusKeywords: string[];
    competitorChannels: ChannelAnalysis[];
    competitorVideos: YouTubeTrendVideo[];
    summary: string;
    analysis?: StrategicAnalysis; // NEW: Deep Research results
}

export interface StrategyInsight {
    id: string;
    createdAt: number;
    trendSnapshotId?: string;
    competitorSnapshotId?: string;
    executiveSummary: string;
    masterStyle?: string; // NEW: Recommended visual style for the channel
    keyOpportunities: string[];
    keyRisks: string[];
    recommendedPillars: { pillarName: string; reason: string }[];
    recommendedSeries: {
        id: string;
        title: string;
        description: string;
        targetPillar: string;
        expectedAudience: string;
        benchmarkVideos: string[];
        episodes: { // NEW: Nested Episodes
            id: string;
            ideaTitle: string;
            oneLiner: string;
            angle: string;
            format: string;
            notes?: string;
        }[];
    }[];
    // recommendedEpisodes removed from here
    characters?: {
        name: string;
        role: string;
        personality: string;
        visualGuide: string;
        age?: string | number;
    }[];
    techStack?: {
        phase: string;
        tool: string;
        usage: string;
    }[];
    marketingStrategy?: {
        kpis: string[];
        viralElements: string[];
        interactiveIdeas?: string[];
    };
    channelIdentity?: ChannelIdentity; // NEW: Branding & Identity
}

export interface ChannelIdentity {
    channelName: string;
    handle: string;
    bio: string;
    slogan?: string;         // NEW: Catchy slogan
    coreValues?: string[];   // NEW: Branding values
    mission?: string;        // NEW: Core purpose of the channel
    targetAudience?: string; // NEW: Detailed description of who this is for
    toneOfVoice?: string;    // NEW: Style of communication
    colorPalette: string[];
    bannerPrompt?: string;
    bannerUrl?: string;
    profilePrompt?: string;
    profileUrl?: string;
    seoTags?: string[];
    hashtags?: string[];
    introText?: string;
}

export interface IdeaPoolItem {
    id: string;
    createdAt: number;
    title: string;
    description: string;
    source: 'Phase3' | 'Manual' | 'AI';
    sourceId?: string; // e.g., strategyInsightId
    category?: string; // e.g., pillar name
    status: 'pending' | 'in_progress' | 'completed';
    metadata?: {
        targetAudience?: string;
        angle?: string;
        format?: string;
        notes?: string;
        seriesTitle?: string;       // NEW: Pre-discussed series title
        seriesDescription?: string; // NEW: Pre-discussed series description
        characters?: any[];         // NEW: Strategic characters to carry over
    };
};

export interface IdeaItem {
    id: string;
    title: string;
    description: string;
    status: 'collecting' | 'researching' | 'ready' | 'dropped';
    strategyInsightId?: string;
    research?: IdeaResearch;
    createdAt: number;
}

export interface IdeaResearch {
    id: string;
    ideaId: string;
    query: string;
    summary: string;
    keyInsights: string[];
    references: { title: string; url: string }[];
    strategyNotes: string;
    createdAt: number;
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
