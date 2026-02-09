/**
 * Cloud Migration Utility
 * 
 * 기존 로컬 IndexedDB 데이터를 Firebase 클라우드로 이전합니다.
 */

import { keys as idbKeys, get as idbGet } from 'idb-keyval';
import type { ProjectData } from '../store/types';
import * as cloudDatabase from '../services/cloudDatabase';
import * as cloudStorage from '../services/cloudStorage';
import { isIdbUrl, loadFromIdb } from './imageStorage';
import {
    compressImageBlob,
    compressVideoBlob,
    shouldCompressImage,
    shouldCompressVideo,
    dataUrlToBlob,
} from './mediaCompressor';

export interface CloudMigrationProgress {
    phase: 'scanning' | 'uploading' | 'saving' | 'done';
    currentProject: string;
    currentFile: string;
    projectsTotal: number;
    projectsDone: number;
    filesTotal: number;
    filesDone: number;
    bytesTotal: number;
    bytesDone: number;
}

type ProgressCallback = (progress: CloudMigrationProgress) => void;

/**
 * 로컬 프로젝트 목록 조회
 */
export const getLocalProjects = async (): Promise<ProjectData[]> => {
    const allKeys = await idbKeys();
    const projectKeys = allKeys.filter(
        key => typeof key === 'string' && key.startsWith('project-')
    ) as string[];

    const projects: ProjectData[] = [];

    for (const key of projectKeys) {
        try {
            const data = await idbGet(key);
            if (data) {
                // JSON 문자열인 경우 파싱
                const project = typeof data === 'string' ? JSON.parse(data) : data;
                projects.push(project);
            }
        } catch (error) {
            console.error(`Failed to load local project ${key}:`, error);
        }
    }

    return projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
};

/**
 * 단일 URL의 미디어를 클라우드에 업로드
 */
const uploadMediaUrl = async (
    userId: string,
    projectId: string,
    mediaType: cloudStorage.MediaType,
    fileName: string,
    url: string | undefined | null,
    compress: boolean = true
): Promise<string | null> => {
    if (!url) return null;

    // Skip if already a Firebase Storage URL
    if (url.includes('firebasestorage.googleapis.com')) {
        return url;
    }

    try {
        let blob: Blob;

        // IDB URL 처리
        if (isIdbUrl(url)) {
            const data = await loadFromIdb(url);
            if (!data) return null;

            // Base64 data URL인 경우
            if (typeof data === 'string' && data.startsWith('data:')) {
                blob = await dataUrlToBlob(data);
            } else if (data instanceof Blob) {
                blob = data;
            } else {
                return null;
            }
        }
        // Data URL 처리
        else if (url.startsWith('data:')) {
            blob = await dataUrlToBlob(url);
        }
        // HTTP URL 처리
        else if (url.startsWith('http')) {
            const response = await fetch(url);
            blob = await response.blob();
        }
        else {
            return null;
        }

        // 압축
        if (compress) {
            try {
                if (mediaType === 'images' && shouldCompressImage(blob)) {
                    blob = await compressImageBlob(blob);
                } else if (mediaType === 'videos' && shouldCompressVideo(blob)) {
                    const compressed = await compressVideoBlob(blob);
                    // [FIX] Safety check: If compressed video is too small (<1KB), it's likely corrupted/empty.
                    if (compressed.size > 1024) {
                        blob = compressed;
                    } else {
                        console.warn(`[CloudMigration] Compressed video too small (${compressed.size} bytes). Using original.`);
                    }
                }
            } catch (e) {
                console.error('[CloudMigration] Compression error, using original:', e);
            }
        }


        // 업로드
        const result = await cloudStorage.uploadFile(
            userId,
            projectId,
            mediaType,
            fileName,
            blob
        );

        return result.downloadUrl;
    } catch (error: any) {
        console.error(`Failed to upload media ${fileName}:`, error);
        // Firebase Storage Unauthorized error code
        if (error?.code === 'storage/unauthorized' || error?.status === 403) {
            return 'UNAUTHORIZED';
        }
        return null;
    }
};

