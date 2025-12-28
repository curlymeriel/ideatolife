import { lazy, type ComponentType } from 'react';

/**
 * A wrapper around React.lazy that automatically refreshes the page
 * if a chunk fails to load (e.g., due to a new deployment).
 */
export const lazyImport = <T extends ComponentType<any>>(
    factory: () => Promise<{ default: T }>
) => {
    return lazy(async () => {
        try {
            const module = await factory();
            // If load succeeds, clear the reload flag so future errors can trigger reload again
            sessionStorage.removeItem('chunk_load_error_reload');
            return module;
        } catch (error: any) {
            const isChunkLoadError = error?.message?.includes('Failed to fetch dynamically imported module') ||
                error?.message?.includes('Importing a module script failed') ||
                error?.name === 'ChunkLoadError';

            // If it's a chunk load error and we haven't reloaded yet
            if (isChunkLoadError) {
                const storageKey = 'chunk_load_error_reload';
                const hasReloaded = sessionStorage.getItem(storageKey);

                if (!hasReloaded) {
                    console.warn('[LazyImport] Chunk load failed. Reloading page to fetch new version...');
                    sessionStorage.setItem(storageKey, 'true');
                    window.location.reload();
                    // Return a never-resolving promise to wait for reload
                    return new Promise<{ default: T }>(() => { });
                }
            }

            // If we already reloaded or it's a different error, throw it
            throw error;
        }
    });
};
