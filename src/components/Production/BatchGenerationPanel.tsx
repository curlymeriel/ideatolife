/**
 * Batch Generation Panel
 * 
 * 배치 생성 컨트롤 및 진행 상태 표시 UI 패널
 */

import React, { useState, useMemo } from 'react';
import { Play, Square, Loader2, Image, Mic, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import type { BatchTask, TaskStatus as BatchTaskStatus } from '../../utils/batchGenerationEngine';
import { getBatchStats } from '../../utils/batchGenerationEngine';
import type { ScriptCut } from '../../services/gemini';

type GenerationType = 'image' | 'audio' | 'both';
type TargetType = 'all' | 'incomplete' | 'selected';

interface BatchGenerationPanelProps {
    cuts: ScriptCut[];
    selectedCutIds?: number[];
    onStartBatch: (type: GenerationType, cutIds: number[], maxConcurrent: number) => void;
    onCancel: () => void;
    isRunning: boolean;
    tasks: BatchTask[];
    currentPhase?: 'image' | 'audio';
}

const STATUS_CONFIG: Record<BatchTaskStatus, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <Clock className="w-3 h-3" />, color: 'text-gray-400', label: '대기' },
    running: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-400', label: '생성 중' },
    success: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-green-400', label: '완료' },
    error: { icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', label: '실패' },
    cancelled: { icon: <AlertCircle className="w-3 h-3" />, color: 'text-yellow-400', label: '취소됨' },
};

export const BatchGenerationPanel: React.FC<BatchGenerationPanelProps> = ({
    cuts,
    selectedCutIds = [],
    onStartBatch,
    onCancel,
    isRunning,
    tasks,
    currentPhase,
}) => {
    const [generationType, setGenerationType] = useState<GenerationType>('both');
    const [targetType, setTargetType] = useState<TargetType>('incomplete');
    const [maxConcurrent, setMaxConcurrent] = useState(3);

    // Calculate target cut IDs based on selection
    const targetCutIds = useMemo(() => {
        switch (targetType) {
            case 'all':
                return cuts.map(c => c.id);
            case 'incomplete':
                return cuts
                    .filter(c => {
                        if (generationType === 'image') return !c.isImageConfirmed || !c.finalImageUrl;
                        if (generationType === 'audio') return !c.isAudioConfirmed || (!c.audioUrl && c.speaker !== 'SILENT');
                        // 'both': either incomplete
                        return (!c.isImageConfirmed || !c.finalImageUrl) || (!c.isAudioConfirmed || (!c.audioUrl && c.speaker !== 'SILENT'));
                    })
                    .map(c => c.id);
            case 'selected':
                return selectedCutIds;
            default:
                return [];
        }
    }, [cuts, generationType, targetType, selectedCutIds]);

    const stats = useMemo(() => getBatchStats(tasks), [tasks]);

    const handleStart = () => {
        if (targetCutIds.length === 0) {
            alert('생성할 컷이 없습니다.');
            return;
        }
        onStartBatch(generationType, targetCutIds, maxConcurrent);
    };

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                <h3 className="text-sm font-semibold text-white">스마트 배치 생성</h3>
            </div>

            {!isRunning ? (
                /* Configuration UI */
                <div className="space-y-3">
                    {/* Generation Type */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16">생성 타입:</span>
                        <div className="flex gap-1">
                            {[
                                { value: 'image' as const, icon: <Image className="w-3 h-3" />, label: '이미지만' },
                                { value: 'audio' as const, icon: <Mic className="w-3 h-3" />, label: '오디오만' },
                                { value: 'both' as const, icon: <Play className="w-3 h-3" />, label: '둘 다' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setGenerationType(opt.value)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors font-bold ${generationType === opt.value
                                        ? 'bg-orange-500 text-black'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Target Selection */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16">대상:</span>
                        <div className="flex gap-1">
                            {[
                                { value: 'incomplete' as const, label: '미완성만' },
                                { value: 'all' as const, label: '전체' },
                                { value: 'selected' as const, label: `선택된 것 (${selectedCutIds.length})`, disabled: selectedCutIds.length === 0 },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => !opt.disabled && setTargetType(opt.value)}
                                    disabled={opt.disabled}
                                    className={`px-2 py-1 rounded text-xs transition-colors font-bold ${targetType === opt.value
                                        ? 'bg-orange-500 text-black'
                                        : opt.disabled
                                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Concurrency */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16">동시 실행:</span>
                        <input
                            type="range"
                            min={1}
                            max={5}
                            value={maxConcurrent}
                            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                            className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xs text-white w-8">{maxConcurrent}개</span>
                    </div>

                    {/* Start Button */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                        <span className="text-xs text-gray-400">
                            {targetCutIds.length}개 컷 대상
                        </span>
                        <button
                            onClick={handleStart}
                            disabled={targetCutIds.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-black text-black transition-colors"
                        >
                            <Play className="w-4 h-4" />
                            배치 생성 시작
                        </button>
                    </div>
                </div>
            ) : (
                /* Running UI */
                <div className="space-y-3">
                    {/* Progress Bar */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">
                                {currentPhase === 'image' ? '🖼️ 이미지 생성 중...' : '🎵 오디오 생성 중...'}
                            </span>
                            <span className="text-white font-medium">{stats.progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[#FF9A5C] transition-all duration-300"
                                style={{ width: `${stats.progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs">
                        <span className="text-blue-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {stats.running} 실행 중
                        </span>
                        <span className="text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {stats.success} 완료
                        </span>
                        {stats.error > 0 && (
                            <span className="text-red-400 flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                {stats.error} 실패
                            </span>
                        )}
                        <span className="text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {stats.pending} 대기
                        </span>
                    </div>

                    {/* Task List (compact) */}
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {tasks.map(task => {
                            const config = STATUS_CONFIG[task.status];
                            return (
                                <div
                                    key={`${task.type}-${task.id}`}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-800 ${config.color}`}
                                    title={task.error || config.label}
                                >
                                    {config.icon}
                                    <span>#{task.id}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Cancel Button */}
                    <div className="flex justify-end pt-2 border-t border-gray-700">
                        <button
                            onClick={onCancel}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded-lg text-sm text-red-400 transition-colors"
                        >
                            <Square className="w-4 h-4" />
                            취소
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
