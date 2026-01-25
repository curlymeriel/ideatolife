import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Pencil, Eraser, Move, RotateCcw, Play, Eye, EyeOff,
    Loader2, AlertCircle, Layers, Sliders, Sparkles,
    ZoomIn, ZoomOut, Maximize, FlipHorizontal
} from 'lucide-react';
import { extractCannyEdges } from '../../utils/cannyEdge';
import { generateImage } from '../../services/imageGen';

// ============================================================================
// TYPES
// ============================================================================

export interface CompositionEditorProps {
    imageUrl: string | null;
    prompt: string;
    aspectRatio: string;
    apiKey: string;
    onApply: (newImageUrl: string) => void;
    onClose: () => void;
}

type ActiveTool = 'brush' | 'eraser' | 'move';

interface Selection {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface EditorState {
    cannyEdges: string | null;
    editedEdges: string | null;
    lowThreshold: number;
    highThreshold: number;
    brushSize: number;
    activeTool: ActiveTool;
    showEdgeOverlay: boolean;
    isExtracting: boolean;
    isApplying: boolean;
    error: string | null;

    // Selection state
    selection: Selection | null;
    floatingLayer: HTMLCanvasElement | null;
    isMoving: boolean;

    // View state
    zoom: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const CompositionEditor: React.FC<CompositionEditorProps> = ({
    imageUrl,
    prompt,
    aspectRatio,
    apiKey,
    onApply,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onClose: _onClose,
}) => {
    // ========================================================================
    // STATE
    // ========================================================================

    const [state, setState] = useState<EditorState>({
        cannyEdges: null,
        editedEdges: null,
        lowThreshold: 100,
        highThreshold: 200,
        brushSize: 5,
        activeTool: 'brush',
        showEdgeOverlay: true,
        isExtracting: false,
        isApplying: false,
        error: null,
        selection: null,
        floatingLayer: null,
        isMoving: false,
        zoom: 1.0,
    });

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [imageLoaded, setImageLoaded] = useState(false);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Load image and set canvas size
    useEffect(() => {
        if (!imageUrl) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            setCanvasSize({ width: img.naturalWidth, height: img.naturalHeight });
            setImageLoaded(true);
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // Draw main canvas when image loads
    useEffect(() => {
        if (!imageLoaded || !canvasRef.current || !imageUrl) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = imageUrl;
    }, [imageLoaded, imageUrl, canvasSize]);

    // Draw edge overlay
    useEffect(() => {
        if (!overlayCanvasRef.current || !state.cannyEdges) return;

        const canvas = overlayCanvasRef.current;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (state.showEdgeOverlay) {
            const img = new Image();
            img.onload = () => {
                ctx.globalAlpha = 0.7;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1.0;
            };
            img.src = state.editedEdges || state.cannyEdges;
        }
    }, [state.cannyEdges, state.editedEdges, state.showEdgeOverlay, canvasSize]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleExtractEdges = useCallback(async () => {
        if (!imageUrl) return;

        setState(prev => ({ ...prev, isExtracting: true, error: null }));

        try {
            const edges = await extractCannyEdges(imageUrl, {
                lowThreshold: state.lowThreshold,
                highThreshold: state.highThreshold,
            });
            setState(prev => ({
                ...prev,
                cannyEdges: edges,
                editedEdges: null,
                isExtracting: false,
            }));
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                isExtracting: false,
                error: '엣지 추출 실패: ' + (error.message || 'Unknown error'),
            }));
        }
    }, [imageUrl, state.lowThreshold, state.highThreshold]);

    const handleReset = useCallback(() => {
        setState(prev => ({
            ...prev,
            editedEdges: null,
            error: null,
        }));
    }, []);

    const handleApply = useCallback(async () => {
        if (!imageUrl || !state.cannyEdges) {
            setState(prev => ({ ...prev, error: '먼저 엣지를 추출해주세요.' }));
            return;
        }

        setState(prev => ({ ...prev, isApplying: true, error: null }));

        try {
            // 엣지 이미지를 참조로 사용하여 구도를 유지한 새 이미지 생성
            const edgeImage = state.editedEdges || state.cannyEdges;

            // 구도 참조 프롬프트 구성
            const compositionPrompt = `${prompt}\n\n[COMPOSITION REFERENCE] Follow the exact composition and object placement shown in the edge map reference image. The white lines indicate where objects, characters, and key elements should be positioned.`;

            // Gemini 이미지 생성 (엣지를 참조 이미지로 전달)
            const result = await generateImage(
                compositionPrompt,
                apiKey,
                [edgeImage], // 엣지 이미지를 참조로 전달
                aspectRatio,
                'gemini-2.5-flash-image', // 기본 모델 사용
                1 // 1개만 생성
            );

            if (result.urls && result.urls.length > 0) {
                onApply(result.urls[0]);
            } else {
                setState(prev => ({
                    ...prev,
                    isApplying: false,
                    error: '이미지 생성 실패: 결과가 없습니다.',
                }));
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                isApplying: false,
                error: '적용 실패: ' + (error.message || 'Unknown error'),
            }));
        }
    }, [imageUrl, state.cannyEdges, state.editedEdges, prompt, aspectRatio, apiKey, onApply]);

