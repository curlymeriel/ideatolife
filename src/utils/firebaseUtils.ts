/**
 * Firebase Utilities
 * 
 * Firestore-specific data handling and sanitization.
 */

/**
 * Recursively removes undefined values from an object.
 * Firestore does not support 'undefined' as a field value and throws an error.
 * Removing the keys entirely is safer for security rules that expect specific types.
 */
export const sanitizeFirestoreData = (data: any): any => {
    // Handle Primitive Types
    if (data === undefined) return undefined;
    if (data === null) return null;
    if (typeof data === 'number') {
        if (Number.isNaN(data)) return null;
        if (!Number.isFinite(data)) return null;
    }
    if (typeof data === 'function' || typeof data === 'symbol') return undefined;
    if (typeof data !== 'object') return data;

    // [FIX] Explicitly exclude File, Blob, and other non-serializable browser objects
    // Firestore only supports plain objects, arrays, and SDK-specific types like FieldValue/Timestamp.
    if (data instanceof File || data instanceof Blob) {
        console.warn('[Sanitizer] Removing non-serializable File/Blob object from Firestore payload');
        return undefined;
    }

    // [FIX] Preserve Firebase/Firestore internal objects (FieldValue, Timestamp, etc.)
    const proto = Object.getPrototypeOf(data);
    if (proto !== Object.prototype && proto !== Array.prototype && data !== null) {
        // Special case: Ensure we don't accidentally pass other custom classes that aren't Firestore SDK types
        // Most SDK types have a specific name or internal structure.
        return data;
    }

    // Handle Plain Objects and Arrays
    if (Array.isArray(data)) {
        return data
            .map(item => sanitizeFirestoreData(item))
            .filter(item => item !== undefined);
    }

    if (data !== null && typeof data === 'object') {
        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            // [FIX] Sanitizing keys: Firestore keys cannot contain dots (.)
            // This is common when using filenames or URLs as keys.
            const safeKey = key.replace(/\./g, '_');
            const result = sanitizeFirestoreData(value);
            if (result !== undefined) {
                sanitized[safeKey] = result;
            }
        }
        return sanitized;
    }

    return data;
};

