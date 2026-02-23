import React, { useState, useRef, useEffect } from 'react';
import { X, Play, Pause, Music, Plus, Upload, Loader2, Wand2 } from 'lucide-react';
import { BGM_LIBRARY, getBgmByCategory } from '../../data/bgmLibrary';
import type { BGMPreset } from '../../store/types';
import { saveToIdb } from '../../utils/imageStorage';
import { generateGeminiMusic } from '../../services/geminiMusic';
import { useWorkflowStore } from '../../store/workflowStore';

interface BGMLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (bgm: BGMPreset) => void;
}

export const BGMLibraryModal: React.FC<BGMLibraryModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { apiKeys, id: projectId } = useWorkflowStore();
    const [activeTab, setActiveTab] = useState<'library' | 'upload' | 'ai'>('library');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const categories = Object.keys(getBgmByCategory());

    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // AI Generation state
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

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
                    setError(`Failed to play "${track.title}".`);
                    setPreviewTrackId(null);
                });
            }

            audio.onended = () => setPreviewTrackId(null);

            audioRef.current = audio;
            setPreviewTrackId(track.id);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('audio/')) {
            setError("Please upload an audio file (MP3, WAV, etc.)");
            return;
        }

        if (file.size > 20 * 1024 * 1024) { // 20MB limit
            setError("File size exceeds 20MB. Please upload a smaller file.");
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // Save to IDB
            const timestamp = Date.now();
            const fileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const key = `upload_${timestamp}_${fileName}`;
            const idbUrl = await saveToIdb('audio', key, base64);

            // Get duration
            const audio = new Audio(base64);
            const duration = await new Promise<number>((resolve) => {
                audio.onloadedmetadata = () => resolve(audio.duration);
                // Fallback if metadata fails
                setTimeout(() => resolve(0), 2000);
            });

            const newTrack: BGMPreset = {
                id: `user_${timestamp}`,
                title: file.name.split('.')[0],
                artist: 'User Upload',
                category: 'Uploaded',
                url: idbUrl,
                duration: Math.round(duration)
            };

            onSelect(newTrack);
            onClose();
        } catch (err) {
            console.error("Upload failed:", err);
            setError("Failed to upload audio file. please try again.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleGenerateAI = async () => {
        if (!aiPrompt.trim()) return;

        setIsGenerating(true);
        setError(null);

        try {
            const { idbUrl, duration } = await generateGeminiMusic(
                { prompt: aiPrompt, projectId: projectId || 'default' },
                apiKeys.gemini
            );

            const newTrack: BGMPreset = {
                id: `ai_${Date.now()}`,
                title: `AI: ${aiPrompt.slice(0, 20)}...`,
                artist: 'Gemini 3.1 Pro',
                category: 'AI Generated',
                url: idbUrl,
                duration: duration
            };

            onSelect(newTrack);
            onClose();
        } catch (err: any) {
            console.error("AI Generation failed:", err);
            setError(err.message || "AI Music generation failed. Please try again.");
        } finally {
            setIsGenerating(false);
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
                        <div className="p-2 bg-[var(--color-primary-dim)] rounded-lg text-[var(--color-primary)]">
                            <Music size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">배경음악</h2>
                            <p className="text-sm text-gray-400">배경음악을 선택하거나 AI로 생성하세요</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'library' ? 'border-[var(--color-primary)] text-white bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        라이브러리
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'upload' ? 'border-[var(--color-primary)] text-white bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        업로드
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'ai' ? 'border-[var(--color-primary)] text-white bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        AI 음악 생성
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-500/10 border-b border-red-500/20 p-3 text-red-400 text-xs text-center">
                        {error}
                    </div>
                )}

                {activeTab === 'library' && (
                    <>
                        {/* Categories */}
                        <div className="flex items-center gap-2 py-6 px-6 border-b border-white/10 overflow-x-auto scroller-hidden">
                            <button
                                onClick={() => setSelectedCategory('All')}
                                className={`h-10 px-6 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center justify-center ${selectedCategory === 'All' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                            >
                                모든 트랙
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`h-10 px-6 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center justify-center ${selectedCategory === cat ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
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
                                    <div key={track.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isPlaying ? 'bg-[var(--color-primary-dim)] border-[var(--color-primary)]/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
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
                                                    <span>{track.artist}</span>
                                                    <span>•</span>
                                                    <span>{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleSelect(track)}
                                            className="px-4 py-2 bg-white/10 hover:bg-white text-white hover:text-black rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                        >
                                            <Plus size={14} /> 선택하기
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {activeTab === 'upload' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                            <Upload size={32} className="text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">보유한 음원 업로드</h3>
                        <p className="text-gray-400 text-sm max-w-sm mb-8">
                            MP3 또는 WAV 파일을 업로드하세요. 이 프로젝트를 위해 브라우저 로컬 저장소에 보관됩니다.
                        </p>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept="audio/*"
                            className="hidden"
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className={`px-8 py-3 bg-white text-black rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-white/10 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                            {isUploading ? '업로드 중...' : '오디오 파일 선택'}
                        </button>

                        <div className="mt-6 text-[10px] text-gray-600">
                            최대 용량: 20MB • 지원 형식: MP3, WAV, AAC, M4A
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="flex-1 flex flex-col p-8">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                <Wand2 size={20} className="text-[var(--color-primary)]" /> AI 음악 생성기
                            </h3>
                            <p className="text-sm text-gray-400">원하는 분위기, 장르, 악기 등을 설명해 주세요.</p>
                        </div>

                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="예: 에너제틱한 신디사이저와 묵직한 베이스가 어우러진 신나는 업비트 K-팝 스타일 배경음악..."
                            className="w-full flex-1 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/50 resize-none mb-6"
                        />

                        <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                            <div className="text-xs text-gray-500">
                                Powered by <span className="text-[var(--color-primary)]/80 font-bold italic">Gemini 3.1 Pro</span>
                            </div>
                            <button
                                disabled={!aiPrompt.trim() || isGenerating}
                                onClick={handleGenerateAI}
                                className={`px-6 py-2 bg-[var(--color-primary)] text-black rounded-lg font-bold flex items-center gap-2 hover:bg-[var(--color-primary-hover)] transition-all ${(!aiPrompt.trim() || isGenerating) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                            >
                                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                {isGenerating ? '생성 중...' : '음악 생성하기'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer Info */}
                <div className="p-4 bg-white/5 border-t border-white/10 text-[10px] text-gray-500 text-center">
                    {activeTab === 'library'
                        ? '파일 위치: public/music/. 직접 MP3를 추가하려면 src/data/bgmLibrary.ts를 업데이트하세요.'
                        : activeTab === 'upload'
                            ? '업로드된 파일은 브라우저의 IndexedDB(idb://)에 안전하게 저장됩니다.'
                            : 'AI 음악 생성은 약 30~60초 정도 소요될 수 있습니다.'}
                </div>
            </div>
        </div >
    );
};
