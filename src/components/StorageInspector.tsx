import React, { useEffect, useState, useRef } from 'react';
import { keys as idbKeys, get as idbGet } from 'idb-keyval';
import { useWorkflowStore } from '../store/workflowStore';
import { Database, HardDrive, Download, RefreshCw, AlertTriangle, Upload } from 'lucide-react';

interface StorageItem {
    key: string;
    type: 'localStorage' | 'indexedDB';
    size: string;
    preview: string;
    timestamp?: number;
}

export const StorageInspector: React.FC = () => {
    const [items, setItems] = useState<StorageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const { importData } = useWorkflowStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getPreviewInfo = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            const state = parsed.state || parsed;

            if (state.savedProjects && Object.keys(state.savedProjects).length > 0) {
                const count = Object.keys(state.savedProjects).length;
                const names = Object.values(state.savedProjects).map((p: any) => p.seriesName).join(', ');
                return `Contains ${count} project(s): ${names}`;
            }

            if (state.seriesName) {
                return `Project: ${state.seriesName} - ${state.episodeName} (Step ${state.currentStep})`;
            }

            return "Unknown Data Format";
        } catch (e) {
            return "Raw Data (Not JSON)";
        }
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
                    const isSuspicious = /mock|temp|backup/i.test(key);
                    foundItems.push({
                        key: `LocalStorage: ${key} ${isSuspicious ? '⚠️' : ''}`,
                        type: 'localStorage',
                        size: formatSize(value.length),
                        preview: getPreviewInfo(value),
                    });
                }
            }

            // 1.5 Scan SessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key) {
                    const value = sessionStorage.getItem(key) || '';
                    const isSuspicious = /mock|temp|backup/i.test(key);
                    foundItems.push({
                        key: `SessionStorage: ${key} ${isSuspicious ? '⚠️' : ''}`,
                        type: 'localStorage',
                        size: formatSize(value.length),
                        preview: getPreviewInfo(value),
                    });
                }
            }

            // 2. Scan ALL IndexedDB Databases
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

                                foundItems.push({
                                    key: `DB: ${dbInfo.name} / Store: ${storeName} / Key: ${String(key)}`,
                                    type: 'indexedDB',
                                    size: formatSize(strValue.length),
                                    preview: getPreviewInfo(strValue),
                                });
                            }
                        }
                        db.close();
                    } catch (e) {
                        console.error(`Failed to read DB ${dbInfo.name}:`, e);
                    }
                }
            } else {
                // Fallback for browsers not supporting databases()
                const dbKeys = await idbKeys();
                for (const key of dbKeys) {
                    const raw = await idbGet(key);
                    const strValue = typeof raw === 'string' ? raw : JSON.stringify(raw);
                    foundItems.push({
                        key: `Default DB / Key: ${String(key)}`,
                        type: 'indexedDB',
                        size: formatSize(strValue.length),
                        preview: getPreviewInfo(strValue),
                    });
                }
            }

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
        if (!confirm(`Attempt to load data from ${item.type} key: "${item.key}"? This will overwrite current session.`)) return;

        try {
            let data: any;
            if (item.type === 'localStorage') {
                const raw = localStorage.getItem(item.key);
                if (raw) data = raw;
            } else {
                const raw = await idbGet(item.key);
                if (typeof raw === 'string') {
                    data = raw;
                } else {
                    data = JSON.stringify(raw);
                }
            }

            if (data) {
                importData(data);
            } else {
                alert("Failed to read data.");
            }
        } catch (e: any) {
            alert(`Load failed: ${e.message}`);
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

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
                <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Database className="text-[var(--color-primary)]" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Data Rescue Mission</h2>
                            <p className="text-sm text-[var(--color-text-muted)]">Scan browser storage or upload backup file</p>
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
                            className="px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded text-sm font-bold flex items-center gap-2"
                            title="Upload backup JSON file"
                        >
                            <Upload size={16} />
                            Upload File
                        </button>
                        <button onClick={scanStorage} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Rescan">
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-sm font-bold">
                            Close
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {items.length === 0 && !loading && (
                        <div className="text-center py-12 text-[var(--color-text-muted)]">
                            <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No storage items found.</p>
                        </div>
                    )}

                    {items.map((item) => (
                        <div key={`${item.type}-${item.key}`} className="bg-black/20 border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between hover:border-[var(--color-primary)] transition-colors group">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className={`p-3 rounded-lg ${item.type === 'indexedDB' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {item.type === 'indexedDB' ? <Database size={20} /> : <HardDrive size={20} />}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-white truncate flex items-center gap-2">
                                        {item.key}
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[var(--color-text-muted)] uppercase">{item.type}</span>
                                    </h3>
                                    <p className="text-xs text-[var(--color-text-muted)] font-mono mt-1 truncate max-w-md">
                                        {item.preview}...
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <span className="text-xs font-mono text-[var(--color-text-muted)]">{item.size}</span>
                                <button
                                    onClick={() => handleLoad(item)}
                                    className="px-4 py-2 bg-[var(--color-primary)] text-black text-sm font-bold rounded hover:opacity-90 flex items-center gap-2"
                                >
                                    <Download size={16} />
                                    Load
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-[var(--color-border)] bg-black/20 text-xs text-[var(--color-text-muted)]">
                    <p><strong>Tip:</strong> Look for keys like 'idea-lab-storage' or 'firebase:authUser'. If you see a large file size, that's likely your project data.</p>
                </div>
            </div>
        </div>
    );
};
