export interface VideoCut {
    imageUrl: string;
    audioUrl?: string;
    sfxUrl?: string;
    sfxVolume?: number;
    sfxName?: string;
    sfxDescription?: string;
    duration: number;
    videoUrl?: string;  // Video clip URL (if available, used instead of image)
    speaker?: string;
    dialogue?: string;
}

export interface ProjectExportInfo {
    seriesName: string;
    episodeName: string;
    storylineTable?: any[];
}

/**
 * Export video assets as ZIP with automation script
 * Browser-based video encoding is unreliable - this provides all assets
 * for easy video creation with external tools
 */
export async function exportVideo(
    cuts: VideoCut[],
    onProgress?: (progress: number, status: string) => void,
    projectInfo?: ProjectExportInfo
): Promise<{ blob: Blob; fileExtension: string }> {
    console.log('[VideoExport] Exporting assets for', cuts.length, 'cuts');

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Download all images/videos and audio
    for (let i = 0; i < cuts.length; i++) {
        const cut = cuts[i];
        const cutNum = String(i + 1).padStart(3, '0');
        onProgress?.((i / cuts.length) * 90, `Downloading ${i + 1}/${cuts.length}...`);

        // Download video clip if available, otherwise image
        if (cut.videoUrl) {
            try {
                const videoResponse = await fetch(cut.videoUrl);
                const videoBlob = await videoResponse.blob();
                const ext = cut.videoUrl.includes('webm') ? 'webm' : 'mp4';
                zip.file(`${cutNum}_video.${ext}`, videoBlob);
            } catch (error) {
                console.error(`Failed to fetch video ${i}:`, error);
            }
        }

        // Always include image as fallback
        try {
            const imgResponse = await fetch(cut.imageUrl);
            const imgBlob = await imgResponse.blob();
            zip.file(`${cutNum}_image.jpg`, imgBlob);
        } catch (error) {
            console.error(`Failed to fetch image ${i}:`, error);
        }

        // Download audio
        if (cut.audioUrl) {
            try {
                const audioResponse = await fetch(cut.audioUrl);
                const audioBlob = await audioResponse.blob();
                zip.file(`${cutNum}_audio.mp3`, audioBlob);
            } catch (error) {
                console.error(`Failed to fetch audio ${i}:`, error);
            }
        }

        // Download SFX
        if (cut.sfxUrl) {
            try {
                const sfxResponse = await fetch(cut.sfxUrl);
                const sfxBlob = await sfxResponse.blob();
                zip.file(`${cutNum}_sfx.mp3`, sfxBlob);
            } catch (error) {
                console.error(`Failed to fetch SFX ${i}:`, error);
            }
        }
    }

    // Create metadata with video support
    const metadata = {
        pj: {
            seriesName: projectInfo?.seriesName || 'Empty Story',
            episodeName: projectInfo?.episodeName || 'Empty Episode',
            storyline: projectInfo?.storylineTable || []
        },
        cuts: cuts.map((cut, i) => ({
            number: i + 1,
            duration: cut.duration,
            speaker: cut.speaker || '',
            dialogue: cut.dialogue || '',
            image: `${String(i + 1).padStart(3, '0')}_image.jpg`,
            video: cut.videoUrl ? `${String(i + 1).padStart(3, '0')}_video.${cut.videoUrl.includes('webm') ? 'webm' : 'mp4'}` : null,
            audio: cut.audioUrl ? `${String(i + 1).padStart(3, '0')}_audio.mp3` : null,
            sfx: cut.sfxUrl ? `${String(i + 1).padStart(3, '0')}_sfx.mp3` : null,
            sfxVolume: cut.sfxVolume || 0.3,
            sfxName: cut.sfxName || '',
            sfxDescription: cut.sfxDescription || '',
            hasVideoClip: !!cut.videoUrl
        })),
        totalDuration: cuts.reduce((sum, cut) => sum + cut.duration, 0)
    };

    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // Create FFmpeg script for automatic video creation
    const ffmpegScript = `# FFmpeg Script to Create Video
# Install FFmpeg: https://ffmpeg.org/download.html
# Then run: ffmpeg -f concat -safe 0 -i filelist.txt -c:v libx264 -pix_fmt yuv420p -c:a aac output.mp4

# Windows PowerShell:
# First, create file list
$files = @()
${cuts.map((cut, i) => {
        const num = String(i + 1).padStart(3, '0');
        const duration = cut.duration;
        const hasAudio = cut.audioUrl ? 'yes' : 'no';
        const hasSfx = cut.sfxUrl ? 'yes' : 'no';
        const sfxVol = cut.sfxVolume || 0.3;

        let cmd = '';
        if (cut.sfxUrl && cut.audioUrl) {
            // Mix Audio + SFX
            cmd = `ffmpeg -loop 1 -t ${duration} -i ${num}_image.jpg -i ${num}_audio.mp3 -i ${num}_sfx.mp3 -filter_complex "[2:a]volume=${sfxVol}[sfx];[1:a][sfx]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -shortest ${num}_segment.mp4`;
        } else if (cut.audioUrl) {
            // Audio only
            cmd = `ffmpeg -loop 1 -t ${duration} -i ${num}_image.jpg -i ${num}_audio.mp3 -c:a aac -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -shortest ${num}_segment.mp4`;
        } else if (cut.sfxUrl) {
            // SFX only
            cmd = `ffmpeg -loop 1 -t ${duration} -i ${num}_image.jpg -i ${num}_sfx.mp3 -filter_complex "[1:a]volume=${sfxVol}[aout]" -map 0:v -map "[aout]" -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -shortest ${num}_segment.mp4`;
        } else {
            // Image only
            cmd = `ffmpeg -loop 1 -t ${duration} -i ${num}_image.jpg -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" ${num}_segment.mp4`;
        }

        return `# Cut ${i + 1}: ${duration}s (audio: ${hasAudio}, sfx: ${hasSfx})\n${cmd}`;
    }).join('\n')}

# Then concatenate all segments
(Get-ChildItem -Filter "*_segment.mp4" | Sort-Object Name | ForEach-Object { "file '$($_.Name)'" }) | Out-File -Encoding utf8 filelist.txt
ffmpeg -f concat -safe 0 -i filelist.txt -c copy final_video.mp4
`;

    zip.file('CREATE_VIDEO.ps1', ffmpegScript);

    // Create README
    const readme = `VIDEO EXPORT PACKAGE
====================

This ZIP contains all assets to create your video.

CONTENTS:
- Images: XXX_image.jpg
- Audio: XXX_audio.mp3  
- metadata.json: Cut durations and info
- CREATE_VIDEO.ps1: Automated FFmpeg script

OPTION 1: Automatic (FFmpeg)
----------------------------
1. Install FFmpeg: https://ffmpeg.org/download.html
2. Extract this ZIP
3. Run: powershell -ExecutionPolicy Bypass -File CREATE_VIDEO.ps1
4. Output: final_video.mp4

OPTION 2: Manual (Video Editor)
--------------------------------
Use any video editor:
- DaVinci Resolve (Free): https://www.blackmagicdesign.com/products/davinciresolve
- Shotcut (Free): https://shotcut.org
- OpenShot (Free): https://www.openshot.org

Steps:
1. Import all images in order
2. Set each image duration per metadata.json
3. Add corresponding audio files
4. Export as MP4

The automatic script is faster, but manual editing gives you more control!
`;

    zip.file('README.txt', readme);

    onProgress?.(95, 'Creating ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    onProgress?.(100, 'Complete!');
    return {
        blob: zipBlob,
        fileExtension: 'zip'
    };
}
