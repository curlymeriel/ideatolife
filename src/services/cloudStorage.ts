/**
 * Cloud Storage Service
 * 
 * Firebase Storage를 통해 이미지, 오디오, 비디오 파일을 관리합니다.
 */

import {
    ref,
    uploadBytes,
    uploadString,
    getDownloadURL,
    deleteObject,
    listAll,
    getMetadata,
} from 'firebase/storage';
import { storage } from '../lib/firebase';

export type MediaType = 'images' | 'audio' | 'videos';

interface UploadOptions {
    contentType?: string;
    customMetadata?: Record<string, string>;
}

interface UploadResult {
    path: string;
    downloadUrl: string;
    size: number;
}

/**
 * 사용자 미디어 파일의 Storage 경로 생성
 */
const getStoragePath = (
    userId: string,
    projectId: string,
    mediaType: MediaType,
    fileName: string
): string => {
    return `users/${userId}/projects/${projectId}/${mediaType}/${fileName}`;
};

/**
 * Blob 또는 File을 Firebase Storage에 업로드
 */
export const uploadFile = async (
    userId: string,
    projectId: string,
    mediaType: MediaType,
    fileName: string,
    data: Blob | File,
    options: UploadOptions = {}
): Promise<UploadResult> => {
    const path = getStoragePath(userId, projectId, mediaType, fileName);
    const storageRef = ref(storage, path);

    const metadata = {
        contentType: options.contentType || data.type,
        customMetadata: options.customMetadata,
    };

    const snapshot = await uploadBytes(storageRef, data, metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    console.log(`[CloudStorage] Uploaded: ${path} (${snapshot.metadata.size} bytes)`);

    return {
        path,
        downloadUrl,
        size: snapshot.metadata.size || 0,
    };
};

/**
 * Base64 문자열을 Firebase Storage에 업로드
 */
export const uploadBase64 = async (
    userId: string,
    projectId: string,
    mediaType: MediaType,
    fileName: string,
    base64Data: string,
    options: UploadOptions = {}
): Promise<UploadResult> => {
    const path = getStoragePath(userId, projectId, mediaType, fileName);
    const storageRef = ref(storage, path);

    // Base64 데이터에서 실제 데이터 부분만 추출
    const base64Content = base64Data.includes(',')
        ? base64Data.split(',')[1]
        : base64Data;

    const metadata = {
        contentType: options.contentType || 'application/octet-stream',
        customMetadata: options.customMetadata,
    };

    const snapshot = await uploadString(storageRef, base64Content, 'base64', metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    console.log(`[CloudStorage] Uploaded Base64: ${path}`);

    return {
        path,
        downloadUrl,
        size: snapshot.metadata.size || 0,
    };
};

/**
 * Data URL을 Firebase Storage에 업로드
 */
export const uploadDataUrl = async (
    userId: string,
    projectId: string,
    mediaType: MediaType,
    fileName: string,
    dataUrl: string,
    options: UploadOptions = {}
): Promise<UploadResult> => {
    const path = getStoragePath(userId, projectId, mediaType, fileName);
    const storageRef = ref(storage, path);

    // Data URL에서 contentType 추출
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    const contentType = match ? match[1] : 'application/octet-stream';

    const metadata = {
        contentType: options.contentType || contentType,
        customMetadata: options.customMetadata,
    };

    const snapshot = await uploadString(storageRef, dataUrl, 'data_url', metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    console.log(`[CloudStorage] Uploaded DataURL: ${path}`);

    return {
        path,
        downloadUrl,
        size: snapshot.metadata.size || 0,
    };
};

/**
 * 파일 다운로드 URL 획득
 */
export const getFileUrl = async (path: string): Promise<string> => {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
};

/**
 * 파일 삭제
 */
export const deleteFile = async (path: string): Promise<void> => {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    console.log(`[CloudStorage] Deleted: ${path}`);
};

/**
 * 프로젝트의 모든 미디어 파일 삭제
 */
export const deleteProjectMedia = async (
    userId: string,
    projectId: string
): Promise<void> => {
    const basePath = `users/${userId}/projects/${projectId}`;
    const mediaTypes: MediaType[] = ['images', 'audio', 'videos'];

    for (const mediaType of mediaTypes) {
        const folderRef = ref(storage, `${basePath}/${mediaType}`);
        try {
            const result = await listAll(folderRef);
            await Promise.all(result.items.map(item => deleteObject(item)));
            console.log(`[CloudStorage] Deleted all ${mediaType} for project ${projectId}`);
        } catch (error) {
            // 폴더가 없으면 무시
            console.log(`[CloudStorage] No ${mediaType} folder for project ${projectId}`);
        }
    }
};

/**
 * 프로젝트 용량 계산
 */
export const getProjectStorageSize = async (
    userId: string,
    projectId: string
): Promise<number> => {
    const basePath = `users/${userId}/projects/${projectId}`;
    const mediaTypes: MediaType[] = ['images', 'audio', 'videos'];
    let totalSize = 0;

    for (const mediaType of mediaTypes) {
        const folderRef = ref(storage, `${basePath}/${mediaType}`);
        try {
            const result = await listAll(folderRef);
            for (const item of result.items) {
                const metadata = await getMetadata(item);
                totalSize += metadata.size;
            }
        } catch (error) {
            // 폴더가 없으면 무시
        }
    }

    return totalSize;
};

/**
 * 사용자 전체 용량 계산
 */
export const getUserStorageSize = async (userId: string): Promise<number> => {
    const basePath = `users/${userId}/projects`;
    const projectsRef = ref(storage, basePath);
    let totalSize = 0;

    try {
        const result = await listAll(projectsRef);
        for (const prefix of result.prefixes) {
            const projectId = prefix.name;
            const projectSize = await getProjectStorageSize(userId, projectId);
            totalSize += projectSize;
        }
    } catch (error) {
        console.error('[CloudStorage] Error calculating user storage:', error);
    }

    return totalSize;
};

/**
 * 용량을 읽기 쉬운 형식으로 변환
 */
export const formatStorageSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
