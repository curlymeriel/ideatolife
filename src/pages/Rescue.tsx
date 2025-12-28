import React, { useEffect, useState } from 'react';
import { get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import { Download, Database, HardDrive, RefreshCw, AlertTriangle, Home, FileUp, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BackupItem {
    key: string;
    source: 'IndexedDB' | 'LocalStorage';
    size: number;
    name?: string; // Resolved project name
    timestamp?: string;
    preview?: string;
}

export const Rescue: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<BackupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        scanBackups();
    }, []);

    const resolveName = (data: any, key: string): string => {
        if (!data) return key;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;

            // 1. Check for workflow-storage/idea-lab-storage structure
            if (parsed.state?.savedProjects) {
                return "메인 데이터 (모든 프로젝트 목록)";
            }

            // 2. Check for individual project structure
            if (parsed.seriesName || parsed.episodeName) {
                const sName = parsed.seriesName || '이름 없음';
                const eName = parsed.episodeName || '제목 없음';
                return `[${sName}] ${eName}`;
            }

            // 3. Fallback logic for keys
            if (key.startsWith('media-images')) return `이미지 에셋 (${key.split('/').pop()})`;
            if (key.startsWith('media-audio')) return `음성 에셋 (${key.split('/').pop()})`;

            return key;
        } catch {
            return key;
        }
    };

    const scanBackups = async () => {
        setLoading(true);
        setError(null);
        const found: BackupItem[] = [];

        try {
            // 1. LocalStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('idea-lab') || key.includes('backup') || key.includes('project'))) {
                    const value = localStorage.getItem(key) || '';
                    found.push({
                        key,
                        source: 'LocalStorage',
                        size: value.length,
                        name: resolveName(value, key),
                        preview: value.substring(0, 100) + '...'
                    });
                }
            }

            // 2. IndexedDB
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("저장소 응답 대기 시간 초과")), 3000)
            );

            const dbKeys = await Promise.race([idbKeys(), timeout]) as IDBValidKey[];

            for (const key of dbKeys) {
                const keyStr = String(key);
                try {
                    const value = await idbGet(key);
                    let size = 0;
                    let preview = '';

                    if (typeof value === 'string') {
                        size = value.length;
                        preview = value.substring(0, 100);
                    } else if (value instanceof Blob) {
                        size = value.size;
                        preview = `Binary Content (${value.type})`;
                    } else {
                        const json = JSON.stringify(value);
                        size = json.length;
                        preview = json.substring(0, 100);
                    }

                    found.push({
                        key: keyStr,
                        source: 'IndexedDB',
                        size,
                        name: resolveName(value, keyStr),
                        preview: preview + '...'
                    });
                } catch (e) {
                    found.push({
                        key: keyStr,
                        source: 'IndexedDB',
                        size: 0,
                        name: keyStr,
                        preview: '데이터 읽기 오류'
                    });
                }
            }

            setItems(found.sort((a, b) => b.size - a.size));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
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
                alert("데이터가 비어있거나 읽을 수 없습니다.");
                return;
            }

            const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = item.name?.replace(/[\\/:*?"<>|]/g, '_') || item.key;
            link.href = url;
            link.download = `Rescue_${fileName}_${timestamp}.json`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e: any) {
            alert(`다운로드 실패: ${e.message}`);
        }
    };

    const handleImportJson = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event: any) => {
                try {
                    const content = JSON.parse(event.target.result);
                    // Minimal validation: check if it looks like a project
                    if (!confirm(`'${file.name}' 파일을 브라우저 저장소에 복원하시겠습니까?`)) return;

                    // Logic to store back into IDB (heuristic key matching)
                    let key = file.name.split('_')[1] || `restored_${Date.now()}`;
                    if (!key.startsWith('project-') && !key.includes('storage')) {
                        key = `project-${key}`;
                    }

                    await idbSet(key, content);
                    alert(`복원 완료! 대시보드로 이동하여 확인하세요.\n저장된 키: ${key}`);
                    scanBackups();
                } catch (err) {
                    alert("잘못된 JSON 파일입니다.");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="min-h-screen bg-[#121212] text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-red-500 flex items-center gap-3 italic tracking-tighter">
                            <AlertTriangle size={32} />
                            RESCUE CENTER
                        </h1>
                        <p className="text-gray-400 mt-2 font-medium">
                            긴급 데이터 구조 센터: 브라우저 오류 시에도 작업물을 안전하게 파일로 추출합니다.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleImportJson}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                        >
                            <FileUp size={18} />
                            JSON 가져오기 (복원)
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center gap-2 transition-colors"
                        >
                            <Home size={18} />
                            대시보드로
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/50 p-4 rounded-xl mb-6 flex items-start gap-3">
                        <AlertTriangle className="text-red-500 shrink-0" size={20} />
                        <div>
                            <h3 className="font-bold text-red-400">저장소 스캔 오류</h3>
                            <p className="text-sm opacity-80">{error}</p>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="bg-[#1e1e1e] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="font-bold flex items-center gap-2 text-gray-300">
                            <Database size={18} className="text-blue-400" />
                            감지된 저장소 데이터 (용량순)
                        </h2>
                        <button
                            onClick={scanBackups}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="새로고침"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin text-blue-400" : "text-gray-400"} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-20 text-center text-gray-500">
                            <RefreshCw size={40} className="animate-spin mx-auto mb-4 opacity-20" />
                            <p className="font-medium animate-pulse">저장소를 정밀 스캔 중입니다...</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="p-20 text-center text-gray-500">
                            <HardDrive size={40} className="mx-auto mb-4 opacity-10" />
                            <p>복구 가능한 데이터가 발견되지 않았습니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {items.map((item) => (
                                <div key={`${item.source}-${item.key}`} className="p-5 hover:bg-white/[0.02] transition-colors flex items-center justify-between group">
                                    <div className="flex-1 min-w-0 mr-6">
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-tight ${item.source === 'IndexedDB' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                }`}>
                                                {item.source}
                                            </span>
                                            <span className="font-bold text-base text-gray-100 truncate">
                                                {item.name}
                                            </span>
                                            <span className="text-xs font-mono text-gray-500 bg-black/20 px-1.5 py-0.5 rounded">
                                                {formatSize(item.size)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs font-mono opacity-40 group-hover:opacity-100 transition-opacity">
                                            <span className="truncate max-w-[200px] text-blue-300">{item.key}</span>
                                            <span className="truncate italic flex-1">{item.preview}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => downloadItem(item)}
                                        className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                                    >
                                        <Download size={16} className="text-blue-400" />
                                        JSON 추출
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Instructions Panel */}
                <div className="mt-8 p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                    <h3 className="text-blue-400 font-bold mb-4 flex items-center gap-2">
                        <Info size={18} />
                        이 기능은 언제 사용하나요?
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <ul className="space-y-3 text-gray-400">
                            <li className="flex items-start gap-2">
                                <span className="text-blue-500 font-bold">1.</span>
                                <div>
                                    <strong className="text-gray-200">에러 발생 시</strong><br />
                                    앱이 무한 로딩되거나 대시보드에서 프로젝트가 보이지 않을 때 이 화면으로 진입하세요.
                                </div>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-500 font-bold">2.</span>
                                <div>
                                    <strong className="text-gray-200">데이터 백업</strong><br />
                                    브라우저 캐시를 지우기 전에 중요한 프로젝트를 파일(JSON)로 안전하게 개인 PC에 저장하세요.
                                </div>
                            </li>
                        </ul>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 mb-2 font-bold uppercase tracking-widest">추출된 파일 복구 방법</p>
                            <p className="text-gray-300 leading-relaxed">
                                1. 원하는 항목의 <strong>[JSON 추출]</strong> 버튼을 눌러 파일을 받습니다.<br />
                                2. 대시보드의 '가져오기' 기능을 쓰거나, 상단의 <strong>[JSON 가져오기]</strong> 버튼을 통해 다시 저장소로 복원할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
};
