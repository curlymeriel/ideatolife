import React, { useEffect, useState } from 'react';
import { get as idbGet, keys as idbKeys } from 'idb-keyval';
import { Download, Database, HardDrive, RefreshCw, AlertTriangle, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BackupItem {
    key: string;
    source: 'IndexedDB' | 'LocalStorage';
    size: number;
    timestamp?: string;
    preview?: string;
}

export const Rescue: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<BackupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log("Rescue component mounted");
        scanBackups();
    }, []);

    const scanBackups = async () => {
        console.log("Starting backup scan...");
        setLoading(true);
        setError(null);
        const found: BackupItem[] = [];

        try {
            // 1. Scan LocalStorage
            console.log("Scanning LocalStorage...");
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('idea-lab') || key.includes('backup') || key.includes('project'))) {
                    const value = localStorage.getItem(key) || '';
                    found.push({
                        key,
                        source: 'LocalStorage',
                        size: value.length,
                        preview: value.substring(0, 100) + '...'
                    });
                }
            }

            // 2. Scan IndexedDB with timeout
            console.log("Scanning IndexedDB...");

            // Create a timeout promise
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("IndexedDB scan timed out")), 3000)
            );

            // Race between keys() and timeout
            const dbKeys = await Promise.race([idbKeys(), timeout]) as IDBValidKey[];

            console.log("IDB Keys found:", dbKeys);

            for (const key of dbKeys) {
                const keyStr = String(key);
                try {
                    const value = await idbGet(key);
                    let size = 0;
                    let preview = '';

                    if (typeof value === 'string') {
                        size = value.length;
                        preview = value.substring(0, 100);
                    } else {
                        const json = JSON.stringify(value);
                        size = json.length;
                        preview = json.substring(0, 100);
                    }

                    found.push({
                        key: keyStr,
                        source: 'IndexedDB',
                        size,
                        preview: preview + '...'
                    });
                } catch (e) {
                    console.error(`Failed to read IDB key ${keyStr}`, e);
                    found.push({
                        key: keyStr,
                        source: 'IndexedDB',
                        size: 0,
                        preview: 'Error reading key'
                    });
                }
            }

            setItems(found.sort((a, b) => b.size - a.size));
        } catch (e: any) {
            console.error("Scan failed", e);
            setError(e.message);
        } finally {
            setLoading(false);
            console.log("Scan complete");
        }
    };

    const downloadItem = async (item: BackupItem) => {
        try {
            let data: any;
            if (item.source === 'LocalStorage') {
                data = localStorage.getItem(item.key);
            } else {
                data = await idbGet(item.key);
            }

            if (!data) {
                alert("Data is empty or could not be read.");
                return;
            }

            const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            link.href = url;
            link.download = `rescue-${item.key}-${timestamp}.json`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e: any) {
            alert(`Download failed: ${e.message}`);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="min-h-screen bg-[#1a1a1a] text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-red-500 flex items-center gap-3">
                            <AlertTriangle />
                            Data Rescue Center
                        </h1>
                        <p className="text-gray-400 mt-2">
                            Safely recover your data without loading the full application.
                            Download backups to your computer first.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded flex items-center gap-2 transition-colors"
                    >
                        <Home size={18} />
                        Back to Dashboard
                    </button>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500 p-4 rounded mb-6">
                        <h3 className="font-bold text-red-400">Scan Error</h3>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <div className="bg-[#252525] rounded-lg border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#2a2a2a]">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Database size={18} className="text-blue-400" />
                            Found Storage Items
                        </h2>
                        <button
                            onClick={scanBackups}
                            className="p-2 hover:bg-gray-700 rounded-full transition-colors"
                            title="Refresh Scan"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500">
                            <RefreshCw size={32} className="animate-spin mx-auto mb-4" />
                            Scanning storage...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            No backup data found in LocalStorage or IndexedDB.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-700">
                            {items.map((item) => (
                                <div key={`${item.source}-${item.key}`} className="p-4 hover:bg-[#2f2f2f] transition-colors flex items-center justify-between group">
                                    <div className="flex-1 min-w-0 mr-4">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${item.source === 'IndexedDB' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                                                }`}>
                                                {item.source}
                                            </span>
                                            <span className="font-mono text-sm font-bold text-gray-200 truncate">
                                                {item.key}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {formatSize(item.size)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono truncate opacity-60">
                                            {item.preview}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => downloadItem(item)}
                                        className="px-4 py-2 bg-[var(--color-primary)] text-black font-bold rounded flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap"
                                    >
                                        <Download size={16} />
                                        Download JSON
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-8 p-6 bg-blue-900/10 border border-blue-500/30 rounded-lg">
                    <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                        <HardDrive size={18} />
                        How to use this file?
                    </h3>
                    <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                        <li>Download the JSON file for the project you want to restore.</li>
                        <li>Go back to the Dashboard.</li>
                        <li>Use the "Import Project" feature (if available) or drag and drop the file.</li>
                        <li>If the file is very large (&gt;50MB), try to use a text editor to inspect it first.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
