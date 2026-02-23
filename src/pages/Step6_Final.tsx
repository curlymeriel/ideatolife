import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { Play, Pause, Download, FileText, Monitor, Layout, Film, Zap, X, Image as ImageIcon, AlertTriangle, CheckCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportVideo, type VideoCut } from '../utils/videoExporter';
import { resolveUrl, isIdbUrl } from '../utils/imageStorage';
import { exportProjectToZip } from '../utils/zipExporter';
import { recordCanvasVideo, isCanvasRecordingSupported, type RecordingCut } from '../utils/canvasVideoRecorder';
import { exportWithFFmpeg, isFFmpegSupported } from '../utils/ffmpegExporter';
import { fixProjectScriptUrls } from '../utils/fixStorageUrls';
import { getResolution } from '../utils/aspectRatioUtils';

// Helper to get audio duration with a 10s timeout to prevent hanging the asset pipeline
const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        const timeout = setTimeout(() => {
            console.warn(`[getAudioDuration] Timeout for ${url.substring(0, 50)}...`);
            resolve(0);
        }, 10000);

        audio.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve(audio.duration);
        };
        audio.onerror = () => {
            clearTimeout(timeout);
            resolve(0);
        };
    });
};

export const Step6_Final = () => {
    const location = useLocation();
    // State for subtitle toggles - Moved to top to avoid hoisting issues
    const [showSubtitles, setShowSubtitles] = useState(true);
    const [exportSubtitles, setExportSubtitles] = useState(true);
    const [exportThumbnail, setExportThumbnail] = useState(false); // Default: false for explicit opt-in

    const {
        id: projectId,
        script,
        seriesName,
        episodeName,
        targetDuration,
        thumbnailUrl,
        storylineTable,
        aspectRatio, // Destructure aspectRatio
        bgmTracks, // Destructure bgmTracks
        setScript, // Add setScript for migration
    } = useWorkflowStore();

    // Custom CC Icon Component - Defined inside is okay, or move outside if no props dependency
    const CustomCCIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            <path d="M6 15h4" />
            <path d="M14 15h4" />
        </svg>
    );





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

    // url REPAIR Fix (Auto-run: Reverts .appspot.com -> .firebasestorage.app)
    useEffect(() => {
        if (script && script.length > 0) {
            const fixedScript = fixProjectScriptUrls(script);
            if (fixedScript) {
                console.log("[Step6] 🛠️ REPAIR: Fixing Invalid .appspot.com URLs back to .firebasestorage.app...");
                setScript(fixedScript);
            }
        }
    }, [script, setScript]);

    // Check for Presentation Mode from URL
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('mode') === 'presentation') {
            setViewOnly(true);
        }
    }, [location.search]);

    const isPresentationMode = new URLSearchParams(location.search).get('mode') === 'presentation';

    const [assetsLoaded, setAssetsLoaded] = useState(false); // Priority assets for player
    const [isAllAssetsLoaded, setIsAllAssetsLoaded] = useState(false); // All assets for export
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
    const [blobCache, setBlobCache] = useState<Record<string, string>>({});
    const [audioDurations, setAudioDurations] = useState<Record<number, number>>({});
    const [resolvedThumbnail, setResolvedThumbnail] = useState<string | null>(null);
    const startTimeRef = useRef<number>(0);
    const blobCacheRef = useRef<Record<string, string>>({}); // Ref for cleanup

    const isBufferingRef = useRef(false);

    // DEBUG: Comment out to reduce console spam
    // console.log(`[Step6 Render] State Check: assetsLoaded=${assetsLoaded}, showThumbnail=${showThumbnail}, isPlaying=${isPlayingState}`);
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
        if (!projectId) return;
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
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportDone, setExportDone] = useState(false);
    const [tabHiddenWarning, setTabHiddenWarning] = useState(false);
    const exportAbortRef = useRef<AbortController | null>(null);

    // Tab visibility warning during export
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && isExportingVideo) {
                setTabHiddenWarning(true);
                console.warn('[Step6] Tab hidden during export! Risk of OOM crash.');
            } else if (!document.hidden && tabHiddenWarning) {
                // Tab came back - keep warning visible until export ends
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [isExportingVideo, tabHiddenWarning]);

    // NEW: Playback Mode (Hybrid vs Still) and Video Refs
    const [playbackMode, setPlaybackMode] = useState<'hybrid' | 'still'>('hybrid');
    const [exportHybrid, setExportHybrid] = useState(true);
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);


    // DUAL BUFFER SYNC LOGIC (Matches Video Element Logic)
    // Declared at top-level so it is accessible to useEffect and JSX
    const isEven = currentCutIndex % 2 === 0;
    const activeSlot = isEven ? 'A' : 'B';
    const indexA = isEven ? currentCutIndex : currentCutIndex + 1;
    const indexB = isEven ? currentCutIndex + 1 : currentCutIndex;

    // Helper to get effective duration (Max of estimated vs actual audio)
    const getCutDuration = (index: number) => {
        const cut = script[index];
        if (!cut) return 0;

        let videoDur = 0;
        // Priority 1: If valid videoTrim exists, calculate duration from it directly
        if (cut.videoTrim) {
            const { start = 0, end = 0 } = cut.videoTrim;
            const trimDuration = end - start;
            // Fallback: If trim end is 0 or less than start, use reported videoDuration if available
            if (trimDuration > 0) {
                videoDur = trimDuration;
            } else if (cut.videoDuration && cut.videoDuration > 0) {
                videoDur = cut.videoDuration;
            }
        }
        // Fallback: Custom video duration
        else if (cut.videoDuration && cut.videoDuration > 0) {
            videoDur = cut.videoDuration;
        }

        const audioDur = audioDurations[index] || 0;
        // [FIX] Fallback to estimated duration if audio exists but hasn't loaded yet
        // This prevents the cut from being skipped or super short during loading
        const effectiveAudioDur = audioDur > 0
            ? audioDur + (cut.audioPadding ?? 0.5)
            : (cut.audioUrl ? (cut.estimatedDuration || 5) : 0);

        // [New Logic] Respect Duration Master preference
        const master = cut.cutDurationMaster || 'audio';

        if (master === 'video' && videoDur > 0) {
            // Strictly follow Video Trim/Duration if set as Master
            return videoDur;
        }

        // Default 'audio' logic (or fallback if video duration unknown)
        // Case A: Video Audio is USED (Authentic Video Mode) -> Video dictates timing
        if (cut.useVideoAudio) {
            // If video duration is known, trust it. Otherwise fallback to audio/estimate.
            return videoDur > 0 ? videoDur : (effectiveAudioDur || cut.estimatedDuration || 5);
        }

        // Case B: TTS/Mix Mode (Hybrid) -> MAX of Video or Audio
        // Respect the Dialogue if it's longer than the video (audio won't be cut).
        return Math.max(videoDur, effectiveAudioDur, cut.estimatedDuration || 5);
    };

    // ========================
    // BGM LOGIC
    // ========================
    const bgmRefs = useRef<Record<string, HTMLAudioElement>>({});

    // Calculate start times for all cuts (cumulative) to map BGM ranges
    const cutStartTimes = React.useMemo(() => {
        const times: number[] = [0];
        let runningTotal = 0;
        script.forEach((_, i) => {
            const dur = getCutDuration(i);
            runningTotal += dur;
            times.push(runningTotal);
        });
        return times;
    }, [script, audioDurations, playbackMode]);

    // Initialize BGM Audio Elements
    useEffect(() => {
        const initBGM = async () => {
            // Cleanup old
            Object.values(bgmRefs.current).forEach(audio => {
                audio.pause();
                audio.src = "";
            });
            bgmRefs.current = {};

            if (!bgmTracks || bgmTracks.length === 0) return;

            console.log(`[Step6] Initializing ${bgmTracks.length} BGM tracks`);

            for (const track of bgmTracks) {
                if (!track.url) continue;

                let finalUrl = track.url;
                if (isIdbUrl(track.url)) {
                    finalUrl = await resolveUrl(track.url, { asBlob: true });
                }

                if (finalUrl) {
                    const audio = new Audio(finalUrl);
                    audio.loop = track.loop;
                    audio.volume = track.volume ?? 0.5;
                    audio.preload = 'auto'; // Preload for smooth playback
                    bgmRefs.current[track.id] = audio;
                }
            }
        };

        initBGM();

        return () => {
            Object.values(bgmRefs.current).forEach(audio => {
                audio.pause();
                audio.src = "";
            });
        };
    }, [bgmTracks]);

    // BGM SYNC FUNCTION (Called in loop)
    const syncBGM = (globalTime: number, isPlaying: boolean, currentCutIdx: number) => {
        bgmTracks?.forEach(track => {
            const audio = bgmRefs.current[track.id];
            if (!audio) return;

            // Resolve cut IDs to time
            // Find index of startCutId (Robust comparison)
            const startIndex = script.findIndex(c => String(c.id) === String(track.startCutId));
            const endIndex = script.findIndex(c => String(c.id) === String(track.endCutId));

            if (startIndex === -1) return; // Invalid track

            const startTime = cutStartTimes[startIndex] || 0;
            // End time is START of next cut (end of endCut)
            const endTime = (endIndex !== -1 && endIndex + 1 < cutStartTimes.length)
                ? cutStartTimes[endIndex + 1]
                : cutStartTimes[cutStartTimes.length - 1];

            // If invalid range, ignore
            if (startTime >= endTime) return;

            // Check if active
            if (globalTime >= startTime && globalTime < endTime) {
                // SHOULD BE PLAYING
                const targetTime = globalTime - startTime;

                // VOLUME DUCKING LOGIC
                // Check local volume setting for the current cut
                const currentCut = script[currentCutIdx];
                const duckingMultiplier = currentCut?.audioVolumes?.bgm ?? 1;
                const baseVolume = track.volume ?? 0.5;
                audio.volume = Math.max(0, Math.min(1, baseVolume * duckingMultiplier));

                if (isPlaying) {
                    if (audio.paused) {
                        audio.currentTime = targetTime;
                        audio.play().catch(e => console.warn("BGM Play failed", e));
                    } else {
                        // Drift Correction
                        if (Math.abs(audio.currentTime - targetTime) > 0.3) {
                            audio.currentTime = targetTime;
                        }
                    }
                } else {
                    // Paused state
                    if (!audio.paused) audio.pause();
                    // Keep time synced even when paused for seeking
                    if (Math.abs(audio.currentTime - targetTime) > 0.5) {
                        audio.currentTime = targetTime;
                    }
                }
            } else {
                // STOPPED (Outside range)
                if (!audio.paused) {
                    audio.pause();
                    audio.currentTime = 0; // Reset
                }
            }
        });
    };

    // 1. Optimize Assets (Convert Base64 to Blob URLs & Measure Audio)
    // Priority loading: load first 5 cuts first, then rest in background
    const lastScriptRef = React.useRef<string>('');
    const lastStateUpdateRef = React.useRef<number>(0);

    useEffect(() => {
        const currentScriptJson = JSON.stringify({
            script: script.map(c => ({
                id: c.id,
                audioUrl: c.audioUrl,
                sfxUrl: c.sfxUrl,
                finalImageUrl: c.finalImageUrl,
                draftImageUrl: c.draftImageUrl,
                videoUrl: c.videoUrl
            })),
            bgmTracks: bgmTracks.map(t => ({ id: t.id, url: t.url }))
        });

        if (lastScriptRef.current === currentScriptJson && assetsLoaded) {
            return;
        }
        lastScriptRef.current = currentScriptJson;

        const optimizeAssets = async () => {
            console.log(`[Step6] Optimizing assets for ${script.length} cuts`);
            console.log(`[Step6] First few audio URLs:`, script.slice(0, 3).map(c => c.audioUrl));

            setLoadingProgress({ current: 0, total: script.length });
            const newCache: Record<string, string> = {};

            const processUrl = async (url: string) => {
                // Optimization: If it's already a resolved format, return as is.
                if (!url || url.startsWith('blob:') || url.startsWith('http')) return url;

                // Handle idb:// URLs - resolve from IndexedDB
                if (isIdbUrl(url)) {
                    // [IMPORTANT] Use asBlob: true to leverage centralized caching and prevent ERR_FILE_NOT_FOUND
                    const resolved = await resolveUrl(url, { asBlob: true });
                    return resolved || undefined;
                }

                return url;
            };

            // Resolve Thumbnail
            if (thumbnailUrl) {
                try {
                    const resolved = await processUrl(thumbnailUrl);
                    if (resolved) {
                        newCache[thumbnailUrl] = resolved;
                        setResolvedThumbnail(resolved);
                        // [FIX] Ensure the resolved thumbnail is immediately available in the ref 
                        // for export preparation so it doesn't get dropped.
                        blobCacheRef.current[thumbnailUrl] = resolved;
                    }
                } catch (e) { console.error("Failed to process thumbnail:", e); }
            }

            // Resolve BGM Tracks
            if (bgmTracks && bgmTracks.length > 0) {
                for (const track of bgmTracks) {
                    if (track.url) {
                        try {
                            const resolved = await processUrl(track.url);
                            if (resolved) {
                                newCache[track.url] = resolved;
                                blobCacheRef.current[track.url] = resolved;
                            }
                        } catch (e) { console.error("Failed to process BGM track:", e); }
                    }
                }
            }

            // Helper to process a cut and return updates
            const processCutAndGetUpdates = async (cut: typeof script[0], index: number) => {
                const updates: { cache: Record<string, string>, durations: Record<number, number> } = { cache: {}, durations: {} };

                try {
                    const addToCache = (original: string | undefined, resolved: string | undefined) => {
                        if (original && resolved && !resolved.startsWith('idb://')) {
                            updates.cache[original] = resolved;
                        }
                    };

                    // 1. Audio (Measure duration)
                    if (cut.audioUrl) {
                        const url = await processUrl(cut.audioUrl);
                        if (url) {
                            addToCache(cut.audioUrl, url);
                            // Only measure if format is supported and resolved
                            if (url.startsWith('blob:') || url.startsWith('http')) {
                                const duration = await getAudioDuration(url);
                                if (duration > 0) updates.durations[index] = duration;
                            }
                        }
                    }

                    // 2. SFX
                    if (cut.sfxUrl) addToCache(cut.sfxUrl, await processUrl(cut.sfxUrl));

                    // 3. Images
                    if (cut.finalImageUrl) addToCache(cut.finalImageUrl, await processUrl(cut.finalImageUrl));
                    if (cut.draftImageUrl) addToCache(cut.draftImageUrl, await processUrl(cut.draftImageUrl));

                    // 4. Video
                    if (cut.videoUrl) addToCache(cut.videoUrl, await processUrl(cut.videoUrl));

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

            // CRITICAL: Priority assets (first 5) are loaded. Player can start.
            setAssetsLoaded(true);
            setLoadingProgress(prev => ({ ...prev, current: PRIORITY_COUNT }));

            // IMMEDIATE PRELOAD FOR CUT 0
            if (script.length > 0 && script[0].audioUrl) {
                const audioUrl0 = script[0].audioUrl;
                const resolvedUrl = priorityCache[audioUrl0];
                if (resolvedUrl && !resolvedUrl.startsWith('idb://') && audioARef.current) {
                    audioARef.current.src = resolvedUrl;
                    audioARef.current.load();
                }
            }

            // Load rest in background
            if (restCuts.length > 0) {
                const BATCH_SIZE = 8; // Reduced batch size for smoother UI on 8GB RAM
                for (let i = 0; i < restCuts.length; i += BATCH_SIZE) {
                    const batch = restCuts.slice(i, i + BATCH_SIZE);
                    const batchResults = await Promise.all(batch.map((cut, batchIndex) =>
                        processCutAndGetUpdates(cut, PRIORITY_COUNT + i + batchIndex)
                    ));

                    const batchCache: Record<string, string> = {};
                    const batchDurations: Record<number, number> = {};
                    batchResults.forEach(res => {
                        Object.assign(batchCache, res.cache);
                        Object.assign(batchDurations, res.durations);
                    });

                    if (Object.keys(batchCache).length > 0) {
                        setBlobCache(prev => ({ ...prev, ...batchCache }));
                        blobCacheRef.current = { ...blobCacheRef.current, ...batchCache };
                        setAudioDurations(prev => ({ ...prev, ...batchDurations }));
                    }

                    setLoadingProgress(prev => ({ ...prev, current: Math.min(prev.total, PRIORITY_COUNT + i + batch.length) }));
                    await new Promise(r => setTimeout(r, 20)); // Increased sleep for UI thread
                }
                setIsAllAssetsLoaded(true);
            } else {
                setIsAllAssetsLoaded(true);
            }
        };

        optimizeAssets();

        return () => {
            // [FIX] Removed aggressive revocation to prevent ERR_FILE_NOT_FOUND during edit/state updates
            // Centralized cleanup should be handled by clearBlobUrlCache on project switch or unmount if needed
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

        // DEBUG: Log video URLs to check for corruption
        if (originalUrl.includes('video') || originalUrl.includes('mp4') || originalUrl.includes('webm')) {
            console.log('[DEBUG VIDEO URL]', { originalUrl, resolvedUrl: url });
        }

        return url;
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

            // SYNC BGM
            // Pass foundIndex if valid (transitioning), otherwise currentCutIndex
            syncBGM(totalElapsed, true, foundIndex !== -1 ? foundIndex : currentCutIndex);

            if (foundIndex !== -1) {
                if (foundIndex !== currentCutIndex) {
                    // console.log(`[Step6] Cut Transition: ${currentCutIndex} -> ${foundIndex}`);
                    setCurrentCutIndex(foundIndex);
                }

                // STRICT VIDEO SYNC (Drift Correction)
                if (playbackMode === 'hybrid') {
                    const cut = script[foundIndex];
                    const cutStartTime = accumulatedTime - getCutDuration(foundIndex);
                    const localTime = totalElapsed - cutStartTime;
                    const videoEl = videoRefs.current[foundIndex];

                    if (videoEl) {
                        const shouldUseVideoAudio = cut?.useVideoAudio && cut?.videoUrl;

                        // VIDEO MASTER MODE:
                        // If using video audio, the VIDEO is the master clock.
                        // We must sync the Global Timer TO the video, not vice versa.
                        if (shouldUseVideoAudio && !videoEl.paused && !videoEl.seeking && videoEl.readyState >= 2) {
                            // Calculate where we SHOULD be based on video progress within its trim
                            const videoStartOffset = cut?.videoTrim?.start || 0;
                            // globalTime = cutStartTime + (videoTime - startOffset)
                            let videoTimeInGlobal = cutStartTime + Math.max(0, videoEl.currentTime - videoStartOffset);

                            // Adjust StartTimeRef to match Video Time
                            const drift = Math.abs(totalElapsed - videoTimeInGlobal);
                            // Slightly tighter threshold for master sync to prevent accumulation
                            if (drift > 0.05) {
                                startTimeRef.current = Date.now() - (videoTimeInGlobal * 1000);
                            }
                        }
                        // WALL CLOCK MASTER MODE:
                        // If NOT using video audio (e.g. TTS + Background Video), the Timer is master.
                        // We force the video to match the timer.
                        else if (!videoEl.paused && !videoEl.seeking && videoEl.readyState >= 2) {
                            // CALC TARGET TIME WITH TRIM AWARENESS
                            // [FIX] Freeze on last frame instead of looping
                            let targetTime = localTime;
                            if (cut?.videoTrim) {
                                const { start, end } = cut.videoTrim;
                                const trimDuration = end - start;
                                if (trimDuration > 0) {
                                    // Clamp to end
                                    targetTime = Math.min(localTime + start, end);
                                }
                            } else if (videoEl.duration && Number.isFinite(videoEl.duration)) {
                                targetTime = Math.min(localTime, videoEl.duration);
                            }

                            const drift = Math.abs(videoEl.currentTime - targetTime);
                            // Relaxed threshold from 0.3 to 0.5 to prevent micro-stutters
                            if (drift > 0.5) {
                                videoEl.currentTime = targetTime;
                            }
                        }
                    }

                    // AUDIO SYNC & CUT-OFF:
                    // Ensure TTS audio doesn't bleed into next cut if video is trimmed
                    const audioPlayer = getPlayerForIndex(foundIndex);
                    if (audioPlayer && !audioPlayer.paused) {
                        const cutDur = getCutDuration(foundIndex);
                        // If audio is playing past the current cut's duration, pause it
                        if (localTime >= cutDur) {
                            // console.log(`[AudioSync] Cut ${foundIndex} ended (Trimmed). Pausing audio.`);
                            audioPlayer.pause();
                        } else {
                            // Sync check: If audio drifts > 0.5s from wall clock, nudge it
                            const audioDrift = Math.abs(audioPlayer.currentTime - localTime);
                            if (audioDrift > 0.5) {
                                // console.log(`[AudioSync] Nudging Cut ${foundIndex} audio drift: ${audioDrift.toFixed(2)}s`);
                                audioPlayer.currentTime = localTime;
                            }
                        }
                    }
                }

                animationFrameId = requestAnimationFrame(updateLoop);
            } else {
                // End of script
                console.log(`[Step6] Script ended? TotalElapsed:${totalElapsed.toFixed(3)}s, Accumulated:${accumulatedTime.toFixed(3)}s, ScriptLen:${script.length}`);
                console.log(`[Step6] Playback stopped. IsPlaying set to false.`);
                setIsPlaying(false, "End of Script (updateLoop)");
                syncBGM(totalElapsed, false, 0); // Pause BGM
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
    }, [isPlaying, showThumbnail, script, currentCutIndex, audioDurations, bgmTracks, cutStartTimes, blobCache]);



    const handleMediaResume = (e: React.SyntheticEvent<HTMLMediaElement>) => {
        isBufferingRef.current = false;
        const media = e.currentTarget;
        const isVideo = media instanceof HTMLVideoElement;
        console.log(`[Media] ${isVideo ? 'Video' : 'Audio'} Resumed. Duration: ${media.duration}`);

        if (media instanceof HTMLAudioElement && Number.isFinite(media.duration) && media.duration > 0) {
            const isA = media === audioARef.current;
            const isEven = currentCutIndex % 2 === 0;

            if (isA === isEven) {
                const cachedDur = audioDurations[currentCutIndex];
                if (!cachedDur || cachedDur === 0) {
                    console.log(`[Step6] Self-healing duration for Cut ${currentCutIndex}: ${media.duration}`);
                    setAudioDurations(prev => {
                        if (prev[currentCutIndex] === media.duration) return prev;
                        return { ...prev, [currentCutIndex]: media.duration };
                    });
                }
            }
        }
    };

    const stopAll = () => {
        audioARef.current?.pause();
        audioBRef.current?.pause();
        sfxRef.current?.pause();
        // Pause BGM
        Object.values(bgmRefs.current).forEach(a => a.pause());
        // Pause all videos
        videoRefs.current.forEach(v => {
            if (v) v.pause();
        });
    };


    // DUAL BUFFER SYNC LOGIC (Matches Video Element Logic)


    // Unmount cleanup ONLY

    useEffect(() => {
        return () => stopAll();
    }, []);


    // NEW: Handle Audio State transitions cleanly (Moved out of updateLoop)
    useEffect(() => {
        if (!playbackMode || playbackMode !== 'hybrid') return;

        const curIndex = currentCutIndex;
        const cut = script[curIndex];
        const videoEl = videoRefs.current[curIndex];

        if (videoEl && cut) {
            const shouldUseVideoAudio = cut.useVideoAudio && cut.videoUrl;
            // console.log(`[Step6 Audio] Transition to Cut ${curIndex}. UseVideoAudio: ${shouldUseVideoAudio}`);

            if (shouldUseVideoAudio) {
                // Ensure unmutes
                videoEl.muted = false;
                videoEl.volume = 1.0;
            } else {
                // Ensure muted if we're using TTS (to avoid bg noise)
                videoEl.muted = true;
            }
        }
    }, [currentCutIndex, script, playbackMode]);

    useEffect(() => {
        if (!assetsLoaded) return;

        // Don't log on every render if playing
        // console.log(`[PlaybackEffect] Running. Cut:${currentCutIndex} Playing:${isPlaying} Thumb:${showThumbnail}`);

        if (isPlaying && !showThumbnail) {
            const currentCut = script[currentCutIndex];
            const nextCut = script[currentCutIndex + 1];

            const currentPlayer = getPlayerForIndex(currentCutIndex);
            const nextPlayer = getPlayerForIndex(currentCutIndex + 1);

            // 1. PLAY CURRENT (TTS Audio)
            // Skip TTS if:
            // - Hybrid Mode AND Video Audio is enabled
            // - Still Mode: ALWAYS play TTS (since video audio is impossible)
            const shouldPlayTts = playbackMode === 'still' || !currentCut?.useVideoAudio || !currentCut?.videoUrl;

            if (currentPlayer && shouldPlayTts) {
                // Use Ref for lookup to avoid dependency on blobCache state updates
                // This prevents audio stopping when background assets load
                const rawUrl = currentCut?.audioUrl;
                let url: string | undefined = undefined;
                if (rawUrl) {
                    url = blobCacheRef.current[rawUrl] || rawUrl;
                    if (url.startsWith('idb://')) url = undefined;
                }

                if (url) {
                    // Define local async player function (re-defined to ensure scope access)
                    const playAudio = async (retryCount = 0) => {
                        try {
                            if (!currentPlayer) return;

                            // Prevent redundant play calls causing stutter
                            // Only skip if:
                            // 1. We already started playing this exact cut index
                            // 2. AND the player is actually playing (not paused/stalled)
                            // 3. AND the source hasn't changed
                            const isRedundant = lastPlayedCutIndexRef.current === currentCutIndex && !currentPlayer.paused && currentPlayer.src === url;

                            if (isRedundant) {
                                // console.log(`[Audio ${currentCutIndex}] Already playing, skipping redundant call.`);
                                return;
                            }

                            lastPlayedCutIndexRef.current = currentCutIndex;

                            // Only set src if it changed to avoid reloading
                            if (currentPlayer.src !== url) {
                                console.log(`[Audio ${currentCutIndex}] Setting source to:`, url.substring(0, 50));
                                currentPlayer.src = url;
                            }

                            // If we have a pending play, wait for it
                            if (playPromiseRef.current) {
                                try {
                                    await playPromiseRef.current;
                                } catch (e) { /* Ignore previous aborts */ }
                            }

                            // Ensure the OTHER player is paused AND reset
                            if (nextPlayer) {
                                nextPlayer.pause();
                                nextPlayer.currentTime = 0;
                            }

                            // FORCE RESET: Load explicitly if starting fresh or if previous ended
                            if (currentPlayer.currentTime > 0 || currentPlayer.ended) {
                                currentPlayer.currentTime = 0;
                            }

                            // FORCE RESET VOLUME/MUTE to ensure audible playback
                            currentPlayer.volume = 1;
                            currentPlayer.muted = false;

                            // console.log(`[Audio ${currentCutIndex}] Playing on ${currentCutIndex % 2 === 0 ? 'A' : 'B'} (Vol:${currentPlayer.volume})`);

                            // Explicitly load if not ready (HAVE_NOTHING or HAVE_METADATA)
                            if (currentPlayer.readyState < 2) {
                                // console.log(`[Audio ${currentCutIndex}] Player not ready, forcing load()`);
                                currentPlayer.load();
                            }

                            playPromiseRef.current = currentPlayer.play();
                            await playPromiseRef.current;
                        } catch (e: any) {
                            if (!currentPlayer) return;

                            // RETRY LOGIC for NotSupportedError or similar transient issues
                            if (retryCount < 1 && (e.name === 'NotSupportedError' || e.name === 'AbortError')) {
                                console.log(`[Audio ${currentCutIndex}] Retrying playback...`);
                                setTimeout(() => playAudio(retryCount + 1), 50);
                                return;
                            }

                            if (e.name !== 'AbortError') {
                                console.warn(`[Audio ${currentCutIndex}] Play failed:`, e);
                            }
                        }
                    };

                    // Execute the player
                    playAudio();
                }
            } else if (currentPlayer) {
                // Mute/Pause if not supposed to play TTS
                currentPlayer.pause();
            }


            // 2. SFX PLAYBACK
            if (sfxRef.current) {
                const sfxRawUrl = currentCut?.sfxUrl;
                if (sfxRawUrl) {
                    const sfxUrl = getOptimizedUrl(sfxRawUrl); // Resolve basic URL or blob

                    if (sfxUrl) {
                        // Only set src if changed
                        if (sfxRef.current.src !== sfxUrl) {
                            sfxRef.current.src = sfxUrl;
                        }

                        sfxRef.current.volume = currentCut.sfxVolume ?? 0.3;
                        // Reset to start for every new cut to ensure it plays
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
                    // Reset if new cut - RESPECT TRIM
                    const trimStart = currentCut?.videoTrim?.start || 0;
                    if (Math.abs(currentVideo.currentTime - trimStart) > 0.5) {
                        currentVideo.currentTime = trimStart;
                    }

                    // NEW: Control video mute based on useVideoAudio flag
                    const shouldUseVideoAudio = currentCut?.useVideoAudio && currentCut?.videoUrl;
                    console.log(`[DEBUG Video ${currentCutIndex}] BEFORE: muted=${currentVideo.muted}, volume=${currentVideo.volume}, useVideoAudio=${currentCut?.useVideoAudio}`);
                    currentVideo.muted = !shouldUseVideoAudio;
                    currentVideo.volume = 1; // Always set volume
                    console.log(`[DEBUG Video ${currentCutIndex}] AFTER SET: muted=${currentVideo.muted}, volume=${currentVideo.volume}`);
                    if (shouldUseVideoAudio) {
                        console.log(`[Video ${currentCutIndex}] Using VIDEO AUDIO (unmuted, vol=1)`);
                    }

                    const playVideo = async () => {
                        try {
                            // Ensure it's not paused
                            if (currentVideo.paused) {
                                // Force unmute again right before play for safety
                                if (shouldUseVideoAudio) {
                                    currentVideo.muted = false;
                                    currentVideo.volume = 1;
                                    console.log(`[DEBUG Video ${currentCutIndex}] RIGHT BEFORE PLAY: muted=${currentVideo.muted}`);
                                }
                                console.log(`[Video ${currentCutIndex}] Starting video playback force`);
                                await currentVideo.play();
                                console.log(`[DEBUG Video ${currentCutIndex}] AFTER PLAY: muted=${currentVideo.muted}, paused=${currentVideo.paused}`);
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

    const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>, index: number) => {
        const video = e.currentTarget;
        const cut = script[index];
        if (!cut || !cut.videoTrim) return;

        const { start, end } = cut.videoTrim;
        if (end <= start || end <= 0) return;

        // [Sync Check] enforce boundary (start/end)
        if (video.currentTime < start - 0.2) {
            video.currentTime = start;
        } else if (video.currentTime >= end - 0.05) {
            if (!video.paused) {
                video.pause();
                video.currentTime = end;
            }
        }
    };

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
            a.download = getSafeFilename('zip');
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
        const safeSeriesName = (seriesName || 'Untitled_Series').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
        const safeEpisodeName = (episodeName || 'Untitled_Episode').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
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
        const cut0 = script[0];
        const video0 = videoRefs.current[0];
        if (video0 && cut0) {
            console.log("[Step6] Pre-rolling Cut 0 Video...");
            // RESPECT TRIM
            const trimStart = cut0.videoTrim?.start || 0;
            video0.currentTime = trimStart;

            // FORCE UNMUTE at USER GESTURE for autoplay policy
            if (cut0.useVideoAudio && cut0.videoUrl) {
                console.log("[Step6] Forcing Video Audio ON for Cut 0");
                video0.muted = false;
                video0.volume = 1;
            }

            try {
                await video0.play();
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
        console.log(`[Step6:Prepare] Preparing cuts with includeVideo=${includeVideo}. Script length: ${script.length}`);

        const mappedCuts: RecordingCut[] = script.map((cut, index) => {
            const imgUrl = getOptimizedUrl(cut.finalImageUrl || cut.draftImageUrl);
            if (!imgUrl) {
                console.warn(`[Step6:Prepare] Cut ${index} has no resolved image URL!`, {
                    final: cut.finalImageUrl,
                    draft: cut.draftImageUrl,
                    id: cut.id
                });
            }

            // [DIAGNOSTIC] Detailed video URL logging for debugging black screen issues
            const resolvedVideoUrl = includeVideo ? getOptimizedUrl(cut.videoUrl) : undefined;
            if (includeVideo && cut.videoUrl) {
                const cachedUrl = blobCacheRef.current[cut.videoUrl] || blobCache[cut.videoUrl];
                console.log(`[Step6:Prepare] Cut ${index} VIDEO DIAGNOSTIC:`, {
                    originalUrl: cut.videoUrl?.substring(0, 80),
                    cachedInBlobCache: !!cachedUrl,
                    cachedUrlPrefix: cachedUrl?.substring(0, 30),
                    resolvedUrl: resolvedVideoUrl?.substring(0, 50),
                    isResolved: !!resolvedVideoUrl,
                    videoTrim: cut.videoTrim,
                    useVideoAudio: cut.useVideoAudio,
                    videoSource: (cut as any).videoSource,
                });
                if (!resolvedVideoUrl) {
                    console.error(`[Step6:Prepare] ❌ Cut ${index} VIDEO URL LOST! Original: "${cut.videoUrl?.substring(0, 80)}". This cut will render as IMAGE-ONLY in export!`);
                }
            }

            return {
                imageUrl: imgUrl || '',
                videoUrl: resolvedVideoUrl,
                videoTrim: cut.videoTrim,
                audioUrl: getOptimizedUrl(cut.audioUrl),
                sfxUrl: getOptimizedUrl(cut.sfxUrl),
                sfxVolume: cut.sfxVolume,
                useVideoAudio: cut.useVideoAudio,
                duration: getCutDuration(index),
                dialogue: cut.dialogue,
                speaker: cut.speaker,
                id: cut.id // Critical for BGM sync
            };
        });

        const cuts = mappedCuts.filter(c => c.imageUrl);
        console.log(`[Step6:Prepare] Filtered cuts: ${cuts.length}/${script.length}`);

        // Add 2s Thumbnail Intro if available
        const optimizedThumbnail = getOptimizedUrl(thumbnailUrl || undefined);
        if (optimizedThumbnail) {
            console.log("[Step6:Prepare] Adding thumbnail intro to export");
            cuts.unshift({
                imageUrl: optimizedThumbnail,
                duration: 2.0,
                dialogue: '',
                id: 'thumbnail-intro'
            });
        }

        return cuts;
    };

    // Helper: Generate safe filename
    const getSafeFilename = (extension: string) => {
        const safeSeries = (seriesName || 'Untitled_Series').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
        const safeEpisode = (episodeName || 'Untitled_Episode').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
        return `${safeSeries} - ${safeEpisode}.${extension}`;
    };

    // Quick Export (WebM via Canvas Recording)
    const handleQuickExport = async () => {
        setShowExportModal(false);
        setExportType('quick');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Initializing...');
        setExportError(null);
        setExportDone(false);
        setTabHiddenWarning(false);

        try {
            const recordingCuts = prepareRecordingCuts(exportHybrid);
            if (recordingCuts.length === 0) {
                setExportError('내보낼 이미지가 없습니다.');
                return;
            }

            const exportRes = getResolution(aspectRatio);
            const result = await recordCanvasVideo(
                recordingCuts,
                { width: exportRes.width, height: exportRes.height, fps: 30, showSubtitles: exportSubtitles, aspectRatio: aspectRatio || '16:9' },
                (progress, status) => {
                    setExportProgress(Math.round(progress));
                    setExportStatus(status);
                }
            );

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getSafeFilename(result.format);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setExportDone(true);
            setExportStatus('내보내기 완료! 파일이 다운로드됩니다.');
            setExportProgress(100);

        } catch (error: any) {
            console.error("Quick export failed:", error);
            setExportError(error?.message || '알 수 없는 오류로 내보내기에 실패했습니다.');
        }
        // NOTE: No finally cleanup - user manually closes the modal
    };

    // High Quality Export (MP4 via FFmpeg.wasm)
    const handleHQExport = async () => {
        if (!isFFmpegSupported()) {
            setExportError('이 브라우저에서는 고화질 내보내기를 지원하지 않습니다.\nSharedArrayBuffer가 필요합니다. Quick Export를 사용하세요.');
            setIsExportingVideo(true);
            return;
        }

        setShowExportModal(false);
        setExportType('hq');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('FFmpeg 로딩 중...');
        setExportError(null);
        setExportDone(false);
        setTabHiddenWarning(false);

        // Create AbortController for cancellation
        const abortController = new AbortController();
        exportAbortRef.current = abortController;

        try {
            const recordingCuts = prepareRecordingCuts(exportHybrid);
            if (recordingCuts.length === 0) {
                setExportError('내보낼 이미지가 없습니다.');
                return;
            }

            // Calculate start times for BGM resolution in FFmpeg
            let currentTime = 0;
            const cutStartTimeMap = recordingCuts.map(c => {
                const start = currentTime;
                currentTime += c.duration;
                return start;
            });

            const hqRes = getResolution(aspectRatio);

            // Prepare thumbnail as JPEG Uint8Array for max compatibility
            let thumbnailData: Uint8Array | undefined;
            if (exportThumbnail && thumbnailUrl) {
                try {
                    setExportProgress(1);
                    setExportStatus('Preparing thumbnail...');
                    const urlToFetch = isIdbUrl(thumbnailUrl) ? await resolveUrl(thumbnailUrl) : thumbnailUrl;
                    if (urlToFetch) {
                        // Load image to convert to JPEG
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = urlToFetch;
                        });

                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.fillStyle = '#FFFFFF'; // White background for transparency
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);

                            // Convert to JPEG
                            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                            const res = await fetch(jpegDataUrl);
                            const buf = await res.arrayBuffer();
                            thumbnailData = new Uint8Array(buf);
                            console.log(`[Step6] Converted thumbnail to JPEG: ${thumbnailData.length} bytes`);
                        }
                    }
                } catch (e) {
                    console.warn("Failed to prepare thumbnail data:", e);
                }
            }

            const result = await exportWithFFmpeg(
                recordingCuts,
                {
                    width: hqRes.width,
                    height: hqRes.height,
                    quality: 'high',
                    aspectRatio: aspectRatio || '16:9',
                    showSubtitles: exportSubtitles,
                    bgmTracks: bgmTracks,
                    cutStartTimeMap: cutStartTimeMap,
                    attachThumbnail: exportThumbnail,
                    thumbnailData: thumbnailData
                },
                (progress, status) => {
                    console.log(`[Step6:HQExport] ${status} (${progress}%)`);
                    setExportProgress(Math.round(progress));
                    setExportStatus(status);
                },
                abortController.signal
            );

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getSafeFilename(result.format);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setExportDone(true);
            setExportStatus('내보내기 완료! MP4 파일이 다운로드됩니다.');
            setExportProgress(100);

        } catch (error: any) {
            console.error("HQ export failed:", error);
            if (error?.name === 'AbortError') {
                setExportError('사용자에 의해 내보내기가 취소되었습니다.');
            } else if (error?.message?.includes('Aborted') || error?.message?.includes('OOM')) {
                setExportError('메모리 부족으로 내보내기가 중단되었습니다.\n\n💡 다른 탭을 모두 닫고, 이 탭을 활성 상태로 유지한 채 다시 시도해 주세요.\n또는 Quick Export(WebM)를 사용해 보세요.');
            } else {
                setExportError(error?.message || '알 수 없는 오류로 내보내기에 실패했습니다.\n\n💡 Quick Export를 사용해 보세요.');
            }
        } finally {
            exportAbortRef.current = null;
        }
        // NOTE: No state reset in finally - user manually closes the modal
    };

    // Video Kit Export (ZIP with images, audio, and FFmpeg script)
    const handleVideoKitExport = async () => {
        setShowExportModal(false);
        setExportType('kit');
        setIsExportingVideo(true);
        setExportProgress(0);
        setExportStatus('Preparing assets...');
        setExportError(null);
        setExportDone(false);
        setTabHiddenWarning(false);

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
                setExportError('내보낼 이미지가 없습니다.');
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
                    storylineTable: storylineTable || [],
                    aspectRatio: aspectRatio || '16:9',
                    bgmTracks: bgmTracks.map(track => ({
                        ...track,
                        url: getOptimizedUrl(track.url)
                    }))
                }
            );

            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url;
            // Kit uses a slightly different format
            const safeSeries = (seriesName || 'Untitled_Series').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
            const safeEpisode = (episodeName || 'Untitled_Episode').replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
            a.download = `${safeSeries} - ${safeEpisode} - VideoKit.${result.fileExtension}`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setExportDone(true);
            setExportStatus('내보내기 완료! Video Kit(ZIP) 파일이 다운로드됩니다.');
            setExportProgress(100);

        } catch (error: any) {
            console.error("Export failed:", error);
            setExportError(error?.message || '알 수 없는 오류로 Video Kit 내보내기에 실패했습니다.');
        }
        // NOTE: No finally cleanup - user manually closes the modal
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
                const cut = script[currentCutIndex];
                const { end } = cut?.videoTrim || { end: 0 };
                const isAtEnd = end > 0 && currentVideo.currentTime >= end - 0.05;

                // [FIX] Only play if paused AND not already at the trim end
                if (currentVideo.paused && !isAtEnd) {
                    const playPromise = currentVideo.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => { });
                    }
                } else if (!currentVideo.paused && isAtEnd) {
                    // Force pause if we accidentally started playing pass the end
                    currentVideo.pause();
                }
            } else {
                if (!currentVideo.paused) currentVideo.pause();
            }
        }

        // 2. Preload next 3 videos for smooth transitions
        const PRELOAD_AHEAD = 3;
        for (let offset = 1; offset <= PRELOAD_AHEAD; offset++) {
            const nextIndex = currentCutIndex + offset;
            if (nextIndex < script.length) {
                const nextVideo = videoRefs.current[nextIndex];
                if (nextVideo && nextVideo.readyState === 0) {
                    // console.log(`[Step6] Preloading video ${nextIndex}`);
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
        if (assetsLoaded && showThumbnail && script.length > 0 && playbackMode === 'hybrid') {
            // Give React a moment to mount the video refs after assetsLoaded becomes true
            const timer = setTimeout(() => {
                // Preload first 3 cuts for a smooth start
                for (let i = 0; i < Math.min(3, script.length); i++) {
                    const video = videoRefs.current[i];
                    if (video) {
                        console.log(`[Step6] Preloading Cut ${i} video (Thumbnail State)`);
                        if (video.readyState === 0) video.load();
                        // Also set initial time for trimmed videos
                        const trimStart = script[i].videoTrim?.start || 0;
                        video.currentTime = trimStart;
                    }
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [assetsLoaded, showThumbnail, script, playbackMode]);

    // Double Buffering Indices (Current + Next Strategy)
    // Even cuts use Slot A, Odd cuts use Slot B.
    // The INACTIVE slot always preloads the NEXT cut in its sequence.


    // Helper for responsive subtitle positioning
    // Since the player container is fixed to 16:9, we must restrict width for vertical ratios
    // to prevent text from spilling into the black bars (pillarbox).
    const getSubtitleClasses = () => {
        switch (aspectRatio) {
            case '9:16': // Shorts / Reels (Occupies ~31% of 16:9 width)
                return { container: "bottom-32", inner: "max-w-[28%] px-4", text: "text-base md:text-lg" };
            case '1:1': // Square (Occupies ~56% of 16:9 width)
                return { container: "bottom-24", inner: "max-w-[50%] px-6", text: "text-xl md:text-2xl" };
            case '4:5': // Vertical Feed (Occupies ~45% of 16:9 width)
                return { container: "bottom-28", inner: "max-w-[40%] px-4", text: "text-lg md:text-xl" };
            default: // 16:9 (Landscape)
                return { container: "bottom-16", inner: "max-w-4xl px-12", text: "text-xl md:text-2xl" };
        }
    };



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
                                                ref={(el) => {
                                                    // Only assign if this index is actually indexA (the active one)
                                                    // and not a stale or unmounted ref
                                                    if (el) videoRefs.current[indexA] = el;
                                                }}
                                                src={getOptimizedUrl(script[indexA].videoUrl)}
                                                className="absolute inset-0 w-full h-full object-contain z-10"
                                                // [FIX] loop removed to prevent conflict with freeze logic
                                                playsInline
                                                preload="auto"
                                                onLoadedMetadata={(e) => {
                                                    console.log(`[Step6:VideoA] Loaded Cut ${indexA}`);
                                                    const shouldUnmute = script[indexA].useVideoAudio && script[indexA].videoUrl;
                                                    e.currentTarget.muted = !shouldUnmute;
                                                    if (shouldUnmute) e.currentTarget.volume = 1;
                                                }}
                                                onTimeUpdate={(e) => handleVideoTimeUpdate(e, indexA)}
                                                onWaiting={() => { isBufferingRef.current = true; console.log(`[Video ${indexA}:SlotA] Buffering...`); }}
                                                onSeeking={() => { isBufferingRef.current = true; console.log(`[Video ${indexA}:SlotA] Seeking...`); }}
                                                onPlaying={handleMediaResume}
                                                onCanPlay={handleMediaResume}
                                                onSeeked={handleMediaResume}
                                                onError={(e) => {
                                                    const err = e.currentTarget.error;
                                                    const cutId = script[indexA]?.id;
                                                    const videoUrl = script[indexA]?.videoUrl;
                                                    console.error(`[Step6] Video play failed for Cut ${indexA} (ID: ${cutId}). Code: ${err?.code}, Msg: ${err?.message}, URL: ${videoUrl}`);

                                                    // Don't hide immediately - might be a transient stall
                                                    // Only hide if it's a persistent error
                                                    if (err?.code === 4 || err?.code === 3) { // SRC_NOT_SUPPORTED or DECODE_ERR
                                                        e.currentTarget.style.display = 'none';
                                                    }
                                                    isBufferingRef.current = false;
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
                                                ref={(el) => {
                                                    if (el) videoRefs.current[indexB] = el;
                                                }}
                                                src={getOptimizedUrl(script[indexB].videoUrl)}
                                                className="absolute inset-0 w-full h-full object-contain z-10"
                                                playsInline
                                                preload="auto"
                                                onLoadedMetadata={(e) => {
                                                    console.log(`[Step6:VideoB] Loaded Cut ${indexB}`);
                                                    const shouldUnmute = script[indexB].useVideoAudio && script[indexB].videoUrl;
                                                    e.currentTarget.muted = !shouldUnmute;
                                                    if (shouldUnmute) e.currentTarget.volume = 1;
                                                }}
                                                onTimeUpdate={(e) => handleVideoTimeUpdate(e, indexB)}
                                                onWaiting={() => { isBufferingRef.current = true; console.log(`[Video ${indexB}:SlotB] Buffering...`); }}
                                                onSeeking={() => { isBufferingRef.current = true; console.log(`[Video ${indexB}:SlotB] Seeking...`); }}
                                                onPlaying={handleMediaResume}
                                                onCanPlay={handleMediaResume}
                                                onSeeked={handleMediaResume}
                                                onError={(e) => {
                                                    const err = e.currentTarget.error;
                                                    const cutId = script[indexB]?.id;
                                                    const videoUrl = script[indexB]?.videoUrl;
                                                    console.error(`[Step6] Video play failed for Cut ${indexB} (ID: ${cutId}). Code: ${err?.code}, Msg: ${err?.message}, URL: ${videoUrl}`);

                                                    if (err?.code === 4 || err?.code === 3) {
                                                        e.currentTarget.style.display = 'none';
                                                    }
                                                    isBufferingRef.current = false;
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}



                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-20" />
                        </div>

                        {/* HIDDEN PRELOAD LAYER: Render upcoming videos invisibly for preloading */}
                        {playbackMode === 'hybrid' && (
                            <div className="absolute opacity-0 w-0 h-0 overflow-hidden pointer-events-none" style={{ left: '-9999px' }}>
                                {script.map((cut, idx) => {
                                    // Skip current and already-rendered indices (indexA and indexB)
                                    // [CRITICAL] Do not re-assign refs for the active slots' videos here
                                    if (idx === indexA || idx === indexB) return null;
                                    // Only preload next 2 cuts for performance (Reduced from 5)
                                    if (idx < currentCutIndex || idx > currentCutIndex + 2) return null;
                                    const url = getOptimizedUrl(cut.videoUrl);
                                    if (!cut.videoUrl || !url) return null;

                                    return (
                                        <video
                                            key={`preload-video-${cut.id}`}
                                            // [FIX] Careful with ref assignment in hidden layer
                                            // Only assign if it's NOT in the active slots to avoid hijacking
                                            ref={(el) => {
                                                if (el && idx !== indexA && idx !== indexB) {
                                                    videoRefs.current[idx] = el;
                                                }
                                            }}
                                            src={url}
                                            preload="auto"
                                            muted
                                            playsInline
                                        />
                                    );
                                })}
                            </div>
                        )}

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
                !showThumbnail && showSubtitles && script[currentCutIndex] && (
                    <div className={`absolute left-0 w-full flex justify-center z-40 pointer-events-none transition-opacity duration-300 ${getSubtitleClasses().container}`}>
                        <div className={`bg-black/50 backdrop-blur-sm py-3 md:py-4 rounded-xl text-center ${getSubtitleClasses().inner}`}>
                            <p className={`${getSubtitleClasses().text} text-white font-medium drop-shadow-md whitespace-pre-wrap leading-relaxed`}>
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

                        {/* Subtitle Toggle - Separated */}
                        <div className="bg-black/40 rounded-lg p-1 border border-white/10">
                            <button
                                onClick={() => setShowSubtitles(!showSubtitles)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${showSubtitles ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                                title="Toggle Subtitles"
                            >
                                <CustomCCIcon size={14} /> {showSubtitles ? 'CC On' : 'CC Off'}
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
                            disabled={isExportingVideo || !isAllAssetsLoaded}
                            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-black text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                        >
                            <Film size={16} />
                            {isExportingVideo
                                ? 'Exporting...'
                                : isAllAssetsLoaded
                                    ? 'Video Kit'
                                    : `Loading Assets (${loadingProgress.current}/${loadingProgress.total})`
                            }
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
                            </div>

                            {/* Export Options */}
                            <div className="mb-8 p-4 bg-black/30 rounded-xl border border-white/5 space-y-3">
                                <label className="text-sm font-bold text-gray-400 block mb-1">옵션</label>

                                <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={exportSubtitles}
                                        onChange={(e) => setExportSubtitles(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-black/40 text-[var(--color-primary)] focus:ring-[var(--color-primary)] focus:ring-offset-0"
                                    />
                                    <div>
                                        <div className="text-white text-sm font-bold flex items-center gap-2">
                                            <CustomCCIcon size={16} /> 자막 포함 (Burn-in)
                                        </div>
                                        <div className="text-xs text-gray-400">영상에 자막을 입혀서 저장합니다.</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={exportThumbnail}
                                        onChange={(e) => setExportThumbnail(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-black/40 text-[var(--color-primary)] focus:ring-[var(--color-primary)] focus:ring-offset-0"
                                    />
                                    <div>
                                        <div className="text-white text-sm font-bold flex items-center gap-2">
                                            <ImageIcon size={16} /> 썸네일 포함 (Cover Art)
                                        </div>
                                        <div className="text-xs text-gray-400">MP4 파일의 커버 이미지로 썸네일을 삽입합니다.</div>
                                    </div>
                                </label>
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
                                    <div className="p-3 rounded-lg bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                                        <Zap size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                            Quick Export (WebM)
                                        </h4>
                                        <p className="text-sm text-gray-400 mt-1">
                                            빠른 실시간 녹화. 양호한 화질, 자막 포함.
                                        </p>
                                        <div className="flex gap-2 mt-2">
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Fast</span>
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">WebM</span>
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
                                    <div className="p-3 rounded-lg bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                                        <Film size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                            High Quality (MP4)
                                        </h4>
                                        <p className="text-sm text-gray-400 mt-1">
                                            FFmpeg 기반 H.264 인코딩. 최고 화질, 범용 호환성.
                                        </p>
                                        <div className="flex gap-2 mt-2">
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Best Quality</span>
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">MP4</span>
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
                                    <div className="p-3 rounded-lg bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                                        <Download size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                                            Video Kit (ZIP)
                                        </h4>
                                        <p className="text-sm text-gray-400 mt-1">
                                            모든 에셋과 FFmpeg 스크립트를 다운로드. 외부 도구로 영상 제작.
                                        </p>
                                        <div className="flex gap-2 mt-2">
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">Offline</span>
                                            <span className="px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full">ZIP</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

            {/* Video Export Progress Modal */}
            {
                isExportingVideo && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100000]">
                        <div className="glass-panel p-8 max-w-md w-full relative">
                            {/* Close button - always visible */}
                            {(exportError || exportDone) && (
                                <button
                                    onClick={() => {
                                        setIsExportingVideo(false);
                                        setExportProgress(0);
                                        setExportStatus('');
                                        setExportType(null);
                                        setExportError(null);
                                        setExportDone(false);
                                        setTabHiddenWarning(false);
                                    }}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            )}

                            {/* ERROR STATE */}
                            {exportError ? (
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 rounded-lg bg-red-500/20">
                                            <AlertTriangle size={28} className="text-red-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white">내보내기 실패</h3>
                                    </div>
                                    <p className="text-gray-300 text-sm whitespace-pre-line mb-6">{exportError}</p>
                                    <button
                                        onClick={() => {
                                            setIsExportingVideo(false);
                                            setExportProgress(0);
                                            setExportStatus('');
                                            setExportType(null);
                                            setExportError(null);
                                            setExportDone(false);
                                            setTabHiddenWarning(false);
                                        }}
                                        className="w-full py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
                                    >
                                        닫기
                                    </button>
                                </>
                            ) : exportDone ? (
                                /* SUCCESS STATE */
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 rounded-lg bg-green-500/20">
                                            <CheckCircle size={28} className="text-green-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white">내보내기 완료!</h3>
                                    </div>
                                    <p className="text-gray-300 text-center mb-6">{exportStatus}</p>
                                    <button
                                        onClick={() => {
                                            setIsExportingVideo(false);
                                            setExportProgress(0);
                                            setExportStatus('');
                                            setExportType(null);
                                            setExportDone(false);
                                            setTabHiddenWarning(false);
                                        }}
                                        className="w-full py-3 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-black font-bold transition-colors"
                                    >
                                        확인
                                    </button>
                                </>
                            ) : (
                                /* PROGRESS STATE */
                                <>
                                    <h3 className="text-2xl font-bold text-white mb-4">비디오 내보내기</h3>

                                    {/* Tab Hidden Warning */}
                                    {tabHiddenWarning && (
                                        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                                            <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-yellow-300 text-xs">
                                                ⚠️ 탭이 비활성화되었습니다! 메모리 부족 시 브라우저가 자동 중단할 수 있습니다.
                                                <br />이 탭을 활성 상태로 유지해 주세요.
                                            </p>
                                        </div>
                                    )}

                                    <div className="w-full bg-white/10 rounded-full h-3 mb-4 overflow-hidden">
                                        <div
                                            className="bg-[var(--color-primary)] h-full transition-all duration-300"
                                            style={{ width: `${exportProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-gray-300 text-center">{exportStatus}</p>
                                    <p className="text-gray-400 text-sm text-center mt-2">{exportProgress}%</p>

                                    {/* Notice */}
                                    <p className="text-gray-500 text-xs text-center mt-4">
                                        💡 이 탭을 활성 상태로 유지해 주세요. 다른 탭으로 이동하면 실패할 수 있습니다.
                                    </p>

                                    {/* Cancel Button */}
                                    <button
                                        onClick={() => {
                                            if (exportAbortRef.current) {
                                                exportAbortRef.current.abort();
                                            }
                                            setExportError('사용자에 의해 내보내기가 취소되었습니다.');
                                        }}
                                        className="w-full mt-4 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 text-sm font-medium transition-colors border border-white/5 hover:border-red-500/30"
                                    >
                                        내보내기 취소
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {
                viewOnly ? createPortal(
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
                )
            }

            {/* Hidden Audio Players (Double Buffered) - Made 'visible' to bypass browser restrictions */}
            <audio
                ref={audioARef}
                className="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none"
                preload="auto"
                controls={false}
                playsInline
                muted={false}
                onWaiting={() => { isBufferingRef.current = true; console.log("[Audio A] Buffering..."); }}
                onPlaying={handleMediaResume}
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
                onPlaying={handleMediaResume}
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
        </div>
    );
};

export default Step6_Final;
