import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
    Lightbulb,
    Trash2,
    Clock,
    Search,
    Filter,
    Plus,
    CheckCircle2,
    LayoutGrid,
    Target
} from 'lucide-react';
import type { IdeaPoolItem } from '../store/types';

// Helper to format text with $$ markers
const formatText = (text: string) => {
    if (!text) return '';
    const parts = text.split('$$');
    return parts.map((part, index) => {
        if (index % 2 === 1) {
            return <span key={index} className="text-[var(--color-primary)] font-bold">{part}</span>;
        }
        return part;
    });
};

export const IdeaPool: React.FC = () => {
    const navigate = useNavigate();
    const { ideaPool, setProjectInfo, setScript, saveProject } = useWorkflowStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSource, setFilterSource] = useState<string>('all');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newIdea, setNewIdea] = useState({ title: '', description: '', category: '' });

    const filteredIdeas = ideaPool.filter(idea => {
        const matchesSearch = idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            idea.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSource = filterSource === 'all' || idea.source === filterSource;
        return matchesSearch && matchesSource;
    });

    const handleAddIdea = () => {
        if (!newIdea.title || !newIdea.description) return;

        useWorkflowStore.getState().addIdeaToPool({
            id: Math.random().toString(36).substring(2, 9),
            createdAt: Date.now(),
            title: newIdea.title,
            description: newIdea.description,
            source: 'Manual',
            category: newIdea.category || 'Idea',
            status: 'pending'
        });

        setNewIdea({ title: '', description: '', category: '' });
        setIsAddModalOpen(false);
    };

    const handleStartResearch = (idea: IdeaPoolItem) => {
        // Workflow Bridge: Go back to Phase 1 Market Research with this idea
        navigate(`/research?query=${encodeURIComponent(idea.title)}`);
    };

    const handlePromote = (idea: IdeaPoolItem) => {
        // Workflow Bridge: Transfer strategic data to actual project state
        // ALWAYS create a NEW project for a new production line
        const newProjectId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const currentApiKeys = useWorkflowStore.getState().apiKeys;

        const { resetToDefault } = useWorkflowStore.getState();
        resetToDefault();

        const hasSeriesInfo = !!(idea.metadata?.seriesTitle || (idea.source === 'Phase3' && idea.category));

        setProjectInfo({
            id: newProjectId,
            apiKeys: currentApiKeys,
            // Promote series-level info from metadata, fallback to category for Phase3 ideas, then idea title
            seriesName: idea.metadata?.seriesTitle || (idea.source === 'Phase3' ? idea.category : '') || idea.title,
            seriesStory: idea.metadata?.seriesDescription || '',

            // If we have series info, promote the idea itself to the episode level.
            // Otherwise, it was already used for the series level, so create a default "New Episode".
            episodeName: hasSeriesInfo ? idea.title : 'New Episode',
            episodePlot: hasSeriesInfo ? idea.description : '',

            characters: idea.metadata?.characters || [],
            lastModified: Date.now(),
            currentStep: 1,
            trendInsights: {
                target: idea.metadata?.targetAudience || '',
                vibe: idea.metadata?.angle || '',
                references: [],
                storytelling: idea.metadata?.notes || '',
                appliedAt: Date.now()
            }
        });
        setScript([]);
        saveProject(); // Ensure it's on disk
        navigate('/step/1');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Lightbulb className="text-[var(--color-primary)] fill-[var(--color-primary)]/20" size={32} />
                        아이디어 풀 (Idea Pool)
                        <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/20 font-medium">
                            <CheckCircle2 size={12} /> Auto-saved to Browser
                        </span>
                    </h1>
                    <p className="text-[var(--color-text-secondary)] mt-1">
                        발굴한 아이디어를 보관하고 검증하거나 프로젝트로 전환하세요.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-black font-medium"
                    >
                        <Plus size={20} />
                        직접 추가
                    </button>
                </div>
            </header>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)]">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] group-focus-within:text-[var(--color-primary)] transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="아이디어 제목이나 내용 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="text-[var(--color-text-secondary)]" size={20} />
                    <select
                        value={filterSource}
                        onChange={(e) => setFilterSource(e.target.value)}
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                    >
                        <option value="all">모든 출처</option>
                        <option value="Phase3">Phase 3 전략</option>
                        <option value="Manual">직접 추가</option>
                        <option value="AI">AI 제안</option>
                    </select>
                </div>
            </div>

            {/* Idea Grid */}
            {filteredIdeas.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredIdeas.map((idea) => (
                        <div
                            key={idea.id}
                            className="group relative glass-panel hover:border-[var(--color-primary)]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--color-primary)]/5"
                        >
                            <div className="p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-bold uppercase tracking-wider border border-[var(--color-primary)]/20">
                                        <Target size={12} />
                                        {idea.category || 'Idea'}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleStartResearch(idea)}
                                            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-all rounded-lg"
                                            title="시장조사/검증 시작"
                                        >
                                            <Search size={18} />
                                        </button>
                                        <button
                                            onClick={() => useWorkflowStore.getState().deleteIdeaFromPool(idea.id)}
                                            className="p-2 text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-all rounded-lg"
                                            title="아이디어 삭제"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-white leading-tight group-hover:text-[var(--color-primary)] transition-colors">
                                        {formatText(idea.title)}
                                    </h3>
                                    <p className="text-[var(--color-text-secondary)] mt-2 line-clamp-3 text-sm leading-relaxed">
                                        {idea.description}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 pt-4 border-t border-[var(--color-border)]">
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                                        <Clock size={14} />
                                        {new Date(idea.createdAt).toLocaleDateString()}
                                    </div>
                                    {idea.metadata?.format && (
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                                            <LayoutGrid size={14} />
                                            {idea.metadata.format}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleStartResearch(idea)}
                                        className="btn-secondary flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                                    >
                                        검증/분석
                                    </button>
                                    <button
                                        onClick={() => handlePromote(idea)}
                                        className="btn-primary flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/10"
                                    >
                                        제작 시작
                                    </button>
                                </div>
                            </div>

                            {idea.status === 'completed' && (
                                <div className="absolute top-2 right-2 p-1 bg-[var(--color-primary)] text-black rounded-full shadow-lg">
                                    <CheckCircle2 size={16} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-[var(--color-surface)] rounded-3xl border-2 border-dashed border-[var(--color-border)]">
                    <div className="w-16 h-16 bg-[var(--color-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lightbulb className="text-[var(--color-text-secondary)] opacity-20" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--color-text-primary)]">아직 저장된 아이디어가 없습니다</h3>
                    <p className="text-[var(--color-text-secondary)] mt-2">
                        Phase 3 전략에서 아이디어를 저장하거나 직접 추가해보세요.
                    </p>
                </div>
            )}

            {/* Add Idea Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
                    <div className="relative bg-[var(--color-surface)] w-full max-w-lg rounded-3xl border border-[var(--color-border)] shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 space-y-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Plus className="text-[var(--color-primary)]" />
                                새로운 아이디어 추가
                            </h2>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">제목</label>
                                    <input
                                        type="text"
                                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                        placeholder="아이디어의 핵심 제목을 입력하세요"
                                        value={newIdea.title}
                                        onChange={e => setNewIdea({ ...newIdea, title: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">내용/설명</label>
                                    <textarea
                                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all min-h-[120px]"
                                        placeholder="어떤 스토리인가요? 핵심 내용을 설명해주세요"
                                        value={newIdea.description}
                                        onChange={e => setNewIdea({ ...newIdea, description: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">카테고리 (선택)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                        placeholder="예: 브이로그, 정보공유, 미스터리 등"
                                        value={newIdea.category}
                                        onChange={e => setNewIdea({ ...newIdea, category: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    className="btn-secondary flex-1 py-4 rounded-2xl font-bold"
                                    onClick={() => setIsAddModalOpen(false)}
                                >
                                    취소
                                </button>
                                <button
                                    className="btn-primary flex-1 py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/20"
                                    onClick={handleAddIdea}
                                >
                                    아이디어 저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
