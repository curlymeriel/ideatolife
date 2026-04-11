import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { SeriesBible, SeriesMemory, EpisodeMemoryEntry } from '../store/types';

// ====================
// IDB 키 생성 헬퍼
// ====================

const getBibleKey = (seriesName: string) => `series-bible-${seriesName}`;
const getMemoryKey = (seriesName: string) => `series-memory-${seriesName}`;

// ====================
// Layer 1: 시리즈 바이블 CRUD
// ====================

export async function getSeriesBible(seriesName: string): Promise<SeriesBible | null> {
    try {
        const data = await idbGet<SeriesBible>(getBibleKey(seriesName));
        return data || null;
    } catch (error) {
        console.error('[SeriesMemory] Failed to get series bible:', error);
        return null;
    }
}

export async function saveSeriesBible(bible: SeriesBible): Promise<void> {
    try {
        await idbSet(getBibleKey(bible.seriesName), bible);
        console.log(`[SeriesMemory] Series bible saved for: ${bible.seriesName}`);
    } catch (error) {
        console.error('[SeriesMemory] Failed to save series bible:', error);
        throw error;
    }
}

// ====================
// Layer 2: 시리즈 메모리 CRUD
// ====================

export async function getSeriesMemory(seriesName: string): Promise<SeriesMemory | null> {
    try {
        const data = await idbGet<SeriesMemory>(getMemoryKey(seriesName));
        return data || null;
    } catch (error) {
        console.error('[SeriesMemory] Failed to get series memory:', error);
        return null;
    }
}

export async function saveSeriesMemory(memory: SeriesMemory): Promise<void> {
    try {
        await idbSet(getMemoryKey(memory.seriesName), memory);
        console.log(`[SeriesMemory] Series memory saved for: ${memory.seriesName}`);
    } catch (error) {
        console.error('[SeriesMemory] Failed to save series memory:', error);
        throw error;
    }
}

/**
 * 완료된 특정 에피소드 메모리 항목을 추가하거나 업데이트
 */
export async function upsertEpisodeMemoryEntry(
    seriesName: string,
    entry: EpisodeMemoryEntry
): Promise<void> {
    const existing = await getSeriesMemory(seriesName);

    const base: SeriesMemory = existing || {
        seriesName,
        lastModified: Date.now(),
        injectionLimit: 3,
        layer2Summary: '',
        episodes: [],
        globalPendingHooks: []
    };

    // 기존 항목 교체 또는 신규 추가
    const idx = base.episodes.findIndex(e => e.episodeNumber === entry.episodeNumber);
    if (idx >= 0) {
        base.episodes[idx] = entry;
    } else {
        base.episodes.push(entry);
    }

    // 에피소드 번호 순으로 정렬
    base.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

    // AI가 반환하는 문자열의 띄어쓰기나 구두점 차이로 인한 매칭 실패를 방지하는 정규화 함수
    const normalizeStr = (s: string) => (s || '').replace(/\s+/g, '').replace(/[.,!?]/g, '').toLowerCase();

    // 전체 미회수 복선 목록 재계산 (모든 화의 pendingPlotHooks 합산 - 회수된 것 제거)
    const allResolvedNormalized = new Set(
        base.episodes.flatMap(e => (e.resolvedPlotHooks || []).map(normalizeStr))
    );

    const allPending = base.episodes
        .flatMap(e => e.pendingPlotHooks || [])
        .filter(hook => !allResolvedNormalized.has(normalizeStr(hook)));
    
    base.globalPendingHooks = [...new Set(allPending)];

    base.lastModified = Date.now();
    await saveSeriesMemory(base);
}

/**
 * injectionLimit 업데이트
 */
export async function updateInjectionLimit(seriesName: string, limit: number): Promise<void> {
    const memory = await getSeriesMemory(seriesName);
    if (memory) {
        memory.injectionLimit = Math.max(1, Math.min(10, limit));
        memory.lastModified = Date.now();
        await saveSeriesMemory(memory);
    }
}

// ====================
// AI 프롬프트 컨텍스트 빌더
// ====================

export interface MemoryContext {
    layer1Bible?: string;
    layer2CumulativeLog?: string;
}

/**
 * consultStory에 주입할 Layer 1 + Layer 2 텍스트 블록 생성
 * @param seriesName 시리즈명
 * @param injectionLimitOverride 호출부에서 한도 직접 지정 시 사용 (없으면 저장된 값 사용)
 */
export async function buildMemoryContext(
    seriesName: string,
    injectionLimitOverride?: number
): Promise<MemoryContext> {
    const [bible, memory] = await Promise.all([
        getSeriesBible(seriesName),
        getSeriesMemory(seriesName)
    ]);

    const result: MemoryContext = {};

    // Layer 1 빌드
    if (bible?.content?.trim()) {
        result.layer1Bible = bible.content.trim();
    }

    // Layer 2 빌드
    if (memory && memory.episodes.length > 0) {
        const limit = injectionLimitOverride ?? memory.injectionLimit ?? 3;
        const completedEpisodes = memory.episodes.filter(e => e.status === 'completed');
        const recentEpisodes = completedEpisodes.slice(-limit);

        const lines: string[] = [];

        if (memory.layer2Summary) {
            lines.push(`【전체 누적 서사 요약】`);
            lines.push(memory.layer2Summary);
            lines.push('');
        }

        if (recentEpisodes.length > 0) {
            lines.push(`【최근 ${recentEpisodes.length}화 상세 기록 (최대 ${limit}화)】`);

            for (const ep of recentEpisodes) {
                lines.push(`\n▶ EP${ep.episodeNumber} ${ep.episodeName}`);
                lines.push(`  요약: ${ep.summary}`);
                if (ep.emotionLog) lines.push(`  감정선: ${ep.emotionLog}`);
                if (ep.plotPoints.length > 0) {
                    lines.push(`  주요 사건: ${ep.plotPoints.join(' / ')}`);
                }
                if (ep.endingNote) lines.push(`  엔딩: ${ep.endingNote}`);
                if (ep.resolvedPlotHooks.length > 0) {
                    lines.push(`  회수된 복선: ${ep.resolvedPlotHooks.join(', ')}`);
                }
                if (ep.pendingPlotHooks.length > 0) {
                    lines.push(`  새로 심은 복선: ${ep.pendingPlotHooks.join(', ')}`);
                }
            }
        }

        if (memory.globalPendingHooks.length > 0) {
            lines.push(`\n【전체 미회수 복선 목록】`);
            memory.globalPendingHooks.forEach((hook, i) => {
                lines.push(`  #${i + 1}. ${hook}`);
            });
        }

        if (lines.length > 0) {
            result.layer2CumulativeLog = lines.join('\n');
        }
    }

    return result;
}
