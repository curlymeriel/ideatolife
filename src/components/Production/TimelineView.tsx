import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import type { BGMTrack } from '../../store/types';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';

interface TimelineViewProps {
    script: ScriptCut[];
    bgmTracks: BGMTrack[];
    currentCutIndex: number;
    onCutClick: (index: number) => void;
    onBGMUpdate: (tracks: BGMTrack[]) => void;
}

// Color palette for BGM tracks
const BGM_COLORS = [
    { bg: 'bg-pink-500/40', border: 'border-pink-500', text: 'text-pink-300' },
    { bg: 'bg-purple-500/40', border: 'border-purple-500', text: 'text-purple-300' },
    { bg: 'bg-blue-500/40', border: 'border-blue-500', text: 'text-blue-300' },
    { bg: 'bg-green-500/40', border: 'border-green-500', text: 'text-green-300' },
    { bg: 'bg-yellow-500/40', border: 'border-yellow-500', text: 'text-yellow-300' },
    { bg: 'bg-orange-500/40', border: 'border-orange-500', text: 'text-orange-300' },
];

// Resolved Image Component
const ResolvedThumbnail: React.FC<{ src?: string; alt?: string; className?: string }> = ({ src, alt, className }) => {
    const [resolvedSrc, setResolvedSrc] = useState<string>('');

    useEffect(() => {
        if (!src) {
            setResolvedSrc('');
            return;
        }

        if (isIdbUrl(src)) {
            resolveUrl(src).then(url => setResolvedSrc(url)).catch(() => setResolvedSrc(''));
        } else {
            setResolvedSrc(src);
        }
    }, [src]);

    if (!resolvedSrc) {
        return (
            <div className={`${className} bg-white/5 flex items-center justify-center text-gray-600`}>
                <span className="text-[8px]">-</span>
            </div>
        );
    }

    return <img src={resolvedSrc} alt={alt} className={className} />;
};

