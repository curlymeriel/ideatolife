import { get as idbGet, keys as idbKeys } from 'idb-keyval';
import type { ProjectData } from '../store/types';

/**
 * Get all unique series names from stored projects
 */
export async function getAllSeriesNames(): Promise<string[]> {
    try {
        const allKeys = await idbKeys();
        const projectKeys = allKeys.filter(key =>
            typeof key === 'string' && key.startsWith('project-')
        ) as string[];

        const seriesSet = new Set<string>();

        for (const key of projectKeys) {
            const project = await idbGet<ProjectData>(key);
            if (project?.seriesName) {
                seriesSet.add(project.seriesName);
            }
        }

        return Array.from(seriesSet).sort();
    } catch (error) {
        console.error('Failed to get series names:', error);
        return [];
    }
}

/**
 * Get the latest project for a given series
 */
export async function getLatestProjectBySeries(seriesName: string): Promise<ProjectData | null> {
    try {
        const allKeys = await idbKeys();
        const projectKeys = allKeys.filter(key =>
            typeof key === 'string' && key.startsWith('project-')
        ) as string[];

        let latestProject: ProjectData | null = null;
        let latestTimestamp = 0;

        for (const key of projectKeys) {
            const project = await idbGet<ProjectData>(key);
            if (project?.seriesName === seriesName && project.lastModified > latestTimestamp) {
                latestProject = project;
                latestTimestamp = project.lastModified;
            }
        }

        return latestProject;
    } catch (error) {
        console.error(`Failed to get latest project for series "${seriesName}":`, error);
        return null;
    }
}

/**
 * Extract series-level data from a project
 */
export function extractSeriesData(project: ProjectData): Partial<ProjectData> {
    return {
        seriesName: project.seriesName,
        seriesStory: project.seriesStory,
        characters: project.characters,
        seriesLocations: project.seriesLocations,
        aspectRatio: project.aspectRatio,
        masterStyle: project.masterStyle,
        assetDefinitions: project.assetDefinitions,
        // Extract only frameImage from thumbnailSettings
        thumbnailSettings: {
            ...getDefaultThumbnailSettings(),
            frameImage: project.thumbnailSettings?.frameImage || ''
        },
        // Explicitly exclude episode-specific data
        storylineTable: [], // Reset for new episode
        episodePlot: '', // Reset for new episode
        episodeCharacters: [], // Reset for new episode
        episodeLocations: [] // Reset for new episode
    };
}

/**
 * Get the next episode number for a series
 */
export async function getNextEpisodeNumber(seriesName: string): Promise<number> {
    try {
        const allKeys = await idbKeys();
        const projectKeys = allKeys.filter(key =>
            typeof key === 'string' && key.startsWith('project-')
        ) as string[];

        let maxEpisodeNumber = 0;

        for (const key of projectKeys) {
            const project = await idbGet<ProjectData>(key);
            if (project?.seriesName === seriesName && project.episodeNumber > maxEpisodeNumber) {
                maxEpisodeNumber = project.episodeNumber;
            }
        }

        return maxEpisodeNumber + 1;
    } catch (error) {
        console.error(`Failed to get next episode number for series "${seriesName}":`, error);
        return 1;
    }
}
/**
 * Get default thumbnail settings (for non-inherited fields)
 */
function getDefaultThumbnailSettings() {
    return {
        scale: 1,
        imagePosition: { x: 0, y: 0 },
        textPosition: { x: 0, y: 0 },
        titleSize: 48,
        epNumSize: 60,
        textColor: '#ffffff',
        fontFamily: 'Inter',
        frameImage: ''
    };
}
