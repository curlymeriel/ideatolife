import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2, Volume2, Settings } from 'lucide-react';
import type { ScriptCut } from '../../services/gemini';
import type { BGMTrack, BGMPreset } from '../../store/types';
import { resolveUrl, isIdbUrl } from '../../utils/imageStorage';
import { BGMLibraryModal } from './BGMLibraryModal';

interface TimelineViewProps {
    script: ScriptCut[];
    bgmTracks: BGMTrack[];
    currentCutIndex: number;
    onCutClick: (index: number) => void;
    onBGMUpdate: (tracks: BGMTrack[]) => void;
}

// Color palette for BGM tracks
const BGM_COLORS = [
    { bg: 'bg-pink-500/40', border: 'border-pink-500', text: 'text-pink-300', hover: 'hover:bg-pink-500/30' },
    { bg: 'bg-purple-500/40', border: 'border-purple-500', text: 'text-purple-300', hover: 'hover:bg-purple-500/30' },
    { bg: 'bg-blue-500/40', border: 'border-blue-500', text: 'text-blue-300', hover: 'hover:bg-blue-500/30' },
    { bg: 'bg-green-500/40', border: 'border-green-500', text: 'text-green-300', hover: 'hover:bg-green-500/30' },
    { bg: 'bg-yellow-500/40', border: 'border-yellow-500', text: 'text-yellow-300', hover: 'hover:bg-yellow-500/30' },
    { bg: 'bg-orange-500/40', border: 'border-orange-500', text: 'text-orange-300', hover: 'hover:bg-orange-500/30' },
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
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    const safeTracks = bgmTracks || [];
    const CUT_WIDTH = 120; // Increase width for better visibility
    const HEADER_WIDTH = 260; // Width of the track control column
    const totalWidth = script.length * CUT_WIDTH;

    // --- BGM Management Logic ---
    const handleAddTrack = (preset: BGMPreset) => {
        const newTrack: BGMTrack = {
            id: `bgm_${Date.now()}`,
            url: preset.url,
            label: preset.title,
            startCutId: script[0]?.id || 1, // Start at first cut
            endCutId: script[script.length - 1]?.id || 1, // End at last cut
            volume: 0.5,
            loop: true
        };
        onBGMUpdate([...safeTracks, newTrack]);
    };

    const handleRemoveTrack = (id: string) => {
        if (confirm('Delete this track?')) {
            onBGMUpdate(safeTracks.filter(t => t.id !== id));
        }
    };

    const handleUpdateTrack = (id: string, updates: Partial<BGMTrack>) => {
        onBGMUpdate(safeTracks.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    // --- Drag Logic ---
    const getCutIndexFromX = useCallback((clientX: number): number => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        // Adjust for the fixed header width
        const relativeX = clientX - (rect.left + HEADER_WIDTH) + scrollPosition;
        const cutIdx = Math.floor(relativeX / CUT_WIDTH);
        return Math.max(0, Math.min(script.length - 1, cutIdx));
    }, [scrollPosition, script.length, HEADER_WIDTH]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;
        const cutIdx = getCutIndexFromX(e.clientX);
        setHoverCutIdx(cutIdx);
    }, [dragging, getCutIndexFromX]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!dragging) return;

        const cutIdx = getCutIndexFromX(e.clientX);
        const cutId = script[cutIdx]?.id;

        if (cutId !== undefined) {
            const updatedTracks = safeTracks.map(track => {
                if (track.id === dragging.trackId) {
                    if (dragging.edge === 'start') {
                        // Ensure start is before end logic could be added here, 
                        // but simplified just sets ID for now.
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

    const handleDragStart = (trackId: string, edge: 'start' | 'end', currentCutIdx: number) => {
        setDragging({ trackId, edge, initialCutIdx: currentCutIdx });
        setHoverCutIdx(currentCutIdx);
    };

    // --- Scroll Logic ---
    const scrollLeft = () => setScrollPosition(prev => Math.max(0, prev - 400));
    const scrollRight = () => setScrollPosition(prev => Math.min(Math.max(0, totalWidth - 800), prev + 400));

    return (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden flex flex-col h-[320px]">
            {/* Toolbar Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 h-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Settings size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Timeline</span>
                    </div>
                    {dragging && (
                        <span className="text-[10px] bg-orange-600 text-black font-bold px-2 py-0.5 rounded-full animate-pulse uppercase tracking-widest">
                            {dragging.edge === 'start' ? 'Start' : 'End'} → Cut #{hoverCutIdx !== null ? hoverCutIdx + 1 : '?'}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
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
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                        onClick={() => setIsLibraryOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded text-xs font-bold transition-all border border-orange-500/20 shadow-lg shadow-orange-500/5"
                    >
                        <Plus size={12} /> Add Audio Track
                    </button>
                </div>
            </div>

            {/* Main Content Area (Split Pane) */}
            <div className="flex-1 flex overflow-hidden relative" ref={containerRef}>

                {/* 1. Left Column: Track Headers (Fixed) */}
                <div
                    className="shrink-0 bg-[#0f0f0f] border-r border-white/10 z-20 flex flex-col shadow-xl"
                    style={{ width: `${HEADER_WIDTH}px` }}
                >
                    {/* Header Row (matches Cut Thumbnails height) */}
                    <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Track Layers</span>
                        <Settings size={12} className="text-gray-600" />
                    </div>

                    {/* Track Headers List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {safeTracks.map((track, trackIndex) => (
                            <div key={track.id} className="h-12 border-b border-white/5 flex items-center px-2 gap-2 group hover:bg-white/5 transition-colors">
                                {/* Color Indicator & Move Handle */}
                                <div className={`w-1 h-8 rounded-full ${BGM_COLORS[trackIndex % BGM_COLORS.length].bg}`} />

                                {/* Volume Control & Info */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-[11px] font-bold text-gray-300 truncate" title={track.label}>
                                            {track.label}
                                        </span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Numeric Range Indicators/Inputs */}
                                            <div className="flex items-center gap-0.5 bg-black/40 px-1 rounded border border-white/5">
                                                <input
                                                    type="number"
                                                    value={script.findIndex(c => String(c.id) === String(track.startCutId)) + 1}
                                                    onChange={(e) => {
                                                        const idx = (parseInt(e.target.value) || 1) - 1;
                                                        const targetIdx = Math.max(0, Math.min(script.length - 1, idx));
                                                        handleUpdateTrack(track.id, { startCutId: script[targetIdx].id });
                                                    }}
                                                    className="w-6 bg-transparent text-[9px] text-center text-gray-400 focus:text-white outline-none"
                                                />
                                                <span className="text-gray-700 text-[8px]">-</span>
                                                <input
                                                    type="number"
                                                    value={script.findIndex(c => String(c.id) === String(track.endCutId)) + 1}
                                                    onChange={(e) => {
                                                        const idx = (parseInt(e.target.value) || 1) - 1;
                                                        const targetIdx = Math.max(0, Math.min(script.length - 1, idx));
                                                        handleUpdateTrack(track.id, { endCutId: script[targetIdx].id });
                                                    }}
                                                    className="w-6 bg-transparent text-[9px] text-center text-gray-400 focus:text-white outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleRemoveTrack(track.id)}
                                                className="text-gray-600 hover:text-red-400 p-0.5"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Volume2 size={10} className="text-gray-600" />
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={track.volume ?? 0.5}
                                            onChange={(e) => handleUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                                            className="flex-1 h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-gray-500 hover:accent-orange-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {safeTracks.length === 0 && (
                            <div className="p-4 text-center text-gray-600 text-[10px] opacity-50 mt-4 leading-relaxed">
                                No BGM tracks.<br />
                                Add one to start mixing.
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Right Column: Timeline Visuals (Scrollable) */}
                <div className="flex-1 overflow-hidden relative bg-[#0e0e0e]">
                    <div
                        className="absolute h-full flex flex-col transition-transform duration-200 ease-out will-change-transform"
                        style={{ transform: `translateX(-${scrollPosition}px)`, width: `${totalWidth}px` }}
                    >
                        {/* Top Row: Cut Thumbnails */}
                        <div className="h-16 flex border-b border-white/10">
                            {script.map((cut, index) => {
                                const isHovered = dragging && hoverCutIdx === index;
                                return (
                                    <div
                                        key={cut.id}
                                        className={`flex-shrink-0 cursor-pointer border-r border-white/5 relative group ${isHovered
                                            ? 'ring-2 ring-orange-500 bg-orange-500/10'
                                            : index === currentCutIndex
                                                ? 'bg-white/5'
                                                : 'hover:bg-white/5'
                                            }`}
                                        style={{ width: `${CUT_WIDTH}px` }}
                                        onClick={() => !dragging && onCutClick(index)}
                                    >
                                        <div className="absolute inset-0 p-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <ResolvedThumbnail
                                                src={cut.finalImageUrl || cut.draftImageUrl}
                                                alt={`Cut ${index + 1}`}
                                                className="w-full h-full object-cover rounded-sm"
                                            />
                                        </div>
                                        {/* Selection Indicator */}
                                        {index === currentCutIndex && (
                                            <div className="absolute inset-0 ring-2 ring-[var(--color-primary)] ring-inset rounded-sm z-10 pointer-events-none" />
                                        )}
                                        {/* Cut Number Label */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[1px] px-1 py-0.5 flex justify-between items-center">
                                            <span className={`text-[9px] font-bold ${index === currentCutIndex ? 'text-[var(--color-primary)]' : 'text-gray-400'}`}>
                                                #{index + 1}
                                            </span>
                                            <span className="text-[8px] text-gray-500">{cut.estimatedDuration}s</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Track Rows */}
                        <div className="flex-1 relative">
                            {/* Grid Lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                {script.map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-full border-r border-white/5"
                                        style={{ width: `${CUT_WIDTH}px` }}
                                    />
                                ))}
                            </div>

                            {/* Track Bars */}
                            {safeTracks.map((track, trackIndex) => {
                                const startIdx = script.findIndex(c => String(c.id) === String(track.startCutId));
                                const endIdx = script.findIndex(c => String(c.id) === String(track.endCutId));

                                const validStart = startIdx !== -1 ? startIdx : 0;
                                const validEnd = endIdx !== -1 ? endIdx : script.length - 1;

                                // Preview dragging state
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
                                    <div key={track.id} className="h-12 border-b border-white/5 relative">
                                        <div
                                            className={`absolute top-2 bottom-2 rounded-md border ${colors.bg} ${colors.border} flex items-center transition-all shadow-sm ${isDraggingThis ? 'opacity-80 scale-[1.01]' : 'hover:brightness-110'
                                                }`}
                                            style={{
                                                left: `${leftOffset}px`,
                                                width: `${trackWidth}px`,
                                                transition: isDraggingThis ? 'none' : 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}
                                        >
                                            {/* Left Grip */}
                                            <div
                                                className={`absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center rounded-l ${colors.bg} hover:bg-white/20 transition-colors z-10 group/grip`}
                                                onMouseDown={(e) => { e.stopPropagation(); handleDragStart(track.id, 'start', displayStart); }}
                                            >
                                                <GripVertical size={12} className={`${colors.text} opacity-50 group-hover/grip:opacity-100`} />
                                            </div>

                                            {/* Center Label (Clips if too small) */}
                                            <div className="flex-1 overflow-hidden px-5 flex items-center justify-center">
                                                <span className={`text-[10px] font-bold ${colors.text} truncate text-center select-none`}>
                                                    {track.label}
                                                </span>
                                            </div>

                                            {/* Right Grip */}
                                            <div
                                                className={`absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center rounded-r ${colors.bg} hover:bg-white/20 transition-colors z-10 group/grip`}
                                                onMouseDown={(e) => { e.stopPropagation(); handleDragStart(track.id, 'end', displayEnd); }}
                                            >
                                                <GripVertical size={12} className={`${colors.text} opacity-50 group-hover/grip:opacity-100`} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <BGMLibraryModal
                isOpen={isLibraryOpen}
                onClose={() => setIsLibraryOpen(false)}
                onSelect={handleAddTrack}
            />
        </div>
    );
};
