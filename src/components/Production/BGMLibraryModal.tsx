import React, { useState, useRef, useEffect } from 'react';
import { X, Play, Pause, Music, Plus } from 'lucide-react';
import { BGM_LIBRARY, getBgmByCategory } from '../../data/bgmLibrary';
import type { BGMPreset } from '../../store/types';

interface BGMLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (bgm: BGMPreset) => void;
}

export const BGMLibraryModal: React.FC<BGMLibraryModalProps> = ({ isOpen, onClose, onSelect }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const categories = Object.keys(getBgmByCategory());

    const [error, setError] = useState<string | null>(null);

    // Clean up audio on unmount or close
    useEffect(() => {
        if (!isOpen && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPreviewTrackId(null);
            setError(null);
        }
    }, [isOpen]);

    const handlePreview = (track: BGMPreset) => {
        setError(null);
        if (previewTrackId === track.id) {
            // Pause
            audioRef.current?.pause();
            setPreviewTrackId(null);
        } else {
            // Play new
            if (audioRef.current) audioRef.current.pause();

            const audio = new Audio(track.url);
            audio.volume = 0.5;

            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.error("Preview play failed:", e);
                    setError(`Failed to play "${track.title}". File may be missing in public/music/.`);
                    setPreviewTrackId(null);
                });
            }

            audio.onended = () => setPreviewTrackId(null);

            audioRef.current = audio;
            setPreviewTrackId(track.id);
        }
    };

    const handleSelect = (track: BGMPreset) => {
        if (audioRef.current) audioRef.current.pause();
        onSelect(track);
        onClose();
    };

    if (!isOpen) return null;

    const filteredTracks = selectedCategory === 'All'
        ? BGM_LIBRARY
        : BGM_LIBRARY.filter(t => t.category === selectedCategory);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                            <Music size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">BGM Library</h2>
                            <p className="text-sm text-gray-400">Select background music for your project</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-500/10 border-b border-red-500/20 p-3 text-red-400 text-xs text-center">
                        {error}
                    </div>
                )}

                {/* Categories */}
                <div className="flex gap-2 p-4 border-b border-white/10 overflow-x-auto">
                    <button
                        onClick={() => setSelectedCategory('All')}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedCategory === 'All' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                    >
                        All Tracks
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredTracks.map(track => {
                        const isPlaying = previewTrackId === track.id;
                        return (
                            <div key={track.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isPlaying ? 'bg-orange-500/10 border-orange-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => handlePreview(track)}
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-orange-500 text-black' : 'bg-white/10 text-gray-400 hover:text-white hover:bg-white/20'}`}
                                    >
                                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                                    </button>
                                    <div>
                                        <h4 className={`font-bold text-sm ${isPlaying ? 'text-orange-400' : 'text-white'}`}>{track.title}</h4>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span>{track.category}</span>
                                            <span>•</span>
                                            <span>{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSelect(track)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white text-white hover:text-black rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                >
                                    <Plus size={14} /> Select
                                </button>
                            </div>
                        );
                    })}

                    {filteredTracks.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            No tracks found in this category.
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-white/5 border-t border-white/10 text-[10px] text-gray-500 text-center">
                    Files are located in <code className="bg-black/20 px-1 rounded">public/music/</code>. Add your own MP3s there and update <code className="bg-black/20 px-1 rounded">src/data/bgmLibrary.ts</code>.
                </div>
            </div>
        </div >
    );
};
