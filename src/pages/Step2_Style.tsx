import React, { useState, useEffect } from 'react';
import { Wand2, Save, Type, ImageIcon, Upload, Loader2, CheckCircle, ChevronDown, AlertCircle, RotateCcw, User, MapPin, Bug, Package, ArrowRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore, type AssetDefinition } from '../store/workflowStore';
import { enhancePrompt, analyzeImage } from '../services/gemini';
import { ImageCropModal } from '../components/ImageCropModal';

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
        cleanupOrphanedAssets
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
    const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
    const [draftCount, setDraftCount] = useState<number>(2);
    const [draftCandidates, setDraftCandidates] = useState<string[]>([]);

    const [isSeriesOpen, setIsSeriesOpen] = useState(true);
    const [isEpisodeOpen, setIsEpisodeOpen] = useState(true);

    const [showDebug, setShowDebug] = useState(false);
    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [croppingTarget, setCroppingTarget] = useState<'reference' | 'draft'>('reference');
    const [definitionMode, setDefinitionMode] = useState<'upload' | 'generate'>('generate');

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
        // Requirement: Must have description AND (reference image OR draft image)
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
    }, [selectedAssetId, safeAssetDefinitions, safeMasterStyle, safeCharacters, safeEpisodeCharacters, safeSeriesLocations, safeEpisodeLocations, safeSeriesProps, safeEpisodeProps, selectedAssetType]);

    const { isHydrated } = useWorkflowStore();
    useEffect(() => {
        if (isHydrated) {
            if (isSeriesComplete) setIsSeriesOpen(false);
            if (isEpisodeComplete) setIsEpisodeOpen(false);
        }
    }, [isHydrated]);

    const handleSaveAsset = async () => {
        if (!setProjectInfo) return;
        const { saveToIdb, generateAssetImageKey } = await import('../utils/imageStorage');

        let finalRefUrl = referenceImage;
        if (referenceImage && referenceImage.startsWith('data:')) {
            const key = generateAssetImageKey(projectId, selectedAssetId, 'ref');
            finalRefUrl = await saveToIdb('assets', key, referenceImage);
        }

        let finalDraftUrl = draftImage;
        if (draftImage && draftImage.startsWith('data:')) {
            const key = generateAssetImageKey(projectId, selectedAssetId, 'draft');
            finalDraftUrl = await saveToIdb('assets', key, draftImage);
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
            setProjectInfo({
                assetDefinitions: {
                    ...safeAssetDefinitions,
                    [selectedAssetId]: newDefinition
                }
            });
        }
        setIsEditing(false);
    };

    const handleMagicExpand = async () => {
        if (!description) return;
        setIsProcessing(true);
        try {
            const context = `Series: ${seriesName}, Episode: ${episodeName}`;
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
            const context = `Series: ${seriesName}, Episode: ${episodeName}`;
            const structured = await enhancePrompt(analysis, 'style', context, apiKeys?.gemini || '');

            setDescription(structured);
        } catch (error) {
            console.error("Analysis expansion failed", error);
        } finally {
            setIsProcessing(false);
        }
    };


    const handleGenerateDraft = async () => {
        if (!description) return;
        setIsGeneratingDraft(true);
        setDraftCandidates([]);
        try {
            const { generateImage } = await import('../services/imageGen');
            const { resolveUrl } = await import('../utils/imageStorage');
            const currentAspectRatio = aspectRatio || '16:9';
            let finalPrompt = description;
            if (selectedAssetId !== 'master_style' && safeMasterStyle.description) {
                finalPrompt = `[Master Visual Style: ${safeMasterStyle.description}] \n\n ${description}`;
            }
            const result = await generateImage(
                finalPrompt,
                apiKeys?.gemini || '',
                referenceImage ? [referenceImage] : undefined,
                currentAspectRatio,
                'gemini-3-pro-image-preview',
                draftCount
            );
            const resolvedUrls = await Promise.all(result.urls.map(url => resolveUrl(url)));
            setDraftCandidates(resolvedUrls.map((url, i) => url || result.urls[i]));
            if (result.urls.length === 1) setDraftImage(resolvedUrls[0] || result.urls[0]);
        } catch (error: any) {
            console.error("Draft generation failed", error);
            alert(`Failed to generate draft.\n\nDetails: ${error.message || "Unknown error"}`);
        } finally {
            setIsGeneratingDraft(false);
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
                                        <div key={char.id} className="group/item relative">
                                            <button onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === char.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2"><User size={14} /><span className="font-medium">{char.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
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
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeSeriesLocations?.map((loc: any) => (
                                        <div key={loc.id} className="group/item relative">
                                            <button onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left"><MapPin size={14} /><span className="font-medium">{loc.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${loc.name}" from series locations?`)) {
                                                        const newLocs = safeSeriesLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ seriesLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeSeriesProps?.map((prop: any) => (
                                        <div key={prop.id} className="group/item relative">
                                            <button onClick={() => { setSelectedAssetId(prop.id); setSelectedAssetType('prop'); setSelectedAssetName(prop.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left"><Package size={14} /><span className="font-medium">{prop.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(prop.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${prop.name}" from series props?`)) {
                                                        const newProps = safeSeriesProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ seriesProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
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
                                        <div key={char.id} className="group/item relative">
                                            <button key={char.id} onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === char.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2"><User size={14} /><span className="font-medium">{char.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${char.name}" from episode characters?`)) {
                                                        const newChars = safeEpisodeCharacters.filter((c: any) => c.id !== char.id);
                                                        setProjectInfo({ episodeCharacters: newChars });
                                                        if (selectedAssetId === char.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeEpisodeLocations?.map((loc: any) => (
                                        <div key={loc.id} className="group/item relative">
                                            <button key={loc.id} onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === loc.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left"><MapPin size={14} /><span className="font-medium">{loc.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${loc.name}" from episode locations?`)) {
                                                        const newLocs = safeEpisodeLocations.filter((l: any) => l.id !== loc.id);
                                                        setProjectInfo({ episodeLocations: newLocs });
                                                        if (selectedAssetId === loc.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {safeEpisodeProps?.map((prop: any) => (
                                        <div key={prop.id} className="group/item relative">
                                            <button key={prop.id} onClick={() => { setSelectedAssetId(prop.id); setSelectedAssetType('prop'); setSelectedAssetName(prop.name); }}
                                                className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === prop.id ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white' : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                                <div className="flex items-center gap-2 text-left"><Package size={14} /><span className="font-medium">{prop.name}</span></div>
                                                <div className="flex items-center gap-2">
                                                    {isDefined(prop.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Remove "${prop.name}" from episode props?`)) {
                                                        const newProps = safeEpisodeProps.filter((p: any) => p.id !== prop.id);
                                                        setProjectInfo({ episodeProps: newProps });
                                                        if (selectedAssetId === prop.id) setSelectedAssetId('master_style');
                                                    }
                                                }}
                                                className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                                                title="Delete from registry"
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
                                        <p className="text-gray-300 text-lg whitespace-pre-wrap">{description || "No description defined."}</p>
                                        {characterModifier && <div className="border-t border-[var(--color-border)] pt-4"><div className="flex items-center gap-2 mb-2"><User size={14} className="text-[var(--color-primary)]" /><span className="text-xs font-bold uppercase">Character Modifier</span></div><p className="text-gray-400 text-sm pl-5">{characterModifier}</p></div>}
                                        {backgroundModifier && <div className="border-t border-[var(--color-border)] pt-4"><div className="flex items-center gap-2 mb-2"><MapPin size={14} className="text-[var(--color-primary)]" /><span className="text-xs font-bold uppercase">Background Modifier</span></div><p className="text-gray-400 text-sm pl-5">{backgroundModifier}</p></div>}
                                    </div>
                                </div>
                                <div className="w-1/3 glass-panel p-6 border border-[var(--color-border)] flex flex-col">
                                    <div className="flex items-center gap-2 mb-4"><ImageIcon size={18} className="text-[var(--color-primary)]" /><span className="text-sm font-bold uppercase">Visual Reference</span></div>
                                    <div className="flex-1 w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden group">
                                        {draftImage ? <img src={draftImage} className="absolute inset-0 w-full h-full object-contain" /> : referenceImage ? <img src={referenceImage} className="absolute inset-0 w-full h-full object-contain opacity-80" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] cursor-pointer hover:bg-white/5 transition-colors"><Upload size={24} className="mb-2" /><p className="text-xs">No reference image.</p></div>}
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
                                                    <p className="text-[var(--color-text-muted)] max-w-sm">Drop your finished character or location design here. We will automatically analyze it to maintain consistency in Production.</p>
                                                </div>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'draft')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </div>

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
                                                placeholder={isProcessing ? "Wait while AI analyzes your image..." : "Visual features will appear here after upload..."}
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
                                                <div className="flex items-center gap-2"><ImageIcon size={18} className="text-[var(--color-primary)]" /><span className="text-sm font-bold uppercase">Draft Candidates</span></div>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] p-1">{[1, 2, 3, 4].map(num => (<button key={num} onClick={() => setDraftCount(num)} className={`w-6 h-6 text-xs ${draftCount === num ? 'bg-[var(--color-primary)] text-black' : 'hover:bg-white/10'}`}>{num}</button>))}</div>
                                                    <button onClick={handleGenerateDraft} disabled={isGeneratingDraft || !description} className="px-4 py-1 bg-[var(--color-primary)] text-black text-xs font-bold hover:opacity-90 disabled:opacity-50">{isGeneratingDraft ? <Loader2 className="animate-spin mr-1 inline" size={14} /> : <Wand2 size={14} className="mr-1 inline" />}{isGeneratingDraft ? 'Generating...' : 'Generate Candidates'}</button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                {isGeneratingDraft ? (
                                                    Array.from({ length: draftCount }).map((_, i) => (
                                                        <div key={i} className="aspect-video bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center animate-pulse">
                                                            <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
                                                        </div>
                                                    ))
                                                ) : draftCandidates.length > 0 ? (
                                                    draftCandidates.map((url, i) => (
                                                        <button key={i} onClick={() => handleSelectDraft(url)} className={`relative aspect-video border overflow-hidden transition-all ${draftImage === url ? 'border-[var(--color-primary)] border-4 scale-[1.02] shadow-xl' : 'border-[var(--color-border)] opacity-60 hover:opacity-100'}`}>
                                                            <img src={url} className="w-full h-full object-cover" />
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="col-span-full py-12 border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg)]/10 text-center text-[var(--color-text-muted)] text-sm">
                                                        No candidates yet. Define the description below and click "Generate".
                                                    </div>
                                                )}
                                            </div>
                                            {draftImage && (<div className="mt-4 pt-4 border-t border-[var(--color-border)]"><div className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] mb-2">Selected Draft</div><div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}><img src={draftImage} className="absolute inset-0 w-full h-full object-contain" /></div></div>)}
                                        </div>
                                    )}

                                    <div className="flex gap-6">
                                        <div className="flex-1 flex flex-col gap-4">
                                            <div className="glass-panel border border-[var(--color-border)]">
                                                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]"><div className="flex items-center gap-2"><Type size={18} /><span className="text-sm font-bold uppercase">{selectedAssetId === 'master_style' ? 'Master Style' : 'Visual Prompt'}</span></div><button onClick={handleMagicExpand} disabled={isProcessing || !description} className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold hover:opacity-90">AI Expander</button></div>
                                                <div className="p-4"><textarea className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-lg min-h-[200px]" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                                            </div>
                                            {selectedAssetId === 'master_style' && (
                                                <>
                                                    <div className="glass-panel p-4 border border-[var(--color-border)]"><label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">Character Modifier (Optional)</label><textarea value={characterModifier} onChange={(e) => setCharacterModifier(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-gray-300 min-h-[80px]" /></div>
                                                    <div className="glass-panel p-4 border border-[var(--color-border)]"><label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">Background Modifier (Optional)</label><textarea value={backgroundModifier} onChange={(e) => setBackgroundModifier(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] p-3 text-gray-300 min-h-[80px]" /></div>
                                                </>
                                            )}
                                        </div>
                                        <div className="w-1/3 glass-panel border border-[var(--color-border)] flex flex-col">
                                            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]"><span className="text-sm font-bold uppercase">Reference (Optional)</span>{referenceImage && <button onClick={() => { setReferenceImage(null); setDraftImage(null); }} className="text-[10px] text-red-300"><RotateCcw size={10} className="inline mr-1" />Clear</button>}</div>
                                            <div className="flex-1 relative border-dashed border-[var(--color-border)] bg-[var(--color-bg)] group">
                                                {referenceImage ? (
                                                    <div className="h-full w-full relative">
                                                        <img src={referenceImage} className="w-full h-full object-cover opacity-70 group-hover:opacity-100" />
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 gap-2 p-2">
                                                            <button onClick={handleExpandFromImage} className="w-full py-2 bg-purple-500 text-white text-xs font-bold">Expand Prompt</button>
                                                            {selectedAssetId !== 'master_style' && <button onClick={() => setDraftImage(referenceImage)} className="w-full py-2 bg-[var(--color-primary)] text-black text-xs font-bold">Use as Final</button>}
                                                        </div>
                                                    </div>
                                                ) : <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]"><Upload size={24} className="mb-2" /><span className="text-xs text-center px-4">Upload Reference to guide AI generation</span></div>}
                                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            </div>
                                        </div>
                                    </div>
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
        </div>
    );
};