    // Drawing handlers
    const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, []);

    const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!state.cannyEdges) return;

        const pos = getCanvasCoordinates(e);

        if (state.activeTool === 'move') {
            // Check if we are inside existing selection
            if (state.selection &&
                pos.x >= state.selection.x && pos.x <= state.selection.x + state.selection.w &&
                pos.y >= state.selection.y && pos.y <= state.selection.y + state.selection.h) {

                setState(prev => ({ ...prev, isMoving: true }));
                lastPosRef.current = pos;
            } else {
                // Start a new selection marquee
                selectionStartRef.current = pos;
                isDrawingRef.current = true;
                setState(prev => ({ ...prev, selection: null, floatingLayer: null, isMoving: false }));
            }
        } else {
            isDrawingRef.current = true;
            lastPosRef.current = pos;
        }
    }, [state.cannyEdges, state.activeTool, state.selection, getCanvasCoordinates]);

    const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if ((!isDrawingRef.current && !state.isMoving) || !overlayCanvasRef.current) return;

        const currentPos = getCanvasCoordinates(e);
        const ctx = overlayCanvasRef.current.getContext('2d')!;

        if (state.activeTool === 'move') {
            if (state.isMoving && state.selection && state.floatingLayer) {
                // Moving the existing selection
                const dx = currentPos.x - lastPosRef.current!.x;
                const dy = currentPos.y - lastPosRef.current!.y;

                setState(prev => ({
                    ...prev,
                    selection: prev.selection ? {
                        ...prev.selection,
                        x: prev.selection.x + dx,
                        y: prev.selection.y + dy
                    } : null
                }));
                lastPosRef.current = currentPos;
            } else if (isDrawingRef.current && selectionStartRef.current) {
                // Drawing selection marquee
                const x = Math.min(selectionStartRef.current.x, currentPos.x);
                const y = Math.min(selectionStartRef.current.y, currentPos.y);
                const w = Math.abs(selectionStartRef.current.x - currentPos.x);
                const h = Math.abs(selectionStartRef.current.y - currentPos.y);

                setState(prev => ({ ...prev, selection: { x, y, w, h } }));
            }
            return;
        }

        if (!lastPosRef.current) return;

        ctx.beginPath();
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(currentPos.x, currentPos.y);

        if (state.activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#FF0000';
        }

        ctx.lineWidth = state.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';

        lastPosRef.current = currentPos;
    }, [state.activeTool, state.isMoving, state.selection, state.floatingLayer, state.brushSize, getCanvasCoordinates]);

    const stopDrawing = useCallback(() => {
        if (state.activeTool === 'move' && isDrawingRef.current && state.selection && state.selection.w > 2 && state.selection.h > 2) {
            // Commit selection: extract pixels into floating layer and clear them from main canvas
            const canvas = overlayCanvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d')!;
                const { x, y, w, h } = state.selection;

                // Create floating layer
                const floatingCanvas = document.createElement('canvas');
                floatingCanvas.width = w;
                floatingCanvas.height = h;
                const fCtx = floatingCanvas.getContext('2d')!;
                fCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

                // Clear original area
                ctx.clearRect(x, y, w, h);

                setState(prev => ({
                    ...prev,
                    floatingLayer: floatingCanvas,
                    editedEdges: canvas.toDataURL('image/png')
                }));
            }
        } else if (state.activeTool !== 'move' && isDrawingRef.current) {
            // Sync brush/eraser strokes
            if (overlayCanvasRef.current) {
                setState(prev => ({
                    ...prev,
                    editedEdges: overlayCanvasRef.current!.toDataURL('image/png')
                }));
            }
        }

        isDrawingRef.current = false;
        lastPosRef.current = null;
        selectionStartRef.current = null;
        setState(prev => ({ ...prev, isMoving: false }));
    }, [state.activeTool, state.selection]);

    const handleRotateSelection = useCallback(() => {
        if (!state.selection || !state.floatingLayer || !overlayCanvasRef.current) return;

        const { w, h } = state.selection;
        const oldFloating = state.floatingLayer;

        // Create new rotated canvas
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = h; // Swap w/h for 90deg rotate
        rotatedCanvas.height = w;
        const rCtx = rotatedCanvas.getContext('2d')!;

        rCtx.translate(h / 2, w / 2);
        rCtx.rotate(Math.PI / 2);
        rCtx.drawImage(oldFloating, -w / 2, -h / 2);

        setState(prev => ({
            ...prev,
            selection: prev.selection ? {
                ...prev.selection,
                w: prev.selection.h,
                h: prev.selection.w
            } : null,
            floatingLayer: rotatedCanvas
        }));
    }, [state.selection, state.floatingLayer]);

    const handleFlipSelection = useCallback(() => {
        if (!state.selection || !state.floatingLayer) return;

        const { w, h } = state.selection;
        const oldFloating = state.floatingLayer;

        const flippedCanvas = document.createElement('canvas');
        flippedCanvas.width = w;
        flippedCanvas.height = h;
        const fCtx = flippedCanvas.getContext('2d')!;

        fCtx.translate(w, 0);
        fCtx.scale(-1, 1);
        fCtx.drawImage(oldFloating, 0, 0);

        setState(prev => ({
            ...prev,
            floatingLayer: flippedCanvas
        }));
    }, [state.selection, state.floatingLayer]);

    const handleScaleSelection = useCallback((factor: number) => {
        if (!state.selection || !state.floatingLayer) return;

        const { w, h } = state.selection;
        const newW = Math.max(10, Math.round(w * factor));
        const newH = Math.max(10, Math.round(h * factor));

        // Centered scaling: adjust x, y so the center stays the same
        const dx = (newW - w) / 2;
        const dy = (newH - h) / 2;

        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = newW;
        scaledCanvas.height = newH;
        const sCtx = scaledCanvas.getContext('2d')!;

        // Use better scaling quality
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(state.floatingLayer, 0, 0, newW, newH);

        setState(prev => ({
            ...prev,
            selection: prev.selection ? {
                ...prev.selection,
                x: prev.selection.x - dx,
                y: prev.selection.y - dy,
                w: newW,
                h: newH
            } : null,
            floatingLayer: scaledCanvas
        }));
    }, [state.selection, state.floatingLayer]);

    const handleCommitSelection = useCallback(() => {
        const canvas = overlayCanvasRef.current;
        if (canvas && state.selection && state.floatingLayer && state.floatingLayer.width > 0 && state.floatingLayer.height > 0) {
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(state.floatingLayer, state.selection.x, state.selection.y);
            setState(prev => ({
                ...prev,
                selection: null,
                floatingLayer: null,
                editedEdges: canvas.toDataURL('image/png')
            }));
        }
    }, [state.selection, state.floatingLayer]);

    // ========================================================================
    // RENDER
    // ========================================================================

    const zoomStep = 0.2;
    const minZoom = 0.5;
    const maxZoom = 3.0;

    const handleZoomIn = () => setState(prev => ({ ...prev, zoom: Math.min(prev.zoom + zoomStep, maxZoom) }));
    const handleZoomOut = () => setState(prev => ({ ...prev, zoom: Math.max(prev.zoom - zoomStep, minZoom) }));
    const handleResetZoom = () => setState(prev => ({ ...prev, zoom: 1.0 }));

    const displayWidth = Math.min(canvasSize.width, 800) * state.zoom;
    const displayHeight = (canvasSize.height * (displayWidth / (canvasSize.width * state.zoom))) * state.zoom || 450;

    return (
        <div className="flex flex-col h-full bg-black/40 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-xl">
                        <Layers size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">구도 수정</h3>
                        <p className="text-[10px] text-gray-500 font-medium">
                            <span className="text-green-500">✓ Gemini 이미지 생성</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleApply}
                        disabled={!state.cannyEdges || state.isApplying}
                        className={`px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all ${state.cannyEdges && !state.isApplying
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:brightness-110 shadow-xl'
                            : 'bg-white/5 text-gray-600 cursor-not-allowed'
                            }`}
                    >
                        {state.isApplying ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                적용 중...
                            </>
                        ) : (
                            <>
                                <Play size={16} />
                                적용
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Canvas Area */}
                <div
                    ref={containerRef}
                    className="flex-1 flex items-start justify-center p-6 bg-black/20 overflow-auto scrollbar-thin scrollbar-thumb-white/10"
                >
                    {!imageUrl ? (
                        <div className="text-center text-gray-600 m-auto">
                            <Layers size={64} className="mx-auto mb-4 opacity-20" />
                            <p className="text-sm font-bold">이미지를 먼저 선택해주세요</p>
                        </div>
                    ) : (
                        <div
                            className="relative rounded-xl shadow-2xl border border-white/10 my-auto shrink-0"
                            style={{
                                width: displayWidth,
                                height: displayHeight,
                                transition: 'width 0.2s ease-out, height 0.2s ease-out'
                            }}
                        >
                            {/* Background Image Canvas */}
                            <canvas
                                ref={canvasRef}
                                width={canvasSize.width}
                                height={canvasSize.height}
                                className="absolute inset-0 w-full h-full"
                                style={{ imageRendering: 'auto' }}
                            />

                            {/* Edge Overlay Canvas */}
                            <canvas
                                ref={overlayCanvasRef}
                                width={canvasSize.width}
                                height={canvasSize.height}
                                className="absolute inset-0 w-full h-full cursor-crosshair"
                                style={{
                                    imageRendering: 'auto',
                                    opacity: state.showEdgeOverlay ? 1 : 0,
                                }}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                            />

                            {/* Floating Selection Preview */}
                            {state.selection && state.floatingLayer && (
                                <div
                                    className="absolute pointer-events-none border border-dashed border-cyan-400"
                                    style={{
                                        left: (state.selection.x / canvasSize.width) * 100 + '%',
                                        top: (state.selection.y / canvasSize.height) * 100 + '%',
                                        width: (state.selection.w / canvasSize.width) * 100 + '%',
                                        height: (state.selection.h / canvasSize.height) * 100 + '%',
                                        zIndex: 10
                                    }}
                                >
                                    <canvas
                                        ref={(el) => {
                                            if (el && state.floatingLayer && state.floatingLayer.width > 0 && state.floatingLayer.height > 0) {
                                                const ctx = el.getContext('2d')!;
                                                el.width = state.selection!.w;
                                                el.height = state.selection!.h;
                                                ctx.drawImage(state.floatingLayer, 0, 0);
                                            }
                                        }}
                                        className="w-full h-full opacity-80"
                                    />
                                </div>
                            )}

                            {/* Marquee Preview */}
                            {isDrawingRef.current && state.activeTool === 'move' && state.selection && !state.floatingLayer && (
                                <div
                                    className="absolute pointer-events-none border border-dashed border-cyan-400 bg-cyan-400/10"
                                    style={{
                                        left: (state.selection.x / canvasSize.width) * 100 + '%',
                                        top: (state.selection.y / canvasSize.height) * 100 + '%',
                                        width: (state.selection.w / canvasSize.width) * 100 + '%',
                                        height: (state.selection.h / canvasSize.height) * 100 + '%',
                                        zIndex: 10
                                    }}
                                />
                            )}

                            {/* Loading Overlay */}
                            {(state.isExtracting || state.isApplying) && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                                    <Loader2 size={48} className="animate-spin text-purple-400 mb-4" />
                                    <p className="text-white font-bold text-sm">
                                        {state.isExtracting ? '엣지 추출 중...' : '구도 수정 중...'}
                                    </p>
                                    <p className="text-gray-500 text-xs mt-2">
                                        잠시만 기다려주세요. AI가 새로운 이미지를 생성하고 있습니다.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Control Panel */}
                <div className="w-80 border-l border-white/5 bg-white/[0.01] flex flex-col overflow-y-auto">
                    {/* Canny Settings Section */}
                    <div className="p-5 border-b border-white/5 space-y-4">
                        <div className="flex items-center gap-2">
                            <Sliders size={14} className="text-purple-400" />
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                Canny 엣지 설정
                            </h4>
                        </div>

                        {/* Threshold Sliders */}
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                                    <span>Low Threshold</span>
                                    <span className="text-white">{state.lowThreshold}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={255}
                                    value={state.lowThreshold}
                                    onChange={(e) => setState(prev => ({ ...prev, lowThreshold: parseInt(e.target.value) }))}
                                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                                    <span>High Threshold</span>
                                    <span className="text-white">{state.highThreshold}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={255}
                                    value={state.highThreshold}
                                    onChange={(e) => setState(prev => ({ ...prev, highThreshold: parseInt(e.target.value) }))}
                                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>
                        </div>

                        {/* Extract Button */}
                        <button
                            onClick={handleExtractEdges}
                            disabled={!imageUrl || state.isExtracting}
                            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${imageUrl && !state.isExtracting
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30'
                                : 'bg-white/5 text-gray-600 cursor-not-allowed'
                                }`}
                        >
                            {state.isExtracting ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Sparkles size={16} />
                            )}
                            엣지 추출
                        </button>

                        {/* Toggle Overlay */}
                        <button
                            onClick={() => setState(prev => ({ ...prev, showEdgeOverlay: !prev.showEdgeOverlay }))}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.showEdgeOverlay
                                ? 'bg-white/10 text-white border border-white/10'
                                : 'bg-white/5 text-gray-500 border border-white/5'
                                }`}
                        >
                            {state.showEdgeOverlay ? <Eye size={14} /> : <EyeOff size={14} />}
                            엣지 {state.showEdgeOverlay ? '숨기기' : '보기'}
                        </button>

                        {/* Zoom Controls */}
                        <div className="pt-2 flex items-center gap-2">
                            <button
                                onClick={handleZoomOut}
                                className="flex-1 py-2 bg-white/5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                                title="Zoom Out"
                            >
                                <ZoomOut size={14} />
                            </button>
                            <button
                                onClick={handleResetZoom}
                                className="px-3 py-2 bg-white/5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                title="Reset Zoom"
                            >
                                <Maximize size={12} /> {Math.round(state.zoom * 100)}%
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="flex-1 py-2 bg-white/5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                                title="Zoom In"
                            >
                                <ZoomIn size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Edit Tools Section */}
                    <div className="p-5 border-b border-white/5 space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Pencil size={14} className="text-cyan-400" />
                            편집 도구
                        </h4>

                        {/* Tool Buttons */}
                        <div className="flex gap-2">
                            {[
                                { tool: 'brush' as ActiveTool, icon: Pencil, label: '브러시' },
                                { tool: 'eraser' as ActiveTool, icon: Eraser, label: '지우개' },
                                { tool: 'move' as ActiveTool, icon: Move, label: '이동' },
                            ].map(({ tool, icon: Icon, label }) => (
                                <button
                                    key={tool}
                                    onClick={() => {
                                        if (state.selection) handleCommitSelection();
                                        setState(prev => ({ ...prev, activeTool: tool, selection: null, floatingLayer: null }));
                                    }}
                                    disabled={!state.cannyEdges}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1.5 transition-all ${state.activeTool === tool
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-lg'
                                        : state.cannyEdges
                                            ? 'bg-white/5 text-gray-500 border border-white/5 hover:bg-white/10'
                                            : 'bg-white/[0.02] text-gray-700 cursor-not-allowed'
                                        }`}
                                >
                                    <Icon size={18} />
                                    {label === '이동' ? '선택/이동' : label}
                                </button>
                            ))}
                        </div>

                        {/* Selection Controls */}
                        {state.selection && state.floatingLayer && (
                            <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                                <button
                                    onClick={handleRotateSelection}
                                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <RotateCcw size={14} className="rotate-90" />
                                    회전
                                </button>
                                <button
                                    onClick={handleFlipSelection}
                                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <FlipHorizontal size={14} />
                                    반전
                                </button>
                                <button
                                    onClick={() => handleScaleSelection(1.1)}
                                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
                                    title="크게"
                                >
                                    <ZoomIn size={14} />
                                    확대
                                </button>
                                <button
                                    onClick={() => handleScaleSelection(0.9)}
                                    className="flex-1 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:text-white hover:bg-white/10 transition-all"
                                    title="작게"
                                >
                                    <ZoomOut size={14} />
                                    축소
                                </button>
                                <button
                                    onClick={handleCommitSelection}
                                    className="flex-1 py-2 bg-[var(--color-primary)] text-black rounded-lg text-[10px] font-black flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-[var(--color-primary)]/20"
                                >
                                    확정
                                </button>
                            </div>
                        )}
                        {/* Brush Size Slider */}
                        <div>
                            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                                <span>브러시 크기</span>
                                <span className="text-white">{state.brushSize}px</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={20}
                                value={state.brushSize}
                                onChange={(e) => setState(prev => ({ ...prev, brushSize: parseInt(e.target.value) }))}
                                disabled={!state.cannyEdges}
                                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500 disabled:opacity-30"
                            />
                        </div>
                    </div>

                    {/* Actions Section */}
                    <div className="p-5 space-y-3">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            액션
                        </h4>

                        <button
                            onClick={handleReset}
                            disabled={!state.editedEdges}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.editedEdges
                                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20'
                                : 'bg-white/[0.02] text-gray-700 cursor-not-allowed'
                                }`}
                        >
                            <RotateCcw size={14} />
                            초기화
                        </button>
                    </div>

                    {/* Error Display */}
                    {state.error && (
                        <div className="p-5 pt-0">
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-red-400 text-xs font-bold mb-1">오류 발생</p>
                                        <p className="text-red-300/70 text-[10px]">{state.error}</p>
                                        <button
                                            onClick={() => setState(prev => ({ ...prev, error: null }))}
                                            className="mt-2 text-[10px] font-bold text-red-400 hover:underline"
                                        >
                                            닫기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Info Note */}
                    <div className="p-5 mt-auto">
                        <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                            <p className="text-[10px] text-purple-300/60 leading-relaxed">
                                💡 <strong>사용법:</strong> 엣지를 추출한 후, 브러시로 새로운 선을 그리거나
                                지우개로 불필요한 선을 제거하세요. 수정이 완료되면 "적용" 버튼을 클릭합니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default CompositionEditor;
