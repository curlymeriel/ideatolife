import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import type { WatermarkSettings } from '../../store/types';
import { saveToIdb, generateWatermarkKey, resolveUrl } from '../../utils/imageStorage';

interface Props {
    projectId: string;
    watermarkSettings?: WatermarkSettings;
    aspectRatio?: string;
    previewBackground?: string | null;
    onUpdate: (settings: Partial<WatermarkSettings>) => void;
    onClose: () => void;
}

export const WatermarkSettingsModal: React.FC<Props> = ({
    projectId,
    watermarkSettings,
    aspectRatio = '16:9',
    previewBackground,
    onUpdate,
    onClose
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Live local state for sliders (for smoother UI)
    const posX = watermarkSettings?.positionX ?? 90;
    const posY = watermarkSettings?.positionY ?? 90;
    const scale = watermarkSettings?.scale ?? 0.2;
    const opacity = watermarkSettings?.opacity ?? 0.8;

    // Initial load of image preview from IDB
    useEffect(() => {
        const loadPreview = async () => {
            if (watermarkSettings?.imageUrl) {
                const resolved = await resolveUrl(watermarkSettings.imageUrl);
                setPreviewUrl(resolved);
            } else {
                setPreviewUrl(null);
            }
        };
        loadPreview();
    }, [watermarkSettings?.imageUrl]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result as string;
                const key = generateWatermarkKey(projectId);
                const idbUrl = await saveToIdb('images', key, base64Data);
                onUpdate({ imageUrl: idbUrl });
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Failed to upload watermark image:', error);
            alert('Failed to save the image. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = () => {
        onUpdate({ imageUrl: '' });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getAspectCss = () => {
        if (aspectRatio === '9:16') return '9/16';
        if (aspectRatio === '1:1') return '1/1';
        if (aspectRatio === '2.35:1') return '1000/425';
        return '16/9';
    };

    // Compute watermark style inside preview pane using posX/posY anchor logic.
    // posX=0 → left edge, posX=100 → right edge (anchor: left edge of watermark)
    // We translate by -50% to make it a center anchor (more intuitive)
    const getWatermarkPreviewStyle = (): React.CSSProperties => {
        // posX/posY are 0-100%: where to put the CENTER of the watermark
        return {
            position: 'absolute',
            left: `${posX}%`,
            top: `${posY}%`,
            transform: 'translate(-50%, -50%)',
            width: `${scale * 100}%`,
            opacity: opacity,
            pointerEvents: 'none',
            zIndex: 10,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
        };
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-5xl glass-panel rounded-2xl flex flex-col md:flex-row max-h-[90vh] overflow-hidden border border-white/10 shadow-2xl">

                {/* Left Side: Preview Pane */}
                <div className="w-full md:w-[60%] p-6 flex flex-col border-b md:border-b-0 md:border-r border-white/10 bg-black/60 items-center justify-center min-h-[300px]">
                    <div className="w-full h-full flex items-center justify-center relative">
                        {/* Aspect Ratio Box */}
                        <div
                            className="relative bg-black border border-white/20 rounded-lg overflow-hidden shadow-2xl"
                            style={{
                                aspectRatio: getAspectCss(),
                                width: aspectRatio === '9:16' ? 'auto' : '100%',
                                height: aspectRatio === '9:16' ? '100%' : 'auto',
                                maxHeight: '100%',
                                maxWidth: '100%'
                            }}
                        >
                            {previewBackground ? (
                                <img src={previewBackground} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="Preview" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">
                                    No Preview
                                </div>
                            )}

                            {/* Watermark live preview */}
                            {previewUrl && (
                                <img
                                    src={previewUrl}
                                    alt="Watermark"
                                    style={getWatermarkPreviewStyle()}
                                    className="max-w-full object-contain"
                                />
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3 text-center">
                        슬라이더를 조절하면 미리보기에서 실시간으로 확인할 수 있습니다.
                    </p>
                </div>

                {/* Right Side: Settings Pane */}
                <div className="w-full md:w-[40%] flex flex-col overflow-hidden bg-black/20">

                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <ImageIcon className="text-[var(--color-primary)]" size={24} />
                            워터마크 설정
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-5 overflow-y-auto flex flex-col gap-5 flex-1">

                        {/* Image Upload */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                로고 이미지 (PNG 권장)
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/png, image/jpeg"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />

                                {previewUrl ? (
                                    <div className="relative group w-16 h-16 rounded-lg border border-white/20 bg-black/50 overflow-hidden flex items-center justify-center shrink-0">
                                        <img src={previewUrl} alt="Watermark" className="max-w-full max-h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                            <button
                                                onClick={handleRemove}
                                                className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                                                title="제거"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="w-16 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 flex flex-col items-center justify-center gap-1 text-[var(--color-text-muted)] hover:text-white transition-all disabled:opacity-50 shrink-0"
                                    >
                                        <Upload size={18} />
                                        <span className="text-[10px]">업로드</span>
                                    </button>
                                )}

                                <p className="text-xs text-gray-500 leading-relaxed">
                                    배경 투명 PNG 권장.<br />
                                    {previewUrl ? (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-[var(--color-primary)] hover:underline mt-0.5"
                                        >
                                            이미지 교체
                                        </button>
                                    ) : '이미지를 먼저 업로드하세요.'}
                                </p>
                            </div>
                        </div>

                        <div className="h-px bg-white/10" />

                        {/* Position X Slider */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                    가로 위치 (X)
                                </label>
                                <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded font-mono">
                                    {Math.round(posX)}%
                                </span>
                            </div>
                            <div className="relative">
                                <div className="flex justify-between text-[10px] text-gray-600 mb-1 px-0.5">
                                    <span>← 왼쪽</span>
                                    <span>오른쪽 →</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={posX}
                                    onChange={(e) => onUpdate({ positionX: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--color-primary)] h-2 cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Position Y Slider */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                    세로 위치 (Y)
                                </label>
                                <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded font-mono">
                                    {Math.round(posY)}%
                                </span>
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-gray-600 mb-1 px-0.5">
                                    <span>↑ 위</span>
                                    <span>아래 ↓</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={posY}
                                    onChange={(e) => onUpdate({ positionY: parseInt(e.target.value) })}
                                    className="w-full accent-[var(--color-primary)] h-2 cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Quick Preset Buttons */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                빠른 위치 선택
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {[
                                    { label: '↖', x: 10, y: 10 },
                                    { label: '↑', x: 50, y: 10 },
                                    { label: '↗', x: 90, y: 10 },
                                    { label: '←', x: 10, y: 50 },
                                    { label: '⊙', x: 50, y: 50 },
                                    { label: '→', x: 90, y: 50 },
                                    { label: '↙', x: 10, y: 90 },
                                    { label: '↓', x: 50, y: 90 },
                                    { label: '↘', x: 90, y: 90 },
                                ].map((preset) => {
                                    const isActive = Math.round(posX) === preset.x && Math.round(posY) === preset.y;
                                    return (
                                        <button
                                            key={`${preset.x}-${preset.y}`}
                                            onClick={() => onUpdate({ positionX: preset.x, positionY: preset.y })}
                                            className={`py-2 rounded-lg border text-sm font-bold transition-all ${isActive
                                                ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-[var(--color-primary)]'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="h-px bg-white/10" />

                        {/* Scale */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                    크기 (Scale)
                                </label>
                                <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded font-mono">
                                    {Math.round(scale * 100)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0.03"
                                max="0.5"
                                step="0.01"
                                value={scale}
                                onChange={(e) => onUpdate({ scale: parseFloat(e.target.value) })}
                                className="w-full accent-[var(--color-primary)] h-2 cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-gray-600 px-0.5">
                                <span>3%</span>
                                <span>50%</span>
                            </div>
                        </div>

                        {/* Opacity */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                    투명도 (Opacity)
                                </label>
                                <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded font-mono">
                                    {Math.round(opacity * 100)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1.0"
                                step="0.05"
                                value={opacity}
                                onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
                                className="w-full accent-[var(--color-primary)] h-2 cursor-pointer"
                            />
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/10 flex justify-end shrink-0">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-[var(--color-primary)] text-black font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors"
                        >
                            완료
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
