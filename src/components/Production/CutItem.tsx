import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Lock, Unlock, Mic, Loader2, Play, Square, ImageIcon as Image, Eye, X, Plus, HelpCircle, Waves, Volume2, Settings, Trash2, Edit3, Sparkles, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import { getMatchedAssets } from '../../utils/assetUtils';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import type { AspectRatio } from '../../store/types';

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
    playingAudio: number | null;
    aspectRatio: AspectRatio;
    speakerList: string[];
    ttsModel?: string;
    onToggleAudioConfirm: (id: number) => void;
    onToggleImageConfirm: (id: number) => void;
    onUpdateCut: (id: number, updates: Partial<ScriptCut>) => void;
    onGenerateAudio: (id: number, dialogue: string) => void;
    onPlayAudio: (id: number) => void;
    onGenerateImage: (id: number, prompt: string) => void;
    onRegenerateImage: (id: number) => void;
    onUploadUserReference?: (cutId: number, file: File) => void;
    onAddAsset: (cutId: number, assetId: string) => void;
    onRemoveAsset: (cutId: number, assetId: string) => void;
    onAddReference: (cutId: number, refId: number) => void;
    onRemoveReference: (cutId: number, refId: number) => void;
    onToggleAssetSelector: (cutId: number) => void;
    onCloseAssetSelector: () => void;
    onSave: () => void;
    onDelete: (id: number) => void;
    onMove: (id: number, direction: 'up' | 'down') => void;
    onInsert: (id: number) => void;
    onOpenSfxModal?: (cutId: number) => void;
    onRemoveSfx?: (cutId: number) => void;
}

