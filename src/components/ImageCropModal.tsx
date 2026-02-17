import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Cropper from 'react-easy-crop';
import { X, Check, Loader2 } from 'lucide-react';

interface ImageCropModalProps {
    imageSrc: string;
    aspectRatio: string; // '16:9', '9:16', '1:1', '2.35:1'
    onConfirm: (croppedImage: string) => void;
    onCancel: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
    imageSrc,
    aspectRatio,
    onConfirm,
    onCancel
}) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    console.log('[ImageCropModal] Initialized with Aspect Ratio:', aspectRatio);

    // Convert aspect ratio string to number
    const getAspectRatioValue = (ratio: string): number => {
        if (!ratio) return 16 / 9;

        // Handle "W:H" format (e.g., 16:9, 4:5, 21:9)
        if (ratio.includes(':') && !ratio.includes('2.35')) {
            const [wStr, hStr] = ratio.split(':');
            const w = parseFloat(wStr);
            const h = parseFloat(hStr);
            if (!isNaN(w) && !isNaN(h) && h !== 0) {
                return w / h;
            }
        }

        if (ratio === '2.35:1') return 2.35;

        return 16 / 9; // default
    };

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels || isProcessing) return;

        setIsProcessing(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
            onConfirm(croppedImage);
        } catch (error) {
            console.error('[ImageCropModal] Crop failed:', error);
            alert('이미지 크롭에 실패했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="w-full h-full max-w-4xl max-h-[90vh] flex flex-col bg-[#1a1a1a] border border-white/10 m-4 shadow-2xl rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)]">
                            <Check size={20} />
                        </div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">Crop Image</h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="flex-1 relative bg-black min-h-[400px]">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={getAspectRatioValue(aspectRatio)}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        restrictPosition={false} // Allow zooming out / moving image freely
                        style={{
                            containerStyle: {
                                background: '#000',
                            },
                            cropAreaStyle: {
                                border: '2px solid var(--color-primary)',
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
                            },
                        }}
                    />
                </div>

                {/* Controls */}
                <div className="p-6 border-t border-white/5 bg-black/40">
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Zoom Scale
                                </label>
                                <span className="text-[10px] font-mono text-[var(--color-primary)] font-bold">{Math.round(zoom * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min={0.1}
                                max={3}
                                step={0.1}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full accent-[var(--color-primary)] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="flex gap-3 justify-end shrink-0">
                            <button
                                onClick={onCancel}
                                className="px-6 py-3 text-sm font-black text-gray-400 hover:text-white transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isProcessing || !croppedAreaPixels}
                                className="flex items-center gap-3 px-8 py-3 bg-[var(--color-primary)] text-black font-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:scale-100"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        PROCESSING...
                                    </>
                                ) : (
                                    <>
                                        <Check size={18} />
                                        CONFIRM CROP
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};


// Helper function to create cropped image (optimized)
const getCroppedImg = (imageSrc: string, pixelCrop: any): Promise<string> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        // Handle CORs if source is external
        if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) {
            image.crossOrigin = 'anonymous';
        }

        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get 2d context'));
                    return;
                }

                // Step 1: Calculate output dimensions (cap at 2048 for memory safety)
                const maxSize = 2048;
                let outputWidth = pixelCrop.width;
                let outputHeight = pixelCrop.height;

                const scale = Math.min(1, maxSize / Math.max(outputWidth, outputHeight));
                outputWidth *= scale;
                outputHeight *= scale;

                canvas.width = outputWidth;
                canvas.height = outputHeight;

                // Step 2: Use Source Rect drawImage for maximum performance
                // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
                ctx.drawImage(
                    image,
                    pixelCrop.x,
                    pixelCrop.y,
                    pixelCrop.width,
                    pixelCrop.height,
                    0,
                    0,
                    outputWidth,
                    outputHeight
                );

                // Step 3: Export with reasonable quality
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (err) {
                reject(err);
            }
        };

        image.onerror = (err) => {
            console.error('[getCroppedImg] Image load error:', err);
            reject(new Error('Failed to load image for cropping'));
        };

        image.src = imageSrc;
    });
};
