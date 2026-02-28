/**
 * Firebase Configuration
 * 
 * Firebase 초기화 및 서비스 인스턴스를 제공합니다.
 * 사용자는 Firebase 콘솔에서 프로젝트를 생성하고,
 * 환경 변수를 설정해야 합니다.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Firebase 설정
// 배포 환경에서는 동일 도메인 프록시(/__/auth)를 사용하기 위해 authDomain을 현재 호스트로 설정합니다.
const isProduction = typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1');

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: isProduction ? window.location.hostname : (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ''),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Firebase 설정 여부 확인
export const isFirebaseConfigured = (): boolean => {
    return !!(
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId
    );
};

// Firebase 앱 초기화 (설정이 있을 때만)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured()) {
    try {
        app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        googleProvider = new GoogleAuthProvider();
        googleProvider.setCustomParameters({
            prompt: 'select_account'
        });
        console.log('[Firebase] Successfully initialized');
    } catch (error) {
        console.error('[Firebase] Initialization failed:', error);
    }
} else {
    console.log('[Firebase] Not configured, running in local-only mode');
}

export { app, auth, db, storage, googleProvider };
export default app;

