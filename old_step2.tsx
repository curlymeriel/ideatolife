import React, { useState, useEffect } from 'react';
import { Wand2, Save, Type, ImageIcon, Upload, Loader2, CheckCircle, ChevronDown, AlertCircle, RotateCcw, User, MapPin, Bug, Package, ArrowRight, Trash2, Crop } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore, type AssetDefinition } from '../store/workflowStore';
import { enhancePrompt, analyzeImage } from '../services/gemini';
import { ImageCropModal } from '../components/ImageCropModal';
import { UnifiedStudio, type AssetGenerationResult } from '../components/UnifiedStudio';
import { resolveUrl } from '../utils/imageStorage';

// Helper component for async loading of asset images
const AssetThumbnailButton = ({ def, onSelect }: { def: AssetDefinition, onSelect: (url: string) => void }) => {
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!def.draftImage) return;
            try {
                const url = await resolveUrl(def.draftImage);
                if (active && url) setResolvedUrl(url);
            } catch (e) {
                console.error("Failed to load thumbnail", e);
            }
        };
        load();
        return () => { active = false; };
    }, [def.draftImage]);

    if (!resolvedUrl) return <div className="aspect-square bg-[var(--color-bg)] animate-pulse rounded-md border border-[var(--color-border)]" />;

    return (
        <button
            onClick={() => onSelect(resolvedUrl)}
            className="aspect-square relative group rounded-md overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all"
            title={`${def.name} ?대?吏 ?ъ슜`}
        >
            <img src={resolvedUrl} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Crop size={16} className="text-white" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white p-1 truncate text-center">
                {def.name}
            </div>
        </button>
    );
};

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

    const [isProcessing, setIsProcessing] = useState(false);
    const [draftCandidates, setDraftCandidates] = useState<string[]>([]);

    const [isSeriesOpen, setIsSeriesOpen] = useState(true);
    const [isEpisodeOpen, setIsEpisodeOpen] = useState(true);

    const [showDebug, setShowDebug] = useState(false);
    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [croppingTarget, setCroppingTarget] = useState<'reference' | 'draft'>('reference');
    const [definitionMode, setDefinitionMode] = useState<'upload' | 'generate'>('generate');
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

    const getAspectRatioPadding = (ratio: string) => {
        const ratioMap: Record<string, string> = {
            '16:9': '56.25%',
            '9:16': '177.78%',
            '1:1': '100%',
            '2.35:1': '42.55%'
        };
        return ratioMap[ratio] || '56.25%';
    };

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
                        setDraftCandidates([]);
                    } else {
                        setDraftImage(null);
                        setDraftCandidates([]);
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

    const handleSaveAsset = async () => {
        try {
            console.log('[Step2] Saving Asset:', selectedAssetId);
            if (!setProjectInfo) {
                console.error('[Step2] setProjectInfo is missing');
                return;
            }
            const { saveToIdb, generateAssetImageKey } = await import('../utils/imageStorage');

            let finalRefUrl = referenceImage;
            if (referenceImage && referenceImage.startsWith('data:')) {
                const key = generateAssetImageKey(projectId, selectedAssetId, 'ref');
                console.log('[Step2] Saving Reference Image to IDB:', key);
                // Append timestamp to force state update and bypass cache
                finalRefUrl = (await saveToIdb('assets', key, referenceImage)) + `?t=${Date.now()}`;
            }

            let finalDraftUrl = draftImage;
            if (draftImage && draftImage.startsWith('data:')) {
                const key = generateAssetImageKey(projectId, selectedAssetId, 'draft');
                console.log('[Step2] Saving Draft Image to IDB:', key);
                // Append timestamp to force state update and bypass cache
                finalDraftUrl = (await saveToIdb('assets', key, draftImage)) + `?t=${Date.now()}`;
            }

            if (selectedAssetId === 'master_style') {
                if (setMasterStyle) {
                    setMasterStyle({
                        description: description,
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
                    description: description,
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

    const handleMagicExpand = async () => {
        if (!description) return;
        setIsProcessing(true);
        try {
            let context = `Series: ${seriesName}, Episode: ${episodeName}`;
            if (selectedAssetId !== 'master_style' && safeMasterStyle.description) {
                context += `\nMaster Visual Style: ${safeMasterStyle.description}`;
            }

            // [NEW] Inject all other defined assets for full context consistency
            const definedAssets = Object.values(safeAssetDefinitions).filter((def: any) => isDefined(def.id) && def.id !== selectedAssetId);
            if (definedAssets.length > 0) {
                const chars = definedAssets.filter((d: any) => d.type === 'character').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');
                const locs = definedAssets.filter((d: any) => d.type === 'location').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');
                const props = definedAssets.filter((d: any) => d.type === 'prop').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');

                if (chars) context += `\n\n[Existing Characters Reference]\n${chars}`;
                if (locs) context += `\n\n[Existing Locations Reference]\n${locs}`;
                if (props) context += `\n\n[Existing Props Reference]\n${props}`;
            }

            const assetTypeForAi = selectedAssetType === 'master' ? 'style' : (selectedAssetType === 'prop' ? 'character' : selectedAssetType);
            const enhanced = await enhancePrompt(description, assetTypeForAi as any, context, apiKeys?.gemini || '');
            setDescription(enhanced);
        } catch (error) {
            console.error("Enhance failed", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'reference' | 'draft' = 'reference') => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCroppingTarget(target);
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setImageToCrop(base64);
            setShowCropModal(true);
        };
        reader.readAsDataURL(file);
    };

    const handleCropConfirm = async (croppedImage: string) => {
        if (croppingTarget === 'draft') {
            setDraftImage(croppedImage);
        } else {
            setReferenceImage(croppedImage);
            setDraftImage(null);
        }
        setShowCropModal(false);
        setImageToCrop(null);

        // Analysis: 
        // 1. For reference images in 'generate' mode
        // 2. FOR ALL draft images in 'upload' mode (as requested)
        if (croppingTarget === 'reference' || (croppingTarget === 'draft' && definitionMode === 'upload')) {
            setIsProcessing(true);
            try {
                const analysis = await analyzeImage(croppedImage, apiKeys?.gemini || '');
                setDescription(prev => {
                    const prefix = "Visual Features: ";
                    if (!prev || definitionMode === 'upload') return prefix + analysis;
                    const marker = "\n\nVisual Features:";
                    if (prev.includes(marker)) return prev.split(marker)[0] + marker + " " + analysis;
                    return prev + marker + " " + analysis;
                });
            } catch (error) {
                console.error("Analysis failed", error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleCropCancel = () => {
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleExpandFromImage = async () => {
        if (!referenceImage) return;
        setIsProcessing(true);
        try {
            // 1. First analyze the image to get a raw description
            const analysis = await analyzeImage(referenceImage, apiKeys?.gemini || '');

            // 2. Then use enhancePrompt to categorize it into our strict Master Style format
            let context = `Series: ${seriesName}, Episode: ${episodeName}`;
            if (selectedAssetId !== 'master_style' && safeMasterStyle.description) {
                context += `\nMaster Visual Style: ${safeMasterStyle.description}`;
            }

            // [NEW] Inject all other defined assets for full context consistency
            const definedAssets = Object.values(safeAssetDefinitions).filter((def: any) => isDefined(def.id) && def.id !== selectedAssetId);
            if (definedAssets.length > 0) {
                const chars = definedAssets.filter((d: any) => d.type === 'character').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');
                const locs = definedAssets.filter((d: any) => d.type === 'location').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');
                const props = definedAssets.filter((d: any) => d.type === 'prop').map((d: any) => `- ${d.name}: ${d.description.slice(0, 200)}...`).join('\n');

                if (chars) context += `\n\n[Existing Characters Reference]\n${chars}`;
                if (locs) context += `\n\n[Existing Locations Reference]\n${locs}`;
                if (props) context += `\n\n[Existing Props Reference]\n${props}`;
            }

            const structured = await enhancePrompt(analysis, 'style', context, apiKeys?.gemini || '');

            setDescription(structured);
        } catch (error) {
            console.error("Analysis expansion failed", error);
        } finally {
            setIsProcessing(false);
        }
    };




    const handleSelectDraft = (url: string) => setDraftImage(url);

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
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                                    if (confirm(`"${loc.name}" ?μ냼瑜??쒕━利??μ냼 紐⑸줉?먯꽌 ??젣?섏떆寃좎뒿?덇퉴?`)) {
                                                        const newLocs = safeSeriesLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ seriesLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                                    if (confirm(`"${prop.name}" ?뚰뭹???쒕━利??뚰뭹 紐⑸줉?먯꽌 ??젣?섏떆寃좎뒿?덇퉴?`)) {
                                                        const newProps = safeSeriesProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ seriesProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                                    if (confirm(`"${char.name}" 罹먮┃?곕? ?먰뵾?뚮뱶 罹먮┃??紐⑸줉?먯꽌 ??젣?섏떆寃좎뒿?덇퉴?`)) {
                                                        const newChars = safeEpisodeCharacters.filter((c: any) => c.id !== char.id);
                                                        setProjectInfo({ episodeCharacters: newChars });
                                                        if (selectedAssetId === char.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                                    if (confirm(`"${loc.name}" ?μ냼瑜??먰뵾?뚮뱶 ?μ냼 紐⑸줉?먯꽌 ??젣?섏떆寃좎뒿?덇퉴?`)) {
                                                        const newLocs = safeEpisodeLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ episodeLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                                    if (confirm(`"${prop.name}" ?뚰뭹???먰뵾?뚮뱶 ?뚰뭹 紐⑸줉?먯꽌 ??젣?섏떆寃좎뒿?덇퉴?`)) {
                                                        const newProps = safeEpisodeProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ episodeProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all z-20"
                                                title="?덉??ㅽ듃由ъ뿉????젣"
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
                                <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] text-white border border-[var(--color-border)]">Edit Definition</button>
                            ) : (
                                <>
                                    {isDefined(selectedAssetId) && <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-white">Cancel</button>}
                                    <button onClick={() => { handleSaveAsset(); }} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-black font-bold hover:opacity-90 shadow-lg"><Save size={18} />Save Definition</button>
                                </>
                            )}
                        </div>
                    </div>

                    {!isEditing ? (
                        <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
                            <div className="flex gap-6 h-full min-h-0">
                                <div className="flex-1 glass-panel p-6 border border-[var(--color-border)] flex flex-col">
                                    <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)]"><CheckCircle size={18} className="text-green-500" /><span className="text-sm font-bold uppercase">Confirmed Description</span></div>
                                    <div className="flex-1 overflow-y-auto space-y-4">
                                        <p className="text-gray-300 text-lg whitespace-pre-wrap">{description || "?뺤쓽???ㅻ챸???놁뒿?덈떎."}</p>
                                        {characterModifier && <div className="border-t border-[var(--color-border)] pt-4"><div className="flex items-center gap-2 mb-2"><User size={14} className="text-[var(--color-primary)]" /><span className="text-xs font-bold uppercase">Character Modifier</span></div><p className="text-gray-400 text-sm pl-5">{characterModifier}</p></div>}
                                        {backgroundModifier && <div className="border-t border-[var(--color-border)] pt-4"><div className="flex items-center gap-2 mb-2"><MapPin size={14} className="text-[var(--color-primary)]" /><span className="text-xs font-bold uppercase">Background Modifier</span></div><p className="text-gray-400 text-sm pl-5">{backgroundModifier}</p></div>}
                                    </div>
                                </div>
                                <div className="w-1/3 glass-panel p-6 border border-[var(--color-border)] flex flex-col">
                                    <div className="flex items-center gap-2 mb-4"><ImageIcon size={18} className="text-[var(--color-primary)]" /><span className="text-sm font-bold uppercase">Visual Reference</span></div>
                                    <div className="flex-1 w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden group">
                                        {draftImage ? <img src={draftImage} className="absolute inset-0 w-full h-full object-contain" /> : referenceImage ? <img src={referenceImage} className="absolute inset-0 w-full h-full object-contain opacity-80" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] cursor-pointer hover:bg-white/5 transition-colors"><Upload size={24} className="mb-2" /><p className="text-xs">李몄“ ?대?吏 ?놁쓬.</p></div>}
                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-6">
                            {selectedAssetId !== 'master_style' && (
                                <div className="flex gap-2 p-1 bg-[var(--color-bg)] border border-[var(--color-border)] w-fit rounded-lg mb-2">
                                    <button
                                        onClick={() => setDefinitionMode('upload')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${definitionMode === 'upload' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        <Upload size={14} /> Upload Final Visual
                                    </button>
                                    <button
                                        onClick={() => setDefinitionMode('generate')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${definitionMode === 'generate' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        <Wand2 size={14} /> AI Generation
                                    </button>
                                </div>
                            )}

                            {selectedAssetId !== 'master_style' && definitionMode === 'upload' ? (
                                /* UPLOAD MODE UI */
                                <div className="space-y-6">
                                    <div className="glass-panel p-8 border border-[var(--color-border)] bg-[var(--color-bg)]/30 flex flex-col items-center justify-center gap-6 group transition-colors hover:border-[var(--color-primary)]/50 relative min-h-[300px]">
                                        {draftImage ? (
                                            <div className="w-full flex flex-col items-center gap-4">
                                                <div className="w-full relative" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                                    <img src={draftImage} className="absolute inset-0 w-full h-full object-contain" />
                                                </div>
                                                <button
                                                    onClick={() => { setDraftImage(null); setDescription(''); }}
                                                    className="px-4 py-2 bg-white/5 border border-white/10 text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 relative z-10"
                                                >
                                                    <RotateCcw size={14} /> Reset (Clear)
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="p-6 rounded-full bg-[var(--color-surface)] group-hover:bg-[var(--color-primary)]/10 transition-colors">
                                                    <Upload size={48} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className="text-white font-bold text-lg mb-2">Upload Your Final Asset</h3>
                                                    <p className="text-[var(--color-text-muted)] max-w-sm">?꾩꽦??罹먮┃?곕굹 諛곌꼍 ?대?吏瑜??닿납???쒕옒洹????쒕∼?섏꽭?? ?꾨줈?뺤뀡 ?④퀎?먯꽌???쇨????좎?瑜??꾪빐 AI媛 ?먮룞?쇰줈 ?대?吏瑜?遺꾩꽍?⑸땲??</p>
                                                </div>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'draft')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </div>

                                    {/* Select from Existing Assets */}
                                    {!draftImage && Object.values(safeAssetDefinitions).some(def => def.draftImage && def.id !== selectedAssetId) && (
                                        <div className="glass-panel p-4 border border-[var(--color-border)]">
                                            <h4 className="text-sm font-bold text-[var(--color-text-muted)] mb-3 flex items-center gap-2">
                                                <ImageIcon size={14} /> ?먮뒗 湲곗〈 ?꾨줈?앺듃 ?먯궛 以묒뿉???좏깮?섏꽭??
                                            </h4>
                                            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[200px] overflow-y-auto pr-2">
                                                {Object.values(safeAssetDefinitions)
                                                    .filter(def => def.draftImage && def.id !== selectedAssetId)
                                                    .map(def => (
                                                        <AssetThumbnailButton
                                                            key={def.id}
                                                            def={def}
                                                            onSelect={(url) => {
                                                                setCroppingTarget('draft');
                                                                setImageToCrop(url);
                                                                setShowCropModal(true);
                                                            }}
                                                        />
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}

                                    <div className="glass-panel border border-[var(--color-border)]">
                                        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                                            <div className="flex items-center gap-2">
                                                <Type size={18} />
                                                <span className="text-sm font-bold uppercase">AI Analyzed Description</span>
                                            </div>
                                            {isProcessing && (
                                                <div className="flex items-center gap-2 text-[var(--color-primary)] text-xs font-bold animate-pulse">
                                                    <Loader2 size={14} className="animate-spin" /> Analyzing Visual Features...
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <textarea
                                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-lg min-h-[200px]"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder={isProcessing ? "AI媛 ?대?吏瑜?遺꾩꽍 以묒엯?덈떎. ?좎떆留?湲곕떎?ㅼ＜?몄슂..." : "?낅줈???꾨즺 ???쒓컖???뱀쭠???ш린???쒖떆?⑸땲??.."}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* GENERATE MODE UI (Includes Master Style) */
                                <>
                                    {selectedAssetId !== 'master_style' && (
                                        <div className="glass-panel p-4 border border-[var(--color-border)]">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2"><ImageIcon size={18} className="text-[var(--color-primary)]" /><span className="text-sm font-bold uppercase">Asset Image</span></div>
                                                <button
                                                    onClick={() => setShowGenerationModal(true)}
                                                    className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold hover:opacity-90 rounded-lg flex items-center gap-2 shadow-lg"
                                                >
                                                    <Wand2 size={16} /> Open Generation Studio
                                                </button>
                                                {/* Instructional Text in Korean (No Panel) */}
                                                {selectedAssetId !== 'master_style' && (
                                                    <div className="mt-2 text-center">
                                                        <p className="text-sm text-gray-300 font-medium">
                                                            Generation Studio瑜??ъ슜?섏뿬 ?먯뀑 ?대?吏瑜??앹꽦?섍퀬 ?몄쭛?섏꽭??
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            ?꾩옱 ?꾨＼?꾪듃, 李몄“ ?대?吏 諛?AI 吏??湲곕뒫? ?ㅽ뒠?붿삤?먯꽌 ?ъ슜?????덉뒿?덈떎.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Show selected draft or placeholder */}
                                            {draftImage ? (
                                                <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                                    <img src={draftImage} className="absolute inset-0 w-full h-full object-contain" />
                                                </div>
                                            ) : draftCandidates.length > 0 ? (
                                                <>
                                                    <p className="text-xs text-gray-500 mb-2">?앹꽦???꾨낫 以묒뿉???좏깮?섏꽭??</p>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                        {draftCandidates.map((url, i) => (
                                                            <button key={i} onClick={() => handleSelectDraft(url)} className={`relative aspect-video border overflow-hidden transition-all ${draftImage === url ? 'border-[var(--color-primary)] border-4' : 'border-[var(--color-border)] hover:border-white/30'}`}>
                                                                <img src={url} className="w-full h-full object-cover" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="py-16 border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg)]/10 text-center">
                                                    <ImageIcon size={48} className="mx-auto mb-4 text-gray-600" />
                                                    <p className="text-gray-500">'Open Generation Studio'瑜??대┃?섏뿬 ?대?吏瑜??앹꽦?섏꽭??</p>
                                                </div>
                                            )}
                                        </div>
                                    )}


                                    {/* Master Style keeps the full editor */}
                                    {selectedAssetId === 'master_style' && (
                                        <div className="flex gap-6">
                                            <div className="flex-1 flex flex-col gap-4">
                                                <div className="glass-panel border border-[var(--color-border)]">
                                                    <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]"><div className="flex items-center gap-2"><Type size={18} /><span className="text-sm font-bold uppercase">Master Style</span></div><button onClick={handleMagicExpand} disabled={isProcessing || !description} className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold hover:opacity-90">AI Expander</button></div>
                                                    <div className="p-4"><textarea className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-lg min-h-[200px]" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                                                </div>
                                                <div className="glass-panel p-4 border border-[var(--color-border)]"><label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">Character Modifier (Optional)</label><textarea value={characterModifier} onChange={(e) => setCharacterModifier(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-gray-300 min-h-[80px]" /></div>
                                                <div className="glass-panel p-4 border border-[var(--color-border)]"><label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">Background Modifier (Optional)</label><textarea value={backgroundModifier} onChange={(e) => setBackgroundModifier(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-gray-300 min-h-[80px]" /></div>
                                            </div>
                                            <div className="w-1/3 glass-panel border border-[var(--color-border)] flex flex-col">
                                                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]"><span className="text-sm font-bold uppercase">Reference (Optional)</span>{referenceImage && <button onClick={() => { setReferenceImage(null); setDraftImage(null); }} className="text-[10px] text-red-300"><RotateCcw size={10} className="inline mr-1" />Clear</button>}</div>
                                                <div className="flex-1 relative border-dashed border-[var(--color-border)] bg-[var(--color-bg)] group">
                                                    {referenceImage ? (
                                                        <div className="h-full w-full relative">
                                                            <img src={referenceImage} className="w-full h-full object-cover opacity-70 group-hover:opacity-100" />
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 gap-2 p-2">
                                                                <button onClick={handleExpandFromImage} className="w-full py-2 bg-purple-500 text-white text-xs font-bold">Expand Prompt</button>
                                                            </div>
                                                        </div>
                                                    ) : <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]"><Upload size={24} className="mb-2" /><span className="text-xs text-center px-4">AI ?앹꽦???뺢린 ?꾪븳 李몄“ ?대?吏瑜??낅줈?쒗븯?몄슂.</span></div>}
                                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
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
            {showDebug && (<div className="mt-8 glass-panel p-6 border border-red-500/30"><h3 className="text-red-400 font-bold mb-4 flex items-center gap-2"><Bug size={18} /> Asset Debug Console</h3><pre className="text-[10px] bg-black/50 p-4 overflow-x-auto text-green-400">{JSON.stringify({ masterStyle, assetDefinitions }, null, 2)}</pre></div>)}
            {showCropModal && imageToCrop && (<ImageCropModal imageSrc={imageToCrop} onConfirm={handleCropConfirm} onCancel={handleCropCancel} aspectRatio={aspectRatio || '16:9'} />)}

            {/* Asset Generation Studio Modal */}
            {showGenerationModal && selectedAssetId !== 'master_style' && (
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
                            setDescription(result.description);
                            if (result.selectedDraft) {
                                setDraftImage(result.selectedDraft);
                            }
                            if (result.draftHistory.length > 0) {
                                setDraftCandidates(result.draftHistory);
                            }
                            setShowGenerationModal(false);
                        },
                    }}
                />
            )}
        </div>
    );
};
