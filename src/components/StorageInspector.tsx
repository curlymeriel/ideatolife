import React, { useEffect, useState, useRef } from 'react';
import { keys as idbKeys, get as idbGet, del as idbDel } from 'idb-keyval';
import { useWorkflowStore } from '../store/workflowStore';
import { useNavigate } from 'react-router-dom';
import { Database, HardDrive, Download, RefreshCw, AlertTriangle, Upload, Trash2, Clock } from 'lucide-react';

interface StorageItem {
    key: string;
    type: 'localStorage' | 'indexedDB';
    size: string;
    sizeBytes: number;
    preview: string;
    timestamp?: number;
    isOrphan?: boolean;
    isBackup?: boolean;
    rawKey?: string;
}

interface StorageInspectorProps {
    isPage?: boolean;
}

export const StorageInspector: React.FC<StorageInspectorProps> = ({ isPage = false }) => {
    const [items, setItems] = useState<StorageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const { importData, savedProjects } = useWorkflowStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getPreviewInfo = (value: string): { preview: string; timestamp?: number } => {
        try {
            const parsed = JSON.parse(value);
            const state = parsed.state || parsed;
            const timestamp = state.lastModified || parsed.lastModified;

            if (state.savedProjects && Object.keys(state.savedProjects).length > 0) {
                const count = Object.keys(state.savedProjects).length;
                const names = Object.values(state.savedProjects).map((p: any) => p.seriesName).join(', ');
                return { preview: `Contains ${count} project(s): ${names}`, timestamp };
            }

            if (state.seriesName) {
                return {
                    preview: `Project: ${state.seriesName} - ${state.episodeName || 'Untitled'} (Step ${state.currentStep || '?'})`,
                    timestamp
                };
            }

            return { preview: "Unknown Data Format", timestamp };
        } catch {
            return { preview: "Raw Data (Not JSON)" };
        }
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return null;
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '오늘';
        if (diffDays === 1) return '어제';
        if (diffDays < 7) return `${diffDays}일 전`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const isOrphanedProject = (keyStr: string) => {
        if (!keyStr.includes('project-')) return false;
        const projectIdMatch = keyStr.match(/project-([a-zA-Z0-9-]+)/);
        if (!projectIdMatch) return false;
        const projectId = projectIdMatch[1];
        return !savedProjects || !savedProjects[projectId];
    };

    const scanStorage = async () => {
        setLoading(true);
        const foundItems: StorageItem[] = [];

        try {
            // 1. Scan LocalStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key) || '';
                    const isBackup = /backup/i.test(key);
                    const previewData = getPreviewInfo(value);
                    foundItems.push({
                        key: `LocalStorage: ${key}`,
                        type: 'localStorage',
                        size: formatSize(value.length),
                        sizeBytes: value.length,
                        preview: previewData.preview,
                        timestamp: previewData.timestamp,
                        isBackup,
                        rawKey: key,
                    });
                }
            }

            // 2. Scan SessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key) {
                    const value = sessionStorage.getItem(key) || '';
                    const isBackup = /backup/i.test(key);
                    const previewData = getPreviewInfo(value);
                    foundItems.push({
                        key: `SessionStorage: ${key}`,
                        type: 'localStorage',
                        size: formatSize(value.length),
                        sizeBytes: value.length,
                        preview: previewData.preview,
                        timestamp: previewData.timestamp,
                        isBackup,
                        rawKey: key,
                    });
                }
            }

            // 3. Scan IndexedDB
            if (window.indexedDB && window.indexedDB.databases) {
                const dbs = await window.indexedDB.databases();
                for (const dbInfo of dbs) {
                    if (!dbInfo.name) continue;

                    try {
                        const db = await new Promise<IDBDatabase>((resolve, reject) => {
                            const req = window.indexedDB.open(dbInfo.name!);
                            req.onsuccess = () => resolve(req.result);
                            req.onerror = () => reject(req.error);
                        });

                        for (const storeName of Array.from(db.objectStoreNames)) {
                            const transaction = db.transaction(storeName, 'readonly');
                            const store = transaction.objectStore(storeName);
                            const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
                                const req = store.getAllKeys();
                                req.onsuccess = () => resolve(req.result);
                                req.onerror = () => reject(req.error);
                            });

                            for (const key of keys) {
                                const value = await new Promise<any>((resolve, reject) => {
                                    const req = store.get(key);
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                });

                                let strValue = '';
                                if (typeof value === 'string') strValue = value;
                                else strValue = JSON.stringify(value);

                                const keyStr = String(key);
                                const isBackup = /backup/i.test(keyStr);
                                const isOrphan = isOrphanedProject(keyStr);
                                const previewData = getPreviewInfo(strValue);

                                foundItems.push({
                                    key: `DB: ${dbInfo.name} / Key: ${keyStr}`,
                                    type: 'indexedDB',
                                    size: formatSize(strValue.length),
                                    sizeBytes: strValue.length,
                                    preview: previewData.preview,
                                    timestamp: previewData.timestamp,
                                    isBackup,
                                    isOrphan,
                                    rawKey: keyStr,
                                });
                            }
                        }
                        db.close();
                    } catch (e) {
                        console.error(`Failed to read DB ${dbInfo.name}:`, e);
                    }
                }
            } else {
                const dbKeys = await idbKeys();
                for (const key of dbKeys) {
                    const raw = await idbGet(key);
                    const strValue = typeof raw === 'string' ? raw : JSON.stringify(raw);
                    const keyStr = String(key);
                    const isBackup = /backup/i.test(keyStr);
                    const isOrphan = isOrphanedProject(keyStr);
                    const previewData = getPreviewInfo(strValue);

                    foundItems.push({
                        key: `Default DB / Key: ${keyStr}`,
                        type: 'indexedDB',
                        size: formatSize(strValue.length),
                        sizeBytes: strValue.length,
                        preview: previewData.preview,
                        timestamp: previewData.timestamp,
                        isBackup,
                        isOrphan,
                        rawKey: keyStr,
                    });
                }
            }

            // Sort by size (largest first)
            foundItems.sort((a, b) => b.sizeBytes - a.sizeBytes);

        } catch (e) {
            console.error("Scan failed:", e);
        } finally {
            setItems(foundItems);
            setLoading(false);
        }
    };

    useEffect(() => {
        scanStorage();
    }, []);

    const handleLoad = async (item: StorageItem) => {
        if (!confirm(`이 데이터를 불러오시겠습니까?\n\n${item.key}\n\n현재 세션을 덮어씁니다.`)) return;

        try {
            let data: any;
            if (item.type === 'localStorage' && item.rawKey) {
                const raw = localStorage.getItem(item.rawKey);
                if (raw) data = raw;
            } else if (item.rawKey) {
                const raw = await idbGet(item.rawKey);
                data = typeof raw === 'string' ? raw : JSON.stringify(raw);
            }

            if (data) {
                importData(data);
            } else {
                alert("데이터를 읽을 수 없습니다.");
            }
        } catch (e: any) {
            alert(`불러오기 실패: ${e.message}`);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                importData(content);
            } catch (error) {
                alert('파일을 읽는 중 오류가 발생했습니다.');
                console.error('File upload error:', error);
            }
        };
        reader.readAsText(file);
    };

    const handleDelete = async (item: StorageItem) => {
        if (!confirm(`정말 삭제하시겠습니까?\n\n${item.key}\n\n이 작업은 되돌릴 수 없습니다.`)) return;

        try {
            if (item.type === 'localStorage' && item.rawKey) {
                localStorage.removeItem(item.rawKey);
            } else if (item.rawKey) {
                await idbDel(item.rawKey);
            }
            alert('삭제되었습니다.');
            scanStorage();
        } catch (e: any) {
            alert(`삭제 실패: ${e.message}`);
        }
    };

    const handleCleanupBackups = async () => {
        const backupItems = items.filter(item => item.isBackup);

        if (backupItems.length === 0) {
            alert('삭제할 백업 데이터가 없습니다.');
            return;
        }

        if (!confirm(`${backupItems.length}개의 백업 데이터를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;

        let deleted = 0;
        for (const item of backupItems) {
            try {
                if (item.rawKey) {
                    if (item.type === 'localStorage') {
                        localStorage.removeItem(item.rawKey);
                    } else {
                        await idbDel(item.rawKey);
                    }
                    deleted++;
                }
            } catch (e) {
                console.error('Failed to delete:', item.key, e);
            }
        }

        alert(`${deleted}개의 백업 데이터가 삭제되었습니다.`);
        scanStorage();
    };

    const handleCleanupOrphans = async () => {
        const orphanItems = items.filter(item => item.isOrphan);

        if (orphanItems.length === 0) {
            alert('삭제할 고아 프로젝트가 없습니다.');
            return;
        }

        if (!confirm(`${orphanItems.length}개의 고아 프로젝트를 삭제하시겠습니까?\n\n(대시보드에 표시되지 않는 프로젝트 데이터입니다)\n\n이 작업은 되돌릴 수 없습니다.`)) return;

        let deleted = 0;
        for (const item of orphanItems) {
            try {
                if (item.rawKey) {
                    await idbDel(item.rawKey);
                    deleted++;
                }
            } catch (e) {
                console.error('Failed to delete:', item.key, e);
            }
        }
        alert(`${deleted}개의 고아 프로젝트가 삭제되었습니다.`);
        scanStorage();
    };

    const orphanCount = items.filter(i => i.isOrphan).length;
    const backupCount = items.filter(i => i.isBackup).length;
    const totalSize = items.reduce((sum, i) => sum + i.sizeBytes, 0);

    return (
        <div className={isPage ? "w-full h-full flex flex-col bg-[var(--color-bg)] p-6" : "fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"}>
            <div className={isPage ? "w-full h-full flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-sm" : "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl"}>
                <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Database className="text-[var(--color-primary)]" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Storage Inspector</h2>
                            <p className="text-sm text-[var(--color-text-muted)]">
                                총 {formatSize(totalSize)} | 백업 {backupCount}개 | 고아 {orphanCount}개
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded text-xs font-bold flex items-center gap-1"
                        >
                            <Upload size={14} />
                            Upload
                        </button>
                        {backupCount > 0 && (
                            <button
                                onClick={handleCleanupBackups}
                                className="px-3 py-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded text-xs font-bold flex items-center gap-1"
                            >
                                <Trash2 size={14} />
                                백업 정리 ({backupCount})
                            </button>
                        )}
                        {orphanCount > 0 && (
                            <button
                                onClick={handleCleanupOrphans}
                                className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs font-bold flex items-center gap-1"
                            >
                                <AlertTriangle size={14} />
                                고아 정리 ({orphanCount})
                            </button>
                        )}
                        <button onClick={scanStorage} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        {!isPage && (
                            <button
                                onClick={() => window.location.reload()}
                                className="px-3 py-1.5 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded text-xs font-bold"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {items.length === 0 && !loading && (
                        <div className="text-center py-12 text-[var(--color-text-muted)]">
                            <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No storage items found.</p>
                        </div>
                    )}

                    {items.map((item, idx) => (
                        <div
                            key={idx}
                            className={`bg-black/20 border rounded-lg p-3 flex items-center justify-between hover:border-[var(--color-primary)] transition-colors ${item.isOrphan ? 'border-red-500/50 bg-red-500/5' :
                                item.isBackup ? 'border-orange-500/50 bg-orange-500/5' :
                                    'border-[var(--color-border)]'
                                }`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                                <div className={`p-2 rounded-lg flex-shrink-0 ${item.isOrphan ? 'bg-red-500/20 text-red-400' :
                                    item.isBackup ? 'bg-orange-500/20 text-orange-400' :
                                        item.type === 'indexedDB' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-green-500/20 text-green-400'
                                    }`}>
                                    {item.type === 'indexedDB' ? <Database size={16} /> : <HardDrive size={16} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-mono text-xs text-white truncate">
                                            {(item.rawKey === 'idea-lab-storage' || item.rawKey === 'workflow-storage')
                                                ? 'Active Session (System)'
                                                : (item.rawKey || item.key)}
                                        </h3>
                                        {item.isOrphan && <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-red-400 text-[10px] font-bold flex-shrink-0">고아</span>}
                                        {item.isBackup && <span className="px-1.5 py-0.5 rounded bg-orange-500/30 text-orange-400 text-[10px] font-bold flex-shrink-0">백업</span>}
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-muted)] truncate">{item.preview}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                                {item.timestamp && (
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <Clock size={10} />
                                        {formatDate(item.timestamp)}
                                    </span>
                                )}
                                <span className="text-xs font-mono text-[var(--color-text-muted)] w-16 text-right">{item.size}</span>
                                <button
                                    onClick={() => handleDelete(item)}
                                    className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded"
                                    title="Delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <button
                                    onClick={() => handleLoad(item)}
                                    className="px-3 py-1.5 bg-[var(--color-primary)] text-black text-xs font-bold rounded hover:opacity-90 flex items-center gap-1"
                                >
                                    <Download size={12} />
                                    Load
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-3 border-t border-[var(--color-border)] bg-black/20 text-[10px] text-[var(--color-text-muted)]">
                    <p><strong>💡 Tip:</strong> 🔴<strong>고아</strong>는 대시보드에 없는 프로젝트, 🟠<strong>백업</strong>은 자동 백업 데이터입니다. 안전하게 삭제 가능합니다.</p>
                </div>
            </div>
        </div>
    );
};