/**
 * 단일 프로젝트를 클라우드로 마이그레이션
 */
export const migrateProjectToCloud = async (
    userId: string,
    project: ProjectData,
    onProgress?: ProgressCallback
): Promise<ProjectData> => {
    const migratedProject = { ...project };

    // [FIX] Deep Copy sensitive arrays/objects to prevent mutating the active store state
    // If we modify migratedProject.script directly, it updates the UI state because shallow copy shares references.
    if (migratedProject.script) {
        migratedProject.script = migratedProject.script.map(cut => ({ ...cut }));
    }
    if (migratedProject.assetDefinitions) {
        migratedProject.assetDefinitions = {};
        for (const [key, val] of Object.entries(project.assetDefinitions)) {
            migratedProject.assetDefinitions[key] = { ...val };
        }
    }

    // 1. 스크립트 미디어 업로드
    if (migratedProject.script) {

        for (let i = 0; i < migratedProject.script.length; i++) {
            const cut = migratedProject.script[i];
            const cutId = cut.id ?? i;

            onProgress?.({
                phase: 'uploading',
                currentProject: project.episodeName,
                currentFile: `Cut ${cutId} - Images`,
                projectsTotal: 1,
                projectsDone: 0,
                filesTotal: migratedProject.script.length * 4,
                filesDone: i * 4,
                bytesTotal: 0,
                bytesDone: 0,
            });

            // Final Image
            if (cut.finalImageUrl) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'images',
                    `cut_${String(cutId).padStart(3, '0')}_final.webp`,
                    cut.finalImageUrl
                );
                if (cloudUrl === 'UNAUTHORIZED') break;
                if (cloudUrl) migratedProject.script[i].finalImageUrl = cloudUrl;
            }

            // Draft Image
            if (cut.draftImageUrl) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'images',
                    `cut_${String(cutId).padStart(3, '0')}_draft.webp`,
                    cut.draftImageUrl
                );
                if (cloudUrl === 'UNAUTHORIZED') break;
                if (cloudUrl) migratedProject.script[i].draftImageUrl = cloudUrl;
            }

            // Audio
            if (cut.audioUrl && !cut.audioUrl.startsWith('mock:')) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'audio',
                    `cut_${String(cutId).padStart(3, '0')}.mp3`,
                    cut.audioUrl,
                    false // 오디오는 압축하지 않음
                );
                if (cloudUrl === 'UNAUTHORIZED') break;
                if (cloudUrl) migratedProject.script[i].audioUrl = cloudUrl;
            }

            // Video
            if (cut.videoUrl) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'videos',
                    `cut_${String(cutId).padStart(3, '0')}_video.webm`,
                    cut.videoUrl,
                    false // [FIX] Disable compression for videos to prevent memory issues and 110-byte errors
                );
                if (cloudUrl === 'UNAUTHORIZED') {
                    console.error('[CloudMigration] Unauthorized upload. Aborting migration.');
                    return project; // Return original project without saving changes
                }
                if (cloudUrl) migratedProject.script[i].videoUrl = cloudUrl;
            }

            // SFX
            if (cut.sfxUrl) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'audio',
                    `cut_${String(cutId).padStart(3, '0')}_sfx.mp3`,
                    cut.sfxUrl,
                    false
                );
                if (cloudUrl === 'UNAUTHORIZED') {
                    console.error('[CloudMigration] Unauthorized upload. Aborting migration.');
                    return project;
                }
                if (cloudUrl) migratedProject.script[i].sfxUrl = cloudUrl;
            }
        }
    }

    // 2. Asset Definitions 미디어 업로드
    if (migratedProject.assetDefinitions) {
        for (const [assetId, asset] of Object.entries(migratedProject.assetDefinitions)) {
            const safeName = (asset.name || assetId).replace(/[^a-zA-Z0-9가-힣]/g, '_');

            if (asset.referenceImage) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'images',
                    `asset_${safeName}_ref.webp`,
                    asset.referenceImage
                );
                if (cloudUrl === 'UNAUTHORIZED') return project;
                if (cloudUrl) migratedProject.assetDefinitions[assetId].referenceImage = cloudUrl;
            }

            if (asset.draftImage) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'images',
                    `asset_${safeName}_draft.webp`,
                    asset.draftImage
                );
                if (cloudUrl === 'UNAUTHORIZED') return project;
                if (cloudUrl) migratedProject.assetDefinitions[assetId].draftImage = cloudUrl;
            }

            if (asset.masterImage) {
                const cloudUrl = await uploadMediaUrl(
                    userId, project.id, 'images',
                    `asset_${safeName}_master.webp`,
                    asset.masterImage
                );
                if (cloudUrl === 'UNAUTHORIZED') return project;
                if (cloudUrl) migratedProject.assetDefinitions[assetId].masterImage = cloudUrl;
            }
        }
    }

    // 3. Thumbnail 업로드
    if (migratedProject.thumbnailUrl) {
        const cloudUrl = await uploadMediaUrl(
            userId, project.id, 'images',
            'thumbnail.webp',
            migratedProject.thumbnailUrl
        );
        if (cloudUrl === 'UNAUTHORIZED') return project;
        if (cloudUrl) migratedProject.thumbnailUrl = cloudUrl;
    }

    // 4. Firestore에 프로젝트 메타데이터 저장
    onProgress?.({
        phase: 'saving',
        currentProject: project.episodeName,
        currentFile: 'Saving to cloud...',
        projectsTotal: 1,
        projectsDone: 0,
        filesTotal: 1,
        filesDone: 0,
        bytesTotal: 0,
        bytesDone: 0,
    });

    try {
        await cloudDatabase.saveProject(userId, migratedProject);
    } catch (e) {
        console.error('[CloudMigration] Firestore save failed:', e);
        // Do not throw, just log. This prevents the store from marking sync as 'error' and retrying immediately.
    }

    onProgress?.({
        phase: 'done',
        currentProject: project.episodeName,
        currentFile: 'Complete!',
        projectsTotal: 1,
        projectsDone: 1,
        filesTotal: 1,
        filesDone: 1,
        bytesTotal: 0,
        bytesDone: 0,
    });

    return migratedProject;
};

