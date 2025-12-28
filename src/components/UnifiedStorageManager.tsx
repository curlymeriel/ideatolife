import React, { useEffect, useState } from 'react';
import { keys as idbKeys, get as idbGet, del as idbDel } from 'idb-keyval';
import {
    Image, Music, FileText, Trash2, RefreshCw,
    AlertTriangle, X, ShieldCheck, Film, Wand2, Database,
    Download, Clock, ChevronRight, Search, Info
} from 'lucide-react';
import { useWorkflowStore } from '../store/workflowStore';
import { parseIdbUrl, optimizeAllStoredImages } from '../utils/imageStorage';

// --- Types ---
interface StorageStats {
    images: { count: number; size: number };
    audio: { count: number; size: number };
    video: { count: number; size: number };
    projects: { count: number; size: number };
    backups: { count: number; size: number };
    others: { count: number; size: number };
    total: { count: number; size: number };
}

interface ItemDetail {
    key: string;
    rawKey: string;
    type: 'indexedDB' | 'localStorage' | 'sessionStorage';
    category: 'images' | 'audio' | 'video' | 'projects' | 'backups' | 'others';
    sizeBytes: number;
    preview: string;
    timestamp?: number;
    isOrphan?: boolean;
    isOptimized?: boolean;
    isString?: boolean; // True if stored as base64/string instead of Blob
    projectRef?: string; // If it belongs to a specific project
}

interface UnifiedStorageManagerProps {
    onClose: () => void;
}

