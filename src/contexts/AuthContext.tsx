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
        console.log('[Auth] Initializing Auth State...');

        // 안전 장치: 인증 상태 확인이 너무 오래 걸릴 경우 로딩 해제 (10초)
        const timeoutId = setTimeout(() => {
            console.warn('[Auth] Auth initialization safety timeout reached.');
            setLoading(false);
        }, 10000);

        // Removed handleRedirect logic

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
    }, [isConfigured]); // loading 제거하여 루프 방지

    // 팝업 방식 로그인 (vercel.json의 same-origin-allow-popups 설정으로 COOP 호환)
    const signInWithGoogle = async (): Promise<void> => {
        if (!isConfigured || !auth || !googleProvider) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        try {
            console.log('[Auth] Starting Google Sign-In (Popup)...');
            setError(null);
            setLoading(true);
            const result = await signInWithPopup(auth!, googleProvider!);
            console.log('[Auth] Popup sign-in success:', result.user.email);
            // onAuthStateChanged에서 처리되지만 즉각적인 피드백을 위해 set
            setUser(result.user);
        } catch (error: any) {
            console.error('[Auth] Google sign-in error:', error.code, error.message);
            if (error.code === 'auth/popup-closed-by-user') {
                setError('로그인이 취소되었습니다.');
            } else if (error.code === 'auth/popup-blocked') {
                setError('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
            } else if (error.code === 'auth/unauthorized-domain') {
                setError('이 도메인은 Firebase 콘솔에서 승인이 필요합니다.');
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
