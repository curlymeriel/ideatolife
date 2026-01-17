import React, { useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Move, Square, RotateCcw, Eraser, Crop, X } from 'lucide-react';

interface InteractiveImageViewerProps {
    src: string;
    alt?: string;
    onMaskChange?: (maskBase64: string | null) => void;
    onCrop?: () => void;
    onClose?: () => void;
    className?: string;
}

export const InteractiveImageViewer: React.FC<InteractiveImageViewerProps> = ({
    src,
    alt = 'Image',
    onMaskChange,
    onCrop,
    onClose,
    className = ''
}) => {
    // State
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [mode, setMode] = useState<'pan' | 'select'>('pan');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ x: number, y: number } | null>(null);

    // Setup
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Initialize Canvas on image load
    const handleImageLoad = () => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (img && canvas) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            // Clear canvas initially
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    // --- MOUSE EVENTS HANDLERS ---

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(scale * delta, 0.5), 5); // Limit zoom 0.5x to 5x
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        e.preventDefault(); // Prevent text selection
        if (mode === 'pan') {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        } else if (mode === 'select') {
            const coords = getCanvasCoordinates(e);
            if (coords) {
                setSelectionStart(coords);
                setSelectionEnd(coords);
                setIsDragging(true);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (mode === 'pan' && isDragging) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        } else if (mode === 'select' && isDragging) {
            const coords = getCanvasCoordinates(e);
            if (coords) {
                setSelectionEnd(coords);
                drawSelection();
            }
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        if (mode === 'select') {
            exportMask();
        }
    };

    const getCanvasCoordinates = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return null;

        const rect = img.getBoundingClientRect(); // Get localized rect of the image (which is transformed)

        // Calculate relative position within the element (0 to 1)
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;

        // Map to canvas (natural) resolution
        return {
            x: relX * canvas.width,
            y: relY * canvas.height
        };
    };

    const drawSelection = () => {
        const canvas = canvasRef.current;
        if (!canvas || !selectionStart || !selectionEnd) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas for fresh draw
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw rectangle
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;

        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const w = Math.abs(selectionStart.x - selectionEnd.x);
        const h = Math.abs(selectionStart.y - selectionEnd.y);

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    };

    const clearMask = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            setSelectionStart(null);
            setSelectionEnd(null);
            exportMask(true); // Export null/empty
        }
    };

    const exportMask = (isEmpty: boolean = false) => {
        if (onMaskChange) {
            if (isEmpty || !selectionStart || !selectionEnd) {
                onMaskChange(null);
            } else {
                const img = imgRef.current;
                if (!img) return;

                // Create offscreen canvas for high-contrast binary mask
                const offCanvas = document.createElement('canvas');
                offCanvas.width = img.naturalWidth;
                offCanvas.height = img.naturalHeight;
                const offCtx = offCanvas.getContext('2d');
                if (!offCtx) return;

                // 1. Fill entire background with SOLID BLACK
                offCtx.fillStyle = '#000000';
                offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

                // 2. Fill selection area with SOLID WHITE
                offCtx.fillStyle = '#FFFFFF';
                const x = Math.min(selectionStart.x, selectionEnd.x);
                const y = Math.min(selectionStart.y, selectionEnd.y);
                const w = Math.abs(selectionStart.x - selectionEnd.x);
                const h = Math.abs(selectionStart.y - selectionEnd.y);
                offCtx.fillRect(x, y, w, h);

                // Export as PNG
                const dataUrl = offCanvas.toDataURL('image/png');
                onMaskChange(dataUrl);
            }
        }
    };


    // --- UI HELPERS ---
    const resetView = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden bg-black/50 select-none ${className}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking toolbar
            >
                {/* File Actions (Crop, Close) */}
                {onCrop && (
                    <button
                        onClick={onCrop}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                        title="Crop Image"
                    >
                        <Crop size={18} />
                    </button>
                )}

                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-md transition-colors flex items-center gap-1 px-3"
                        title="Remove/Clear Image"
                    >
                        <span className="text-[10px] font-bold">CLEAR</span>
                        <X size={14} />
                    </button>
                )}

                {(onCrop || onClose) && <div className="w-[1px] h-6 bg-white/10 mx-1" />}

                {/* Mode Toggle */}
                <button
                    onClick={() => setMode('pan')}
                    className={`p-2 rounded-md transition-colors ${mode === 'pan' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                    title="Pan Tool (Move)"
                >
                    <Move size={18} />
                </button>
                <button
                    onClick={() => setMode('select')}
                    className={`p-2 rounded-md transition-colors ${mode === 'select' ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:text-white'}`}
                    title="Box Tool (Rectangular Selection)"
                >
                    <Square size={18} />
                </button>

                {/* Remove brush size slider contents */}

                <button
                    onClick={clearMask}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md"
                    title="Clear Mask"
                >
                    <Eraser size={18} />
                </button>

                <div className="w-[1px] h-6 bg-white/10 mx-1" />

                {/* Zoom Controls */}
                <button onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md">
                    <ZoomOut size={18} />
                </button>
                <span className="text-xs w-10 text-center font-mono text-gray-400">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(s + 0.2, 5))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md">
                    <ZoomIn size={18} />
                </button>
                <button onClick={resetView} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md" title="Reset View">
                    <RotateCcw size={18} />
                </button>
            </div>

            {/* Content Wrapper */}
            <div
                ref={contentRef}
                className="absolute w-full h-full flex items-center justify-center transition-transform duration-75 ease-out origin-center"
                style={{}}
            >
                <div
                    className="relative shadow-2xl"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                >
                    <img
                        ref={imgRef}
                        src={src}
                        alt={alt}
                        className="max-w-none pointer-events-none display-block"
                        style={{ maxHeight: '80vh', maxWidth: '80vw' }}
                        onLoad={handleImageLoad}
                        draggable={false}
                    />
                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 w-full h-full cursor-${mode === 'select' ? 'crosshair' : 'grab'}`}
                        style={{ pointerEvents: 'none' }}
                    />
                </div>
            </div>

            {/* Instruction Overlay (Ephemeral) */}
            {mode === 'select' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none">
                    Drag to select the modification area (Box)
                </div>
            )}
        </div>
    );
};
