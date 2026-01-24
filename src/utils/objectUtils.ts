/**
 * Deep merges two objects.
 * - Arrays are replaced, not merged (to avoid duplicating list items).
 * - Objects are merged recursively.
 * - Primitive values in 'source' overwrite 'target'.
 */
export function deepMerge<T>(target: T, source: any): T {
    if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
        return source as T;
    }

    if (Array.isArray(source)) {
        // For our Strategy object, we usually want to replace arrays (e.g. new list of keywords)
        // rather than merging them, which would cause duplicates.
        return source as any as T;
    }

    const output = { ...target } as any;

    Object.keys(source).forEach(key => {
        const sourceValue = source[key];
        const targetValue = output[key];

        if (Array.isArray(sourceValue)) {
            output[key] = sourceValue;
        } else if (typeof sourceValue === 'object' && sourceValue !== null && targetValue && typeof targetValue === 'object') {
            output[key] = deepMerge(targetValue, sourceValue);
        } else {
            output[key] = sourceValue;
        }
    });

    return output;
}
