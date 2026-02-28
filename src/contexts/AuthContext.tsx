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

        console.log('[Auth] Initializing Auth State...');

        // 안전 장치: 리다이렉트 처리가 너무 오래 걸릴 경우 로딩 해제 (8초)
        const timeoutId = setTimeout(() => {
            // `loading` state를 직접 참조하는 대신, 이 시점에서 `loading`이 여전히 `true`인지 확인
            // `setLoading`은 비동기적일 수 있으므로, `loading`의 최신 값을 보장하기 위해
            // `useState`의 함수형 업데이트를 사용하거나, `loading`을 의존성 배열에 추가해야 하지만,
            // 여기서는 단순히 `loading`이 `true`일 때만 경고를 띄우고 `setLoading(false)`를 호출합니다.
            // `onAuthStateChanged`나 `handleRedirect`에서 `clearTimeout`이 호출되지 않았다면
            // 이 블록이 실행될 것입니다.
            if (loading) {
                console.warn('[Auth] Login check timeout reached. Forcing loading to false.');
                setLoading(false);
            }
        }, 8000);

        const handleRedirect = async () => {
            try {
                console.log('[Auth] Checking redirect result...');
                const result = await getRedirectResult(auth!);
                if (result) {
                    console.log('[Auth] Redirect login success:', result.user.email);
                    setUser(result.user);
                } else {
                    console.log('[Auth] No redirect result found (Normal access or already handled).');
                }
            } catch (error: any) {
                console.error('[Auth] Redirect sign-in error:', error.code, error.message);
                setError(`로그인 처리 중 오류: ${error.message}`);
            } finally {
                // 특정 케이스에서 onAuthStateChanged보다 늦게 끝날 수 있으므로 체크 후 해제
                clearTimeout(timeoutId);
                // 실시간 리스너가 처리할 것이므로 일단 로딩은 유지하되, 
                // 결과가 없었다면 초기 로딩을 여기서 마무리할 수도 있음
            }
        };

        handleRedirect();

        const unsubscribe = onAuthStateChanged(
            auth!,
            (user) => {
                console.log('[Auth] State changed. User:', user ? user.email : 'null');
                setUser(user);
                setLoading(false);
                setError(null);
                clearTimeout(timeoutId);
            },
            (error) => {
                console.error('[Auth] State change error:', error);
                setError(error.message);
                setLoading(false);
                clearTimeout(timeoutId);
            }
        );

        return () => {
            unsubscribe();
            clearTimeout(timeoutId);
        };
    }, [isConfigured, loading]); // `loading`을 의존성 배열에 추가하여 `setTimeout` 내부에서 최신 값을 참조하도록 함

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
