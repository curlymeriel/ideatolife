/**
 * Motion Presets for Video Prompt Generation
 * 
 * Predefined motion templates for common cinematic scenarios.
 * These can be applied to script cuts to quickly set professional camera work.
 */

export interface MotionPreset {
    id: string;
    name: string;
    nameKR: string;
    category: 'emotional' | 'action' | 'dialogue' | 'establishing' | 'transition';
    template: string;
    cameraWork: string[];
    description: string;
    durationHint: 'short' | 'medium' | 'long' | 'any';
}

export const DEFAULT_MOTION_PRESETS: MotionPreset[] = [
    // ============================================================================
    // EMOTIONAL SHOTS
    // ============================================================================
    {
        id: 'emotional-closeup',
        name: 'Emotional Close-Up',
        nameKR: '감정 클로즈업',
        category: 'emotional',
        template: 'Medium close-up shot framing the face. Camera slowly pushes in to emphasize emotion. Character shows subtle emotional response - eyes glisten, slight changes in expression. Soft diffused lighting creates intimate atmosphere. Shallow depth of field isolates subject.',
        cameraWork: ['MCU', 'Slow Push In', 'Soft Diffused Lighting', 'Shallow DoF'],
        description: 'Intimate shot focusing on emotional expression',
        durationHint: 'medium'
    },
    {
        id: 'contemplative-wide',
        name: 'Contemplative Wide',
        nameKR: '사색 와이드샷',
        category: 'emotional',
        template: 'Wide shot with subject small in frame, surrounded by environment. Slow subtle camera movement. Subject remains still or with minimal movement. Atmospheric lighting with volumetric fog or dust particles. Creates sense of isolation or reflection.',
        cameraWork: ['WS', 'Slow Pan', 'Volumetric Lighting', 'Negative Space'],
        description: 'Wide shot emphasizing solitude and reflection',
        durationHint: 'long'
    },
    {
        id: 'tearful-moment',
        name: 'Tearful Moment',
        nameKR: '눈물의 순간',
        category: 'emotional',
        template: 'Extreme close-up on eyes. Camera holds steady with slight breathing movement. Tears form and roll down. Soft rim lighting catches moisture. Background completely blurred. Intimate and vulnerable atmosphere.',
        cameraWork: ['ECU', 'Static', 'Rim Lighting', 'Extreme Shallow DoF'],
        description: 'Extreme close-up for highly emotional moments',
        durationHint: 'short'
    },

    // ============================================================================
    // DIALOGUE SHOTS
    // ============================================================================
    {
        id: 'conversation-ots',
        name: 'Conversation OTS',
        nameKR: '대화 어깨 넘어샷',
        category: 'dialogue',
        template: 'Over-the-shoulder shot framing speaker. Camera maintains steady position with subtle handheld movement. Speaker animates naturally while talking - gestures, head movements. Listener visible in soft focus foreground.',
        cameraWork: ['OTS', 'Handheld Subtle', 'Natural Lighting', 'Medium DoF'],
        description: 'Classic dialogue framing from over the shoulder',
        durationHint: 'any'
    },
    {
        id: 'intense-dialogue',
        name: 'Intense Dialogue',
        nameKR: '긴장감 대화',
        category: 'dialogue',
        template: 'Close-up shot with Dutch angle. Camera slowly orbits subject. Hard direct lighting creates dramatic shadows. Character speaks with intensity, controlled movements. Background dark and minimal.',
        cameraWork: ['CU', 'Dutch Angle', 'Hard Lighting', 'Slow Orbit'],
        description: 'Dramatic framing for tense conversations',
        durationHint: 'medium'
    },
    {
        id: 'casual-medium',
        name: 'Casual Medium Shot',
        nameKR: '일상 미디엄샷',
        category: 'dialogue',
        template: 'Medium shot at eye level. Camera remains relatively static with natural subtle movement. Natural relaxed posture and gestures. Warm practical lighting from environment. Comfortable and authentic atmosphere.',
        cameraWork: ['MS', 'Eye Level', 'Practical Lighting', 'Natural Movement'],
        description: 'Relaxed framing for casual dialogue',
        durationHint: 'any'
    },

    // ============================================================================
    // ACTION SHOTS
    // ============================================================================
    {
        id: 'dynamic-tracking',
        name: 'Dynamic Tracking',
        nameKR: '다이나믹 트래킹',
        category: 'action',
        template: 'Camera tracks alongside moving subject. Fast-paced movement with slight motion blur. Subject moves through environment dynamically. Energetic handheld or gimbal movement. High contrast lighting for drama.',
        cameraWork: ['Tracking Shot', 'Motion Blur', 'Handheld', 'High Contrast'],
        description: 'Following shot for movement and action',
        durationHint: 'medium'
    },
    {
        id: 'hero-entrance',
        name: 'Hero Entrance',
        nameKR: '영웅 등장',
        category: 'action',
        template: 'Low angle shot looking up at subject. Camera slowly tilts up or dollies back to reveal full figure. Dramatic rim lighting from behind. Subject moves with confidence and purpose. Lens flare and atmospheric effects.',
        cameraWork: ['Low Angle', 'Tilt Up', 'Rim Lighting', 'Lens Flare'],
        description: 'Powerful entrance shot for important characters',
        durationHint: 'medium'
    },
    {
        id: 'impact-moment',
        name: 'Impact Moment',
        nameKR: '임팩트 순간',
        category: 'action',
        template: 'Quick zoom or push into subject. Brief moment of stillness before action. Sharp fast movement during impact. Camera shakes slightly on impact. Flash of light or particle effects. High energy and tension.',
        cameraWork: ['Quick Zoom', 'Camera Shake', 'High Energy', 'Flash Effects'],
        description: 'Punctuated moment of high impact action',
        durationHint: 'short'
    },

    // ============================================================================
    // ESTABLISHING SHOTS
    // ============================================================================
    {
        id: 'epic-establishing',
        name: 'Epic Establishing',
        nameKR: '서사적 설정샷',
        category: 'establishing',
        template: "Extreme wide shot of location. Slow sweeping camera movement reveals scale. Golden hour or blue hour lighting. Atmospheric depth with haze or fog. Small figures or elements provide scale reference. Bird's eye or high angle perspective.",
        cameraWork: ['EWS', 'Slow Sweep', 'Golden Hour', 'Atmospheric Haze'],
        description: 'Grand establishing shot for scene setting',
        durationHint: 'long'
    },
    {
        id: 'intimate-location',
        name: 'Intimate Location',
        nameKR: '친밀한 공간',
        category: 'establishing',
        template: 'Medium wide shot of interior space. Camera slowly explores environment. Warm practical lighting from lamps and windows. Details and objects tell story. Cozy comfortable atmosphere. Subject may enter or be discovered.',
        cameraWork: ['MWS', 'Slow Pan', 'Practical Lighting', 'Detail Focus'],
        description: 'Warm establishing shot for intimate spaces',
        durationHint: 'medium'
    },
    {
        id: 'ominous-approach',
        name: 'Ominous Approach',
        nameKR: '불길한 접근',
        category: 'establishing',
        template: 'Slow dolly or drone shot approaching location. Low lighting with deep shadows. Slight Dutch angle creates unease. Fog or mist adds mystery. Slow deliberate movement builds tension. Cool desaturated color palette.',
        cameraWork: ['Dolly In', 'Dutch Angle', 'Low Key Lighting', 'Mist Effects'],
        description: 'Suspenseful approach to mysterious location',
        durationHint: 'long'
    },

    // ============================================================================
    // TRANSITIONS
    // ============================================================================
    {
        id: 'time-passing',
        name: 'Time Passing',
        nameKR: '시간의 흐름',
        category: 'transition',
        template: 'Static or slow-moving shot with changing light. Time-lapse feel with natural progression. Shadows move across scene. Subject may be still as world changes. Peaceful contemplative mood. Gradual color temperature shift.',
        cameraWork: ['Static', 'Time-lapse Feel', 'Light Progression', 'Color Shift'],
        description: 'Visual representation of time passage',
        durationHint: 'long'
    },
    {
        id: 'revelation-pull',
        name: 'Revelation Pull',
        nameKR: '반전 풀백',
        category: 'transition',
        template: 'Camera pulls back or cranes up to reveal context. Starts on detail, ends on wide. Dramatic music timing point. Environment or situation is revealed. Creates surprise or new understanding. Smooth continuous movement.',
        cameraWork: ['Pull Back', 'Crane Up', 'Reveal Shot', 'Smooth Movement'],
        description: 'Revealing shot that shows new context',
        durationHint: 'medium'
    },
    {
        id: 'focus-shift',
        name: 'Focus Shift',
        nameKR: '초점 이동',
        category: 'transition',
        template: 'Rack focus between foreground and background elements. Camera remains static as focus pulls. Creates connection between two elements. Smooth organic focus transition. Bokeh effects during shift. Meaningful visual storytelling.',
        cameraWork: ['Rack Focus', 'Static Camera', 'Bokeh Effects', 'Depth Layers'],
        description: 'Focus shift to connect or transition elements',
        durationHint: 'short'
    }
];

/**
 * Get presets filtered by category
 */
export function getPresetsByCategory(category: MotionPreset['category']): MotionPreset[] {
    return DEFAULT_MOTION_PRESETS.filter(p => p.category === category);
}

/**
 * Get presets suitable for a given duration
 */
export function getPresetsForDuration(durationSeconds: number): MotionPreset[] {
    if (durationSeconds < 3) {
        return DEFAULT_MOTION_PRESETS.filter(p => p.durationHint === 'short' || p.durationHint === 'any');
    } else if (durationSeconds < 8) {
        return DEFAULT_MOTION_PRESETS.filter(p => p.durationHint === 'medium' || p.durationHint === 'any');
    } else {
        return DEFAULT_MOTION_PRESETS.filter(p => p.durationHint === 'long' || p.durationHint === 'any');
    }
}

/**
 * Find preset by ID
 */
export function getPresetById(id: string): MotionPreset | undefined {
    return DEFAULT_MOTION_PRESETS.find(p => p.id === id);
}
