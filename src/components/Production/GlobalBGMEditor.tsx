import React, { useState } from 'react';
import { Music, Plus, Trash2, Clock, MoreHorizontal } from 'lucide-react';
import type { BGMTrack, BGMPreset } from '../../store/types';
import { BGMLibraryModal } from './BGMLibraryModal';

interface GlobalBGMEditorProps {
    tracks: BGMTrack[];
    onChange: (tracks: BGMTrack[]) => void;
    totalCuts: number;
}

export const GlobalBGMEditor: React.FC<GlobalBGMEditorProps> = ({ tracks, onChange, totalCuts }) => {
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    // Safety: ensure tracks is an array
    const safeTracks = tracks || [];

    const handleAddTrack = (preset: BGMPreset) => {
        const newTrack: BGMTrack = {
            id: `bgm_${Date.now()}`,
            url: preset.url,
            label: preset.title,
            startCutId: 1, // Default to first cut
            endCutId: totalCuts, // Default to last cut
            volume: 0.5,
            loop: true
        };
        onChange([...tracks, newTrack]);
    };

    const handleRemoveTrack = (id: string) => {
        onChange(tracks.filter(t => t.id !== id));
    };

    const handleUpdateTrack = (id: string, updates: Partial<BGMTrack>) => {
        onChange(tracks.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    return (
        <div className="bg-[#121212] border-t border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Music size={16} className="text-pink-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Background Music Tracks</h3>
                </div>
                <button
                    onClick={() => setIsLibraryOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded-lg text-xs font-bold transition-all"
                >
                    <Plus size={14} /> Add Track
                </button>
            </div>

            {/* Track List */}
            <div className="space-y-2">
                {safeTracks.map((track) => (
                    <div key={track.id} className="bg-white/5 border border-white/5 rounded-lg p-3 flex items-center gap-4 group hover:border-white/10 transition-all">
                        {/* Drag Handle (Visual Only) */}
                        <div className="text-gray-600 cursor-grab">
                            <MoreHorizontal size={14} className="rotate-90" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-gray-200 truncate">{track.label}</h4>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center gap-1">
                                    <Clock size={10} />
                                    Cut {track.startCutId} - {track.endCutId}
                                </span>
                                <span className="text-pink-400/50">
                                    {Math.round(track.volume * 100)}% Volume
                                </span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-4">
                            {/* Range Inputs */}
                            <div className="flex items-center gap-2 bg-black/20 p-1 rounded text-xs">
                                <span className="text-gray-500 px-1">Range:</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalCuts}
                                    value={track.startCutId}
                                    onChange={(e) => handleUpdateTrack(track.id, { startCutId: parseInt(e.target.value) || 1 })}
                                    className="w-10 bg-transparent text-center text-white border-b border-white/10 focus:border-pink-500 outline-none"
                                />
                                <span className="text-gray-600">-</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalCuts}
                                    value={track.endCutId}
                                    onChange={(e) => handleUpdateTrack(track.id, { endCutId: parseInt(e.target.value) || totalCuts })}
                                    className="w-10 bg-transparent text-center text-white border-b border-white/10 focus:border-pink-500 outline-none"
                                />
                            </div>

                            {/* Volume */}
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={track.volume}
                                onChange={(e) => handleUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                                className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-pink-500"
                                title={`Volume: ${Math.round(track.volume * 100)}%`}
                            />

                            {/* Delete */}
                            <button
                                onClick={() => handleRemoveTrack(track.id)}
                                className="p-1.5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}

                {safeTracks.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-xl bg-white/[0.02]">
                        <p className="text-xs text-gray-500">No background music added yet.</p>
                        <button
                            onClick={() => setIsLibraryOpen(true)}
                            className="mt-2 text-pink-400 text-xs font-bold hover:underline"
                        >
                            Browse Library
                        </button>
                    </div>
                )}
            </div>

            <BGMLibraryModal
                isOpen={isLibraryOpen}
                onClose={() => setIsLibraryOpen(false)}
                onSelect={handleAddTrack}
            />
        </div>
    );
};
