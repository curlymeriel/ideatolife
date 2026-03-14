/**
 * Inline Batch Generation Controls
 * 
 * 인라인 일괄 생성 버튼 + 미생성/전체 토글 (세로 높이 최소화)
 */

import React, { useState, useMemo } from 'react';
import { Square, Loader2, XCircle, Wand2 } from 'lucide-react';
import type { BatchTask } from '../../utils/batchGenerationEngine';
import { getBatchStats } from '../../utils/batchGenerationEngine';
import type { ScriptCut } from '../../services/gemini';

type TargetType = 'incomplete' | 'all';

interface BatchGenerationPanelProps {
    cuts: ScriptCut[];
    /** Force generation type: 'image' or 'audio' (no 'both' option anymore) */
    batchType: 'image' | 'audio';
    onStartBatch: (type: 'image' | 'audio' | 'both', cutIds: number[], maxConcurrent: number) => void;
    onCancel: () => void;
    isRunning: boolean;
    tasks: BatchTask[];
    currentPhase?: 'image' | 'audio';
}

export const BatchGenerationPanel: React.FC<BatchGenerationPanelProps> = ({
    cuts,
    batchType,
    onStartBatch,
    onCancel,
    isRunning,
    tasks,
    currentPhase,
}) => {
    const [targetType, setTargetType] = useState<TargetType>('incomplete');
    const maxConcurrent = 1;

    const targetCutIds = useMemo(() => {
        if (targetType === 'all') return cuts.map(c => c.id);
        return cuts
            .filter(c => {
                if (batchType === 'image') return !c.isImageConfirmed || !c.finalImageUrl;
                if (batchType === 'audio') return !c.isAudioConfirmed || (!c.audioUrl && c.speaker !== 'SILENT');
                return true;
            })
            .map(c => c.id);
    }, [cuts, batchType, targetType]);

    const stats = useMemo(() => getBatchStats(tasks), [tasks]);

    const handleStart = () => {
        if (targetCutIds.length === 0) {
            alert('생성할 컷이 없습니다.');
            return;
        }
        onStartBatch(batchType, targetCutIds, maxConcurrent);
    };

    if (isRunning) {
        return (
            <div className="flex items-center gap-2">
                {/* Mini inline progress */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
                    <span className="text-[10px] font-bold text-[var(--color-primary)]">
                        {currentPhase === 'image' ? '🖼️' : '🎵'} {stats.progress}%
                    </span>
                    <span className="text-[9px] text-[var(--color-text-muted)]">
                        ({stats.success}/{stats.total})
                    </span>
                </div>
                {/* Mini stats */}
                {stats.error > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] text-red-400">
                        <XCircle className="w-3 h-3" /> {stats.error}
                    </span>
                )}
                {/* Cancel */}
                <button
                    onClick={onCancel}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                    <Square className="w-3 h-3" />
                    중지
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            {/* Target Toggle: 미생성 / 전체 */}
            <div className="flex items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                {([
                    { value: 'incomplete' as const, label: '미생성' },
                    { value: 'all' as const, label: '전체' },
                ] as const).map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setTargetType(opt.value)}
                        className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                            targetType === opt.value
                                ? 'bg-[var(--color-primary)] text-black'
                                : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {/* Batch Start Button */}
            <button
                onClick={handleStart}
                disabled={targetCutIds.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)] rounded-lg text-[11px] font-black text-black transition-all hover:shadow-[0_0_12px_rgba(255,173,117,0.3)]"
            >
                <Wand2 className="w-3.5 h-3.5" />
                일괄 생성 ({targetCutIds.length})
            </button>
        </div>
    );
};
