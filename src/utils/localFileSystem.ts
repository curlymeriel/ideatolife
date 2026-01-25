
/**
 * Utility for modern Browser File System Access API
 * Allows saving projects and assets directly to a user-selected local folder.
 */

export interface LocalFolderHandle {
    handle: FileSystemDirectoryHandle;
    name: string;
}

/**
 * Prompt user to select a directory for synchronization
 */
export async function selectLocalFolder(): Promise<LocalFolderHandle | null> {
    try {
        // File System Access API - experimental, type assertion needed
        const handle = await (window as any).showDirectoryPicker({
            mode: 'readwrite'
        });
        return {
            handle,
            name: handle.name
        };
    } catch (error: any) {
        if (error.name === 'AbortError') return null;
        console.error("Failed to select directory:", error);
        throw error;
    }
}

/**
 * Save a file to the specified directory handle
 */
export async function saveFileToHandle(
    directoryHandle: FileSystemDirectoryHandle,
    path: string[], // e.g. ['projects', 'id-123.json']
    content: string | Blob | ArrayBuffer
): Promise<void> {
    let currentDir = directoryHandle;

    // Traverse/create folders
    for (let i = 0; i < path.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(path[i], { create: true });
    }

    const fileName = path[path.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    await writable.write(content);
    await writable.close();
}

/**
 * Read all files from a directory handle recursively or flatly
 */
export async function readFilesFromDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    path: string[] = []
): Promise<{ name: string; path: string[]; file: File }[]> {
    const results: { name: string; path: string[]; file: File }[] = [];

    // @ts-ignore - values() is part of the FileSystemDirectoryHandle spec
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            results.push({ name: entry.name, path: [...path, entry.name], file });
        } else if (entry.kind === 'directory') {
            const subDir = await readFilesFromDirectory(entry, [...path, entry.name]);
            results.push(...subDir);
        }
    }

    return results;
}

/**
 * Broadcast sync status
 */
export function notifySync(fileName: string) {
    console.log(`[LocalSync] Saved: ${fileName}`);
}
