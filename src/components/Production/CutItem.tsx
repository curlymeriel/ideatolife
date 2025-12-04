import { memo, useMemo } from 'react';
import { Check, Lock, Unlock, Mic, Volume2, Loader2, Play, Music, ImageIcon, Eye, X, Plus } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import { getMatchedAssets } from '../../utils/assetUtils';
import { getAspectRatioPadding } from '../../utils/styleUtils';

interface CutItemProps {
    cut: ScriptCut;
    index: number;
    isConfirmed: boolean;
    showAssetSelector: boolean;
    assetDefinitions: any;
    localScript: ScriptCut[];
    audioLoading: boolean;
    imageLoading: boolean;
    playingAudio: number | null;
    aspectRatio: string;
    onToggleConfirm: (id: number) => void;
    onUpdateCut: (id: number, updates: Partial<ScriptCut>) => void;
    onGenerateAudio: (id: number, dialogue: string) => void;
    onPlayAudio: (id: number) => void;
    onGenerateImage: (id: number, prompt: string) => void;
    onAddAsset: (cutId: number, assetId: string) => void;
    onRemoveAsset: (cutId: number, assetId: string) => void;
    onAddReference: (cutId: number, refId: number) => void;
    onRemoveReference: (cutId: number, refId: number) => void;
    onToggleAssetSelector: (cutId: number) => void;
    onCloseAssetSelector: () => void;
    onSave: () => void;
    onDelete: (id: number) => void;
}

