import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Draggable from 'react-draggable';
import { Mic, Loader2, Play, Square, ImageIcon as Image, X, Plus, HelpCircle, Waves, Volume2, Settings, Trash2, Sparkles, ChevronDown, ChevronUp, RotateCcw, Languages, Maximize2 } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import { generateVideoMotionPrompt, generateText, type VideoMotionContext } from '../../services/gemini';
import { DEFAULT_MOTION_PRESETS, getPresetsByCategory } from '../../data/motionPresets';
import { getMatchedAssets } from '../../utils/assetUtils';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import type { AspectRatio } from '../../store/types';
import { UnifiedStudio, type VisualSettingsResult } from '../UnifiedStudio';
import { ReferenceSelectorModal } from '../ReferenceSelectorModal';

// Comprehensive Visual prompt helper terms (영문약어: 한글설명)
const VISUAL_TERMS = {
    'Camera Angle (카메라 앵글)': [
        { term: 'Low Angle Shot (LAS)', desc: '피사체를 아래에서 올려다보는 앵글. 대상에게 권위감, 위압감, 영웅적 느낌 부여' },
        { term: 'High Angle Shot (HAS)', desc: '피사체를 위에서 내려다보는 앵글. 취약함, 왜소함, 감시당하는 느낌 연출' },
        { term: 'Dutch Angle / Canted Angle', desc: '카메라를 기울인 촬영. 불안, 혼란, 심리적 불균형 표현에 효과적' },
        { term: 'Eye Level Shot', desc: '눈높이 수평 촬영. 가장 자연스럽고 중립적인 앵글' },
        { term: "Bird's Eye View (BEV)", desc: '피사체 바로 위에서 수직 하강 촬영. 신의 시점, 전체 상황 조망' },
        { term: "Worm's Eye View", desc: '땅에서 올려다보는 극단적 저각. 건물/거인 강조, 왜곡된 원근감' },
        { term: 'Over-the-Shoulder (OTS)', desc: '한 인물의 어깨 너머로 다른 인물을 촬영. 대화 장면에 필수' },
        { term: 'Point of View (POV)', desc: '캐릭터의 1인칭 시점. 관객이 캐릭터와 동일시' },
    ],
    'Shot Size (샷 사이즈)': [
        { term: 'Extreme Close-Up (ECU/XCU)', desc: '얼굴 일부(눈, 입술, 손)만 화면 가득. 극도의 감정/디테일 강조' },
        { term: 'Close-Up (CU)', desc: '얼굴 전체 또는 중요 오브젝트. 감정 표현, 관객과의 친밀감' },
        { term: 'Medium Close-Up (MCU)', desc: '가슴~머리. 대화 장면의 기본, 표정과 제스처 동시 포착' },
        { term: 'Medium Shot (MS)', desc: '허리~머리. 인물의 행동과 표정 균형있게 보여줌' },
        { term: 'Medium Long Shot (MLS) / Cowboy Shot', desc: '무릎~머리. 서부극에서 총집 보이게 촬영해서 유래' },
        { term: 'Full Shot (FS)', desc: '발끝~머리 전신. 인물의 전체 행동, 의상, 체형 파악' },
        { term: 'Long Shot (LS) / Wide Shot (WS)', desc: '인물 + 주변 환경. 인물과 공간의 관계 설정' },
        { term: 'Extreme Long Shot (ELS/XLS)', desc: '매우 넓은 풍경, 인물 극히 작게. 스케일, 고립감, 서사시적 느낌' },
        { term: 'Two Shot', desc: '두 인물을 한 프레임에. 캐릭터 관계 시각화' },
        { term: 'Group Shot', desc: '여러 인물을 한 프레임에. 집단 역학 표현' },
    ],
    'Lighting (조명)': [
        { term: 'Chiaroscuro Lighting', desc: '명암 대비 극대화. 르네상스 회화 기법, 드라마틱/미스터리 분위기' },
        { term: 'Rembrandt Lighting', desc: '얼굴 한쪽에 삼각형 빛. 고전적 초상화 조명' },
        { term: 'Rim/Back Lighting', desc: '피사체 뒤에서 윤곽선 강조. 신비로움, 실루엣 효과' },
        { term: 'Soft Diffused Lighting', desc: '부드럽게 확산된 빛. 로맨틱, 몽환적, 플래터링한 인물 촬영' },
        { term: 'Hard Direct Lighting', desc: '강렬한 직사광. 선명한 그림자, 거친/극적 분위기' },
        { term: 'Golden Hour Lighting', desc: '일출/일몰 황금빛. 따뜻함, 향수, 로맨스' },
        { term: 'Blue Hour Lighting', desc: '해지기 직후 푸른빛. 차가움, 고요함, 우울함' },
        { term: 'Neon/Cyberpunk Lighting', desc: '네온사인 다색광. 미래적, 도시적, 사이버펑크 미학' },
        { term: 'Practical Lighting', desc: '화면 내 조명(램프, 촛불 등) 활용. 자연스러운 분위기' },
        { term: 'Three-Point Lighting', desc: 'Key/Fill/Back 3점 조명. 기본적인 스튜디오 조명 설정' },
    ],
    'Atmosphere & Effects (분위기/효과)': [
        { term: 'Volumetric Fog/Lighting', desc: '빛줄기가 보이는 안개. 신비로움, 영적 분위기' },
        { term: 'Dust Particles', desc: '공기 중 먼지 입자. 오래된 공간, 시간의 흐름 표현' },
        { term: 'Lens Flare', desc: '렌즈에 반사된 빛. 태양광, 신비로움, J.J. 에이브럼스 스타일' },
        { term: 'Bokeh Effect', desc: '전경/배경 흐림으로 피사체 강조. 빛망울 효과' },
        { term: 'Motion Blur', desc: '움직임에 의한 잔상. 속도감, 긴박함' },
        { term: 'Depth of Field (DoF)', desc: '초점 심도. Shallow=배경 흐림, Deep=전체 선명' },
        { term: 'Silhouette', desc: '역광으로 형태만 보임. 미스터리, 익명성, 드라마틱' },
        { term: 'Reflection', desc: '거울, 물, 유리 등에 반사. 이중성, 자아성찰' },
        { term: 'Rain/Water Droplets', desc: '비, 물방울 효과. 슬픔, 정화, 극적 분위기' },
    ],
    'Composition (구도)': [
        { term: 'Rule of Thirds', desc: '화면 9등분, 교차점에 주요 요소 배치. 기본 구도 법칙' },
        { term: 'Center Composition', desc: '주요 피사체 정중앙. 권위, 안정감, 대칭미' },
        { term: 'Symmetrical Composition', desc: '좌우대칭 구도. 질서, 형식미, 웨스 앤더슨 스타일' },
        { term: 'Leading Lines', desc: '선(도로, 건물 등)이 시선을 유도. 깊이감, 방향성' },
        { term: 'Frame within Frame', desc: '문, 창문 등으로 프레임 속 프레임. 고립, 관음, 집중' },
        { term: 'Negative Space', desc: '빈 공간 활용. 고독, 미니멀리즘, 여백의 미' },
        { term: 'Foreground Interest', desc: '전경 요소로 깊이감 추가. 레이어링' },
    ],
    'Color & Mood (색감/분위기)': [
        { term: 'Warm Color Palette', desc: '따뜻한 색조(주황, 노랑, 빨강). 친밀함, 에너지, 열정' },
        { term: 'Cool Color Palette', desc: '차가운 색조(파랑, 녹색, 보라). 차분함, 슬픔, 미스터리' },
        { term: 'Desaturated/Muted Colors', desc: '채도 낮은 색감. 우울, 현실적, 빈티지' },
        { term: 'High Contrast', desc: '명암 대비 강함. 드라마틱, 누아르' },
        { term: 'Low Contrast', desc: '명암 대비 약함. 부드러움, 몽환적' },
        { term: 'Monochromatic', desc: '단색 톤. 통일감, 무드 강조' },
    ]
};

