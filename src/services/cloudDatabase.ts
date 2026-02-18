/**
 * Cloud Database Service
 * 
 * Firestore를 통해 프로젝트 메타데이터를 관리합니다.
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { ProjectData, ProjectMetadata } from '../store/types';
import { sanitizeFirestoreData } from '../utils/firebaseUtils';

// Firestore 컬렉션 경로
const getUserProjectsPath = (userId: string) => `users/${userId}/projects`;

const getDb = () => {
    if (!db) throw new Error("Firebase DB not initialized");
    return db;
};


/**
 * 프로젝트 목록 조회
 */
export const listProjects = async (userId: string): Promise<ProjectMetadata[]> => {
    const projectsRef = collection(getDb(), getUserProjectsPath(userId));
    const q = query(projectsRef, orderBy('lastModified', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            seriesName: data.seriesName || '',
            episodeName: data.episodeName || '',
            episodeNumber: data.episodeNumber || 1,
            lastModified: data.lastModified?.toMillis?.() || data.lastModified || Date.now(),
            thumbnailUrl: data.thumbnailUrl || null,
            cachedProgress: data.cachedProgress,
            currentStep: data.currentStep,
        } as ProjectMetadata;
    });
};

/**
 * 프로젝트 저장 (전체)
 */

export const saveProject = async (
    userId: string,
    projectData: ProjectData
): Promise<void> => {
    const projectRef = doc(getDb(), getUserProjectsPath(userId), projectData.id);

    // Firestore에 저장할 데이터 준비
    // [FIX] Exclude apiKeys and ensure userId is present for security rules
    const { apiKeys, ...restOfProjectData } = projectData;

    const firestoreData = sanitizeFirestoreData({
        ...restOfProjectData,
        userId, // [CRITICAL] Rules often check for this field
        lastModified: serverTimestamp(),
    });

    try {
        await setDoc(projectRef, firestoreData, { merge: true });
        console.log(`[CloudDB] Saved project: ${projectData.id}`);
    } catch (error: any) {
        console.error(`[CloudDB] setDoc FAILED: ${error.code} - ${error.message}`);
        throw error;
    }
};

/**
 * 프로젝트 메타데이터만 업데이트 (빠른 저장)
 */
export const updateProjectMetadata = async (
    userId: string,
    projectId: string,
    metadata: Partial<ProjectMetadata>
): Promise<void> => {
    const projectRef = doc(getDb(), getUserProjectsPath(userId), projectId);

    await updateDoc(projectRef, {
        ...metadata,
        lastModified: serverTimestamp(),
    });
    console.log(`[CloudDB] Updated metadata for project: ${projectId}`);
};

/**
 * 프로젝트 로드
 */
export const loadProject = async (
    userId: string,
    projectId: string
): Promise<ProjectData | null> => {
    const projectRef = doc(getDb(), getUserProjectsPath(userId), projectId);
    const snapshot = await getDoc(projectRef);

    if (!snapshot.exists()) {
        console.log(`[CloudDB] Project not found: ${projectId}`);
        return null;
    }

    const data = snapshot.data();

    // Timestamp를 number로 변환
    const lastModified = data.lastModified instanceof Timestamp
        ? data.lastModified.toMillis()
        : data.lastModified || Date.now();

    return {
        ...data,
        id: snapshot.id,
        lastModified,
    } as ProjectData;
};

/**
 * 프로젝트 삭제
 */
export const deleteProject = async (
    userId: string,
    projectId: string
): Promise<void> => {
    const projectRef = doc(getDb(), getUserProjectsPath(userId), projectId);
    await deleteDoc(projectRef);
    console.log(`[CloudDB] Deleted project: ${projectId}`);
};

/**
 * 프로젝트 존재 여부 확인
 */
export const projectExists = async (
    userId: string,
    projectId: string
): Promise<boolean> => {
    const projectRef = doc(getDb(), getUserProjectsPath(userId), projectId);
    const snapshot = await getDoc(projectRef);
    return snapshot.exists();
};

/**
 * 사용자 설정 저장 (API 키 등)
 */
export const saveUserSettings = async (
    userId: string,
    settings: Record<string, any>
): Promise<void> => {
    const settingsRef = doc(getDb(), `users/${userId}/settings`, 'main');
    const sanitizedSettings = sanitizeFirestoreData(settings);

    await setDoc(settingsRef, {
        ...sanitizedSettings,
        updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[CloudDB] Saved user settings`);
};

/**
 * 사용자 설정 로드
 */
export const loadUserSettings = async (
    userId: string
): Promise<Record<string, any> | null> => {
    const settingsRef = doc(getDb(), `users/${userId}/settings`, 'main');
    const snapshot = await getDoc(settingsRef);

    if (!snapshot.exists()) {
        return null;
    }

    return snapshot.data();
};

/**
 * Intelligence Layer 데이터 저장 (트렌드, 전략 등)
 */
export const saveIntelligenceData = async (
    userId: string,
    dataType: 'trends' | 'competitors' | 'strategies' | 'ideas',
    data: any[]
): Promise<void> => {
    const dataRef = doc(getDb(), `users/${userId}/intelligence`, dataType);
    const sanitizedItems = sanitizeFirestoreData(data);

    await setDoc(dataRef, {
        items: sanitizedItems,
        updatedAt: serverTimestamp(),
    });
    console.log(`[CloudDB] Saved intelligence ${dataType}`);
};

/**
 * Intelligence Layer 데이터 로드
 */
export const loadIntelligenceData = async (
    userId: string,
    dataType: 'trends' | 'competitors' | 'strategies' | 'ideas'
): Promise<any[]> => {
    const dataRef = doc(getDb(), `users/${userId}/intelligence`, dataType);
    const snapshot = await getDoc(dataRef);

    if (!snapshot.exists()) {
        return [];
    }

    return snapshot.data()?.items || [];
};
