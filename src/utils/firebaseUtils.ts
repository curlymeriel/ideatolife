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
        if (Number.isNaN(data)) return null; // [FIX] Firestore cannot store NaN
        if (!Number.isFinite(data)) return null; // [FIX] Firestore cannot store Infinity
    }
    if (typeof data !== 'object') return data;



    // Handle Dates/Timestamps (don't recurse into them)
    if (data instanceof Date) return data;

    // [FIX] Filter out unsupported types that crash Firestore save
    if (typeof File !== 'undefined' && data instanceof File) return undefined;
    if (typeof Blob !== 'undefined' && data instanceof Blob) return undefined;
    if (typeof Function === 'function' && data instanceof Function) return undefined;
    if (typeof Symbol !== 'undefined' && typeof data === 'symbol') return undefined;

    // [FIX] Convert specific unsupported types (like Error objects) to strings
    if (data instanceof Error) return data.message;


    // Handle Arrays
    if (Array.isArray(data)) {
        return data
            .map(item => sanitizeFirestoreData(item))
            .filter(item => item !== undefined); // Remove undefined items from arrays
    }

    // Handle Objects
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
        const result = sanitizeFirestoreData(value);
        if (result !== undefined) {
            sanitized[key] = result;
        }
    }
    return sanitized;
};

