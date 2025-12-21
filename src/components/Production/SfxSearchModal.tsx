/**
 * SFX Search Modal Component
 * 
 * Allows users to search Freesound.org or upload local audio files
 */

import React, { useRef, useState, useEffect } from 'react';
import { X, Music, Upload, Eye, Search, Play, Pause, Loader2, Volume2, ExternalLink } from 'lucide-react';
import { searchSounds, downloadSoundPreview, formatDuration, getLicenseShort, type FreesoundResult } from '../../services/freesound';

interface SfxSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (sfx: { url: string; name: string; volume: number; freesoundId: number }) => void;
    currentSfxName?: string;
    sceneDescription?: string;
    geminiApiKey?: string;
    freesoundApiKey?: string;
    initialQuery?: string;  // NEW: For AI-suggested SFX keywords
}

type TabType = 'search' | 'upload';

export const SfxSearchModal: React.FC<SfxSearchModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    currentSfxName,
    sceneDescription,
    freesoundApiKey,
    initialQuery
}) => {
    const [activeTab, setActiveTab] = useState<TabType>(freesoundApiKey ? 'search' : 'upload');
    const [selectedVolume, setSelectedVolume] = useState(0.5);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState(initialQuery || '');
    const [searchResults, setSearchResults] = useState<FreesoundResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [playingId, setPlayingId] = useState<number | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearchQuery(initialQuery || '');
            setSearchResults([]);
            setError(null);
            setPlayingId(null);
        }
    }, [isOpen, initialQuery]);

    // Handle search
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        if (!freesoundApiKey) {
            setError('Freesound API Key가 필요합니다. 사이드바 API Config에서 설정하세요.');
            return;
        }

        setIsSearching(true);
        setError(null);
        setSearchResults([]);

        try {
            const response = await searchSounds(searchQuery, freesoundApiKey, {
                pageSize: 12,
                sort: 'rating_desc',
                filter: 'duration:[0 TO 30]'  // Max 30 seconds
            });
            setSearchResults(response.results);
            if (response.results.length === 0) {
                setError('검색 결과가 없습니다. 다른 키워드를 시도해보세요.');
            }
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    // Handle preview play/pause
    const handlePlayPreview = (sound: FreesoundResult) => {
        if (playingId === sound.id) {
            // Stop current
            audioRef.current?.pause();
            setPlayingId(null);
        } else {
            // Play new
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const audio = new Audio(sound.previews['preview-hq-mp3']);
            audio.volume = selectedVolume;
            audio.onended = () => setPlayingId(null);
            audio.play();
            audioRef.current = audio;
            setPlayingId(sound.id);
        }
    };

    // Handle select from Freesound
    const handleSelectSound = async (sound: FreesoundResult) => {
        setIsDownloading(true);
        setError(null);

        try {
            const dataUrl = await downloadSoundPreview(sound);
            onSelect({
                url: dataUrl,
                name: sound.name,
                volume: selectedVolume,
                freesoundId: sound.id
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Download failed');
        } finally {
            setIsDownloading(false);
        }
    };

    // Handle manual file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            setError('Please select an audio file (MP3, WAV, OGG, etc.)');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('File too large. Maximum size is 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            onSelect({
                url: dataUrl,
                name: file.name.replace(/\.[^/.]+$/, ''),
                volume: selectedVolume,
                freesoundId: 0
            });
            onClose();
        };
        reader.onerror = () => setError('Failed to read file');
        reader.readAsDataURL(file);
    };

    // Cleanup audio on close
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
        };
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <Music className="text-purple-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Sound Effect (SFX)</h2>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Search Freesound or upload your own
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-[var(--color-text-muted)] hover:text-white" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--color-border)]">
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'search'
                            ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5'
                            : 'text-[var(--color-text-muted)] hover:text-white'
                            }`}
                    >
                        <Search size={14} className="inline mr-2" />
                        Freesound 검색
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'upload'
                            ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5'
                            : 'text-[var(--color-text-muted)] hover:text-white'
                            }`}
                    >
                        <Upload size={14} className="inline mr-2" />
                        파일 업로드
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                    {/* Current SFX Info */}
                    {currentSfxName && (
                        <div className="mb-4 p-3 bg-[var(--color-surface-highlight)] rounded-lg border border-[var(--color-border)] flex items-center gap-3">
                            <Eye size={16} className="text-[var(--color-text-muted)]" />
                            <div className="text-sm">
                                <span className="text-[var(--color-text-muted)] mr-2">Current:</span>
                                <span className="text-white font-medium">{currentSfxName}</span>
                            </div>
                        </div>
                    )}

                    {/* Volume Control */}
                    <div className="mb-4 flex items-center gap-3">
                        <Volume2 size={16} className="text-gray-500" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={selectedVolume}
                            onChange={(e) => setSelectedVolume(parseFloat(e.target.value))}
                            className="flex-1 accent-purple-500"
                        />
                        <span className="text-xs text-purple-400 w-12">{Math.round(selectedVolume * 100)}%</span>
                    </div>

                    {/* Search Tab */}
                    {activeTab === 'search' && (
                        <div className="space-y-4">
                            {/* Search Input */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search sounds... (e.g., rain, footsteps, thunder)"
                                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500 outline-none"
                                />
                                <button
                                    onClick={handleSearch}
                                    disabled={isSearching || !searchQuery.trim()}
                                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSearching ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Search size={16} />
                                    )}
                                    Search
                                </button>
                            </div>

                            {/* AI Suggestion hint */}
                            {sceneDescription && !searchQuery && (
                                <p className="text-xs text-gray-500 italic">
                                    💡 Scene: "{sceneDescription.slice(0, 60)}..."
                                </p>
                            )}

                            {/* No API key warning */}
                            {!freesoundApiKey && (
                                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                                    <p className="text-yellow-400 text-sm mb-2">⚠️ Freesound API Key가 필요합니다</p>
                                    <p className="text-gray-400 text-xs">
                                        사이드바 하단 "API Config" → "Freesound API Key" 입력
                                    </p>
                                </div>
                            )}

                            {/* Search Results */}
                            {searchResults.length > 0 && (
                                <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                                    {searchResults.map((sound) => (
                                        <div
                                            key={sound.id}
                                            className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] hover:border-purple-500/50 transition-colors group"
                                        >
                                            {/* Play button */}
                                            <button
                                                onClick={() => handlePlayPreview(sound)}
                                                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${playingId === sound.id
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400'
                                                    }`}
                                            >
                                                {playingId === sound.id ? (
                                                    <Pause size={16} />
                                                ) : (
                                                    <Play size={16} className="ml-0.5" />
                                                )}
                                            </button>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white font-medium truncate">{sound.name}</p>
                                                <p className="text-[10px] text-gray-500 flex items-center gap-2">
                                                    <span>{formatDuration(sound.duration)}</span>
                                                    <span>•</span>
                                                    <span>{getLicenseShort(sound.license)}</span>
                                                    <span>•</span>
                                                    <span>by {sound.username}</span>
                                                </p>
                                            </div>

                                            {/* Select button */}
                                            <button
                                                onClick={() => handleSelectSound(sound)}
                                                disabled={isDownloading}
                                                className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white rounded text-xs font-medium transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                            >
                                                {isDownloading ? 'Downloading...' : 'Select'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Freesound attribution */}
                            {searchResults.length > 0 && (
                                <p className="text-[10px] text-gray-600 text-center flex items-center justify-center gap-1">
                                    Powered by
                                    <a href="https://freesound.org" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                                        Freesound.org <ExternalLink size={10} className="inline" />
                                    </a>
                                </p>
                            )}
                        </div>
                    )}

                    {/* Upload Tab */}
                    {activeTab === 'upload' && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 hover:border-purple-500 hover:bg-purple-500/5 transition-all cursor-pointer group text-center"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="audio/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <div className="w-12 h-12 bg-[var(--color-surface)] rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                <Upload className="text-[var(--color-text-muted)] group-hover:text-purple-400" size={24} />
                            </div>
                            <h3 className="text-white font-medium mb-1 group-hover:text-purple-400 transition-colors">Click to Upload</h3>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                MP3, WAV, OGG (Max 5MB)
                            </p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
