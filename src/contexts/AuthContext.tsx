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

        const version = '2026-02-28-V5';
        console.log(`[Auth] VERSION: ${version} - Initializing...`);

        // 1. 서비스 워커가 리다이렉트를 방해할 수 있으므로 미사용 서비스 워커 제거
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    console.log('[Auth] Cleaning up stale service worker:', registration.scope);
                    registration.unregister();
                }
            });
        }

        // 2. 인증 상태 리스너 내부 로직
        const setupListener = () => {
            return onAuthStateChanged(
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
        };

        // 3. 리다이렉트 결과 체크 및 리스너 등록 (순서 제어)
        if (!isAuthInitialized.current) {
            isAuthInitialized.current = true;
            console.log('[Auth] Starting V5 verification flow...');

            const initAuth = async () => {
                try {
                    console.log('[Auth] V5 - getRedirectResult START');
                    const result = await getRedirectResult(auth!);
                    if (result) {
                        console.log('[Auth] V5 - Found redirected user:', result.user.email);
                        setUser(result.user);
                    } else {
                        console.log('[Auth] V5 - No pending redirect result found.');
                    }
                } catch (error: any) {
                    console.error('[Auth] V5 - Redirect Error:', error.code, error.message);
                    if (error.code === 'auth/unauthorized-domain') {
                        setError('Firebase Console에서 이 도메인(Vercel)을 승인해야 합니다.');
                    }
                } finally {
                    console.log('[Auth] V5 - Initial check complete, setting up listener.');
                    setupListener();
                }
            };

            initAuth();
        } else {
            // StrictMode 리마운트 시 리스너 재설정
            const unsubscribe = setupListener();
            return () => unsubscribe();
        }
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
                console.log('[Auth] V5 - Starting Login (Popup Mode)...');
                const result = await signInWithPopup(auth!, googleProvider!);
                console.log('[Auth] V5 - Popup success:', result.user.email);
                setUser(result.user);
            } else {
                console.log('[Auth] V5 - Starting Login (Redirect Mode)...');
                // 리다이렉트 전 명시적으로 상태를 비울 수도 있음
                await signInWithRedirect(auth!, googleProvider!);
            }
        } catch (error: any) {
            console.error('[Auth] V5 - Login Error:', error.code, error.message);
            if (error.code === 'auth/popup-closed-by-user') {
                setError('로그인이 취소되었습니다.');
            } else {
                setError(`로그인 실패: ${error.message}`);
            }
        } finally {
            // 리다이렉트 방식에서는 페이지가 이동되므로 finally가 큰 의미가 없으나, 팝업 방식에서는 필수
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
