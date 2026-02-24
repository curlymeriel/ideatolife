import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Image as ImageIcon, Upload, Type, Move, ZoomIn, Download, Wand2, Sparkles, Layers, ImagePlus, X } from 'lucide-react';
import html2canvas from 'html2canvas';

import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { getResolution } from '../utils/aspectRatioUtils';
import { UnifiedStudio } from '../components/UnifiedStudio/UnifiedStudio';
import { ReferenceSelectorModal } from '../components/ReferenceSelectorModal';

export const Step5_Thumbnail: React.FC = () => {
    const {
        id: projectId,
        episodeName, seriesName,
        setThumbnail, nextStep, prevStep,
        thumbnailSettings, setThumbnailSettings,
        isHydrated,
        saveProject,
        aspectRatio,
        script,
        assetDefinitions
    } = useWorkflowStore() as any;
    const navigate = useNavigate();

    const targetResolution = getResolution(aspectRatio);

    // Ref for the content to be captured (Dynamic Resolution, no scale)
    const contentRef = useRef<HTMLDivElement>(null);

    // Ref for the container wrapper to calculate scale
    const containerRef = useRef<HTMLDivElement>(null);
    const [previewScale, setPreviewScale] = useState(1);

    // Local state initialized from store (or defaults if not yet hydrated)
    const [selectedImage, setSelectedImage] = useState<string | null>(null); // Don't use thumbnailUrl to avoid confusion
    const [isSaving, setIsSaving] = useState(false);
    const [showCutSelector, setShowCutSelector] = useState(false);

    // Resolved assets for ReferenceSelectorModal (IDB URL safe)
    const [resolvedProjectAssets, setResolvedProjectAssets] = useState<Array<{ id: string; name: string; url: string; type: string }>>([]);
    const [resolvedCandidates, setResolvedCandidates] = useState<Array<{ id: string; url: string; index: number }>>([]);

    // Mode state
    const [mode, setMode] = useState<'framing' | 'ai-gen'>(thumbnailSettings?.mode || 'framing');

    // Style Reference & AI state
    const [aiPrompt, setAiPrompt] = useState(thumbnailSettings?.aiPrompt || '');
    const [showStudio, setShowStudio] = useState(false);

    // Initialize state from store settings or defaults
    const [frameImage, setFrameImage] = useState<string>(thumbnailSettings?.frameImage || '/frame_bg.svg');
    const [resolvedFrameImage, setResolvedFrameImage] = useState<string>(thumbnailSettings?.frameImage || '/frame_bg.svg');
    const [showFrame, setShowFrame] = useState<boolean>(thumbnailSettings?.showFrame ?? true);
    const [titleFont, setTitleFont] = useState(thumbnailSettings?.fontFamily || 'Inter');
    const [customTitle, setCustomTitle] = useState(thumbnailSettings?.episodeTitle || episodeName || '');

    // Text Background State
    const [textBgShape, setTextBgShape] = useState<'none' | 'rectangle' | 'rounded' | 'full-width'>(thumbnailSettings?.textBgShape || 'none');
    const [textBgColor, setTextBgColor] = useState(thumbnailSettings?.textBgColor || '#000000');
    const [textBgOpacity, setTextBgOpacity] = useState(thumbnailSettings?.textBgOpacity ?? 0.5);


    // Image Transform State
    const [scale, setScale] = useState(thumbnailSettings?.scale || 1);
    const [position, setPosition] = useState(thumbnailSettings?.imagePosition || { x: 0, y: 0 });

    // Text Transform State
    const [textPosition, setTextPosition] = useState(thumbnailSettings?.textPosition || { x: 0, y: 0 });
    const [titleSize, setTitleSize] = useState(thumbnailSettings?.titleSize || 60);
    const [seriesTitle, setSeriesTitle] = useState(thumbnailSettings?.seriesTitle || seriesName || '');
    const [seriesTitleSize, setSeriesTitleSize] = useState(thumbnailSettings?.seriesTitleSize || 36);
    const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(thumbnailSettings?.textAlign || 'left');
    const [textColor, setTextColor] = useState(thumbnailSettings?.textColor || '#ffffff');

    // Font options (Google Fonts)
    const FONTS = [
        { name: 'Inter', label: 'Modern Sans' },
        { name: 'Oswald', label: 'Bold Condensed' },
        { name: 'Playfair Display', label: 'Elegant Serif' },
        { name: 'Roboto Slab', label: 'Bold Slab' },
        { name: 'Dancing Script', label: 'Handwritten' },
        { name: 'Cinzel', label: 'Cinematic' },
    ];

    // Load fonts dynamically
    useEffect(() => {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Oswald:wght@700&family=Playfair+Display:wght@700&family=Roboto+Slab:wght@700&family=Dancing+Script:wght@700&family=Cinzel:wght@700&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => {
            document.head.removeChild(link);
        };
    }, []);

    // CRITICAL: Reset state when project changes to prevent showing old project data
    useEffect(() => {
        const syncFromStore = async () => {
            console.log(`[Step5] Project changed to ${projectId} - resetting state`);
            setSelectedImage(null);
            setScale(1);
            setPosition({ x: 0, y: 0 });
            setTextPosition({ x: 0, y: 0 });

            const store = useWorkflowStore.getState();

            if (store.thumbnailUrl) {
                const resolved = await resolveUrl(store.thumbnailUrl);
                setSelectedImage(resolved || null);
            }

            if (store.thumbnailSettings) {
                const settings = store.thumbnailSettings;
                if (settings.mode) setMode(settings.mode);
                if (settings.aiPrompt) setAiPrompt(settings.aiPrompt);
                if (settings.scale !== undefined) setScale(settings.scale);
                if (settings.imagePosition) setPosition(settings.imagePosition);
                if (settings.textPosition) setTextPosition(settings.textPosition);
                if (settings.titleSize) setTitleSize(settings.titleSize);
                if (settings.seriesTitle) setSeriesTitle(settings.seriesTitle);
                if (settings.seriesTitleSize) setSeriesTitleSize(settings.seriesTitleSize);
                if (settings.textAlign) setTextAlign(settings.textAlign);
                if (settings.textColor) setTextColor(settings.textColor);
                if (settings.fontFamily) setTitleFont(settings.fontFamily);
                if (settings.frameImage) setFrameImage(settings.frameImage);
                if (settings.showFrame !== undefined) setShowFrame(settings.showFrame);
                if (settings.textBgShape) setTextBgShape(settings.textBgShape);
                if (settings.textBgColor) setTextBgColor(settings.textBgColor);
                if (settings.textBgOpacity !== undefined) setTextBgOpacity(settings.textBgOpacity);
            }
        };

        syncFromStore();
    }, [projectId]);

    // Load existing thumbnail on mount
    useEffect(() => {
        const initFromStore = async () => {
            const store = useWorkflowStore.getState();
            if (store.thumbnailUrl && !selectedImage) {
                const resolved = await resolveUrl(store.thumbnailUrl);
                setSelectedImage(resolved || null);
            }
        };
        initFromStore();
    }, []);

    // Resolve projectAssets & pastCuts for ReferenceSelectorModal (IDB-safe)
    useEffect(() => {
        if (!showCutSelector) return;
        const resolveAll = async () => {
            // 1. Project Assets from assetDefinitions
            if (assetDefinitions) {
                const rawAssets = (Object.values(assetDefinitions) as any[])
                    .filter((a: any) => (a.type === 'character' || a.type === 'location' || a.type === 'prop') && (a.masterImage || a.draftImage || a.referenceImage))
                    .map((a: any) => ({ id: a.id, name: a.name, type: a.type, url: a.masterImage || a.draftImage || a.referenceImage }));

                const resolved = await Promise.all(rawAssets.map(async (a: any) => {
                    let url = a.url;
                    if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                    return { ...a, url };
                }));
                setResolvedProjectAssets(resolved);
            }

            // 2. Past Cuts from Step 3
            if (script && Array.isArray(script)) {
                const cuts = (script as any[])
                    .filter((c: any) => c.finalImageUrl)
                    .map((c: any, idx: number) => ({ id: String(c.id), url: c.finalImageUrl, index: idx + 1 }));

                const resolved = await Promise.all(cuts.map(async (c: any) => {
                    let url = c.url;
                    if (isIdbUrl(url)) url = await resolveUrl(url) || url;
                    return { ...c, url };
                }));
                setResolvedCandidates(resolved);
            }
        };
        resolveAll();
    }, [showCutSelector, assetDefinitions, script]);

    // Sync with store when it changes
    useEffect(() => {
        if (episodeName) setCustomTitle(episodeName);
        if (seriesName) setSeriesTitle(seriesName);
    }, [episodeName, seriesName]);

    // Sync local state with store when hydrated
    useEffect(() => {
        if (isHydrated && thumbnailSettings) {
            setMode(thumbnailSettings.mode || 'framing');
            setAiPrompt(thumbnailSettings.aiPrompt || '');
            setScale(thumbnailSettings.scale);
            setPosition(thumbnailSettings.imagePosition);
            setTextPosition(thumbnailSettings.textPosition);
            setTitleSize(thumbnailSettings.titleSize);
            if (thumbnailSettings.seriesTitle) setSeriesTitle(thumbnailSettings.seriesTitle);
            if (thumbnailSettings.seriesTitleSize) setSeriesTitleSize(thumbnailSettings.seriesTitleSize);
            if (thumbnailSettings.textAlign) setTextAlign(thumbnailSettings.textAlign);
            setTextColor(thumbnailSettings.textColor);
            setTitleFont(thumbnailSettings.fontFamily);
            setFrameImage(thumbnailSettings.frameImage);
            if (thumbnailSettings.showFrame !== undefined) setShowFrame(thumbnailSettings.showFrame);
            if (thumbnailSettings.textBgShape) setTextBgShape(thumbnailSettings.textBgShape);
            if (thumbnailSettings.textBgColor) setTextBgColor(thumbnailSettings.textBgColor);
            if (thumbnailSettings.textBgOpacity !== undefined) setTextBgOpacity(thumbnailSettings.textBgOpacity);
        }
    }, [isHydrated, thumbnailSettings]);

    // Resolve Frame Image URL
    useEffect(() => {
        if (!frameImage) return;
        if (isIdbUrl(frameImage)) {
            resolveUrl(frameImage).then(setResolvedFrameImage);
        } else {
            setResolvedFrameImage(frameImage);
        }
    }, [frameImage]);

    // Auto-save settings to store when they change
    useEffect(() => {
        if (!isHydrated) return;

        const timer = setTimeout(() => {
            setThumbnailSettings({
                mode,
                scale,
                imagePosition: position,
                textPosition,
                titleSize,
                episodeTitle: customTitle,
                seriesTitle,
                seriesTitleSize,
                textAlign,
                textColor,
                fontFamily: titleFont,
                frameImage,
                showFrame,
                textBgShape,
                textBgColor,
                textBgOpacity
            });
        }, 500); // Debounce save

        return () => clearTimeout(timer);
    }, [mode, scale, position, textPosition, titleSize, seriesTitle, seriesTitleSize, textAlign, textColor, titleFont, frameImage, showFrame, textBgShape, textBgColor, textBgOpacity, customTitle, setThumbnailSettings, isHydrated]);


    // Calculate scale factor on resize (Dynamic based on targetResolution)
    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                // Subtract padding (p-12 = 48px * 2 = 96px) to ensure it fits inside the padded area
                const availableWidth = width - 96;
                const availableHeight = height - 96;

                const scaleX = availableWidth / targetResolution.width;
                const scaleY = availableHeight / targetResolution.height;
                // Use the smaller scale to ensure it fits entirely
                setPreviewScale(Math.min(scaleX, scaleY));
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [targetResolution]); // Re-calculate when resolution changes


    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                setSelectedImage(base64); // Show in UI immediately

                // Save to IDB and store the reference
                const { saveToIdb } = await import('../utils/imageStorage');
                const idbUrl = await saveToIdb('images', `${projectId}-thumbnail-bg`, base64);
                setThumbnail(idbUrl);

                // Reset transform
                setScale(1);
                setPosition({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                // Save to IDB immediately using standardized storage
                const { saveToIdb } = await import('../utils/imageStorage');
                const idbUrl = await saveToIdb('images', `${projectId}-thumbnail-frame`, base64);

                setFrameImage(idbUrl);
                // Also update settings in store immediately
                setThumbnailSettings({
                    ...thumbnailSettings,
                    frameImage: idbUrl
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveThumbnail = async () => {
        if (!contentRef.current) return;

        setIsSaving(true);
        console.log('[Step5] Starting save. Target Resolution:', targetResolution);
        console.log('[Step5] Content Ref:', contentRef.current);

        try {
            // 1. Wait for all fonts to be fully loaded
            await document.fonts.ready;

            // 2. Additional delay to ensure rendering
            await new Promise(resolve => setTimeout(resolve, 300));

            // 3. Capture the unscaled content div at Target Resolution
            const canvas = await html2canvas(contentRef.current, {
                scale: 1,
                width: targetResolution.width,
                height: targetResolution.height,
                backgroundColor: '#000000',
                logging: false,
                useCORS: true,
                allowTaint: true,
                foreignObjectRendering: false,
                imageTimeout: 0,
            });

            // 4. Download: Full-res PNG (Use Blob for better large file support)
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.error('Canvas to Blob failed');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                downloadLink.href = url;

                // Sanitize filename
                const safeTitle = (customTitle || 'Episode').replace(/[^a-z0-9]/gi, '_');
                const safeSeries = (seriesTitle || 'Series').replace(/[^a-z0-9]/gi, '_');
                downloadLink.download = `Thumbnail_${safeTitle}_${safeSeries}.jpeg`;

                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(url);
            }, 'image/jpeg', 0.92);

            // 5. Save full-resolution thumbnail to SEPARATE IndexedDB key (Need DataURL for storage)
            const fullResDataUrl = canvas.toDataURL('image/jpeg', 0.92);

            // 5. Save full-resolution thumbnail using standardized imageStorage
            const { saveToIdb } = await import('../utils/imageStorage');
            // Use 'images' type and include projectId in key
            const thumbnailKey = `thumbnail-${projectId}`;

            // This handles the correct "media-" prefix and URL generation
            const idbUrl = await saveToIdb('images', thumbnailKey, fullResDataUrl);
            console.log(`[Step5] Saved full-res thumbnail: ${idbUrl}`);

            // 6. Store the standardized IDB URL
            // Append timestamp to force reload if needed, though URL changes usually handle it
            setThumbnail(`${idbUrl}?t=${Date.now()}`);

            // 7. Also create a small preview for Dashboard (in-store, compressed)
            // This is tiny and safe to keep in the main store
            const previewCanvas = document.createElement('canvas');
            // Calculate preview height maintaining aspect ratio based on width 320
            const previewWidth = 320;
            const previewHeight = Math.round(320 * (targetResolution.height / targetResolution.width));

            previewCanvas.width = previewWidth;
            previewCanvas.height = previewHeight;
            const ctx = previewCanvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(canvas, 0, 0, previewWidth, previewHeight);
                const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.6);
                // Save preview as thumbnailPreview for Dashboard cards
                useWorkflowStore.setState({ thumbnailPreview: previewUrl } as any);
            }
            previewCanvas.width = 0;
            previewCanvas.height = 0;

            // 8. Save project to update savedProjects metadata
            await saveProject();
            console.log('[Step5] Saved thumbnail reference and updated project metadata');

            // 9. Clear canvas memory
            canvas.width = 0;
            canvas.height = 0;

            // 10. User Feedback
            alert('✅ Thumbnail saved successfully!\n\n📥 Downloaded to your computer\n💾 Saved to project (full quality)');

        } catch (error: any) {
            console.error('Error saving thumbnail:', error);
            // Detailed error logging
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
            alert(`Failed to save thumbnail. Error: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };



    const ThumbnailContent = ({ forCapture = false }: { forCapture?: boolean }) => {
        // Convert hex to rgb for rgba application
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
        };

        const bgRgba = `rgba(${hexToRgb(textBgColor)}, ${textBgOpacity})`;

        if (mode === 'ai-gen') {
            return (
                <div className="w-full h-full bg-[#050505] overflow-hidden relative flex items-center justify-center">
                    {selectedImage ? (
                        <img
                            src={selectedImage}
                            alt="AI Draft"
                            className="w-full h-full object-contain"
                            crossOrigin="anonymous"
                        />
                    ) : (
                        <div className="text-center p-12 opacity-10">
                            <Sparkles size={120} className="mx-auto mb-6" />
                            <p className="text-2xl font-bold tracking-[0.2em] uppercase">Synthesis Required</p>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="w-full h-full bg-black overflow-hidden relative" id="thumbnail-canvas">
                {/* LAYER 1: CUT IMAGE (BOTTOM) - Z-0 */}
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                    {
                        selectedImage ? (
                            <img
                                src={selectedImage}
                                alt="Cut"
                                className="max-w-none"
                                style={{
                                    transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                                    transition: forCapture ? 'none' : 'transform 0.1s ease-out'
                                }}
                                crossOrigin="anonymous"
                            />
                        ) : (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center text-gray-600 cursor-pointer hover:bg-white/5 hover:text-gray-400 transition-colors"
                                onClick={() => setShowCutSelector(true)}
                            >
                                <ImageIcon size={100} className="mb-4 opacity-50" />
                                <span className="text-4xl">이미지를 선택해주세요</span>
                                <span className="text-sm mt-4 text-gray-500">클릭하여 불러오기</span>
                            </div>
                        )}
                </div>

                {/* LAYER 2: FRAME OVERLAY (MIDDLE) - Z-10 */}
                {showFrame && (
                    <div className="absolute inset-0 z-10 pointer-events-none">
                        <img
                            src={resolvedFrameImage}
                            alt="Frame Overlay"
                            className="w-full h-full object-fill"
                            crossOrigin="anonymous"
                        />
                    </div>
                )}

                {/* LAYER 3: TEXT (TOP) - Z-20 */}
                <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-[5%] pb-[8%]">
                    <div
                        className="flex flex-col gap-2 px-12 relative"
                        style={{
                            transform: `translate(${textPosition.x}px, ${textPosition.y}px)`,
                            transition: forCapture ? 'none' : 'transform 0.1s ease-out',
                            textAlign: textAlign
                        }}
                    >
                        <div
                            className="relative z-0"
                            style={{
                                backgroundColor: textBgShape !== 'none' ? bgRgba : 'transparent',
                                padding: textBgShape !== 'none' ? (textBgShape === 'full-width' ? '32px 100vw' : '32px 48px') : '0',
                                marginLeft: textBgShape === 'full-width' ? '-100vw' : '0',
                                marginRight: textBgShape === 'full-width' ? '-100vw' : '0',
                                borderRadius: textBgShape === 'rounded' ? '32px' : '0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                alignItems: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
                            }}
                        >
                            {/* Episode Title (Top) */}
                            <h1
                                style={{
                                    fontFamily: `${titleFont}, Arial, sans-serif`,
                                    fontSize: `${titleSize}px`,
                                    lineHeight: 1.1,
                                    color: textColor,
                                    textShadow: '0 4px 20px rgba(0,0,0,0.7)',
                                    fontWeight: 'bold',
                                    margin: 0,
                                }}
                            >
                                {customTitle}
                            </h1>
                            {/* Series Title (Bottom) */}
                            {seriesTitle && (
                                <p
                                    style={{
                                        fontFamily: `${titleFont}, Arial, sans-serif`,
                                        fontSize: `${seriesTitleSize}px`,
                                        lineHeight: 1.1,
                                        color: textColor,
                                        textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                                        opacity: 0.85,
                                        margin: 0,
                                    }}
                                >
                                    {seriesTitle}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-140px)] relative">
            <div className="flex gap-4 h-full overflow-hidden">
                {/* LEFT PANEL: CONTROLS */}
                <div className="w-[340px] flex-shrink-0 glass-panel flex flex-col h-full overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Layers size={20} className="text-[var(--color-primary)]" />
                                Thumbnail
                            </h2>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setThumbnailSettings({
                                        ...thumbnailSettings,
                                        scale: 1,
                                        imagePosition: { x: 0, y: 0 },
                                        textPosition: { x: 0, y: 0 },
                                        showFrame: true,
                                        textBgShape: 'none',
                                    });
                                    setScale(1);
                                    setPosition({ x: 0, y: 0 });
                                    setTextPosition({ x: 0, y: 0 });
                                    setShowFrame(true);
                                    setTextBgShape('none');
                                }}
                                className="p-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                title="Clear Settings"
                            >
                                <RefreshCw size={14} />
                            </button>
                            <button
                                onClick={handleSaveThumbnail}
                                disabled={!selectedImage || isSaving}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-[var(--color-primary)] shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.2)] ${selectedImage
                                    ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-black'
                                    : 'text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                                    }`}
                            >
                                <Download size={14} />
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
                        {/* 0. Mode Selector */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Generation Mode</label>
                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/5 shadow-inner">
                                <button
                                    onClick={() => setMode('framing')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${mode === 'framing' ? 'bg-[var(--color-primary)] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <ImageIcon size={14} /> Framing
                                </button>
                                <button
                                    onClick={() => setMode('ai-gen')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${mode === 'ai-gen' ? 'bg-[var(--color-primary)] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <Sparkles size={14} /> AI Synthesis
                                </button>
                            </div>
                        </div>

                        {/* 1. Image Source (Framing Mode) */}
                        {mode === 'framing' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <ImageIcon size={14} /> 1. Background Source
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-white/5 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 transition-all rounded-2xl group">
                                        <Upload size={24} className="mb-2 text-gray-500 group-hover:text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-white lowercase">upload file</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </label>

                                    <button
                                        onClick={() => setShowCutSelector(true)}
                                        className="flex flex-col items-center justify-center p-5 border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all rounded-2xl group"
                                    >
                                        <RefreshCw size={24} className="mb-2 text-gray-500 group-hover:text-[var(--color-primary)] group-hover:rotate-180 transition-all duration-500" />
                                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-white lowercase">from library</span>
                                    </button>
                                </div>

                                {/* 2. Frame Overlay */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <Layers size={14} /> 2. Frame Overlay
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase group-hover:text-white transition-colors">Show Frame</span>
                                            <input
                                                type="checkbox"
                                                checked={showFrame}
                                                onChange={(e) => setShowFrame(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded bg-black/40 border-white/20 checked:bg-[var(--color-primary)] checked:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/50 focus:ring-offset-black transition-all cursor-pointer"
                                            />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-white/5 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all rounded-2xl group">
                                            <Upload size={20} className="mb-2 text-gray-500 group-hover:text-yellow-400 group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-white lowercase">upload frame</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={handleFrameUpload} />
                                        </label>

                                        <button
                                            onClick={() => setFrameImage('/frame_bg.svg')}
                                            className="flex flex-col items-center justify-center p-4 border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all rounded-2xl group"
                                        >
                                            <RefreshCw size={20} className="mb-2 text-gray-500 group-hover:text-yellow-400 group-hover:rotate-180 transition-all duration-500" />
                                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-white lowercase">reset default</span>
                                        </button>
                                    </div>
                                    {resolvedFrameImage && resolvedFrameImage !== '/frame_bg.svg' && (
                                        <div className="relative aspect-video rounded-xl overflow-hidden border border-yellow-500/30 bg-black/40">
                                            <img src={resolvedFrameImage} alt="Current Frame" className="w-full h-full object-contain" />
                                            <div className="absolute top-2 right-2">
                                                <button
                                                    onClick={() => setFrameImage('/frame_bg.svg')}
                                                    className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-500 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* AI Generation (AI Gen Mode) */}
                        {mode === 'ai-gen' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col items-center justify-center">
                                <div className="text-center space-y-4">
                                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-4 shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.3)]">
                                        <ImagePlus size={40} />
                                    </div>
                                    <h3 className="text-2xl font-bold tracking-tight">AI Thumbnail Studio</h3>
                                    <p className="text-sm text-gray-400 max-w-[280px]">
                                        Create YouTube-optimized thumbnails using the Strategic Analysis Guide, Safe Zone boundaries, and automated hook copies.
                                    </p>
                                    <button
                                        onClick={() => setShowStudio(true)}
                                        className="mt-6 w-full py-4 bg-[var(--color-primary)] hover:opacity-90 text-black rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-[var(--color-primary)]/20 active:scale-[0.97]"
                                    >
                                        <Wand2 size={18} />
                                        Open Studio
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Transform Controls */}
                        {mode === 'framing' && selectedImage && (
                            <div className="space-y-6 pt-4 border-t border-white/5">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Move size={14} /> 3. Background Position
                                </label>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-5">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                                            <span className="flex items-center gap-1"><ZoomIn size={12} /> Scale factor</span>
                                            <span>{Math.round(scale * 100)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0.5" max="3" step="0.1"
                                            value={scale}
                                            onChange={(e) => setScale(parseFloat(e.target.value))}
                                            className="w-full accent-[var(--color-primary)] opacity-80 hover:opacity-100 transition-opacity"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                                                <span>Offset X</span>
                                                <span>{position.x}px</span>
                                            </div>
                                            <input
                                                type="range" min="-500" max="500" step="10"
                                                value={position.x}
                                                onChange={(e) => setPosition({ ...position, x: parseInt(e.target.value) })}
                                                className="w-full accent-[var(--color-primary)] opacity-80 hover:opacity-100 transition-opacity"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                                                <span>Offset Y</span>
                                                <span>{position.y}px</span>
                                            </div>
                                            <input
                                                type="range" min="-500" max="500" step="10"
                                                value={position.y}
                                                onChange={(e) => setPosition({ ...position, y: parseInt(e.target.value) })}
                                                className="w-full accent-[var(--color-primary)] opacity-80 hover:opacity-100 transition-opacity"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. Text & Font */}
                        {mode === 'framing' && (
                            <div className="space-y-6 pt-4 border-t border-white/5 pb-10">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Type size={14} /> 4. Typography Overlay
                                </label>

                                <div className="space-y-4">
                                    {/* Episode Title Input */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">Episode Title</label>
                                        <input
                                            type="text"
                                            value={customTitle}
                                            onChange={(e) => setCustomTitle(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white font-bold focus:border-white/20 outline-none shadow-inner"
                                        />
                                    </div>

                                    {/* Series Title Input */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">Series Title</label>
                                        <input
                                            type="text"
                                            value={seriesTitle}
                                            onChange={(e) => setSeriesTitle(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/20 outline-none shadow-inner"
                                        />
                                    </div>

                                    {/* Font & Alignment Row */}
                                    <div className="flex gap-3">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">Font</label>
                                            <select
                                                value={titleFont}
                                                onChange={(e) => setTitleFont(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-white/20 outline-none shadow-inner cursor-pointer"
                                            >
                                                {FONTS.map(f => (
                                                    <option key={f.name} value={f.name}>{f.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-24 space-y-2">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">Align</label>
                                            <div className="flex bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                                                <button
                                                    onClick={() => setTextAlign('left')}
                                                    className={`flex-1 py-2.5 text-[10px] font-bold transition-colors ${textAlign === 'left' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                                >L</button>
                                                <button
                                                    onClick={() => setTextAlign('center')}
                                                    className={`flex-1 py-2.5 text-[10px] font-bold transition-colors border-x border-white/10 ${textAlign === 'center' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                                >C</button>
                                                <button
                                                    onClick={() => setTextAlign('right')}
                                                    className={`flex-1 py-2.5 text-[10px] font-bold transition-colors ${textAlign === 'right' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                                >R</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Text Background Controls */}
                                    <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Text Background</span>
                                        </div>

                                        <div className="space-y-4 pt-2">
                                            {/* Shape Selector */}
                                            <div className="flex bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                                                <button
                                                    onClick={() => setTextBgShape('none')}
                                                    className={`flex-1 py-2 text-[10px] font-bold transition-colors ${textBgShape === 'none' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-gray-300'}`}
                                                >None</button>
                                                <button
                                                    onClick={() => setTextBgShape('rectangle')}
                                                    className={`flex-1 py-2 text-[10px] font-bold transition-colors border-x border-white/10 ${textBgShape === 'rectangle' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-gray-300'}`}
                                                >Rect</button>
                                                <button
                                                    onClick={() => setTextBgShape('rounded')}
                                                    className={`flex-1 py-2 text-[10px] font-bold transition-colors border-r border-white/10 ${textBgShape === 'rounded' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-gray-300'}`}
                                                >Round</button>
                                                <button
                                                    onClick={() => setTextBgShape('full-width')}
                                                    className={`flex-1 py-2 text-[10px] font-bold transition-colors ${textBgShape === 'full-width' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-gray-300'}`}
                                                >Full</button>
                                            </div>

                                            {/* Color and Opacity */}
                                            {textBgShape !== 'none' && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Bg Color</div>
                                                        <input
                                                            type="color"
                                                            value={textBgColor}
                                                            onChange={(e) => setTextBgColor(e.target.value)}
                                                            className="w-full h-8 p-0 border border-white/10 rounded-md cursor-pointer bg-black/40"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Opacity <span className="text-gray-600">{Math.round(textBgOpacity * 100)}%</span></div>
                                                        <input
                                                            type="range" min="0" max="1" step="0.05"
                                                            value={textBgOpacity}
                                                            onChange={(e) => setTextBgOpacity(parseFloat(e.target.value))}
                                                            className="w-full h-8 accent-white/30"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Size & Position Controls */}
                                    <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase">Size & Position</span>
                                            <input
                                                type="color"
                                                value={textColor}
                                                onChange={(e) => setTextColor(e.target.value)}
                                                className="w-6 h-6 p-0 border-0 rounded-md cursor-pointer bg-transparent"
                                            />
                                        </div>
                                        <div className="space-y-4 pt-2">
                                            {/* Position Controls */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">X Offset</div>
                                                    <input
                                                        type="range" min="-2000" max="2000" step="10"
                                                        value={textPosition.x}
                                                        onChange={(e) => setTextPosition({ ...textPosition, x: parseInt(e.target.value) })}
                                                        className="w-full accent-white/30"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Y Offset</div>
                                                    <input
                                                        type="range" min="-2000" max="2000" step="10"
                                                        value={textPosition.y}
                                                        onChange={(e) => setTextPosition({ ...textPosition, y: parseInt(e.target.value) })}
                                                        className="w-full accent-white/30"
                                                    />
                                                </div>
                                            </div>
                                            {/* Size Controls */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Episode Size <span className="text-gray-600">{titleSize}px</span></div>
                                                    <input
                                                        type="range" min="20" max="150" step="1"
                                                        value={titleSize}
                                                        onChange={(e) => setTitleSize(parseInt(e.target.value))}
                                                        className="w-full accent-white/30"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Series Size <span className="text-gray-600">{seriesTitleSize}px</span></div>
                                                    <input
                                                        type="range" min="16" max="100" step="1"
                                                        value={seriesTitleSize}
                                                        onChange={(e) => setSeriesTitleSize(parseInt(e.target.value))}
                                                        className="w-full accent-white/30"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: PREVIEW */}
                <div className="flex-1 min-w-0 glass-panel flex flex-col overflow-hidden bg-[#0a0a0b] relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)] pointer-events-none" />

                    {/* HIDDEN ORIGINAL - For html2canvas Capture Only */}
                    <div
                        ref={contentRef}
                        className="fixed top-0 left-[-9999px] pointer-events-none"
                        style={{ width: `${targetResolution.width}px`, height: `${targetResolution.height}px` }}
                    >
                        <ThumbnailContent forCapture={true} />
                    </div>

                    {/* VISIBLE PREVIEW - Scaled Copy */}
                    <div
                        ref={containerRef}
                        className="flex-1 relative w-full overflow-hidden flex items-center justify-center p-12"
                    >
                        <div
                            style={{
                                width: `${targetResolution.width}px`,
                                height: `${targetResolution.height}px`,
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: `translate(-50%, -50%) scale(${previewScale})`,
                                transformOrigin: 'center center',
                                boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}
                        >
                            <ThumbnailContent forCapture={false} />
                        </div>

                        {/* Layout Indicator */}
                        {/* Layout Indicator */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-2.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {mode === 'framing' ? (
                                <>
                                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" /> BG LAYER</div>
                                    <div className="w-px h-3 bg-white/10" />
                                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]" /> FRAME OVERLAY</div>
                                    <div className="w-px h-3 bg-white/10" />
                                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" /> TEXT OVERLAY</div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Sparkles size={12} className="text-[var(--color-primary)]" />
                                    <span className="text-[var(--color-primary)]">AI SYNTHESIZED IMAGE</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* NAVIGATION */}
            <div className="absolute bottom-6 left-[360px] z-50">
                <button
                    onClick={() => { prevStep(); navigate('/step/4'); }}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-gray-400 hover:text-white transition-all shadow-lg backdrop-blur-md"
                >
                    디자인으로 돌아가기
                </button>
            </div>

            <div className="absolute bottom-6 right-6 z-50">
                <button
                    onClick={() => { nextStep(); navigate('/step/6'); }}
                    disabled={!selectedImage}
                    className={`flex items-center gap-2 px-10 py-4 rounded-xl font-bold transition-all shadow-2xl ${selectedImage
                        ? 'bg-[var(--color-primary)] text-black hover:opacity-90 shadow-[0_10px_40px_rgba(var(--color-primary-rgb),0.3)] hover:-translate-y-0.5 active:translate-y-0'
                        : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
                        }`}
                >
                    에피소드 확정
                    <ArrowRight size={20} />
                </button>
            </div>

            {/* CUT SELECTOR MODAL - ReferenceSelectorModal 재사용 */}
            <ReferenceSelectorModal
                isOpen={showCutSelector}
                onClose={() => setShowCutSelector(false)}
                onSelect={(asset) => {
                    setSelectedImage(asset.url);
                    setShowCutSelector(false);
                }}
                projectAssets={resolvedProjectAssets}
                pastCuts={resolvedCandidates}
                drafts={[]}
                defaultTab="assets"
                title="기준 이미지 선택"
            />

            {/* AI Thumbnail Studio Modal */}
            {showStudio && (
                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center">
                    <div className="w-full h-full max-w-[1920px] max-h-[1080px] bg-[#0a0a0b] relative flex flex-col">
                        <UnifiedStudio
                            isOpen={showStudio}
                            apiKey={useWorkflowStore.getState().apiKeys?.gemini || ''}
                            config={{
                                mode: 'thumbnail',
                                characters: [],
                                initialPrompt: aiPrompt,
                                initialUrl: selectedImage || undefined,
                                strategyContext: {},
                                onSave: async (result: any) => {
                                    const url = result.url;
                                    const finalPrompt = result.prompt;
                                    if (finalPrompt) setAiPrompt(finalPrompt);
                                    if (url) {
                                        setThumbnail(url);
                                        let resolvedUrl = url;
                                        if (url.startsWith('idb://')) {
                                            try {
                                                resolvedUrl = await resolveUrl(url) || url;
                                            } catch (e) {
                                                console.error('[Step5] Failed to resolve:', e);
                                            }
                                        }
                                        setSelectedImage(resolvedUrl);
                                    }
                                    setShowStudio(false);
                                }
                            }}
                            onClose={() => setShowStudio(false)}
                        />
                    </div>
                </div>
            )}
        </div>

    );
};

export default Step5_Thumbnail;

