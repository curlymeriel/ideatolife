import React, { useState, useEffect, useCallback } from 'react';
import type { SeriesBible, SeriesMemory, EpisodeMemoryEntry } from '../store/types';
import {
    getSeriesBible, saveSeriesBible,
    getSeriesMemory,
    upsertEpisodeMemoryEntry,
    updateInjectionLimit,
    buildMemoryContext
} from '../utils/seriesMemory';
import {
    generateEpisodeMemorySummary,
    generateSeriesBibleDraft,
    suggestBibleUpdates
} from '../services/gemini';

interface Props {
    seriesName: string;
    projectData: any;          // 현재 에피소드 ProjectData
    apiKey: string;
    isMemoryEnabled: boolean;
    onMemoryToggle: (v: boolean) => void;
    injectionLimit: number;
    onInjectionLimitChange: (v: number) => void;
}

interface BibleUpdateSuggestion {
    section: string;
    suggestion: string;
    reason: string;
    selected: boolean;
}

const SeriesMemoryManager: React.FC<Props> = ({
    seriesName,
    projectData,
    apiKey,
    isMemoryEnabled,
    onMemoryToggle,
    injectionLimit,
    onInjectionLimitChange
}) => {
    const [bible, setBible] = useState<SeriesBible | null>(null);
    const [memory, setMemory] = useState<SeriesMemory | null>(null);
    const [bibleContent, setBibleContent] = useState('');
    const [isSavingBible, setIsSavingBible] = useState(false);
    const [isGeneratingBible, setIsGeneratingBible] = useState(false);
    const [isGeneratingMemory, setIsGeneratingMemory] = useState(false);
    const [isSuggestingUpdates, setIsSuggestingUpdates] = useState(false);
    const [bibleUpdateSuggestions, setBibleUpdateSuggestions] = useState<BibleUpdateSuggestion[]>([]);
    const [expandedEp, setExpandedEp] = useState<number | null>(null);
    const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'layer1' | 'layer2'>('layer1');

    const showStatus = (type: 'ok' | 'err', text: string) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg(null), 3500);
    };

    const load = useCallback(async () => {
        if (!seriesName) return;
        const [b, m] = await Promise.all([getSeriesBible(seriesName), getSeriesMemory(seriesName)]);
        setBible(b);
        setBibleContent(b?.content || '');
        setMemory(m);
    }, [seriesName]);

    useEffect(() => { load(); }, [load]);

    // ── Layer 1: 저장 ──────────────────────────────────
    const handleSaveBible = async () => {
        if (!seriesName) return;
        setIsSavingBible(true);
        try {
            const updated: SeriesBible = {
                seriesName,
                content: bibleContent,
                lastModified: Date.now(),
                version: (bible?.version || 0) + 1,
                createdAt: bible?.createdAt || Date.now()
            };
            await saveSeriesBible(updated);
            setBible(updated);
            showStatus('ok', '시리즈 바이블이 저장되었습니다.');
        } catch {
            showStatus('err', '저장 실패. 다시 시도하세요.');
        } finally {
            setIsSavingBible(false);
        }
    };

    // ── Layer 1: AI 초안 생성 ──────────────────────────
    const handleGenerateBibleDraft = async () => {
        if (!apiKey) { showStatus('err', 'API 키가 없습니다.'); return; }
        if (!projectData?.seriesStory && !projectData?.characters?.length) {
            showStatus('err', 'Step 1에서 시리즈 정보를 먼저 입력하세요.'); return;
        }
        setIsGeneratingBible(true);
        try {
            const draft = await generateSeriesBibleDraft(projectData, apiKey);
            setBibleContent(draft);
            showStatus('ok', 'AI 초안이 생성되었습니다. 검토 후 저장하세요.');
        } catch {
            showStatus('err', 'AI 초안 생성에 실패했습니다.');
        } finally {
            setIsGeneratingBible(false);
        }
    };

    // ── Layer 1: 에피소드 완료 후 AI 업데이트 제안 ──────
    const handleSuggestUpdates = async () => {
        if (!apiKey) { showStatus('err', 'API 키가 없습니다.'); return; }
        if (!bibleContent.trim()) { showStatus('err', '먼저 시리즈 바이블을 작성하세요.'); return; }
        setIsSuggestingUpdates(true);
        setBibleUpdateSuggestions([]);
        try {
            const suggestions = await suggestBibleUpdates(projectData, bibleContent, apiKey);
            if (suggestions.length === 0) {
                showStatus('ok', '바이블 업데이트가 필요한 항목이 없습니다.');
            } else {
                setBibleUpdateSuggestions(suggestions.map(s => ({ ...s, selected: true })));
            }
        } catch {
            showStatus('err', '업데이트 제안 생성에 실패했습니다.');
        } finally {
            setIsSuggestingUpdates(false);
        }
    };

    // ── Layer 1: 제안 항목 바이블에 반영 ─────────────────
    const handleApplySuggestions = async () => {
        const selected = bibleUpdateSuggestions.filter(s => s.selected);
        if (selected.length === 0) { showStatus('err', '반영할 항목을 선택하세요.'); return; }

        const appendText = selected.map(s =>
            `\n\n### [업데이트] ${s.section}\n${s.suggestion}\n> 이유: ${s.reason}`
        ).join('');

        const newContent = bibleContent + appendText;
        setBibleContent(newContent);
        setBibleUpdateSuggestions([]);

        // 자동 저장
        const updated: SeriesBible = {
            seriesName,
            content: newContent,
            lastModified: Date.now(),
            version: (bible?.version || 0) + 1,
            createdAt: bible?.createdAt || Date.now()
        };
        await saveSeriesBible(updated);
        setBible(updated);
        showStatus('ok', `${selected.length}개 항목이 바이블에 반영·저장되었습니다.`);
    };

    // ── Layer 2: 현재화 메모리 생성 ───────────────────────
    const handleGenerateEpisodeMemory = async () => {
        if (!apiKey) { showStatus('err', 'API 키가 없습니다.'); return; }
        if (!projectData?.episodePlot && !projectData?.script?.length) {
            showStatus('err', '에피소드 대본 또는 플롯이 없습니다.'); return;
        }
        setIsGeneratingMemory(true);
        try {
            const existingHooks = memory?.globalPendingHooks || [];
            const entry = await generateEpisodeMemorySummary(projectData, apiKey, existingHooks);
            await upsertEpisodeMemoryEntry(seriesName, entry);
            await load();
            setExpandedEp(entry.episodeNumber);
            showStatus('ok', `EP${entry.episodeNumber} 메모리가 생성되었습니다.`);
        } catch {
            showStatus('err', '메모리 생성에 실패했습니다.');
        } finally {
            setIsGeneratingMemory(false);
        }
    };

    // ── Layer 2: 주입 한도 변경 ────────────────────────
    const handleLimitChange = async (v: number) => {
        onInjectionLimitChange(v);
        if (seriesName) await updateInjectionLimit(seriesName, v);
    };

    const currentEpNum = projectData?.episodeNumber;
    const currentEpHasMemory = memory?.episodes.some(e => e.episodeNumber === currentEpNum);

    return (
        <div style={styles.container}>
            {/* 헤더 */}
            <div style={styles.header}>
                <span style={styles.headerIcon}>📚</span>
                <span style={styles.headerTitle}>시리즈 메모리</span>
                <div style={styles.toggleWrap}>
                    <span style={{ fontSize: 12, color: '#aaa', marginRight: 6 }}>AI 메모리 주입</span>
                    <div
                        style={{ ...styles.toggle, background: isMemoryEnabled ? 'var(--color-primary)' : 'var(--color-border)' }}
                        onClick={() => onMemoryToggle(!isMemoryEnabled)}
                    >
                        <div style={{ ...styles.toggleKnob, left: isMemoryEnabled ? 18 : 2 }} />
                    </div>
                </div>
            </div>

            {/* 상태 메시지 */}
            {statusMsg && (
                <div style={{ ...styles.statusBanner, background: statusMsg.type === 'ok' ? 'var(--color-primary-dim)' : 'rgba(231, 76, 60, 0.1)', borderColor: statusMsg.type === 'ok' ? 'var(--color-primary)' : '#e74c3c', color: statusMsg.type === 'ok' ? 'var(--color-primary)' : '#e74c3c' }}>
                    {statusMsg.type === 'ok' ? '✅' : '❌'} {statusMsg.text}
                </div>
            )}

            {/* 탭 */}
            <div style={styles.tabs}>
                <button style={{ ...styles.tab, ...(activeTab === 'layer1' ? styles.tabActive : {}) }} onClick={() => setActiveTab('layer1')}>
                    Layer 1 · 바이블
                </button>
                <button style={{ ...styles.tab, ...(activeTab === 'layer2' ? styles.tabActive : {}) }} onClick={() => setActiveTab('layer2')}>
                    Layer 2 · 누적 기록
                </button>
            </div>

            {/* ── Layer 1 탭 ── */}
            {activeTab === 'layer1' && (
                <div style={styles.tabContent}>
                    <div style={styles.sectionLabel}>
                        시리즈 불변 규칙 · 캐릭터 프로필 · 핵심 복선
                        {bible && <span style={styles.versionBadge}>v{bible.version}</span>}
                    </div>

                    <textarea
                        style={styles.textarea}
                        value={bibleContent}
                        onChange={e => setBibleContent(e.target.value)}
                        placeholder="시리즈 바이블을 직접 작성하거나 'AI 초안 생성' 버튼을 사용하세요.&#10;&#10;예시:&#10;## 1. 세계관 핵심 설정&#10;시뮬메리지: 결혼 전 90일간 AI 파트너와 시뮬레이션하는 서비스...&#10;&#10;## 2. 주요 캐릭터&#10;강이수: 논리형 변호사, 감정을 억누름..."
                        rows={12}
                    />

                    <div style={styles.btnRow}>
                        <button
                            style={{ ...styles.btn, ...styles.btnPrimary }}
                            onClick={handleGenerateBibleDraft}
                            disabled={isGeneratingBible || !apiKey}
                        >
                            {isGeneratingBible ? '⏳ 생성 중...' : '✨ AI 초안 생성'}
                        </button>
                        <button
                            style={{ ...styles.btn, ...styles.btnSecondary }}
                            onClick={handleSaveBible}
                            disabled={isSavingBible}
                        >
                            {isSavingBible ? '저장 중...' : '💾 저장'}
                        </button>
                    </div>

                    {/* 에피소드 완료 후 업데이트 제안 */}
                    <div style={{ marginTop: 12 }}>
                        <button
                            style={{ ...styles.btn, ...styles.btnUpdate, width: '100%' }}
                            onClick={handleSuggestUpdates}
                            disabled={isSuggestingUpdates || !bibleContent.trim() || !apiKey}
                        >
                            {isSuggestingUpdates ? '⏳ 분석 중...' : '📝 현재 에피소드 기반 바이블 업데이트 제안 받기'}
                        </button>
                    </div>

                    {/* 업데이트 제안 목록 */}
                    {bibleUpdateSuggestions.length > 0 && (
                        <div style={styles.suggestBox}>
                            <div style={styles.suggestTitle}>AI 업데이트 제안 — 반영할 항목 선택:</div>
                            {bibleUpdateSuggestions.map((s, i) => (
                                <label key={i} style={styles.suggestItem}>
                                    <input
                                        type="checkbox"
                                        checked={s.selected}
                                        onChange={e => {
                                            const next = [...bibleUpdateSuggestions];
                                            next[i].selected = e.target.checked;
                                            setBibleUpdateSuggestions(next);
                                        }}
                                        style={{ marginRight: 8 }}
                                    />
                                    <div>
                                        <div style={styles.suggestSection}>[{s.section}]</div>
                                        <div style={styles.suggestContent}>{s.suggestion}</div>
                                        <div style={styles.suggestReason}>이유: {s.reason}</div>
                                    </div>
                                </label>
                            ))}
                            <button
                                style={{ ...styles.btn, ...styles.btnPrimary, marginTop: 8, width: '100%' }}
                                onClick={handleApplySuggestions}
                            >
                                ✅ 선택 항목 반영하기
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Layer 2 탭 ── */}
            {activeTab === 'layer2' && (
                <div style={styles.tabContent}>
                    {/* 주입 한도 슬라이더 */}
                    <div style={styles.sliderRow}>
                        <span style={styles.sliderLabel}>AI 주입 한도: 최근 </span>
                        <span style={styles.sliderValue}>{injectionLimit}화</span>
                        <input
                            type="range"
                            min={1} max={10}
                            value={injectionLimit}
                            onChange={e => handleLimitChange(Number(e.target.value))}
                            style={styles.slider}
                        />
                        <span style={styles.sliderHint}>(1~10화)</span>
                    </div>

                    {/* 현재화 요약 생성 버튼 */}
                    <button
                        style={{
                            ...styles.btn,
                            ...styles.btnPrimary,
                            width: '100%',
                            marginBottom: 10,
                            opacity: currentEpHasMemory ? 0.8 : 1
                        }}
                        onClick={handleGenerateEpisodeMemory}
                        disabled={isGeneratingMemory || !apiKey}
                    >
                        {isGeneratingMemory
                            ? '⏳ 요약 생성 중...'
                            : currentEpHasMemory
                                ? `🔄 EP${currentEpNum} 메모리 재생성`
                                : `🎬 EP${currentEpNum} 메모리 생성`}
                    </button>

                    {/* 누적 미회수 복선 */}
                    {memory?.globalPendingHooks && memory.globalPendingHooks.length > 0 && (
                        <div style={styles.hooksBox}>
                            <div style={styles.hooksTitle}>🪝 전체 미회수 복선</div>
                            {memory.globalPendingHooks.map((hook, i) => (
                                <div key={i} style={styles.hookItem}>#{i + 1}. {hook}</div>
                            ))}
                        </div>
                    )}

                    {/* 에피소드 목록 */}
                    {(!memory || memory.episodes.length === 0) ? (
                        <div style={styles.emptyState}>
                            아직 기록된 에피소드가 없습니다.<br />
                            에피소드 완료 후 위 버튼으로 메모리를 생성하세요.
                        </div>
                    ) : (
                        <div style={styles.epList}>
                            {[...memory.episodes].reverse().map(ep => (
                                <div key={ep.episodeNumber} style={styles.epCard}>
                                    <div style={styles.epHeader} onClick={() => setExpandedEp(expandedEp === ep.episodeNumber ? null : ep.episodeNumber)}>
                                        <span style={styles.epBadge}>EP{ep.episodeNumber}</span>
                                        <span style={styles.epName}>{ep.episodeName}</span>
                                        <span style={styles.epStatus}>{ep.status === 'completed' ? '✅' : '🔵'}</span>
                                        <span style={styles.epToggle}>{expandedEp === ep.episodeNumber ? '▲' : '▼'}</span>
                                    </div>
                                    {expandedEp === ep.episodeNumber && (
                                        <div style={styles.epDetail}>
                                            <div style={styles.epField}><strong>요약:</strong> {ep.summary}</div>
                                            <div style={styles.epField}><strong>감정선:</strong> {ep.emotionLog}</div>
                                            {ep.plotPoints.length > 0 && (
                                                <div style={styles.epField}>
                                                    <strong>주요 사건:</strong>
                                                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                                        {ep.plotPoints.map((p, i) => <li key={i}>{p}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            <div style={styles.epField}><strong>엔딩:</strong> {ep.endingNote}</div>
                                            {ep.pendingPlotHooks.length > 0 && (
                                                <div style={styles.epField}><strong>새 복선:</strong> {ep.pendingPlotHooks.join(', ')}</div>
                                            )}
                                            {ep.resolvedPlotHooks.length > 0 && (
                                                <div style={styles.epField}><strong>회수된 복선:</strong> {ep.resolvedPlotHooks.join(', ')}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── 인라인 스타일 ──────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
    container: {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: 'var(--color-text)'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        background: 'var(--color-surface-hover)',
        borderBottom: '1px solid var(--color-border)'
    },
    headerIcon: { fontSize: 18 },
    headerTitle: { fontWeight: 700, fontSize: 15, flex: 1, color: 'var(--color-text)' },
    toggleWrap: { display: 'flex', alignItems: 'center' },
    toggle: {
        position: 'relative',
        width: 38, height: 20,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.3s'
    },
    toggleKnob: {
        position: 'absolute',
        top: 3, width: 14, height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.3s'
    },
    statusBanner: {
        padding: '8px 16px',
        borderLeft: '3px solid',
        fontSize: 12,
        margin: '0 16px 8px',
        borderRadius: 4
    },
    tabs: {
        display: 'flex',
        borderBottom: '1px solid var(--color-border)'
    },
    tab: {
        flex: 1, padding: '10px 0',
        border: 'none',
        background: 'transparent',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.5,
        transition: 'all 0.2s'
    },
    tabActive: {
        color: 'var(--color-primary)',
        borderBottom: '2px solid var(--color-primary)',
        background: 'var(--color-primary-dim)'
    },
    tabContent: {
        padding: '14px 16px',
        maxHeight: '45vh',
        overflowY: 'auto'
    },
    sectionLabel: {
        fontSize: 11,
        color: 'var(--color-text-muted)',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6
    },
    versionBadge: {
        background: 'var(--color-border)',
        color: 'var(--color-primary)',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 10
    },
    textarea: {
        width: '100%',
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        color: 'var(--color-text)',
        padding: 10,
        fontSize: 12,
        lineHeight: 1.6,
        resize: 'vertical',
        outline: 'none',
        fontFamily: 'monospace',
        boxSizing: 'border-box'
    },
    btnRow: {
        display: 'flex',
        gap: 8,
        marginTop: 10
    },
    btn: {
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid transparent',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        transition: 'all 0.2s'
    },
    btnPrimary: {
        background: 'linear-gradient(135deg, var(--color-primary), #FF9A5C)',
        color: '#0B0B0F',
        boxShadow: '0 2px 8px rgba(255, 173, 117, 0.2)'
    },
    btnSecondary: {
        background: 'transparent',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)'
    },
    btnUpdate: {
        background: 'var(--color-surface-hover)',
        color: 'var(--color-primary)',
        border: '1px solid var(--color-primary)'
    },
    suggestBox: {
        marginTop: 12,
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border-highlight)',
        borderRadius: 8,
        padding: 12
    },
    suggestTitle: {
        fontSize: 12,
        color: 'var(--color-primary)',
        fontWeight: 700,
        marginBottom: 8
    },
    suggestItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        padding: '8px 0',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer'
    },
    suggestSection: { fontSize: 11, color: 'var(--color-primary)', fontWeight: 700, marginBottom: 2 },
    suggestContent: { fontSize: 12, color: 'var(--color-text)', marginBottom: 2 },
    suggestReason: { fontSize: 11, color: 'var(--color-text-muted)' },
    sliderRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        background: 'rgba(0, 0, 0, 0.2)',
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--color-border)'
    },
    sliderLabel: { fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
    sliderValue: { fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', minWidth: 28 },
    slider: { flex: 1, accentColor: 'var(--color-primary)' },
    sliderHint: { fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
    hooksBox: {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-highlight)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 10
    },
    hooksTitle: { fontSize: 12, color: 'var(--color-primary)', fontWeight: 700, marginBottom: 6 },
    hookItem: { fontSize: 12, color: 'var(--color-text)', paddingBottom: 3 },
    emptyState: {
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 12,
        padding: '24px 0',
        lineHeight: 1.8
    },
    epList: { display: 'flex', flexDirection: 'column', gap: 6 },
    epCard: {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        overflow: 'hidden'
    },
    epHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        userSelect: 'none'
    },
    epBadge: {
        background: 'var(--color-primary-dim)',
        color: 'var(--color-primary)',
        borderRadius: 4,
        padding: '2px 7px',
        fontSize: 11,
        fontWeight: 700
    },
    epName: { flex: 1, fontSize: 13, color: 'var(--color-text)' },
    epStatus: { fontSize: 14 },
    epToggle: { fontSize: 11, color: 'var(--color-text-muted)' },
    epDetail: {
        padding: '0 12px 12px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
    },
    epField: { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }
};

export default SeriesMemoryManager;
