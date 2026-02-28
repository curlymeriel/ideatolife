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
        if (!isConfigured || !auth) {
            setLoading(false);
            return;
        }

        const version = '2026-02-28-V4'; // 버전 마커 추가
        console.log(`[Auth] VERSION: ${version} - Setting up listener...`);

        // 1. 상태 감시 (항상 실행)
        const unsubscribe = onAuthStateChanged(
            auth!,
            (user) => {
                console.log('[Auth] onAuthStateChanged firing:', user ? user.email : 'null');
                setUser(user);
                setLoading(false);
                setError(null);
            },
            (error) => {
                console.error('[Auth] onAuthStateChanged Error:', error);
                setError(error.message);
                setLoading(false);
            }
        );

        // 2. 초기 리다이렉트 결과 체크 (딱 한 번)
        if (!isAuthInitialized.current) {
            isAuthInitialized.current = true;
            console.log('[Auth] Starting V4 initialization flow...');

            // 안전 장치: initialization이 너무 길어지면 강제 해제
            const timeoutId = setTimeout(() => {
                console.warn('[Auth] V4 - initialization safety timeout reached.');
                setLoading(false);
            }, 12000);

            const checkRedirect = async () => {
                try {
                    console.log('[Auth] getRedirectResult: Start');
                    const result = await getRedirectResult(auth!);
                    if (result) {
                        console.log('[Auth] getRedirectResult: Found User', result.user.email);
                        setUser(result.user);
                    } else {
                        console.log('[Auth] getRedirectResult: No pending redirect result');
                    }
                } catch (error: any) {
                    console.error('[Auth] getRedirectResult Exception:', error.code, error.message);
                    if (error.code === 'auth/unauthorized-domain') {
                        setError('Firebase Console에서 이 도메인을 승인해야 합니다.');
                    }
                } finally {
                    clearTimeout(timeoutId);
                    // result가 없더라도 onAuthStateChanged가 최종적으로 setLoading(false)를 할 것임
                }
            };

            checkRedirect();
        }

        return () => {
            console.log('[Auth] Cleaning up listener...');
            unsubscribe();
        };
    }, [isConfigured]);

    // 하이브리드 로그인 방식 (Localhost: Popup, Production: Redirect)
    const signInWithGoogle = async (): Promise<void> => {
        if (!isConfigured || !auth || !googleProvider) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        const isLocalhost =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        try {
            setError(null);
            setLoading(true);

            if (isLocalhost) {
                console.log('[Auth] Starting Google Sign-In (Popup Mode for local)...');
                const result = await signInWithPopup(auth!, googleProvider!);
                console.log('[Auth] Popup sign-in success:', result.user.email);
                setUser(result.user);
            } else {
                console.log('[Auth] Starting Google Sign-In (Redirect Mode for production)...');
                await signInWithRedirect(auth!, googleProvider!);
            }
        } catch (error: any) {
            console.error('[Auth] Google sign-in error:', error.code, error.message);
            if (error.code === 'auth/popup-closed-by-user') {
                setError('로그인이 취소되었습니다.');
            } else if (error.code === 'auth/popup-blocked') {
                setError('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
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
