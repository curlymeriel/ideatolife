import type { StateCreator } from 'zustand';
import type { UIState, ProjectMetadata } from './types';

// UI Slice: Manages ephemeral UI state and project metadata
export interface UISlice extends UIState {
    // Multi-project metadata
    savedProjects: Record<string, ProjectMetadata>;

    // Actions
    setSaveStatus: (status: UIState['saveStatus']) => void;
    setIsHydrated: (isHydrated: boolean) => void;
    setDebugMessage: (msg: string) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
    // Initial state
    saveStatus: 'idle',
    isHydrated: false,
    debugMessage: '',
    savedProjects: {},

    // Actions
    setSaveStatus: (status) => set({ saveStatus: status }),

    setIsHydrated: (isHydrated) => set({ isHydrated }),

    setDebugMessage: (msg) => set({ debugMessage: msg }),
});
