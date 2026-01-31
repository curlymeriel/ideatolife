
import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Film, Layers, Monitor } from 'lucide-react';

interface ReferenceSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (asset: { url: string; name?: string; type?: string; id?: string }) => void;
    projectAssets: Array<{ id: string; name: string; url: string; type: string }>;
    pastCuts: Array<{ id: string; url: string; index: number }>;
    drafts: string[];
}

export const ReferenceSelectorModal: React.FC<ReferenceSelectorModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    projectAssets,
    pastCuts,
    drafts
}) => {
    const [activeTab, setActiveTab] = useState<'assets' | 'cuts' | 'drafts'>('assets');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            onSelect({ url: reader.result as string, name: 'Upload', type: 'style' });
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <div className="w-full max-w-5xl h-[80vh] bg-[#1a1a1a] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <ImageIcon className="text-[var(--color-primary)]" />
                        Select Reference Image
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-all rounded-full hover:bg-white/10">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 bg-black/20">
                    <button
                        onClick={() => setActiveTab('assets')}
                        className={`flex-1 py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'assets' ? 'bg-[#1a1a1a] text-[var(--color-primary)] border-t-2 border-[var(--color-primary)]' : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Layers size={16} /> Key Visuals ({projectAssets.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('cuts')}
                        className={`flex-1 py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'cuts' ? 'bg-[#1a1a1a] text-[var(--color-primary)] border-t-2 border-[var(--color-primary)]' : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Film size={16} /> Past Cuts ({pastCuts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('drafts')}
                        className={`flex-1 py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'drafts' ? 'bg-[#1a1a1a] text-[var(--color-primary)] border-t-2 border-[var(--color-primary)]' : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Monitor size={16} /> Session Drafts ({drafts.length})
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#121212] custom-scrollbar">
                    {/* Upload Banner */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="mb-8 w-full h-24 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center gap-4 text-gray-400 hover:text-white hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all cursor-pointer group"
                    >
                        <div className="p-3 bg-white/5 rounded-full group-hover:bg-[var(--color-primary)]/20 transition-all">
                            <Upload size={24} />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-bold">Upload from Computer</p>
                            <p className="text-xs text-gray-500">Click to browse local files</p>
                        </div>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="image/*" />
                    </div>

                    {/* Grids */}
                    {activeTab === 'assets' && (
                        <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {projectAssets.map((asset) => (
                                <button key={asset.id} onClick={() => onSelect({ url: asset.url, name: asset.name, type: asset.type, id: asset.id })} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all bg-black">
                                    <img src={asset.url} alt={asset.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" />
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                                        <p className="text-[10px] font-bold text-white truncate text-center">{asset.name}</p>
                                        <p className="text-[9px] text-[var(--color-primary)] text-center uppercase tracking-tighter">{asset.type}</p>
                                    </div>
                                </button>
                            ))}
                            {projectAssets.length === 0 && <p className="col-span-full text-center text-gray-500 py-10">No key visuals found.</p>}
                        </div>
                    )}

                    {activeTab === 'cuts' && (
                        <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {pastCuts.map((cut) => (
                                <button key={cut.id} onClick={() => onSelect({ url: cut.url, name: `Cut #${cut.index}`, type: 'composition', id: String(cut.id) })} className="group relative aspect-video rounded-xl overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all bg-black">
                                    <img src={cut.url} alt={`Cut ${cut.index}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                        <span className="px-2 py-1 bg-[var(--color-primary)] text-black text-[10px] font-black rounded">SELECT</span>
                                    </div>
                                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-bold text-white">CUT {cut.index}</div>
                                </button>
                            ))}
                            {pastCuts.length === 0 && <p className="col-span-full text-center text-gray-500 py-10">No completed cuts yet.</p>}
                        </div>
                    )}

                    {activeTab === 'drafts' && (
                        <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {drafts.map((url, i) => (
                                <button key={i} onClick={() => onSelect({ url, name: `Draft #${i + 1}`, type: 'style' })} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-[var(--color-primary)] transition-all bg-black">
                                    <img src={url} alt={`Draft ${i}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                        <span className="px-2 py-1 bg-[var(--color-primary)] text-black text-[10px] font-black rounded">SELECT</span>
                                    </div>
                                </button>
                            ))}
                            {drafts.length === 0 && <p className="col-span-full text-center text-gray-500 py-10">No drafts in this session.</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