export interface CutItemProps {
    cut: ScriptCut;
    index: number;
    isAudioConfirmed: boolean;
    isImageConfirmed: boolean;
    showAssetSelector: boolean;
    assetDefinitions: any;
    localScript: ScriptCut[];
    audioLoading: boolean;
    imageLoading: boolean;
    playingAudio: number | string | null;
    aspectRatio: AspectRatio;
    speakerList: string[];
    ttsModel?: string;
    onToggleAudioConfirm: (id: number | string) => void;
    onToggleImageConfirm: (id: number | string) => void;
    onUpdateCut: (id: number | string, updates: Partial<ScriptCut>) => void;
    onGenerateAudio: (id: number | string, dialogue: string) => void;
    onPlayAudio: (id: number | string) => void;
    onGenerateImage: (id: number | string, prompt: string) => void;
    onAddAsset: (cutId: number | string, assetId: string) => void;
    onRemoveAsset: (cutId: number | string, assetId: string) => void;
    onAddReference?: (cutId: number | string, refId: number | string) => void;
    onRemoveReference?: (cutId: number | string, refId: number | string) => void;
    onToggleAssetSelector: (cutId: number | string) => void;
    onCloseAssetSelector: () => void;
    onSave: () => void;
    onDelete: (id: number | string) => void;
    onMove: (id: number | string, direction: 'up' | 'down') => void;
    onInsert: (id: number | string) => void;
    onOpenSfxModal?: (cutId: number | string) => void;
    onRemoveSfx?: (cutId: number | string) => void;
    onUploadUserReference?: (cutId: number | string, file: File) => Promise<void>;
    apiKey?: string;
    masterStyle?: string;
}