export const TimelineView: React.FC<TimelineViewProps> = ({
    script,
    bgmTracks,
    currentCutIndex,
    onCutClick,
    onBGMUpdate
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    const [dragging, setDragging] = useState<{ trackId: string; edge: 'start' | 'end'; initialCutIdx: number } | null>(null);
    const [hoverCutIdx, setHoverCutIdx] = useState<number | null>(null);

    const safeTracks = bgmTracks || [];
    const CUT_WIDTH = 80;
    const totalWidth = script.length * CUT_WIDTH;

    // Calculate cut index from mouse X position
    const getCutIndexFromX = useCallback((clientX: number): number => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const relativeX = clientX - rect.left + scrollPosition;
        const cutIdx = Math.floor(relativeX / CUT_WIDTH);
        return Math.max(0, Math.min(script.length - 1, cutIdx));
    }, [scrollPosition, script.length]);

    // Mouse move handler during drag
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;
        const cutIdx = getCutIndexFromX(e.clientX);
        setHoverCutIdx(cutIdx);
    }, [dragging, getCutIndexFromX]);

    // Mouse up handler - apply changes
    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!dragging) return;

        const cutIdx = getCutIndexFromX(e.clientX);
        const cutId = script[cutIdx]?.id;

        if (cutId !== undefined) {
            const updatedTracks = safeTracks.map(track => {
                if (track.id === dragging.trackId) {
                    if (dragging.edge === 'start') {
                        return { ...track, startCutId: cutId };
                    } else {
                        return { ...track, endCutId: cutId };
                    }
                }
                return track;
            });
            onBGMUpdate(updatedTracks);
        }

        setDragging(null);
        setHoverCutIdx(null);
    }, [dragging, getCutIndexFromX, onBGMUpdate, safeTracks, script]);

    // Attach/detach global mouse listeners
    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [dragging, handleMouseMove, handleMouseUp]);

    // Start dragging
    const handleDragStart = (trackId: string, edge: 'start' | 'end', currentCutIdx: number) => {
        setDragging({ trackId, edge, initialCutIdx: currentCutIdx });
        setHoverCutIdx(currentCutIdx);
    };

    // Scroll controls
    const scrollLeft = () => setScrollPosition(prev => Math.max(0, prev - 400));
    const scrollRight = () => setScrollPosition(prev => Math.min(Math.max(0, totalWidth - 800), prev + 400));

    return (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Music size={14} className="text-pink-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Timeline</span>
                    {dragging && (
                        <span className="text-[10px] bg-pink-500 text-white px-2 py-0.5 rounded-full">
                            {dragging.edge === 'start' ? 'Setting START' : 'Setting END'} → Cut #{(hoverCutIdx ?? 0) + 1}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={scrollLeft}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={scrollRight}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Timeline Content */}
            <div className="overflow-hidden" ref={containerRef}>
                <div
                    className="flex flex-col transition-transform duration-200"
                    style={{ transform: `translateX(-${scrollPosition}px)`, width: `${totalWidth}px` }}
                >
                    {/* Cut Thumbnails Row */}
                    <div className="flex border-b border-white/10">
                        {script.map((cut, index) => {
                            const isHovered = dragging && hoverCutIdx === index;
                            return (
                                <div
                                    key={cut.id}
                                    className={`flex-shrink-0 cursor-pointer transition-all border-r border-white/5 ${isHovered
                                            ? 'ring-2 ring-pink-400 bg-pink-500/20'
                                            : index === currentCutIndex
                                                ? 'ring-2 ring-[var(--color-primary)] ring-inset'
                                                : 'hover:bg-white/5'
                                        }`}
                                    style={{ width: `${CUT_WIDTH}px` }}
                                    onClick={() => !dragging && onCutClick(index)}
                                >
                                    <ResolvedThumbnail
                                        src={cut.finalImageUrl || cut.draftImageUrl}
                                        alt={`Cut ${index + 1}`}
                                        className="w-full h-12 object-cover"
                                    />
                                    <div className="px-1 py-0.5 bg-black/50 text-center">
                                        <span className="text-[10px] text-gray-400">#{index + 1}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* BGM Tracks Layers */}
                    {safeTracks.length > 0 ? (
                        safeTracks.map((track, trackIndex) => {
                            const startIdx = script.findIndex(c => String(c.id) === String(track.startCutId));
                            const endIdx = script.findIndex(c => String(c.id) === String(track.endCutId));

                            const validStart = startIdx !== -1 ? startIdx : 0;
                            const validEnd = endIdx !== -1 ? endIdx : script.length - 1;

                            // If dragging this track, show preview position
                            let displayStart = validStart;
                            let displayEnd = validEnd;
                            if (dragging?.trackId === track.id && hoverCutIdx !== null) {
                                if (dragging.edge === 'start') {
                                    displayStart = Math.min(hoverCutIdx, displayEnd);
                                } else {
                                    displayEnd = Math.max(hoverCutIdx, displayStart);
                                }
                            }

                            const leftOffset = displayStart * CUT_WIDTH;
                            const trackWidth = Math.max((displayEnd - displayStart + 1) * CUT_WIDTH, CUT_WIDTH);
                            const colors = BGM_COLORS[trackIndex % BGM_COLORS.length];
                            const isDraggingThis = dragging?.trackId === track.id;

                            return (
                                <div key={track.id} className="relative h-10 border-b border-white/5">
                                    {/* Track Bar */}
                                    <div
                                        className={`absolute top-1 h-8 rounded-lg border-2 ${colors.bg} ${colors.border} flex items-center transition-all ${isDraggingThis ? 'opacity-80' : ''
                                            }`}
                                        style={{
                                            left: `${leftOffset}px`,
                                            width: `${trackWidth}px`,
                                            transition: isDraggingThis ? 'none' : 'all 0.2s'
                                        }}
                                    >
                                        {/* Left Handle (Start) */}
                                        <div
                                            className={`absolute -left-1 top-0 h-full w-3 cursor-ew-resize flex items-center justify-center rounded-l ${colors.bg} hover:bg-white/30 transition-colors`}
                                            onMouseDown={(e) => { e.stopPropagation(); handleDragStart(track.id, 'start', displayStart); }}
                                        >
                                            <GripVertical size={12} className={colors.text} />
                                        </div>

                                        {/* Track Label */}
                                        <span className="flex-1 text-[10px] text-white font-medium truncate text-center select-none px-4">
                                            {track.label}
                                        </span>

                                        {/* Right Handle (End) */}
                                        <div
                                            className={`absolute -right-1 top-0 h-full w-3 cursor-ew-resize flex items-center justify-center rounded-r ${colors.bg} hover:bg-white/30 transition-colors`}
                                            onMouseDown={(e) => { e.stopPropagation(); handleDragStart(track.id, 'end', displayEnd); }}
                                        >
                                            <GripVertical size={12} className={colors.text} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="h-10 flex items-center justify-center text-gray-600 text-xs">
                            No BGM tracks. Use "Add Track" button above.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