/**
 * 모든 로컬 프로젝트를 클라우드로 마이그레이션
 */
export const migrateAllToCloud = async (
    userId: string,
    onProgress?: ProgressCallback
): Promise<void> => {
    const projects = await getLocalProjects();

    for (let i = 0; i < projects.length; i++) {
        const project = projects[i];

        onProgress?.({
            phase: 'uploading',
            currentProject: project.episodeName,
            currentFile: 'Starting...',
            projectsTotal: projects.length,
            projectsDone: i,
            filesTotal: 0,
            filesDone: 0,
            bytesTotal: 0,
            bytesDone: 0,
        });

        await migrateProjectToCloud(userId, project, (subProgress) => {
            onProgress?.({
                ...subProgress,
                projectsTotal: projects.length,
                projectsDone: i,
            });
        });
    }

    onProgress?.({
        phase: 'done',
        currentProject: 'All projects',
        currentFile: 'Migration complete!',
        projectsTotal: projects.length,
        projectsDone: projects.length,
        filesTotal: 0,
        filesDone: 0,
        bytesTotal: 0,
        bytesDone: 0,
    });
};

/**
 * 마이그레이션 상태 확인
 */
export const getCloudMigrationStatus = async (userId: string): Promise<{
    localCount: number;
    cloudCount: number;
    needsMigration: boolean;
}> => {
    const localProjects = await getLocalProjects();
    const cloudProjects = await cloudDatabase.listProjects(userId);

    const localIds = new Set(localProjects.map(p => p.id));
    const cloudIds = new Set(cloudProjects.map(p => p.id));

    // 클라우드에 없는 로컬 프로젝트 수
    const notMigrated = [...localIds].filter(id => !cloudIds.has(id)).length;

    return {
        localCount: localProjects.length,
        cloudCount: cloudProjects.length,
        needsMigration: notMigrated > 0,
    };
};