export const CutItem = memo(({
    cut,
    index,
    isAudioConfirmed,
    isImageConfirmed,
    showAssetSelector,
    assetDefinitions,
    localScript,
    audioLoading,
    imageLoading,
    playingAudio,
    aspectRatio,
    speakerList,
    ttsModel,
    onToggleAudioConfirm,
    onToggleImageConfirm,
    onUpdateCut,
    onGenerateAudio,
    onPlayAudio,
    onGenerateImage,
    onRegenerateImage,
    onUploadUserReference,
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
    onRemoveSfx
}: CutItemProps) => {
    // Local state for debounced inputs
    const [localDialogue, setLocalDialogue] = useState(cut.dialogue || '');
    const [localVisualPrompt, setLocalVisualPrompt] = useState(cut.visualPrompt || '');
    const [localActingDirection, setLocalActingDirection] = useState(cut.actingDirection || '');
    const isFocusedRef = useRef(false);
    const isActingDirectionFocusedRef = useRef(false);
    const isVisualPromptFocusedRef = useRef(false);

    // Resolved URLs for IndexedDB
    const [resolvedImageUrl, setResolvedImageUrl] = useState<string | undefined>(undefined);
    const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | undefined>(undefined);
    const [resolvedUserRefUrl, setResolvedUserRefUrl] = useState<string | undefined>(undefined);
    const [actualAudioDuration, setActualAudioDuration] = useState<number | undefined>(undefined);

    // Panel expand states
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [showImageSettings, setShowImageSettings] = useState(false);
    const [showTermHelper, setShowTermHelper] = useState(false);
    const [isAudioManualExpand, setIsAudioManualExpand] = useState(false);
    const [isVisualManualExpand, setIsVisualManualExpand] = useState(false);

    // Track image loading state to detect completion
    const prevImageLoadingRef = useRef(imageLoading);
    useEffect(() => {
        // When loading finishes (true -> false) and we actually have an image
        if (prevImageLoadingRef.current && !imageLoading && cut.finalImageUrl) {
            setShowImageSettings(true);
            setIsVisualManualExpand(true);
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

    const isAudioVisible = !isAudioConfirmed || isAudioManualExpand;
    const isVisualVisible = !isImageConfirmed || isVisualManualExpand;

    // Sync local state with cut changes (but not while editing)
    useEffect(() => {
        if (!isFocusedRef.current) setLocalDialogue(cut.dialogue || '');
    }, [cut.dialogue]);

    useEffect(() => {
        if (!isVisualPromptFocusedRef.current) setLocalVisualPrompt(cut.visualPrompt || '');
    }, [cut.visualPrompt]);

    useEffect(() => {
        if (!isActingDirectionFocusedRef.current) setLocalActingDirection(cut.actingDirection || '');
    }, [cut.actingDirection]);

    // Resolve IDB URLs
    useEffect(() => {
        if (cut.finalImageUrl) {
            if (isIdbUrl(cut.finalImageUrl)) {
                resolveUrl(cut.finalImageUrl).then(url => setResolvedImageUrl(url || undefined));
            } else {
                setResolvedImageUrl(cut.finalImageUrl);
            }
        } else {
            setResolvedImageUrl(undefined);
        }
    }, [cut.finalImageUrl]);

    useEffect(() => {
        let currentBlobUrl = '';
        if (cut.audioUrl) {
            if (isIdbUrl(cut.audioUrl)) {
                resolveUrl(cut.audioUrl, { asBlob: true }).then(url => {
                    console.log(`[CutItem ${cut.id}] 🔊 Resolved audio URL: ${url.substring(0, 50)}...`);
                    currentBlobUrl = url;
                    setResolvedAudioUrl(url);
                }).catch(err => {
                    console.error(`[CutItem ${cut.id}] ❌ Failed to resolve audio:`, err);
                });
            } else {
                setResolvedAudioUrl(cut.audioUrl);
            }
        } else {
            setResolvedAudioUrl(undefined);
        }

        return () => {
            if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(currentBlobUrl);
            }
        };
    }, [cut.audioUrl]);

    useEffect(() => {
        if (cut.userReferenceImage) {
            if (isIdbUrl(cut.userReferenceImage)) {
                resolveUrl(cut.userReferenceImage).then(url => setResolvedUserRefUrl(url || undefined));
            } else {
                setResolvedUserRefUrl(cut.userReferenceImage);
            }
        } else {
            setResolvedUserRefUrl(undefined);
        }
    }, [cut.userReferenceImage]);

    // Debounced dialogue update
    const handleDialogueChange = useCallback((value: string) => {
        setLocalDialogue(value);
        onUpdateCut(cut.id, { dialogue: value });
    }, [cut.id, onUpdateCut]);

    // Debounced visual prompt update
    const handleVisualPromptChange = useCallback((value: string) => {
        setLocalVisualPrompt(value);
        // Clear the Korean translation when the English prompt is modified
        onUpdateCut(cut.id, { visualPrompt: value, visualPromptKR: undefined });
    }, [cut.id, onUpdateCut]);

    // Debounced acting direction update
    const handleActingDirectionChange = useCallback((value: string) => {
        setLocalActingDirection(value);
        onUpdateCut(cut.id, { actingDirection: value });
    }, [cut.id, onUpdateCut]);

    // Auto-generate video prompt from visual prompt
    const handleAutoGenerateVideoPrompt = useCallback(() => {
        const basePrompt = cut.visualPrompt || '';
        const motionSuffix = '. Camera slowly pushes in. Subtle atmospheric motion. Character breathes naturally.';
        onUpdateCut(cut.id, { videoPrompt: basePrompt + motionSuffix });
    }, [cut.id, cut.visualPrompt, onUpdateCut]);

    // Asset matching
    const manualAssets = cut.referenceAssetIds || [];
    const allMatchedResults = useMemo(() =>
        getMatchedAssets(cut.visualPrompt || '', manualAssets, assetDefinitions, cut.id),
        [cut.visualPrompt, manualAssets, assetDefinitions, cut.id]);

    // Extract actual asset objects - getMatchedAssets returns { asset, isManual }[]
    const autoMatchedAssets = allMatchedResults
        .filter((match: any) => !match.isManual)
        .map((match: any) => match.asset);
    const manualAssetObjs = assetDefinitions
        ? manualAssets.map(id => assetDefinitions[id]).filter(Boolean)
        : [];

    // Unique assets for selector
    const uniqueAssets = useMemo(() => {
        if (!assetDefinitions) return [];
        return Object.values(assetDefinitions).reduce((acc: any[], current: any) => {
            const existingIndex = acc.findIndex(item => item.name.toLowerCase() === current.name.toLowerCase());
            if (existingIndex === -1) {
                acc.push(current);
            } else if (!acc[existingIndex].referenceImage && current.referenceImage) {
                acc[existingIndex] = current;
            }
            return acc;
        }, []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    }, [assetDefinitions]);

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

    // Truncated dialogue for header
    const dialoguePreview = (cut.dialogue || '').slice(0, 50) + ((cut.dialogue || '').length > 50 ? '...' : '');

    return (
        <div
            className={`glass-panel relative group ${isFullyConfirmed ? 'border-green-500/50 bg-green-500/5' : 'hover:border-[var(--color-primary-dim)]'} ${showAssetSelector ? 'z-50' : 'z-0'}`}
        >
            {/* ===== HEADER ROW ===== */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                {/* Cut Number */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 ${isFullyConfirmed ? 'bg-green-500 text-black border-green-500' : 'bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-border)]'}`}>
                    {index + 1}
                </div>

                {/* Thumbnail (if image exists) */}
                {hasImage && (
                    <div
                        className="rounded border border-white/20 overflow-hidden shrink-0 bg-black flex items-center justify-center"
                        style={{
                            width: '48px',
                            height: '48px',
                            aspectRatio: aspectRatio === '9:16' ? '9/16' : '16/9'
                        }}
                    >
                        <img src={resolvedImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                )}

                {/* Speaker & Dialogue Preview */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <select
                            className={`bg-transparent border-b border-[var(--color-border)] text-[var(--color-primary)] font-bold focus:border-[var(--color-primary)] outline-none py-0.5 text-sm appearance-none cursor-pointer max-w-[100px] ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                            value={cut.speaker}
                            disabled={isAudioConfirmed}
                            onChange={(e) => {
                                onUpdateCut(cut.id, { speaker: e.target.value });
                                onSave();
                            }}
                        >
                            {cut.speaker && !speakerList.includes(cut.speaker) && (
                                <option value={cut.speaker}>{cut.speaker}</option>
                            )}
                            {speakerList.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                            {!speakerList.includes('Narrator') && <option value="Narrator">Narrator</option>}
                            {!speakerList.includes('SILENT') && <option value="SILENT">SILENT</option>}
                        </select>
                        <span className="text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">{displayTotalDuration}s</span>
                    </div>
                    {dialoguePreview && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{dialoguePreview}</p>
                    )}
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-1">
                    {hasAudio && (
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${isAudioConfirmed ? 'bg-green-500/30 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                            <Mic size={10} />
                        </div>
                    )}
                    {hasImage && (
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${isImageConfirmed ? 'bg-green-500/30 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                            <Image size={10} />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Move Up */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(cut.id, 'up'); }}
                        className="p-1.5 text-gray-600 hover:text-[var(--color-primary)] hover:bg-white/5 rounded transition-colors"
                        title="Move Up"
                    >
                        <ChevronUp size={14} />
                    </button>
                    {/* Move Down */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(cut.id, 'down'); }}
                        className="p-1.5 text-gray-600 hover:text-[var(--color-primary)] hover:bg-white/5 rounded transition-colors"
                        title="Move Down"
                    >
                        <ChevronDown size={14} />
                    </button>
                    {/* Insert After */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onInsert(cut.id); }}
                        className="p-1.5 text-gray-600 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                        title="Insert New Cut After"
                    >
                        <Plus size={14} />
                    </button>
                    {/* Delete Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this cut?')) {
                                onDelete(cut.id);
                            }
                        }}
                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete Cut"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* ===== AUDIO SECTION (Dialogue + SFX) ===== */}
            <div className={`${isAudioConfirmed ? 'bg-green-500/5' : ''}`}>
                {/* Audio Section Header (Clean Line Style) */}
                <div
                    className="flex items-center justify-between px-4 py-2 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group/header"
                    onClick={() => setIsAudioManualExpand(!isAudioManualExpand)}
                >
                    <div className="flex items-center gap-2">
                        {isAudioVisible ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                        <Mic size={12} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Audio</span>
                        <span className="text-[10px] text-gray-500">(Dialogue + SFX)</span>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleAudioConfirm(cut.id);
                        }}
                        disabled={!hasAudio && cut.speaker !== 'SILENT'}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${isAudioConfirmed ? 'bg-green-500 text-black' : 'bg-white/10 text-gray-400 hover:text-white disabled:opacity-30'}`}
                    >
                        {isAudioConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                        {isAudioConfirmed ? 'Locked' : 'Lock Audio'}
                    </button>
                </div>

                {isAudioVisible && (
                    <>
                        {/* Dialogue Row */}
                        <div className="px-4 py-3">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-500 uppercase font-bold block mb-1 tracking-wider">💬 Dialogue</label>
                                    <textarea
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-sm min-h-[60px] focus:border-[var(--color-primary)] outline-none resize-none ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={localDialogue}
                                        disabled={isAudioConfirmed}
                                        onChange={(e) => handleDialogueChange(e.target.value)}
                                        onFocus={() => { isFocusedRef.current = true; }}
                                        onBlur={() => {
                                            isFocusedRef.current = false;
                                            onSave();
                                        }}
                                        placeholder="Dialogue..."
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1 tracking-wider flex items-center gap-1">
                                        <Sparkles size={10} className="text-[var(--color-primary)]" /> 연기 지시 (Acting Direction)
                                    </label>
                                    <textarea
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-[11px] min-h-[60px] focus:border-[var(--color-primary)] outline-none resize-none ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={localActingDirection}
                                        disabled={isAudioConfirmed}
                                        onChange={(e) => handleActingDirectionChange(e.target.value)}
                                        onFocus={() => { isActingDirectionFocusedRef.current = true; }}
                                        onBlur={() => {
                                            isActingDirectionFocusedRef.current = false;
                                            onSave();
                                        }}
                                        placeholder="톤, 감정, 속도 등 연기 지침 (예: 슬픈 목소리로 천천히)"
                                    />
                                </div>

                                {/* Audio Buttons (Play/Gen + Settings) */}
                                <div className="flex flex-col gap-1 pt-5 shrink-0">
                                    {/* Play Button - Redesigned to be Circular + Text with Sand Orange Accent */}
                                    {hasRealAudio && resolvedAudioUrl && (
                                        <div className="flex items-center gap-2 py-1">
                                            <button
                                                onClick={() => onPlayAudio(cut.id)}
                                                className={`flex items-center justify-center w-7 h-7 rounded-full transition-all shadow-sm border ${playingAudio === cut.id ? 'bg-green-500 text-black border-green-400 shadow-green-500/20' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 border-[var(--color-primary)]/30 shadow-[var(--color-primary)]/10'}`}
                                            >
                                                {playingAudio === cut.id ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
                                            </button>
                                            <span className={`text-[10px] font-bold uppercase tracking-widest min-w-[30px] ${playingAudio === cut.id ? 'text-green-400' : 'text-[var(--color-primary)]/80'}`}>
                                                {playingAudio === cut.id ? 'STOP' : 'PLAY'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Buttons Area */}
                                    <div className="flex flex-col gap-1">
                                        {cut.speaker !== 'SILENT' ? (
                                            <button
                                                onClick={() => onGenerateAudio(cut.id, cut.dialogue)}
                                                disabled={audioLoading || !cut.dialogue || isAudioConfirmed}
                                                className="flex items-center justify-center gap-1.5 w-[84px] px-2 py-1.5 rounded text-[11px] font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 disabled:opacity-50 transition-colors"
                                            >
                                                {audioLoading ? <Loader2 size={10} className="animate-spin" /> : <Mic size={10} />}
                                                {hasRealAudio ? '재생성' : '생성'}
                                            </button>
                                        ) : (
                                            <div className="flex items-center justify-center gap-1.5 w-[84px] px-2 py-1.5 rounded text-[9px] font-bold bg-white/5 text-gray-500 border border-white/5 opacity-60">
                                                <Mic size={10} className="opacity-40" />
                                                <span>SILENT</span>
                                            </div>
                                        )}

                                        {/* Settings Button - Always visible */}
                                        <button
                                            onClick={() => setShowAudioSettings(!showAudioSettings)}
                                            className={`flex items-center justify-center w-[84px] px-1 py-1 gap-1 rounded text-[10px] transition-all ${showAudioSettings ? 'bg-[var(--color-primary)]/40 text-white border border-[var(--color-primary)]/50' : 'bg-white/10 text-gray-400 hover:text-white border border-white/5'}`}
                                        >
                                            <Settings size={10} />
                                            <span className="font-bold">세팅</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Audio Settings Panel */}
                            {showAudioSettings && (
                                <div className="mt-3 p-3 bg-black/20 rounded-lg border border-[var(--color-primary)]/20 space-y-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Voice Settings</span>
                                        <button onClick={() => setShowAudioSettings(false)} className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded transition-colors"><X size={12} /></button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="min-w-[70px]">
                                            <label className="text-xs text-gray-500 block mb-1">Language</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.language || 'ko-KR'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { language: e.target.value as any }); onSave(); }}>
                                                <option value="ko-KR">한국어</option>
                                                <option value="en-US">English</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[60px]">
                                            <label className="text-xs text-gray-500 block mb-1">Gender</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceGender || 'neutral'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceGender: e.target.value as any }); onSave(); }}>
                                                <option value="neutral">Auto</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[60px]">
                                            <label className="text-xs text-gray-500 block mb-1">Age</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceAge || 'adult'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceAge: e.target.value as any }); onSave(); }}>
                                                <option value="child">Child</option>
                                                <option value="young">Young</option>
                                                <option value="adult">Adult</option>
                                                <option value="senior">Senior</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[70px]">
                                            <label className="text-xs text-gray-500 block mb-1">Emotion</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.emotion || 'neutral'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { emotion: e.target.value }); onSave(); }}>
                                                <option value="neutral">Neutral</option>
                                                <option value="happy">Happy</option>
                                                <option value="sad">Sad</option>
                                                <option value="angry">Angry</option>
                                                <option value="excited">Excited</option>
                                                <option value="calm">Calm</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[60px]">
                                            <label className="text-xs text-gray-500 block mb-1">Intensity</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.emotionIntensity || 'medium'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { emotionIntensity: e.target.value as any }); onSave(); }}>
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[50px]">
                                            <label className="text-xs text-gray-500 block mb-1">Volume</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceVolume ?? 1} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceVolume: e.target.value }); onSave(); }}>
                                                <option value={0.5}>50%</option>
                                                <option value={0.75}>75%</option>
                                                <option value={1}>100%</option>
                                                <option value={1.25}>125%</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[50px]">
                                            <label className="text-xs text-gray-500 block mb-1">Rate</label>
                                            <select
                                                className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                                value={cut.voiceSpeed ?? 1.0}
                                                disabled={isAudioConfirmed}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    onUpdateCut(cut.id, { voiceSpeed: val });
                                                    onSave();
                                                }}
                                            >
                                                <option value={0.75}>0.75x</option>
                                                <option value={0.85}>0.85x</option>
                                                <option value={1.0}>1.0x</option>
                                                <option value={1.15}>1.15x</option>
                                                <option value={1.25}>1.25x</option>
                                                <option value={1.5}>1.5x</option>
                                            </select>
                                        </div>
                                        <div className="min-w-[60px]">
                                            <label className="text-xs text-gray-500 block mb-1">Duration</label>
                                            <div className="flex items-center bg-black/50 rounded border border-white/10 px-2 py-1">
                                                <input type="number" min="0" max="60" step="0.1" className={`bg-transparent text-[var(--color-primary)] font-bold text-xs w-8 outline-none ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.estimatedDuration || 0} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { estimatedDuration: parseFloat(e.target.value) }); onSave(); }} />
                                                <span className="text-xs text-gray-500">s</span>
                                            </div>
                                        </div>
                                        <div className="min-w-[50px]">
                                            <label className="text-xs text-gray-500 block mb-1">Padding</label>
                                            <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.audioPadding ?? 0.5} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { audioPadding: parseFloat(e.target.value) }); onSave(); }}>
                                                <option value={0}>0s</option>
                                                <option value={0.2}>0.2s</option>
                                                <option value={0.5}>0.5s</option>
                                                <option value={1.0}>1.0s</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Acting Direction (Gemini TTS only) */}
                                    {ttsModel === 'gemini-tts' && cut.speaker !== 'SILENT' && (
                                        <div className="mt-3 pt-3 border-t border-white/10">
                                            <label className="text-[10px] text-gray-500 block mb-1 flex items-center gap-1 uppercase font-bold tracking-wider">
                                                <Sparkles size={10} className="text-[var(--color-primary)]" />
                                                🎭 Acting Direction (Gemini TTS)
                                            </label>
                                            <input
                                                type="text"
                                                className={`w-full bg-black/50 border border-[var(--color-primary)]/30 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary)] outline-none ${isAudioConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                value={cut.actingDirection || ''}
                                                disabled={isAudioConfirmed}
                                                placeholder="예: 슬픔을 참으며 떨리는 목소리로, 마지막에 한숨..."
                                                onChange={(e) => {
                                                    onUpdateCut(cut.id, { actingDirection: e.target.value });
                                                }}
                                                onBlur={onSave}
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">💡 스크립트 생성 시 AI가 자동 작성. 원하면 수정 가능</p>
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* SFX Section */}
                            {(cut.sfxDescription || cut.sfxUrl) && (
                                <div className="mt-3">
                                    {cut.sfxDescription && !cut.sfxUrl && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded border border-white/5">
                                            <Waves size={12} className="text-gray-500 shrink-0" />
                                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">SFX IDEA:</span>
                                            <span className="text-xs text-gray-400 flex-1 truncate">{cut.sfxDescription}</span>
                                            {onOpenSfxModal && (
                                                <button onClick={() => onOpenSfxModal(cut.id)} className="text-[10px] text-gray-400 font-bold px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 transition-colors">Find</button>
                                            )}
                                        </div>
                                    )}
                                    {cut.sfxUrl && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded border border-green-500/20">
                                            <Volume2 size={12} className="text-green-400 shrink-0" />
                                            <span className="text-xs text-green-400 font-bold">SFX:</span>
                                            <span className="text-xs text-gray-300 flex-1 truncate">{cut.sfxName || 'Sound Effect'}</span>
                                            {onRemoveSfx && (
                                                <button
                                                    onClick={() => onRemoveSfx(cut.id)}
                                                    className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Remove Sound Effect"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ===== VISUAL SECTION (Image + Video) ===== */}
            <div className={`border-t border-white/10 ${isImageConfirmed ? 'bg-green-500/5' : ''}`}>
                {/* Visual Section Header (Clean Line Style) */}
                <div
                    className="flex items-center justify-between px-4 py-2 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group/header"
                    onClick={() => {
                        const nextState = !isVisualManualExpand;
                        setIsVisualManualExpand(nextState);
                        // If we are opening a locked cut, default to showing settings/preview
                        if (nextState && isImageConfirmed) {
                            setShowImageSettings(true);
                        }
                    }}
                >
                    <div className="flex items-center gap-2">
                        {isVisualVisible ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                        <Image size={12} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Visual</span>
                        <span className="text-[10px] text-gray-500">(Image + Video)</span>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleImageConfirm(cut.id);
                        }}
                        disabled={!hasImage}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${isImageConfirmed ? 'bg-green-500 text-black' : 'bg-white/10 text-gray-400 hover:text-white disabled:opacity-30'}`}
                    >
                        {isImageConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                        {isImageConfirmed ? 'Locked' : 'Lock Image'}
                    </button>
                </div>

                {isVisualVisible && (
                    <>
                        {/* Visual Prompt Row */}
                        <div className="px-4 py-3">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">📷 Still Image Prompt</label>
                                        {/* Term Helper Container */}
                                        <div className="relative inline-block">
                                            <button
                                                onClick={() => setShowTermHelper(!showTermHelper)}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all border ${showTermHelper ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white hover:bg-white/10 shadow-sm'}`}
                                            >
                                                <HelpCircle size={10} />
                                                Term Helper
                                            </button>

                                            {/* Term Helper Dropdown (positioned at side, expands upwards) */}
                                            {showTermHelper && (
                                                <>
                                                    <div className="fixed inset-0 z-[90]" onClick={() => setShowTermHelper(false)} />
                                                    <div className="absolute bottom-0 left-full ml-2 w-[320px] max-h-[280px] flex flex-col bg-[#1a1a1a] border border-[var(--color-primary)]/30 rounded-lg shadow-2xl z-[100] overflow-hidden">
                                                        {/* Fixed Header */}
                                                        <div className="p-3 bg-[#1a1a1a] border-b border-white/10 shrink-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-[10px] text-[var(--color-primary)] font-bold tracking-tight">📚 영상 전문 용어 도우미</span>
                                                                <button onClick={() => setShowTermHelper(false)} className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded"><X size={12} /></button>
                                                            </div>
                                                            <p className="text-[9px] text-gray-400">용어를 클릭하면 프롬프트에 추가됩니다.</p>
                                                        </div>

                                                        {/* Scrollable List */}
                                                        <div className="flex-1 overflow-y-auto p-3 pt-0">
                                                            {Object.entries(VISUAL_TERMS).map(([category, terms]) => (
                                                                <div key={category} className="mb-3 first:mt-3">
                                                                    <h5 className="text-xs font-bold text-[var(--color-primary)] uppercase mb-1.5 sticky top-0 bg-[#1a1a1a] py-1 z-10">{category}</h5>
                                                                    <div className="space-y-1">
                                                                        {terms.map((item) => (
                                                                            <button
                                                                                key={item.term}
                                                                                onClick={() => {
                                                                                    const newPrompt = cut.visualPrompt ? `${cut.visualPrompt.trim()}, ${item.term}` : item.term;
                                                                                    onUpdateCut(cut.id, { visualPrompt: newPrompt });
                                                                                    setLocalVisualPrompt(newPrompt);
                                                                                }}
                                                                                disabled={isImageConfirmed}
                                                                                className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-primary)]/10 disabled:opacity-50 group transition-colors"
                                                                            >
                                                                                <div className="text-xs text-[var(--color-primary)] font-medium group-hover:text-white">{item.term}</div>
                                                                                <div className="text-xs text-gray-500">{item.desc}</div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <textarea
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-gray-300 text-sm min-h-[60px] focus:border-[var(--color-primary)] outline-none resize-none ${isImageConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={localVisualPrompt}
                                        disabled={isImageConfirmed}
                                        onChange={(e) => handleVisualPromptChange(e.target.value)}
                                        onFocus={() => { isVisualPromptFocusedRef.current = true; }}
                                        onBlur={() => {
                                            isVisualPromptFocusedRef.current = false;
                                            onSave();
                                        }}
                                        placeholder="Visual description (English)..."
                                    />
                                    {/* Korean Translation Display */}
                                    {cut.visualPromptKR && (
                                        <div className="mt-1 px-2 py-1.5 bg-white/5 rounded text-xs text-gray-500 border-l-2 border-[var(--color-primary)]/30">
                                            <span className="text-xs text-gray-600 mr-1">🇰🇷</span>
                                            {cut.visualPromptKR}
                                        </div>
                                    )}
                                </div>

                                {/* Image Buttons (Gen/Regen + Unified View) */}
                                <div className="flex flex-col gap-2 pt-5 shrink-0">
                                    {/* Gen/Regen Button */}
                                    <button
                                        onClick={() => hasImage ? onRegenerateImage(cut.id) : onGenerateImage(cut.id, cut.visualPrompt)}
                                        disabled={imageLoading || isImageConfirmed}
                                        className="flex items-center justify-center gap-1.5 w-[84px] px-2 py-2 rounded text-[11px] font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 border border-[var(--color-primary)]/10 disabled:opacity-50"
                                    >
                                        {imageLoading ? <Loader2 size={10} className="animate-spin" /> : <Image size={10} />}
                                        {hasImage ? '재생성' : '생성'}
                                    </button>

                                    {/* Unified View/Settings Button - Redesigned to be Circular + Text with Sand Orange Accent */}
                                    <div className="flex items-center gap-2 py-1">
                                        <button
                                            onClick={() => setShowImageSettings(!showImageSettings)}
                                            className={`flex items-center justify-center w-7 h-7 rounded-full transition-all shadow-sm border ${showImageSettings ? 'bg-[var(--color-primary)]/40 text-white border border-[var(--color-primary)]/50 shadow-[var(--color-primary)]/20' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 border-[var(--color-primary)]/30 shadow-[var(--color-primary)]/10'}`}
                                            title="Settings & Preview"
                                        >
                                            <Eye size={12} />
                                        </button>
                                        <span className={`text-[10px] font-bold uppercase tracking-widest min-w-[30px] ${showImageSettings ? 'text-[var(--color-primary)]' : 'text-[var(--color-primary)]/80'}`}>
                                            VIEW
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Image Settings Panel */}
                            {showImageSettings && (
                                <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/5 space-y-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Image Settings</span>
                                        <button onClick={() => setShowImageSettings(false)} className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded transition-colors"><X size={12} /></button>
                                    </div>

                                    {/* Image Preview (full aspect ratio) */}
                                    {hasImage && (
                                        <div className="rounded-lg overflow-hidden border border-white/10 bg-black shadow-lg">
                                            <img src={resolvedImageUrl || undefined} alt="Preview" className="w-full max-h-[600px] object-contain mx-auto transition-all duration-300" />
                                        </div>
                                    )}

                                    {/* Referenced Assets */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-gray-400 uppercase font-bold">Referenced Assets</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {autoMatchedAssets.map((asset: any) => (
                                                <div key={asset.id} className="px-2 py-0.5 rounded bg-white/5 text-gray-400 text-xs border border-white/10">{asset.name} <span className="opacity-50">(Auto)</span></div>
                                            ))}
                                            {manualAssetObjs.map((asset: any) => (
                                                <div key={asset.id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs border border-[var(--color-primary)]/30">
                                                    {asset.name}
                                                    {!isImageConfirmed && <button onClick={() => onRemoveAsset(cut.id, asset.id)} className="hover:text-white"><X size={10} /></button>}
                                                </div>
                                            ))}
                                            {(cut.referenceCutIds || []).map(refId => (
                                                <div key={refId} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs border border-[var(--color-primary)]/30">
                                                    <Image size={8} /> Cut #{refId}
                                                    {!isImageConfirmed && <button onClick={() => onRemoveReference(cut.id, refId)} className="hover:text-white"><X size={10} /></button>}
                                                </div>
                                            ))}

                                            {/* Add Button - Moved to end of list */}
                                            {!isImageConfirmed && (
                                                <div className={`relative ${showAssetSelector ? 'z-[100]' : ''}`}>
                                                    <button onClick={() => onToggleAssetSelector(cut.id)} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30">
                                                        <Plus size={10} /> Add
                                                    </button>
                                                    {showAssetSelector && (
                                                        <>
                                                            <div className="fixed inset-0 z-[100]" onClick={onCloseAssetSelector} />
                                                            <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a1a] border border-[var(--color-border)] rounded-lg shadow-2xl z-[101] max-h-64 overflow-y-auto">
                                                                <div className="p-2 text-xs text-gray-500 font-bold uppercase">Assets</div>
                                                                {uniqueAssets.map((asset: any) => (
                                                                    <button key={asset.id} onClick={() => onAddAsset(cut.id, asset.id)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />{asset.name}
                                                                    </button>
                                                                ))}
                                                                {index > 0 && (
                                                                    <>
                                                                        <div className="p-2 text-xs text-gray-500 font-bold uppercase mt-1 border-t border-white/10">Previous Cuts</div>
                                                                        {localScript.slice(0, index).filter(c => c.finalImageUrl).map(prevCut => (
                                                                            <CutReferenceItem key={prevCut.id} cut={prevCut} onSelect={(id) => onAddReference(cut.id, id)} />
                                                                        ))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* User Reference Sketch Upload */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400 uppercase font-bold">🎨 Sketch/Reference (구도 우선 참조)</span>
                                        <div className="flex items-center gap-2">
                                            {cut.userReferenceImage && (
                                                <div className="relative w-8 h-8 rounded overflow-hidden border border-white/20">
                                                    <img
                                                        src={resolvedUserRefUrl || undefined}
                                                        className="w-full h-full object-cover"
                                                        alt="Reference"
                                                    />
                                                    <button onClick={() => onUpdateCut(cut.id, { userReferenceImage: undefined })} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100"><X size={10} className="text-white" /></button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer text-xs bg-white/10 hover:bg-white/20 text-gray-300 px-2 py-1 rounded flex items-center gap-1">
                                                <Plus size={10} /> Upload
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file && onUploadUserReference) onUploadUserReference(cut.id, file); }} />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Video Motion Prompt (at bottom of image settings) */}
                                    <div className="pt-3 border-t border-white/10">
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[10px] text-purple-400/70 uppercase font-bold tracking-wider">🎬 Video Motion Prompt (Step 4.5)</label>
                                            <div className="flex items-center gap-1">
                                                {!cut.videoPrompt && !isImageConfirmed && (
                                                    <button onClick={handleAutoGenerateVideoPrompt} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
                                                        <Sparkles size={10} /> Auto
                                                    </button>
                                                )}
                                                {cut.videoPrompt && !isImageConfirmed && (
                                                    <button onClick={handleAutoGenerateVideoPrompt} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/10 text-gray-400 hover:text-white">
                                                        <Edit3 size={10} /> Reset
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <textarea
                                            className={`w-full bg-black/50 border border-purple-500/20 rounded px-2 py-1.5 text-gray-300 text-xs min-h-[50px] focus:border-purple-500 outline-none resize-none ${isImageConfirmed ? 'opacity-50' : ''}`}
                                            value={cut.videoPrompt || ''}
                                            disabled={isImageConfirmed}
                                            onChange={(e) => onUpdateCut(cut.id, { videoPrompt: e.target.value })}
                                            onBlur={onSave}
                                            placeholder="Camera movement, character actions... (이미지 Lock 후 자동 생성 권장)"
                                        />
                                        <p className="text-xs text-gray-500 mt-1 italic">💡 이미지 Lock 후 AI가 자동 생성. Step 4.5에서 더 정교한 enhancement 적용됨.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Hidden audio element for playback */}
                    </>
                )}

                {/* Hidden audio element for playback - MOVED OUTSIDE ANY CONDITIONAL BLOCKS */}
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
            </div>
        </div>
    );
});

// Mini component for previous cut reference
const CutReferenceItem = ({ cut, onSelect }: { cut: ScriptCut, onSelect: (id: number) => void }) => {
    const [imgUrl, setImgUrl] = useState('');
    useEffect(() => {
        if (cut.finalImageUrl) {
            if (isIdbUrl(cut.finalImageUrl)) {
                resolveUrl(cut.finalImageUrl).then(url => setImgUrl(url || ''));
            } else {
                setImgUrl(cut.finalImageUrl);
            }
        }
    }, [cut.finalImageUrl]);
    if (!imgUrl) return null;
    return (
        <button onClick={() => onSelect(cut.id)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
            <div className="w-6 h-6 rounded overflow-hidden shrink-0 border border-white/10">
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-gray-400">Cut #{cut.id}</span>
        </button>
    );
};
