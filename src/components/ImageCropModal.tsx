import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check } from 'lucide-react';

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

    console.log('[ImageCropModal] Initialized with Aspect Ratio:', aspectRatio);

    // Convert aspect ratio string to number
    const getAspectRatioValue = (ratio: string): number => {
        if (ratio === '16:9') return 16 / 9;
        if (ratio === '9:16') return 9 / 16;
        if (ratio === '1:1') return 1;
        if (ratio === '2.35:1') return 2.35;
        return 16 / 9; // default
    };

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;

        const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
        onConfirm(croppedImage);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
            <div className="w-full h-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--color-surface)] border border-[var(--color-border)] m-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <h3 className="text-lg font-bold text-white">Crop Reference Image</h3>
                    <button
                        onClick={onCancel}
                        className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="flex-1 relative bg-[var(--color-bg)] min-h-[400px]">
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
                                background: 'var(--color-bg)',
                            },
                            cropAreaStyle: {
                                border: '2px solid var(--color-primary)',
                            },
                        }}
                    />
                </div>

                {/* Controls */}
                <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="mb-4">
                        <label className="text-sm text-[var(--color-text-muted)] mb-2 block">
                            Zoom: {zoom.toFixed(1)}x
                        </label>
                        <input
                            type="range"
                            min={0.1} // Allow zooming out
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full"
                        />
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex items-center gap-2 px-6 py-2 bg-[var(--color-primary)] text-black font-bold rounded-none hover:opacity-90 transition-opacity"
                        >
                            <Check size={16} />
                            Confirm Crop
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper function to create cropped image
const getCroppedImg = (imageSrc: string, pixelCrop: any): Promise<string> => {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            // Set canvas size to cropped dimensions
            const maxSize = 1024;
            let outputWidth = pixelCrop.width;
            let outputHeight = pixelCrop.height;

            // Scale down if too large
            if (outputWidth > outputHeight) {
                if (outputWidth > maxSize) {
                    outputHeight = (maxSize / outputWidth) * outputHeight;
                    outputWidth = maxSize;
                }
            } else {
                if (outputHeight > maxSize) {
                    outputWidth = (maxSize / outputHeight) * outputWidth;
                    outputHeight = maxSize;
                }
            }

            canvas.width = outputWidth;
            canvas.height = outputHeight;

            // Fill with black background (for zoomed out images)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, outputWidth, outputHeight);

            // Calculate scaling factor
            const scaleX = outputWidth / pixelCrop.width;
            const scaleY = outputHeight / pixelCrop.height;

            // Calculate destination coordinates
            // We draw the entire image offset by the crop position
            const dx = -pixelCrop.x * scaleX;
            const dy = -pixelCrop.y * scaleY;
            const dWidth = image.width * scaleX;
            const dHeight = image.height * scaleY;

            // Draw image
            ctx.drawImage(
                image,
                0, 0, image.width, image.height, // Source: entire image
                dx, dy, dWidth, dHeight          // Dest: offset and scaled
            );

            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        image.src = imageSrc;
    });
};
