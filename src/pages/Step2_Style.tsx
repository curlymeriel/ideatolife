import React, { useState, useEffect } from 'react';
import { Wand2, Save, ImageIcon, Upload, Loader2, CheckCircle, ChevronDown, AlertCircle, RotateCcw, User, MapPin, Bug, Package, ArrowRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore, type AssetDefinition } from '../store/workflowStore';
import { UnifiedStudio, type AssetGenerationResult } from '../components/UnifiedStudio';



export const Step2_Style: React.FC = () => {
    const store = useWorkflowStore();
    const navigate = useNavigate();

    const {
        id: projectId,
        setProjectInfo,
        nextStep,
        prevStep,
        apiKeys,
        masterStyle,
        characters,
        episodeCharacters,
        seriesLocations,
        episodeLocations,
        seriesProps,
        episodeProps,
        assetDefinitions,
        seriesName: seriesTitle,
        episodeName: episodeTitle,
        setMasterStyle,
        aspectRatio,
        cleanupOrphanedAssets,
        isHydrated
    } = store;

    useEffect(() => {
        cleanupOrphanedAssets();
    }, [cleanupOrphanedAssets]);

    const [selectedAssetId, setSelectedAssetId] = useState<string>('master_style');
    const [selectedAssetType, setSelectedAssetType] = useState<'master' | 'character' | 'location' | 'prop'>('master');
    const [selectedAssetName, setSelectedAssetName] = useState<string>('Master Visual Style');
    const [isEditing, setIsEditing] = useState(false);

    const [description, setDescription] = useState('');
    const [characterModifier, setCharacterModifier] = useState('');
    const [backgroundModifier, setBackgroundModifier] = useState('');
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [draftImage, setDraftImage] = useState<string | null>(null);

    const [isSeriesOpen, setIsSeriesOpen] = useState(true);
    const [isEpisodeOpen, setIsEpisodeOpen] = useState(true);

    const [showDebug, setShowDebug] = useState(false);
    const [showGenerationModal, setShowGenerationModal] = useState(false);

    const safeMasterStyle = masterStyle || { description: '', referenceImage: null };
    const safeCharacters = Array.isArray(characters) ? characters : [];
    const safeEpisodeCharacters = Array.isArray(episodeCharacters) ? episodeCharacters : [];
    const safeSeriesLocations = Array.isArray(seriesLocations) ? seriesLocations : [];
    const safeEpisodeLocations = Array.isArray(episodeLocations) ? episodeLocations : [];
    const safeSeriesProps = Array.isArray(seriesProps) ? seriesProps : [];
    const safeEpisodeProps = Array.isArray(episodeProps) ? episodeProps : [];
    const safeAssetDefinitions = assetDefinitions || {};

    const seriesName = seriesTitle || "Untitled Series";
    const episodeName = episodeTitle || "Untitled Episode";

    const isDefined = (id: string) => {
        const def = safeAssetDefinitions[id];
        return !!def && !!def.description && (!!def.referenceImage || !!def.draftImage);
    };

    const extractVisualPrompt = (fullDescription: string): string => {
        if (!fullDescription) return '';
        const visualMatch = fullDescription.match(/(?:Visual|Visual prompt):\s*(.*)/i);
        if (visualMatch && visualMatch[1]) return visualMatch[1].trim();
        return fullDescription;
    };

    const isSeriesComplete = !!safeMasterStyle.description &&
        safeCharacters.every((c: any) => isDefined(c.id)) &&
        safeSeriesLocations.every((l: any) => isDefined(l.id)) &&
        safeSeriesProps.every((p: any) => isDefined(p.id));

    const isEpisodeComplete = (safeEpisodeCharacters.length > 0 || safeEpisodeLocations.length > 0 || safeEpisodeProps.length > 0) &&
        safeEpisodeCharacters.every((c: any) => isDefined(c.id)) &&
        safeEpisodeLocations.every((l: any) => isDefined(l.id)) &&
        safeEpisodeProps.every((p: any) => isDefined(p.id));

    useEffect(() => {
        const loadAssetData = async () => {
            const { resolveUrl } = await import('../utils/imageStorage');

            if (selectedAssetId === 'master_style') {
                setDescription(safeMasterStyle.description || '');
                setCharacterModifier(safeMasterStyle.characterModifier || '');
                setBackgroundModifier(safeMasterStyle.backgroundModifier || '');

                if (safeMasterStyle.referenceImage) {
                    const resolved = await resolveUrl(safeMasterStyle.referenceImage);
                    setReferenceImage(resolved || null);
                } else {
                    setReferenceImage(null);
                }

                setDraftImage(null);
                setIsEditing(!safeMasterStyle.description);
            } else {
                const def = safeAssetDefinitions[selectedAssetId];
                if (def) {
                    setDescription(def.description);
                    if (def.referenceImage) {
                        const resolved = await resolveUrl(def.referenceImage);
                        setReferenceImage(resolved || null);
                    } else {
                        setReferenceImage(null);
                    }
                    if (def.draftImage) {
                        const resolved = await resolveUrl(def.draftImage);
                        setDraftImage(resolved || null);
                    } else {
                        setDraftImage(null);
                    }
                    setIsEditing(!def.description || (!def.referenceImage && !def.draftImage));
                } else {
                    let initialDescription = '';
                    if (safeMasterStyle.description) {
                        initialDescription = `[Master Visual Style: ${safeMasterStyle.description}]`;
                        if (selectedAssetType === 'character' && safeMasterStyle.characterModifier) {
                            initialDescription += `\n[Character Modifier: ${safeMasterStyle.characterModifier}]`;
                        }
                        if (selectedAssetType === 'location' && safeMasterStyle.backgroundModifier) {
                            initialDescription += `\n[Background Modifier: ${safeMasterStyle.backgroundModifier}]`;
                        }
                        initialDescription += '\n\n';
                    }
                    let baseDescription = '';
                    if (selectedAssetType === 'character') {
                        const seriesChar = safeCharacters.find((c: any) => c.id === selectedAssetId);
                        if (seriesChar) baseDescription = seriesChar.visualSummary || extractVisualPrompt(seriesChar.description || '');
                        else {
                            const episodeChar = safeEpisodeCharacters.find((c: any) => c.id === selectedAssetId);
                            if (episodeChar) baseDescription = episodeChar.visualSummary || extractVisualPrompt(episodeChar.description || '');
                        }
                    } else if (selectedAssetType === 'location') {
                        const seriesLoc = safeSeriesLocations.find((l: any) => l.id === selectedAssetId);
                        if (seriesLoc) baseDescription = seriesLoc.visualSummary || extractVisualPrompt(seriesLoc.description || '');
                        else {
                            const episodeLoc = safeEpisodeLocations.find((l: any) => l.id === selectedAssetId);
                            if (episodeLoc) baseDescription = episodeLoc.visualSummary || extractVisualPrompt(episodeLoc.description || '');
                        }
                    } else if (selectedAssetType === 'prop') {
                        const seriesProp = safeSeriesProps.find((p: any) => p.id === selectedAssetId);
                        if (seriesProp) baseDescription = seriesProp.visualSummary || extractVisualPrompt(seriesProp.description || '');
                        else {
                            const episodeProp = safeEpisodeProps.find((p: any) => p.id === selectedAssetId);
                            if (episodeProp) baseDescription = episodeProp.visualSummary || extractVisualPrompt(episodeProp.description || '');
                        }
                    }
                    setDescription(initialDescription + baseDescription);
                    setReferenceImage(null);
                    setDraftImage(null);
                    setIsEditing(true);
                }
            }
        };
        loadAssetData();
    }, [selectedAssetId, selectedAssetType]);

    useEffect(() => {
        if (isHydrated) {
            if (isSeriesComplete) setIsSeriesOpen(false);
            if (isEpisodeComplete) setIsEpisodeOpen(false);
        }
    }, [isHydrated, isSeriesComplete, isEpisodeComplete]);

    const handleSaveAsset = async (overrideData?: { description?: string, referenceImage?: string | null, draftImage?: string | null }) => {
        try {
            console.log('[Step2] Saving Asset:', selectedAssetId);
            if (!setProjectInfo) {
                console.error('[Step2] setProjectInfo is missing');
                return;
            }
            const { saveToIdb, generateAssetImageKey } = await import('../utils/imageStorage');

            const currentRef = overrideData?.referenceImage !== undefined ? overrideData.referenceImage : referenceImage;
            const currentDraft = overrideData?.draftImage !== undefined ? overrideData.draftImage : draftImage;
            const currentDesc = overrideData?.description !== undefined ? overrideData.description : description;

            let finalRefUrl = currentRef;
            if (currentRef && currentRef.startsWith('data:')) {
                const key = generateAssetImageKey(projectId, selectedAssetId, 'ref');
                console.log('[Step2] Saving Reference Image to IDB:', key);
                // Append timestamp to force state update and bypass cache
                finalRefUrl = (await saveToIdb('assets', key, currentRef)) + `?t=${Date.now()}`;
            }

            let finalDraftUrl = currentDraft;
            if (currentDraft && currentDraft.startsWith('data:')) {
                const key = generateAssetImageKey(projectId, selectedAssetId, 'draft');
                console.log('[Step2] Saving Draft Image to IDB:', key);
                // Append timestamp to force state update and bypass cache
                finalDraftUrl = (await saveToIdb('assets', key, currentDraft)) + `?t=${Date.now()}`;
            }

            if (selectedAssetId === 'master_style') {
                if (setMasterStyle) {
                    setMasterStyle({
                        description: currentDesc,
                        referenceImage: finalRefUrl || null,
                        characterModifier: characterModifier || undefined,
                        backgroundModifier: backgroundModifier || undefined
                    });
                }
            } else {
                const newDefinition: AssetDefinition = {
                    id: selectedAssetId,
                    type: selectedAssetType as 'character' | 'location' | 'prop',
                    name: selectedAssetName,
                    description: currentDesc,
                    referenceImage: finalRefUrl || undefined,
                    draftImage: finalDraftUrl || undefined,
                    lastUpdated: Date.now()
                };
                console.log('[Step2] Updating Project Info with new definition:', newDefinition);
                setProjectInfo({
                    assetDefinitions: {
                        ...safeAssetDefinitions,
                        [selectedAssetId]: newDefinition
                    }
                });
            }
            setIsEditing(false);
            // alert('Asset saved successfully!'); // Optional: Feedback to user
        } catch (error: any) {
            console.error('[Step2] Failed to save asset:', error);
            alert(`Failed to save asset: ${error.message || 'Unknown error'}`);
        }
    };

    if (!store || !isHydrated) {
        return (
            <div className="flex flex-col items-center justify-center h-[90vh] text-white gap-4">
                <Loader2 size={48} className="animate-spin text-[var(--color-primary)]" />
                <p className="text-lg font-bold">Loading Project Data...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[90vh] max-w-[1600px] mx-auto gap-6 p-6">
            <div className="flex flex-1 gap-0 min-h-0 border border-[var(--color-border)] overflow-hidden">
                <div className="w-1/3 glass-panel flex flex-col !border !border-[var(--color-primary)] overflow-hidden !rounded-none">
                    <div className="p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex-shrink-0 flex justify-between items-center">
                        <div className="flex flex-col">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2"><ImageIcon size={20} className="text-[var(--color-primary)]" />Key Visuals</h2>
                            <p className="text-xs text-[var(--color-primary)] uppercase tracking-wider ml-7">Define Look</p>
                        </div>
                        <button
                            onClick={() => {
                                cleanupOrphanedAssets();
                                alert("Assets cleaned and refreshed! Leaked data has been purged.");
                            }}
                            className="p-2 text-gray-500 hover:text-[var(--color-primary)] transition-colors hover:bg-white/5 rounded-full"
                            title="Purge Orphaned Assets"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0 space-y-0">
                        <button onClick={() => { setSelectedAssetId('master_style'); setSelectedAssetType('master'); setSelectedAssetName('Master Visual Style'); }}
                            className={`w-full flex items-center justify-between p-4 border-b border-[var(--color-border)] transition-all duration-300 ${selectedAssetId === 'master_style' ? 'bg-[var(--color-primary)]/10 border-r-4 border-r-[var(--color-primary)] text-white' : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white border-r-4 border-r-transparent'}`}>
                            <div className="flex items-center gap-3"><div className={`p-2 rounded-none ${selectedAssetId === 'master_style' ? 'bg-[var(--color-primary)] text-black' : 'bg-[var(--color-bg)] text-[var(--color-primary)]'}`}><Wand2 size={20} /></div><div className="text-left"><h4 className="font-bold">Master Visual Style</h4><p className="text-xs opacity-70">Global art direction</p></div></div>
                            {safeMasterStyle.description ? <CheckCircle size={20} className="text-green-500" /> : <AlertCircle size={20} className="text-yellow-500" />}
                        </button>
                        <div className="border-b border-[var(--color-border)]">
                            <button onClick={() => setIsSeriesOpen(!isSeriesOpen)} className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] transition-colors">
                                <div className="flex items-center gap-3"><h4 className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">Series Level</h4>{isSeriesComplete && <CheckCircle size={16} className="text-green-500" />}</div>
                                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isSeriesOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSeriesOpen && (
                                <div className="bg-[var(--color-bg)]/50">
                                    {safeCharacters?.map((char: any) => (
                                        <div key={`series-char-${char.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === char.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === char.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <User size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{char.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === char.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${char.name}" from series characters?`)) {
                                                        const newChars = safeCharacters.filter((c: any) => c.id !== char.id);
                                                        setProjectInfo({ characters: newChars });
                                                        if (selectedAssetId === char.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeSeriesLocations?.map((loc: any) => (
                                        <div key={`series-loc-${loc.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <MapPin size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{loc.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === loc.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`"${loc.name}" 장소를 시리즈 장소 목록에서 삭제하시겠습니까?`)) {
                                                        const newLocs = safeSeriesLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ seriesLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeSeriesProps?.map((prop: any) => (
                                        <div key={`series-prop-${prop.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(prop.id); setSelectedAssetType('prop'); setSelectedAssetName(prop.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <Package size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{prop.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(prop.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === prop.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`"${prop.name}" 소품을 시리즈 소품 목록에서 삭제하시겠습니까?`)) {
                                                        const newProps = safeSeriesProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ seriesProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="border-b border-[var(--color-border)]">
                            <button onClick={() => setIsEpisodeOpen(!isEpisodeOpen)} className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] transition-colors">
                                <div className="flex items-center gap-3"><h4 className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">Episode Level</h4>{isEpisodeComplete && <CheckCircle size={16} className="text-green-500" />}</div>
                                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isEpisodeOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isEpisodeOpen && (
                                <div className="bg-[var(--color-bg)]/50">
                                    {safeEpisodeCharacters?.map((char: any) => (
                                        <div key={`ep-char-${char.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === char.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === char.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <User size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{char.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === char.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`"${char.name}" 캐릭터를 에피소드 캐릭터 목록에서 삭제하시겠습니까?`)) {
                                                        const newChars = safeEpisodeCharacters.filter((c: any) => c.id !== char.id);
                                                        setProjectInfo({ episodeCharacters: newChars });
                                                        if (selectedAssetId === char.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeEpisodeLocations?.map((loc: any) => (
                                        <div key={`ep-loc-${loc.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <MapPin size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{loc.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === loc.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`"${loc.name}" 장소를 에피소드 장소 목록에서 삭제하시겠습니까?`)) {
                                                        const newLocs = safeEpisodeLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ episodeLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeEpisodeProps?.map((prop: any) => (
                                        <div key={`ep-prop-${prop.id}`} className="group/item relative px-2 py-0.5">
                                            <button onClick={() => { setSelectedAssetId(prop.id); setSelectedAssetType('prop'); setSelectedAssetName(prop.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-4 rounded-xl transition-all ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)]/10 text-white ring-1 ring-[var(--color-primary)]/30' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left">
                                                    <div className={`p-1.5 rounded-lg ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-500'}`}>
                                                        <Package size={14} />
                                                    </div>
                                                    <span className="font-medium truncate max-w-[120px]">{prop.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(prop.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                                {/* Selected Indicator Dot */}
                                                {selectedAssetId === prop.id && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--color-primary)] rounded-full shadow-[0_0_10px_var(--color-primary)]" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`"${prop.name}" 소품을 에피소드 소품 목록에서 삭제하시겠습니까?`)) {
                                                        const newProps = safeEpisodeProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ episodeProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="레지스트리에서 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 border-l border-[var(--color-border)]">
                    <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent">
                        <h2 className="text-2xl font-bold text-white">{selectedAssetName}</h2>
                        <div className="flex items-center gap-3">
                            {!isEditing ? (
                                <button
                                    onClick={() => {
                                        setIsEditing(true);
                                        setShowGenerationModal(true);
                                    }}
                                    className="px-4 py-2 bg-[var(--color-primary)] text-black font-bold border border-[var(--color-border)] shadow-lg hover:opacity-90 flex items-center gap-2"
                                >
                                    <Wand2 size={16} /> Open Studio
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setShowGenerationModal(true)}
                                        className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] text-white border border-[var(--color-border)]"
                                    >
                                        Re-open Studio
                                    </button>
                                    <button onClick={() => { handleSaveAsset(); }} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-black font-bold hover:opacity-90 shadow-lg">
                                        <Save size={18} />Save Definition
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {!isEditing ? (
                        <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
                            <div className="flex gap-6 h-full min-h-0">
                                <div className="flex-1 glass-panel p-6 border border-[var(--color-border)] flex flex-col">
                                    <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)]">
                                        <CheckCircle size={18} className="text-green-500" />
                                        <span className="text-sm font-bold uppercase">Confirmed Description</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-4">
                                        <p className="text-gray-300 text-lg whitespace-pre-wrap">{description || "정의된 설명이 없습니다."}</p>
                                        {characterModifier && (
                                            <div className="border-t border-[var(--color-border)] pt-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <User size={14} className="text-[var(--color-primary)]" />
                                                    <span className="text-xs font-bold uppercase">Character Modifier</span>
                                                </div>
                                                <p className="text-gray-400 text-sm pl-5">{characterModifier}</p>
                                            </div>
                                        )}
                                        {backgroundModifier && (
                                            <div className="border-t border-[var(--color-border)] pt-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <MapPin size={14} className="text-[var(--color-primary)]" />
                                                    <span className="text-xs font-bold uppercase">Background Modifier</span>
                                                </div>
                                                <p className="text-gray-400 text-sm pl-5">{backgroundModifier}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="w-1/3 glass-panel p-6 border border-[var(--color-border)] flex flex-col">
                                    <div className="flex items-center gap-2 mb-4">
                                        <ImageIcon size={18} className="text-[var(--color-primary)]" />
                                        <span className="text-sm font-bold uppercase">Visual Reference</span>
                                    </div>
                                    <div className="flex-1 w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden group">
                                        {draftImage ? (
                                            <img src={draftImage} className="absolute inset-0 w-full h-full object-contain" />
                                        ) : referenceImage ? (
                                            <img src={referenceImage} className="absolute inset-0 w-full h-full object-contain opacity-80" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)]">
                                                <Upload size={24} className="mb-2" />
                                                <p className="text-xs">참조 이미지 없음.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[var(--color-bg)]/50 border border-dashed border-[var(--color-border)] m-6">
                            <Wand2 size={48} className="text-gray-600 mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Editor Mode Active</h3>
                            <p className="text-gray-400 mb-6 text-center max-w-md">화면 상단의 'Open Studio' 또는 'Save' 버튼을 사용하여 에셋 정의를 완료하세요.</p>
                            <button
                                onClick={() => setShowGenerationModal(true)}
                                className="px-6 py-2 bg-[var(--color-primary)] text-black font-bold hover:opacity-90 rounded-full flex items-center gap-2"
                            >
                                <Wand2 size={16} /> Open Key Visual Studio
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-between">
                <button onClick={() => { prevStep(); navigate('/step/1'); }} className="px-6 py-3 text-[var(--color-text-muted)] hover:text-white">Back</button>
                <div className="flex gap-4">
                    <button onClick={() => setShowDebug(!showDebug)} className="p-3 text-gray-500 hover:text-white"><Bug size={20} /></button>
                    <button onClick={() => { nextStep(); navigate('/step/3'); }} className="btn-primary flex items-center gap-2 px-8 py-3 rounded-full font-bold">Next Step <ArrowRight size={20} /></button>
                </div>
            </div>

            {showDebug && (
                <div className="mt-8 glass-panel p-6 border border-red-500/30">
                    <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2"><Bug size={18} /> Asset Debug Console</h3>
                    <pre className="text-[10px] bg-black/50 p-4 overflow-x-auto text-green-400">
                        {JSON.stringify({ masterStyle, assetDefinitions }, null, 2)}
                    </pre>
                </div>
            )}

            {showGenerationModal && (
                <UnifiedStudio
                    isOpen={showGenerationModal}
                    onClose={() => setShowGenerationModal(false)}
                    apiKey={apiKeys?.gemini || ''}
                    masterStyle={safeMasterStyle.description}
                    config={{
                        mode: 'asset',
                        assetId: selectedAssetId,
                        assetType: selectedAssetType as 'character' | 'location' | 'prop',
                        assetName: selectedAssetName,
                        initialDescription: description,
                        initialReferenceImage: referenceImage,
                        initialDraftImage: draftImage,
                        aspectRatio: aspectRatio || '16:9',
                        projectContext: (() => {
                            let ctx = `Series: ${seriesName}, Episode: ${episodeName}`;
                            if (safeMasterStyle.description) ctx += `\nMaster Visual Style: ${safeMasterStyle.description}`;
                            const definedAssets = Object.values(safeAssetDefinitions).filter((def: any) => isDefined(def.id) && def.id !== selectedAssetId);
                            if (definedAssets.length > 0) {
                                const chars = definedAssets.filter((d: any) => d.type === 'character').map((d: any) => `- ${d.name}: ${d.description.slice(0, 100)}...`).join('\n');
                                const locs = definedAssets.filter((d: any) => d.type === 'location').map((d: any) => `- ${d.name}: ${d.description.slice(0, 100)}...`).join('\n');
                                if (chars) ctx += `\n\n[Existing Characters]\n${chars}`;
                                if (locs) ctx += `\n\n[Existing Locations]\n${locs}`;
                            }
                            return ctx;
                        })(),
                        existingAssets: (() => {
                            const assets: { id: string, name: string, url: string, type: string }[] = [];
                            if (safeMasterStyle.referenceImage) {
                                assets.push({ id: 'master_style', name: 'Master Style', url: safeMasterStyle.referenceImage, type: 'style' });
                            }
                            Object.values(safeAssetDefinitions).forEach((def: any) => {
                                if (def.id !== selectedAssetId && isDefined(def.id)) {
                                    const img = def.draftImage || def.referenceImage;
                                    if (img) {
                                        assets.push({ id: def.id, name: def.name || 'Asset', url: img, type: def.type });
                                    }
                                }
                            });
                            return assets;
                        })(),
                        onSave: (result: AssetGenerationResult) => {
                            handleSaveAsset({
                                description: result.description,
                                referenceImage: result.selectedDraft || referenceImage,
                                draftImage: result.selectedDraft
                            });
                            setShowGenerationModal(false);
                        },
                    }}
                />
            )}
        </div>
    );
};
