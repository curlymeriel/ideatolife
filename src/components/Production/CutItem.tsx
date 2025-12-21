import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Check, Lock, Unlock, Mic, Loader2, Play, ImageIcon as Image, Eye, X, Plus, HelpCircle, Waves, Volume2, Video, Settings, Trash2, Edit3, Sparkles } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import { getMatchedAssets } from '../../utils/assetUtils';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import type { AspectRatio } from '../../store/types';

// Comprehensive Visual prompt helper terms (?ÅÎ¨∏?ΩÏñ¥: ?úÍ??§Î™Ö)
const VISUAL_TERMS = {
    'Camera Angle (Ïπ¥Î©î???µÍ?)': [
        { term: 'Low Angle Shot (LAS)', desc: '?ºÏÇ¨Ï≤¥Î? ?ÑÎûò?êÏÑú ?¨Î†§?§Î≥¥???µÍ?. ?Ä?ÅÏóêÍ≤?Í∂åÏúÑÍ∞? ?ÑÏïïÍ∞? ?ÅÏõÖ???êÎÇå Î∂Ä?? },
        { term: 'High Angle Shot (HAS)', desc: '?ºÏÇ¨Ï≤¥Î? ?ÑÏóê???¥Î†§?§Î≥¥???µÍ?. Ï∑®ÏïΩ?? ?úÏÜå?? Í∞êÏãú?πÌïò???êÎÇå ?∞Ï∂ú' },
        { term: 'Dutch Angle / Canted Angle', desc: 'Ïπ¥Î©î?ºÎ? Í∏∞Ïö∏??Ï¥¨ÏòÅ. Î∂àÏïà, ?ºÎ?, ?¨Î¶¨??Î∂àÍ∑†???úÌòÑ???®Í≥º?? },
        { term: 'Eye Level Shot', desc: '?àÎÜí???òÌèâ Ï¥¨ÏòÅ. Í∞Ä???êÏó∞?§ÎüΩÍ≥?Ï§ëÎ¶Ω?ÅÏù∏ ?µÍ?' },
        { term: "Bird's Eye View (BEV)", desc: '?ºÏÇ¨Ï≤?Î∞îÎ°ú ?ÑÏóê???òÏßÅ ?òÍ∞ï Ï¥¨ÏòÅ. ?†Ïùò ?úÏ†ê, ?ÑÏ≤¥ ?ÅÌô© Ï°∞Îßù' },
        { term: "Worm's Eye View", desc: '?ÖÏóê???¨Î†§?§Î≥¥??Í∑πÎã®???ÄÍ∞? Í±¥Î¨º/Í±∞Ïù∏ Í∞ïÏ°∞, ?úÍ≥°???êÍ∑ºÍ∞? },
        { term: 'Over-the-Shoulder (OTS)', desc: '???∏Î¨º???¥Íπ® ?àÎ®∏Î°??§Î•∏ ?∏Î¨º??Ï¥¨ÏòÅ. ?Ä???•Î©¥???ÑÏàò' },
        { term: 'Point of View (POV)', desc: 'Ï∫êÎ¶≠?∞Ïùò 1?∏Ïπ≠ ?úÏ†ê. Í¥ÄÍ∞ùÏù¥ Ï∫êÎ¶≠?∞Ï? ?ôÏùº?? },
    ],
    'Shot Size (???¨Ïù¥Ï¶?': [
        { term: 'Extreme Close-Up (ECU/XCU)', desc: '?ºÍµ¥ ?ºÎ?(?? ?ÖÏà†, ??Îß??îÎ©¥ Í∞Ä?? Í∑πÎèÑ??Í∞êÏ†ï/?îÌÖå??Í∞ïÏ°∞' },
        { term: 'Close-Up (CU)', desc: '?ºÍµ¥ ?ÑÏ≤¥ ?êÎäî Ï§ëÏöî ?§Î∏å?ùÌä∏. Í∞êÏ†ï ?úÌòÑ, Í¥ÄÍ∞ùÍ≥º??ÏπúÎ?Í∞? },
        { term: 'Medium Close-Up (MCU)', desc: 'Í∞Ä??Î®∏Î¶¨. ?Ä???•Î©¥??Í∏∞Î≥∏, ?úÏ†ïÍ≥??úÏä§Ï≤??ôÏãú ?¨Ï∞©' },
        { term: 'Medium Shot (MS)', desc: '?àÎ¶¨~Î®∏Î¶¨. ?∏Î¨º???âÎèôÍ≥??úÏ†ï Í∑†Ìòï?àÍ≤å Î≥¥Ïó¨Ï§? },
        { term: 'Medium Long Shot (MLS) / Cowboy Shot', desc: 'Î¨¥Î¶é~Î®∏Î¶¨. ?úÎ?Í∑πÏóê??Ï¥ùÏßë Î≥¥Ïù¥Í≤?Ï¥¨ÏòÅ?¥ÏÑú ?†Îûò' },
        { term: 'Full Shot (FS)', desc: 'Î∞úÎÅù~Î®∏Î¶¨ ?ÑÏã†. ?∏Î¨º???ÑÏ≤¥ ?âÎèô, ?òÏÉÅ, Ï≤¥Ìòï ?åÏïÖ' },
        { term: 'Long Shot (LS) / Wide Shot (WS)', desc: '?∏Î¨º + Ï£ºÎ? ?òÍ≤Ω. ?∏Î¨ºÍ≥?Í≥µÍ∞Ñ??Í¥ÄÍ≥??§Ï†ï' },
        { term: 'Extreme Long Shot (ELS/XLS)', desc: 'Îß§Ïö∞ ?ìÏ? ?çÍ≤Ω, ?∏Î¨º Í∑πÌûà ?ëÍ≤å. ?§Ï??? Í≥†Î¶ΩÍ∞? ?úÏÇ¨?úÏ†Å ?êÎÇå' },
        { term: 'Two Shot', desc: '???∏Î¨º?????ÑÎ†à?ÑÏóê. Ï∫êÎ¶≠??Í¥ÄÍ≥??úÍ∞Å?? },
        { term: 'Group Shot', desc: '?¨Îü¨ ?∏Î¨º?????ÑÎ†à?ÑÏóê. ÏßëÎã® ??ïô ?úÌòÑ' },
    ],
    'Lighting (Ï°∞Î™Ö)': [
        { term: 'Chiaroscuro Lighting', desc: 'Î™ÖÏïî ?ÄÎπ?Í∑πÎ??? Î•¥ÎÑ§?ÅÏä§ ?åÌôî Í∏∞Î≤ï, ?úÎùºÎßàÌã±/ÎØ∏Ïä§?∞Î¶¨ Î∂ÑÏúÑÍ∏? },
        { term: 'Rembrandt Lighting', desc: '?ºÍµ¥ ?úÏ™Ω???ºÍ∞Å??Îπ? Í≥†Ï†Ñ??Ï¥àÏÉÅ??Ï°∞Î™Ö' },
        { term: 'Rim/Back Lighting', desc: '?ºÏÇ¨Ï≤??§Ïóê???§Í≥Ω??Í∞ïÏ°∞. ?†ÎπÑÎ°úÏ?, ?§Î£®???®Í≥º' },
        { term: 'Soft Diffused Lighting', desc: 'Î∂Ä?úÎüΩÍ≤??ïÏÇ∞??Îπ? Î°úÎß®?? Î™ΩÌôò?? ?åÎûò?∞ÎßÅ???∏Î¨º Ï¥¨ÏòÅ' },
        { term: 'Hard Direct Lighting', desc: 'Í∞ïÎ†¨??ÏßÅÏÇ¨Í¥? ?†Î™Ö??Í∑∏Î¶º?? Í±∞Ïπú/Í∑πÏ†Å Î∂ÑÏúÑÍ∏? },
        { term: 'Golden Hour Lighting', desc: '?ºÏ∂ú/?ºÎ™∞ ?©Í∏àÎπ? ?∞Îúª?? ?•Ïàò, Î°úÎß®?? },
        { term: 'Blue Hour Lighting', desc: '?¥Ï?Í∏?ÏßÅÌõÑ ?∏Î•∏Îπ? Ï∞®Í??Ä, Í≥†Ïöî?? ?∞Ïö∏?? },
        { term: 'Neon/Cyberpunk Lighting', desc: '?§Ïò®?¨Ïù∏ ?§ÏÉâÍ¥? ÎØ∏Îûò?? ?ÑÏãú?? ?¨Ïù¥Î≤ÑÌéë??ÎØ∏Ìïô' },
        { term: 'Practical Lighting', desc: '?îÎ©¥ ??Ï°∞Î™Ö(?®ÌîÑ, Ï¥õÎ∂à ?? ?úÏö©. ?êÏó∞?§Îü¨??Î∂ÑÏúÑÍ∏? },
        { term: 'Three-Point Lighting', desc: 'Key/Fill/Back 3??Ï°∞Î™Ö. Í∏∞Î≥∏?ÅÏù∏ ?§Ìäú?îÏò§ Ï°∞Î™Ö ?§Ï†ï' },
    ],
    'Atmosphere & Effects (Î∂ÑÏúÑÍ∏??®Í≥º)': [
        { term: 'Volumetric Fog/Lighting', desc: 'ÎπõÏ§ÑÍ∏∞Í? Î≥¥Ïù¥???àÍ∞ú. ?†ÎπÑÎ°úÏ?, ?ÅÏ†Å Î∂ÑÏúÑÍ∏? },
        { term: 'Dust Particles', desc: 'Í≥µÍ∏∞ Ï§?Î®ºÏ? ?ÖÏûê. ?§Îûò??Í≥µÍ∞Ñ, ?úÍ∞Ñ???êÎ¶Ñ ?úÌòÑ' },
        { term: 'Lens Flare', desc: '?åÏ¶à??Î∞òÏÇ¨??Îπ? ?úÏñëÍ¥? ?†ÎπÑÎ°úÏ?, J.J. ?êÏù¥Î∏åÎüº???§Ì??? },
        { term: 'Bokeh Effect', desc: '?ÑÍ≤Ω/Î∞∞Í≤Ω ?êÎ¶º?ºÎ°ú ?ºÏÇ¨Ï≤?Í∞ïÏ°∞. ÎπõÎßù???®Í≥º' },
        { term: 'Motion Blur', desc: '?ÄÏßÅÏûÑ???òÌïú ?îÏÉÅ. ?çÎèÑÍ∞? Í∏¥Î∞ï?? },
        { term: 'Depth of Field (DoF)', desc: 'Ï¥àÏ†ê ?¨ÎèÑ. Shallow=Î∞∞Í≤Ω ?êÎ¶º, Deep=?ÑÏ≤¥ ?†Î™Ö' },
        { term: 'Silhouette', desc: '??¥ë?ºÎ°ú ?ïÌÉúÎß?Î≥¥ÏûÑ. ÎØ∏Ïä§?∞Î¶¨, ?µÎ™Ö?? ?úÎùºÎßàÌã±' },
        { term: 'Reflection', desc: 'Í±∞Ïö∏, Î¨? ?†Î¶¨ ?±Ïóê Î∞òÏÇ¨. ?¥Ï§ë?? ?êÏïÑ?±Ï∞∞' },
        { term: 'Rain/Water Droplets', desc: 'Îπ? Î¨ºÎ∞©???®Í≥º. ?¨Ìîî, ?ïÌôî, Í∑πÏ†Å Î∂ÑÏúÑÍ∏? },
    ],
    'Composition (Íµ¨ÎèÑ)': [
        { term: 'Rule of Thirds', desc: '?îÎ©¥ 9?±Î∂Ñ, ÍµêÏ∞®?êÏóê Ï£ºÏöî ?îÏÜå Î∞∞Ïπò. Í∏∞Î≥∏ Íµ¨ÎèÑ Î≤ïÏπô' },
        { term: 'Center Composition', desc: 'Ï£ºÏöî ?ºÏÇ¨Ï≤??ïÏ§ë?? Í∂åÏúÑ, ?àÏ†ïÍ∞? ?ÄÏπ??' },
        { term: 'Symmetrical Composition', desc: 'Ï¢åÏö∞?ÄÏπ?Íµ¨ÎèÑ. ÏßàÏÑú, ?ïÏãùÎØ? ?®Ïä§ ?§Îçî???§Ì??? },
        { term: 'Leading Lines', desc: '???ÑÎ°ú, Í±¥Î¨º ?????úÏÑ†???†ÎèÑ. ÍπäÏù¥Í∞? Î∞©Ìñ•?? },
        { term: 'Frame within Frame', desc: 'Î¨? Ï∞ΩÎ¨∏ ?±ÏúºÎ°??ÑÎ†à?????ÑÎ†à?? Í≥†Î¶Ω, Í¥Ä?? ÏßëÏ§ë' },
        { term: 'Negative Space', desc: 'Îπ?Í≥µÍ∞Ñ ?úÏö©. Í≥†ÎèÖ, ÎØ∏ÎãàÎ©ÄÎ¶¨Ï¶ò, ?¨Î∞±??ÎØ? },
        { term: 'Foreground Interest', desc: '?ÑÍ≤Ω ?îÏÜåÎ°?ÍπäÏù¥Í∞?Ï∂îÍ?. ?àÏù¥?¥ÎßÅ' },
    ],
    'Color & Mood (?âÍ∞ê/Î∂ÑÏúÑÍ∏?': [
        { term: 'Warm Color Palette', desc: '?∞Îúª???âÏ°∞(Ï£ºÌô©, ?∏Îûë, Îπ®Í∞ï). ÏπúÎ??? ?êÎÑàÏßÄ, ?¥Ï†ï' },
        { term: 'Cool Color Palette', desc: 'Ï∞®Í????âÏ°∞(?åÎûë, ?πÏÉâ, Î≥¥Îùº). Ï∞®Î∂Ñ?? ?¨Ìîî, ÎØ∏Ïä§?∞Î¶¨' },
        { term: 'Desaturated/Muted Colors', desc: 'Ï±ÑÎèÑ ??? ?âÍ∞ê. ?∞Ïö∏, ?ÑÏã§?? ÎπàÌã∞ÏßÄ' },
        { term: 'High Contrast', desc: 'Î™ÖÏïî ?ÄÎπ?Í∞ïÌï®. ?úÎùºÎßàÌã±, ?ÑÏïÑÎ•? },
        { term: 'Low Contrast', desc: 'Î™ÖÏïî ?ÄÎπ??ΩÌï®. Î∂Ä?úÎü¨?Ä, Î™ΩÌôò?? },
        { term: 'Monochromatic', desc: '?®ÏÉâ ?? ?µÏùºÍ∞? Î¨¥Îìú Í∞ïÏ°∞' },
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

    // Panel expand states
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [showImageSettings, setShowImageSettings] = useState(false);
    const [showTermHelper, setShowTermHelper] = useState(false);

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
                    <div className="w-12 h-12 rounded border border-white/20 overflow-hidden shrink-0 bg-black">
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

            {/* ===== AUDIO SECTION (Dialogue + SFX) ===== */}
            <div className={`${isAudioConfirmed ? 'bg-green-500/5' : ''}`}>
                {/* Audio Section Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[var(--color-primary)]/5">
                    <div className="flex items-center gap-2">
                        <Mic size={12} className="text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-primary)] uppercase">Audio</span>
                        <span className="text-xs text-gray-500">(Dialogue + SFX)</span>
                    </div>
                    <button
                        onClick={() => onToggleAudioConfirm(cut.id)}
                        disabled={!hasAudio && cut.speaker !== 'SILENT'}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${isAudioConfirmed ? 'bg-green-500 text-black' : 'bg-white/10 text-gray-400 hover:text-white disabled:opacity-30'}`}
                    >
                        {isAudioConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                        {isAudioConfirmed ? 'Locked' : 'Lock Audio'}
                    </button>
                </div>

                {/* Dialogue Row */}
                <div className="px-4 py-3">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-xs text-[var(--color-primary)] uppercase font-bold block mb-1">?í¨ Dialogue</label>
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

                        {/* Audio Buttons (Play/Gen + Settings) */}
                        <div className="flex flex-col gap-1 pt-5 shrink-0">
                            {/* Play Button */}
                            {hasRealAudio && (
                                <button
                                    onClick={() => onPlayAudio(cut.id)}
                                    className={`flex items-center justify-center gap-1 w-16 px-2 py-1.5 rounded text-xs font-bold transition-colors ${playingAudio === cut.id ? 'bg-green-500 text-black' : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30'}`}
                                >
                                    <Play size={10} />
                                    {playingAudio === cut.id ? 'Stop' : 'Play'}
                                </button>
                            )}

                            {/* Gen Button */}
                            {cut.speaker !== 'SILENT' && (
                                <button
                                    onClick={() => onGenerateAudio(cut.id, cut.dialogue)}
                                    disabled={audioLoading || !cut.dialogue || isAudioConfirmed}
                                    className="flex items-center justify-center gap-1 w-16 px-2 py-1.5 rounded text-xs font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 disabled:opacity-50 transition-colors"
                                >
                                    {audioLoading ? <Loader2 size={10} className="animate-spin" /> : <Mic size={10} />}
                                    {hasRealAudio ? 'Regen' : 'Gen'}
                                </button>
                            )}

                            {/* Settings Button */}
                            <button
                                onClick={() => setShowAudioSettings(!showAudioSettings)}
                                className={`flex items-center justify-center w-16 px-2 py-1.5 rounded text-xs transition-colors ${showAudioSettings ? 'bg-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                            >
                                <Settings size={10} />
                            </button>

                        </div>
                    </div>

                    {/* Audio Settings Panel */}
                    {showAudioSettings && (
                        <div className="mt-3 p-3 bg-black/20 rounded-lg border border-[var(--color-primary)]/20 space-y-2">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-[var(--color-primary)] uppercase font-bold">Voice Settings</span>
                                <button onClick={() => setShowAudioSettings(false)} className="text-gray-500 hover:text-white"><X size={12} /></button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <div className="min-w-[70px]">
                                    <label className="text-xs text-gray-500 block mb-1">Language</label>
                                    <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.language || 'ko-KR'} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { language: e.target.value as any }); onSave(); }}>
                                        <option value="ko-KR">?úÍµ≠??/option>
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
                                    <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceVolume ?? 1} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceVolume: parseFloat(e.target.value) }); onSave(); }}>
                                        <option value={0.5}>50%</option>
                                        <option value={0.75}>75%</option>
                                        <option value={1}>100%</option>
                                        <option value={1.25}>125%</option>
                                    </select>
                                </div>
                                <div className="min-w-[50px]">
                                    <label className="text-xs text-gray-500 block mb-1">Rate</label>
                                    <select className={`w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white ${isAudioConfirmed ? 'opacity-50' : ''}`} value={cut.voiceRate ?? 1} disabled={isAudioConfirmed} onChange={(e) => { onUpdateCut(cut.id, { voiceRate: parseFloat(e.target.value) }); onSave(); }}>
                                        <option value={0.75}>0.75x</option>
                                        <option value={1}>1.0x</option>
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
                        </div>
                    )}

                    {/* SFX Section */}
                    {(cut.sfxDescription || cut.sfxUrl) && (
                        <div className="mt-3">
                            {cut.sfxDescription && !cut.sfxUrl && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-primary)]/10 rounded border border-[var(--color-primary)]/20">
                                    <Waves size={12} className="text-[var(--color-primary)] shrink-0" />
                                    <span className="text-xs text-[var(--color-primary)] font-bold">SFX IDEA:</span>
                                    <span className="text-xs text-gray-400 flex-1 truncate">{cut.sfxDescription}</span>
                                    {onOpenSfxModal && (
                                        <button onClick={() => onOpenSfxModal(cut.id)} className="text-xs text-[var(--color-primary)] font-bold px-2 py-1 rounded bg-[var(--color-primary)]/20">Find</button>
                                    )}
                                </div>
                            )}
                            {cut.sfxUrl && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded border border-green-500/20">
                                    <Volume2 size={12} className="text-green-400 shrink-0" />
                                    <span className="text-xs text-green-400 font-bold">SFX:</span>
                                    <span className="text-xs text-gray-300 flex-1 truncate">{cut.sfxName || 'Sound Effect'}</span>
                                    <div className="flex items-center gap-1">
                                        {onOpenSfxModal && <button onClick={() => onOpenSfxModal(cut.id)} className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-white/10">Change</button>}
                                        {onRemoveSfx && <button onClick={() => onRemoveSfx(cut.id)} className="p-1 text-red-500/50 hover:text-red-400"><X size={12} /></button>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== VISUAL SECTION (Image + Video) ===== */}
            <div className={`border-t border-white/10 ${isImageConfirmed ? 'bg-green-500/5' : ''}`}>
                {/* Visual Section Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[var(--color-primary)]/5">
                    <div className="flex items-center gap-2">
                        <Image size={12} className="text-[var(--color-primary)]" />
                        <span className="text-xs font-bold text-[var(--color-primary)] uppercase">Visual</span>
                        <span className="text-xs text-gray-500">(Image + Video)</span>
                    </div>
                    <button
                        onClick={() => onToggleImageConfirm(cut.id)}
                        disabled={!hasImage}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${isImageConfirmed ? 'bg-green-500 text-black' : 'bg-white/10 text-gray-400 hover:text-white disabled:opacity-30'}`}
                    >
                        {isImageConfirmed ? <Lock size={10} /> : <Unlock size={10} />}
                        {isImageConfirmed ? 'Locked' : 'Lock Visual'}
                    </button>
                </div>

                {/* Visual Prompt Row */}
                <div className="px-4 py-3">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-[var(--color-primary)] uppercase font-bold">?ì∑ Still Image Prompt</label>
                                {/* Term Helper Button */}
                                <button
                                    onClick={() => setShowTermHelper(!showTermHelper)}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${showTermHelper ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-gray-500 hover:text-[var(--color-primary)]'}`}
                                >
                                    <HelpCircle size={10} />
                                    ?ÑÎ¨∏?©Ïñ¥
                                </button>
                            </div>

                            {/* Term Helper Dropdown (positioned above, left-aligned) */}
                            {showTermHelper && (
                                <>
                                    <div className="fixed inset-0 z-[90]" onClick={() => setShowTermHelper(false)} />
                                    <div className="absolute bottom-full left-0 mb-2 w-[400px] max-h-[400px] overflow-y-auto bg-[#1a1a1a] border border-[var(--color-primary)]/30 rounded-lg shadow-2xl z-[100] p-3">
                                        <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#1a1a1a] pb-2 border-b border-white/10">
                                            <span className="text-xs text-[var(--color-primary)] font-bold">?ìö ?ÅÏÉÅ ?ÑÎ¨∏ ?©Ïñ¥ ?ÑÏö∞ÎØ?/span>
                                            <button onClick={() => setShowTermHelper(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                                        </div>
                                        {Object.entries(VISUAL_TERMS).map(([category, terms]) => (
                                            <div key={category} className="mb-3">
                                                <h5 className="text-xs font-bold text-[var(--color-primary)] uppercase mb-1.5">{category}</h5>
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
                                                            className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-primary)]/10 disabled:opacity-50 group"
                                                        >
                                                            <div className="text-xs text-[var(--color-primary)] font-medium group-hover:text-white">{item.term}</div>
                                                            <div className="text-xs text-gray-500">{item.desc}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

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
                                    <span className="text-xs text-gray-600 mr-1">?á∞?á∑</span>
                                    {cut.visualPromptKR}
                                </div>
                            )}
                        </div>

                        {/* Image Buttons (Preview/Gen + Settings) */}
                        <div className="flex flex-col gap-1 pt-5 shrink-0">
                            {/* Preview Button (opens settings with preview) */}
                            {hasImage && (
                                <button
                                    onClick={() => setShowImageSettings(true)}
                                    className="flex items-center justify-center gap-1 w-16 px-2 py-1.5 rounded text-xs font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30"
                                >
                                    <Eye size={10} />
                                    View
                                </button>
                            )}

                            {/* Gen/Regen Button */}
                            <button
                                onClick={() => hasImage ? onRegenerateImage(cut.id) : onGenerateImage(cut.id, cut.visualPrompt)}
                                disabled={imageLoading || isImageConfirmed}
                                className="flex items-center justify-center gap-1 w-16 px-2 py-1.5 rounded text-xs font-bold bg-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/30 disabled:opacity-50"
                            >
                                {imageLoading ? <Loader2 size={10} className="animate-spin" /> : <Image size={10} />}
                                {hasImage ? 'Regen' : 'Gen'}
                            </button>

                            {/* Settings Button */}
                            <button
                                onClick={() => setShowImageSettings(!showImageSettings)}
                                className={`flex items-center justify-center w-16 px-2 py-1.5 rounded text-xs transition-colors ${showImageSettings ? 'bg-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                            >
                                <Settings size={10} />
                            </button>
                        </div>
                    </div>

                    {/* Image Settings Panel */}
                    {showImageSettings && (
                        <div className="mt-3 p-3 bg-black/20 rounded-lg border border-[var(--color-primary)]/20 space-y-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-[var(--color-primary)] uppercase font-bold">Image Settings</span>
                                <button onClick={() => setShowImageSettings(false)} className="text-gray-500 hover:text-white"><X size={12} /></button>
                            </div>

                            {/* Image Preview (full aspect ratio) */}
                            {hasImage && (
                                <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
                                    <img src={resolvedImageUrl} alt="Preview" className="w-full max-h-[300px] object-contain mx-auto" />
                                </div>
                            )}

                            {/* Referenced Assets */}
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-gray-400 uppercase font-bold">Referenced Assets</span>
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
                                <div className="flex flex-wrap gap-1">
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
                                </div>
                            </div>

                            {/* User Reference Sketch Upload */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400 uppercase font-bold">?é® Sketch/Reference (Íµ¨ÎèÑ ?∞ÏÑ† Ï∞∏Ï°∞)</span>
                                <div className="flex items-center gap-2">
                                    {cut.userReferenceImage && (
                                        <div className="relative w-8 h-8 rounded overflow-hidden border border-white/20">
                                            <img src={cut.userReferenceImage} className="w-full h-full object-cover" />
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
                                    <label className="text-xs text-purple-400 uppercase font-bold">?é¨ Video Motion Prompt (Step 4.5??</label>
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
                                    placeholder="Camera movement, character actions... (?¥Î?ÏßÄ Lock ???êÎèô ?ùÏÑ± Í∂åÏû•)"
                                />
                                <p className="text-xs text-gray-500 mt-1 italic">?í° ?¥Î?ÏßÄ Lock ??AIÍ∞Ä ?êÎèô ?ùÏÑ±. Step 4.5?êÏÑú ???ïÍµê??enhancement ?ÅÏö©??</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden audio element for playback */}
                {hasRealAudio && resolvedAudioUrl && (
                    <audio
                        key={resolvedAudioUrl}
                        id={`audio-${cut.id}`}
                        src={resolvedAudioUrl}
                        preload="metadata"
                        onLoadedMetadata={(e) => setActualAudioDuration(e.currentTarget.duration)}
                        onError={(e) => console.error(`[CutItem ${cut.id}] Audio error:`, e.currentTarget.error)}
                        className="hidden"
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
