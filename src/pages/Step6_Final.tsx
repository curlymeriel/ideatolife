import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { Play, Pause, Download, FileText, Monitor, Layout, ChevronRight, Film } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { generateSRT } from '../utils/srtGenerator';
import { exportVideo, type VideoCut } from '../utils/videoExporter';

export const Step6_Final = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const {
        script,
        seriesName,
        episodeName,
        targetDuration,
        thumbnailUrl
    } = useWorkflowStore();

    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [viewOnly, setViewOnly] = useState(false);
    const [showThumbnail, setShowThumbnail] = useState(true); // Start with thumbnail
    const [isPlaying, setIsPlaying] = useState(false);

    const [elapsedTime, setElapsedTime] = useState(0);

    // Check for Presentation Mode from URL
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('mode') === 'presentation') {
            setViewOnly(true);
        }
    }, [location.search]);

    const isPresentationMode = new URLSearchParams(location.search).get('mode') === 'presentation';

    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [blobCache, setBlobCache] = useState<Record<string, string>>({});
    const [audioDurations, setAudioDurations] = useState<Record<number, number>>({});
    const startTimeRef = useRef<number>(0);
    const blobCacheRef = useRef<Record<string, string>>({}); // Ref for cleanup

    // Video export state
    const [isExportingVideo, setIsExportingVideo] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');

    // 1. Optimize Assets (Convert Base64 to Blob URLs & Measure Audio)
    useEffect(() => {
        const optimizeAssets = async () => {
            const newCache: Record<string, string> = {};
            const newDurations: Record<number, number> = {};

            const processUrl = async (url: string) => {
                if (!url || url.startsWith('blob:') || url.startsWith('http')) return url;
                try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    return blobUrl;
                } catch (e) {
                    console.error("Failed to optimize asset:", e);
                    return url;
                }
            };

            const getAudioDuration = (url: string): Promise<number> => {
                return new Promise((resolve) => {
                    const audio = new Audio(url);
                    audio.onloadedmetadata = () => resolve(audio.duration);
                    audio.onerror = () => resolve(0);
                });
            };

            const promises = script.flatMap((cut, index) => {
                const tasks = [];
                if (cut.finalImageUrl) tasks.push(processUrl(cut.finalImageUrl).then(url => newCache[cut.finalImageUrl!] = url));
                if (cut.draftImageUrl) tasks.push(processUrl(cut.draftImageUrl).then(url => newCache[cut.draftImageUrl!] = url));

                if (cut.audioUrl) {
                    tasks.push(
                        processUrl(cut.audioUrl).then(async (url) => {
                            newCache[cut.audioUrl!] = url;
                            // Measure duration
                            const duration = await getAudioDuration(url);
                            if (duration > 0) {
                                newDurations[index] = duration;
                            }
                            return url;
                        })
                    );
                }
                return tasks;
            });

            await Promise.all(promises);

            // Update state and ref
            setBlobCache(newCache);
            blobCacheRef.current = newCache;
            setAudioDurations(newDurations);
            setAssetsLoaded(true);
        };

        optimizeAssets();

        return () => {
            // Cleanup Blob URLs using the ref
            Object.values(blobCacheRef.current).forEach(url => URL.revokeObjectURL(url));
            blobCacheRef.current = {};
        };
    }, [script]);

    // Helper to get optimized URL
    const getOptimizedUrl = (originalUrl?: string) => {
        if (!originalUrl) return undefined;
        return blobCache[originalUrl] || originalUrl;
    };

    // Helper to get effective duration (Max of estimated vs actual audio)
    const getCutDuration = (index: number) => {
        const cut = script[index];
        if (!cut) return 0;
        const audioDur = audioDurations[index] || 0;
        // Add a small buffer (0.5s) to audio duration to prevent abrupt cuts
        return Math.max(cut.estimatedDuration, audioDur > 0 ? audioDur + 0.5 : 0);
    };

    // Calculate actual duration from script (Dynamic)
    const actualDuration = script.reduce((sum, _, i) => sum + getCutDuration(i), 0);
    const durationDiff = Math.abs(actualDuration - targetDuration);
    const durationDiffPercent = (durationDiff / targetDuration) * 100;

    // Color code based on difference
    let durationColor = 'text-green-400'; // Within 10%
    if (durationDiffPercent > 10 && durationDiffPercent <= 20) durationColor = 'text-yellow-400';
    if (durationDiffPercent > 20) durationColor = 'text-red-400';

    // Auto-advance cuts logic (Wall-Clock Timer)
    useEffect(() => {
        let animationFrameId: number;

        const updateLoop = () => {
            if (!isPlaying || !startTimeRef.current) return;

            const now = Date.now();
            const totalElapsed = (now - startTimeRef.current) / 1000;
            setElapsedTime(totalElapsed);

            // Calculate current cut based on total elapsed time
            let accumulatedTime = 0;
            let foundIndex = -1;

            for (let i = 0; i < script.length; i++) {
                accumulatedTime += getCutDuration(i);
                if (totalElapsed < accumulatedTime) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex !== -1) {
                if (foundIndex !== currentCutIndex) {
                    setCurrentCutIndex(foundIndex);
                }
                animationFrameId = requestAnimationFrame(updateLoop);
            } else {
                // End of script
                setIsPlaying(false);
                setShowThumbnail(true);
                setCurrentCutIndex(0);
                setElapsedTime(0);
            }
        };

        if (isPlaying && !showThumbnail) {
            if (startTimeRef.current === 0) {
                // First start or resume
                startTimeRef.current = Date.now() - (elapsedTime * 1000);
            }
            animationFrameId = requestAnimationFrame(updateLoop);
        } else {
            // Paused
            startTimeRef.current = 0;
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, showThumbnail, script, currentCutIndex, audioDurations]);

    // Audio Playback Logic
    const audioRef = React.useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!audioRef.current) return;

        if (isPlaying && !showThumbnail) {
            const currentCut = script[currentCutIndex];
            const optimizedAudioUrl = getOptimizedUrl(currentCut?.audioUrl);

            if (optimizedAudioUrl) {
                // Check if source needs update
                // Note: audioRef.current.src is always absolute. optimizedAudioUrl might be blob: or data: (absolute)
                if (audioRef.current.src !== optimizedAudioUrl) {
                    audioRef.current.src = optimizedAudioUrl;
                    audioRef.current.load(); // Crucial for reliable playback on source change
                }

                // Always attempt to play if we are in playing state
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        // Ignore AbortError (happens when skipping fast)
                        if (e.name !== 'AbortError') {
                            console.error("Audio playback failed:", e);
                        }
                    });
                }
            } else {
                // No audio for this cut
                audioRef.current.pause();
            }
        } else {
            audioRef.current.pause();
        }
    }, [currentCutIndex, isPlaying, showThumbnail, blobCache]);

    // Preload Next Images (Keep simple image preloading)
    useEffect(() => {
        const PRELOAD_COUNT = 3;
        const startIndex = currentCutIndex + 1;
        const endIndex = Math.min(startIndex + PRELOAD_COUNT, script.length);

        for (let i = startIndex; i < endIndex; i++) {
            const cut = script[i];
            const imgUrl = getOptimizedUrl(cut?.finalImageUrl || cut?.draftImageUrl);
            if (imgUrl) {
                const img = new Image();
                img.src = imgUrl;
            }
        }
    }, [currentCutIndex, blobCache]);

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));
        const newTime = percentage * actualDuration;

        setElapsedTime(newTime);

        // Update start time reference to maintain sync
        if (isPlaying) {
            startTimeRef.current = Date.now() - (newTime * 1000);
        }

        // Find the cut corresponding to the new time
        let accumulatedTime = 0;
        let newCutIndex = 0;
        for (let i = 0; i < script.length; i++) {
            accumulatedTime += getCutDuration(i);
            if (newTime < accumulatedTime) {
                newCutIndex = i;
                break;
            }
        }
        setCurrentCutIndex(newCutIndex);
    };

    const handleExportZip = async () => {
        const zip = new JSZip();
        const folder = zip.folder(`${seriesName} - ${episodeName}`);

        if (folder) {
            // Metadata
            folder.file("metadata.txt", `Series: ${seriesName}\nEpisode: ${episodeName}\nTarget Duration: ${targetDuration}s\nActual Duration: ${actualDuration}s`);

            // Script as text
            const scriptText = script.map((cut, i) =>
                `[Cut ${i + 1}] ${cut.speaker}:\n${cut.dialogue}\n\nVisual: ${cut.visualPrompt}\n`
            ).join('\n---\n\n');
            folder.file("script.txt", scriptText);

            // SRT Subtitles
            const srtContent = generateSRT(script);
            folder.file("subtitles.srt", srtContent);

            // Speaker-separated audio structure
            const audioFolder = folder.folder("audio");
            if (audioFolder) {
                // Group by speaker
                // Group by speaker logic removed as it was unused placeholder


                // Note: Actual audio file adding would happen here if we had the blobs ready
                // For now, this structure is just a placeholder in the zip
            }

            // Generate zip
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${seriesName} - ${episodeName}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // Helper: Detect voice gender from speaker name (fallback for missing data)
        const getDefaultVoiceGender = (speaker: string): string => {
            const lower = speaker.toLowerCase();

            // Korean female keywords
            if (lower.includes('어머니') || lower.includes('엄마') || lower.includes('할머니') ||
                lower.includes('누나') || lower.includes('언니') || lower.includes('여자') ||
                lower.includes('소녀') || lower.includes('아가씨') || lower.includes('이모') || lower.includes('고모')) {
                return 'female';
            }

            // Korean male keywords
            if (lower.includes('아버지') || lower.includes('아빠') || lower.includes('할아버지') ||
                lower.includes('형') || lower.includes('오빠') || lower.includes('남자') ||
                lower.includes('소년') || lower.includes('삼촌') || lower.includes('이모부') || lower.includes('고모부')) {
                return 'male';
            }

            // English keywords
            if (lower.includes('hero') || lower.includes('male') || lower.includes('man') ||
                lower.includes('boy') || lower.includes('father') || lower.includes('dad') ||
                lower.includes('brother') || lower.includes('uncle')) {
                return 'male';
            }

            if (lower.includes('heroine') || lower.includes('female') || lower.includes('woman') ||
                lower.includes('girl') || lower.includes('mother') || lower.includes('mom') ||
                lower.includes('sister') || lower.includes('aunt')) {
                return 'female';
            }

            return 'neutral';
        };

        // Sheet 1: "by cut" - Detailed cut information
        let cumulativeTime = 0;
        const cutData = script.map((cut, index) => {
            const duration = getCutDuration(index);
            const startTime = cumulativeTime;
            const endTime = startTime + duration;
            cumulativeTime = endTime;

            return {
                'Cut #': index + 1,
                'Speaker': cut.speaker || '',
                'Dialogue': cut.dialogue || '',
                'Visual Description': cut.visualPrompt || '',
                'Language': cut.language || 'ko-KR',
                'Emotion': cut.emotion || '',
                'Emotion Intensity': cut.emotionIntensity || '',
                'Voice Gender': cut.voiceGender || getDefaultVoiceGender(cut.speaker || ''),
                'Voice Age': cut.voiceAge || 'adult',
                'Start Time': startTime.toFixed(2),
                'End Time': endTime.toFixed(2),
                'Duration': duration.toFixed(2),
                'Audio Duration': (audioDurations[index] || 0).toFixed(2),
                'Has Audio': cut.audioUrl ? 'Yes' : 'No',
                'Has Image': (cut.finalImageUrl || cut.draftImageUrl) ? 'Yes' : 'No'
            };
        });

        const wsCuts = XLSX.utils.json_to_sheet(cutData);
        wsCuts['!cols'] = [
            { wch: 6 },  // Cut #
            { wch: 15 }, // Speaker
            { wch: 50 }, // Dialogue
            { wch: 50 }, // Visual Description
            { wch: 10 }, // Language
            { wch: 12 }, // Emotion
            { wch: 12 }, // Emotion Intensity
            { wch: 12 }, // Voice Gender
            { wch: 10 }, // Voice Age
            { wch: 10 }, // Start Time
            { wch: 10 }, // End Time
            { wch: 10 }, // Duration
            { wch: 12 }, // Audio Duration
            { wch: 10 }, // Has Audio
            { wch: 10 }  // Has Image
        ];
        XLSX.utils.book_append_sheet(wb, wsCuts, "by cut");

        // Sheet 2: "pj" - Project metadata
        const { characters, episodeCharacters, seriesLocations, episodeLocations, masterStyle, assetDefinitions } = useWorkflowStore.getState();

        // Log potential duplicates for debugging
        const characterNames = characters.map(c => c.name);
        const episodeCharacterNames = episodeCharacters.map(c => c.name);
        const duplicateCharacters = characterNames.filter(name => episodeCharacterNames.includes(name));

        const locationNames = seriesLocations.map(l => l.name);
        const episodeLocationNames = episodeLocations.map(l => l.name);
        const duplicateLocations = locationNames.filter(name => episodeLocationNames.includes(name));

        if (duplicateCharacters.length > 0) {
            console.warn('[Excel Export] Duplicate characters found between series and episode:', duplicateCharacters);
        }
        if (duplicateLocations.length > 0) {
            console.warn('[Excel Export] Duplicate locations found between series and episode:', duplicateLocations);
        }

        const projectData = [
            { Field: 'Series Name', Value: seriesName || '' },
            { Field: 'Episode Name', Value: episodeName || '' },
            { Field: 'Episode Number', Value: useWorkflowStore.getState().episodeNumber || '' },
            { Field: 'Target Duration (s)', Value: targetDuration || '' },
            { Field: 'Actual Duration (s)', Value: actualDuration.toFixed(2) },
            { Field: 'Total Cuts', Value: script.length },
            { Field: 'Series Story', Value: useWorkflowStore.getState().seriesStory || '' },
            { Field: 'Episode Plot', Value: useWorkflowStore.getState().episodePlot || '' },
            { Field: 'Aspect Ratio', Value: useWorkflowStore.getState().aspectRatio || '' },
            { Field: '', Value: '' }, // Blank row
            { Field: '=== Characters ===', Value: '' },
            ...characters.map(c => ({ Field: `Character: ${c.name}`, Value: `${c.role} - ${c.description}` })),
            ...episodeCharacters.map(c => ({ Field: `Ep Character: ${c.name}`, Value: `${c.role} - ${c.description}` })),
            { Field: '', Value: '' }, // Blank row
            { Field: '=== Locations ===', Value: '' },
            ...seriesLocations.map(l => ({ Field: `Location: ${l.name}`, Value: l.description })),
            ...episodeLocations.map(l => ({ Field: `Ep Location: ${l.name}`, Value: l.description })),
            { Field: '', Value: '' }, // Blank row
            { Field: '=== Visual Style ===', Value: '' },
            { Field: 'Master Style', Value: masterStyle?.description || '' },
            { Field: 'Character Modifier', Value: masterStyle?.characterModifier || '' },
            { Field: 'Background Modifier', Value: masterStyle?.backgroundModifier || '' },
            { Field: '', Value: '' }, // Blank row
            { Field: '=== Key Visual Assets (Step 2) ===', Value: '' },
            ...Object.values(assetDefinitions || {}).map(asset => ({
                Field: `${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)}: ${asset.name}`,
                Value: asset.description
            })),
            { Field: '', Value: '' }, // Blank row
            { Field: 'Export Date', Value: new Date().toISOString() }
        ];

        const wsProject = XLSX.utils.json_to_sheet(projectData);
        wsProject['!cols'] = [
            { wch: 30 }, // Field
            { wch: 80 }  // Value
        ];
        XLSX.utils.book_append_sheet(wb, wsProject, "pj");

        XLSX.writeFile(wb, `${seriesName} - ${episodeName}.xlsx`);
    };

    const handleExportVideo = async () => {
        if (isExportingVideo) return;
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Preparing assets...');

        try {
            // Prepare cuts for exporter
            const videoCuts: VideoCut[] = script.map((cut, index) => ({
                imageUrl: getOptimizedUrl(cut.finalImageUrl || cut.draftImageUrl) || '',
                audioUrl: getOptimizedUrl(cut.audioUrl),
                duration: getCutDuration(index)
            })).filter(c => c.imageUrl); // Filter out cuts without images

            if (videoCuts.length === 0) {
                alert("No images found to export!");
                setIsExportingVideo(false);
                return;
            }

            const result = await exportVideo(videoCuts, (progress, status) => {
                setExportProgress(Math.round(progress));
                setExportStatus(status);
            });

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${seriesName} - ${episodeName} - VideoKit.${result.fileExtension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export video kit. Check console for details.");
        } finally {
            setIsExportingVideo(false);
            setExportProgress(0);
            setExportStatus('');
        }
    };

    const playerContent = (
        <div
            style={viewOnly ? {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999999,
                backgroundColor: 'black',
                margin: 0,
                padding: 0,
                overflow: 'hidden'
            } : undefined}
            className={`relative overflow-hidden transition-all duration-500 ${viewOnly ? '' : 'glass-panel aspect-video rounded-xl border border-[var(--color-border-highlight)]'}`}
        >

            {/* View Only Exit Button */}
            {viewOnly && (
                <>
                    {!isPresentationMode && (
                        <button
                            onClick={() => setViewOnly(false)}
                            className="absolute top-6 right-6 z-[100000] p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
                        >
                            <Layout size={24} />
                        </button>
                    )}

                    {/* Share URL */}
                    <div className="absolute top-6 left-6 z-[100000] flex items-center gap-3">
                        <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full text-white text-sm font-medium">
                            {window.location.origin}{window.location.pathname}?mode=presentation
                        </div>
                        <button
                            onClick={() => {
                                const url = `${window.location.origin}${window.location.pathname}?mode=presentation`;
                                navigator.clipboard.writeText(url);
                                alert('✅ Presentation URL copied to clipboard!');
                            }}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white text-sm font-medium transition-colors"
                        >
                            📤 Share
                        </button>
                    </div>
                </>
            )}

            {/* Main Visual Layer - Absolute Full Fill */}
            <div className="absolute inset-0 bg-black">
                {!assetsLoaded ? (
                    <div className="flex flex-col items-center justify-center h-full text-white">
                        <div className="w-12 h-12 border-4 border-white/20 border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
                        <p className="text-lg font-medium">Optimizing Assets...</p>
                        <p className="text-sm text-gray-400">Converting for smooth playback</p>
                    </div>
                ) : showThumbnail ? (
                    // Thumbnail Title Card
                    <>
                        <img
                            src={getOptimizedUrl(thumbnailUrl || script[0]?.finalImageUrl || script[0]?.draftImageUrl) || "https://placehold.co/1920x1080/1a1a1a/333333?text=No+Thumbnail"}
                            alt="Episode Thumbnail"
                            className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40" /> {/* Dim overlay for text readability */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 drop-shadow-2xl text-center px-8 tracking-tight">{episodeName || "Untitled Episode"}</h1>
                            <p className="text-2xl md:text-3xl text-gray-200 mb-16 drop-shadow-lg font-light tracking-wide">{seriesName || "Untitled Series"}</p>

                            <button
                                onClick={() => {
                                    setShowThumbnail(false);
                                    setIsPlaying(true);
                                    setElapsedTime(0);
                                    setCurrentCutIndex(0);
                                }}
                                className="group relative px-10 py-5 bg-white text-black rounded-full font-bold text-xl hover:scale-105 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                            >
                                <span className="relative z-10 flex items-center gap-3">
                                    <Play size={24} fill="currentColor" />
                                    Start Episode
                                </span>
                                <div className="absolute inset-0 rounded-full bg-white blur-lg opacity-50 group-hover:opacity-80 transition-opacity" />
                            </button>
                        </div>
                    </>
                ) : (
                    // Regular Cut Display
                    <>
                        <img
                            src={getOptimizedUrl(script[currentCutIndex]?.finalImageUrl || script[currentCutIndex]?.draftImageUrl) || "https://placehold.co/1920x1080/1a1a1a/333333?text=Generating..."}
                            alt={`Scene ${currentCutIndex + 1}`}
                            className="w-full h-full object-contain transition-opacity duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                        {/* Subtitles - Bottom aligned, smaller font */}
                        <div className="absolute bottom-28 left-0 w-full text-center px-12 md:px-32 z-20">
                            <p className="text-xl md:text-2xl font-medium text-white drop-shadow-lg leading-relaxed animate-fade-in">
                                "{script[currentCutIndex]?.dialogue}"
                            </p>
                            <p className="text-base text-[var(--color-primary)] mt-3 uppercase tracking-widest font-bold opacity-80">
                                {script[currentCutIndex]?.speaker}
                            </p>
                        </div>
                    </>
                )}
            </div>

            {/* Controls Bar - Fixed to Bottom */}
            <div className={`absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/90 to-transparent flex items-end pb-6 px-12 gap-8 z-50 transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
                >
                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                </button>

                <div className="flex-1 pb-2">
                    {/* Progress Bar */}
                    <div
                        onClick={handleSeek}
                        className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer group hover:h-2.5 transition-all duration-200"
                    >
                        <div
                            className="h-full bg-[var(--color-primary)] transition-all duration-100 ease-linear"
                            style={{ width: `${(elapsedTime / (actualDuration || 1)) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-sm text-gray-400 font-medium mt-2">
                        <span>{Math.floor(elapsedTime / 60)}:{(Math.floor(elapsedTime) % 60).toString().padStart(2, '0')}</span>
                        <span>{Math.floor(actualDuration / 60)}:{(actualDuration % 60).toString().padStart(2, '0')}</span>
                    </div>
                </div>

                <div className="pb-2 text-gray-400 font-medium">
                    CUT {currentCutIndex + 1} <span className="text-gray-600">/</span> {script.length}
                </div>
            </div>
        </div>
    );

    return (
        <div className={`max-w-6xl mx-auto transition-all duration-500 ${viewOnly ? 'scale-100' : ''}`}>

            {/* Breadcrumb Navigation */}
            {!viewOnly && (
                <div className="mb-6 flex items-center gap-2 text-sm">
                    <button
                        onClick={() => navigate('/step/1')}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        {seriesName || 'Series'}
                    </button>
                    <ChevronRight size={14} className="text-gray-600" />
                    <button
                        onClick={() => navigate('/step/5')}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        {episodeName || 'Episode'}
                    </button>
                    <ChevronRight size={14} className="text-gray-600" />
                    <button
                        onClick={() => navigate('/step/4')}
                        className="text-[var(--color-primary)] font-medium"
                    >
                        Cut {currentCutIndex + 1}
                    </button>
                </div>
            )}

            {/* Header Actions */}
            {!viewOnly && (
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-4xl font-bold text-white tracking-tight">Final Assembly</h2>
                        <p className="text-[var(--color-text-muted)] mt-2">Review and export your finished storybook.</p>
                        <div className="mt-3 flex items-center gap-4 text-sm">
                            <span className="text-gray-400">Target Duration: {Math.floor(targetDuration / 60)}:{(targetDuration % 60).toString().padStart(2, '0')}</span>
                            <span className="text-gray-600">|</span>
                            <span className={`font-medium ${durationColor}`}>
                                Actual: {Math.floor(actualDuration / 60)}:{(actualDuration % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setViewOnly(true)}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <Monitor size={18} /> Presentation Mode
                        </button>
                        <button
                            onClick={handleExportExcel}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <FileText size={18} /> Export Metadata
                        </button>
                        <button
                            onClick={handleExportVideo}
                            disabled={isExportingVideo}
                            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Film size={18} /> {isExportingVideo ? 'Exporting...' : 'Download Video Kit'}
                        </button>
                        <button
                            onClick={handleExportZip}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <Download size={18} /> Download Assets
                        </button>
                    </div>
                </div>
            )}

            {/* Video Export Progress Modal */}
            {isExportingVideo && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100000]">
                    <div className="glass-panel p-8 max-w-md w-full">
                        <h3 className="text-2xl font-bold text-white mb-4">Exporting Video</h3>
                        <div className="w-full bg-white/10 rounded-full h-3 mb-4 overflow-hidden">
                            <div
                                className="bg-[var(--color-primary)] h-full transition-all duration-300"
                                style={{ width: `${exportProgress}%` }}
                            />
                        </div>
                        <p className="text-gray-300 text-center">{exportStatus}</p>
                        <p className="text-gray-400 text-sm text-center mt-2">{exportProgress}%</p>
                    </div>
                </div>
            )}

            {viewOnly ? createPortal(playerContent, document.body) : playerContent}

            {/* Hidden Audio Player */}
            <audio
                ref={audioRef}
                className="hidden"
                crossOrigin="anonymous"
                onError={(e) => console.error("Audio element error:", e.currentTarget.error)}
            />
        </div>
    );
}
