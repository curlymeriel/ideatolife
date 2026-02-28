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
    signInWithRedirect,
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
        if (!isConfigured || !auth || isAuthInitialized.current) {
            if (!isConfigured || !auth) setLoading(false);
            return;
        }

        isAuthInitialized.current = true;
        console.log('[Auth] Initializing Auth State (Redirect Mode)...');

        // 안전 장치: 인증 상태 확인이 너무 오래 걸릴 경우 로딩 해제 (10초)
        const timeoutId = setTimeout(() => {
            console.warn('[Auth] Auth initialization safety timeout reached.');
            setLoading(false);
        }, 10000);

        const handleRedirectResult = async () => {
            try {
                console.log('[Auth] Checking getRedirectResult...');
                const result = await getRedirectResult(auth!);
                if (result) {
                    console.log('[Auth] Redirect sign-in success:', result.user.email);
                    setUser(result.user);
                }
            } catch (error: any) {
                console.error('[Auth] Redirect sign-in error:', error.code, error.message);
                if (error.code === 'auth/unauthorized-domain') {
                    setError('이 도메인은 Firebase 콘솔에서 승인이 필요합니다.');
                } else {
                    setError(`로그인 처리 중 오류: ${error.message}`);
                }
            }
        };

        handleRedirectResult();

        const unsubscribe = onAuthStateChanged(
            auth!,
            (user) => {
                console.log('[Auth] onAuthStateChanged:', user ? user.email : 'null');
                setUser(user);
                setLoading(false);
                setError(null);
                clearTimeout(timeoutId);
            },
            (error) => {
                console.error('[Auth] onAuthStateChanged Error:', error);
                setError(error.message);
                setLoading(false);
                clearTimeout(timeoutId);
            }
        );

        return () => {
            unsubscribe();
            clearTimeout(timeoutId);
        };
    }, [isConfigured]);

    // 리다이렉트 방식 로그인 (FFmpeg 보안 헤더 COOP와 공존 가능한 유일한 방식)
    const signInWithGoogle = async (): Promise<void> => {
        if (!isConfigured || !auth || !googleProvider) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        try {
            console.log('[Auth] Starting Google Sign-In (Redirect Mode)...');
            setError(null);
            setLoading(true);
            await signInWithRedirect(auth!, googleProvider!);
        } catch (error: any) {
            console.error('[Auth] Google sign-in error:', error.code, error.message);
            setError(`로그인 시작 실패: ${error.message}`);
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
