import { useWorkflowStore } from '../store/workflowStore';

// Auto-backup hook is disabled to prevent popups
export const useAutoBackup = () => {
    // Auto-backup to file is disabled to prevent annoying popups.
    // The app already persists state to IndexedDB via the store middleware.
};

// Manual backup function
export const downloadBackup = () => {
    const state = useWorkflowStore.getState();

    const dataToBackup = {
        version: 5,
        timestamp: new Date().toISOString(),
        state: {
            id: state.id,
            lastModified: state.lastModified,
            savedProjects: state.savedProjects,
            seriesName: state.seriesName,
            episodeName: state.episodeName,
            episodeNumber: state.episodeNumber,
            seriesStory: state.seriesStory,
            characters: state.characters,
            seriesLocations: state.seriesLocations,
            episodePlot: state.episodePlot,
            episodeCharacters: state.episodeCharacters,
            episodeLocations: state.episodeLocations,
            targetDuration: state.targetDuration,
            aspectRatio: state.aspectRatio,
            apiKeys: state.apiKeys,
            chatHistory: state.chatHistory,
            masterStyle: state.masterStyle,
            styleAnchor: state.styleAnchor,
            assetDefinitions: state.assetDefinitions,
            thumbnailUrl: state.thumbnailUrl,
            thumbnailSettings: state.thumbnailSettings,
            script: state.script,
            ttsModel: state.ttsModel,
            assets: state.assets,
            currentStep: state.currentStep,
        }
    };

    const jsonString = JSON.stringify(dataToBackup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    link.href = url;
    link.download = `IdeaLab_FullBackup_${timestamp}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`백업 파일이 다운로드되었습니다:\n${link.download}`);
};
