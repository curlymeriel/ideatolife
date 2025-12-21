
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { ProjectData } from '../store/types';
import { generateSRT } from './srtGenerator';
import { resolveUrl, isIdbUrl } from './imageStorage';

// Helper to get file extension from mime type
const getExtension = (mimeType: string): string => {
    // Images
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('gif')) return 'gif';

    // Audio
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('aac')) return 'aac';
    if (mimeType.includes('m4a')) return 'm4a';
    if (mimeType.includes('flac')) return 'flac';

    return 'bin';
};

// Resource fetcher that handles IDB resolution
const fetchResource = async (url: string | null | undefined): Promise<{ payload: Blob | string, mimeType: string, isBase64: boolean } | null> => {
    if (!url) return null;
    try {
        if (isIdbUrl(url)) {
            let resolved = await resolveUrl(url);
            if (!resolved && url.includes('thumbnail-')) {
                try {
                    const { get: idbGet } = await import('idb-keyval');
                    const key = url.replace('idb://', '');
                    const rawData = await idbGet(key);
                    if (rawData && typeof rawData === 'string') resolved = rawData;
                } catch (err) { }
            }
            if (!resolved) return null;
            return await fetchResource(resolved);
        }
        if (url.startsWith('data:')) {
            if (!url.includes(',')) return null;
            const split = url.split(',');
            const typeInfo = split[0].split(':')[1];
            const mimeType = typeInfo.split(';')[0];
            const base64Data = split[1];
            return { payload: base64Data, mimeType, isBase64: true };
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
        const blob = await res.blob();
        return { payload: blob, mimeType: blob.type, isBase64: false };
    } catch (e) {
        console.error("Failed to fetch resource:", url, e);
        return null;
    }
};

/**
 * Generates what we call a "Machine Readable" project.json
 * This replaces absolute/idb URLs with relative paths inside the ZIP
 * e.g., "idb://..." -> "images/cut_001.png"
 */
export const exportProjectToZip = async (projectData: ProjectData): Promise<Blob> => {
    const zip = new JSZip();
    const folderName = `${projectData.seriesName} - ${projectData.episodeName}`;

    const root = zip.folder(folderName);
    if (!root) throw new Error("Failed to create ZIP folder");

    const imagesFolder = root.folder("images");
    const audioFolder = root.folder("audio");
    const keyVisualsFolder = root.folder("key_visuals");

    // We will build a "Portable" Project Data object as we go
    const portableProject = JSON.parse(JSON.stringify(projectData)) as ProjectData;

    console.log(`[ZipExport] Starting export for ${projectData.id}...`);

    const addFileToZip = (folder: JSZip | null, filename: string, resource: { payload: Blob | string, mimeType: string, isBase64: boolean }) => {
        if (!folder) return;
        if (resource.isBase64) {
            try {
                const binaryString = atob(resource.payload as string);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                folder.file(filename, bytes);
            } catch (e) {
                folder.file(filename, resource.payload as string, { base64: true });
            }
        } else {
            folder.file(filename, resource.payload as Blob);
        }
    };

    // 1. Export Script Assets (Images & Audio)
    if (projectData.script) {
        for (let i = 0; i < projectData.script.length; i++) {
            const cut = projectData.script[i];
            if (cut.finalImageUrl) {
                const res = await fetchResource(cut.finalImageUrl);
                if (res) {
                    const ext = getExtension(res.mimeType);
                    const filename = `cut_${String(i + 1).padStart(3, '0')}_final.${ext}`;
                    addFileToZip(imagesFolder, filename, res);
                    portableProject.script[i].finalImageUrl = `images/${filename}`;
                }
            }
            if (cut.draftImageUrl) {
                const res = await fetchResource(cut.draftImageUrl);
                if (res) {
                    const ext = getExtension(res.mimeType);
                    const filename = `cut_${String(i + 1).padStart(3, '0')}_draft.${ext}`;
                    addFileToZip(imagesFolder, filename, res);
                    portableProject.script[i].draftImageUrl = `images/${filename}`;
                }
            }
            if (cut.audioUrl && cut.audioUrl !== 'mock:beep') {
                const res = await fetchResource(cut.audioUrl);
                if (res) {
                    const ext = getExtension(res.mimeType);
                    const filename = `cut_${String(i + 1).padStart(3, '0')}.${ext}`;
                    addFileToZip(audioFolder, filename, res);
                    portableProject.script[i].audioUrl = `audio/${filename}`;
                }
            }
            if (cut.sfxUrl) {
                console.log(`[ZipExport] Processing SFX for Cut ${i + 1}: ${cut.sfxUrl}`);
                const res = await fetchResource(cut.sfxUrl);
                if (res) {
                    const ext = getExtension(res.mimeType);
                    const filename = `cut_${String(i + 1).padStart(3, '0')}_sfx.${ext}`;
                    addFileToZip(audioFolder, filename, res);
                    portableProject.script[i].sfxUrl = `audio/${filename}`;
                    console.log(`[ZipExport] ✅ Included SFX: ${filename}`);
                } else {
                    console.warn(`[ZipExport] ❌ FAILED to fetch SFX for Cut ${i + 1}: ${cut.sfxUrl}`);
                }
            }
        }
    }

    // 2. Export Key Visuals
    const exportedFiles = new Map<string, string>();
    if (projectData.assetDefinitions) {
        for (const [assetId, asset] of Object.entries(projectData.assetDefinitions)) {
            const assetData = asset as any;
            const safeName = (assetData.name || assetId).replace(/[^a-zA-Z0-9가-힣\s]/g, '_').trim();
            const processAssetType = async (type: 'ref' | 'draft' | 'master', url: string | undefined): Promise<string | undefined> => {
                if (!url) return undefined;
                if (exportedFiles.has(url)) return exportedFiles.get(url);
                const res = await fetchResource(url);
                if (res) {
                    const ext = getExtension(res.mimeType);
                    const filename = `${assetData.type}_${safeName}_${type}_${assetId.slice(0, 4)}.${ext}`;
                    addFileToZip(keyVisualsFolder, filename, res);
                    const relativePath = `key_visuals/${filename}`;
                    exportedFiles.set(url, relativePath);
                    return relativePath;
                }
                return undefined;
            };
            if (assetData.referenceImage) portableProject.assetDefinitions[assetId].referenceImage = null as any;
            if (assetData.draftImage) {
                const path = await processAssetType('draft', assetData.draftImage);
                if (path) portableProject.assetDefinitions[assetId].draftImage = path;
            }
            if (assetData.masterImage) {
                const path = await processAssetType('master', assetData.masterImage);
                if (path) portableProject.assetDefinitions[assetId].masterImage = path;
            }
        }
    }

    // 3. Export Thumbnail
    if (projectData.thumbnailUrl) {
        const res = await fetchResource(projectData.thumbnailUrl);
        if (res) {
            const ext = getExtension(res.mimeType);
            const filename = `thumbnail.${ext}`;
            addFileToZip(imagesFolder, filename, res);
            portableProject.thumbnailUrl = `images/${filename}`;
        }
    }

    // 4. Save metadata.xlsx (Comprehensive)
    try {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Detailed Cuts
        let cumulativeTime = 0;
        const cutData = projectData.script.map((cut, index) => {
            const duration = cut.estimatedDuration || 0;
            const startTime = cumulativeTime;
            const endTime = startTime + duration;
            cumulativeTime = endTime;

            // Resolve actual voice ID: Cut-specific override > Global Project Default
            const resolvedVoice = cut.voiceId || (projectData.ttsModel ? `Global: ${projectData.ttsModel}` : 'Not Set');

            return {
                'Cut #': index + 1,
                'Speaker': cut.speaker || '',
                'Dialogue': cut.dialogue || '',
                'Visual Prompt (Image)': cut.visualPrompt || '',
                'Video Prompt (Motion)': cut.videoPrompt || cut.visualPrompt || '',
                'Duration (s)': duration.toFixed(2),
                'Start': startTime.toFixed(2),
                'End': endTime.toFixed(2),
                'Emotion': cut.emotion || '',
                'Voice ID': resolvedVoice,
                'Voice Settings': `G:${cut.voiceGender || 'N'}, A:${cut.voiceAge || 'Adult'}, S:${cut.voiceSpeed || 1.0}, R:${cut.voiceRate || '100%'}, V:${cut.voiceVolume || '0dB'}`,
                'Audio Padding': cut.audioPadding || 0,
                'SFX Name': cut.sfxName || '',
                'SFX Description': cut.sfxDescription || '',
                'SFX Volume': cut.sfxVolume !== undefined ? cut.sfxVolume : 0.3,
                'Locks': `${cut.isAudioConfirmed ? 'AUD ' : ''}${cut.isImageConfirmed ? 'IMG ' : ''}${cut.isVideoConfirmed ? 'VID' : ''}`.trim(),
                'Link to Scene ID': cut.storylineSceneId || ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cutData), "Detailed Cuts");

        // Sheet 2: Project Overview (pj)
        const { episodeNumber, targetDuration, aspectRatio, seriesStory, episodePlot, characters, episodeCharacters, seriesLocations, episodeLocations, seriesProps, episodeProps, masterStyle, assetDefinitions, storylineTable } = projectData;
        const pjRows = [
            { Field: 'Series Name', Value: projectData.seriesName || '' },
            { Field: 'Episode Name', Value: projectData.episodeName || '' },
            { Field: 'Episode Number', Value: episodeNumber || '' },
            { Field: 'Target Duration (s)', Value: targetDuration || '' },
            { Field: 'Aspect Ratio', Value: aspectRatio || '' },
            { Field: 'Global Voice Model', Value: projectData.ttsModel || 'neural2' },
            { Field: 'Series Story', Value: seriesStory || '' },
            { Field: 'Episode Plot', Value: episodePlot || '' },
            { Field: '', Value: '' },

            { Field: '=== Storyline Detailed Flow ===', Value: '' },
            ...(storylineTable || []).map((row, idx) => ({
                Field: `Scene ${idx + 1} (${row.estimatedTime}s)`,
                Value: `[Action]: ${row.content}\n[Director's Note]: ${row.directionNotes || ''}`
            })),
            { Field: '', Value: '' },

            { Field: '=== Global Characters ===', Value: '' },
            ...(characters || []).map(c => ({ Field: c.name, Value: `[${c.role}] ${c.description}` })),
            { Field: '=== Episode Characters ===', Value: '' },
            ...(episodeCharacters || []).map(c => ({ Field: c.name, Value: `[${c.role}] ${c.description}` })),
            { Field: '', Value: '' },

            { Field: '=== Global Locations ===', Value: '' },
            ...(seriesLocations || []).map(l => ({ Field: l.name, Value: l.description })),
            { Field: '=== Episode Locations ===', Value: '' },
            ...(episodeLocations || []).map(l => ({ Field: l.name, Value: l.description })),
            { Field: '', Value: '' },

            { Field: '=== Global Props ===', Value: '' },
            ...(seriesProps || []).map((p: any) => ({ Field: p.name, Value: p.description })),
            { Field: '=== Episode Props ===', Value: '' },
            ...(episodeProps || []).map((p: any) => ({ Field: p.name, Value: p.description })),
            { Field: '', Value: '' },

            { Field: '=== Master Style ===', Value: '' },
            { Field: 'Base Style', Value: masterStyle?.description || '' },
            { Field: 'Character Mod', Value: masterStyle?.characterModifier || '' },
            { Field: 'Background Mod', Value: masterStyle?.backgroundModifier || '' },
            { Field: '', Value: '' },

            { Field: '=== Key Visual Assets (Step 2 Definitions) ===', Value: '' },
            ...Object.values(assetDefinitions || {}).map(asset => ({
                Field: `${asset.type.toUpperCase()}: ${asset.name}`,
                Value: `[Description]: ${asset.description}`
            })),
            { Field: '', Value: '' },
            { Field: 'Export Date', Value: new Date().toISOString() }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pjRows), "Project Overview");

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        root.file("metadata.xlsx", excelBuffer);
    } catch (e) {
        console.warn("Failed to generate Excel for ZIP:", e);
    }

    // 5. Raw Text Exports
    root.file("script.txt", projectData.script.map((cut, i) => `[Cut ${i + 1}] ${cut.speaker}:\n${cut.dialogue}\n\nVisual: ${cut.visualPrompt}\n`).join('\n---\n\n'));
    root.file("subtitles.srt", generateSRT(projectData.script));

    // 6. SOURCE OF TRUTH: project.json
    root.file("project.json", JSON.stringify(portableProject, null, 2));

    return await zip.generateAsync({ type: "blob" });
};
