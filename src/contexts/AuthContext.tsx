/**
 * Authentication Context
 * 
 * Firebase 인증 상태를 관리하고 앱 전체에서 사용할 수 있도록 합니다.
 * coi-serviceworker를 사용하여 COOP 헤더와 팝업 인증이 호환됩니다.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
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

    useEffect(() => {
        if (!isConfigured || !auth) {
            setLoading(false);
            return;
        }

        console.log('[Auth] Setting up auth state listener...');

        // 리다이렉트 로그인 결과 확인
        getRedirectResult(auth!).catch((error) => {
            console.error('[Auth] Redirect sign-in error:', error);
            setError(`로그인 실패: ${error.message}`);
        });

        const unsubscribe = onAuthStateChanged(
            auth!,
            (user) => {
                console.log('[Auth] State changed. User:', user ? user.email : 'null');
                setUser(user);
                setLoading(false);
                setError(null);
            },
            (error) => {
                console.error('[Auth] State change error:', error);
                setError(error.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [isConfigured]);

    // 리다이렉트 방식 로그인 (coi-serviceworker COOP 호환성 처리)
    const signInWithGoogle = async (): Promise<void> => {
        if (!isConfigured || !auth || !googleProvider) {
            setError('Firebase가 설정되지 않았습니다.');
            return;
        }

        try {
            console.log('[Auth] Starting Google Sign-In (Redirect)...');
            setError(null);
            setLoading(true);
            await signInWithRedirect(auth!, googleProvider!);
        } catch (error: any) {
            console.error('[Auth] Google sign-in redirect start error:', error);
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
