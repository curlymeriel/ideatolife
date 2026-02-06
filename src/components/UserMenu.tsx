/**
 * User Menu Component
 * 
 * 로그인된 사용자 정보, 동기화 상태, 로그아웃 버튼을 표시합니다.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { migrateAllToCloud } from '../utils/cloudMigration';
import { LogOut, User, Cloud, CloudOff, Loader2, Settings, CloudUpload } from 'lucide-react';

interface UserMenuProps {
    syncStatus?: 'synced' | 'syncing' | 'offline' | 'error';
    onOpenSettings?: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({
    syncStatus = 'synced',
    onOpenSettings,
}) => {
    const { user, signOut, isConfigured, signInWithGoogle, error, loading } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // 외부 클릭 시 메뉴 닫기
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Firebase 미설정 시
    if (!isConfigured) {
        return null;
    }

    // 로딩 중 표시
    if (loading) {
        return (
            <div className="flex items-center justify-center p-2">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
        );
    }

    // 미로그인 시 로그인 버튼 표시
    if (!user) {
        return (
            <div className="flex flex-col items-end gap-1">
                <button
                    onClick={signInWithGoogle}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-black font-bold hover:bg-[var(--color-primary)]/90 transition-colors text-xs"
                >
                    <Cloud className="w-4 h-4" />
                    <span>Google Login</span>
                </button>
                <div className="flex flex-col items-end mr-1">
                    <span className="text-[10px] text-purple-400 font-medium">클라우드 동기화로</span>
                    <span className="text-[10px] text-gray-500">어디서든 작업하세요</span>
                </div>
                {error && (
                    <span className="text-[10px] text-red-500 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 max-w-[200px] break-words text-right">
                        {error}
                    </span>
                )}
            </div>
        );
    }

    const getSyncIcon = () => {
        switch (syncStatus) {
            case 'synced':
                return <Cloud className="w-4 h-4 text-green-400" />;
            case 'syncing':
                return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
            case 'offline':
                return <CloudOff className="w-4 h-4 text-gray-500" />;
            case 'error':
                return <CloudOff className="w-4 h-4 text-red-400" />;
        }
    };

    const getSyncLabel = () => {
        switch (syncStatus) {
            case 'synced':
                return '동기화됨';
            case 'syncing':
                return '동기화 중...';
            case 'offline':
                return '오프라인';
            case 'error':
                return '동기화 오류';
        }
    };

    return (
        <div className="relative" ref={menuRef}>
            {/* 트리거 버튼 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
            >
                {/* 동기화 상태 */}
                {getSyncIcon()}

                {/* 프로필 이미지 */}
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-7 h-7 rounded-full border border-gray-600"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                    </div>
                )}
            </button>

            {/* 드롭다운 메뉴 */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-xl shadow-xl border border-gray-700 py-2 z-50">
                    {/* 사용자 정보 */}
                    <div className="px-4 py-3 border-b border-gray-700">
                        <div className="flex items-center gap-3">
                            {user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt={user.displayName || 'User'}
                                    className="w-10 h-10 rounded-full"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                                    <User className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                    {user.displayName || 'User'}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                    {user.email}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 동기화 상태 */}
                    <div className="px-4 py-2 flex items-center gap-2 text-sm text-gray-300">
                        {getSyncIcon()}
                        <span>{getSyncLabel()}</span>
                    </div>

                    {/* 메뉴 항목 */}
                    {onOpenSettings && (
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                onOpenSettings();
                            }}
                            className="w-full px-4 py-2 flex items-center gap-3 text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                            설정
                        </button>
                    )}

                    <button
                        onClick={() => {
                            setIsOpen(false);
                            signOut();
                        }}
                        className="w-full px-4 py-2 flex items-center gap-3 text-sm text-red-400 hover:bg-gray-700/50 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        로그아웃
                    </button>

                    {/* Migration Action */}
                    <div className="border-t border-gray-700 mt-2 pt-2 px-2">
                        <button
                            onClick={async () => {
                                if (isMigrating) return;
                                setIsMigrating(true);
                                try {
                                    // Don't close menu immediately so we can show loading state if desired, 
                                    // but better to rely on global feedback. For now, just alert on completion.
                                    setIsOpen(false);
                                    await migrateAllToCloud(user.uid, (p) => {
                                        console.log(`[Migration] ${p.phase}: ${p.currentFile}`);
                                    });
                                    alert("All local projects synced to cloud!");
                                } catch (e) {
                                    console.error("Migration failed:", e);
                                    alert("Migration failed. Check console.");
                                } finally {
                                    setIsMigrating(false);
                                }
                            }}
                            disabled={isMigrating}
                            className="w-full px-2 py-2 flex items-center gap-3 text-xs text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                            {isMigrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
                            Sync All to Cloud
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserMenu;
