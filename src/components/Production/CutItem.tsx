import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Check, Lock, Unlock, Mic, Loader2, Play, ImageIcon as Image, Eye, X, Plus, HelpCircle, Waves, Volume2, Video } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import { getMatchedAssets } from '../../utils/assetUtils';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import type { AspectRatio } from '../../store/types';

// Visual prompt helper terms
const VISUAL_TERMS = {
    'Camera Angle': [
        { term: 'low angle shot', desc: '피사체를 아래에서 올려다보는 각도 (권위감, 위압감)' },
        { term: 'high angle shot', desc: '피사체를 위에서 내려다보는 각도 (취약함, 작아보임)' },
        { term: 'dutch angle', desc: '기울어진 카메라 각도 (불안, 긴장감)' },
        { term: 'eye level', desc: '눈높이 수평 촬영 (자연스러움)' },
        { term: 'birds eye view', desc: '새가 내려다보는 듯한 수직 하강 촬영' },
    ],
    'Shot Size': [
        { term: 'extreme close up (ECU)', desc: '눈, 입술 등 얼굴 일부만 클로즈업' },
        { term: 'close up (CU)', desc: '얼굴 전체 클로즈업' },
        { term: 'medium close up (MCU)', desc: '가슴부터 머리까지' },
        { term: 'medium shot (MS)', desc: '허리부터 머리까지' },
        { term: 'medium long shot (MLS)', desc: '무릎부터 머리까지' },
        { term: 'full shot (FS)', desc: '발끝부터 머리까지 전신' },
        { term: 'long shot (LS)', desc: '인물 + 주변 환경' },
        { term: 'extreme long shot (ELS)', desc: '매우 넓은 풍경, 인물은 작게' },
    ],
    'Lighting': [
        { term: 'chiaroscuro lighting', desc: '명암 대비가 강한 드라마틱 조명' },
        { term: 'rim lighting', desc: '피사체 뒤에서 윤곽을 비추는 조명' },
        { term: 'soft diffused lighting', desc: '부드럽게 퍼지는 자연광 느낌' },
        { term: 'harsh direct lighting', desc: '강렬한 직사광선, 그림자 선명' },
        { term: 'golden hour lighting', desc: '일출/일몰 시간대 따뜻한 조명' },
        { term: 'neon lighting', desc: '네온사인 빛, 사이버펑크 분위기' },
    ],
    'Atmosphere': [
        { term: 'volumetric fog', desc: '빛이 통과하는 안개 효과' },
        { term: 'dust particles', desc: '공기 중 먼지 입자' },
        { term: 'lens flare', desc: '렌즈에 빛이 반사되는 효과' },
        { term: 'bokeh effect', desc: '배경 흐림 (아웃포커스)' },
        { term: 'motion blur', desc: '움직임에 의한 잔상' },
    ]
};

