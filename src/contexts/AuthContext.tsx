/**
 * Authentication Context
 * 
 * Firebase 인증 상태를 관리하고 앱 전체에서 사용할 수 있도록 합니다.
 * coi-serviceworker를 사용하여 COOP 헤더와 팝업 인증이 호환됩니다.
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
    signInWithPopup,
    getRedirectResult,
    signOut as firebaseSignOut,
    onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    isConfigured: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isConfigured = isFirebaseConfigured();

    const isAuthInitialized = useRef(false);

    useEffect(() => {
        if (!isConfigured || !auth) {
            setLoading(false);
            return;
        }

        const version = '2026-02-28-V6';
        console.log(`[Auth] VERSION: ${version} - Initializing...`);

        // 1. 상태 감시 리스너
        const unsubscribe = onAuthStateChanged(
            auth!,
            (user) => {
                console.log('[Auth] V6 - onAuthStateChanged:', user ? user.email : 'null');
                setUser(user);
                setLoading(false);
                setError(null);
            },
            (error) => {
                console.error('[Auth] V6 - onAuthStateChanged Error:', error);
                setError(error.message);
                setLoading(false);
            }
        );

        // 2. 혹시나 진행 중인 리다이렉트 결과가 있다면 처리 (백업용)
        if (!isAuthInitialized.current) {
            isAuthInitialized.current = true;
            getRedirectResult(auth!).then((result) => {
                if (result) {
                    console.log('[Auth] V6 - Found redirect result:', result.user.email);
                    setUser(result.user);
                }
            }).catch(err => {
                console.error('[Auth] V6 - Redirect check error:', err);
            });
        }

        return () => unsubscribe();
    }, [isConfigured]);

    // 통합 로그인 방식 (Proxy 덕분에 로컬/배포 모두 Popup 가능!)
    const signInWithGoogle = async (): Promise<void> => {
        if (!isConfigured || !auth || !googleProvider) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        try {
            console.log('[Auth] V6 - Starting Google Sign-In (Popup Mode)...');
            setError(null);
            setLoading(true);

            // 동일 도메인 프록시가 설정되어 있어 COOP/COEP 환경에서도 팝업이 작동합니다.
            const result = await signInWithPopup(auth!, googleProvider!);
            console.log('[Auth] V6 - Success:', result.user.email);
            setUser(result.user);
        } catch (error: any) {
            console.error('[Auth] V6 - Error:', error.code, error.message);
            if (error.code === 'auth/popup-closed-by-user') {
                setError('로그인이 취소되었습니다.');
            } else if (error.code === 'auth/popup-blocked') {
                setError('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
            } else if (error.code === 'auth/cancelled-popup-request') {
                console.log('[Auth] Popup request cancelled (Handled).');
            } else {
                setError(`로그인 실패: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const signOut = async (): Promise<void> => {
        if (!auth) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        try {
            setError(null);
            await firebaseSignOut(auth!);
        } catch (error: any) {
            console.error('Sign out error:', error);
            setError(error.message || '로그아웃에 실패했습니다.');
        }
    };

    const value: AuthContextType = {
        user,
        loading,
        error,
        isConfigured,
        signInWithGoogle,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
