import React, { useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateImage } from '../services/imageGen';
import { generateSpeech } from '../services/tts';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2, Image as ImageIcon, Music, ArrowRight, ArrowLeft, BarChart3, AlertTriangle, CheckCircle, Pause } from 'lucide-react';

export const Step4_QualityAssurance: React.FC = () => {
    const { script, apiKeys, ttsModel, imageModel, nextStep, prevStep, assetDefinitions, aspectRatio, masterStyle, styleAnchor, setScript } = useWorkflowStore();
    const navigate = useNavigate();

    const [batchLoading, setBatchLoading] = useState(false);
    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Calculate statistics
    const getMissingAssets = () => {
        const missingAudio = script.filter(cut => !cut.audioUrl || cut.audioUrl === 'mock:beep');
        const missingImages = script.filter(cut => !cut.finalImageUrl);
        return { missingAudio, missingImages };
    };

    const { missingAudio, missingImages } = getMissingAssets();
    const confirmedCount = script.filter(c => c.isConfirmed).length;
    const totalCount = script.length;
    const completionPercent = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

    // Sequential playback
    const currentCut = script[currentCutIndex];

    const handlePrevCut = () => {
        setCurrentCutIndex(Math.max(0, currentCutIndex - 1));
    };

    const handleNextCut = () => {
        setCurrentCutIndex(Math.min(script.length - 1, currentCutIndex + 1));
    };

    // Stop audio when cut changes
    React.useEffect(() => {
        const audio = document.getElementById(`sequential-audio`) as HTMLAudioElement;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        setIsPlaying(false);
    }, [currentCutIndex]);

    const handlePlaySequential = () => {
        if (!currentCut?.audioUrl) return;

        const audio = document.getElementById(`sequential-audio`) as HTMLAudioElement;
        if (audio) {
            if (isPlaying) {
                audio.pause();
                setIsPlaying(false);
            } else {
                // Ensure audio is loaded
                audio.load();

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            console.error('Playback failed:', error);
                        }
                        setIsPlaying(false);
                    });
                }

                setIsPlaying(true);
                audio.onended = () => {
                    setIsPlaying(false);
                    // Auto-advance to next cut
                    if (currentCutIndex < script.length - 1) {
                        setTimeout(() => {
                            setCurrentCutIndex(currentCutIndex + 1);
                        }, 500);
                    }
                };
                audio.onerror = () => {
                    console.error('Audio element error:', audio.error);
                    setIsPlaying(false);
                };
            }
        }
    };

    // Batch generation for missing assets
    const handleGenerateMissing = async () => {
        setBatchLoading(true);
        const { missingAudio, missingImages } = getMissingAssets();

        try {
            // Generate missing audio
            for (const cut of missingAudio) {
                if (!cut.dialogue) continue;

                try {
                    console.log(`[Batch Audio] Generating for cut ${cut.id}`);
                    const audioUrl = await generateSpeech(cut.dialogue, 'en-US-Neural2-A', apiKeys.googleCloud, ttsModel);

                    // Update script
                    const updatedScript = script.map(c =>
                        c.id === cut.id ? { ...c, audioUrl } : c
                    );
                    setScript(updatedScript);
                    console.log(`[Batch Audio] Success for cut ${cut.id}`);
                } catch (error) {
                    console.error(`[Batch Audio] Failed for cut ${cut.id}:`, error);
                }
            }

            // Generate missing images
            for (const cut of missingImages) {
                if (!cut.visualPrompt) continue;

                try {
                    console.log(`[Batch Image] Generating for cut ${cut.id}`);

                    // Build reference images (same logic as Step 4)
                    const referenceImages: string[] = [];
                    Object.values(assetDefinitions || {}).forEach((asset: any) => {
                        if (cut.visualPrompt.toLowerCase().includes(asset.name.toLowerCase())) {
                            const imageToUse = asset.draftImage || asset.referenceImage;
                            if (imageToUse) {
                                referenceImages.push(imageToUse);
                            }
                        }
                    });

                    let stylePrompt = '';
                    if (masterStyle?.description) {
                        stylePrompt += `\n\n[Master Visual Style]\n${masterStyle.description}`;
                    }
                    if (styleAnchor?.prompts) {
                        stylePrompt += `\n\n[Style Details]\n${JSON.stringify(styleAnchor.prompts)}`;
                    }

                    const finalPrompt = cut.visualPrompt + stylePrompt;

                    const result = await generateImage(
                        finalPrompt,
                        apiKeys.gemini,
                        referenceImages.length > 0 ? referenceImages : undefined,
                        aspectRatio,
                        imageModel
                    );

                    const updatedScript = script.map(c =>
                        c.id === cut.id ? { ...c, finalImageUrl: result.url } : c
                    );
                    setScript(updatedScript);
                    console.log(`[Batch Image] Success for cut ${cut.id}`);
                } catch (error) {
                    console.error(`[Batch Image] Failed for cut ${cut.id}:`, error);
                }
            }

            alert('Batch generation complete!');
        } catch (error) {
            console.error('Batch generation error:', error);
            alert('Some assets failed to generate. Check console for details.');
        } finally {
            setBatchLoading(false);
        }
    };

    const handleFinish = () => {
        nextStep();
        navigate('/step/5');
    };

    // Helper to get aspect ratio padding
    const getAspectRatioPadding = (ratio: string) => {
        const ratioMap: Record<string, string> = {
            '16:9': '56.25%',
            '9:16': '177.78%',
            '1:1': '100%',
            '2.35:1': '42.55%'
        };
        return ratioMap[ratio] || '56.25%';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            {/* Header */}
            <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold text-white tracking-tight">Quality Assurance & Review</h2>
                <p className="text-[var(--color-text-muted)] text-lg">
                    Review your complete episode before final export
                </p>
            </div>

            {/* Statistics Panel */}
            <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="text-[var(--color-primary)]" size={24} />
                    <h3 className="text-xl font-bold text-white">Project Statistics</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-[var(--color-surface)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="text-green-500" size={20} />
                            <span className="text-sm text-[var(--color-text-muted)]">Confirmed Cuts</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{confirmedCount}/{totalCount}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">{completionPercent}% complete</p>
                    </div>

                    <div className="bg-[var(--color-surface)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="text-yellow-500" size={20} />
                            <span className="text-sm text-[var(--color-text-muted)]">Missing Audio</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{missingAudio.length}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">cuts need audio</p>
                    </div>

                    <div className="bg-[var(--color-surface)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="text-orange-500" size={20} />
                            <span className="text-sm text-[var(--color-text-muted)]">Missing Images</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{missingImages.length}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">cuts need images</p>
                    </div>
                </div>

                {(missingAudio.length > 0 || missingImages.length > 0) && (
                    <button
                        onClick={handleGenerateMissing}
                        disabled={batchLoading}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-black font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {batchLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Generating Missing Assets...
                            </>
                        ) : (
                            <>
                                <Play size={20} />
                                Generate Missing Assets ({missingAudio.length} audio + {missingImages.length} images)
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Sequential Viewer */}
            {script.length > 0 && currentCut && (
                <div className="glass-panel p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Play className="text-[var(--color-primary)]" size={24} />
                            Sequential Viewer
                        </h3>
                        <span className="text-sm text-[var(--color-text-muted)]">
                            Cut {currentCutIndex + 1} of {script.length}
                        </span>
                    </div>

                    {/* Image Display */}
                    <div className="mb-4">
                        {currentCut.finalImageUrl ? (
                            <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-hidden relative" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                <img
                                    src={currentCut.finalImageUrl}
                                    alt={`Cut ${currentCut.id}`}
                                    className="absolute inset-0 w-full h-full object-contain"
                                />
                            </div>
                        ) : (
                            <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] border-dashed rounded-lg flex items-center justify-center text-center p-12" style={{ paddingBottom: getAspectRatioPadding(aspectRatio || '16:9') }}>
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                                    <ImageIcon size={48} className="text-gray-600" />
                                    <p className="text-[var(--color-text-muted)]">No image generated</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dialogue & Controls */}
                    <div className="bg-[var(--color-surface)] p-4 rounded-lg mb-4">
                        <p className="text-sm text-[var(--color-primary)] font-bold mb-1">{currentCut.speaker}</p>
                        <p className="text-white text-lg italic">"{currentCut.dialogue}"</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-2">{currentCut.visualPrompt}</p>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={handlePrevCut}
                            disabled={currentCutIndex === 0}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ArrowLeft size={18} />
                            Previous
                        </button>

                        {currentCut.audioUrl && (
                            <>
                                <button
                                    onClick={handlePlaySequential}
                                    className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-black font-bold transition-all"
                                >
                                    {isPlaying ? (
                                        <>
                                            <Pause size={20} />
                                            Pause
                                        </>
                                    ) : (
                                        <>
                                            <Play size={20} />
                                            Play
                                        </>
                                    )}
                                </button>
                                {currentCut.audioUrl !== 'mock:beep' && (
                                    <audio
                                        id="sequential-audio"
                                        src={currentCut.audioUrl}
                                        preload="metadata"
                                    />
                                )}
                            </>
                        )}

                        <button
                            onClick={handleNextCut}
                            disabled={currentCutIndex === script.length - 1}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Grid Overview */}
            <div className="glass-panel p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <ImageIcon className="text-[var(--color-primary)]" size={24} />
                    All Cuts Overview
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {script.map((cut, index) => {
                        const hasAudio = !!cut.audioUrl;
                        const hasImage = !!cut.finalImageUrl;
                        const isComplete = hasAudio && hasImage && cut.isConfirmed;
                        const hasIssues = !hasAudio || !hasImage;

                        return (
                            <div
                                key={cut.id}
                                onClick={() => setCurrentCutIndex(index)}
                                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${currentCutIndex === index
                                    ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/50'
                                    : isComplete
                                        ? 'border-green-500/50'
                                        : hasIssues
                                            ? 'border-yellow-500/50'
                                            : 'border-[var(--color-border)]'
                                    }`}
                            >
                                {hasImage ? (
                                    <div className="aspect-video bg-[var(--color-bg)]">
                                        <img
                                            src={cut.finalImageUrl}
                                            alt={`Cut ${cut.id}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="aspect-video bg-[var(--color-bg)] flex items-center justify-center">
                                        <ImageIcon size={24} className="text-gray-600" />
                                    </div>
                                )}

                                {/* Overlay with cut number and status */}
                                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white text-xs font-bold">#{cut.id}</span>
                                        <div className="flex gap-1">
                                            {!hasAudio && <Music size={12} className="text-yellow-500" />}
                                            {!hasImage && <ImageIcon size={12} className="text-orange-500" />}
                                            {isComplete && <CheckCircle size={12} className="text-green-500" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6">
                <button
                    onClick={() => { prevStep(); navigate('/step/3'); }}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg hover:bg-[var(--color-surface-highlight)] text-[var(--color-text-muted)] hover:text-white transition-all"
                >
                    <ArrowLeft size={20} />
                    Back to Step 3
                </button>

                <button
                    onClick={handleFinish}
                    className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-105 transition-all"
                >
                    Next Step
                    <ArrowRight size={24} />
                </button>
            </div>
        </div>
    );
};
