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
    saveCompetitorSnapshot: (snapshot: CompetitorSnapshot) => void;
    saveStrategyInsight: (insight: StrategyInsight) => void;
    addIdeaToPool: (idea: IdeaPoolItem) => void;
    updateIdeaStatus: (id: string, status: IdeaPoolItem['status']) => void;
}

export const createIntelligenceSlice: StateCreator<IntelligenceSlice> = (set) => ({
    trendSnapshots: {},
    competitorSnapshots: {},
    strategyInsights: {},
    ideaPool: [],

    saveTrendSnapshot: (snapshot) => set((state) => ({
        trendSnapshots: { ...state.trendSnapshots, [snapshot.id]: snapshot }
    })),

    saveCompetitorSnapshot: (snapshot) => set((state) => ({
        competitorSnapshots: { ...state.competitorSnapshots, [snapshot.id]: snapshot }
    })),

    saveStrategyInsight: (insight) => set((state) => ({
        strategyInsights: { ...state.strategyInsights, [insight.id]: insight }
    })),

    addIdeaToPool: (idea) => set((state) => ({
        ideaPool: [...state.ideaPool, idea]
    })),

    updateIdeaStatus: (id, status) => set((state) => ({
        ideaPool: state.ideaPool.map(i => i.id === id ? { ...i, status } : i)
    })),
});
