// Helper parsers for AudioConfig
export function parseRate(rate: string): number {
    if (!rate) return 1.0;

    // Handle percentages (e.g., '110%')
    if (rate.endsWith('%')) {
        const pct = parseFloat(rate.replace('%', ''));
        return isNaN(pct) ? 1.0 : pct / 100;
    }

    // Handle keywords
    switch (rate.toLowerCase()) {
        case 'x-slow': return 0.4;
        case 'slow': return 0.7;
        case 'medium': return 1.0;
        case 'fast': return 1.3;
        case 'x-fast': return 1.6;
    }

    // Handle raw numbers (e.g., '1.2')
    const num = parseFloat(rate);
    return isNaN(num) ? 1.0 : num;
}

export function parsePitch(pitch: string): number {
    if (!pitch) return 0.0;

    // Handle semitones (e.g., '+2st', '-1.5st')
    if (pitch.endsWith('st')) {
        return parseFloat(pitch.replace('st', '')) || 0.0;
    }

    // Handle raw numbers
    return parseFloat(pitch) || 0.0;
}

export function parseVolume(volume: string): number {
    if (!volume) return 0.0;

    // Handle dB (e.g., '+3dB', '-2dB')
    if (volume.toLowerCase().endsWith('db')) {
        return parseFloat(volume.toLowerCase().replace('db', '')) || 0.0;
    }

    // Handle keywords (approximate based on SSML spec)
    switch (volume.toLowerCase()) {
        case 'silent': return -100.0; // Effectively silent
        case 'x-soft': return -6.0;
        case 'soft': return -3.0;
        case 'medium': return 0.0;
        case 'loud': return 3.0;
        case 'x-loud': return 6.0;
    }

    return 0.0;
}
