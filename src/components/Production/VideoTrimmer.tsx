import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Scissors } from 'lucide-react';

interface VideoTrimmerProps {
    videoUrl: string;
    startTime: number;
    endTime: number;
    duration?: number; // Optional: Provide if known, otherwise loaded from video
    onChange: (start: number, end: number) => void;
    hideVideo?: boolean;
    onSeek?: (time: number) => void;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
    videoUrl,
    startTime,
    endTime,
    duration: externalDuration,
    onChange,
    hideVideo = false,
    onSeek
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoDuration, setVideoDuration] = useState(externalDuration || 0);
    const [localStart, setLocalStart] = useState(startTime);
    const [localEnd, setLocalEnd] = useState(endTime > 0 ? endTime : 0);

    // Load metadata to get duration
    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            setVideoDuration(dur);
            if (localEnd === 0 || localEnd > dur) {
                setLocalEnd(dur);
                onChange(localStart, dur);
            }
        }
    };

    // Update duration if provided externally
    useEffect(() => {
        if (externalDuration && externalDuration > 0) {
            setVideoDuration(externalDuration);
            if (localEnd === 0) setLocalEnd(externalDuration);
        }
    }, [externalDuration]);


    // Sync external props (debounced logic is handled by parent, here we sync to local)
    // NOTE: We only sync if props change significantly to avoid loop
    useEffect(() => {
        if (startTime !== localStart) setLocalStart(startTime);
        if (endTime !== localEnd && endTime > 0) setLocalEnd(endTime);
    }, [startTime, endTime]);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                // Determine play range
                if (videoRef.current.currentTime < localStart || videoRef.current.currentTime >= localEnd) {
                    videoRef.current.currentTime = localStart;
                }
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const curr = videoRef.current.currentTime;

            // Loop or Stop at End
            if (curr >= localEnd) {
                videoRef.current.pause();
                videoRef.current.currentTime = localStart;
                setIsPlaying(false);
            }
        }
    };

    const lastUpdateRef = useRef<number>(0);
    const handleSliderChange = (type: 'min' | 'max', value: number) => {
        const val = Math.max(0, Math.min(value, videoDuration));

        if (type === 'min') {
            const newStart = Math.min(val, localEnd - 0.5); // Min gap 0.5s
            setLocalStart(newStart);

            // Throttle parent update to 100ms
            const now = Date.now();
            if (now - lastUpdateRef.current > 100) {
                onChange(newStart, localEnd);
                lastUpdateRef.current = now;
            }

            if (videoRef.current) videoRef.current.currentTime = newStart;
            if (onSeek) onSeek(newStart);
        } else {
            const newEnd = Math.max(val, localStart + 0.5);
            setLocalEnd(newEnd);

            const now = Date.now();
            if (now - lastUpdateRef.current > 100) {
                onChange(localStart, newEnd);
                lastUpdateRef.current = now;
            }

            if (videoRef.current) videoRef.current.currentTime = newEnd; // Preview end frame
            if (onSeek) onSeek(newEnd);
        }
    };

    // Ensure final state is sent on mouse up/drag end
    const handleSliderCommit = () => {
        onChange(localStart, localEnd);
        lastUpdateRef.current = Date.now();
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
    };

    return (
        <div className="bg-black/40 rounded-lg p-3 border border-white/5 w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
                <Scissors size={14} className="text-[var(--color-primary)]" />
                <span className="text-xs font-bold text-gray-300">TRIM VIDEO</span>
                <span className="text-[10px] text-gray-500 ml-auto">
                    {formatTime(localStart)} - {formatTime(localEnd)} ({((localEnd - localStart).toFixed(1))}s)
                </span>
            </div>

            {/* Video Preview (Conditional) */}
            {!hideVideo && (
                <div className="relative rounded-md overflow-hidden bg-black aspect-video mb-3 group">
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        onLoadedMetadata={handleLoadedMetadata}
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                    />

                    {/* Play Overlay */}
                    <button
                        onClick={togglePlay}
                        className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors group-hover:opacity-100 opacity-0"
                    >
                        {isPlaying ? <Pause className="fill-white text-white drop-shadow-lg" /> : <Play className="fill-white text-white drop-shadow-lg" />}
                    </button>
                </div>
            )}

            {/* Dual Range Slider */}
            <div className="relative h-6 w-full touch-none select-none">
                {/* Track Background */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/20 rounded-full -translate-y-1/2"></div>

                {/* Active Range Track */}
                <div
                    className="absolute top-1/2 h-1 bg-[var(--color-primary)] rounded-full -translate-y-1/2"
                    style={{
                        left: `${(localStart / Math.max(videoDuration, 1)) * 100}%`,
                        width: `${((localEnd - localStart) / Math.max(videoDuration, 1)) * 100}%`
                    }}
                ></div>

                {/* Min Thumb Input */}
                <input
                    type="range"
                    min="0"
                    max={videoDuration || 10} // Fallback to avoid division by zero
                    step="0.1"
                    value={localStart}
                    onChange={(e) => handleSliderChange('min', parseFloat(e.target.value))}
                    onMouseUp={handleSliderCommit}
                    onKeyUp={handleSliderCommit}
                    className="absolute inset-0 w-full appearance-none pointer-events-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
                />

                {/* Max Thumb Input */}
                <input
                    type="range"
                    min="0"
                    max={videoDuration || 10}
                    step="0.1"
                    value={localEnd}
                    onChange={(e) => handleSliderChange('max', parseFloat(e.target.value))}
                    onMouseUp={handleSliderCommit}
                    onKeyUp={handleSliderCommit}
                    className="absolute inset-0 w-full appearance-none pointer-events-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
                />
            </div>
        </div>
    );
};