export const CutItem = memo(({
    cut,
    index,
    isConfirmed,
    showAssetSelector,
    assetDefinitions,
    localScript,
    audioLoading,
    imageLoading,
    playingAudio,
    aspectRatio,
    onToggleConfirm,
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
    onDelete
}: CutItemProps) => {

    const manualAssets = cut.referenceAssetIds || [];

    // Memoize matched assets calculation
    const allMatchedAssets = useMemo(() =>
        getMatchedAssets(cut.visualPrompt, manualAssets, assetDefinitions, cut.id),
        [cut.visualPrompt, manualAssets, assetDefinitions, cut.id]
    );

    const manualAssetObjs = useMemo(() =>
        allMatchedAssets.filter(m => m.isManual).map(m => m.asset),
        [allMatchedAssets]
    );

    const autoMatchedAssets = useMemo(() =>
        allMatchedAssets.filter(m => !m.isManual).map(m => m.asset),
        [allMatchedAssets]
    );

    const hasAudio = !!cut.audioUrl;
    const hasImage = !!cut.finalImageUrl;
    const canConfirm = hasAudio && hasImage && !isConfirmed;

    // Memoize unique assets for selector
    const uniqueAssets = useMemo(() => {
        return Object.values(assetDefinitions || {}).reduce((acc: any[], current: any) => {
            const existingIndex = acc.findIndex((item: any) => item.name === current.name);
            if (existingIndex === -1) {
                acc.push(current);
            } else {
                if ((current.lastUpdated || 0) > (acc[existingIndex].lastUpdated || 0)) {
                    acc[existingIndex] = current;
                }
            }
            return acc;
        }, []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    }, [assetDefinitions]);

    return (
        <div className={`glass-panel p-6 space-y-4 relative ${isConfirmed ? 'border-green-500/50 bg-green-500/5' : 'hover:border-[var(--color-primary-dim)]'} ${showAssetSelector ? 'z-50' : 'z-0'}`}>
            {/* Header: Cut Number and Lock Button */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${isConfirmed ? 'bg-green-500 text-black border-green-500' : 'bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-border)]'}`}>
                        {isConfirmed ? <Check size={20} /> : index + 1}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Cut #{cut.id}</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">{cut.estimatedDuration}s estimate</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isConfirmed && (
                        <button
                            onClick={() => {
                                if (confirm('Are you sure you want to delete this cut?')) {
                                    onDelete(cut.id);
                                }
                            }}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete Cut"
                        >
                            <X size={16} />
                        </button>
                    )}
                    {canConfirm && (
                        <button
                            onClick={() => onToggleConfirm(cut.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all"
                        >
                            <Lock size={16} />
                            Confirm Cut
                        </button>
                    )}
                    {isConfirmed && (
                        <button
                            onClick={() => onToggleConfirm(cut.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg font-medium transition-all"
                        >
                            <Unlock size={16} />
                            Unlock
                        </button>
                    )}
                </div>
            </div>

            {/* Audio & Dialogue Section */}
            <div className="glass-panel p-4 !rounded-lg border border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    <Mic size={12} /> Audio & Dialogue
                </div>
                <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                        <input
                            className={`bg-transparent border-none text-[var(--color-primary)] font-bold w-full focus:ring-0 p-0 text-lg ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                            value={cut.speaker}
                            disabled={isConfirmed}
                            onChange={(e) => onUpdateCut(cut.id, { speaker: e.target.value })}
                            onBlur={onSave}
                            placeholder="Speaker name..."
                        />
                        <textarea
                            className={`w-full bg-[rgba(0,0,0,0.2)] border border-[var(--color-border)] rounded-lg p-3 text-white text-sm min-h-[80px] focus:border-[var(--color-primary)] outline-none resize-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                            value={cut.dialogue}
                            disabled={isConfirmed}
                            onChange={(e) => onUpdateCut(cut.id, { dialogue: e.target.value })}
                            onBlur={onSave}
                            placeholder="Dialogue text..."
                        />
                        {/* Emotion Metadata Controls */}
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Emotion</label>
                                    <select
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={cut.emotion || 'neutral'}
                                        disabled={isConfirmed}
                                        onChange={(e) => onUpdateCut(cut.id, { emotion: e.target.value })}
                                        onBlur={onSave}
                                    >
                                        <option value="neutral">Neutral</option>
                                        <option value="happy">Happy</option>
                                        <option value="sad">Sad</option>
                                        <option value="angry">Angry</option>
                                        <option value="excited">Excited</option>
                                        <option value="calm">Calm</option>
                                        <option value="tense">Tense</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Intensity</label>
                                    <select
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={cut.emotionIntensity || 'moderate'}
                                        disabled={isConfirmed}
                                        onChange={(e) => onUpdateCut(cut.id, { emotionIntensity: e.target.value as 'low' | 'moderate' | 'high' })}
                                        onBlur={onSave}
                                    >
                                        <option value="low">Low</option>
                                        <option value="moderate">Moderate</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Gender</label>
                                    <select
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={cut.voiceGender || 'neutral'}
                                        disabled={isConfirmed}
                                        onChange={(e) => onUpdateCut(cut.id, { voiceGender: e.target.value as 'male' | 'female' | 'neutral' })}
                                        onBlur={onSave}
                                    >
                                        <option value="neutral">Auto</option>
                                        <option value="female">Female</option>
                                        <option value="male">Male</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Age</label>
                                    <select
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={cut.voiceAge || 'adult'}
                                        disabled={isConfirmed}
                                        onChange={(e) => onUpdateCut(cut.id, { voiceAge: e.target.value as 'child' | 'young' | 'adult' | 'senior' })}
                                        onBlur={onSave}
                                    >
                                        <option value="child">Child</option>
                                        <option value="young">Young</option>
                                        <option value="adult">Adult</option>
                                        <option value="senior">Senior</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Language</label>
                                    <select
                                        className={`w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        value={cut.language || 'ko-KR'}
                                        disabled={isConfirmed}
                                        onChange={(e) => onUpdateCut(cut.id, { language: e.target.value as 'en-US' | 'ko-KR' })}
                                        onBlur={onSave}
                                    >
                                        <option value="ko-KR">한국어</option>
                                        <option value="en-US">English</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 items-center justify-center min-w-[120px]">
                        {!hasAudio ? (
                            <button
                                onClick={() => onGenerateAudio(cut.id, cut.dialogue)}
                                disabled={audioLoading || !cut.dialogue || isConfirmed}
                                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Generate Audio"
                            >
                                {audioLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        <span className="text-xs">Loading...</span>
                                    </>
                                ) : (
                                    <>
                                        <Volume2 size={18} />
                                        <span className="text-xs font-medium">Generate</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => onPlayAudio(cut.id)}
                                    className={`p-3 rounded-full transition-all ${playingAudio === cut.id ? 'bg-[var(--color-primary)] text-black' : 'bg-[var(--color-surface)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-black'}`}
                                    title="Play Audio"
                                >
                                    {playingAudio === cut.id ? (
                                        <Music size={20} className="animate-pulse" />
                                    ) : (
                                        <Play size={20} />
                                    )}
                                </button>
                                <span className="text-xs text-gray-400">
                                    {playingAudio === cut.id ? 'Playing...' : 'Ready'}
                                </span>
                                {/* Regenerate Button - Always available for audio improvement */}
                                <button
                                    onClick={() => onGenerateAudio(cut.id, cut.dialogue)}
                                    disabled={audioLoading}
                                    className="flex items-center gap-1 px-3 py-1 rounded bg-white/5 text-gray-400 text-xs border border-white/10 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                                    title="Regenerate Audio"
                                >
                                    {audioLoading ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Volume2 size={12} />
                                    )}
                                    <span>Regen</span>
                                </button>
                                {cut.audioUrl !== 'mock:beep' && (
                                    <audio
                                        key={cut.audioUrl}
                                        id={`audio-${cut.id}`}
                                        src={cut.audioUrl}
                                        preload="metadata"
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Visual Prompt Section */}
            <div className={`glass-panel p-4 !rounded-lg border border-[var(--color-border)] ${showAssetSelector ? 'relative z-20' : ''}`}>
                <div className="flex items-center gap-2 mb-3 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    <ImageIcon size={12} /> Visual Prompt
                </div>
                <div className="flex gap-4">
                    <textarea
                        className={`flex-1 bg-[rgba(0,0,0,0.2)] border border-[var(--color-border)] rounded-lg p-3 text-gray-300 text-sm min-h-[80px] focus:border-[var(--color-primary)] outline-none resize-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                        value={cut.visualPrompt}
                        disabled={isConfirmed}
                        onChange={(e) => onUpdateCut(cut.id, { visualPrompt: e.target.value })}
                        onBlur={onSave}
                        placeholder="Visual description..."
                    />
                    <button
                        onClick={() => onGenerateImage(cut.id, cut.visualPrompt)}
                        disabled={imageLoading || isConfirmed}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generate Final Image"
                    >
                        {imageLoading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-xs">Generating...</span>
                            </>
                        ) : (
                            <>
                                <Eye size={18} />
                                <span className="text-xs font-medium">Preview</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Asset Selection */}
                <div className="flex flex-wrap gap-2 items-center min-h-[32px] mt-3">
                    <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mr-2">Assets:</span>

                    {manualAssetObjs.map((asset: any) => (
                        <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs border border-[var(--color-primary)]/30">
                            <span>{asset.name}</span>
                            {!isConfirmed && (
                                <button onClick={() => onRemoveAsset(cut.id, asset.id)} className="hover:text-white">
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}

                    {(cut.referenceCutIds || []).map(refId => (
                        <div key={refId} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30">
                            <ImageIcon size={10} />
                            <span>Cut #{refId}</span>
                            {!isConfirmed && (
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

                    {!isConfirmed && (
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
                                        className="fixed inset-0 z-[90]"
                                        onClick={onCloseAssetSelector}
                                    />
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-[var(--color-border)] rounded-lg shadow-xl z-[100] max-h-60 overflow-y-auto">
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
                                                    <button
                                                        key={prevCut.id}
                                                        onClick={() => onAddReference(cut.id, prevCut.id)}
                                                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
                                                    >
                                                        <div className="w-8 h-5 rounded bg-black overflow-hidden flex-shrink-0 border border-white/20">
                                                            <img src={prevCut.finalImageUrl} className="w-full h-full object-cover" alt="" />
                                                        </div>
                                                        Cut #{prevCut.id}
                                                    </button>
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
            </div>

            {/* Generated Image Display */}
            {hasImage && (
                <div className="glass-panel p-4 !rounded-lg border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-3 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        <ImageIcon size={12} /> Generated Image
                    </div>
                    <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-hidden relative" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                        <img
                            src={cut.finalImageUrl}
                            alt={`Cut ${cut.id} preview`}
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    );
});