export const UnifiedStorageManager: React.FC<UnifiedStorageManagerProps> = ({ onClose }) => {
    // --- State ---
    const [view, setView] = useState<'summary' | 'details'>('summary');
    const [filterCategory, setFilterCategory] = useState<ItemDetail['category'] | 'all' | 'orphans'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [stats, setStats] = useState<StorageStats>({
        images: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        projects: { count: 0, size: 0 },
        backups: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        others: { count: 0, size: 0 },
        total: { count: 0, size: 0 }
    });

    const [items, setItems] = useState<ItemDetail[]>([]);
    const [orphanStats, setOrphanStats] = useState({ count: 0, size: 0 });
    const [optStats, setOptStats] = useState({ count: 0, size: 0 });

    const [loading, setLoading] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizeProgress, setOptimizeProgress] = useState({ current: 0, total: 0 });

    const { savedProjects, importData } = useWorkflowStore();

    // --- Helpers ---
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '-';
        const date = new Date(timestamp);
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getPreviewInfo = (value: any, key: string): { preview: string; timestamp?: number; projectRef?: string } => {
        if (key.startsWith('media-')) {
            const parsed = parseIdbUrl(key);
            return { preview: `Media Asset (${parsed?.type || 'unknown'})`, projectRef: parsed?.key };
        }

        try {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            const parsed = JSON.parse(strValue);
            const state = parsed.state || parsed;
            const timestamp = state.lastModified || parsed.lastModified;

            if (state.seriesName) {
                return {
                    preview: `${state.seriesName} - ${state.episodeName || '제목 없음'} (Step ${state.currentStep || '?'})`,
                    timestamp,
                    projectRef: key.replace('project-', '')
                };
            }
            if (state.savedProjects) {
                return { preview: `Full Backup (${Object.keys(state.savedProjects).length} projects)`, timestamp };
            }
            return { preview: "Object Data", timestamp };
        } catch {
            return { preview: typeof value === 'string' ? value.substring(0, 50) + '...' : "Raw Data" };
        }
    };

    // --- Core Logic ---
    const scanStorage = async () => {
        setLoading(true);
        try {
            const allItems: ItemDetail[] = [];
            const newStats: StorageStats = {
                images: { count: 0, size: 0 },
                audio: { count: 0, size: 0 },
                projects: { count: 0, size: 0 },
                backups: { count: 0, size: 0 },
                video: { count: 0, size: 0 },
                others: { count: 0, size: 0 },
                total: { count: 0, size: 0 }
            };

            // 1. Referenced Keys for Orphan detection
            const referencedKeys = new Set<string>();
            const projectIds = Object.keys(savedProjects);
            for (const pid of projectIds) {
                const projectData = await idbGet(`project-${pid}`);
                if (!projectData) continue;
                const addRef = (url: string | undefined | null) => {
                    const parsed = parseIdbUrl(url || '');
                    if (parsed) referencedKeys.add(`media-${parsed.type}-${parsed.key}`);
                };
                if (Array.isArray(projectData.script)) {
                    projectData.script.forEach((cut: any) => {
                        addRef(cut.finalImageUrl); addRef(cut.audioUrl); addRef(cut.videoUrl);
                    });
                }
                if (projectData.assetDefinitions) {
                    Object.values(projectData.assetDefinitions).forEach((asset: any) => {
                        addRef(asset.referenceImage); addRef(asset.masterImage); addRef(asset.draftImage);
                    });
                }
                addRef(projectData.thumbnailUrl);
                if (projectData.masterStyle) addRef(projectData.masterStyle.referenceImage);
            }

            // 2. Scan IndexedDB
            const iks = await idbKeys();
            for (const key of iks) {
                const keyStr = String(key);
                const value = await idbGet(key);

                let size = 0;
                let isOptimized = false;
                let isValString = false;
                if (typeof value === 'string') {
                    size = value.length;
                    isValString = true;
                    isOptimized = value.startsWith('data:image/jpeg') || value.startsWith('data:image/jpg');
                } else if (value instanceof Blob) {
                    size = value.size;
                    isOptimized = value.type === 'image/jpeg' || value.type === 'image/jpg';
                } else {
                    size = JSON.stringify(value).length || 0;
                }

                let category: ItemDetail['category'] = 'others';
                if (keyStr.startsWith('media-images') || keyStr.startsWith('image_') || keyStr.includes('thumbnail')) category = 'images';
                else if (keyStr.startsWith('media-audio') || keyStr.startsWith('audio_')) category = 'audio';
                else if (keyStr.startsWith('media-video') || keyStr.startsWith('video_')) category = 'video';
                else if (keyStr.startsWith('project-') || keyStr === 'idea-lab-storage' || keyStr === 'workflow-storage') category = 'projects';
                else if (keyStr.startsWith('backup_') || keyStr.includes('backup')) category = 'backups';

                const { preview, timestamp, projectRef } = getPreviewInfo(value, keyStr);
                const isOrphan = keyStr.startsWith('media-') && !referencedKeys.has(keyStr);

                const item: ItemDetail = {
                    key: keyStr, rawKey: keyStr, type: 'indexedDB', category, sizeBytes: size, preview, timestamp, isOrphan, isOptimized, isString: isValString, projectRef
                };
                allItems.push(item);

                newStats[category].count++;
                newStats[category].size += size;
                newStats.total.count++;
                newStats.total.size += size;
            }

            // 3. Scan LocalStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                const value = localStorage.getItem(key) || '';
                const size = value.length;
                let category: ItemDetail['category'] = (key.includes('backup') || key === 'idea-lab-storage') ? 'backups' : 'others';
                if (key.includes('project')) category = 'projects';

                const { preview, timestamp } = getPreviewInfo(value, key);
                allItems.push({
                    key: `LS: ${key}`, rawKey: key, type: 'localStorage', category, sizeBytes: size, preview, timestamp, isString: true
                });
                newStats[category].count++;
                newStats[category].size += size;
                newStats.total.count++;
                newStats.total.size += size;
            }

            setItems(allItems);
            setStats(newStats);

            const orphans = allItems.filter(i => i.isOrphan);
            setOrphanStats({ count: orphans.length, size: orphans.reduce((s, i) => s + i.sizeBytes, 0) });

            // Calculate optimizable images
            const optimizables = allItems.filter(i => {
                if (i.category !== 'images' && i.category !== 'others') return false;
                if (i.type !== 'indexedDB') return false; // Optimization engine only touches IDB
                if (i.key.toLowerCase().includes('frame')) return false;

                // Key must match optimizer patterns
                const isReachable = i.key.startsWith('media-') || i.key.startsWith('image_') || i.key.includes('thumbnail') || i.key.includes('asset');
                if (!isReachable) return false;

                // Optimization logic:
                // 1. Strings (Base64) are always better as Blobs if significant size (>30KB)
                // 2. Non-optimized images (PNG/WebP/Etc) > 200KB
                const isLargeBase64 = i.isString && i.sizeBytes > 30000;
                const isLargeUnoptimized = !i.isOptimized && i.sizeBytes > 200 * 1024;

                return isLargeBase64 || isLargeUnoptimized;
            });
            setOptStats({ count: optimizables.length, size: optimizables.reduce((s, i) => s + i.sizeBytes, 0) });

        } catch (error) {
            console.error("Storage scan failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const deleteItem = async (item: ItemDetail) => {
        if (!confirm(`정말 삭제하시겠습니까?\n\n${item.key}`)) return;
        try {
            if (item.type === 'localStorage') localStorage.removeItem(item.rawKey);
            else await idbDel(item.rawKey);
            await scanStorage();
        } catch (e) { alert("삭제 실패"); }
    };

    const cleanupOrphans = async () => {
        if (!confirm(`사용하지 않는 ${orphanStats.count}개의 파일을 삭제하시겠습니까?`)) return;
        setLoading(true);
        try {
            for (const item of items) {
                if (item.isOrphan) await idbDel(item.rawKey);
            }
            await scanStorage();
            alert("정리가 완료되었습니다.");
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const handleBulkOptimize = async () => {
        if (!confirm("모든 이미지를 JPG로 압축하여 용량을 확보하시겠습니까? (안전함)")) return;
        setOptimizing(true);
        try {
            const result = await optimizeAllStoredImages((current, total) => setOptimizeProgress({ current, total }));
            // Wait a moment for IDB to flush before rescanning
            await new Promise(resolve => setTimeout(resolve, 500));
            await scanStorage();
            alert(`최적화 완료!\n절약된 용량: ${formatSize(result.savedBytes)}`);
        } catch (e) { console.error(e); } finally { setOptimizing(false); }
    };

    const handleLoad = async (item: ItemDetail) => {
        if (!confirm("이 데이터를 현재 세션으로 불러오시겠습니까?")) return;
        try {
            let data = item.type === 'localStorage' ? localStorage.getItem(item.rawKey) : await idbGet(item.rawKey);
            if (data) importData(typeof data === 'string' ? data : JSON.stringify(data));
        } catch (e) { alert("불러오기 실패"); }
    };

    useEffect(() => { scanStorage(); }, []);

    // --- Filtered Items ---
    const filteredItems = items.filter(item => {
        if (filterCategory === 'orphans') return item.isOrphan;
        if (filterCategory !== 'all' && item.category !== filterCategory) return false;
        if (searchQuery) {
            return item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.preview.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    // --- Sub-components ---
    const CategoryCard = ({ id, label, icon: Icon, colorClass }: { id: ItemDetail['category'], label: string, icon: any, colorClass: string }) => (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3 group">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
                        <Icon className={colorClass.replace('bg-', 'text-')} size={18} />
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">{label}</h4>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{stats[id].count}개의 항목</p>
                    </div>
                </div>
                <span className="font-mono text-xs text-[var(--color-primary)]">{formatSize(stats[id].size)}</span>
            </div>
            <button
                onClick={() => { setFilterCategory(id); setView('details'); }}
                className="w-full py-2 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-bold text-gray-400 hover:text-white transition-all"
            >
                내역 확인 <ChevronRight size={12} />
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg">
                                <Database size={20} className="text-[var(--color-primary)]" />
                            </div>
                            <h1 className="text-lg font-bold text-white">저장소 통합 관리</h1>
                        </div>

                        {/* View Switcher */}
                        <div className="flex bg-black/40 p-1 rounded-lg">
                            <button
                                onClick={() => setView('summary')}
                                className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${view === 'summary' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-white'}`}
                            >
                                요약 및 정리
                            </button>
                            <button
                                onClick={() => { setView('details'); if (filterCategory === 'orphans') setFilterCategory('all'); }}
                                className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${view === 'details' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-white'}`}
                            >
                                상세 내역
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={scanStorage} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {view === 'summary' ? (
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Top Actions: Smart Maintenance */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* 1. Asset Optimization (Moved Up) */}
                                <div className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all ${optStats.count > 0 ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/[0.15]' : 'bg-green-500/5 border-green-500/20'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${optStats.count > 0 ? 'bg-purple-500/20' : 'bg-green-500/20'}`}>
                                            {optStats.count > 0 ? <Wand2 className="text-purple-400" size={24} /> : <ShieldCheck className="text-green-400" size={24} />}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-white">
                                                {optStats.count > 0 ? `이미지 용량 최적화 가능` : '이미지 최적화 완료'}
                                            </h3>
                                            <p className={`text-xs ${optStats.count > 0 ? 'text-purple-200/50' : 'text-green-200/50'} leading-relaxed`}>
                                                {optStats.count > 0
                                                    ? `압축 가능한 이미지 ${optStats.count}개를 찾았습니다. 무손실 압축으로 공간을 확보하세요.`
                                                    : '모든 이미지가 최적의 상태로 압축되어 있습니다.'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleBulkOptimize}
                                        disabled={optimizing || optStats.count === 0}
                                        className={`w-full py-2.5 rounded-xl text-xs font-black transition-all shadow-lg flex items-center justify-center gap-2 ${optStats.count > 0 ? 'bg-purple-500 hover:bg-purple-400 text-black shadow-purple-500/20' : 'bg-green-500/20 text-green-400 cursor-not-allowed'}`}
                                    >
                                        {optimizing ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                        {optimizing ? `최적화 진행 중 (${optimizeProgress.current}/${optimizeProgress.total})` : optStats.count > 0 ? '지금 최적화 실행하기' : '최적화 상태 양호'}
                                    </button>
                                </div>

                                {/* 2. Safe Cleanup (Orphans) */}
                                <div className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all ${orphanStats.count > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/5 border-green-500/20'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${orphanStats.count > 0 ? 'bg-orange-500/20' : 'bg-green-500/20'}`}>
                                            {orphanStats.count > 0 ? <AlertTriangle className="text-orange-400" size={24} /> : <ShieldCheck className="text-green-400" size={24} />}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-white">
                                                {orphanStats.count > 0 ? `불필요한 고아 파일 정리` : '저장소가 깨끗합니다'}
                                            </h3>
                                            <p className={`text-xs ${orphanStats.count > 0 ? 'text-orange-200/60' : 'text-green-200/50'} leading-relaxed`}>
                                                {orphanStats.count > 0
                                                    ? `어떤 프로젝트에서도 쓰이지 않는 ${orphanStats.count}개의 파일(${formatSize(orphanStats.size)})을 찾아냈습니다.`
                                                    : '모든 미디어 파일이 프로젝트와 정상적으로 연결되어 있습니다.'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {orphanStats.count > 0 && (
                                            <button
                                                onClick={() => { setFilterCategory('orphans'); setView('details'); }}
                                                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl transition-all"
                                            >
                                                내역 확인
                                            </button>
                                        )}
                                        <button
                                            onClick={orphanStats.count > 0 ? cleanupOrphans : undefined}
                                            disabled={orphanStats.count === 0}
                                            className={`flex-[2] py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-lg ${orphanStats.count > 0 ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-orange-500/20' : 'bg-green-500/20 text-green-400 cursor-not-allowed'}`}
                                        >
                                            <Trash2 size={14} /> 고아 파일 일괄 삭제
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Usage Progress: Total View */}
                            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Database className="text-[var(--color-primary)]" size={18} />
                                        <h3 className="text-sm font-bold text-white uppercase tracking-tight">전체 사용 용량 요약</h3>
                                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold">DEVICE SYNCED</span>
                                    </div>
                                    <span className="text-2xl font-black text-[var(--color-primary)]">{formatSize(stats.total.size)}</span>
                                </div>
                                <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(stats.images.size / stats.total.size) * 100}%` }} title="Images" />
                                    <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${(stats.audio.size / stats.total.size) * 100}%` }} title="Audio" />
                                    <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${(stats.video.size / stats.total.size) * 100}%` }} title="Video" />
                                    <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(stats.backups.size / stats.total.size) * 100}%` }} title="Backups" />
                                    <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${(stats.projects.size / stats.total.size) * 100}%` }} title="Projects" />
                                </div>
                                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
                                    {[
                                        { label: '이미지', size: stats.images.size, color: 'bg-blue-500' },
                                        { label: '오디오', size: stats.audio.size, color: 'bg-purple-500' },
                                        { label: '비디오', size: stats.video.size, color: 'bg-pink-500' },
                                        { label: '백업', size: stats.backups.size, color: 'bg-green-500' },
                                        { label: '프로젝트', size: stats.projects.size, color: 'bg-orange-500' },
                                    ].map(l => (
                                        <div key={l.label} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${l.color}`} />
                                            <span className="text-[11px] text-gray-500 font-medium">{l.label} <span className="text-gray-400 font-mono ml-1">{formatSize(l.size)}</span></span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Category Grid: Detailed Overview */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <Info size={14} className="text-gray-500" />
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">유형별 현황 및 내역</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <CategoryCard id="images" label="이미지 자산" icon={Image} colorClass="bg-blue-500" />
                                    <CategoryCard id="audio" label="오디오 파일" icon={Music} colorClass="bg-purple-500" />
                                    <CategoryCard id="video" label="비디오 컷" icon={Film} colorClass="bg-pink-500" />
                                    <CategoryCard id="backups" label="워크플로우 백업" icon={RefreshCw} colorClass="bg-green-500" />
                                    <CategoryCard id="projects" label="진행 프로젝트" icon={FileText} colorClass="bg-orange-500" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Details View */
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Toolbar */}
                            <div className="p-4 bg-black/20 border-b border-[var(--color-border)] flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    {[
                                        { id: 'all', label: '전체', icon: Database },
                                        { id: 'images', label: '이미지', icon: Image },
                                        { id: 'audio', label: '오디오', icon: Music },
                                        { id: 'video', label: '비디오', icon: Film },
                                        { id: 'backups', label: '백업', icon: RefreshCw },
                                        { id: 'projects', label: '프로젝트', icon: FileText },
                                        { id: 'orphans', label: '고아 파일', icon: AlertTriangle },
                                    ].map(btn => (
                                        <button
                                            key={btn.id}
                                            onClick={() => setFilterCategory(btn.id as any)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${filterCategory === btn.id ? 'bg-[var(--color-primary)] text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                        >
                                            <btn.icon size={12} /> {btn.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                    <input
                                        type="text"
                                        placeholder="파일 키워드 검색..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-[var(--color-primary)]/50 w-64"
                                    />
                                </div>
                            </div>

                            {/* List Header */}
                            <div className="px-6 py-2 bg-black/10 border-b border-white/5 grid grid-cols-12 gap-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                <div className="col-span-6">내역 / 미리보기</div>
                                <div className="col-span-2 text-center">유형</div>
                                <div className="col-span-2 text-right">용량</div>
                                <div className="col-span-2 text-right">관리</div>
                            </div>

                            {/* List Content */}
                            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
                                {filteredItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                                        <Search size={48} className="mb-4 opacity-20" />
                                        <p className="text-sm">검색 결과가 없습니다.</p>
                                    </div>
                                ) : (
                                    filteredItems.map((item, idx) => (
                                        <div key={idx} className={`grid grid-cols-12 gap-4 items-center p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group ${item.isOrphan ? 'border-orange-500/20 bg-orange-500/5' : ''}`}>
                                            <div className="col-span-6 flex items-center gap-3 min-w-0">
                                                <div className={`p-2 rounded-lg shrink-0 ${item.category === 'images' ? 'bg-blue-500/10 text-blue-400' :
                                                    item.category === 'audio' ? 'bg-purple-500/10 text-purple-400' :
                                                        item.category === 'backups' ? 'bg-green-500/10 text-green-400' :
                                                            'bg-gray-500/10 text-gray-400'
                                                    }`}>
                                                    {item.category === 'images' ? <Image size={16} /> :
                                                        item.category === 'audio' ? <Music size={16} /> :
                                                            item.category === 'projects' ? <FileText size={16} /> :
                                                                <Database size={16} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h5 className="text-[11px] font-bold text-white truncate" title={item.key}>{item.key}</h5>
                                                        {item.isOrphan && <span className="px-1 py-0.5 rounded bg-orange-500 text-black text-[8px] font-black uppercase">Orphan</span>}
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 truncate">{item.preview}</p>
                                                </div>
                                            </div>
                                            <div className="col-span-2 flex flex-col items-center justify-center gap-1">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded-full">{item.type}</span>
                                                <span className="text-[9px] text-gray-600 flex items-center gap-1"><Clock size={10} /> {formatDate(item.timestamp)}</span>
                                            </div>
                                            <div className="col-span-2 text-right font-mono text-xs text-[var(--color-primary)]">
                                                {formatSize(item.sizeBytes)}
                                            </div>
                                            <div className="col-span-2 flex items-center justify-end gap-2">
                                                {item.category === 'projects' || item.category === 'backups' ? (
                                                    <button onClick={() => handleLoad(item)} className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-black rounded-lg transition-all" title="불러오기">
                                                        <Download size={14} />
                                                    </button>
                                                ) : null}
                                                <button onClick={() => deleteItem(item)} className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all opacity-0 group-hover:opacity-100" title="삭제">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Details Footer */}
                            <div className="p-4 bg-black/30 border-t border-[var(--color-border)] flex items-center justify-between">
                                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                                    <Info size={12} className="text-blue-500" />
                                    <span>상세 내역에서는 개별 파일을 직접 확인하고 복구하거나 삭제할 수 있습니다.</span>
                                </div>
                                <div className="text-[11px] font-bold text-white">
                                    전체 {filteredItems.length}개 항목 | {formatSize(filteredItems.reduce((s, i) => s + i.sizeBytes, 0))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
