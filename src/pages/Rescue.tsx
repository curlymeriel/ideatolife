import React, { useEffect, useState, useMemo } from 'react';
import { get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import { Download, RefreshCw, AlertTriangle, Home, FileUp, Info, Search, Layers, Package, Image as ImageIcon, Music, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface AssetOwnership {
    projectId: string;
    projectName: string;
}

interface BackupItem {
    key: string;
    source: 'IndexedDB' | 'LocalStorage';
    size: number;
    name: string;
    category: 'projects' | 'images' | 'audio' | 'video' | 'others';
    type?: string;
    preview?: string;
    owner?: AssetOwnership;
    rawData?: any;
}

export const Rescue: React.FC = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<BackupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<'all' | BackupItem['category']>('all');

    useEffect(() => {
        scanBackups();
    }, []);

    const getCategory = (key: string): BackupItem['category'] => {
        const k = key.toLowerCase();
        if (k.startsWith('project-') || k.includes('storage')) return 'projects';
        if (k.startsWith('media-images') || k.startsWith('image_') || k.includes('thumbnail')) return 'images';
        if (k.startsWith('media-audio') || k.startsWith('audio_')) return 'audio';
        if (k.startsWith('media-video') || k.startsWith('video_')) return 'video';
        return 'others';
    };

    const resolveName = (data: any, key: string): string => {
        if (!data) return key;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed.state?.savedProjects) return "🔧 메인 설정 (모든 프로젝트 목록)";
            if (parsed.seriesName || parsed.episodeName) {
                return `🎬 [${parsed.seriesName || '무제'}] ${parsed.episodeName || '제목 없음'}`;
            }
            if (key.startsWith('media-images')) return `🖼️ 이미지: ${key.split('/').pop()}`;
            if (key.startsWith('media-audio')) return `🎵 오디오: ${key.split('/').pop()}`;
            return key;
        } catch {
            return key;
        }
    };

    const scanBackups = async () => {
        setLoading(true);
        setError(null);
        let found: BackupItem[] = [];
        const ownershipMap: Record<string, AssetOwnership> = {};

        try {
            // 1. First Pass: Scan Projects to build ownership map
            const dbKeys = await idbKeys() as string[];
            const projectKeys = dbKeys.filter(k => String(k).startsWith('project-'));

            for (const pk of projectKeys) {
                try {
                    const data = await idbGet(pk);
                    if (!data) continue;
                    const p = typeof data === 'string' ? JSON.parse(data) : data;
                    const pName = `[${p.seriesName || '무제'}] ${p.episodeName || '제목 없음'}`;

                    // Trace asset references (simplified)
                    const jsonStr = JSON.stringify(data);
                    const assetMatches = jsonStr.match(/media-(images|audio|video)\/[a-zA-Z0-9_-]+/g);
                    if (assetMatches) {
                        assetMatches.forEach(ak => {
                            ownershipMap[ak] = { projectId: String(pk), projectName: pName };
                        });
                    }
                } catch (e) { /* skip */ }
            }

            // 2. Second Pass: Actual Scan
            // LocalStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('idea-lab') || key.includes('backup') || key.includes('project'))) {
                    const value = localStorage.getItem(key) || '';
                    found.push({
                        key,
                        source: 'LocalStorage',
                        size: value.length,
                        name: resolveName(value, key),
                        category: getCategory(key),
                        preview: value.substring(0, 50),
                        rawData: value
                    });
                }
            }

            // IndexedDB
            for (const key of dbKeys) {
                const keyStr = String(key);
                try {
                    const value = await idbGet(key);
                    let size = 0;
                    let preview = '';
                    let type = '';

                    if (typeof value === 'string') {
                        size = value.length;
                        preview = value.startsWith('data:') ? value.substring(0, 100) : value.substring(0, 50);
                    } else if (value instanceof Blob) {
                        size = value.size;
                        type = value.type;
                        preview = `바이너리 (${type})`;
                    } else {
                        const json = JSON.stringify(value);
                        size = json.length;
                        preview = json.substring(0, 50);
                    }

                    found.push({
                        key: keyStr,
                        source: 'IndexedDB',
                        size,
                        name: resolveName(value, keyStr),
                        category: getCategory(keyStr),
                        type,
                        preview,
                        owner: ownershipMap[keyStr],
                        rawData: value
                    });
                } catch (e) {
                    found.push({ key: keyStr, source: 'IndexedDB', size: 0, name: keyStr, category: 'others', preview: '오류' });
                }
            }

            setItems(found.sort((a, b) => {
                if (a.category === 'projects' && b.category !== 'projects') return -1;
                if (a.category !== 'projects' && b.category === 'projects') return 1;
                return b.size - a.size;
            }));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadItem = async (item: BackupItem) => {
        try {
            const data = item.rawData || (item.source === 'LocalStorage' ? localStorage.getItem(item.key) : await idbGet(item.key));
            if (!data) return alert("데이터가 비어있습니다.");

            if (data instanceof Blob) {
                saveAs(data, `Rescue_${item.key}.${data.type.split('/')[1] || 'bin'}`);
            } else {
                const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                saveAs(blob, `Rescue_${item.name.replace(/[^\w\s가-힣]/g, '_')}_${item.key}.json`);
            }
        } catch (e: any) { alert(`다운로드 실패: ${e.message}`); }
    };

    const downloadProjectPackage = async (project: BackupItem) => {
        if (!confirm(`${project.name}에 속한 모든 자산을 ZIP으로 묶어 다운로드하시겠습니까?`)) return;

        const zip = new JSZip();
        zip.file('project.json', typeof project.rawData === 'string' ? project.rawData : JSON.stringify(project.rawData, null, 2));

        const related = items.filter(i => i.owner?.projectId === project.key.replace('LS: ', ''));
        setLoading(true);
        for (const asset of related) {
            const data = asset.rawData;
            if (data instanceof Blob) zip.file(asset.key, data);
            else if (typeof data === 'string') zip.file(asset.key, data);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `Project_Package_${project.name}.zip`);
        setLoading(false);
    };

    const filteredItems = useMemo(() => {
        return items.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.key.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = activeCategory === 'all' || i.category === activeCategory;
            return matchesSearch && matchesCategory;
        });
    }, [items, searchQuery, activeCategory]);

    const RenderThumbnail = ({ item }: { item: BackupItem }) => {
        if (item.category !== 'images') return null;
        let src = '';
        if (typeof item.rawData === 'string' && item.rawData.startsWith('data:image')) src = item.rawData;
        else if (item.rawData instanceof Blob && item.rawData.type.startsWith('image/')) src = URL.createObjectURL(item.rawData);

        if (!src) return <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center"><ImageIcon size={16} className="text-gray-600" /></div>;

        return (
            <div className="w-12 h-12 rounded overflow-hidden bg-black border border-white/10 shrink-0">
                <img src={src} className="w-full h-full object-cover" alt="preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </div>
        );
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
                    if (!confirm(`'${file.name}' 파일을 브라우저 저장소에 복원하시겠습니까?`)) return;

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
        <div className="min-h-screen bg-[#0f0f0f] text-white p-8 font-sans selection:bg-red-500/30">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle size={36} className="text-red-500 fill-red-500/10" />
                            <h1 className="text-4xl font-black italic tracking-tighter text-white">RESCUE CENTER</h1>
                        </div>
                        <p className="text-gray-400 font-medium max-w-xl">
                            "앱이 멈췄더라도 작업은 안전해야 합니다." 브라우저 심부의 데이터를 <span className="text-red-400">시각화</span>하여 긴급하게 추출하거나 직접 복구하세요.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleImportJson}
                            className="px-5 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl flex items-center gap-2 transition-all font-bold shadow-lg shadow-red-900/20"
                        >
                            <FileUp size={18} /> JSON 가져오기
                        </button>
                        <button onClick={() => navigate('/')} className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-2 transition-all font-bold">
                            <Home size={18} /> 대시보드
                        </button>
                        <button onClick={scanBackups} className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-2 transition-all font-bold">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 다시 스캔
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="프로젝트명, 파일명 또는 키 검색..."
                            className="w-full bg-[#1a1a1a] border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 outline-none transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-[#1a1a1a] p-1 rounded-2xl border border-white/5 overflow-x-auto">
                        {[
                            { id: 'all', label: '전체', icon: <Layers size={14} /> },
                            { id: 'projects', label: '프로젝트', icon: <Package size={14} /> },
                            { id: 'images', label: '이미지', icon: <ImageIcon size={14} /> },
                            { id: 'audio', label: '오디오', icon: <Music size={14} /> },
                            { id: 'others', label: '기타/데이터', icon: <Archive size={14} /> }
                        ].map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeCategory === cat.id ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/50 p-4 rounded-xl mb-6 flex items-start gap-3">
                        <AlertTriangle className="text-red-500 shrink-0" size={20} />
                        <div>
                            <h3 className="font-bold text-red-400">오류 발생</h3>
                            <p className="text-sm opacity-80">{error}</p>
                        </div>
                    </div>
                )}

                {/* List Container */}
                <div className="bg-[#161616] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest px-8">
                        <span>항목 정보 / 미리보기</span>
                        <div className="flex gap-20 mr-4">
                            <span>용량</span>
                            <span className="w-24 text-center">액션</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-32 text-center">
                            <RefreshCw size={48} className="animate-spin mx-auto mb-6 text-red-500/20" />
                            <p className="text-gray-400 font-bold animate-pulse">데이터 지도를 그리는 중...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="p-32 text-center">
                            <Layers size={48} className="mx-auto mb-6 text-gray-800" />
                            <p className="text-gray-500">조건에 맞는 데이터가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                            {filteredItems.map((item) => (
                                <div key={`${item.source}-${item.key}`} className="p-5 px-8 hover:bg-white/[0.03] transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-5 flex-1 min-w-0">
                                        <RenderThumbnail item={item} />
                                        <div className="min-w-0 pr-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-tighter ${item.category === 'projects' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'
                                                    }`}>
                                                    {item.category.toUpperCase()}
                                                </span>
                                                <h3 className="font-bold text-gray-100 truncate text-[15px]">
                                                    {item.name}
                                                </h3>
                                            </div>

                                            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-500">
                                                <span className="opacity-50"># {item.key}</span>
                                                {item.owner && (
                                                    <span className="text-blue-400/80 font-bold bg-blue-500/5 px-1.5 rounded flex items-center gap-1">
                                                        <Package size={10} /> {item.owner.projectName} 소속
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <span className="text-xs font-mono font-bold text-gray-600 group-hover:text-gray-400 transition-colors">
                                            {formatSize(item.size)}
                                        </span>
                                        <div className="flex gap-2">
                                            {item.category === 'projects' && (
                                                <button
                                                    onClick={() => downloadProjectPackage(item)}
                                                    className="p-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-xl transition-all"
                                                    title="전체 패키지(자산 포함) ZIP 다운로드"
                                                >
                                                    <Archive size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => downloadItem(item)}
                                                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 font-black rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all"
                                            >
                                                <Download size={14} className="text-blue-500" />
                                                추출
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex gap-4 items-start">
                        <Info className="text-blue-400 shrink-0" size={20} />
                        <div>
                            <h4 className="text-xs font-black text-gray-300 mb-1">복구 전문가 팁</h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">자산(이미지/음성) 수동 복구 시, 파일명을 원래의 Key값으로 동일하게 유지해야 프로젝트가 인식합니다.</p>
                        </div>
                    </div>
                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex gap-4 items-start">
                        <ImageIcon className="text-red-400 shrink-0" size={20} />
                        <div>
                            <h4 className="text-xs font-black text-gray-300 mb-1">이미지 썸네일</h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">스캔 시 브라우저 캐시에서 즉시 불러오므로, 사진만 보고도 유실된 장면을 쉽게 찾을 수 있습니다.</p>
                        </div>
                    </div>
                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex gap-4 items-start">
                        <Archive className="text-purple-400 shrink-0" size={20} />
                        <div>
                            <h4 className="text-xs font-black text-gray-300 mb-1">프로젝트 패키지</h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">프로젝트 JSON과 해당 프로젝트에서 사용하는 이미지를 ZIP 파일로 한꺼번에 묶어서 내려받습니다.</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}</style>
        </div>
    );
};
