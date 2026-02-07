import React from 'react';
import { Video, Mic, Music } from 'lucide-react';

interface AudioVolumes {
    video: number;
    tts: number;
    bgm: number;
}

interface AudioMixerProps {
    volumes: AudioVolumes;
    onChange: (volumes: AudioVolumes) => void;
}

export const AudioMixer: React.FC<AudioMixerProps> = ({ volumes = { video: 1, tts: 1, bgm: 0.5 }, onChange }) => {

    const handleChange = (key: keyof AudioVolumes, val: number) => {
        onChange({
            ...volumes,
            [key]: val
        });
    };

    return (
        <div className="bg-black/40 rounded-lg p-3 border border-white/5 flex items-center justify-between gap-4">
            {/* Video Volume */}
            <div className="flex items-center gap-2 flex-1">
                <Video size={14} className="text-blue-400" />
                <div className="flex-1 flex flex-col">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Video</span>
                        <span>{Math.round(volumes.video * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volumes.video}
                        onChange={(e) => handleChange('video', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                </div>
            </div>

            {/* TTS Volume */}
            <div className="flex items-center gap-2 flex-1 border-l border-white/10 pl-4">
                <Mic size={14} className="text-green-400" />
                <div className="flex-1 flex flex-col">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Voice</span>
                        <span>{Math.round(volumes.tts * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volumes.tts}
                        onChange={(e) => handleChange('tts', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-green-500"
                    />
                </div>
            </div>

            {/* BGM Volume (Cut-specific) */}
            <div className="flex items-center gap-2 flex-1 border-l border-white/10 pl-4 opacity-70 hover:opacity-100 transition-opacity">
                <Music size={14} className="text-pink-400" />
                <div className="flex-1 flex flex-col">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>BGM (Cut)</span>
                        <span>{Math.round(volumes.bgm * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volumes.bgm}
                        onChange={(e) => handleChange('bgm', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-pink-500"
                    />
                </div>
            </div>
        </div>
    );
};
