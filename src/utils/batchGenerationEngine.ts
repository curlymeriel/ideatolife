/**
 * Batch Generation Engine
 * 
 * 여러 컷의 이미지/오디오를 병렬로 생성하는 엔진입니다.
 * - 동시 실행 제한 (maxConcurrent)
 * - 자동 재시도 (retryCount)
 * - 실시간 진행 콜백
 * - 취소 지원 (AbortController)
 */

export type TaskType = 'image' | 'audio';
export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface BatchTask {
    id: number;           // cutId
    type: TaskType;
    status: TaskStatus;
    error?: string;
    retryCount: number;
}

export interface BatchConfig {
    maxConcurrent: number;      // 동시 실행 수 (기본: 3)
    maxRetries: number;         // 최대 재시도 횟수 (기본: 2)
    retryDelayMs: number;       // 재시도 대기 시간 (기본: 1000ms)
    onProgress: (tasks: BatchTask[]) => void;
    onTaskComplete?: (task: BatchTask) => void;
    onComplete: (tasks: BatchTask[]) => void;
    abortSignal?: AbortSignal;
}

const DEFAULT_CONFIG: Partial<BatchConfig> = {
    maxConcurrent: 3,
    maxRetries: 2,
    retryDelayMs: 1000,
};

/**
 * 배치 작업을 병렬로 실행합니다.
 * 
 * @param cutIds - 생성할 컷 ID 배열
 * @param type - 'image' | 'audio'
 * @param executeFn - 실제 생성 함수 (cutId) => Promise<void>
 * @param config - 배치 설정
 * @returns 완료된 작업 배열
 */
export async function runBatchGeneration(
    cutIds: number[],
    type: TaskType,
    executeFn: (cutId: number) => Promise<void>,
    config: BatchConfig
): Promise<BatchTask[]> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const { maxConcurrent, maxRetries, retryDelayMs, onProgress, onTaskComplete, onComplete, abortSignal } = mergedConfig;

    // Initialize tasks
    const tasks: BatchTask[] = cutIds.map(id => ({
        id,
        type,
        status: 'pending' as TaskStatus,
        retryCount: 0,
    }));

    // Update progress
    const updateProgress = () => {
        onProgress([...tasks]);
    };

    // Execute single task with retry
    const executeWithRetry = async (task: BatchTask): Promise<void> => {
        // Check for abort
        if (abortSignal?.aborted) {
            task.status = 'cancelled';
            return;
        }

        task.status = 'running';
        updateProgress();

        try {
            await executeFn(task.id);
            task.status = 'success';
            task.error = undefined;
            onTaskComplete?.(task);
        } catch (error: any) {
            // Check if aborted during execution
            if (abortSignal?.aborted) {
                task.status = 'cancelled';
                return;
            }

            task.retryCount++;

            if (task.retryCount <= maxRetries!) {
                console.log(`[Batch] Task ${task.id} failed, retrying (${task.retryCount}/${maxRetries})...`);
                await delay(retryDelayMs!);
                return executeWithRetry(task);
            } else {
                task.status = 'error';
                task.error = error.message || 'Unknown error';
                console.error(`[Batch] Task ${task.id} failed after ${maxRetries} retries:`, error);
            }
        }

        updateProgress();
    };

    // Run tasks with concurrency limit
    const pendingTasks = [...tasks];
    const runningPromises: Promise<void>[] = [];

    while (pendingTasks.length > 0 || runningPromises.length > 0) {
        // Check for abort
        if (abortSignal?.aborted) {
            pendingTasks.forEach(t => { t.status = 'cancelled'; });
            break;
        }

        // Start new tasks up to maxConcurrent
        while (runningPromises.length < maxConcurrent! && pendingTasks.length > 0) {
            const task = pendingTasks.shift()!;
            const promise = executeWithRetry(task).then(() => {
                const idx = runningPromises.indexOf(promise);
                if (idx !== -1) runningPromises.splice(idx, 1);
            });
            runningPromises.push(promise);
        }

        // Wait for at least one task to complete
        if (runningPromises.length > 0) {
            await Promise.race(runningPromises);
        }
    }

    // Wait for all remaining promises
    await Promise.all(runningPromises);

    updateProgress();
    onComplete(tasks);

    return tasks;
}

/**
 * 이미지와 오디오를 순차적으로 배치 생성합니다.
 * (이미지 먼저 → 오디오)
 */
export async function runSequentialBatchGeneration(
    cutIds: number[],
    generateImage: (cutId: number) => Promise<void>,
    generateAudio: (cutId: number) => Promise<void>,
    config: Omit<BatchConfig, 'onComplete'> & {
        onPhaseChange?: (phase: 'image' | 'audio') => void;
        onComplete: (imageTasks: BatchTask[], audioTasks: BatchTask[]) => void;
    }
): Promise<{ imageTasks: BatchTask[]; audioTasks: BatchTask[] }> {
    const { onPhaseChange, onComplete, ...baseConfig } = config;

    // Phase 1: Images
    onPhaseChange?.('image');
    const imageTasks = await runBatchGeneration(
        cutIds,
        'image',
        generateImage,
        { ...baseConfig, onComplete: () => { } }
    );

    // Phase 2: Audio (Generate for all requested cuts regardless of image success)
    if (cutIds.length > 0 && !config.abortSignal?.aborted) {
        onPhaseChange?.('audio');
        const audioTasks = await runBatchGeneration(
            cutIds,
            'audio',
            generateAudio,
            { ...baseConfig, onComplete: () => { } }
        );

        onComplete(imageTasks, audioTasks);
        return { imageTasks, audioTasks };
    }

    onComplete(imageTasks, []);
    return { imageTasks, audioTasks: [] };
}

// Utility
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Statistics helper
export function getBatchStats(tasks: BatchTask[]): {
    total: number;
    pending: number;
    running: number;
    success: number;
    error: number;
    cancelled: number;
    progress: number;
} {
    const stats = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        running: tasks.filter(t => t.status === 'running').length,
        success: tasks.filter(t => t.status === 'success').length,
        error: tasks.filter(t => t.status === 'error').length,
        cancelled: tasks.filter(t => t.status === 'cancelled').length,
        progress: 0,
    };

    const completed = stats.success + stats.error + stats.cancelled;
    stats.progress = stats.total > 0 ? Math.round((completed / stats.total) * 100) : 0;

    return stats;
}
