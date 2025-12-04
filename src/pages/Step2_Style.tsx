import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Wand2, Save, Type, ImageIcon, Upload, Loader2, CheckCircle, ChevronDown, AlertCircle, RotateCcw, User, MapPin, Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore, type AssetDefinition } from '../store/workflowStore';
import { enhancePrompt, analyzeImage } from '../services/gemini';
import { ImageCropModal } from '../components/ImageCropModal';

export const Step2_Style: React.FC = () => {
    const navigate = useNavigate();
    const store = useWorkflowStore();

    // Direct access to store properties
    const {
        setProjectInfo,
        nextStep,
        prevStep,
        apiKeys,
        masterStyle,
        characters,
        episodeCharacters,
        seriesLocations,
        episodeLocations,
        assetDefinitions,
        seriesName: seriesTitle,
        episodeName: episodeTitle,
        setMasterStyle,
        aspectRatio
    } = store;

    // Local state for the currently selected asset to edit
    const [selectedAssetId, setSelectedAssetId] = useState<string>('master_style');
    const [selectedAssetType, setSelectedAssetType] = useState<'master' | 'character' | 'location'>('master');
    const [selectedAssetName, setSelectedAssetName] = useState<string>('Master Visual Style');
    const [isEditing, setIsEditing] = useState(false);

    // Form states
    const [description, setDescription] = useState('');
    const [characterModifier, setCharacterModifier] = useState('');
    const [backgroundModifier, setBackgroundModifier] = useState('');
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [draftImage, setDraftImage] = useState<string | null>(null);

    // Loading states
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

    // Accordion states
    const [isSeriesOpen, setIsSeriesOpen] = useState(true);
    const [isEpisodeOpen, setIsEpisodeOpen] = useState(true);

    // Debug state
    const [showDebug, setShowDebug] = useState(false);

    // Crop modal state
    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);

    // Use default values if store is initializing
    const safeMasterStyle = masterStyle || { description: '', referenceImage: null };
    const safeCharacters = Array.isArray(characters) ? characters : [];
    const safeEpisodeCharacters = Array.isArray(episodeCharacters) ? episodeCharacters : [];
    const safeSeriesLocations = Array.isArray(seriesLocations) ? seriesLocations : [];
    const safeEpisodeLocations = Array.isArray(episodeLocations) ? episodeLocations : [];
    const safeAssetDefinitions = assetDefinitions || {};

    const seriesName = seriesTitle || "Untitled Series";
    const episodeName = episodeTitle || "Untitled Episode";

    // Helper to convert aspect ratio to padding percentage
    const getAspectRatioPadding = (ratio: string) => {
        const ratioMap: Record<string, string> = {
            '16:9': '56.25%',  // 9/16 * 100
            '9:16': '177.78%', // 16/9 * 100
            '1:1': '100%',
            '2.35:1': '42.55%' // 1/2.35 * 100
        };
        return ratioMap[ratio] || '56.25%';
    };

    // Helper to check if an asset is defined
    const isDefined = (id: string) => !!safeAssetDefinitions[id];

    // Check completion status
    const isSeriesComplete = !!safeMasterStyle.description &&
        safeCharacters.every((c: any) => isDefined(c.id)) &&
        safeSeriesLocations.every((l: any) => isDefined(l.id));

    const isEpisodeComplete = safeEpisodeCharacters.every((c: any) => isDefined(c.id)) &&
        safeEpisodeLocations.every((l: any) => isDefined(l.id));

    // Load data when selection changes
    useEffect(() => {
        if (selectedAssetId === 'master_style') {
            setDescription(safeMasterStyle.description || '');
            setCharacterModifier(safeMasterStyle.characterModifier || '');
            setBackgroundModifier(safeMasterStyle.backgroundModifier || '');
            setReferenceImage(safeMasterStyle.referenceImage || null);
            setDraftImage(null);
            // Master style is always editable for now, or we can treat it like others
            setIsEditing(!safeMasterStyle.description);
        } else {
            const def = safeAssetDefinitions[selectedAssetId];
            if (def) {
                // Load existing definition
                setDescription(def.description);
                setReferenceImage(def.referenceImage || null);
                setDraftImage(def.draftImage || null);
                setIsEditing(false); // View mode for existing
            } else {
                // New definition - prepend Master Style if it exists
                let initialDescription = '';
                if (safeMasterStyle.description) {
                    initialDescription = `[Master Visual Style: ${safeMasterStyle.description}]`;

                    // Add Character Modifier for character assets
                    if (selectedAssetType === 'character' && safeMasterStyle.characterModifier) {
                        initialDescription += `\n[Character Modifier: ${safeMasterStyle.characterModifier}]`;
                    }

                    // Add Background Modifier for location assets
                    if (selectedAssetType === 'location' && safeMasterStyle.backgroundModifier) {
                        initialDescription += `\n[Background Modifier: ${safeMasterStyle.backgroundModifier}]`;
                    }

                    initialDescription += '\n\n';
                }

                // Find and add the character/location description from Step 1
                let baseDescription = '';
                if (selectedAssetType === 'character') {
                    // Check series characters first
                    const seriesChar = safeCharacters.find((c: any) => c.id === selectedAssetId);
                    if (seriesChar?.description) {
                        baseDescription = seriesChar.description;
                    } else {
                        // Check episode characters
                        const episodeChar = safeEpisodeCharacters.find((c: any) => c.id === selectedAssetId);
                        if (episodeChar?.description) {
                            baseDescription = episodeChar.description;
                        }
                    }
                } else if (selectedAssetType === 'location') {
                    // Check series locations first
                    const seriesLoc = safeSeriesLocations.find((l: any) => l.id === selectedAssetId);
                    if (seriesLoc?.description) {
                        baseDescription = seriesLoc.description;
                    } else {
                        // Check episode locations
                        const episodeLoc = safeEpisodeLocations.find((l: any) => l.id === selectedAssetId);
                        if (episodeLoc?.description) {
                            baseDescription = episodeLoc.description;
                        }
                    }
                }

                // Combine with base description
                initialDescription += baseDescription;

                setDescription(initialDescription);
                setReferenceImage(null);
                setDraftImage(null);
                setIsEditing(true); // Edit mode for new
            }
        }
    }, [selectedAssetId, safeAssetDefinitions, safeMasterStyle, safeCharacters, safeEpisodeCharacters, safeSeriesLocations, safeEpisodeLocations, selectedAssetType]);

    // Auto-collapse sections if complete on mount/hydration
    const { isHydrated } = useWorkflowStore();

    useEffect(() => {
        if (isHydrated) {
            if (isSeriesComplete) setIsSeriesOpen(false);
            if (isEpisodeComplete) setIsEpisodeOpen(false);
        }
    }, [isHydrated]); // Run when hydration finishes

    const handleSaveAsset = () => {
        if (!setProjectInfo) return;

        console.log("[Step2] Saving Asset:", selectedAssetId, selectedAssetName);
        console.log("[Step2] Draft Image State:", draftImage ? "Exists (Length: " + draftImage.length + ")" : "Null");

        if (selectedAssetId === 'master_style') {
            if (setMasterStyle) {
                setMasterStyle({
                    description,
                    referenceImage: referenceImage || null,
                    characterModifier: characterModifier || undefined,
                    backgroundModifier: backgroundModifier || undefined
                });
            }
        } else {
            // Save regular asset definition
            const newDefinition: AssetDefinition = {
                id: selectedAssetId,
                type: selectedAssetType as 'character' | 'location',
                name: selectedAssetName,
                description: description,
                referenceImage: referenceImage || undefined,
                draftImage: draftImage || undefined,
                lastUpdated: Date.now() // Versioning tracker
            };

            console.log("[Step2] New Definition:", newDefinition);

            setProjectInfo({
                assetDefinitions: {
                    ...safeAssetDefinitions,
                    [selectedAssetId]: newDefinition
                }
            });
        }
    };

    const handleMagicExpand = async () => {
        if (!description) return;
        setIsProcessing(true);
        try {
            const context = `Series: ${seriesName}, Episode: ${episodeName}`;
            const enhanced = await enhancePrompt(description, selectedAssetType === 'master' ? 'style' : selectedAssetType, context, apiKeys?.gemini || '');
            setDescription(enhanced);
        } catch (error) {
            console.error("Enhance failed", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log("handleImageUpload triggered");
        const file = e.target.files?.[0];
        if (!file) {
            console.log("No file selected");
            return;
        }
        console.log("File selected:", file.name);

        const reader = new FileReader();
        reader.onloadend = () => {
            console.log("FileReader finished");
            const base64 = reader.result as string;
            // Show crop modal instead of auto-cropping
            setImageToCrop(base64);
            setShowCropModal(true);
            console.log("Set showCropModal to true");
        };
        reader.readAsDataURL(file);
    };

    const handleCropConfirm = async (croppedImage: string) => {
        setReferenceImage(croppedImage);
        setDraftImage(null); // Clear stale draft when reference changes
        setShowCropModal(false);
        setImageToCrop(null);

        // Auto-analyze
        setIsProcessing(true);
        try {
            const analysis = await analyzeImage(croppedImage, apiKeys?.gemini || '');
            setDescription(prev => prev ? prev + "\n\nVisual Analysis: " + analysis : analysis);
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCropCancel = () => {
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleGenerateDraft = async () => {
        if (!description) return;
        setIsGeneratingDraft(true);
        try {
            const { generateImage } = await import('../services/imageGen');

            // Get current aspect ratio
            const currentAspectRatio = aspectRatio || '16:9';

            // Prepend Master Style if this is an asset
            let finalPrompt = description;
            if (selectedAssetId !== 'master_style' && safeMasterStyle.description) {
                finalPrompt = `[Master Visual Style: ${safeMasterStyle.description}] \n\n ${description}`;
            }

            // Pass aspect ratio directly to generateImage function
            const result = await generateImage(
                finalPrompt,
                apiKeys?.gemini || '',
                referenceImage ? [referenceImage] : undefined,
                currentAspectRatio,
                'gemini-2.5-flash-image'
            );
            setDraftImage(result.url);
        } catch (error) {
            console.error("Draft generation failed", error);
            alert("Failed to generate draft. Please check your Gemini API key.");
        } finally {
            setIsGeneratingDraft(false);
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
                {/* LEFT PANEL: ASSET LIST */}
                <div className="w-1/3 glass-panel flex flex-col !border !border-[var(--color-primary)] overflow-hidden !rounded-none">
                    <div className="p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex-shrink-0">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <ImageIcon size={20} className="text-[var(--color-primary)]" />
                                Key Visuals
                            </h2>
                            <p className="text-xs text-[var(--color-primary)] uppercase tracking-wider ml-7">Define Look</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 space-y-0">
                        {/* MASTER VISUAL STYLE (NEW) */}
                        <button
                            onClick={() => { setSelectedAssetId('master_style'); setSelectedAssetType('master'); setSelectedAssetName('Master Visual Style'); }}
                            className={`w-full flex items-center justify-between p-4 border-b border-[var(--color-border)] transition-all duration-300 ${selectedAssetId === 'master_style'
                                ? 'bg-[var(--color-primary)]/10 border-r-4 border-r-[var(--color-primary)] text-white'
                                : 'bg-transparent text-gray-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white border-r-4 border-r-transparent'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-none ${selectedAssetId === 'master_style' ? 'bg-[var(--color-primary)] text-black' : 'bg-[var(--color-bg)] text-[var(--color-primary)]'}`}>
                                    <Wand2 size={20} />
                                </div>
                                <div className="text-left">
                                    <h4 className="font-bold">Master Visual Style</h4>
                                    <p className="text-xs opacity-70">Global art direction</p>
                                </div>
                            </div>
                            {safeMasterStyle.description ? <CheckCircle size={20} className="text-green-500" /> : <AlertCircle size={20} className="text-yellow-500" />}
                        </button>

                        {/* SERIES LEVEL */}
                        <div className="border-b border-[var(--color-border)]">
                            <button
                                onClick={() => setIsSeriesOpen(!isSeriesOpen)}
                                className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <h4 className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">Series Level</h4>
                                    {isSeriesComplete && <CheckCircle size={16} className="text-green-500" />}
                                </div>
                                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isSeriesOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isSeriesOpen && (
                                <div className="bg-[var(--color-bg)]/50">
                                    {/* Main Characters */}
                                    {safeCharacters?.map((char: any) => (
                                        <button
                                            key={char.id}
                                            onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                            className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === char.id
                                                ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white'
                                                : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="opacity-70" />
                                                <span className="font-medium">{char.name}</span>
                                            </div>
                                            {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                        </button>
                                    ))}

                                    {/* Series Locations */}
                                    {safeSeriesLocations?.map((loc: any) => (
                                        <button
                                            key={loc.id}
                                            onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                            className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === loc.id
                                                ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white'
                                                : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} className="opacity-70" />
                                                <span className="font-medium">{loc.name}</span>
                                            </div>
                                            {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* EPISODE LEVEL */}
                        <div className="border-b border-[var(--color-border)]">
                            <button
                                onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
                                className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <h4 className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">Episode Level</h4>
                                    {isEpisodeComplete && <CheckCircle size={16} className="text-green-500" />}
                                </div>
                                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isEpisodeOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isEpisodeOpen && (
                                <div className="bg-[var(--color-bg)]/50">
                                    {/* Episode Characters */}
                                    {safeEpisodeCharacters?.map((char: any) => (
                                        <button
                                            key={char.id}
                                            onClick={() => { setSelectedAssetId(char.id); setSelectedAssetType('character'); setSelectedAssetName(char.name); }}
                                            className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === char.id
                                                ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white'
                                                : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="opacity-70" />
                                                <span className="font-medium">{char.name}</span>
                                            </div>
                                            {isDefined(char.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                        </button>
                                    ))}

                                    {/* Episode Locations */}
                                    {safeEpisodeLocations?.map((loc: any) => (
                                        <button
                                            key={loc.id}
                                            onClick={() => { setSelectedAssetId(loc.id); setSelectedAssetType('location'); setSelectedAssetName(loc.name); }}
                                            className={`w-full flex items-center justify-between p-3 pl-6 border-l-2 transition-all ${selectedAssetId === loc.id
                                                ? 'bg-[var(--color-primary)]/10 border-l-[var(--color-primary)] border-r-4 border-r-[var(--color-primary)] text-white'
                                                : 'border-l-transparent border-r-4 border-r-transparent text-gray-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} className="opacity-70" />
                                                <span className="font-medium">{loc.name}</span>
                                            </div>
                                            {isDefined(loc.id) ? <CheckCircle size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600" />}
                                        </button>
                                    ))}
                                    {safeEpisodeCharacters.length === 0 && safeEpisodeLocations.length === 0 && (
                                        <div className="text-center py-4 text-[var(--color-text-muted)] text-sm italic">
                                            No episode assets defined.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: DEFINITION & INPUTS */}
                <div className="flex-1 flex flex-col min-w-0 border-l border-[var(--color-border)]">

                    {/* HEADER */}
                    <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent">
                        <h2 className="text-2xl font-bold text-white">{selectedAssetName}</h2>

                        {/* Header Actions */}
                        <div className="flex items-center gap-3">
                            {!isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-none font-bold bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] text-white transition-all border border-[var(--color-border)]"
                                >
                                    Edit Definition
                                </button>
                            ) : (
                                <>
                                    {isDefined(selectedAssetId) && (
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            handleSaveAsset();
                                            setIsEditing(false);
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-none font-bold transition-all ${store.saveStatus === 'saving'
                                            ? 'bg-yellow-500/20 text-yellow-300 cursor-wait'
                                            : store.saveStatus === 'saved'
                                                ? 'bg-green-500/20 text-green-300'
                                                : store.saveStatus === 'error'
                                                    ? 'bg-red-500/20 text-red-300'
                                                    : 'bg-[var(--color-primary)] text-black hover:opacity-90 shadow-lg'
                                            }`}
                                        disabled={store.saveStatus === 'saving'}
                                    >
                                        <Save size={18} />
                                        {store.saveStatus === 'saving'
                                            ? 'Saving...'
                                            : store.saveStatus === 'saved'
                                                ? 'Saved!'
                                                : store.saveStatus === 'error'
                                                    ? 'Error'
                                                    : 'Save Definition'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    {!isEditing ? (
                        /* VIEW MODE */
                        <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
                            {selectedAssetId === 'master_style' ? (
                                /* MASTER STYLE LAYOUT: Row (Description Left, Image Right) */
                                <div className="flex gap-6 h-full min-h-0">
                                    {/* Confirmed Description (Left 2/3) */}
                                    <div className="w-2/3 glass-panel p-6 !rounded-none border border-[var(--color-border)] flex flex-col">
                                        <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)] flex-shrink-0">
                                            <CheckCircle size={18} className="text-green-500" />
                                            <span className="text-sm font-bold uppercase">Confirmed Description</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                            <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                                                {description || "No description defined."}
                                            </p>

                                            {/* Character Modifier Display */}
                                            {characterModifier && (
                                                <div className="border-t border-[var(--color-border)] pt-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <User size={14} className="text-[var(--color-primary)]" />
                                                        <span className="text-xs font-bold text-[var(--color-primary)] uppercase">Character Modifier</span>
                                                    </div>
                                                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap pl-5">
                                                        {characterModifier}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Background Modifier Display */}
                                            {backgroundModifier && (
                                                <div className="border-t border-[var(--color-border)] pt-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <MapPin size={14} className="text-[var(--color-primary)]" />
                                                        <span className="text-xs font-bold text-[var(--color-primary)] uppercase">Background Modifier</span>
                                                    </div>
                                                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap pl-5">
                                                        {backgroundModifier}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Visual Reference Image (Right 1/3) */}
                                    <div className="w-1/3 glass-panel p-6 !rounded-none border border-[var(--color-border)] flex flex-col">
                                        <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)] flex-shrink-0">
                                            <ImageIcon size={18} className="text-[var(--color-primary)]" />
                                            <span className="text-sm font-bold uppercase">Visual Reference</span>
                                        </div>
                                        <div className="flex-1 w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden">
                                            {draftImage ? (
                                                <img src={draftImage} alt="Draft" className="absolute inset-0 w-full h-full object-contain" />
                                            ) : referenceImage ? (
                                                <img src={referenceImage} alt="Reference" className="absolute inset-0 w-full h-full object-contain opacity-80" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-center text-[var(--color-text-muted)]">
                                                    <p>No visual reference generated.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* DEFAULT LAYOUT: Column (Image Top, Description Bottom) */
                                <>
                                    {/* Visual Reference Image - TOP */}
                                    <div className="glass-panel p-6 !rounded-none border border-[var(--color-border)]">
                                        <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)]">
                                            <ImageIcon size={18} className="text-[var(--color-primary)]" />
                                            <span className="text-sm font-bold uppercase">Visual Reference</span>
                                        </div>
                                        <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                            {draftImage ? (
                                                <img src={draftImage} alt="Draft" className="absolute inset-0 w-full h-full object-contain" />
                                            ) : referenceImage ? (
                                                <img src={referenceImage} alt="Reference" className="absolute inset-0 w-full h-full object-contain opacity-80" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-center text-[var(--color-text-muted)]">
                                                    <p>No visual reference generated.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Confirmed Description */}
                                    <div className="glass-panel p-6 !rounded-none border border-[var(--color-border)]">
                                        <div className="flex items-center gap-2 mb-4 text-[var(--color-text-muted)]">
                                            <CheckCircle size={18} className="text-green-500" />
                                            <span className="text-sm font-bold uppercase">Confirmed Description</span>
                                        </div>
                                        <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                                            {description || "No description defined."}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        /* EDIT MODE */
                        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-6">
                            {/* DRAFT PREVIEW IMAGE - TOP (Assets Only) */}
                            {selectedAssetId !== 'master_style' && (
                                <div className="glass-panel p-6 !rounded-none border border-[var(--color-border)]">
                                    <div className="flex items-center justify-between mb-4 text-[var(--color-text-muted)]">
                                        <div className="flex items-center gap-2">
                                            <ImageIcon size={18} className="text-[var(--color-primary)]" />
                                            <span className="text-sm font-bold uppercase">Draft Preview</span>
                                        </div>
                                        <button
                                            onClick={handleGenerateDraft}
                                            disabled={isGeneratingDraft || !description}
                                            className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50 font-bold"
                                        >
                                            {isGeneratingDraft ? 'Generating...' : 'Generate New'}
                                        </button>
                                    </div>
                                    <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] relative overflow-hidden" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                        {isGeneratingDraft ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--color-primary)]">
                                                <Loader2 size={24} className="animate-spin" />
                                                <span className="text-xs">Generating...</span>
                                            </div>
                                        ) : draftImage ? (
                                            <img src={draftImage} alt="Draft" className="absolute inset-0 w-full h-full object-contain" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-center p-4 text-[var(--color-text-muted)]">
                                                <div>
                                                    <span className="text-xs block mb-1">No Draft Yet</span>
                                                    <span className="text-[10px] opacity-50">Click 'Generate New' to preview</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* PROMPT AND REFERENCE IMAGE - HORIZONTAL LAYOUT */}
                            <div className="flex gap-6">
                                {/* LEFT SIDE: DESCRIPTION AND MODIFIERS - 2/3 WIDTH */}
                                <div className="w-2/3 flex flex-col gap-4">
                                    {/* DESCRIPTION TEXTAREA */}
                                    <div className="glass-panel flex flex-col !rounded-none border border-[var(--color-border)]">
                                        <div className="flex items-center justify-between text-[var(--color-text-muted)] p-4 border-b border-[var(--color-border)]">
                                            <div className="flex items-center gap-2">
                                                <Type size={18} />
                                                <span className="text-sm font-bold uppercase">
                                                    {selectedAssetId === 'master_style' ? 'Master Style Description' : 'Asset Description'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={handleMagicExpand}
                                                disabled={isProcessing || !description}
                                                className="flex items-center gap-2 px-3 py-1 rounded-none bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
                                            >
                                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                AI Expander
                                            </button>
                                        </div>
                                        <div className="flex-1 p-4" style={{ minHeight: '200px' }}>
                                            <textarea
                                                className="w-full h-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-none p-4 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-lg leading-relaxed"
                                                placeholder={selectedAssetId === 'master_style'
                                                    ? "Define the global visual style (e.g. '90s anime style, cel shaded, vibrant colors, grain film effect'). This will be applied to ALL generated images."
                                                    : safeMasterStyle.description
                                                        ? "Continue describing this asset... (Master Style is already included above)"
                                                        : "Describe the appearance in detail... (e.g. 'A detective in a trench coat, smoking a cigarette')"}
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                style={{ minHeight: '150px' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Character Modifier Textarea (Master Style Only) */}
                                    {selectedAssetId === 'master_style' && (
                                        <div className="glass-panel p-4 !rounded-none border border-[var(--color-border)]">
                                            <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block flex items-center gap-2">
                                                <User size={14} />
                                                Character Modifier (Optional)
                                            </label>
                                            <textarea
                                                value={characterModifier}
                                                onChange={(e) => setCharacterModifier(e.target.value)}
                                                placeholder="Additional style for character images (e.g., 'with soft lighting and warm colors')"
                                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-3 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-sm"
                                                rows={3}
                                            />
                                        </div>
                                    )}

                                    {/* Background Modifier Textarea (Master Style Only) */}
                                    {selectedAssetId === 'master_style' && (
                                        <div className="glass-panel p-4 !rounded-none border border-[var(--color-border)]">
                                            <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block flex items-center gap-2">
                                                <MapPin size={14} />
                                                Background Modifier (Optional)
                                            </label>
                                            <textarea
                                                value={backgroundModifier}
                                                onChange={(e) => setBackgroundModifier(e.target.value)}
                                                placeholder="Additional style for background/location images (e.g., 'with dramatic lighting and shadows')"
                                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-3 text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none text-sm"
                                                rows={3}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* REFERENCE IMAGE - RIGHT 1/3 */}
                                <div className="w-1/3 glass-panel flex flex-col !rounded-none border border-[var(--color-border)]">
                                    <div className="flex items-center justify-between text-[var(--color-text-muted)] p-4 border-b border-[var(--color-border)]">
                                        <div className="flex items-center gap-2">
                                            <ImageIcon size={16} />
                                            <span className="text-sm font-bold uppercase">Reference</span>
                                        </div>
                                        {referenceImage && (
                                            <button
                                                onClick={() => { setReferenceImage(null); setDraftImage(null); }}
                                                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded transition-all"
                                            >
                                                <RotateCcw size={12} />
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 relative border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors bg-[var(--color-bg)] overflow-hidden group">
                                        {referenceImage ? (
                                            <img src={referenceImage} alt="Reference" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
                                                <Upload size={24} className="mb-2" />
                                                <span className="text-xs">Upload</span>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* MASTER STYLE INFO (MASTER ONLY) */}
                            {selectedAssetId === 'master_style' && (
                                <div className="glass-panel p-4 !rounded-none bg-[var(--color-surface-highlight)] border border-[var(--color-border)]">
                                    <h4 className="text-[var(--color-primary)] font-bold flex items-center gap-2 mb-2">
                                        <Wand2 size={16} />
                                        Global Effect
                                    </h4>
                                    <p className="text-sm text-gray-300">
                                        This Master Style will be automatically added to the beginning of every character and location prompt to ensure visual consistency across your entire project.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* NAVIGATION */}
            <div className="flex justify-between pt-0">
                <div className="flex flex-col gap-2">
                    <button
                        onClick={prevStep}
                        className="flex items-center gap-2 px-6 py-3 rounded-none hover:bg-[var(--color-surface-highlight)] text-[var(--color-text-muted)] hover:text-white transition-all"
                    >
                        <ArrowLeft size={20} />
                        Back
                    </button>

                    {/* Debug Toggle */}
                    <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface-highlight)] transition-all border border-[var(--color-border)] rounded-none"
                    >
                        <Bug size={16} />
                        {showDebug ? 'Hide Debug' : 'Show Debug'}
                    </button>
                </div>

                <button
                    onClick={() => { nextStep(); navigate('/step/3'); }}
                    disabled={!isSeriesComplete}
                    className={`flex items-center gap-2 px-8 py-3 rounded-none font-bold transition-all ${isSeriesComplete
                        ? 'bg-[var(--color-primary)] text-black hover:opacity-90 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.4)]'
                        : 'bg-[var(--color-surface)] text-gray-500 cursor-not-allowed'
                        }`}
                >
                    Next Step
                    <ArrowRight size={20} />
                </button>
            </div>

            {/* DEBUG INFO POPUP */}
            {
                showDebug && (
                    <div className="fixed top-1/2 left-[calc(33.333%+2rem)] transform -translate-y-1/2 bg-black/95 border border-[var(--color-primary)] p-4 text-xs font-mono text-green-400 z-50 max-h-[80vh] overflow-y-auto shadow-2xl w-[500px]">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 mb-4">
                                <h3 className="text-[var(--color-primary)] font-bold text-sm">Debug Info</h3>
                                <button
                                    onClick={() => setShowDebug(false)}
                                    className="text-[var(--color-text-muted)] hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-2">State Status</h4>
                                <p>Hydrated: {isHydrated ? 'Yes' : 'No'}</p>
                                <p>Asset ID: {selectedAssetId}</p>
                                <p>Asset Type: {selectedAssetType}</p>
                                <p>Editing: {isEditing ? 'Yes' : 'No'}</p>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-2">Data Counts</h4>
                                <p>Characters: {safeCharacters.length}</p>
                                <p>Locations: {safeSeriesLocations.length}</p>
                                <p>Ep. Characters: {safeEpisodeCharacters.length}</p>
                                <p>Ep. Locations: {safeEpisodeLocations.length}</p>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-2">Current Definition</h4>
                                <pre className="whitespace-pre-wrap break-all text-[10px] text-gray-400 bg-black/50 p-2 rounded border border-[var(--color-border)] max-h-[300px] overflow-y-auto">
                                    {JSON.stringify(safeAssetDefinitions[selectedAssetId] || "No definition", null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Image Crop Modal */}
            {
                showCropModal && imageToCrop && (
                    <ImageCropModal
                        imageSrc={imageToCrop}
                        aspectRatio={aspectRatio || '16:9'}
                        onConfirm={handleCropConfirm}
                        onCancel={handleCropCancel}
                    />
                )
            }
        </div >
    );
};
