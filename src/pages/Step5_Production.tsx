import React, { useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateImage } from '../services/imageGen';
import { generateSpeech } from '../services/tts';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2, Image as ImageIcon, Music, ArrowRight } from 'lucide-react';

export const Step5_Production: React.FC = () => {
    const { script, apiKeys, ttsModel, imageModel, updateAsset, nextStep, assetDefinitions, assets, aspectRatio } = useWorkflowStore();
    const navigate = useNavigate();

    const [productionStatus, setProductionStatus] = useState<Record<number, { audio: 'pending' | 'loading' | 'done' | 'error', image: 'pending' | 'loading' | 'done' | 'error' }>>({});
    const [progress, setProgress] = useState(0);
    const [playingAudio, setPlayingAudio] = useState<number | null>(null);

    // Reusable AudioContext for mock beeps (prevents memory leaks)
    const audioContextRef = React.useRef<AudioContext | null>(null);

    // Auto-cleanup: Remove stale audio URLs when component loads
    React.useEffect(() => {
        if (assets) {
            Object.entries(assets).forEach(([key, assetArray]) => {
                const primaryAsset = Array.isArray(assetArray) ? assetArray[0] : assetArray;
                // @ts-ignore
                if (primaryAsset && primaryAsset.audioUrl && primaryAsset.audioUrl.startsWith('data:audio/')) {
                    console.log(`[Cleanup] Removing stale audio data for cut ${key}`);
                    updateAsset(Number(key), { audioUrl: undefined });
                }
            });
        }
    }, []);

    // Cleanup AudioContext on unmount
    React.useEffect(() => {
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, []);

    const handleClearAllAudio = () => {
        console.log('[Manual Clear] Clearing all audio data');
        script.forEach(cut => {
            updateAsset(cut.id, { audioUrl: undefined });
        });
        setProductionStatus({});
        setProgress(0);
        alert('All audio data cleared! Click "Start Production Batch" again.');
    };

    const startProduction = async () => {
        // Initialize status
        const initialStatus: any = {};
        script.forEach(cut => {
            initialStatus[cut.id] = { audio: 'pending', image: 'pending' };
        });
        setProductionStatus(initialStatus);
        setProgress(0);

        let completedTasks = 0;
        const totalTasks = script.length * 2;

        const updateProgress = () => {
            completedTasks++;
            setProgress(Math.round((completedTasks / totalTasks) * 100));
        };

        // Process each cut
        const promises = script.map(async (cut: any) => {
            // Audio Generation
            setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], audio: 'loading' } }));
            try {
                console.log(`[Audio] Generating for cut ${cut.id}:`, cut.dialogue);
                const audioUrl = await generateSpeech(cut.dialogue, 'en-US-Neural2-A', apiKeys.googleCloud, ttsModel);
                console.log(`[Audio] Generated successfully for cut ${cut.id}:`, audioUrl?.substring(0, 50) + '...');
                updateAsset(cut.id, { audioUrl });
                setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], audio: 'done' } }));
            } catch (e: any) {
                console.error(`[Audio] Failed for cut ${cut.id}:`, e.message || e);
                setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], audio: 'error' } }));
            } finally {
                updateProgress();
            }

            // Image Generation
            setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], image: 'loading' } }));
            try {
                // Collect reference images from assetDefinitions for this cut
                const referenceImages: string[] = [];

                // Check if any assets are mentioned in the visual prompt
                Object.values(assetDefinitions || {}).forEach((asset: any) => {
                    if (cut.visualPrompt.toLowerCase().includes(asset.name.toLowerCase())) {
                        // Prioritize draftImage, fallback to referenceImage
                        if (asset.draftImage) {
                            referenceImages.push(asset.draftImage);
                        } else if (asset.referenceImage) {
                            referenceImages.push(asset.referenceImage);
                        }
                    }
                });

                // Use the first available reference image (can be extended to use multiple)
                const referenceImage = referenceImages.length > 0 ? referenceImages[0] : undefined;

                const result = await generateImage(
                    cut.visualPrompt,
                    apiKeys.gemini,
                    referenceImage ? [referenceImage] : undefined,
                    aspectRatio,
                    imageModel
                );
                updateAsset(cut.id, { imageUrl: result.urls[0] });
                setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], image: 'done' } }));
            } catch (e) {
                setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], image: 'error' } }));
                console.error(e);
            } finally {
                updateProgress();
            }
        });

        await Promise.all(promises);
    };

    const handleFinish = () => {
        nextStep();
        navigate('/step/5');
    };

    const handlePlayAudio = (cutId: number) => {
        const assetArray = assets?.[cutId];
        const audioUrl = Array.isArray(assetArray) ? assetArray[0]?.audioUrl : (assetArray as any)?.audioUrl;
        console.log(`[Playback] Attempting to play cut ${cutId}, audioUrl:`, audioUrl);

        if (!audioUrl) {
            console.warn(`[Playback] No audio URL for cut ${cutId}`);
            return;
        }

        // Stop currently playing audio
        if (playingAudio !== null) {
            const currentAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement;
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            setPlayingAudio(null);
        }

        // Handle Mock Beep
        if (audioUrl === 'mock:beep') {
            console.log(`[Playback] Playing mock beep for cut ${cutId}`);
            try {
                // Reuse or create AudioContext
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    if (!AudioContext) {
                        alert('Web Audio API is not supported in this browser.');
                        return;
                    }
                    audioContextRef.current = new AudioContext();
                }

                const ctx = audioContextRef.current;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime); // 440Hz
                gain.gain.setValueAtTime(0.1, ctx.currentTime); // Lower volume

                osc.start();
                setPlayingAudio(cutId);

                // Stop after 0.5 seconds
                setTimeout(() => {
                    osc.stop();
                    setPlayingAudio(null);
                }, 500);
            } catch (e) {
                console.error('[Playback] Failed to play mock beep:', e);
            }
            return;
        }

        // Play standard audio
        const audio = document.getElementById(`audio-${cutId}`) as HTMLAudioElement;
        if (audio) {
            if (playingAudio === cutId) {
                audio.pause();
                setPlayingAudio(null);
            } else {
                audio.play().then(() => {
                    console.log(`[Playback] Started playing cut ${cutId}`);
                }).catch((error) => {
                    console.error(`[Playback] Failed to play cut ${cutId}:`, error);
                    alert(`Playback failed: ${error.message}`);
                });
                setPlayingAudio(cutId);
                audio.onended = () => setPlayingAudio(null);
            }
        }
    };

    const isProducing = progress > 0 && progress < 100;
    const isDone = progress === 100;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="text-center space-y-4 mb-8">
                <h2 className="text-4xl font-bold text-white tracking-tight">Asset Production</h2>
                <p className="text-[var(--color-text-muted)] text-lg">
                    Generating high-fidelity audio and visuals for {script.length} shots.
                </p>
            </div>

            {/* Progress Bar */}
            <div className="glass-panel p-8 space-y-4">
                <div className="flex justify-between text-sm font-medium text-gray-400">
                    <span>Overall Progress</span>
                    <span>{progress}%</span>
                </div>
                <div className="w-full h-4 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                    <div
                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-orange-600 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {!isProducing && !isDone && (
                    <div className="flex justify-center gap-4 pt-4">
                        <button onClick={startProduction} className="btn-primary flex items-center gap-3 px-8 py-4 text-lg">
                            <Play size={20} fill="currentColor" />
                            Start Production Batch
                        </button>
                        <button onClick={handleClearAllAudio} className="px-6 py-4 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors text-sm">
                            Clear All Audio
                        </button>
                    </div>
                )}
            </div>

            {/* Grid of Cuts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {script.map((cut) => {
                    const status = productionStatus[cut.id] || { audio: 'pending', image: 'pending' };
                    const assetArray = assets?.[cut.id];
                    const audioUrl = Array.isArray(assetArray) ? assetArray[0]?.audioUrl : (assetArray as any)?.audioUrl;

                    return (
                        <div key={cut.id} className="glass-panel p-5 space-y-4 relative overflow-hidden group">
                            <div className="flex justify-between items-start">
                                <span className="w-8 h-8 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
                                    {cut.id}
                                </span>
                                <div className="flex gap-2">
                                    <StatusIcon type="audio" status={status.audio} />
                                    <StatusIcon type="image" status={status.image} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-sm text-gray-300 line-clamp-2 italic">"{cut.dialogue}"</p>
                                <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{cut.visualPrompt}</p>
                            </div>

                            {/* Audio Player */}
                            {audioUrl && (
                                <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                                    <button
                                        onClick={() => handlePlayAudio(cut.id)}
                                        className={`p-2 rounded-full transition-all ${playingAudio === cut.id
                                            ? 'bg-[var(--color-primary)] text-black'
                                            : 'bg-[var(--color-surface)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-black'
                                            }`}
                                        title="Play Audio"
                                    >
                                        {playingAudio === cut.id ? (
                                            <Music size={16} className="animate-pulse" />
                                        ) : (
                                            <Play size={16} />
                                        )}
                                    </button>
                                    <span className="text-xs text-gray-400">
                                        {playingAudio === cut.id ? 'Playing...' : 'Click to play audio'}
                                    </span>
                                    {audioUrl !== 'mock:beep' && (
                                        <audio
                                            key={audioUrl}
                                            id={`audio-${cut.id}`}
                                            src={audioUrl}
                                            preload="metadata"
                                            onError={(e) => {
                                                const target = e.target as HTMLAudioElement;
                                                console.error(`[Playback] Error playing audio for cut ${cut.id}:`, target.error);
                                                setProductionStatus(prev => ({ ...prev, [cut.id]: { ...prev[cut.id], audio: 'error' } }));
                                                alert(`Audio playback failed for cut ${cut.id}.\nError code: ${target.error?.code}`);
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Loading Overlay */}
                            {(status.audio === 'loading' || status.image === 'loading') && (
                                <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center">
                                    <Loader2 className="animate-spin text-[var(--color-primary)]" size={24} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {isDone && (
                <div className="flex justify-end pt-6 pb-12">
                    <button
                        onClick={handleFinish}
                        className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-105 transition-all sticky bottom-8"
                    >
                        Next Step
                        <ArrowRight size={24} />
                    </button>
                </div>
            )}
        </div>
    );
};

const StatusIcon = ({ type, status }: { type: 'audio' | 'image', status: string }) => {
    const Icon = type === 'audio' ? Music : ImageIcon;

    let colorClass = 'text-gray-600';
    if (status === 'loading') colorClass = 'text-[var(--color-primary)] animate-pulse';
    if (status === 'done') colorClass = 'text-green-400';
    if (status === 'error') colorClass = 'text-red-400';

    return (
        <div className={`p-1.5 rounded-md bg-[rgba(0,0,0,0.2)] ${colorClass}`}>
            <Icon size={14} />
        </div>
    );
};