interface CutItemProps {
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
    onOpenSfxModal,
    onRemoveSfx
}: CutItemProps) => {
    // Local state for debounced inputs
    const [localDialogue, setLocalDialogue] = useState(cut.dialogue || '');
    const [localVisualPrompt, setLocalVisualPrompt] = useState(cut.visualPrompt || '');
    const isFocusedRef = useRef(false);
    const isVisualPromptFocusedRef = useRef(false);

    // Resolved URLs for IndexedDB
    const [resolvedImageUrl, setResolvedImageUrl] = useState<string>('');
    const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string>('');
    const [actualAudioDuration, setActualAudioDuration] = useState<number | null>(null);

    // Dropdown states for inline settings
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [showImageSettings, setShowImageSettings] = useState(false);

    // Sync local state with cut changes (but not while editing)
    useEffect(() => {
        if (!isFocusedRef.current) setLocalDialogue(cut.dialogue || '');
    }, [cut.dialogue]);

    useEffect(() => {
        if (!isVisualPromptFocusedRef.current) setLocalVisualPrompt(cut.visualPrompt || '');
    }, [cut.visualPrompt]);

    // Resolve IDB URLs
    useEffect(() => {
        if (cut.finalImageUrl) {
            if (isIdbUrl(cut.finalImageUrl)) {
                resolveUrl(cut.finalImageUrl).then(url => setResolvedImageUrl(url || ''));
            } else {
                setResolvedImageUrl(cut.finalImageUrl);
            }
        } else {
            setResolvedImageUrl('');
        }
    }, [cut.finalImageUrl]);

    useEffect(() => {
        if (cut.audioUrl) {
            if (isIdbUrl(cut.audioUrl)) {
                resolveUrl(cut.audioUrl).then(url => setResolvedAudioUrl(url || ''));
            } else {
                setResolvedAudioUrl(cut.audioUrl);
            }
        } else {
            setResolvedAudioUrl('');
        }
    }, [cut.audioUrl]);

    // Debounced dialogue update
    const handleDialogueChange = useCallback((value: string) => {
        setLocalDialogue(value);
        onUpdateCut(cut.id, { dialogue: value });
    }, [cut.id, onUpdateCut]);

    // Debounced visual prompt update
    const handleVisualPromptChange = useCallback((value: string) => {
        setLocalVisualPrompt(value);
        onUpdateCut(cut.id, { visualPrompt: value });
    }, [cut.id, onUpdateCut]);

    // Asset matching
    const manualAssets = cut.referenceAssetIds || [];
    const allMatchedAssets = useMemo(() =>
        getMatchedAssets(cut.visualPrompt, manualAssets, assetDefinitions, cut.id),
        [cut.visualPrompt, manualAssets, assetDefinitions, cut.id]);

    const autoMatchedAssets = allMatchedAssets.filter((a: any) => !manualAssets.includes(a.id));
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

    return (
        <div
            className={`glass-panel relative group ${isFullyConfirmed ? 'border-green-500/50 bg-green-500/5' : 'hover:border-[var(--color-primary-dim)]'} ${showAssetSelector ? 'z-50' : 'z-0'}`}
        >
            {/* Core Editing Area - Always Visible */}
            <div className="p-4 space-y-3">
                {/* Row 1: Cut number, Speaker, Duration, Status */}
                <div className="flex items-center gap-3">
                    {/* Cut Number Badge */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 ${isFullyConfirmed ? 'bg-green-500 text-black border-green-500' : 'bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-border)]'}`}>
                        {index + 1}
                    </div>

                    {/* Thumbnail Preview */}
                    {hasImage && (
                        <div className="w-12 h-12 rounded border border-[var(--color-border)] overflow-hidden shrink-0 bg-black">
                            <img
                                src={resolvedImageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Speaker Selector & Duration */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <select
                            className={`bg-transparent border-b border-[var(--color-border)] text-[var(--color-primary)] font-bold focus:border-[var(--color-primary)] outline-none py-1 text-sm appearance-none cursor-pointer max-w-[120px] ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                            {!speakerList.includes('Narrator') && (
                                <option value="Narrator">Narrator</option>
                            )}
                            {!speakerList.includes('SILENT') && (
                                <option value="SILENT">SILENT</option>
                            )}
                        </select>

                        <span className="text-[10px] text-gray-500 font-medium bg-white/5 px-2 py-1 rounded shrink-0">{displayTotalDuration}s</span>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {hasImage && (
                            <div className={`w-6 h-6 rounded flex items-center justify-center ${isImageConfirmed ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'}`} title={isImageConfirmed ? 'Image Locked' : 'Image Ready'}>
                                <Image size={12} />
                            </div>
                        )}
                        {hasAudio && (
                            <div className={`w-6 h-6 rounded flex items-center justify-center ${isAudioConfirmed ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'}`} title={isAudioConfirmed ? 'Audio Locked' : 'Audio Ready'}>
                                <Mic size={12} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 2: Dialogue Input + Audio Actions */}
                <div className="flex gap-2 items-start">
                    <div className="flex-1">
                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">💬 Dialogue</label>
                        <textarea
                            className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-sm min-h-[50px] focus:border-[var(--color-primary)] outline-none resize-none ${isAudioConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                    {/* Audio Action Buttons */}
                    <div className="flex flex-col gap-1 pt-5">
                        {/* Generate/Play Audio Button */}
                        {!hasAudio && cut.speaker !== 'SILENT' ? (
                            <button
                                onClick={() => onGenerateAudio(cut.id, cut.dialogue)}
                                disabled={audioLoading || !cut.dialogue || isAudioConfirmed}
                                className="flex items-center justify-center gap-1 w-20 px-2 py-2 rounded-lg bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-xs hover:bg-[var(--color-primary)]/30 transition-colors disabled:opacity-50"
                                title="Generate Audio"
                            >
                                {audioLoading ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
                                <span>Gen</span>
                            </button>
                        ) : hasRealAudio ? (
                            <button
                                onClick={() => onPlayAudio(cut.id)}
                                className={`flex items-center justify-center gap-1 w-20 px-2 py-2 rounded-lg text-xs transition-colors ${playingAudio === cut.id ? 'bg-[var(--color-primary)] text-black' : 'bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30'}`}
                                title="Play Audio"
                            >
                                <Play size={12} />
                                <span>{playingAudio === cut.id ? 'Stop' : 'Play'}</span>
                            </button>
                        ) : cut.speaker === 'SILENT' ? (
                            <div className="flex items-center justify-center w-20 px-2 py-2 rounded-lg bg-gray-500/10 text-gray-500 text-xs border border-gray-500/20">
                                🔇 Silent
                            </div>
                        ) : null}

                        {/* Audio Lock Button */}
                        {hasAudio && (
                            <button
                                onClick={() => onToggleAudioConfirm(cut.id)}
                                className={`flex items-center justify-center gap-1 w-20 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${isAudioConfirmed ? 'bg-green-500 text-black' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white border border-white/10'}`}
                                title={isAudioConfirmed ? "Unlock Audio" : "Lock Audio"}
                            >
                                {isAudioConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                                🎵 {isAudioConfirmed ? 'Locked' : 'Lock'}
                            </button>
                        )}

                        {/* Audio Settings Dropdown Toggle */}
                        <button
                            onClick={() => setShowAudioSettings(!showAudioSettings)}
                            className={`flex items-center justify-center gap-1 w-20 px-2 py-1.5 rounded text-[10px] transition-colors ${showAudioSettings ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'bg-white/5 text-gray-500 hover:text-white border border-white/10'}`}
                            title="Audio Settings"
                        >
                            ⚙️ Settings
                        </button>
                    </div>
                </div>

                {/* Audio Settings Dropdown (inline) */}
                {showAudioSettings && (
                    <div className="p-3 bg-black/30 rounded-lg border border-[var(--color-border)] space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase">🎵 Audio Settings</span>
                            <button onClick={() => setShowAudioSettings(false)} className="text-gray-500 hover:text-white"><X size={12} /></button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <div className="min-w-[80px]">
                                <label className="text-[9px] text-gray-500 uppercase block mb-1">Language</label>
                                <select
                                    className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                    value={cut.language || 'ko-KR'}
                                    disabled={isAudioConfirmed}
                                    onChange={(e) => onUpdateCut(cut.id, { language: e.target.value as 'en-US' | 'ko-KR' })}
                                >
                                    <option value="ko-KR">한국어</option>
                                    <option value="en-US">English</option>
                                </select>
                            </div>
                            <div className="min-w-[70px]">
                                <label className="text-[9px] text-gray-500 uppercase block mb-1">Gender</label>
                                <select
                                    className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                    value={cut.voiceGender || 'neutral'}
                                    disabled={isAudioConfirmed}
                                    onChange={(e) => onUpdateCut(cut.id, { voiceGender: e.target.value as any })}
                                >
                                    <option value="neutral">Auto</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                            <div className="min-w-[70px]">
                                <label className="text-[9px] text-gray-500 uppercase block mb-1">Age</label>
                                <select
                                    className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                    value={cut.voiceAge || 'adult'}
                                    disabled={isAudioConfirmed}
                                    onChange={(e) => onUpdateCut(cut.id, { voiceAge: e.target.value as any })}
                                >
                                    <option value="child">Child</option>
                                    <option value="young">Young</option>
                                    <option value="adult">Adult</option>
                                    <option value="senior">Senior</option>
                                </select>
                            </div>
                            <div className="min-w-[80px]">
                                <label className="text-[9px] text-gray-500 uppercase block mb-1">Emotion</label>
                                <select
                                    className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                    value={cut.emotion || 'neutral'}
                                    disabled={isAudioConfirmed}
                                    onChange={(e) => onUpdateCut(cut.id, { emotion: e.target.value })}
                                >
                                    <option value="neutral">Neutral</option>
                                    <option value="happy">Happy</option>
                                    <option value="sad">Sad</option>
                                    <option value="angry">Angry</option>
                                    <option value="excited">Excited</option>
                                    <option value="calm">Calm</option>
                                </select>
                            </div>
                            <div className="min-w-[60px]">
                                <label className="text-[9px] text-gray-500 uppercase block mb-1">Padding</label>
                                <select
                                    className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`}
                                    value={cut.audioPadding ?? 0.5}
                                    disabled={isAudioConfirmed}
                                    onChange={(e) => onUpdateCut(cut.id, { audioPadding: parseFloat(e.target.value) })}
                                >
                                    <option value={0}>0s</option>
                                    <option value={0.2}>0.2s</option>
                                    <option value={0.5}>0.5s</option>
                                    <option value={1.0}>1.0s</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Row 3: Visual Prompt Input + Image Actions */}
                <div className="flex gap-2 items-start">
                    <div className="flex-1">
                        <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">📷 Visual Prompt</label>
                        <textarea
                            className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-gray-300 text-sm min-h-[50px] focus:border-blue-500 outline-none resize-none ${isImageConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                            value={localVisualPrompt}
                            disabled={isImageConfirmed}
                            onChange={(e) => handleVisualPromptChange(e.target.value)}
                            onFocus={() => { isVisualPromptFocusedRef.current = true; }}
                            onBlur={() => {
                                isVisualPromptFocusedRef.current = false;
                                onSave();
                            }}
                            placeholder="Visual description..."
                        />
                    </div>
                    {/* Image Action Buttons */}
                    <div className="flex flex-col gap-1 pt-5">
                        {/* Generate/View Image Button */}
                        {!hasImage ? (
                            <button
                                onClick={() => onGenerateImage(cut.id, cut.visualPrompt)}
                                disabled={imageLoading || isImageConfirmed}
                                className="flex items-center justify-center gap-1 w-20 px-2 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                                title="Generate Image"
                            >
                                {imageLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                                <span>Gen</span>
                            </button>
                        ) : (
                            <button
                                onClick={() => onRegenerateImage(cut.id)}
                                disabled={imageLoading || isImageConfirmed}
                                className="flex items-center justify-center gap-1 w-20 px-2 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                                title="Regenerate Image"
                            >
                                {imageLoading ? <Loader2 size={12} className="animate-spin" /> : <Image size={12} />}
                                <span>Regen</span>
                            </button>
                        )}

                        {/* Image Lock Button */}
                        {hasImage && (
                            <button
                                onClick={() => onToggleImageConfirm(cut.id)}
                                className={`flex items-center justify-center gap-1 w-20 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${isImageConfirmed ? 'bg-green-500 text-black' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white border border-white/10'}`}
                                title={isImageConfirmed ? "Unlock Image" : "Lock Image"}
                            >
                                {isImageConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                                🖼️ {isImageConfirmed ? 'Locked' : 'Lock'}
                            </button>
                        )}

                        {/* Image Settings Dropdown Toggle */}
                        <button
                            onClick={() => setShowImageSettings(!showImageSettings)}
                            className={`flex items-center justify-center gap-1 w-20 px-2 py-1.5 rounded text-[10px] transition-colors ${showImageSettings ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-500 hover:text-white border border-white/10'}`}
                            title="Image Settings"
                        >
                            ⚙️ Settings
                        </button>
                    </div>
                </div>

                {/* Image Settings Dropdown (inline) */}
                {showImageSettings && (
                    <div className="p-3 bg-black/30 rounded-lg border border-blue-500/20 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-blue-400 font-bold uppercase">🖼️ Image Settings</span>
                            <button onClick={() => setShowImageSettings(false)} className="text-gray-500 hover:text-white"><X size={12} /></button>
                        </div>

                        {/* Image Preview (if exists) */}
                        {hasImage && (
                            <div className="rounded-lg overflow-hidden border border-white/10 bg-black max-h-[200px]">
                                <img src={resolvedImageUrl} alt="Preview" className="w-full h-full object-contain" />
                            </div>
                        )}

                        {/* Visual Term Helper */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <HelpCircle size={10} className="text-blue-400" />
                                <span className="text-[9px] text-blue-400 uppercase font-bold">전문 용어 도우미</span>
                            </div>
                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                {Object.entries(VISUAL_TERMS).slice(0, 2).map(([category, terms]) => (
                                    <div key={category}>
                                        <h5 className="text-[9px] font-bold text-gray-500 uppercase mb-1">{category}</h5>
                                        <div className="flex flex-wrap gap-1">
                                            {terms.slice(0, 4).map((item) => (
                                                <button
                                                    key={item.term}
                                                    onClick={() => {
                                                        const newPrompt = cut.visualPrompt
                                                            ? `${cut.visualPrompt.trim()}, ${item.term}`
                                                            : item.term;
                                                        onUpdateCut(cut.id, { visualPrompt: newPrompt });
                                                        setLocalVisualPrompt(newPrompt);
                                                    }}
                                                    disabled={isImageConfirmed}
                                                    className="px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 rounded border border-blue-500/20 transition-colors disabled:opacity-50"
                                                    title={item.desc}
                                                >
                                                    {item.term}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Video Motion Prompt */}
                        <div>
                            <label className="text-[9px] text-purple-400 uppercase font-bold block mb-1">🎬 Video Motion Prompt</label>
                            <textarea
                                className={`w-full bg-black/50 border border-purple-500/20 rounded px-2 py-1.5 text-gray-300 text-xs min-h-[50px] focus:border-purple-500 outline-none resize-none ${isImageConfirmed ? 'opacity-50' : ''}`}
                                value={cut.videoPrompt || ''}
                                disabled={isImageConfirmed}
                                onChange={(e) => onUpdateCut(cut.id, { videoPrompt: e.target.value })}
                                onBlur={onSave}
                                placeholder="Camera movement, character actions..."
                            />
                        </div>

                        {/* User Reference Upload */}
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-orange-400 uppercase font-bold">🎨 Sketch/Reference</span>
                            <div className="flex items-center gap-2">
                                {cut.userReferenceImage && (
                                    <div className="relative w-6 h-6 rounded overflow-hidden border border-white/20">
                                        <img src={cut.userReferenceImage} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => onUpdateCut(cut.id, { userReferenceImage: undefined })}
                                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100"
                                        >
                                            <X size={10} className="text-white" />
                                        </button>
                                    </div>
                                )}
                                <label className="cursor-pointer text-[9px] bg-white/10 hover:bg-white/20 text-gray-300 px-2 py-1 rounded flex items-center gap-1">
                                    <Plus size={10} />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file && onUploadUserReference) onUploadUserReference(cut.id, file);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Row 4: SFX Recommendation (if available) */}
                {cut.sfxDescription && !cut.sfxUrl && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded border border-purple-500/20">
                        <Waves size={12} className="text-purple-400 shrink-0" />
                        <span className="text-[10px] text-purple-400 font-bold">SFX IDEA:</span>
                        <span className="text-xs text-gray-400 flex-1 truncate">{cut.sfxDescription}</span>
                        {onOpenSfxModal && (
                            <button
                                onClick={() => onOpenSfxModal(cut.id)}
                                className="text-[10px] text-purple-300 hover:text-purple-200 font-bold px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 transition-colors"
                            >
                                Find
                            </button>
                        )}
                    </div>
                )}

                {/* Show attached SFX */}
                {cut.sfxUrl && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded border border-green-500/20">
                        <Volume2 size={12} className="text-green-400 shrink-0" />
                        <span className="text-[10px] text-green-400 font-bold">SFX:</span>
                        <span className="text-xs text-gray-300 flex-1 truncate">{cut.sfxName || 'Sound Effect'}</span>
                        <div className="flex items-center gap-1">
                            {onOpenSfxModal && (
                                <button
                                    onClick={() => onOpenSfxModal(cut.id)}
                                    className="text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                    Change
                                </button>
                            )}
                            {onRemoveSfx && (
                                <button
                                    onClick={() => onRemoveSfx(cut.id)}
                                    className="p-1 text-red-500/50 hover:text-red-400 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Hidden audio element for playback */}
                {hasRealAudio && resolvedAudioUrl && (
                    <audio
                        key={resolvedAudioUrl}
                        id={`audio-${cut.id}`}
                        src={resolvedAudioUrl}
                        preload="metadata"
                        onLoadedMetadata={(e) => setActualAudioDuration(e.currentTarget.duration)}
                        onError={(e) => {
                            const target = e.currentTarget;
                            console.error(`[CutItem ${cut.id}] Audio playback error:`, target.error);
                        }}
                        className="hidden"
                    />
                )}
            </div>

            {/* Advanced Settings - Collapsible (Only Assets & Delete) */}
            <details className="border-t border-white/5">
                <summary className="px-4 py-2 cursor-pointer text-[10px] text-gray-500 hover:text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2 select-none list-none">
                    ⚙️ More Options
                    <span className="text-[9px] font-normal text-gray-600">(Asset selection, Delete)</span>
                </summary>
                <div className="p-4 pt-2 space-y-4">
                    {/* Delete Button Row */}
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Delete this cut permanently</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Are you sure you want to delete this cut?')) {
                                    onDelete(cut.id);
                                }
                            }}
                            className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/20 transition-colors flex items-center gap-1"
                            title="Delete Cut"
                        >
                            <X size={14} /> Delete Cut
                        </button>
                    </div>

                    {/* Asset Selection */}
                    <div className="flex flex-wrap gap-2 items-center min-h-[32px] pt-3 border-t border-white/5">
                        <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mr-2">Assets:</span>

                        {manualAssetObjs.map((asset: any) => (
                            <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs border border-[var(--color-primary)]/30">
                                <span>{asset.name}</span>
                                {!isImageConfirmed && (
                                    <button onClick={() => onRemoveAsset(cut.id, asset.id)} className="hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {(cut.referenceCutIds || []).map(refId => (
                            <div key={refId} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30">
                                <Image size={10} />
                                <span>Cut #{refId}</span>
                                {!isImageConfirmed && (
                                    <button onClick={() => onRemoveReference(cut.id, refId)} className="hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {autoMatchedAssets.map((asset: any) => (
                            <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-400 text-xs border border-white/10" title="Auto-detected">
                                <span>{asset.name}</span>
                                <span className="text-[10px] opacity-50">(Auto)</span>
                            </div>
                        ))}

                        {!isImageConfirmed && (
                            <div className={`relative ${showAssetSelector ? 'z-[100]' : ''}`}>
                                <button
                                    onClick={() => onToggleAssetSelector(cut.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-400 text-xs border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    <Plus size={12} /> Add
                                </button>

                                {showAssetSelector && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-[100]"
                                            onClick={onCloseAssetSelector}
                                        />
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-[var(--color-border)] rounded-lg shadow-2xl z-[101] max-h-80 overflow-y-auto">
                                            <div className="p-2 text-xs text-gray-500 font-bold uppercase">Select Asset</div>
                                            {uniqueAssets.map((asset: any) => (
                                                <button
                                                    key={asset.id}
                                                    onClick={() => onAddAsset(cut.id, asset.id)}
                                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]"></div>
                                                    {asset.name}
                                                </button>
                                            ))}

                                            {/* Previous Cuts Section */}
                                            {index > 0 && (
                                                <>
                                                    <div className="p-2 text-xs text-gray-500 font-bold uppercase mt-2 border-t border-white/10">Previous Cuts</div>
                                                    {localScript.slice(0, index).filter(c => c.finalImageUrl).map(prevCut => (
                                                        <CutReferenceItem
                                                            key={prevCut.id}
                                                            cut={prevCut}
                                                            onSelect={(id) => onAddReference(cut.id, id)}
                                                        />
                                                    ))}
                                                    {localScript.slice(0, index).filter(c => c.finalImageUrl).length === 0 && (
                                                        <div className="px-3 py-2 text-xs text-gray-600 italic">No generated images yet</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Large Image Preview (if available) */}
                    {hasImage && (
                        <div className="rounded-lg overflow-hidden border border-[var(--color-border)] bg-black">
                            <img
                                src={resolvedImageUrl}
                                alt="Generated Cut"
                                className="w-full h-auto max-h-[400px] object-contain mx-auto"
                            />
                        </div>
                    )}
                </div>
            </details>
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
        <button
            onClick={() => onSelect(cut.id)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2 group"
        >
            <div className="w-8 h-8 rounded overflow-hidden shrink-0 border border-white/10 group-hover:border-white/30">
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-gray-400">Cut #{cut.id}</div>
                <div className="text-[10px] text-gray-600 truncate">{cut.visualPrompt?.slice(0, 20)}...</div>
            </div>
        </button>
    );
};