export const CutItem = memo(({
    cut,
    index,
    isAudioConfirmed,
    isImageConfirmed,
    showAssetSelector,
    assetDefinitions,
    aspectRatio,
    speakerList,
    imageLoading,
    audioLoading,
    playingAudio,
    localScript,
    onToggleAudioConfirm,
    onToggleImageConfirm,
    onUpdateCut,
    onGenerateAudio,
    onPlayAudio,
    onGenerateImage,
    onAddAsset,
    onRemoveAsset,
    onAddReference,
    onRemoveReference,
    onToggleAssetSelector,
    onCloseAssetSelector,
    onSave,
    onDelete,
    onMove,
    onInsert,
    onOpenSfxModal,
    onRemoveSfx,
    onUploadUserReference,
    apiKey,
    masterStyle
}: CutItemProps) => {
    // Local state for debounced inputs
    const [localDialogue, setLocalDialogue] = useState(cut.dialogue || '');
    const [localVisualPrompt, setLocalVisualPrompt] = useState(cut.visualPrompt || '');
    const [localActingDirection, setLocalActingDirection] = useState(cut.actingDirection || '');
    const isFocusedRef = useRef(false);
    const isActingDirectionFocusedRef = useRef(false);
    const isVisualPromptFocusedRef = useRef(false);
    const visualPanelRef = useRef<HTMLDivElement>(null);

    // Resolved URLs for IndexedDB
    const [resolvedImageUrl, setResolvedImageUrl] = useState<string | undefined>(undefined);
    const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | undefined>(undefined);
    const [actualAudioDuration, setActualAudioDuration] = useState<number | undefined>(undefined);

    // Panel expand states - Default to collapsed
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [showTermHelper, setShowTermHelper] = useState(false);
    const [isAudioManualExpand, setIsAudioManualExpand] = useState(false);
    const [isVisualManualExpand, setIsVisualManualExpand] = useState(false);
    // Image preview starts collapsed when no image exists
    const [isImagePreviewExpanded, setIsImagePreviewExpanded] = useState(!!cut.finalImageUrl);
    // Visual Settings Studio fullscreen modal
    const [showVisualStudio, setShowVisualStudio] = useState(false);

    // Track image loading state to detect completion
    const prevImageLoadingRef = useRef(imageLoading);
    useEffect(() => {
        // When loading finishes (true -> false) and we actually have an image
        if (prevImageLoadingRef.current && !imageLoading && cut.finalImageUrl) {
            setIsVisualManualExpand(true);
            setIsImagePreviewExpanded(true); // Auto-expand preview when image is generated
        }
        prevImageLoadingRef.current = imageLoading;
    }, [imageLoading, cut.finalImageUrl]);

    // Auto-collapse when confirmed
    useEffect(() => {
        if (isAudioConfirmed) {
            setIsAudioManualExpand(false);
        }
    }, [isAudioConfirmed]);

    useEffect(() => {
        if (isImageConfirmed) {
            setIsVisualManualExpand(false);
        }
    }, [isImageConfirmed]);

    const isAudioVisible = isAudioManualExpand;

    // Keep local state in sync with store, BUT only if not focused
    useEffect(() => {
        if (!isFocusedRef.current) {
            const storeDialogue = cut.dialogue || '';
            if (storeDialogue !== localDialogue) {
                // [CRITICAL] Protect any dialogue with line breaks from being overwritten
                // by a "flat" version from the store. If local has MORE newlines than store,
                // the store likely received stale data - push local back to fix it.
                const localNewlines = (localDialogue.match(/\n/g) || []).length;
                const storeNewlines = (storeDialogue.match(/\n/g) || []).length;
                if (localNewlines > 0 && storeNewlines < localNewlines) {
                    console.warn(`[CutItem] 🛡️ Blocking sync that would reduce newlines for cut ${cut.id}. Local: ${localNewlines}, Store: ${storeNewlines}. Pushing local back to store.`);
                    // Push local state back to store to fix the discrepancy
                    onUpdateCut(cut.id, { dialogue: localDialogue });
                    return;
                }
                setLocalDialogue(storeDialogue);
            }
        }
    }, [cut.dialogue, cut.id]);

    useEffect(() => {
        if (!isVisualPromptFocusedRef.current) setLocalVisualPrompt(cut.visualPrompt || '');
    }, [cut.visualPrompt]);

    useEffect(() => {
        if (!isActingDirectionFocusedRef.current) {
            setLocalActingDirection(cut.actingDirection || '');
        }
    }, [cut.actingDirection, cut.id]);

    // Resolve IDB and Firebase URLs
    useEffect(() => {
        if (cut.finalImageUrl) {
            resolveUrl(cut.finalImageUrl).then(url => setResolvedImageUrl(url || undefined));
        } else {
            setResolvedImageUrl(undefined);
        }
    }, [cut.finalImageUrl]);

    useEffect(() => {
        if (cut.audioUrl) {
            resolveUrl(cut.audioUrl, { asBlob: true }).then(url => {
                if (url) console.log(`[CutItem ${cut.id}] 🔊 Resolved audio URL: ${url.substring(0, 50)}...`);
                setResolvedAudioUrl(url || undefined);
            }).catch(err => {
                console.error(`[CutItem ${cut.id}] ❌ Failed to resolve audio:`, err);
            });
        } else {
            setResolvedAudioUrl(undefined);
        }

        // Memory is managed by blobUrlCache globally in imageStorage.ts
        // Do NOT revoke locally as it breaks caching across navigations
    }, [cut.audioUrl]);

    // Resolved URLs for IndexedDB removed unused userRef

    // Debounced dialogue update
    const dialogueDebounceRef = useRef<any>(null);
    const flushDialogue = useCallback(() => {
        if (dialogueDebounceRef.current) {
            clearTimeout(dialogueDebounceRef.current);
            dialogueDebounceRef.current = null;
            onUpdateCut(cut.id, { dialogue: localDialogue });
        }
    }, [cut.id, localDialogue, onUpdateCut]);

    const handleDialogueChange = useCallback((value: string) => {
        setLocalDialogue(value);

        if (dialogueDebounceRef.current) clearTimeout(dialogueDebounceRef.current);
        dialogueDebounceRef.current = setTimeout(() => {
            dialogueDebounceRef.current = null;
            const hasNewline = value.includes('\n');
            if (hasNewline) {
                console.log(`[CutItem] 📝 Sending updated dialogue with \\n to parent. Length: ${value.length}`);
            }
            onUpdateCut(cut.id, { dialogue: value });
        }, 500); // 500ms debounce
    }, [cut.id, onUpdateCut]);

    // Debounced visual prompt update
    const visualDebounceRef = useRef<any>(null);
    const flushVisualPrompt = useCallback(() => {
        if (visualDebounceRef.current) {
            clearTimeout(visualDebounceRef.current);
            visualDebounceRef.current = null;
            onUpdateCut(cut.id, { visualPrompt: localVisualPrompt, visualPromptKR: undefined });
        }
    }, [cut.id, localVisualPrompt, onUpdateCut]);

    const handleVisualPromptChange = useCallback((value: string) => {
        setLocalVisualPrompt(value);

        if (visualDebounceRef.current) clearTimeout(visualDebounceRef.current);
        visualDebounceRef.current = setTimeout(() => {
            visualDebounceRef.current = null;
            onUpdateCut(cut.id, { visualPrompt: value, visualPromptKR: undefined });
        }, 500);
    }, [cut.id, onUpdateCut]);

    // Debounced acting direction update
    const actingDebounceRef = useRef<any>(null);
    const flushActingDirection = useCallback(() => {
        if (actingDebounceRef.current) {
            clearTimeout(actingDebounceRef.current);
            actingDebounceRef.current = null;
            onUpdateCut(cut.id, { actingDirection: localActingDirection });
        }
    }, [cut.id, localActingDirection, onUpdateCut]);

    const handleActingDirectionChange = useCallback((value: string) => {
        setLocalActingDirection(value);

        if (actingDebounceRef.current) clearTimeout(actingDebounceRef.current);
        actingDebounceRef.current = setTimeout(() => {
            actingDebounceRef.current = null;
            onUpdateCut(cut.id, { actingDirection: value });
        }, 500);
    }, [cut.id, onUpdateCut]);

    // Auto-generate video prompt from visual prompt (AI-powered)
    const [_isGeneratingMotion, setIsGeneratingMotion] = useState(false);
    const handleAutoGenerateVideoPrompt = useCallback(async () => {
        if (!apiKey) {
            // Fallback for no API key
            const basePrompt = cut.visualPrompt || '';
            const motionSuffix = '. Camera slowly pushes in. Subtle atmospheric motion. Character breathes naturally.';
            onUpdateCut(cut.id, { videoPrompt: basePrompt + motionSuffix });
            return;
        }

        setIsGeneratingMotion(true);
        try {
            // Build context from cut and asset definitions
            const speakerAsset = assetDefinitions ?
                Object.values(assetDefinitions).find((a: any) =>
                    a.type === 'character' && a.name?.toLowerCase() === cut.speaker?.toLowerCase()
                ) as any : null;

            // Find location from visual prompt mentions
            const locationAsset = assetDefinitions ?
                Object.values(assetDefinitions).find((a: any) =>
                    a.type === 'location' && cut.visualPrompt?.toLowerCase().includes(a.name?.toLowerCase())
                ) as any : null;

            const context: VideoMotionContext = {
                visualPrompt: cut.visualPrompt || '',
                dialogue: cut.dialogue,
                actingDirection: cut.actingDirection,
                emotion: cut.emotion,
                audioDuration: actualAudioDuration || cut.estimatedDuration,
                speakerInfo: speakerAsset ? {
                    name: speakerAsset.name,
                    visualFeatures: speakerAsset.visualSummary || speakerAsset.description,
                    gender: speakerAsset.gender
                } : undefined,
                locationInfo: locationAsset ? {
                    name: locationAsset.name,
                    visualFeatures: locationAsset.visualSummary || locationAsset.description
                } : undefined
            };

            console.log('[CutItem] Generating AI motion prompt with context:', context);
            const motionPrompt = await generateVideoMotionPrompt(context, apiKey);
            onUpdateCut(cut.id, { videoPrompt: motionPrompt });
            console.log('[CutItem] ✨ AI motion prompt generated:', motionPrompt.substring(0, 100) + '...');
        } catch (error) {
            console.error('[CutItem] Failed to generate AI motion prompt:', error);
            // Fallback to basic
            const basePrompt = cut.visualPrompt || '';
            onUpdateCut(cut.id, { videoPrompt: basePrompt + '. Camera slowly pushes in. Subtle atmospheric motion.' });
        } finally {
            setIsGeneratingMotion(false);
        }
    }, [cut.id, cut.visualPrompt, cut.dialogue, cut.actingDirection, cut.emotion, cut.speaker, actualAudioDuration, cut.estimatedDuration, assetDefinitions, apiKey, onUpdateCut]);

    // Auto-translate visual prompt (KR -> EN)
    const handleAutoTranslate = useCallback(() => {
        // TODO: Implement actual translation logic using Gemini service
        // For now, this is a placeholder to restore the UI element
        console.log('[CutItem] Auto-translate triggered');
        const current = localVisualPrompt;
        if (!current) return;
        // Mock behavior or call a parent handler if available
        // onTranslate?.(cut.id, current);
    }, [cut.id, localVisualPrompt]);

    // AI Visual Suggestion
    const [isSuggestingVisual, setIsSuggestingVisual] = useState(false);
    const handleAiVisualSuggest = useCallback(async () => {
        if (!apiKey) return;
        setIsSuggestingVisual(true);
        try {
            const prompt = `
            Act as a cinematographic expert. Create a concise, high-quality visual prompt for an image generation model (like Midjourney) based on this movie script cut.
            
            Context:
            - Speaker: ${cut.speaker}
            - Dialogue: "${cut.dialogue}"
            - Emotion: ${cut.emotion || 'Neutral'}
            - Action/Direction: ${cut.actingDirection || 'None'}
            
            Requirements:
            - Include camera angle, lighting, and atmosphere keywords.
            - Focus on visual storytelling.
            - English only.
            - Max 50 words.
            - Direct description only, no "Here is the prompt" prefix.
            `;

            const suggestion = await generateText(prompt, apiKey);
            if (suggestion) {
                const finalPrompt = suggestion.trim();
                onUpdateCut(cut.id, { visualPrompt: finalPrompt });
                setLocalVisualPrompt(finalPrompt);
            }
        } catch (error) {
            console.error('Failed to suggest visual prompt:', error);
        } finally {
            setIsSuggestingVisual(false);
        }
    }, [apiKey, cut.speaker, cut.dialogue, cut.emotion, cut.actingDirection, onUpdateCut, cut.id]);

    // Asset matching
    const manualAssets = cut.referenceAssetIds || [];
    const allMatchedResults = useMemo(() =>
        getMatchedAssets(cut.visualPrompt || '', manualAssets, assetDefinitions, cut.id),
        [cut.visualPrompt, manualAssets, assetDefinitions, cut.id]);

    // Extract actual asset objects
    // 1. Manual always comes directly from the ID list
    const manualAssetObjs = useMemo(() => {
        if (!assetDefinitions) return [];
        const result = manualAssets.map(id => assetDefinitions[id]).filter(Boolean);
        console.log(`[CutItem ${cut.id}] manualAssets ids:`, manualAssets, 'asset definitions keys:', Object.keys(assetDefinitions), 'resolved:', result);
        return result;
    }, [manualAssets, assetDefinitions, cut.id]);

    // 2. Auto matches come from the helper, but we filter out ones that are already manually added
    const autoMatchedAssets = useMemo(() => {
        return allMatchedResults
            .map((match: any) => match.asset)
            .filter((asset: any) => !manualAssets.includes(asset.id));
    }, [allMatchedResults, manualAssets]);


    // Calculated values
    const hasImage = !!cut.finalImageUrl;
    const hasAudio = !!cut.audioUrl || cut.speaker === 'SILENT';
    const hasRealAudio = !!cut.audioUrl && cut.speaker !== 'SILENT';
    const isFullyConfirmed = isAudioConfirmed && isImageConfirmed;

    // Display duration
    const audioDuration = actualAudioDuration || cut.estimatedDuration || 0;
    const padding = cut.audioPadding ?? 0.5;
    const totalDuration = audioDuration + padding;
    const displayTotalDuration = totalDuration.toFixed(1);

    // Aspect Ratio Class Mapping
    const getAspectRatioClass = (ratio: string) => {
        switch (ratio) {
            case '9:16': return 'aspect-[9/16]';
            case '1:1': return 'aspect-square';
            case '2.35:1': return 'aspect-[2.35/1]';
            case '21:9': return 'aspect-[21/9]';
            case '4:3': return 'aspect-[4/3]';
            case '3:4': return 'aspect-[3/4]';
            case '4:5': return 'aspect-[4/5]';
            default: return 'aspect-video'; // 16:9
        }
    };


    return (
        <div
            className={`glass-panel relative group overflow-hidden flex flex-col ${isFullyConfirmed ? 'border-green-500/50 bg-green-500/5' : 'hover:border-[var(--color-primary-dim)]'} ${showAssetSelector ? 'z-50' : 'z-0'}`}
        >
            {/* 1. HEADER ROW: Number + Action Buttons */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] border shrink-0 ${isFullyConfirmed ? 'bg-green-500 text-black border-green-500' : 'bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-border)]'}`}>
                        {index + 1}
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Audio Lock */}
                    <button
                        onClick={() => onToggleAudioConfirm(cut.id)}
                        disabled={!hasAudio && cut.speaker !== 'SILENT'}
                        className={`p-1.5 rounded transition-all ${isAudioConfirmed ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'}`}
                        title={isAudioConfirmed ? 'Unlock Audio' : 'Lock Audio'}
                    >
                        <Mic size={14} />
                    </button>
                    {/* Image Lock */}
                    <button
                        onClick={() => onToggleImageConfirm(cut.id)}
                        disabled={!hasImage}
                        className={`p-1.5 rounded transition-all ${isImageConfirmed ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'}`}
                        title={isImageConfirmed ? 'Unlock Image' : 'Lock Image'}
                    >
                        <Image size={14} />
                    </button>

                    <div className="w-[1px] h-4 bg-white/10 mx-1" />

                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(cut.id, 'up'); }}
                        className="p-1.5 text-gray-500 hover:text-[var(--color-primary)] hover:bg-white/5 rounded transition-colors"
                        title="Move Up"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(cut.id, 'down'); }}
                        className="p-1.5 text-gray-500 hover:text-[var(--color-primary)] hover:bg-white/5 rounded transition-colors"
                        title="Move Down"
                    >
                        <ChevronDown size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onInsert(cut.id); }}
                        className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                        title="Insert New Cut After"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this cut?')) {
                                onDelete(cut.id);
                            }
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete Cut"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* 2. IMAGE PREVIEW: Collapsible - Default collapsed when no image */}
            {hasImage || isImagePreviewExpanded ? (
                <div className={`relative w-full ${getAspectRatioClass(aspectRatio)} bg-black/40 border-b border-white/10 flex items-center justify-center group/img`}>


                    {hasImage ? (
                        <img src={resolvedImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-600">
                            <Image size={48} className="opacity-20" />
                            <button
                                onClick={() => onGenerateImage(cut.id, cut.visualPrompt || '')}
                                disabled={imageLoading || isImageConfirmed}
                                className="px-4 py-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 rounded-lg text-xs font-bold hover:bg-[var(--color-primary)]/20 transition-all"
                            >
                                {imageLoading ? <Loader2 size={14} className="animate-spin" /> : 'Generate Image'}
                            </button>
                            <button
                                onClick={() => setIsImagePreviewExpanded(false)}
                                className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
                            >
                                Collapse
                            </button>
                        </div>
                    )}
                    {/* Overlay duration */}
                    <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold text-white border border-white/10 uppercase tracking-tighter z-10">
                        {displayTotalDuration}s
                    </div>

                    {/* NEW: Visual Settings Toggle (Top-Right) */}
                    <div className="absolute top-2 right-2 z-30 opacity-0 group-hover/img:opacity-100 transition-opacity flex gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowVisualStudio(true);
                            }}
                            className="p-1.5 rounded-full backdrop-blur-md border transition-all bg-[var(--color-primary)] text-black border-[var(--color-primary)] hover:scale-110"
                            title="Open Visual Studio"
                        >
                            <Maximize2 size={14} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsVisualManualExpand(!isVisualManualExpand);
                            }}
                            className={`p-1.5 rounded-full backdrop-blur-md border transition-all ${isVisualManualExpand ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]' : 'bg-black/40 text-white border-white/10 hover:bg-white/10'}`}
                            title="Quick Settings"
                        >
                            <Settings size={14} />
                        </button>
                    </div>

                    {/* Floating Image Regen Button (visible on hover) */}
                    {hasImage && !isImageConfirmed && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20 pointer-events-none">
                            <button
                                onClick={() => onGenerateImage(cut.id, cut.visualPrompt || '')}
                                disabled={imageLoading}
                                className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md border border-white/20 transition-all pointer-events-auto"
                            >
                                {imageLoading ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                            </button>
                        </div>
                    )}
                    {/* Floating Visual Settings Panel - MOVED HERE */}
                    {isVisualManualExpand && (
                        /* @ts-ignore */
                        <Draggable nodeRef={visualPanelRef} bounds="parent" handle=".drag-handle" defaultPosition={{ x: 0, y: 0 }}>
                            <div ref={visualPanelRef} className="absolute bottom-2 left-[5%] z-40 w-[90%] max-w-[400px] bg-black/80 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl overflow-hidden flex flex-col">
                                {/* Header / Drag Handle */}
                                <div className="drag-handle bg-white/10 px-3 py-2 cursor-move flex items-center justify-between border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                        <Image size={12} className="text-[var(--color-primary)]" />
                                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Visual Settings</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setIsVisualManualExpand(false)} className="text-gray-400 hover:text-white">
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-3 space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {/* Row 1: Prompt + Generate Button */}
                                    <div className="flex gap-2 items-start">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Visual Prompt</label>
                                                <button
                                                    onClick={() => setShowTermHelper(!showTermHelper)}
                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border ${showTermHelper ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]' : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'}`}
                                                >
                                                    <HelpCircle size={8} /> Terms
                                                </button>
                                                <button
                                                    onClick={handleAiVisualSuggest}
                                                    disabled={isSuggestingVisual}
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:text-orange-300 disabled:opacity-50"
                                                    title="AI Camera Suggestion"
                                                >
                                                    {isSuggestingVisual ? <Loader2 size={8} className="animate-spin" /> : <Sparkles size={8} />}
                                                    Suggest
                                                </button>
                                                <button
                                                    onClick={handleAutoTranslate}
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border bg-white/5 text-gray-500 border-white/5 hover:text-white"
                                                    title="Auto Translate (KR->EN)"
                                                >
                                                    <Languages size={8} /> Auto
                                                </button>
                                            </div>
                                            <textarea
                                                className={`w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 text-[11px] min-h-[50px] focus:border-[var(--color-primary)] outline-none resize-none ${isImageConfirmed ? 'opacity-50' : ''}`}
                                                value={localVisualPrompt}
                                                disabled={isImageConfirmed}
                                                onChange={(e) => handleVisualPromptChange(e.target.value)}
                                                onFocus={() => { isVisualPromptFocusedRef.current = true; }}
                                                onBlur={() => {
                                                    isVisualPromptFocusedRef.current = false;
                                                    flushVisualPrompt();
                                                    onSave();
                                                }}
                                                placeholder="Scene description..."
                                            />
                                            {cut.visualPromptKR && (
                                                <div className="bg-white/5 border border-white/5 rounded px-2 py-1.5 mt-1">
                                                    <div className="flex items-center gap-1 mb-0.5">
                                                        <Languages size={10} className="text-gray-500" />
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase">KR Translation</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-300 whitespace-pre-wrap">{cut.visualPromptKR}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Generate Button - Right Side */}
                                        <div className="pt-4">
                                            <button
                                                onClick={() => onGenerateImage(cut.id, cut.visualPrompt || '')}
                                                disabled={imageLoading || isImageConfirmed}
                                                className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all border ${imageLoading ? 'bg-[var(--color-primary)]/20 animate-pulse border-[var(--color-primary)]/40' :
                                                    isImageConfirmed ? 'opacity-30 cursor-not-allowed border-white/5' :
                                                        'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 border-[var(--color-primary)]/20'
                                                    }`}
                                                title={hasImage ? "Regenerate Image" : "Generate Image"}
                                            >
                                                {imageLoading ? <Loader2 size={18} className="animate-spin" /> :
                                                    hasImage ? <RotateCcw size={18} /> :
                                                        <Sparkles size={18} />}
                                                <span className="text-[8px] font-bold mt-1">{hasImage ? 'RETRY' : 'GEN'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Helper Popup */}
                                    {showTermHelper && (
                                        <div className="bg-[#1a1a1a] border border-[var(--color-primary)]/30 rounded-lg p-2 grid grid-cols-2 gap-1 max-h-[150px] overflow-y-auto">
                                            {Object.values(VISUAL_TERMS).flat(1).slice(0, 10).map(item => (
                                                <button
                                                    key={item.term}
                                                    onClick={() => {
                                                        const newPrompt = cut.visualPrompt ? `${cut.visualPrompt.trim()}, ${item.term}` : item.term;
                                                        onUpdateCut(cut.id, { visualPrompt: newPrompt });
                                                        setLocalVisualPrompt(newPrompt);
                                                    }}
                                                    className="text-[8px] text-left px-1.5 py-1 bg-white/5 hover:bg-[var(--color-primary)]/20 rounded text-gray-400 hover:text-white truncate"
                                                    title={item.desc}
                                                >
                                                    {item.term}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Reference Assets */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Refs</label>
                                            <button
                                                onClick={() => onToggleAssetSelector(cut.id)}
                                                className="text-[9px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
                                            >
                                                <Plus size={8} /> Add
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 items-center max-h-[60px] overflow-y-auto">
                                            {autoMatchedAssets.map((asset: any) => (
                                                <div key={asset.id} className="px-1.5 py-0.5 rounded bg-white/5 text-[8px] text-gray-500 border border-white/10 truncate max-w-[80px]">{asset.name}</div>
                                            ))}
                                            {manualAssetObjs.map((asset: any) => (
                                                <div key={asset.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-primary)]/20 text-[8px] text-[var(--color-primary)] border border-[var(--color-primary)]/30">
                                                    <span className="truncate max-w-[80px]">{asset.name}</span>
                                                    <X size={8} className="cursor-pointer hover:text-red-400" onClick={() => onRemoveAsset(cut.id, asset.id)} />
                                                </div>
                                            ))}
                                            {cut.referenceCutIds?.map((refId: number | string) => (
                                                <div key={`ref-${refId}`} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-[8px] text-orange-300 border border-orange-500/30">
                                                    <span>Cut #{refId}</span>
                                                    {onRemoveReference && <X size={8} className="cursor-pointer hover:text-red-400" onClick={() => onRemoveReference(cut.id, refId)} />}
                                                </div>
                                            ))}
                                            {cut.userReferenceImage && (
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-[8px] text-blue-300 border border-blue-500/30">
                                                    <span className="truncate max-w-[80px]">Custom Ref</span>
                                                    {onUpdateCut && <X size={8} className="cursor-pointer hover:text-red-400" onClick={() => onUpdateCut(cut.id, { userReferenceImage: undefined })} />}
                                                </div>
                                            )}
                                        </div>
                                        {/* Full Asset Selector Modal */}
                                        <ReferenceSelectorModal
                                            isOpen={showAssetSelector}
                                            onClose={onCloseAssetSelector}
                                            onSelect={(asset) => {
                                                console.log("[CutItem] onSelect called with asset:", asset);
                                                const isCut = asset.type === 'composition' || asset.type === 'cut' || (asset.id && typeof asset.id === 'string' && asset.id.startsWith('cut-'));
                                                if (isCut && asset.id) {
                                                    // Extract the full cut ID after 'cut-' prefix (e.g. 'cut-S1E1_C8' -> 'S1E1_C8')
                                                    const refId = asset.id.startsWith('cut-') ? asset.id.slice(4) : asset.id;
                                                    console.log("[CutItem] isCut matched! refId:", refId, "onAddReference available:", !!onAddReference);
                                                    if (onAddReference) {
                                                        console.log("[CutItem] Calling onAddReference with:", cut.id, refId);
                                                        onAddReference(cut.id, refId);
                                                    }
                                                } else if (asset.type === 'user-upload' || (!asset.id && asset.url)) {
                                                    // Handle user uploads or session drafts (which don't have an ID)
                                                    if (onUpdateCut && asset.url) onUpdateCut(cut.id, { userReferenceImage: asset.url });
                                                } else {
                                                    if (asset.id) {
                                                        onAddAsset(cut.id, asset.id);
                                                    }
                                                }
                                                onCloseAssetSelector();
                                            }}
                                            projectAssets={Object.values(assetDefinitions || {}).map((a: any) => ({
                                                id: String(a.id),
                                                name: a.name,
                                                url: a.referenceImage || a.imageUrl || a.url || '',
                                                type: a.type
                                            }))}
                                            pastCuts={localScript.slice(0, index).filter(c => c.finalImageUrl).map((c, idx) => ({
                                                id: `cut-${c.id}`,
                                                url: c.finalImageUrl!,
                                                index: idx + 1
                                            }))}
                                            onUpload={(file: File) => onUploadUserReference?.(cut.id, file)}
                                            drafts={[]}
                                        />
                                    </div>

                                    {/* Motion Prompt */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[9px] text-orange-400/70 uppercase font-bold tracking-wider">Motion</label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    className="bg-black/40 text-[8px] text-gray-400 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-orange-500 cursor-pointer hover:bg-white/5 transition-colors max-w-[80px]"
                                                    onChange={(e) => {
                                                        const preset = DEFAULT_MOTION_PRESETS.find(p => p.id === e.target.value);
                                                        if (preset) {
                                                            const base = cut.visualPrompt ? cut.visualPrompt.trim().replace(/\.$/, '') : '';
                                                            const newPrompt = base ? `${base}. ${preset.template}` : preset.template;
                                                            onUpdateCut(cut.id, { videoPrompt: newPrompt });
                                                        }
                                                        e.target.value = ''; // Reset selection
                                                    }}
                                                >
                                                    <option value="">Presets...</option>
                                                    <optgroup label="Emotional">
                                                        {getPresetsByCategory('emotional').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Action">
                                                        {getPresetsByCategory('action').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Dialogue">
                                                        {getPresetsByCategory('dialogue').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Establishing">
                                                        {getPresetsByCategory('establishing').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Transition">
                                                        {getPresetsByCategory('transition').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </optgroup>
                                                </select>

                                                <button
                                                    onClick={handleAutoGenerateVideoPrompt}
                                                    disabled={_isGeneratingMotion}
                                                    className="flex items-center gap-1 text-[8px] font-bold text-orange-400/80 hover:text-orange-400 disabled:opacity-50 transition-colors"
                                                    title="Generate with AI"
                                                >
                                                    {_isGeneratingMotion ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                                    AUTO
                                                </button>
                                                <button
                                                    onClick={() => onUpdateCut(cut.id, { videoPrompt: '' })}
                                                    className="flex items-center gap-1 text-[8px] font-bold text-red-500/80 hover:text-red-500 transition-colors"
                                                    title="Clear (Auto-generates on empty save)"
                                                >
                                                    <Trash2 size={10} />
                                                    CLEAR
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            className="w-full bg-black/50 border border-orange-500/10 rounded-lg px-2 py-1 text-gray-400 text-[9px] min-h-[30px] focus:border-orange-500 outline-none resize-none"
                                            value={cut.videoPrompt || ''}
                                            disabled={isImageConfirmed}
                                            onChange={(e) => onUpdateCut(cut.id, { videoPrompt: e.target.value })}
                                            onBlur={() => {
                                                if (!cut.videoPrompt?.trim()) {
                                                    handleAutoGenerateVideoPrompt();
                                                }
                                                onSave();
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Draggable>
                    )}
                </div>
            ) : (
                /* Collapsed Image Preview - Click to expand */
                <button
                    onClick={() => setIsImagePreviewExpanded(true)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-black/20 border-b border-white/10 hover:bg-black/30 transition-colors group/expand"
                >
                    <div className="flex items-center gap-2 text-gray-500 group-hover/expand:text-gray-400">
                        <Image size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Image Preview</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-600">{displayTotalDuration}s</span>
                        <ChevronDown size={14} className="text-gray-600" />
                    </div>
                </button>
            )}

            {/* 3. SPEAKER & SCRIPT AREA */}
            <div className="p-4 space-y-4">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <select
                            className={`bg-[#1a1a1a] border-b border-[var(--color-border)] text-[var(--color-primary)] font-bold focus:border-[var(--color-primary)] outline-none py-0.5 text-xs appearance-none cursor-pointer ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                            value={cut.speaker}
                            disabled={isAudioConfirmed}
                            onChange={(e) => {
                                onUpdateCut(cut.id, { speaker: e.target.value });
                                onSave();
                            }}
                        >
                            {cut.speaker && !speakerList.includes(cut.speaker) && (
                                <option value={cut.speaker} className="bg-[#1a1a1a]">{cut.speaker}</option>
                            )}
                            {speakerList.map(name => (
                                <option key={name} value={name} className="bg-[#1a1a1a]">{name}</option>
                            ))}
                            {!speakerList.includes('Narrator') && <option value="Narrator" className="bg-[#1a1a1a]">Narrator</option>}
                            {!speakerList.includes('SILENT') && <option value="SILENT" className="bg-[#1a1a1a]">SILENT</option>}
                        </select>
                    </div>

                    <div className="flex gap-3">
                        <textarea
                            className={`flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm min-h-[90px] focus:border-[var(--color-primary)] outline-none resize-none transition-all ${isAudioConfirmed ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/10'}`}
                            value={localDialogue}
                            disabled={isAudioConfirmed}
                            onChange={(e) => handleDialogueChange(e.target.value)}
                            onFocus={() => { isFocusedRef.current = true; }}
                            onBlur={() => {
                                isFocusedRef.current = false;
                                flushDialogue();
                                onSave();
                            }}
                            placeholder="Dialogue..."
                        />

                        <div className="flex flex-col gap-2 shrink-0 justify-start pt-1">
                            {/* Play Button */}
                            {hasRealAudio && (
                                <button
                                    onClick={() => onPlayAudio(cut.id)}
                                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-all border ${playingAudio === cut.id ? 'bg-green-500 text-black border-green-400' : 'bg-white/10 text-gray-400 hover:text-white border-white/10'}`}
                                    title="Play Audio"
                                >
                                    {playingAudio === cut.id ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                                </button>
                            )}

                            {/* Generate / Regenerate Button */}
                            <button
                                onClick={() => {
                                    // [FIX] Flush debounced dialogue to sync store, then use localDialogue
                                    // which always has the latest user-typed text (cut.dialogue may be stale)
                                    flushDialogue();
                                    onGenerateAudio(cut.id, localDialogue);
                                }}
                                disabled={audioLoading || !localDialogue || isAudioConfirmed}
                                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all border ${isAudioConfirmed
                                    ? 'opacity-30 cursor-not-allowed border-white/5'
                                    : audioLoading
                                        ? 'bg-[var(--color-primary)]/20 animate-pulse border-[var(--color-primary)]/40'
                                        : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 border-[var(--color-primary)]/20'
                                    }`}
                                title={isAudioConfirmed ? 'Audio Locked' : hasRealAudio ? 'Regenerate Audio' : 'Generate Audio'}
                            >
                                {audioLoading ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : hasRealAudio ? (
                                    <RotateCcw size={14} />
                                ) : (
                                    <Mic size={14} />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Acting Direction & Audio Settings Row - Aligned with Dialogue above */}
                    <div className="flex gap-3 pt-1">
                        <div className="flex-1 flex items-center gap-2">
                            <div className="flex items-center gap-1.5 shrink-0 opacity-80">
                                <Sparkles size={10} className="text-[var(--color-primary)]" />
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">연기 지시</span>
                            </div>
                            <textarea
                                className={`flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white text-[10px] h-8 focus:border-[var(--color-primary)] outline-none resize-none transition-all ${isAudioConfirmed ? 'opacity-70' : 'hover:border-white/20 hover:bg-black/50'}`}
                                value={localActingDirection}
                                disabled={isAudioConfirmed}
                                onChange={(e) => handleActingDirectionChange(e.target.value)}
                                onFocus={() => { isActingDirectionFocusedRef.current = true; }}
                                onBlur={() => {
                                    isActingDirectionFocusedRef.current = false;
                                    flushActingDirection();
                                    onSave();
                                }}
                                placeholder="Acting direction (e.g., Speak slowly / 슬픈 목소리로)"
                            />
                        </div>

                        <div className="w-8 shrink-0 flex flex-col items-center">
                            <button
                                onClick={() => setIsAudioManualExpand(!isAudioManualExpand)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border ${isAudioManualExpand
                                    ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]'
                                    : 'bg-white/5 text-gray-400 hover:text-white border-white/10 hover:bg-white/10'
                                    }`}
                                title="Audio Settings"
                            >
                                <Settings size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. COLLAPSIBLE DETAILS (Audio + Visual) */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                    {/* Audio Details Toggle REMOVED - Triggered by Settings icon above */}

                    {isAudioVisible && (
                        <div className="px-2 pb-4 space-y-4 animate-in slide-in-from-top-1 duration-200">

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setShowAudioSettings(!showAudioSettings)}
                                    className={`p-2 rounded-lg border text-[10px] font-bold flex items-center gap-2 transition-all ${showAudioSettings ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                                >
                                    <Settings size={12} /> Detailed Voice Settings
                                </button>
                            </div>

                            {/* Audio Settings Panel (Expanded inside) */}
                            {showAudioSettings && (
                                <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-4">
                                    {/* Row 1: Duration & Padding */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Duration (s)</label>
                                            <input type="number" step="0.1" className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none" value={cut.estimatedDuration || 0} onChange={(e) => onUpdateCut(cut.id, { estimatedDuration: parseFloat(e.target.value) })} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">+ Padding (s)</label>
                                            <input type="number" step="0.1" className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none" value={cut.audioPadding ?? 0.5} onChange={(e) => onUpdateCut(cut.id, { audioPadding: parseFloat(e.target.value) })} />
                                        </div>
                                    </div>

                                    {/* Row 2: Language, Gender, Age */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Language</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.language || 'ko-KR'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { language: e.target.value as any }); onSave(); }}>
                                                <option value="ko-KR">KO</option>
                                                <option value="en-US">EN</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Gender</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceGender || 'neutral'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceGender: e.target.value as any }); onSave(); }}>
                                                <option value="neutral">Auto</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Age</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceAge || 'adult'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceAge: e.target.value as any }); onSave(); }}>
                                                <option value="child">Child</option>
                                                <option value="young">Young</option>
                                                <option value="adult">Adult</option>
                                                <option value="senior">Old</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Row 3: Rate, Emotion, Intensity */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Rate</label>
                                            <select className="w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white" value={cut.voiceSpeed ?? 1.0} onChange={(e) => onUpdateCut(cut.id, { voiceSpeed: parseFloat(e.target.value) })}>
                                                <option value={0.85}>0.85x</option>
                                                <option value={1.0}>1.0x</option>
                                                <option value={1.15}>1.15x</option>
                                                <option value={1.3}>1.3x</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Emotion</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.emotion || 'neutral'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { emotion: e.target.value as any }); onSave(); }}>
                                                <option value="neutral">Neut</option>
                                                <option value="happy">Happy</option>
                                                <option value="sad">Sad</option>
                                                <option value="angry">Angry</option>
                                                <option value="excited">Excit</option>
                                                <option value="calm">Calm</option>
                                                <option value="tense">Tense</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 block">Power</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-1 py-1 text-[10px] text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.emotionIntensity || 'moderate'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { emotionIntensity: e.target.value as any }); onSave(); }}>
                                                <option value="low">Low</option>
                                                <option value="moderate">Med</option>
                                                <option value="high">High</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {/* SFX Section */}
                            {(cut.sfxDescription || cut.sfxUrl) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold block ml-1 tracking-wider">Sound Effects</label>
                                    {cut.sfxDescription && !cut.sfxUrl && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded border border-white/5 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => onOpenSfxModal?.(cut.id)}>
                                            <Waves size={12} className="text-gray-500 shrink-0" />
                                            <span className="text-[11px] text-gray-400 flex-1 truncate">{cut.sfxDescription}</span>
                                            <Plus size={12} className="text-gray-500" />
                                        </div>
                                    )}
                                    {cut.sfxUrl && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded border border-green-500/20">
                                            <Volume2 size={12} className="text-green-400 shrink-0" />
                                            <span className="text-[11px] text-gray-300 flex-1 truncate font-medium">{cut.sfxName || 'Sound Effect'}</span>
                                            {onRemoveSfx && (
                                                <button onClick={(e) => { e.stopPropagation(); onRemoveSfx(cut.id); }} className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Visual Settings Toggle Button REMOVED (Moved to Image Preview) */}
                </div>
            </div>

            {hasRealAudio && resolvedAudioUrl && (
                <audio
                    key={resolvedAudioUrl}
                    id={`audio-${cut.id}`}
                    src={resolvedAudioUrl || undefined}
                    preload="auto"
                    onLoadedMetadata={(e) => {
                        console.log(`[CutItem ${cut.id}] 🎵 Audio metadata loaded: duration=${e.currentTarget.duration}s`);
                        setActualAudioDuration(e.currentTarget.duration);
                    }}
                    onCanPlayThrough={() => console.log(`[CutItem ${cut.id}] ✅ Audio can play through`)}
                    onError={(e) => console.error(`[CutItem ${cut.id}] ❌ Audio element error:`, e.currentTarget.error)}
                />
            )}

            {/* Visual Settings Studio Fullscreen Modal */}
            {apiKey && (
                <UnifiedStudio
                    isOpen={showVisualStudio}
                    onClose={() => setShowVisualStudio(false)}
                    apiKey={apiKey}
                    masterStyle={masterStyle}
                    config={{
                        mode: 'visual',
                        cutId: cut.id,
                        cutIndex: index,
                        initialVisualPrompt: cut.visualPrompt || '',
                        initialVisualPromptKR: cut.visualPromptKR,
                        initialFinalImageUrl: cut.finalImageUrl,
                        initialVideoPrompt: cut.videoPrompt,
                        aspectRatio: aspectRatio,
                        assetDefinitions: assetDefinitions,
                        existingCuts: localScript,
                        autoMatchedAssets: allMatchedResults.map((m: any) => m.asset).filter(Boolean),
                        manualAssetObjs: manualAssetObjs,
                        initialSpeaker: cut.speaker,
                        initialDialogue: cut.dialogue,
                        onSave: async (result: VisualSettingsResult) => {
                            const refs = result.taggedReferences || [];
                            const manualAssetIds = refs
                                .filter(r => !r.isAuto && assetDefinitions && assetDefinitions[r.id])
                                .map(r => r.id);
                            const referenceCutIds = refs
                                .filter(r => !r.isAuto && r.id.startsWith('cut-'))
                                .map(r => r.id.replace('cut-', ''));
                            const userRef = refs.find(r => r.id === 'user-ref');

                            // [CRITICAL] Await the async update to ensure IDB storage completes 
                            // before the studio modal closes and potential refresh occurs.
                            await onUpdateCut(cut.id, {
                                visualPrompt: result.visualPrompt,
                                visualPromptKR: result.visualPromptKR,
                                videoPrompt: result.videoPrompt,
                                finalImageUrl: result.finalImageUrl || undefined,
                                referenceAssetIds: manualAssetIds,
                                referenceCutIds: referenceCutIds,
                                userReferenceImage: userRef?.url,
                                // [USER REQUEST] Automatically confirm/lock the image when saved from Studio
                                isImageConfirmed: true,
                                isConfirmed: false // Clear legacy flag
                            });
                        },
                    }}
                />
            )}
        </div>
    );
});

// CutReferenceItem removed, unused
