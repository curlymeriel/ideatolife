import React, { useState, useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Image as ImageIcon, Upload, Type, Layers, Move, ZoomIn, Maximize, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

export const Step5_Thumbnail: React.FC = () => {
    const {
        episodeName, episodeNumber,
        setThumbnail, nextStep, prevStep,
        thumbnailSettings, setThumbnailSettings, // Access store settings
        isHydrated, // Access hydration status
        script // Access script for cut images
    } = useWorkflowStore();
    const navigate = useNavigate();

    // Ref for the content to be captured (1920x1080, no scale)
    const contentRef = useRef<HTMLDivElement>(null);

    // Ref for the container wrapper to calculate scale
    const containerRef = useRef<HTMLDivElement>(null);
    const [previewScale, setPreviewScale] = useState(1);

    // Local state initialized from store (or defaults if not yet hydrated)
    const [selectedImage, setSelectedImage] = useState<string | null>(null); // Don't use thumbnailUrl to avoid confusion
    const [showCutSelector, setShowCutSelector] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Initialize state from store settings or defaults
    const [frameImage, setFrameImage] = useState<string>(thumbnailSettings?.frameImage || '/frame_bg.svg');
    const [titleFont, setTitleFont] = useState(thumbnailSettings?.fontFamily || 'Inter');
    const [customTitle, setCustomTitle] = useState(episodeName || '');
    const [customEpNum, setCustomEpNum] = useState(episodeNumber?.toString() || '1');

    // Image Transform State
    const [scale, setScale] = useState(thumbnailSettings?.scale || 1);
    const [position, setPosition] = useState(thumbnailSettings?.imagePosition || { x: 0, y: 0 });

    // Text Transform State
    const [textPosition, setTextPosition] = useState(thumbnailSettings?.textPosition || { x: 0, y: 0 });
    const [titleSize, setTitleSize] = useState(thumbnailSettings?.titleSize || 48);
    const [epNumSize, setEpNumSize] = useState(thumbnailSettings?.epNumSize || 60);
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

    // Clear old thumbnail on mount to prevent Step 6 from showing low-quality cached thumbnail
    useEffect(() => {
        setThumbnail(null);
    }, [setThumbnail]);

    // Sync with store when it changes
    useEffect(() => {
        if (episodeName) setCustomTitle(episodeName);
        if (episodeNumber) setCustomEpNum(episodeNumber.toString());
    }, [episodeName, episodeNumber]);

    // Sync local state with store when hydrated
    useEffect(() => {
        if (isHydrated && thumbnailSettings) {
            setScale(thumbnailSettings.scale);
            setPosition(thumbnailSettings.imagePosition);
            setTextPosition(thumbnailSettings.textPosition);
            setTitleSize(thumbnailSettings.titleSize);
            setEpNumSize(thumbnailSettings.epNumSize);
            setTextColor(thumbnailSettings.textColor);
            setTitleFont(thumbnailSettings.fontFamily);
            setFrameImage(thumbnailSettings.frameImage);
        }
    }, [isHydrated, thumbnailSettings]);

    // Auto-save settings to store when they change
    useEffect(() => {
        if (!isHydrated) return;

        const timer = setTimeout(() => {
            setThumbnailSettings({
                scale,
                imagePosition: position,
                textPosition,
                titleSize,
                epNumSize,
                textColor,
                fontFamily: titleFont,
                frameImage
            });
        }, 500); // Debounce save

        return () => clearTimeout(timer);
    }, [scale, position, textPosition, titleSize, epNumSize, textColor, titleFont, frameImage, setThumbnailSettings, isHydrated]);


    // Calculate scale factor on resize
    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                // Subtract padding (p-8 = 32px * 2 = 64px) to ensure it fits inside the padded area
                const availableWidth = width - 64;
                const availableHeight = height - 64;

                const scaleX = availableWidth / 1920;
                const scaleY = availableHeight / 1080;
                // Use the smaller scale to ensure it fits entirely
                setPreviewScale(Math.min(scaleX, scaleY));
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
                setThumbnail(reader.result as string); // Update store
                // Reset transform on new image
                setScale(1);
                setPosition({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFrameImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSelectCutImage = (imageUrl: string) => {
        setSelectedImage(imageUrl);
        setThumbnail(imageUrl);
        setShowCutSelector(false);
        // Reset transform on new image
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleSaveThumbnail = async () => {
        if (!contentRef.current) return;

        setIsSaving(true);

        try {
            // 1. Wait for all fonts to be fully loaded
            await document.fonts.ready;

            // 2. Additional delay to ensure rendering
            await new Promise(resolve => setTimeout(resolve, 300));

            // 3. Capture the unscaled content div at 1920x1080
            const canvas = await html2canvas(contentRef.current, {
                scale: 1,
                width: 1920,
                height: 1080,
                backgroundColor: '#000000',
                logging: false,
                useCORS: true,
                allowTaint: true,
                foreignObjectRendering: false, // Better text rendering
                imageTimeout: 0, // No timeout for images
            });

            // 4. Download: Full-res PNG only
            const fullResDataUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = fullResDataUrl;
            downloadLink.download = `thumbnail_ep${customEpNum}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            // 5. DO NOT save to project - prevents memory issues
            // Step 6 will use first cut image as fallback

            // 6. Clear canvas memory
            canvas.width = 0;
            canvas.height = 0;

            // 7. User Feedback
            alert('✅ Thumbnail downloaded successfully!\n\n📥 Saved to Downloads folder\n💡 Use downloaded file for final production');

        } catch (error) {
            console.error('Error saving thumbnail:', error);
            alert('Failed to save thumbnail. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = () => {
        nextStep();
        navigate('/step/6'); // Corrected to Step 6
    };

    // Reusable Thumbnail Content Component
    const ThumbnailContent = ({ forCapture = false }: { forCapture?: boolean }) => (
        <div className="w-full h-full bg-black overflow-hidden relative">
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
                            <span className="text-4xl">No Image Selected</span>
                        </div>
                    )}
            </div>

            {/* LAYER 2: FRAME OVERLAY (MIDDLE) - Z-10 */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                <img
                    src={frameImage}
                    alt="Frame Overlay"
                    className="w-full h-full object-fill"
                    crossOrigin="anonymous"
                />
            </div>

            {/* LAYER 3: TEXT (TOP) - Z-20 */}
            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-[5%] pb-[8%]">
                <div
                    className="flex items-end gap-8 px-12"
                    style={{
                        transform: `translate(${textPosition.x}px, ${textPosition.y}px)`,
                        transition: forCapture ? 'none' : 'transform 0.1s ease-out'
                    }}
                >
                    <span
                        className="font-bold"
                        style={{
                            fontFamily: 'Oswald, Arial, sans-serif',
                            fontSize: `${epNumSize}px`,
                            lineHeight: 1.2,
                            color: textColor,
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                        }}
                    >
                        #{customEpNum}
                    </span>
                    <h1
                        style={{
                            fontFamily: `${titleFont}, Arial, sans-serif`,
                            fontSize: `${titleSize}px`,
                            lineHeight: 1.3,
                            color: textColor,
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                            fontWeight: 'bold',
                        }}
                    >
                        {customTitle}
                    </h1>
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-[calc(100vh-140px)] relative">
            <div className="flex gap-4 h-full overflow-hidden">
                {/* LEFT PANEL: CONTROLS */}
                <div className="w-[320px] flex-shrink-0 glass-panel flex flex-col h-full overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Layers size={20} className="text-[var(--color-primary)]" />
                                Frame-It System
                            </h2>
                            <p className="text-xs text-[var(--color-primary)] uppercase tracking-wider ml-7">Thumbnail Composer</p>
                        </div>

                        <button
                            onClick={handleSaveThumbnail}
                            disabled={!selectedImage || isSaving}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all border border-[var(--color-primary)] ${selectedImage
                                ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-black'
                                : 'text-gray-500 border-gray-700 cursor-not-allowed'
                                }`}
                        >
                            <Download size={14} />
                            Save
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                            <ImageIcon size={14} /> 1. Cut Image Source
                        </label>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <label className="cursor-pointer flex flex-col items-center justify-center p-4 border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-highlight)] transition-all rounded-lg group">
                                <Upload size={24} className="mb-2 text-gray-400 group-hover:text-white" />
                                <span className="text-xs font-bold text-gray-400 group-hover:text-white">Upload File</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>

                            <button
                                onClick={() => setShowCutSelector(true)}
                                disabled={!script || script.filter(c => c.finalImageUrl).length === 0}
                                className="flex flex-col items-center justify-center p-4 border border-[var(--color-border)] hover:bg-[var(--color-surface-highlight)] transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCw size={24} className="mb-2 text-gray-400" />
                                <span className="text-xs font-bold text-gray-400">From Step 4</span>
                                {(!script || script.filter(c => c.finalImageUrl).length === 0) && (
                                    <span className="text-[10px] text-red-400 mt-1">(Not generated yet)</span>
                                )}
                            </button>
                        </div>

                        {/* Cut Image Selector Modal */}
                        {showCutSelector && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center">
                                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCutSelector(false)} />
                                <div className="relative z-10 w-full max-w-4xl max-h-[80vh] overflow-y-auto bg-[var(--color-bg)] border border-[var(--color-primary)] rounded-lg p-6">
                                    <h3 className="text-xl font-bold text-white mb-4">Select Cut Image</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        {script.filter(c => c.finalImageUrl).map(cut => (
                                            <button
                                                key={cut.id}
                                                onClick={() => handleSelectCutImage(cut.finalImageUrl!)}
                                                className="group relative aspect-video rounded-lg overflow-hidden border-2 border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all"
                                            >
                                                <img
                                                    src={cut.finalImageUrl}
                                                    alt={`Cut ${cut.id}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="text-center">
                                                        <p className="text-white font-bold text-sm">Cut #{cut.id}</p>
                                                        <p className="text-gray-300 text-xs mt-1">{cut.speaker}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setShowCutSelector(false)}
                                        className="mt-4 w-full px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] text-white rounded-lg transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Transform Controls */}
                        {selectedImage && (
                            <div className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><ZoomIn size={10} /> Scale</span>
                                        <span>{Math.round(scale * 100)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0.5" max="3" step="0.1"
                                        value={scale}
                                        onChange={(e) => setScale(parseFloat(e.target.value))}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><Move size={10} /> Position X</span>
                                        <span>{position.x}px</span>
                                    </div>
                                    <input
                                        type="range" min="-500" max="500" step="10"
                                        value={position.x}
                                        onChange={(e) => setPosition({ ...position, x: parseInt(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><Move size={10} /> Position Y</span>
                                        <span>{position.y}px</span>
                                    </div>
                                    <input
                                        type="range" min="-500" max="500" step="10"
                                        value={position.y}
                                        onChange={(e) => setPosition({ ...position, y: parseInt(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* 2. Frame Overlay */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                                <Layers size={14} /> 2. Frame Overlay
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="cursor-pointer flex flex-col items-center justify-center p-4 border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-highlight)] transition-all rounded-lg group">
                                    <Upload size={24} className="mb-2 text-gray-400 group-hover:text-white" />
                                    <span className="text-xs font-bold text-gray-400 group-hover:text-white">Upload Frame</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFrameUpload} />
                                </label>

                                <button
                                    onClick={() => setFrameImage('/frame_bg.svg')}
                                    className="flex flex-col items-center justify-center p-4 border border-[var(--color-border)] hover:bg-[var(--color-surface-highlight)] transition-all rounded-lg"
                                >
                                    <RefreshCw size={24} className="mb-2 text-gray-400" />
                                    <span className="text-xs font-bold text-gray-400">Reset Default</span>
                                </button>
                            </div>
                        </div>

                        {/* 3. Text & Font */}
                        <div className="space-y-4">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                                <Type size={14} /> 3. Typography
                            </label>

                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-500">Episode Title</label>
                                <input
                                    type="text"
                                    value={customTitle}
                                    onChange={(e) => setCustomTitle(e.target.value)}
                                    className="input-field font-bold"
                                />
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1 space-y-2">
                                    <label className="text-[10px] text-gray-500">Ep. Number</label>
                                    <input
                                        type="text"
                                        value={customEpNum}
                                        onChange={(e) => setCustomEpNum(e.target.value)}
                                        className="input-field text-center"
                                    />
                                </div>
                                <div className="flex-[2] space-y-2">
                                    <label className="text-[10px] text-gray-500">Font Style</label>
                                    <select
                                        value={titleFont}
                                        onChange={(e) => setTitleFont(e.target.value)}
                                        className="input-field"
                                    >
                                        {FONTS.map(f => (
                                            <option key={f.name} value={f.name}>{f.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-500">Text Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={textColor}
                                        onChange={(e) => setTextColor(e.target.value)}
                                        className="w-10 h-10 p-0 border-0 rounded cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-400 uppercase">{textColor}</span>
                                </div>
                            </div>

                            {/* Text Controls */}
                            <div className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><Move size={10} /> Text Position X</span>
                                        <span>{textPosition.x}px</span>
                                    </div>
                                    <input
                                        type="range" min="-1000" max="1000" step="10"
                                        value={textPosition.x}
                                        onChange={(e) => setTextPosition({ ...textPosition, x: parseInt(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><Move size={10} /> Text Position Y</span>
                                        <span>{textPosition.y}px</span>
                                    </div>
                                    <input
                                        type="range" min="-1000" max="1000" step="10"
                                        value={textPosition.y}
                                        onChange={(e) => setTextPosition({ ...textPosition, y: parseInt(e.target.value) })}
                                        className="w-full accent-[var(--color-primary)]"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-gray-400">
                                            <span className="flex items-center gap-1"><Maximize size={10} /> Ep. Size</span>
                                            <span>{epNumSize}px</span>
                                        </div>
                                        <input
                                            type="range" min="20" max="150" step="1"
                                            value={epNumSize}
                                            onChange={(e) => setEpNumSize(parseInt(e.target.value))}
                                            className="w-full accent-[var(--color-primary)]"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-gray-400">
                                            <span className="flex items-center gap-1"><Maximize size={10} /> Title Size</span>
                                            <span>{titleSize}px</span>
                                        </div>
                                        <input
                                            type="range" min="20" max="150" step="1"
                                            value={titleSize}
                                            onChange={(e) => setTitleSize(parseInt(e.target.value))}
                                            className="w-full accent-[var(--color-primary)]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                </div>


                {/* RIGHT PANEL: PREVIEW */}
                <div className="flex-1 min-w-0 glass-panel flex flex-col overflow-hidden bg-[#1a1a1a]">

                    {/* HIDDEN ORIGINAL - For html2canvas Capture Only */}
                    <div
                        ref={contentRef}
                        className="fixed top-0 left-[-9999px] pointer-events-none"
                        style={{
                            width: '1920px',
                            height: '1080px',
                        }}
                    >
                        <ThumbnailContent forCapture={true} />
                    </div>

                    {/* VISIBLE PREVIEW - Scaled Copy */}
                    <div
                        ref={containerRef}
                        className="flex-1 relative w-full overflow-hidden flex items-center justify-center p-8"
                    >
                        {/* SCALED CONTAINER */}
                        <div
                            style={{
                                width: '1920px',
                                height: '1080px',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: `translate(-50%, -50%) scale(${previewScale})`,
                                transformOrigin: 'center center',
                                boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                            }}
                        >
                            <ThumbnailContent forCapture={false} />
                        </div>
                    </div>
                </div>
            </div>

            {/* NAVIGATION - Absolute on Desktop */}
            <div className="absolute bottom-4 left-[340px] z-50">
                <button
                    onClick={() => { prevStep(); navigate('/step/4'); }}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-highlight)] text-[var(--color-text-muted)] hover:text-white transition-all shadow-lg"
                >
                    Back
                </button>
            </div>

            <div className="absolute bottom-4 right-4 z-50 flex items-center gap-4">
                <div className="text-[var(--color-text-muted)] text-sm flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    <Layers size={14} />
                    <span>Layering: Cut Image (Bottom) → Frame Overlay (Middle) → Text (Top)</span>
                </div>
                <button
                    onClick={handleNext}
                    disabled={!selectedImage}
                    className={`flex items-center gap-2 px-8 py-3 rounded-lg font-bold transition-all shadow-lg ${selectedImage
                        ? 'bg-[var(--color-primary)] text-black hover:opacity-90 shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.4)]'
                        : 'bg-[var(--color-surface)] text-gray-500 cursor-not-allowed'
                        }`}
                >
                    Next Step
                    <ArrowRight size={20} />
                </button>
            </div>
        </div>
    );
};
