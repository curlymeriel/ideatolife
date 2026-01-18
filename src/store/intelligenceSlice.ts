import type { StateCreator } from 'zustand';
import type {
    TrendSnapshot,
    CompetitorSnapshot,
    StrategyInsight,
    IdeaPoolItem
} from './types';

export interface IntelligenceSlice {
    trendSnapshots: Record<string, TrendSnapshot>;
    competitorSnapshots: Record<string, CompetitorSnapshot>;
    strategyInsights: Record<string, StrategyInsight>;
    ideaPool: IdeaPoolItem[];

    // Actions
    saveTrendSnapshot: (snapshot: TrendSnapshot) => void;
    deleteTrendSnapshot: (id: string) => void;
    saveCompetitorSnapshot: (snapshot: CompetitorSnapshot) => void;
    deleteCompetitorSnapshot: (id: string) => void;
    saveStrategyInsight: (insight: StrategyInsight) => void;
    deleteStrategyInsight: (id: string) => void;
    addIdeaToPool: (idea: IdeaPoolItem) => void;
    updateIdeaStatus: (id: string, status: IdeaPoolItem['status']) => void;
    deleteIdeaFromPool: (id: string) => void;
}

export const createIntelligenceSlice: StateCreator<IntelligenceSlice> = (set) => ({
    trendSnapshots: {},
    competitorSnapshots: {},
    strategyInsights: {},
    ideaPool: [],

    saveTrendSnapshot: (snapshot) => set((state) => ({
        trendSnapshots: { ...state.trendSnapshots, [snapshot.id]: snapshot }
    })),

    deleteTrendSnapshot: (id: string) => set((state) => {
        const { [id]: deleted, ...rest } = state.trendSnapshots;
        return { trendSnapshots: rest };
    }),

    saveCompetitorSnapshot: (snapshot) => set((state) => ({
        competitorSnapshots: { ...state.competitorSnapshots, [snapshot.id]: snapshot }
    })),

    deleteCompetitorSnapshot: (id: string) => set((state) => {
        const { [id]: deleted, ...rest } = state.competitorSnapshots;
        return { competitorSnapshots: rest };
    }),

    saveStrategyInsight: (insight) => set((state) => ({
        strategyInsights: { ...state.strategyInsights, [insight.id]: insight }
    })),

    deleteStrategyInsight: (id: string) => set((state) => {
        const { [id]: deleted, ...rest } = state.strategyInsights;
        return { strategyInsights: rest };
    }),

    addIdeaToPool: (idea) => set((state) => ({
        ideaPool: [...state.ideaPool, idea]
    })),

    updateIdeaStatus: (id, status) => set((state) => ({
        ideaPool: state.ideaPool.map(i => i.id === id ? { ...i, status } : i)
    })),

    deleteIdeaFromPool: (id: string) => set((state) => ({
        ideaPool: state.ideaPool.filter(i => i.id !== id)
    })),
});
