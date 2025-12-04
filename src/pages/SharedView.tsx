import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause } from 'lucide-react';

interface SharedData {
    seriesName: string;
    episodeName: string;
    thumbnailUrl: string | null;
    script: Array<{
        id: number;
        speaker: string;
        dialogue: string;
        estimatedDuration: number;
    }>;
    assets: Record<number, { imageUrl?: string; audioUrl?: string }>;
}

export const SharedView: React.FC = () => {
    const { shareId } = useParams<{ shareId: string }>();
    const [data, setData] = useState<SharedData | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentCutIndex, setCurrentCutIndex] = useState(0);

    useEffect(() => {
        if (shareId) {
            try {
                const decoded = atob(shareId);
                const parsed = JSON.parse(decoded);
                setData(parsed);
            } catch (error) {
                console.error('Invalid share link:', error);
            }
        }
    }, [shareId]);

    if (!data) {
        return (
            <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h2 className="text-2xl font-bold text-white">Loading...</h2>
                    <p className="text-[var(--color-text-muted)]">Preparing your shared content</p>
                </div>
            </div>
        );
    }

    const currentCut = data.script[currentCutIndex];
    const currentAsset = data.assets[currentCut?.id];

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-6">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-bold text-white">{data.seriesName}</h1>
                    <h2 className="text-xl text-[var(--color-primary)] mt-1">{data.episodeName}</h2>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-8">
                <div className="glass-panel aspect-video rounded-xl border border-[var(--color-border-highlight)] overflow-hidden">
                    <div className="relative h-full flex flex-col">
                        <div className="flex-1 bg-black relative">
                            {currentAsset?.imageUrl ? (
                                <img src={currentAsset.imageUrl} alt={`Cut ${currentCutIndex + 1}`} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600">No image available</div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                            <div className="absolute bottom-24 left-0 w-full text-center px-12">
                                <p className="text-2xl md:text-3xl font-medium text-white drop-shadow-lg leading-relaxed">"{currentCut?.dialogue}"</p>
                                <p className="text-sm text-gray-400 mt-2">{currentCut?.speaker}</p>
                            </div>
                        </div>

                        <div className="h-20 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center px-8 gap-6">
                            <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-black hover:scale-105 transition-transform">
                                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                            </button>

                            <div className="flex-1">
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Cut {currentCutIndex + 1} of {data.script.length}</span>
                                </div>
                                <div className="flex gap-2">
                                    {data.script.map((_, index) => (
                                        <button key={index} onClick={() => setCurrentCutIndex(index)} className={`flex-1 h-2 rounded-full transition-colors ${index === currentCutIndex ? 'bg-[var(--color-primary)]' : 'bg-gray-700 hover:bg-gray-600'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-8 text-sm text-gray-600">
                    Created with Idea to Life: Meriel's Idea Lab
                </div>
            </div>
        </div>
    );
};
