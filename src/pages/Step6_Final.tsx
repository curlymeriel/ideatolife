import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { Play, Pause, Download, FileText, Monitor, Layout, Film, Zap, X, Image as ImageIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportVideo, type VideoCut } from '../utils/videoExporter';
import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { exportProjectToZip } from '../utils/zipExporter';
import { recordCanvasVideo, isCanvasRecordingSupported, type RecordingCut } from '../utils/canvasVideoRecorder';
import { exportWithFFmpeg, isFFmpegSupported } from '../utils/ffmpegExporter';

// Helper to get audio duration
const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => resolve(0);
    });
};

export const Step6_Final = () => {
    const location = useLocation();
    const {
        id: projectId,
        script,
        seriesName,
        episodeName,
        targetDuration,
        thumbnailUrl,
        storylineTable
    } = useWorkflowStore();



    const [currentCutIndex, setCurrentCutIndex] = useState(0);
    const [viewOnly, setViewOnly] = useState(false);
    const [showThumbnail, setShowThumbnail] = useState(true); // Start with thumbnail
    const [isPlayingState, setIsPlayingState] = useState(false);
    const setIsPlaying = (val: boolean, reason: string = "unknown") => {
        console.error(`[Step6] setIsPlaying(${val}) called. Reason: ${reason}`);
        if (!val) {
            // Debug Breakpoint hint
            // debugger; 
        }
        setIsPlayingState(val);
    };
    const isPlaying = isPlayingState;

    const [elapsedTime, setElapsedTime] = useState(0);



    useEffect(() => {
        // Aggressive debug to confirm mounting
        // alert("DEBUG: Step 6 Mounted");
        console.log("DEBUG: Step 6 Mounted");
    }, []);

    // Debug Script Data
    useEffect(() => {
        if (script && script.length > 0) {
            console.log("[Step6] Script Data Loaded. Total Cuts:", script.length);
            console.log("[Step6] Cut 0 Details:", {
                id: script[0].id,
                hasVideoUrl: !!script[0].videoUrl,
                videoUrl: script[0].videoUrl ? script[0].videoUrl.substring(0, 50) : 'MISSING',
                hasAudioUrl: !!script[0].audioUrl
            });
            if (!script[0].videoUrl) {
                console.error("[Step6] CRITICAL: Cut 0 missing videoUrl in Store!", script[0]);
            }
        } else {
            console.warn("[Step6] Script is empty or missing!");
        }
    }, [script]);

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
    const [resolvedThumbnail, setResolvedThumbnail] = useState<string | null>(null);
    const startTimeRef = useRef<number>(0);
    const blobCacheRef = useRef<Record<string, string>>({}); // Ref for cleanup

    const isBufferingRef = useRef(false);

    console.log(`[Step6 Render] State Check: assetsLoaded=${assetsLoaded}, showThumbnail=${showThumbnail}, isPlaying=${isPlayingState}`);
    const lastFrameTimeRef = useRef(0);
    const audioARef = useRef<HTMLAudioElement>(null);
    const audioBRef = useRef<HTMLAudioElement>(null);
    const sfxRef = useRef<HTMLAudioElement>(null);
    const playPromiseRef = useRef<Promise<void> | null>(null);
    const lastPlayedCutIndexRef = useRef<number | null>(null);

    // Helper to get the player assigned to a specific index (Even=A, Odd=B)
    const getPlayerForIndex = (index: number) => index % 2 === 0 ? audioARef.current : audioBRef.current;

    // CRITICAL: Reset state when project changes to prevent showing old project data
    useEffect(() => {
        console.log(`[Step6] Project changed to ${projectId} - resetting cached state`);
        setCurrentCutIndex(0);
        setShowThumbnail(true);
        setIsPlaying(false, "Project Changed");
        setElapsedTime(0);
        setAssetsLoaded(false);
        setBlobCache({});
        setAudioDurations({});
        setResolvedThumbnail(null);
        setResolvedThumbnail(null);
        startTimeRef.current = 0;
        lastPlayedCutIndexRef.current = null;
    }, [projectId]);

    // Video export state
    const [isExportingVideo, setIsExportingVideo] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState<'quick' | 'hq' | 'kit' | null>(null);

    // NEW: Playback Mode (Hybrid vs Still) and Video Refs
    const [playbackMode, setPlaybackMode] = useState<'hybrid' | 'still'>('hybrid');
    const [exportHybrid, setExportHybrid] = useState(true);
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

    // 1. Optimize Assets (Convert Base64 to Blob URLs & Measure Audio)
    // Priority loading: load first 5 cuts first, then rest in background
    // Priority loading: load first 5 cuts first, then rest in background
    const lastScriptRef = React.useRef<string>('');
    const lastStateUpdateRef = React.useRef<number>(0);

    useEffect(() => {
        const currentScriptJson = JSON.stringify(script.map(c => ({
            id: c.id,
            audioUrl: c.audioUrl,
            sfxUrl: c.sfxUrl, // Include SFX in signature
            finalImageUrl: c.finalImageUrl,
            draftImageUrl: c.draftImageUrl,
            videoUrl: c.videoUrl // Critical: Include videoUrl in dependency check
        })));

        if (lastScriptRef.current === currentScriptJson && assetsLoaded) {
            return;
        }
        lastScriptRef.current = currentScriptJson;

        const optimizeAssets = async () => {
            console.log(`[Step6] Optimizing assets for ${script.length} cuts`);
            console.log(`[Step6] First few audio URLs:`, script.slice(0, 3).map(c => c.audioUrl));

            const newCache: Record<string, string> = {};

            const processUrl = async (url: string) => {
                // Optimization: If it's already a playable format, return as is.
                // We skip separate Blob conversion for Data URLs to prevent hanging on large projects,
                // aligning behavior with Step 4 which works reliably.
                if (!url || url.startsWith('blob:') || url.startsWith('http') || url.startsWith('data:')) return url;

                // Handle idb:// URLs - resolve from IndexedDB first
                if (isIdbUrl(url)) {
                    // Use asBlob: true for efficient handling of large files (Step 6 optimization)
                    const resolved = await resolveUrl(url, { asBlob: true });

                    if (!resolved) {
                        console.warn(`[Step6] Failed to resolve IDB URL (returned empty): ${url}`);
                        return undefined;
                    }

                    console.log(`[Step6] Resolved IDB URL: ${url} -> ${resolved.substring(0, 30)}...`);
                    return resolved;
                }

                // Fallback for other cases
                return url;
            };

            // Resolve Thumbnail
            if (thumbnailUrl) {
                try {
                    const resolved = await processUrl(thumbnailUrl);
                    if (resolved) {
                        newCache[thumbnailUrl] = resolved;
                        setResolvedThumbnail(resolved);
                    }
                    console.log('[Step6] Resolved thumbnail:', resolved?.substring(0, 50));
                } catch (e) {
                    console.error("Failed to process thumbnail:", e);
                }
            }



            // Helper to process a cut and return updates
            const processCutAndGetUpdates = async (cut: typeof script[0], index: number) => {
                const updates: { cache: Record<string, string>, durations: Record<number, number> } = { cache: {}, durations: {} };

                try {
                    // Helper to add to local updates
                    const addToCache = (original: string | undefined, resolved: string | undefined) => {
                        // Allow IDB resolved URLs into the cache regardless of prefix, as long as resolved
                        if (original && resolved && !resolved.startsWith('idb://')) {
                            updates.cache[original] = resolved;
                        }
                    };

                    // ... (existing resolution logic adapted to use addToCache) ...
                    // Since the logic is complex, I will simplify by processing and returning:

                    // 1. Audio
                    if (cut.audioUrl) {
                        let url: string | undefined = await processUrl(cut.audioUrl);

                        // Fallback: If we got a Data URL (not from IDB but direct), convert to Blob for stability
                        if (url && url.startsWith('data:')) {
                            try {
                                const res = await fetch(url);
                                const blob = await res.blob();
                                url = URL.createObjectURL(blob);
                            } catch (e) { console.error('Audio blob conversion failed', e); }
                        }

                        if (url) {
                            addToCache(cut.audioUrl, url);
                            if (url.startsWith('blob:') || url.startsWith('data:') || !url.startsWith('idb://')) {
                                const duration = await getAudioDuration(url);
                                if (duration > 0) updates.durations[index] = duration;
                            }
                        }
                    }

                    // 2. SFX
                    if (cut.sfxUrl) {
                        let sfxUrl = await processUrl(cut.sfxUrl);
                        // Fallback: Convert direct Data URLs to Blob
                        if (sfxUrl && sfxUrl.startsWith('data:')) {
                            try {
                                const res = await fetch(sfxUrl);
                                const blob = await res.blob();
                                sfxUrl = URL.createObjectURL(blob);
                            } catch (e) { }
                        }
                        addToCache(cut.sfxUrl, sfxUrl);
                    }

                    // 3. Images
                    if (cut.finalImageUrl) addToCache(cut.finalImageUrl, await processUrl(cut.finalImageUrl));
                    if (cut.draftImageUrl) addToCache(cut.draftImageUrl, await processUrl(cut.draftImageUrl));

                    // 4. Video
                    if (cut.videoUrl) {
                        let vidUrl = await processUrl(cut.videoUrl);
                        // FIX: Convert Data URL to Blob URL for Video as well
                        // Use Blob URL to prevent "too large attribute" errors
                        if (vidUrl && vidUrl.startsWith('data:')) {
                            try {
                                const res = await fetch(vidUrl);
                                const blob = await res.blob();

                                // FORCE MIME TYPE for proper playback
                                let finalBlob = blob;
                                if (blob.type === 'application/octet-stream' || !blob.type) {
                                    finalBlob = new Blob([blob], { type: 'video/mp4' });
                                }

                                vidUrl = URL.createObjectURL(finalBlob);
                            } catch (e) {
                                console.error('[Step6] Video blob conversion failed, using raw Data URL', e);
                                // Fallback to data URL is automatic since we didn't update vidUrl
                            }
                        }
                        addToCache(cut.videoUrl, vidUrl);
                    }

                } catch (e) {
                    console.error(`[Step6] Error processing cut ${index}:`, e);
                }
                return updates;
            };

            // Priority: Load first 5 cuts first
            const PRIORITY_COUNT = 5;
            const priorityCuts = script.slice(0, PRIORITY_COUNT);
            const restCuts = script.slice(PRIORITY_COUNT);

            console.log(`[Step6] Loading ${priorityCuts.length} priority cuts...`);

            // Process Priority Batch
            const priorityResults = await Promise.all(priorityCuts.map((cut, i) => processCutAndGetUpdates(cut, i)));

            // Merge Priority Results
            const priorityCache: Record<string, string> = {};
            const priorityDurations: Record<number, number> = {};
            priorityResults.forEach(res => {
                Object.assign(priorityCache, res.cache);
                Object.assign(priorityDurations, res.durations);
            });

            // Update State Once
            setBlobCache(prev => ({ ...prev, ...priorityCache }));
            blobCacheRef.current = { ...blobCacheRef.current, ...priorityCache };
            setAudioDurations(prev => ({ ...prev, ...priorityDurations }));

            // CRITICAL FIX: Only show player after priority assets are actually loaded and cached
            setAssetsLoaded(true);

            console.log('[Step6] Priority assets loaded!');

            // IMMEDIATE PRELOAD FOR CUT 0
            if (script.length > 0 && script[0].audioUrl) {
                const audioUrl0 = script[0].audioUrl;
                const resolvedUrl = priorityCache[audioUrl0]; // Use local priority cache mapping directly

                if (resolvedUrl && !resolvedUrl.startsWith('idb://') && audioARef.current) {
                    audioARef.current.src = resolvedUrl;
                    audioARef.current.load();
                }
            }

            // Load rest in background
            if (restCuts.length > 0) {
                console.log(`[Step6] Loading ${restCuts.length} remaining cuts in background...`);

                const BATCH_SIZE = 10;
                for (let i = 0; i < restCuts.length; i += BATCH_SIZE) {
                    const batch = restCuts.slice(i, i + BATCH_SIZE);
                    // Process batch
                    const batchResults = await Promise.all(batch.map((cut, batchIndex) =>
                        processCutAndGetUpdates(cut, PRIORITY_COUNT + i + batchIndex)
                    ));

                    // Merge only this batch's results
                    const batchCache: Record<string, string> = {};
                    const batchDurations: Record<number, number> = {};
                    batchResults.forEach(res => {
                        Object.assign(batchCache, res.cache);
                        Object.assign(batchDurations, res.durations);
                    });

                    // Update State using only new data (prevent O(N^2) data spreading of accumulator)
                    if (Object.keys(batchCache).length > 0) {
                        setBlobCache(prev => ({ ...prev, ...batchCache }));
                        blobCacheRef.current = { ...blobCacheRef.current, ...batchCache };
                        setAudioDurations(prev => ({ ...prev, ...batchDurations }));
                    }

                    // Small yield to UI thread
                    await new Promise(r => setTimeout(r, 10));
                }
                console.log('[Step6] All assets loaded!');
            }
        };

        optimizeAssets();

        return () => {
            // Only revoke in meaningful cleanup, not every render if we can avoid it.
            Object.values(blobCacheRef.current).forEach(url => URL.revokeObjectURL(url));
            blobCacheRef.current = {};
            lastScriptRef.current = '';
        };
    }, [script, thumbnailUrl]);

    // Helper to get optimized URL (safe for render)
    const getOptimizedUrl = (originalUrl?: string) => {
        if (!originalUrl) return undefined;
        // Use Ref first if available for latest data, fallback to state
        // This helps when state update is pending but ref is ready
        const url = blobCacheRef.current[originalUrl] || blobCache[originalUrl] || originalUrl;

        // Safety: Unresolved IDB URLs cannot be displayed/played
        if (url.startsWith('idb://')) return undefined;
        return url;
    };

    // Helper to get effective duration (Max of estimated vs actual audio)
    const getCutDuration = (index: number) => {
        const cut = script[index];
        if (!cut) return 0;
        const audioDur = audioDurations[index] || 0;
        // Prioritize actual audio duration if available
        if (audioDur > 0) {
            // Use user-defined padding, defaulting to 0.5s if not set
            return audioDur + (cut.audioPadding ?? 0.5);
        }

        // Fallback: If no audio duration yet, use estimated duration from script
        // CRITICAL: Ensure minimum duration to prevent rapid skipping
        // If there is dialogue, assume at least 2 seconds (safe read time)
        if (cut.dialogue && cut.dialogue.length > 5) {
            return Math.max(cut.estimatedDuration || 0, 2.0);
        }

        // Fallback to estimated or default 5s only if no audio duration
        return cut.estimatedDuration || 5;
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
            if (!isPlaying) return;

            const now = Date.now();
            const delta = now - lastFrameTimeRef.current;
            lastFrameTimeRef.current = now;

            if (isBufferingRef.current) {
                // If buffering, Pause time by shifting Start Time forward
                startTimeRef.current += delta;
                animationFrameId = requestAnimationFrame(updateLoop);
                return;
            }



            const totalElapsed = (now - startTimeRef.current) / 1000;

            // Optimization: Throttle state updates to ~10fps to reduce React re-render overhead
            if (now - lastStateUpdateRef.current > 100) {
                setElapsedTime(totalElapsed);
                lastStateUpdateRef.current = now;
            }

            // Calculate current cut based on total elapsed time
            let accumulatedTime = 0;
            let foundIndex = -1;

            // Debug first run
            if (totalElapsed < 0.1) {
                console.log(`[Step6] Loop Start. AudioDurations:`, audioDurations);
            }

            for (let i = 0; i < script.length; i++) {
                const dur = getCutDuration(i);
                accumulatedTime += dur;
                if (totalElapsed < accumulatedTime) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex !== -1) {
                if (foundIndex !== currentCutIndex) {
                    console.log(`[Step6] Cut Transition: ${currentCutIndex} -> ${foundIndex} at ${totalElapsed.toFixed(3)}s`);
                    setCurrentCutIndex(foundIndex);
                }
                animationFrameId = requestAnimationFrame(updateLoop);
            } else {
                // End of script
                console.log(`[Step6] Script ended? TotalElapsed:${totalElapsed.toFixed(3)}s, Accumulated:${accumulatedTime.toFixed(3)}s, ScriptLen:${script.length}`);
                console.log(`[Step6] Playback stopped. IsPlaying set to false.`);
                setIsPlaying(false, "End of Script (updateLoop)");
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
            lastFrameTimeRef.current = Date.now();
            animationFrameId = requestAnimationFrame(updateLoop);
        } else {
            // Paused
            startTimeRef.current = 0;
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, showThumbnail, script, currentCutIndex, audioDurations]);



    const handleAudioResume = (e: React.SyntheticEvent<HTMLAudioElement>) => {
        isBufferingRef.current = false;
        const player = e.currentTarget;
        console.log(`[Audio] Resumed. Duration: ${player.duration}`);

        // Self-heal duration: If playing and we have finite duration but state is missing/zero
        if (Number.isFinite(player.duration) && player.duration > 0) {
            const isA = player === audioARef.current;
            const isEven = currentCutIndex % 2 === 0;

            // Only update if this player corresponds to the current cut
            if (isA === isEven) {
                // If duration is missing, zero, or significantly different (e.g. placeholder)
                // We use a small epsilon for float comparison logic if needed, but mostly 'missing' is key.
                const cachedDur = audioDurations[currentCutIndex];
                if (!cachedDur || cachedDur === 0) {
                    console.log(`[Step6] Self-healing duration for Cut ${currentCutIndex}: ${player.duration}`);
                    // Use functional update to avoid dependency cycles
                    setAudioDurations(prev => {
                        // Double check inside setter
                        if (prev[currentCutIndex] === player.duration) return prev;
                        return { ...prev, [currentCutIndex]: player.duration };
                    });
                }
            }
        }
    };

    const stopAll = () => {
        audioARef.current?.pause();
        audioBRef.current?.pause();
        sfxRef.current?.pause();
        // Pause all videos
        videoRefs.current.forEach(v => {
            if (v) v.pause();
        });
    };

    // Unmount cleanup ONLY
    useEffect(() => {
        return () => stopAll();
    }, []);

    useEffect(() => {
        if (!assetsLoaded) return;

        console.log(`[PlaybackEffect] Running. Cut:${currentCutIndex} Playing:${isPlaying} Thumb:${showThumbnail}`);

        if (isPlaying && !showThumbnail) {
            const currentCut = script[currentCutIndex];
            const nextCut = script[currentCutIndex + 1];

            const currentPlayer = getPlayerForIndex(currentCutIndex);
            const nextPlayer = getPlayerForIndex(currentCutIndex + 1);

            // 1. PLAY CURRENT
            if (currentPlayer) {
                // Use Ref for lookup to avoid dependency on blobCache state updates
                // This prevents audio stopping when background assets load
                const rawUrl = currentCut?.audioUrl;
                let url: string | undefined = undefined;

                if (rawUrl) {
                    url = blobCacheRef.current[rawUrl] || rawUrl;
                    if (url.startsWith('idb://')) url = undefined;
                }

                if (url) {
                    // Critical Check: Prevent redundant play calls causing stutter
                    // Only skip if:
                    // 1. We already started playing this exact cut index
                    // 2. AND the player is actually playing (not paused/stalled)
                    const isRedundant = lastPlayedCutIndexRef.current === currentCutIndex && !currentPlayer.paused && currentPlayer.src === url;

                    if (isRedundant) {
                        console.log(`[Audio ${currentCutIndex}] Already playing, skipping redundant call.`);
                        // Do NOT return here, just skip the audio play block so we can proceed to SFX
                    } else {
                        lastPlayedCutIndexRef.current = currentCutIndex;

                        // Only set src if it changed
                        if (currentPlayer.src !== url) {
                            console.log(`[Audio ${currentCutIndex}] Setting source to:`, url.substring(0, 50));
                            currentPlayer.src = url;
                        }

                        // Play
                        const playAudio = async () => {
                            try {
                                // If we have a pending play, wait for it
                                if (playPromiseRef.current) {
                                    try {
                                        await playPromiseRef.current;
                                    } catch (e) { /* Ignore previous aborts */ }
                                }

                                // Ensure the OTHER player is paused
                                if (nextPlayer) nextPlayer.pause();

                                // Reset time to start (Crucial for preloaded assets)
                                currentPlayer.currentTime = 0;
                                // FORCE RESET VOLUME/MUTE to ensure audible playback
                                currentPlayer.volume = 1;
                                currentPlayer.muted = false;

                                console.log(`[Audio ${currentCutIndex}] Playing on ${currentCutIndex % 2 === 0 ? 'A' : 'B'} (Vol:${currentPlayer.volume}, State:${currentPlayer.readyState}, Dur:${currentPlayer.duration})`);
                                playPromiseRef.current = currentPlayer.play();
                                await playPromiseRef.current;
                            } catch (e: any) {
                                isBufferingRef.current = false; // Release buffering lock on error
                                if (e.name !== 'AbortError') {
                                    console.error(`[Audio ${currentCutIndex}] Play failed:`, e);
                                    // Additional detail for debugging
                                    if (currentPlayer.error) {
                                        console.error(`[Audio ${currentCutIndex}] Media Error Code:`, currentPlayer.error.code, currentPlayer.error.message);
                                    }
                                }
                            }
                        };
                        playAudio();
                    }


                }
            }


            // 2. SFX PLAYBACK
            if (sfxRef.current) {
                if (currentCut?.sfxUrl) {
                    const sfxUrl = getOptimizedUrl(currentCut.sfxUrl);

                    if (sfxUrl) {
                        // Only start if not already playing this URL (basic check)
                        // But SFX usually restarts on cut change, so we force it.
                        if (sfxRef.current.src !== sfxUrl) {
                            sfxRef.current.src = sfxUrl;
                        }

                        sfxRef.current.volume = currentCut.sfxVolume ?? 0.3;
                        sfxRef.current.currentTime = 0;
                        sfxRef.current.muted = false;

                        const playSfx = async () => {
                            try {
                                console.log(`[SFX ${currentCutIndex}] Playing SFX (Vol:${sfxRef.current?.volume})`);
                                await sfxRef.current?.play();
                            } catch (e) {
                                console.warn(`[SFX ${currentCutIndex}] Play failed:`, e);
                            }
                        };
                        playSfx();
                    }
                } else {
                    // No SFX for this cut - stop any previous SFX
                    if (!sfxRef.current.paused) {
                        sfxRef.current.pause();
                    }
                }
            }

            // 2.5 VIDEO SYNC (Step 6 Cut 1 Fix)
            // If in Hybrid mode, we must ensure the relevant video is also playing and synced.
            if (playbackMode === 'hybrid') {
                const isEven = currentCutIndex % 2 === 0;
                // Get the video element for the current slot
                const currentVideo = isEven ? videoRefs.current[indexA] : videoRefs.current[indexB];

                if (currentVideo) {
                    // Reset if new cut
                    if (Math.abs(currentVideo.currentTime) > 0.5) currentVideo.currentTime = 0;

                    const playVideo = async () => {
                        try {
                            // Ensure it's not paused
                            if (currentVideo.paused) {
                                console.log(`[Video ${currentCutIndex}] Starting video playback force`);
                                await currentVideo.play();
                            }
                        } catch (e) {
                            console.warn(`[Video ${currentCutIndex}] Play failed:`, e);
                        }
                    };
                    playVideo();
                }

                // Pause the other video to save resources
                const otherVideo = !isEven ? videoRefs.current[indexA] : videoRefs.current[indexB];
                if (otherVideo && !otherVideo.paused) {
                    otherVideo.pause();
                }
            }

            // 3. PRELOAD NEXT
            if (nextPlayer && nextCut) {
                const rawNextUrl = nextCut?.audioUrl;
                let nextUrl: string | undefined = undefined;
                if (rawNextUrl) {
                    nextUrl = blobCacheRef.current[rawNextUrl] || rawNextUrl;
                    if (nextUrl.startsWith('idb://')) nextUrl = undefined;
                }

                if (nextUrl && nextPlayer.src !== nextUrl && !nextUrl.startsWith('idb://')) {
                    console.log(`[Audio] Preloading cut ${currentCutIndex + 1}`);
                    nextPlayer.src = nextUrl;
                    nextPlayer.load();
                }
            }
        } else {
            console.log(`[PlaybackEffect] Pausing triggered. Playing:${isPlaying} Thumb:${showThumbnail}`);
            stopAll();
        }

        // GAPLESS AUDIO FIX:
        // Do NOT stopAll() here. Unmount cleanup is handled by the empty-dep effect above.
        // The cleanup function for this effect is intentionally empty to prevent audio from stopping
        // when dependencies change (e.g., currentCutIndex updates).
        // The stopAll() is called explicitly when playback is paused or thumbnail is shown.
        return () => { };
    }, [currentCutIndex, isPlaying, showThumbnail, assetsLoaded, playbackMode]); // REMOVED blobCache and audioDurations

    // Preload Next Images (Keep simple image preloading)
    useEffect(() => {
        const PRELOAD_COUNT = 3;
        const startIndex = currentCutIndex + 1;
        const endIndex = Math.min(startIndex + PRELOAD_COUNT, script.length);

        for (let i = startIndex; i < endIndex; i++) {
            const cut = script[i];
            const imgUrl = getOptimizedUrl(cut?.finalImageUrl || cut?.draftImageUrl);
            // Only preload if it's a valid blob URL (assets loaded), ignore idb:// to prevent ERR_UNKNOWN_URL_SCHEME
            if (imgUrl && !imgUrl.startsWith('idb://')) {
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
        setIsExportingVideo(true); // Re-use the loading state or add a new one? Let's use generic loading if possible, or just exportVideo state for now to block UI
        setExportStatus('Generating ZIP...');
        setExportProgress(50);

        try {
            // Load full project data from IN-MEMORY Store
            // This is critical because Step 6 reflects the latest "Playable" state.
            // Reading from disk (idb) might get stale data if auto-save hasn't finished.
            // We use JSON parse/stringify to create a clean deep copy for the exporter to mutate.
            const fullProjectData = JSON.parse(JSON.stringify(useWorkflowStore.getState()));
            console.log(`[Zip Export] Exporting from active memory state`);

            const blob = await exportProjectToZip(fullProjectData);

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${seriesName} - ${episodeName}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            setExportStatus('Done!');
        } catch (error) {
            console.error("Export zip failed:", error);
            alert("Failed to create ZIP backup.");
        } finally {
            setIsExportingVideo(false);
            setExportProgress(0);
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
                'Has SFX': cut.sfxUrl ? 'Yes' : 'No',
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
            { wch: 10 }, // Has SFX
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

        // Generate safe filename with fallback
        const safeSeriesName = seriesName || 'Untitled_Series';
        const safeEpisodeName = episodeName || 'Untitled_Episode';
        const filename = `${safeSeriesName} - ${safeEpisodeName}.xlsx`;
        console.log('[Step6] Exporting Excel with filename:', filename);

        XLSX.writeFile(wb, filename);
    };

    const handleExportVideo = async () => {
        // Open export modal instead of direct export
        setShowExportModal(true);
    };

    const handleStartEpisode = async () => {
        console.log("[Step6] Start Episode Triggered");

        // 1. Initialize Video (Cut 0) - Pre-roll behind thumbnail
        if (videoRefs.current[0]) {
            console.log("[Step6] Pre-rolling Cut 0 Video...");
            videoRefs.current[0].currentTime = 0;
            try {
                // Ensure video is playing
                await videoRefs.current[0].play();
            } catch (e) {
                console.error("[Step6] Video Play Failed", e);
            }
        }

        // 2. Stabilization Delay (The "Pre-roll" Wait)
        // Helps mask the initial frame stutter/freeze by keeping the thumbnail up for a split second longer
        // while the video engine warms up.
        await new Promise(resolve => setTimeout(resolve, 600));

        // 3. Reveal and Start Engine
        setShowThumbnail(false);
        setIsPlaying(true, "Start Button");
        setElapsedTime(0); // Reset timer to sync with visual start
        setCurrentCutIndex(0);

        // Audio will be handled by PlaybackEffect when showThumbnail becomes false
    };

    // Prepare recording cuts helper
    const prepareRecordingCuts = (includeVideo: boolean): RecordingCut[] => {
        const cuts: RecordingCut[] = script.map((cut, index) => ({
            imageUrl: getOptimizedUrl(cut.finalImageUrl || cut.draftImageUrl) || '',
            videoUrl: includeVideo ? getOptimizedUrl(cut.videoUrl) : undefined,
            audioUrl: getOptimizedUrl(cut.audioUrl),
            sfxUrl: getOptimizedUrl(cut.sfxUrl),
            sfxVolume: cut.sfxVolume,
            duration: getCutDuration(index),
            dialogue: cut.dialogue,
            speaker: cut.speaker
        })).filter(c => c.imageUrl);

        // Add 2s Thumbnail Intro if available
        const optimizedThumbnail = getOptimizedUrl(thumbnailUrl || undefined);
        if (optimizedThumbnail) {
            console.log("[Step6] Adding thumbnail intro to export");
            cuts.unshift({
                imageUrl: optimizedThumbnail,
                duration: 2.0,
                dialogue: '',
            });
        } else {
            console.warn("[Step6] No optimized thumbnail found for export intro!");
        }

        return cuts;
    };

    // Quick Export (WebM via Canvas Recording)
    const handleQuickExport = async () => {
        setShowExportModal(false);
        setExportType('quick');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Initializing...');

        try {
            const recordingCuts = prepareRecordingCuts(exportHybrid);
            if (recordingCuts.length === 0) {
                alert("No images found to export!");
                setIsExportingVideo(false);
                return;
            }

            const result = await recordCanvasVideo(
                recordingCuts,
                { width: 1920, height: 1080, fps: 30, showSubtitles: true },
                (progress, status) => {
                    setExportProgress(Math.round(progress));
                    setExportStatus(status);
                }
            );

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${seriesName} - ${episodeName}.${result.format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Quick export failed:", error);
            alert("Failed to export video. Check console for details.");
        } finally {
            setIsExportingVideo(false);
            setExportProgress(0);
            setExportStatus('');
            setExportType(null);
        }
    };

    // High Quality Export (MP4 via FFmpeg.wasm)
    const handleHQExport = async () => {
        if (!isFFmpegSupported()) {
            alert("High quality export is not supported in this browser. SharedArrayBuffer is required.\n\nPlease try Quick Export instead, or use a different browser (Chrome/Edge recommended).");
            return;
        }

        setShowExportModal(false);
        setExportType('hq');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Loading FFmpeg...');

        try {
            const recordingCuts = prepareRecordingCuts(exportHybrid);
            if (recordingCuts.length === 0) {
                alert("No images found to export!");
                setIsExportingVideo(false);
                return;
            }

            const result = await exportWithFFmpeg(
                recordingCuts,
                { width: 1920, height: 1080, quality: 'high' },
                (progress, status) => {
                    setExportProgress(Math.round(progress));
                    setExportStatus(status);
                }
            );

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${seriesName} - ${episodeName}.${result.format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("HQ export failed:", error);
            alert("Failed to export video. Check console for details.\n\nTip: If SharedArrayBuffer is not available, try Quick Export.");
        } finally {
            setIsExportingVideo(false);
            setExportProgress(0);
            setExportStatus('');
            setExportType(null);
        }
    };

    // Video Kit Export (ZIP with images, audio, and FFmpeg script)
    const handleVideoKitExport = async () => {
        setShowExportModal(false);
        setExportType('kit');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Preparing assets...');

        try {
            const videoCuts: VideoCut[] = script.map((cut, index) => ({
                imageUrl: getOptimizedUrl(cut.finalImageUrl || cut.draftImageUrl) || '',
                videoUrl: (exportHybrid || exportType === 'kit') ? getOptimizedUrl(cut.videoUrl) : undefined,
                audioUrl: getOptimizedUrl(cut.audioUrl),
                sfxUrl: getOptimizedUrl(cut.sfxUrl),
                sfxVolume: cut.sfxVolume,
                sfxName: cut.sfxName,
                sfxDescription: cut.sfxDescription,
                speaker: cut.speaker,
                dialogue: cut.dialogue,
                duration: getCutDuration(index)
            })).filter(c => c.imageUrl);

            if (videoCuts.length === 0) {
                alert("No images found to export!");
                setIsExportingVideo(false);
                return;
            }

            const result = await exportVideo(
                videoCuts,
                (progress, status) => {
                    setExportProgress(Math.round(progress));
                    setExportStatus(status);
                },
                {
                    seriesName: seriesName || '',
                    episodeName: episodeName || '',
                    storylineTable: storylineTable || []
                }
            );

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
            setExportType(null);
        }
    };


    // Sync Video Playback (Optimized)
    useEffect(() => {
        if (playbackMode !== 'hybrid') return;

        // 1. Current Video: Play immediately
        const currentVideo = videoRefs.current[currentCutIndex];
        if (currentVideo) {
            // Debug Log
            // console.log(`[Video ${currentCutIndex}] Sync. Playing:${isPlaying} State:${currentVideo.readyState}`);

            if (isPlaying) {
                // Only play if paused to avoid promise spam
                if (currentVideo.paused) {
                    const playPromise = currentVideo.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            // Ignore common auto-play interruptions
                            // console.warn(`[Video ${currentCutIndex}] Play failed:`); 
                        });
                    }
                }
            } else {
                if (!currentVideo.paused) currentVideo.pause();
            }
        }

        // 2. Next Video: Preload
        // Ensure the next slot is buffering
        const nextIndex = currentCutIndex + 1;
        if (nextIndex < script.length) {
            const nextVideo = videoRefs.current[nextIndex];
            if (nextVideo) {
                if (nextVideo.readyState === 0) {
                    nextVideo.load();
                }
            }
        }
    }, [currentCutIndex, isPlaying, playbackMode, script]);

    // Fix for Cut 0 (First Cut) Cold Start Issue
    // Cut 0 has no "previous cut" to trigger its preload, so we must do it manually
    // while the user is viewing the thumbnail title card.
    // Fix for Cut 0 (First Cut) Cold Start Issue
    useEffect(() => {
        if (assetsLoaded && showThumbnail && script.length > 0) {
            // Give React a moment to mount the video refs after assetsLoaded becomes true
            const timer = setTimeout(() => {
                const video0 = videoRefs.current[0];
                if (video0) {
                    console.log("[Step6] Force preloading Cut 0 video (Thumbnail State)");
                    if (video0.readyState === 0) video0.load();
                    // Ensure it is reset to start
                    video0.currentTime = 0;
                }

                // Also preload Cut 1 to be safe
                const video1 = videoRefs.current[1];
                if (video1 && video1.readyState === 0) {
                    video1.load();
                }
            }, 500); // Increased from 100 to 500 to ensure DOM stable
            return () => clearTimeout(timer);
        }
    }, [assetsLoaded, showThumbnail, script]);

    // Double Buffering Indices (Current + Next Strategy)
    // Even cuts use Slot A, Odd cuts use Slot B.
    // The INACTIVE slot always preloads the NEXT cut in its sequence.
    const activeSlot = currentCutIndex % 2 === 0 ? 'A' : 'B';
    const indexA = activeSlot === 'A' ? currentCutIndex : currentCutIndex + 1;
    const indexB = activeSlot === 'B' ? currentCutIndex : currentCutIndex + 1;



    const playerContent = (
        <div
            className="relative w-full h-full bg-black overflow-hidden group"
        >
            {/* View Only Exit Button */}
            {viewOnly && !isPresentationMode && (
                <button
                    onClick={() => setViewOnly(false)}
                    className="absolute top-6 right-6 z-[100000] p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
                >
                    <Layout size={24} />
                </button>
            )}

            {/* Main Visual Layer - Absolute Full Fill */}
            <div className="absolute inset-0 bg-black">
                {!assetsLoaded ? (
                    <div className="flex flex-col items-center justify-center h-full text-white">
                        <div className="w-12 h-12 border-4 border-white/20 border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
                        <p className="text-lg font-medium">에셋 최적화 중...</p>
                        <p className="text-sm text-gray-400">부드러운 재생을 위해 변환 중</p>
                    </div>
                ) : (
                    <>
                        {/* Layer 1: Media (Double Buffered for Smooth Transitions) */}
                        <div className="absolute inset-0 z-0 bg-black">
                            {/* Slot A (Evens target) */}
                            {script[indexA] && (
                                <div className={`absolute inset-0 w-full h-full ${activeSlot === 'A' ? 'block z-10' : 'hidden z-0'}`}>
                                    <div className="relative w-full h-full">
                                        {/* Always Render Base Image */}
                                        <img
                                            src={getOptimizedUrl(script[indexA].finalImageUrl || script[indexA].draftImageUrl) || "https://placehold.co/1920x1080/1a1a1a/333333?text=Generating..."}
                                            alt={`Scene ${indexA + 1}`}
                                            className="absolute inset-0 w-full h-full object-contain"
                                        />

                                        {/* Overlay Video if Available */}
                                        {playbackMode === 'hybrid' && script[indexA].videoUrl && getOptimizedUrl(script[indexA].videoUrl) && (
                                            <video
                                                key={`video-${script[indexA].id}`}
                                                ref={(el) => { if (el) videoRefs.current[indexA] = el; }}
                                                src={getOptimizedUrl(script[indexA].videoUrl)}
                                                className="absolute inset-0 w-full h-full object-contain z-10"
                                                muted
                                                loop
                                                playsInline
                                                onError={(e) => {
                                                    const err = e.currentTarget.error;
                                                    console.error(`[Step6] Video play failed for Cut ${indexA}. Code: ${err?.code}, Message: ${err?.message}`);
                                                    // e.currentTarget.style.display = 'none'; 
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Slot B (Odds target) */}
                            {script[indexB] && (
                                <div className={`absolute inset-0 w-full h-full ${activeSlot === 'B' ? 'block z-10' : 'hidden z-0'}`}>
                                    <div className="relative w-full h-full">
                                        {/* Always Render Base Image */}
                                        <img
                                            src={getOptimizedUrl(script[indexB].finalImageUrl || script[indexB].draftImageUrl) || "https://placehold.co/1920x1080/1a1a1a/333333?text=Generating..."}
                                            alt={`Scene ${indexB + 1}`}
                                            className="absolute inset-0 w-full h-full object-contain"
                                        />

                                        {/* Overlay Video if Available */}
                                        {playbackMode === 'hybrid' && script[indexB].videoUrl && getOptimizedUrl(script[indexB].videoUrl) && (
                                            <video
                                                key={`video-${script[indexB].id}`}
                                                ref={(el) => { if (el) videoRefs.current[indexB] = el; }}
                                                src={getOptimizedUrl(script[indexB].videoUrl)}
                                                className="absolute inset-0 w-full h-full object-contain z-10"
                                                muted
                                                loop
                                                playsInline
                                                onError={(e) => {
                                                    const err = e.currentTarget.error;
                                                    console.error(`[Step6] Video play failed for Cut ${indexB}. Code: ${err?.code}, Message: ${err?.message}`);
                                                    // Remove display:none to allow debugging visible feedback if needed, 
                                                    // but for now we keep it hidden to fall back to image seamlessly. 
                                                    // However, to debug "Static Image" issue, we might want to know if it failed.
                                                    // e.currentTarget.style.display = 'none'; 
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}



                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-20" />
                        </div>



                        {/* Layer 3: Thumbnail Overlay (if Active) */}
                        {showThumbnail && (
                            <div className="absolute inset-0 z-[60] bg-black">
                                <img
                                    src={resolvedThumbnail || "https://placehold.co/1920x1080/1a1a1a/333333?text=No+Thumbnail"}
                                    alt="Episode Thumbnail"
                                    className="w-full h-full object-contain"
                                />
                                {/* Only show text overlay when no custom thumbnail */}
                                {!resolvedThumbnail && (
                                    <>
                                        <div className="absolute inset-0 bg-gradient-to-bl from-black/60 via-transparent to-transparent" />
                                        <div className="absolute top-8 right-8 z-10 text-right">
                                            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 drop-shadow-2xl tracking-tight">
                                                #{useWorkflowStore.getState().episodeNumber || 1} {episodeName || "Untitled Episode"}
                                            </h1>
                                            <p className="text-xl md:text-2xl text-gray-200 drop-shadow-lg font-light tracking-wide">{seriesName || "Untitled Series"}</p>
                                        </div>
                                    </>
                                )}
                                {/* Play button always visible */}
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <button
                                        onClick={handleStartEpisode}
                                        className="group relative px-10 py-5 bg-white text-black rounded-full font-bold text-xl hover:scale-105 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                                    >
                                        <span className="relative z-10 flex items-center gap-3">
                                            <Play size={24} fill="currentColor" />
                                            에피소드 시작
                                        </span>
                                        <div className="absolute inset-0 rounded-full bg-white blur-lg opacity-50 group-hover:opacity-80 transition-opacity" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )
                }
            </div >

            {/* Subtitles Overlay */}
            {
                !showThumbnail && script[currentCutIndex] && (
                    <div className="absolute bottom-16 left-0 w-full flex justify-center z-40 px-12 pointer-events-none transition-opacity duration-300">
                        <div className="bg-black/50 backdrop-blur-sm px-8 py-4 rounded-xl max-w-4xl text-center">
                            <p className="text-xl md:text-2xl text-white font-medium drop-shadow-md whitespace-pre-wrap leading-relaxed">
                                {script[currentCutIndex].dialogue}
                            </p>
                        </div>
                    </div>
                )
            }

            {/* Controls Bar - Fixed to Bottom */}
            <div className={`absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/90 to-transparent flex items-end pb-6 px-12 gap-8 z-50 transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                <button
                    onClick={() => {
                        if (showThumbnail) {
                            handleStartEpisode();
                        } else {
                            setIsPlaying(!isPlaying, "Toggle Button");
                        }
                    }}
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
                        <span>{Math.floor(actualDuration / 60)}:{Math.round(actualDuration % 60).toString().padStart(2, '0')}</span>
                    </div>
                </div>

                <div className="pb-2 text-gray-400 font-medium">
                    CUT {currentCutIndex + 1} <span className="text-gray-600">/</span> {script.length}
                </div>
            </div>
        </div >
    );






    return (
        <div className="min-h-screen bg-[#111] text-white selection:bg-[var(--color-primary)] selection:text-black font-sans overflow-hidden">

            {/* New Compact Header */}
            {!viewOnly && (
                <div className="flex flex-wrap items-center justify-between gap-4 py-4 px-6 bg-[#1a1a1a] border-b border-white/5 mb-6">
                    {/* Left: Title & Info */}
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white tracking-tight">Final Assembly</h2>
                                <div className="h-4 w-px bg-white/20"></div>
                                <span className={`text-sm font-medium ${durationColor}`}>
                                    {Math.floor(actualDuration / 60)}:{Math.round(actualDuration % 60).toString().padStart(2, '0')}
                                    <span className="text-gray-500 mx-1">/</span>
                                    <span className="text-gray-400">{Math.floor(targetDuration / 60)}:{(targetDuration % 60).toString().padStart(2, '0')}</span>
                                </span>
                            </div>
                        </div>

                        {/* Middle: View Mode Toggle */}
                        <div className="bg-black/40 rounded-lg p-1 border border-white/10 flex gap-1">
                            <button
                                onClick={() => setPlaybackMode('hybrid')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${playbackMode === 'hybrid' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Film size={14} /> Hybrid
                            </button>
                            <button
                                onClick={() => setPlaybackMode('still')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${playbackMode === 'still' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ImageIcon size={14} /> Still
                            </button>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewOnly(true)}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors flex items-center gap-2"
                            title="Presentation Mode"
                        >
                            <Monitor size={16} /> <span className="hidden xl:inline">Presentation</span>
                        </button>
                        <div className="h-6 w-px bg-white/10 mx-1"></div>
                        <button
                            onClick={handleExportExcel}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors flex items-center gap-2"
                            title="Export Metadata"
                        >
                            <FileText size={16} /> <span className="hidden xl:inline">Data</span>
                        </button>
                        <button
                            onClick={handleExportZip}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors flex items-center gap-2"
                            title="Download Assets"
                        >
                            <Download size={16} /> <span className="hidden xl:inline">Assets</span>
                        </button>
                        <button
                            onClick={handleExportVideo}
                            disabled={isExportingVideo || !assetsLoaded}
                            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-black text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                        >
                            <Film size={16} /> {isExportingVideo ? 'Exporting...' : assetsLoaded ? 'Video Kit' : 'Loading Assets...'}
                        </button>

                    </div>
                </div>
            )}

            {/* Video Export Options Modal */}
            {
                showExportModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100000]">
                        <div className="glass-panel p-8 max-w-lg w-full relative">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                                <Film size={28} className="text-[var(--color-primary)]" />
                                Export Video
                            </h3>
                            <p className="text-gray-400 mb-6">원하는 내보내기 방식을 선택하세요</p>

                            {/* Export Visual Mode Selector */}
                            <div className="mb-6 p-4 bg-black/30 rounded-xl border border-white/5 space-y-3">
                                <label className="text-sm font-bold text-gray-400 block mb-1">비주얼 모드</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setExportHybrid(true)}
                                        className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${exportHybrid ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)] shadow-[0_4px_15px_rgba(var(--color-primary-rgb),0.3)]' : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20'}`}
                                    >
                                        <Film size={14} /> Hybrid (Video)
                                    </button>
                                    <button
                                        onClick={() => setExportHybrid(false)}
                                        className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${!exportHybrid ? 'bg-white text-black border-white shadow-[0_4px_15px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20'}`}
                                    >
                                        <ImageIcon size={14} /> Still Only
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    {exportHybrid
                                        ? "비디오 클립이 있는 컷은 비디오로 포함됩니다."
                                        : "모든 컷을 이미지로 내보냅니다. (비디오 클립 무시)"}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {/* Quick Export */}
                                <button
                                    onClick={handleQuickExport}
                                    disabled={!isCanvasRecordingSupported()}
                                    className="w-full p-5 glass-panel border border-white/10 hover:border-[var(--color-primary)]/50 rounded-xl text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-lg bg-yellow-500/20 text-yellow-400">
                                            <Zap size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                                ⚡ Quick Export (WebM)
                                            </h4>
                                            <p className="text-sm text-gray-400 mt-1">
                                                빠른 실시간 녹화. 양호한 화질, 자막 포함.
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Fast</span>
                                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">WebM</span>
                                            </div>
                                        </div>
                                    </div>
                                </button>

                                {/* High Quality Export */}
                                <button
                                    onClick={handleHQExport}
                                    className="w-full p-5 glass-panel border border-white/10 hover:border-[var(--color-primary)]/50 rounded-xl text-left transition-all group"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
                                            <Film size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                                🎥 High Quality (MP4)
                                            </h4>
                                            <p className="text-sm text-gray-400 mt-1">
                                                FFmpeg 기반 H.264 인코딩. 최고 화질, 범용 호환성.
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">Best Quality</span>
                                                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">MP4</span>
                                                {!isFFmpegSupported() && (
                                                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">CORS 설정 필요</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>

                                {/* Video Kit Export */}
                                <button
                                    onClick={handleVideoKitExport}
                                    className="w-full p-5 glass-panel border border-white/10 hover:border-[var(--color-primary)]/50 rounded-xl text-left transition-all group"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-lg bg-cyan-500/20 text-cyan-400">
                                            <Download size={24} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                                📦 Video Kit (ZIP)
                                            </h4>
                                            <p className="text-sm text-gray-400 mt-1">
                                                모든 에셋과 FFmpeg 스크립트를 다운로드. 외부 도구로 영상 제작.
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">Offline</span>
                                                <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded-full">ZIP</span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Video Export Progress Modal */}
            {
                isExportingVideo && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100000]">
                        <div className="glass-panel p-8 max-w-md w-full">
                            <h3 className="text-2xl font-bold text-white mb-4">비디오 내보내기</h3>
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
                )
            }

            {viewOnly ? createPortal(
                <div className="fixed inset-0 bg-black z-[999999] flex items-center justify-center p-4">
                    <div className="w-full max-w-screen-2xl max-h-screen aspect-video relative flex items-center justify-center">
                        {playerContent}
                    </div>
                </div>,
                document.body
            ) : (
                <div className="w-full max-w-[1200px] aspect-video mx-auto mb-12 shadow-2xl rounded-xl border border-white/10 overflow-hidden">
                    {playerContent}
                </div>
            )}

            {/* Hidden Audio Players (Double Buffered) - Made 'visible' to bypass browser restrictions */}
            <audio
                ref={audioARef}
                className="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none"
                preload="auto"
                controls={false}
                playsInline
                muted={false}
                onWaiting={() => { isBufferingRef.current = true; console.log("[Audio A] Buffering..."); }}
                onPlaying={handleAudioResume}
                onError={(e) => console.error("Audio A error:", e.currentTarget.error)}
            />
            <audio
                ref={audioBRef}
                className="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none"
                preload="auto"
                controls={false}
                playsInline
                muted={false}
                onWaiting={() => { isBufferingRef.current = true; console.log("[Audio B] Buffering..."); }}
                onPlaying={handleAudioResume}
                onError={(e) => console.error("Audio B error:", e.currentTarget.error)}
            />
            <audio
                ref={sfxRef}
                className="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none"
                preload="auto"
                controls={false}
                playsInline
                muted={false}
                onError={(e) => console.error("SFX error:", e.currentTarget.error)}

            />
        </div >
    );
};

export default Step6_Final;
