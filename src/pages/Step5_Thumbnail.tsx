import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Image as ImageIcon, Upload, Type, Layers, Move, ZoomIn, Download, Wand2, Sparkles, CheckSquare, Square, X, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { generateImage } from '../services/imageGen';
import { generateVisualPrompt } from '../services/gemini';
import { resolveUrl, saveToIdb, isIdbUrl } from '../utils/imageStorage';
import { getResolution } from '../utils/aspectRatioUtils';

export const Step5_Thumbnail: React.FC = () => {
    const {
        id: projectId,
        episodeName, seriesName,
        setThumbnail, nextStep, prevStep,
        thumbnailSettings, setThumbnailSettings,
        isHydrated,
        script,
        saveProject,
        apiKeys,
        imageModel,
        assetDefinitions,
        aspectRatio,
        trendInsights
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
    const [showCutSelector, setShowCutSelector] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Mode state
    const [mode, setMode] = useState<'framing' | 'ai-gen'>(thumbnailSettings?.mode || 'framing');
    const [aiPrompt, setAiPrompt] = useState(thumbnailSettings?.aiPrompt || '');
    const [aiTitle, setAiTitle] = useState(thumbnailSettings?.aiTitle || episodeName || '');
    const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(thumbnailSettings?.selectedReferenceIds || []);
    const [styleReferenceId, setStyleReferenceId] = useState<string | null>(thumbnailSettings?.styleReferenceId || null);
    const [resolvedStyleRef, setResolvedStyleRef] = useState<string | null>(null);

    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);

    // Initialize state from store settings or defaults
    const [frameImage, setFrameImage] = useState<string>(thumbnailSettings?.frameImage || '/frame_bg.svg');
    const [resolvedFrameImage, setResolvedFrameImage] = useState<string>(thumbnailSettings?.frameImage || '/frame_bg.svg');
    const [titleFont, setTitleFont] = useState(thumbnailSettings?.fontFamily || 'Inter');
    const [customTitle, setCustomTitle] = useState(thumbnailSettings?.episodeTitle || episodeName || '');


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

    // Resolve style reference if it exists
    useEffect(() => {
        if (styleReferenceId) {
            resolveUrl(styleReferenceId).then(setResolvedStyleRef);
        } else {
            setResolvedStyleRef(null);
        }
    }, [styleReferenceId]);

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
                if (settings.selectedReferenceIds) setSelectedReferenceIds(settings.selectedReferenceIds);
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
            setAiTitle(thumbnailSettings.aiTitle || episodeName || ''); // Sync AI Title
            setSelectedReferenceIds(thumbnailSettings.selectedReferenceIds || []);
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
                aiPrompt,
                aiTitle,
                selectedReferenceIds,
                styleReferenceId: styleReferenceId || undefined,
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
                frameImage
            });
        }, 500); // Debounce save

        return () => clearTimeout(timer);
    }, [mode, aiPrompt, aiTitle, selectedReferenceIds, styleReferenceId, scale, position, textPosition, titleSize, seriesTitle, seriesTitleSize, textAlign, textColor, titleFont, frameImage, customTitle, setThumbnailSettings, isHydrated]);


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

    const handleSelectCutImage = async (imageUrl: string) => {
        // 1. Save the reference to the store
        setThumbnail(imageUrl);

        // 2. Resolve for UI display
        let resolvedUrl = imageUrl;
        if (imageUrl.startsWith('idb://')) {
            try {
                const { resolveUrl } = await import('../utils/imageStorage');
                resolvedUrl = await resolveUrl(imageUrl);
            } catch (e) {
                console.error('[Step5] Failed to resolve:', e);
            }
        }
        setSelectedImage(resolvedUrl);
        setShowCutSelector(false);

        // Reset transform on new image
        setScale(1);
        setPosition({ x: 0, y: 0 });
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

    const handleGenerateAIThumbnail = async () => {
        if (!aiPrompt.trim() || !apiKeys.gemini) {
            alert('Prompt and Gemini API Key are required.');
            return;
        }

        setIsGeneratingAI(true);
        try {
            // 1. Resolve all reference images to base64
            const resolvedRefs = await Promise.all(
                selectedReferenceIds.map(async (url) => {
                    const resolved = await resolveUrl(url);
                    return resolved;
                })
            );

            // 1b. Resolve style reference if exists
            if (styleReferenceId) {
                const styleResolved = await resolveUrl(styleReferenceId);
                if (styleResolved) resolvedRefs.push(styleResolved);
            }

            // 2. Construct Enhanced Prompt for AI Text Rendering
            const fullPrompt = `TASK: Create a professional cinematic masterpiece thumbnail.
${aiTitle ? `TEXT TO INCLUDE: Render the title "${aiTitle}" as bold, stylistic typography integrated into the scene. DO NOT render episode numbers.` : ''}
USER VISION: ${aiPrompt}
${trendInsights?.thumbnail ? `TREND BENCHMARKS: Color scheme: ${trendInsights.thumbnail.colorScheme || 'N/A'}. Composition: ${trendInsights.thumbnail.composition || 'N/A'}. Recommendations: ${(trendInsights.thumbnail.recommendations || []).join('; ') || 'N/A'}.` : ''}
TECHNICAL: High contrast, 4K quality, professional composition. The typography should be legible and artistic.`;

            // 3. Generate Image
            const result = await generateImage(
                fullPrompt,
                apiKeys.gemini,
                resolvedRefs.length > 0 ? resolvedRefs : undefined,
                aspectRatio,
                imageModel
            );

            if (result.urls && result.urls.length > 0) {
                const generatedUrl = result.urls[0];

                // 4. Save to IDB immediately
                const idbUrl = await saveToIdb('images', `${projectId}-thumbnail-bg-ai`, generatedUrl);
                setThumbnail(idbUrl);

                // 4b. Resolve to Blob URL for UI Display (Prevents CORS issues with html2canvas)
                // If generatedUrl is remote, html2canvas might fail. IDB blob is safe.
                const resolvedBlobUrl = await resolveUrl(idbUrl);
                setSelectedImage(resolvedBlobUrl || generatedUrl);

                // 5. Reset transform (not used in AI mode but good to have)
                setScale(1);
                setPosition({ x: 0, y: 0 });

                alert('✅ AI Thumbnail generated successfully!');
            }
        } catch (error: any) {
            console.error('AI Thumbnail Generation Failed:', error);
            alert(`Generation Failed: ${error.message}`);
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const handleNext = () => {
        nextStep();
        navigate('/step/6');
    };

    // Clear existing thumbnail data
    const handleClearThumbnail = async () => {
        if (!confirm('Clear existing thumbnail? This will remove the saved thumbnail from this project.')) return;

        try {
            // Clear from store
            setThumbnail(null);
            setSelectedImage(null);
            useWorkflowStore.setState({ thumbnailPreview: null } as any);

            // Save project to persist changes
            await saveProject();

            alert('✅ Thumbnail cleared successfully!');
        } catch (error) {
            console.error('Error clearing thumbnail:', error);
            alert('Failed to clear thumbnail.');
        }
    };

    const handleStyleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            const idbUrl = await saveToIdb('images', `${projectId}-thumbnail-style-ref`, base64);
            setStyleReferenceId(idbUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleSuggestPrompt = async () => {
        if (!apiKeys.gemini) {
            alert("Gemini API Key is required for prompt suggestion.");
            return;
        }
        setIsSuggesting(true);
        try {
            // Context construction
            const { seriesStory, episodePlot, episodeName, assetDefinitions } = useWorkflowStore.getState();

            console.log("Suggest Prompt Debug:", { aiTitle, episodeName, aiPrompt });

            // Simplify context to visual relevant info
            const context = `
Thumbnail Title: "${aiTitle || episodeName}"
Story Concept: ${seriesStory}
Episode Focus: ${episodePlot || script?.[0]?.dialogue}
Key Visual Assets: ${Object.values(assetDefinitions || {}).map((a: any) => a.name).join(', ')}
`.trim();

            // Gather reference images (Style Ref + Selected Cuts/Assets)
            const resolvedRefs: string[] = [];

            // 1. Style Reference (External)
            if (styleReferenceId) {
                const url = await resolveUrl(styleReferenceId);
                if (url) resolvedRefs.push(url);
            }

            // 2. Selected IDs (Cuts or Assets)
            for (const id of selectedReferenceIds) {
                const url = await resolveUrl(id);
                if (url) resolvedRefs.push(url);
            }

            const visualPrompt = await generateVisualPrompt(context, resolvedRefs, apiKeys.gemini, trendInsights);
            setAiPrompt(visualPrompt);

        } catch (error) {
            console.error("Prompt Suggestion Failed:", error);
            alert("Failed to suggest prompt.");
        } finally {
            setIsSuggesting(false);
        }
    };

    const ThumbnailContent = ({ forCapture = false }: { forCapture?: boolean }) => {
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
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                                <ImageIcon size={100} className="mb-4 opacity-50" />
                                <span className="text-4xl">이미지를 선택해주세요</span>
                            </div>
                        )}
                </div>

                {/* LAYER 2: FRAME OVERLAY (MIDDLE) - Z-10 */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                    <img
                        src={resolvedFrameImage}
                        alt="Frame Overlay"
                        className="w-full h-full object-fill"
                        crossOrigin="anonymous"
                    />
                </div>

                {/* LAYER 3: TEXT (TOP) - Z-20 */}
                <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-[5%] pb-[8%]">
                    <div
                        className="flex flex-col gap-2 px-12"
                        style={{
                            transform: `translate(${textPosition.x}px, ${textPosition.y}px)`,
                            transition: forCapture ? 'none' : 'transform 0.1s ease-out',
                            textAlign: textAlign
                        }}
                    >
                        {/* Episode Title (Top) */}
                        <h1
                            style={{
                                fontFamily: `${titleFont}, Arial, sans-serif`,
                                fontSize: `${titleSize}px`,
                                lineHeight: 1.2,
                                color: textColor,
                                textShadow: '0 4px 20px rgba(0,0,0,0.7)',
                                fontWeight: 'bold',
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
                                    lineHeight: 1.3,
                                    color: textColor,
                                    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                                    opacity: 0.85,
                                }}
                            >
                                {seriesTitle}
                            </p>
                        )}
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
                                onClick={handleClearThumbnail}
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
                                    <Sparkles size={14} /> AI Gen
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
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={14} /> 2. Frame Overlay
                                    </label>
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

                        {/* 1. AI Generation (AI Gen Mode) */}
                        {mode === 'ai-gen' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                {/* 1. Typography for AI */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Type size={14} /> 1. Typography (AI Rendered)
                                    </label>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase px-1">썸네일 제목</label>
                                            <input
                                                type="text"
                                                placeholder="Main headline for AI to render"
                                                value={aiTitle}
                                                onChange={(e) => setAiTitle(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white font-bold focus:border-[var(--color-primary)]/50 outline-none transition-all shadow-inner"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSuggestPrompt}
                                            disabled={isSuggesting}
                                            className="w-full py-2.5 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-xl text-[10px] font-bold uppercase tracking-widest border border-[var(--color-primary)]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSuggesting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                            {isSuggesting ? 'Analyzing Visuals...' : 'Suggest AI Prompt'}
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Style Guidance */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={14} /> 2. Style Guidance
                                    </label>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase px-1">외부 스타일 참고</span>
                                            <label className="cursor-pointer text-[10px] text-[var(--color-primary)] hover:opacity-80 font-bold flex items-center gap-1 transition-colors">
                                                <Upload size={12} /> UPLOAD
                                                <input type="file" accept="image/*" className="hidden" onChange={handleStyleRefUpload} />
                                            </label>
                                        </div>
                                        {resolvedStyleRef ? (
                                            <div className="relative aspect-video rounded-xl overflow-hidden border border-[var(--color-primary)]/30 group">
                                                <img src={resolvedStyleRef} alt="Style Reference" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button onClick={() => setStyleReferenceId(null)} className="p-2 bg-red-500 text-white rounded-full"><X size={14} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="aspect-video rounded-xl bg-black/40 border border-dashed border-white/10 flex flex-col items-center justify-center text-gray-600">
                                                <ImageIcon size={24} className="mb-2 opacity-20" />
                                                <span className="text-[9px] uppercase tracking-tighter">No style ref uploaded</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 3. Prompt & Generation */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <Sparkles size={14} /> 3. Synthesis
                                    </label>
                                    <textarea
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder="Describe the visual composition, lighting, and mood..."
                                        className="w-full h-24 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-gray-300 placeholder:text-gray-700 focus:border-[var(--color-primary)]/50 outline-none resize-none transition-all shadow-inner custom-scrollbar"
                                    />
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Visual Guidance ({selectedReferenceIds.length})</label>
                                            <button onClick={() => setShowCutSelector(true)} className="text-[10px] text-[var(--color-primary)] hover:opacity-80 font-bold transition-colors">+ ADD REFS</button>
                                        </div>
                                        <div className="flex flex-wrap gap-2.5 p-3 bg-black/40 rounded-xl border border-white/5 min-h-[56px] shadow-inner">
                                            {selectedReferenceIds.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center w-full py-2 opacity-30">
                                                    <ImageIcon size={16} className="mb-1" />
                                                    <span className="text-[10px] lowercase italic">no references</span>
                                                </div>
                                            ) : (
                                                selectedReferenceIds.map(id => (
                                                    <ReferenceBadge key={id} id={id} onRemove={(id: string) => setSelectedReferenceIds(prev => prev.filter(ref => ref !== id))} />
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGenerateAIThumbnail}
                                        disabled={isGeneratingAI || !aiPrompt.trim()}
                                        className="w-full py-4 bg-[var(--color-primary)] hover:opacity-90 text-black rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-[var(--color-primary)]/20 active:scale-[0.97]"
                                    >
                                        {isGeneratingAI ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        {isGeneratingAI ? 'Generating Image...' : 'Synthesize Thumbnail'}
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
                                                        type="range" min="-1000" max="1000" step="10"
                                                        value={textPosition.x}
                                                        onChange={(e) => setTextPosition({ ...textPosition, x: parseInt(e.target.value) })}
                                                        className="w-full accent-white/30"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase px-1">Y Offset</div>
                                                    <input
                                                        type="range" min="-1000" max="1000" step="10"
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
                    onClick={handleNext}
                    disabled={!selectedImage || isGeneratingAI}
                    className={`flex items-center gap-2 px-10 py-4 rounded-xl font-bold transition-all shadow-2xl ${selectedImage
                        ? 'bg-[var(--color-primary)] text-black hover:opacity-90 shadow-[0_10px_40px_rgba(var(--color-primary-rgb),0.3)] hover:-translate-y-0.5 active:translate-y-0'
                        : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
                        }`}
                >
                    에피소드 확정
                    <ArrowRight size={20} />
                </button>
            </div>

            {/* Reference Selector Modal */}
            {showCutSelector && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowCutSelector(false)} />
                    <div className="relative z-10 w-full max-w-5xl max-h-[85vh] overflow-hidden bg-[var(--color-surface)] border border-white/10 rounded-2xl flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[var(--color-bg)]">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Sparkles className="text-[var(--color-primary)]" size={20} />
                                    Select Reference Images
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">Guided generation uses these images as visual style and character references</p>
                            </div>
                            <button onClick={() => setShowCutSelector(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                            {/* Production Cuts */}
                            <div>
                                <h4 className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                                    <ImageIcon size={14} />
                                    Final Production Cuts ({script.filter(c => c.finalImageUrl).length})
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {script.filter(c => c.finalImageUrl).map(cut => (
                                        <ReferenceSelectorItem
                                            key={`cut-${cut.id}`}
                                            id={cut.finalImageUrl!}
                                            label={`Cut #${cut.id}`}
                                            isSelected={selectedReferenceIds.includes(cut.finalImageUrl!)}
                                            isMulti={mode === 'ai-gen'}
                                            onToggle={(id) => {
                                                if (mode === 'framing') {
                                                    handleSelectCutImage(id);
                                                    setShowCutSelector(false);
                                                } else {
                                                    setSelectedReferenceIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Asset Definitions */}
                            {Object.keys(assetDefinitions || {}).length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                                        <Layers size={14} />
                                        Master Character & Location Assets
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {Object.values(assetDefinitions).map((asset: any) => {
                                            const imgUrl = asset.masterImage || asset.draftImage || asset.referenceImage;
                                            if (!imgUrl) return null;
                                            return (
                                                <ReferenceSelectorItem
                                                    key={`asset-${asset.id}`}
                                                    id={imgUrl}
                                                    label={asset.name}
                                                    isSelected={selectedReferenceIds.includes(imgUrl)}
                                                    isMulti={mode === 'ai-gen'}
                                                    onToggle={(id: string) => {
                                                        if (mode === 'framing') {
                                                            handleSelectCutImage(id);
                                                            setShowCutSelector(false);
                                                        } else {
                                                            setSelectedReferenceIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
                                                        }
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-white/5 bg-[var(--color-bg)] flex justify-between items-center">
                            <div className="text-sm text-gray-400">
                                {mode === 'ai-gen' ? (
                                    <p>선택된 <span className="text-[var(--color-primary)] font-bold">{selectedReferenceIds.length}</span>개 참고 이미지</p>
                                ) : (
                                    <p>배경으로 사용할 이미지를 선택하세요</p>
                                )}
                            </div>
                            <button
                                onClick={() => setShowCutSelector(false)}
                                className="px-10 py-3 bg-[var(--color-primary)] hover:opacity-90 text-black rounded-xl font-bold transition-all shadow-lg active:scale-95"
                            >
                                Confirm Selection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ReferenceBadge = ({ id, onRemove }: { id: string, onRemove: (id: string) => void }) => {
    const [resolvedUrl, setResolvedUrl] = useState<string>('');

    useEffect(() => {
        resolveUrl(id).then(setResolvedUrl);
    }, [id]);

    return (
        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/20 group">
            {resolvedUrl ? (
                <img src={resolvedUrl} alt="Ref" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full bg-gray-800 animate-pulse" />
            )}
            <button
                onClick={() => onRemove(id)}
                className="absolute top-0 right-0 bg-red-500/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <X size={10} className="text-white" />
            </button>
        </div>
    );
};

const ReferenceSelectorItem = ({ id, label, isSelected, onToggle, isMulti }: { id: string, label: string, isSelected: boolean, onToggle: (id: string) => void, isMulti: boolean }) => {
    const [resolvedUrl, setResolvedUrl] = useState<string>('');

    useEffect(() => {
        resolveUrl(id).then(setResolvedUrl);
    }, [id]);

    return (
        <button
            onClick={() => onToggle(id)}
            className={`group relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${isSelected
                ? 'border-[var(--color-primary)] ring-4 ring-[var(--color-primary)]/20'
                : 'border-white/5 hover:border-white/20'
                }`}
        >
            {resolvedUrl ? (
                <img src={resolvedUrl} alt={label} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                    <Loader2 size={24} className="text-gray-700 animate-spin" />
                </div>
            )}

            <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <div className="absolute top-3 right-3">
                    {isSelected ? (
                        <div className="bg-[var(--color-primary)] text-black rounded-full p-1 shadow-lg">
                            <CheckSquare size={16} />
                        </div>
                    ) : isMulti ? (
                        <div className="bg-black/50 text-white rounded-md p-1 backdrop-blur-md border border-white/20">
                            <Square size={16} />
                        </div>
                    ) : null}
                </div>
                <div className="absolute bottom-3 left-3 right-3 text-left">
                    <p className="text-[10px] font-bold text-white uppercase tracking-wider">{label}</p>
                </div>
            </div>
        </button>
    );
};
