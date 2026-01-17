import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
    Lightbulb,
    Trash2,
    Rocket,
    Clock,
    Search,
    Filter,
    Plus,
    ChevronRight,
    CheckCircle2,
    LayoutGrid,
    Target
} from 'lucide-react';
import type { IdeaPoolItem } from '../store/types';

export const IdeaPool: React.FC = () => {
    const navigate = useNavigate();
    const { ideaPool, setProjectInfo, setScript } = useWorkflowStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSource, setFilterSource] = useState<string>('all');

    const filteredIdeas = ideaPool.filter(idea => {
        const matchesSearch = idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            idea.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSource = filterSource === 'all' || idea.source === filterSource;
        return matchesSearch && matchesSource;
    });

    const handlePromote = (idea: IdeaPoolItem) => {
        setProjectInfo({
            seriesName: idea.title,
            seriesStory: idea.description,
            episodeName: 'New Episode',
            episodePlot: '',
            trendInsights: {
                target: idea.metadata?.targetAudience || '',
                vibe: idea.metadata?.angle || '',
                references: [],
                storytelling: idea.metadata?.notes || '',
                appliedAt: Date.now()
            }
        });
        setScript([]);
        navigate('/step/1');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--color-text-primary)] flex items-center gap-3">
                        <Lightbulb className="text-yellow-400 fill-yellow-400/20" size={32} />
                        아이디어 풀 (Idea Pool)
                    </h1>
                    <p className="text-[var(--color-text-secondary)] mt-1">
                        전략적으로 도출된 아이디어를 보관하고 프로젝트로 즉시 전환하세요.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 transition-all font-medium">
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
                            className="group relative bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden hover:border-[var(--color-primary)]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--color-primary)]/5"
                        >
                            <div className="p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-600 text-xs font-bold uppercase tracking-wider">
                                        <Target size={12} />
                                        {idea.category || 'Idea'}
                                    </div>
                                    <button className="p-2 text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-red-50 transition-all rounded-lg">
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-[var(--color-text-primary)] leading-tight group-hover:text-[var(--color-primary)] transition-colors">
                                        {idea.title}
                                    </h3>
                                    <p className="text-[var(--color-text-secondary)] mt-2 line-clamp-3 text-sm leading-relaxed">
                                        {idea.description}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 pt-4 border-t border-[var(--color-border)]">
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                                        <Clock size={14} />
                                        {new Date(idea.createdAt).toLocaleDateString()}
                                    </div>
                                    {idea.metadata?.format && (
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                                            <LayoutGrid size={14} />
                                            {idea.metadata.format}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => handlePromote(idea)}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-primary)]/5 text-[var(--color-primary)] font-bold hover:bg-[var(--color-primary)] hover:text-white transition-all group/btn"
                                >
                                    <Rocket size={18} className="group-hover/btn:animate-bounce" />
                                    제작 시작
                                    <ChevronRight size={18} className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                </button>
                            </div>

                            {idea.status === 'completed' && (
                                <div className="absolute top-2 right-2 p-1 bg-green-500 rounded-full text-white shadow-lg">
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
        </div>
    );
};
