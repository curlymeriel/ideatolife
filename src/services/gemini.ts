import axios from 'axios';

export interface ScriptCut {
    id: number;
    speaker: string;
    dialogue: string;
    visualPrompt: string;
    visualPromptKR?: string;       // Korean translation of visualPrompt for user reference
    estimatedDuration: number;
    draftImageUrl?: string;        // Legacy: Quick preview images
    finalImageUrl?: string;        // Final quality image from Step 4
    audioUrl?: string;             // Generated audio from Step 4
    referenceAssetIds?: string[];  // Manual asset selection
    referenceCutIds?: number[];    // Manual previous cut selection
    userReferenceImage?: string; // New: User provided sketch/reference
    isConfirmed?: boolean;         // DEPRECATED: Use granular locks below
    isAudioConfirmed?: boolean;    // Locks dialogue, speaker, and audio settings
    isImageConfirmed?: boolean;    // Locks visual prompt and generated image
    emotion?: string;              // Emotional tone (neutral/happy/sad/angry/excited/calm/tense)
    emotionIntensity?: 'low' | 'moderate' | 'high';  // Emotion strength
    language?: 'en-US' | 'ko-KR';  // Detected language for voice selection
    voiceGender?: 'male' | 'female' | 'neutral';  // Manual gender override
    voiceAge?: 'child' | 'young' | 'adult' | 'senior';  // Age range for voice
    voiceSpeed?: number;           // Playback speed (0.5 to 2.0)
    voiceRate?: string;            // SSML rate (e.g., '85%', '110%', 'slow', 'fast')
    voiceVolume?: string;          // SSML volume (e.g., 'soft', 'loud', '-2dB', '+3dB')
    voiceId?: string;              // NEW: Explicit voice ID selection (from bulk settings)
    actingDirection?: string;      // NEW: Natural language acting direction for Gemini TTS
    audioPadding?: number;         // NEW: Pause after audio finishes (seconds)

    storylineSceneId?: string;     // Link to source storyline scene

    // Step 4.5: Video Composition
    videoPrompt?: string;           // Enhanced prompt for video generation (auto-generated from visualPrompt)
    videoUrl?: string;              // AI-generated or uploaded video clip URL
    videoSource?: 'kling' | 'veo' | 'runway' | 'upload' | 'image' | 'ai';  // Origin of the video
    isVideoConfirmed?: boolean;     // Locks video clip for final export
    useVideoAudio?: boolean;         // If true, use video's embedded audio instead of TTS
    videoDuration?: number;          // Override duration for video clips (seconds)

    // SFX: Background Sound Effects
    sfxUrl?: string;                // Sound effect audio URL (from Freesound or other source)
    sfxName?: string;               // Name of the sound effect
    sfxVolume?: number;             // Volume multiplier (0.0 to 1.0, default 0.3)
    sfxFreesoundId?: number;        // Freesound.org ID for attribution
    sfxDescription?: string;         // AI-suggested SFX description for this cut
}

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
    image?: string; // Base64 image string
    fileContent?: string; // Text file content (JSON, TXT, CSV, MD)
    fileName?: string; // Original file name for display
    fileType?: 'image' | 'text' | 'json'; // File type category
}

export interface AiCharacter {
    name: string;
    role: string;
    description: string;
    visualSummary?: string; // Explicit visual prompt
    gender?: 'male' | 'female' | 'other';  // NEW: Character gender for voice
    age?: 'child' | 'young' | 'adult' | 'senior';  // NEW: Character age for voice
}

export interface StorylineScene {
    id?: string;
    sceneNumber: number;
    estimatedTime: string;
    content: string;
    directionNotes: string;
    linkedCutIds?: number[];  // NEW: Track which cuts belong to this scene
}

export interface AiProp {
    name: string;
    description: string;
    visualSummary?: string;
}

export interface ConsultationResult {
    reply: string;
    suggestedSeriesName?: string;
    suggestedEpisodeName?: string;
    suggestedEpisodeNumber?: number;
    suggestedSeriesStory?: string;
    suggestedMainCharacters?: string;
    suggestedCharacters?: AiCharacter[];
    suggestedSeriesLocations?: { name: string; description: string; visualSummary?: string }[];
    suggestedEpisodePlot?: string;
    suggestedEpisodeCharacters?: AiCharacter[];
    suggestedEpisodeLocations?: { name: string; description: string; visualSummary?: string }[];
    suggestedDuration?: number;
    suggestedStorylineScenes?: StorylineScene[];  // NEW: AI-suggested storyline breakdown
    suggestedSeriesProps?: AiProp[]; // NEW
    suggestedEpisodeProps?: AiProp[]; // NEW
    suggestedDeletions?: {
        characters?: string[];
        seriesLocations?: string[];
        episodeCharacters?: string[];
        episodeLocations?: string[];
        seriesProps?: string[];
        episodeProps?: string[];
    };
    suggestedAspectRatio?: '16:9' | '9:16' | '1:1' | '2.35:1';
    suggestedMasterStyle?: string;
}

export interface ProjectContext {
    seriesName: string;
    episodeName: string;
    episodeNumber: number;
    seriesStory: string;
    characters: any[];
    seriesLocations: any[];
    episodePlot: string;
    episodeCharacters: any[];
    episodeLocations: any[];
    seriesProps: any[]; // NEW
    episodeProps: any[]; // NEW
    targetDuration: number;
    aspectRatio: string;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_2_5_FLASH_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_3_PRO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';
const GEMINI_3_FLASH_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'; // Requested by user
const GEMINI_PRO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const GEMINI_2_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const GEMINI_1_5_FLASH_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

import type { StrategicAnalysis, StrategyInsight, YouTubeTrendVideo, ChannelAnalysis, TrendAnalysisInsights } from '../store/types';

// Default instructions (can be overridden by UI)
export const DEFAULT_SCRIPT_INSTRUCTIONS = `
      **Instructions:**
      Break the episode plot into cinematic cuts that fit within the target duration.
      
      ⚠️ **CRITICAL DURATION RULE (ABSOLUTE MAXIMUM - NO EXCEPTIONS):**
      - Each individual cut MUST be 8 SECONDS OR LESS.
      - Recommended range: 2-6 seconds per cut for optimal pacing.
      - If a scene needs more than 8 seconds, SPLIT IT into multiple cuts.
      - This is a HARD LIMIT - any cut exceeding 8 seconds is INVALID.

      **ASSET NAME RULE (CRITICAL):**
      - Do NOT translate Character, Location, or Prop names. Use them EXACTLY as they appear in the provided lists.
      - If the asset name is Korean (e.g., "철수"), WRITE IT IN KOREAN inside the English prompt (e.g., "Wide shot of 철수 walking").
      - This is crucial for linking the generated script to the visual references.
      
      **AUDIO TYPE RULES (CRITICAL - MUST FOLLOW):**
      Every cut MUST have a clearly defined audio type. Choose ONE:

      - **DIALOGUE (PREFERRED):** Has a speaker and spoken text.
        • **PRIORITY:** Use dialogue or narration for 90% of cuts.
        • **ALWAYS EXPLAIN:** Even if a character is alone, use "Narrator" or "Monologue" to explain the situation, feelings, or background context.
        • **DO NOT BE SILENT:** Unless it is a strictly necessary dramatic pause, ALWAYS have someone speaking.
        • speaker MUST be a specific character name. Use "Narrator" if the voice is omniscient.
      
      - **SILENT (AVOID):** No spoken audio at all.
        • **USE SPARINGLY:** Only use for profound silence or specific dramatic timing (max 1-2 cuts per episode).
        • Set speaker = "SILENT"
        • Set dialogue = "..."
        
      - **SFX ONLY:**
        • Set speaker = "SILENT"
        • Set dialogue = "..."
        • Set sfxDescription = "Detailed description of the sound effect" (REQUIRED)
      
      **CONTINUITY & CONTEXT RULES (STRICT):**
      - **RESPECT LOCKED CUTS:** Some cuts may be provided as "ESTABLISHED CUTS". You MUST treat these as immutable anchors. Do NOT change their speaker, dialogue, or visual essence.
      - **NO REPETITION:** Do NOT repeat the dialogue or visual action of ANY previous cut (locked or generated). Each cut MUST move the story forward.
      - **NARRATIVE BRIDGE:** If you are regenerating a script while some cuts are locked, your mission is to "fill the gaps" or "continue the thread" such that the entire sequence forms a seamless, non-redundant story.
      
      📋 FINAL CHECKLIST (verify before output):
      □ Is speaker a real character name? (If text exists) ✓
      □ If speaker is "SILENT", is the dialogue exactly "..."? ✓
      □ If there is narration, is speaker "Narrator"? ✓
      □ Does this cut repeat any dialogue from prev cuts? (NO) ✓
      □ Does this cut logically follow the previous one? ✓
      
      - emotion: Emotional tone of the dialogue (neutral/happy/sad/angry/excited/calm/tense)
      - emotionIntensity: Strength of the emotion (low/moderate/high)
      
      - actingDirection: **VOICE ACTING DIRECTION (REQUIRED FOR ALL DIALOGUE):**
        - Write a brief direction for how the voice actor should deliver this line
        - Include: tone, pacing, underlying emotion, and specific vocal nuances
        - Write in Korean or English (match dialogue language)
        - Keep it concise: 1-2 sentences maximum
        - Examples:
          • "슬픔을 참으며 떨리는 목소리로, 마지막에 한숨"
          • "Speak softly, holding back tears, with a slight tremor"
          • "자신감 있게 힘있는 목소리로, 마지막에 미소"
          • "Deliver confidently with rising excitement"
          • "속삭이듯 긴장된 목소리로"
        - For SILENT cuts: leave empty or omit

      - visualPrompt: **STATIC IMAGE ONLY - NO MOTION (WRITE IN ENGLISH):**
        - **LANGUAGE: MUST BE WRITTEN IN ENGLISH** (except for asset names which may be in any language)
        - This prompt generates a **STILL IMAGE** (first frame of cut). Describe a "frozen moment".
        - **Format:** (Shot Size) + (Angle) + (Subject & Pose) + (Lighting/Atmosphere)
        - **STATIC POSES ONLY:** "Character in mid-stride pose", "Mid-sentence with mouth open", "Hand reaching out frozen"
        - **NO CAMERA MOVEMENT:** Do NOT include dolly, pan, zoom, tracking, etc. (Those go in videoPrompt)
        - **NO MOTION VERBS:** Avoid "running", "walking", "moving". Use frozen poses instead.
        
        **⚠️ ONE SCENE ONLY (CRITICAL - ZERO TOLERANCE):**
        - Each visualPrompt must describe EXACTLY ONE frozen moment from ONE camera angle.
        - **FORBIDDEN PHRASES:** "then cutting to", "followed by", "next we see", "transitions to", "cuts to", "and then"
        - ❌ BAD: "Medium shot of A, then cutting to close-up of B's eyes"
        - ❌ BAD: "Wide shot followed by close-up of hands"
        - ✅ GOOD: "Medium shot of Max Fisher, confident smile, bright office lighting"
        - ✅ GOOD: "Close-up of Max Fisher's determined eyes, clinical lighting"
        - If you need multiple angles, CREATE SEPARATE CUTS for each angle.
        
        **ASSET NAME PRIORITY (CRITICAL FOR IMAGE CONSISTENCY):**
        - **ALWAYS use the EXACT asset names** from "Available Characters" and "Available Locations" lists.
        - **DO NOT TRANSLATE or ROMANIZE** the names. Keep them exactly as provided.
        - ❌ BAD: "Close up of Cheolsu" (when asset name is "철수")
        - ✅ GOOD: "Close up of 철수" (Mixed English/Korean is expected and required)
        - DO NOT use pronouns (his, her, the, that) to refer to assets.
        - ❌ BAD: "his sanctuary", "the hero's workshop", "she enters the room"
        - ✅ GOOD: "Max Fisher's Sanctuary", "Kael standing in The Ancient Workshop", "Dr. Aris enters Rain-Soaked Street"
        - This ensures the image generator correctly matches reference images for each asset.
        
        **TEXT RULE (ZERO TOLERANCE):** 
        - NEVER include text, labels, signs, or names as rendered text.
        - Reference characters by name, but don't ask for text rendering.
        
        **NEGATIVE CONSTRAINTS:**
        - No text, No typography, No UI overlays, No speech bubbles, No camera movements, No scene transitions.
      
      - visualPromptKR: (Optional) Korean translation of visualPrompt for user reference.
        - Translate the English visualPrompt to Korean so users can easily understand the scene.
        - Keep the same structure and meaning as the English version.
      
      - estimatedDuration: ⚠️ **CRITICAL: MAXIMUM 8 SECONDS PER CUT (ABSOLUTE LIMIT)**
        • HARD LIMIT: No cut may exceed 8 seconds. This is non-negotiable.
        • Optimal range: 2-6 seconds for good pacing.
        • If dialogue or action takes longer, SPLIT into multiple cuts.
        • Cuts over 8 seconds will be REJECTED by the video pipeline.
      
      - sfxDescription: **Background sound effect suggestion (REQUIRED for all cuts):**
        - Describe ambient/environmental sounds that enhance the scene
        - Use searchable English keywords: "rain", "footsteps", "crowd murmur", "wind howling", "thunder distant"
        - For SILENT cuts: describe atmospheric sounds only (e.g., "forest ambience, birds chirping")
        - For dialogue cuts: suggest subtle background sounds (e.g., "cafe background, soft chatter")
        - Keep it short (3-8 words) and specific
        - Example: "heavy rain, thunder, wind gusts"
      
      **Important:**
      - Use the characters and locations defined above
      - **PRIORITY:** Use "Story Context" for dialogue and plot logic. Use "Visual Appearance" ONLY for the visualPrompt field.
      - Ensure the dialogue tells the episode plot cohesively
      - Visual prompts should reference specific characters/locations by name for consistency
      - Total duration should approximately match the target duration
      
      Return ONLY a raw JSON array of objects with keys: id, speaker, dialogue, language, emotion, emotionIntensity, actingDirection, visualPrompt, visualPromptKR, sfxDescription, estimatedDuration.
      Do not include markdown formatting like \`\`\`json.
    `;


// Default video prompt instructions (for Step 3 Video Prompt Generation)
export const DEFAULT_VIDEO_PROMPT_INSTRUCTIONS = `
**VIDEO PROMPT GENERATION - For Veo3/Kling/Grok Video AI:**

Transform the static visualPrompt into a dynamic video prompt.
Each video prompt should describe 5-8 seconds of motion based on the still image.

**VIDEO PROMPT STRUCTURE:**
1. **Opening Frame:** Start with the exact composition from visualPrompt
2. **Camera Movement:** Add ONE primary camera move
3. **Subject Motion:** Describe character/object movements
4. **Environmental Motion:** Ambient movement (wind, particles, lighting shifts)
5. **Timing Notes:** Specify speed (slow, medium, fast)

**CAMERA MOVEMENT VOCABULARY (pick ONE):**
- Dolly in/out: Camera moves toward/away from subject
- Pan left/right: Camera rotates horizontally
- Tilt up/down: Camera rotates vertically
- Tracking shot: Camera follows moving subject
- Zoom in/out: Lens zoom (different from dolly)
- Static hold: No camera movement (emphasizes subject motion)
- Crane up/down: Vertical camera lift
- Orbit: Camera circles around subject

**SUBJECT MOTION (match dialogue/action):**
- Speaking: "Lips move naturally, subtle head gestures, expressive eyes"
- Walking: "Continuous walking motion, natural arm swing"
- Emotional: "Tears forming", "Smile spreading", "Fist clenching"
- Idle: "Subtle breathing, hair movement, fabric settling"

**ENVIRONMENTAL MOTION:**
- Weather: "Rain falling", "Snow drifting", "Leaves blowing"
- Lighting: "Sunlight shifting", "Shadows moving", "Neon flickering"
- Particles: "Dust motes floating", "Sparks rising", "Smoke curling"

**QUALITY KEYWORDS FOR AI VIDEO:**
- "Cinematic motion", "Smooth camera movement", "Natural motion blur"
- "Professional cinematography", "35mm film look", "Anamorphic lens"

**EXAMPLE OUTPUT:**
visualPrompt: "Medium shot of Detective Kane standing in rain, noir lighting, wet pavement reflections"
videoPrompt: "Medium shot, Detective Kane stands in heavy rain. Camera slowly dollies in toward his face. Rain falls steadily, creating ripples in puddles. Kane's wet coat glistens, water droplets run down his face. His eyes narrow with determination, jaw tightens. Subtle head turn as he looks off-screen. Cinematic noir atmosphere with neon reflections."

**RULES:**
- Always reference the visualPrompt scene composition
- Keep motion realistic and achievable for AI video
- Avoid impossible physics or extreme transformations
- Match movement to dialogue timing if applicable
`;

export const generateScript = async (
    seriesName: string,
    episodeName: string,
    targetDuration: number,
    stylePrompts: any,
    apiKey: string,
    episodePlot?: string,
    characters?: any[],
    locations?: any[],
    storylineTable?: StorylineScene[],  // Use storyline as structure
    assetDefinitions?: Record<string, any>,  // NEW: Step 2 asset definitions
    customInstructions?: string, // NEW: Allow overriding instructions
    existingScript?: ScriptCut[] // NEW: Pass existing script for context-aware regeneration
): Promise<ScriptCut[]> => {
    if (!apiKey) {
        // Mock response
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: 1,
                        speaker: 'Narrator',
                        dialogue: 'In a world where ideas float like bubbles...',
                        visualPrompt: 'Wide shot of a surreal landscape with floating glowing bubbles, dreamlike atmosphere',
                        estimatedDuration: 5
                    },
                    {
                        id: 2,
                        speaker: 'Meriel',
                        dialogue: 'I wonder if I can catch one?',
                        visualPrompt: 'Close up of Meriel, a young creative girl with goggles, reaching out to a bubble',
                        estimatedDuration: 3
                    },
                    {
                        id: 3,
                        speaker: 'Narrator',
                        dialogue: 'But some ideas are slippery.',
                        visualPrompt: 'The bubble pops just as she touches it, scattering sparks',
                        estimatedDuration: 4
                    }
                ]);
            }, 2000);
        });
    }

    try {
        // Build character info string with Step 2 asset details
        let characterInfo = '';
        if (characters && characters.length > 0) {
            characterInfo = characters.map(c => {
                // Try to find matching asset definition from Step 2
                // STRICT PRIORITY: Check for exact ID match first (to avoid "Ghost" assets with same name)
                const assets = assetDefinitions ? Object.values(assetDefinitions) : [];
                let assetDef = assets.find((a: any) => a.type === 'character' && a.id === c.id);

                // Fallback: Name matching (only if ID match fails)
                if (!assetDef) {
                    assetDef = assets.find((a: any) => a.type === 'character' && a.name?.toLowerCase() === c.name?.toLowerCase());
                }

                // Debug log
                if (assetDef) {
                    console.log(`[Gemini] Matched Step 1 character "${c.name}" (ID: ${c.id}) with Step 2 asset (ID: ${(assetDef as any).id})`);
                } else {
                    console.log(`[Gemini] No Step 2 match for character "${c.name}" (ID: ${c.id}). Available IDs: ${assetDefinitions ? Object.keys(assetDefinitions).join(', ') : 'None'}`);
                }

                // Merge Step 1 and Step 2 descriptions
                // Visual source priority: Step 2 Asset Def ONLY (Step 1 visual is excluded to avoid outdated info)
                const step1Desc = c.description || '';
                const step2Desc = (assetDef as any)?.description || '';

                // ONLY use Step 2 for visual details to prevent outdated Step 1 info leaking
                const visualDetails = step2Desc;

                if (visualDetails) {
                    // EXPLICITLY separate Narrative vs Visual to prevent AI confusion
                    return `- ${c.name} (${c.role}):
  * Story Context: ${step1Desc}
  * Visual Appearance: ${visualDetails}`;
                }

                // No Step 2 visual available, provide narrative context only
                return `- ${c.name} (${c.role}): ${step1Desc}`;
            }).join('\n');
        } else {
            characterInfo = 'No specific characters defined';
        }

        // Build location info string with Step 2 asset details
        let locationInfo = '';
        if (locations && locations.length > 0) {
            locationInfo = locations.map(l => {
                // Try to find matching asset definition from Step 2
                // STRICT PRIORITY: Check for exact ID match first
                const assets = assetDefinitions ? Object.values(assetDefinitions) : [];
                let assetDef = assets.find((a: any) => a.type === 'location' && a.id === l.id);

                // Fallback: Name matching
                if (!assetDef) {
                    assetDef = assets.find((a: any) => a.type === 'location' && a.name?.toLowerCase() === l.name?.toLowerCase());
                }

                // Debug log
                if (assetDef) {
                    console.log(`[Gemini] Matched Step 1 location "${l.name}" (ID: ${l.id}) with Step 2 asset (ID: ${(assetDef as any).id})`);
                } else {
                    console.log(`[Gemini] No Step 2 match for location "${l.name}" (ID: ${l.id}). Available IDs: ${assetDefinitions ? Object.keys(assetDefinitions).join(', ') : 'None'}`);
                }

                // Merge Step 1 and Step 2 descriptions
                // Visual source priority: Step 2 Asset Def ONLY (Step 1 visual is excluded to avoid outdated info)
                const step1Desc = l.description || '';
                const step2Desc = (assetDef as any)?.description || '';

                // ONLY use Step 2 for visual details
                const visualDetails = step2Desc;

                if (visualDetails) {
                    return `- ${l.name}:
  * Story Context: ${step1Desc}
  * Visual Appearance: ${visualDetails}`;
                }

                // No Step 2 visual available, provide narrative context only
                return `- ${l.name}: ${step1Desc}`;
            }).join('\n');
        } else {
            locationInfo = 'No specific locations defined';
        }

        // Build storyline context if available
        let storylineContext = '';
        let sceneStructure = '';
        if (storylineTable && storylineTable.length > 0) {
            storylineContext = `
**SCENE STRUCTURE (from user's storyline plan):**
${storylineTable.map(scene => `
Scene ${scene.sceneNumber} (${scene.estimatedTime}):
Content: ${scene.content}
Direction: ${scene.directionNotes}
`).join('')}

CRITICAL INSTRUCTIONS:
1. Follow this scene structure closely. Create 1-3 cuts for each scene.
2. Match the suggested timing for each scene.
3. Expand the content into detailed dialogue and visual descriptions.
4. Maintain the narrative flow across scenes.
`;
            sceneStructure = storylineContext;
        }

        // NEW: Build Locked Cuts Context
        let lockedCutsContext = '';
        if (existingScript && existingScript.length > 0) {
            // Check for explicit locks (Audio/Image) OR confirmed status
            const lockedCuts = existingScript.filter(c => c.isConfirmed || c.isAudioConfirmed || c.isImageConfirmed);

            if (lockedCuts.length > 0) {
                lockedCutsContext = `
**CRITICAL: LOCKED CUTS (ESTABLISHED STORY)**
The following cuts are ALREADY ESTABLISHED and are IMMUTABLE. You MUST use them as the narrative anchors for the rest of the script.

**CONTINUITY MANDATE:**
1. **ABSOLUTE NO-REPETITION:** Never generate dialogue that repeats any of the established dialogue below.
2. **THREAD CONTINUATION:** Your NEW cuts must logically connect to the cuts immediately preceding/following them.
3. **GAP FILLING:** If a locked cut exists at index X, and you are generating for index X+1, ensure X+1 is the logical next beat.

**ESTABLISHED CUTS (Do Not Change These):**
${lockedCuts.map(c => `[established] SLOT #${c.id} | Speaker: ${c.speaker} | Dialogue: "${c.dialogue}" | Visual: "${c.visualPrompt}"`).join('\n')}

**YOUR TASK:** Generate the remaining cuts to complete the episode, ensuring they integrate perfectly with the established cuts above without any overlap or repetition.
`;
            }
        }

        let finalPrompt = `
Generate a video script for:
Series: ${seriesName}
Episode: ${episodeName}
Target Duration: ${targetDuration} seconds
Style Context: ${JSON.stringify(stylePrompts)}

Characters:
${characterInfo}

Locations:
${locationInfo}

Episode Plot:
${episodePlot || 'No specific plot provided.'}

${sceneStructure}
${lockedCutsContext}

${customInstructions || DEFAULT_SCRIPT_INSTRUCTIONS}
`;

        const models = [
            { name: 'Gemini 3 Pro (Preview)', url: GEMINI_3_PRO_URL }, // Priority 1: High Intelligence
            { name: 'Gemini 3 Flash (Preview)', url: GEMINI_3_FLASH_URL }, // Priority 2: Fast Intelligence
            { name: 'Gemini 2.5 Flash', url: GEMINI_API_URL }, // Priority 3: Balanced
            { name: 'Gemini 1.5 Flash', url: GEMINI_1_5_FLASH_URL }, // Priority 4: Stable fallback
            { name: 'Gemini 1.5 Pro', url: GEMINI_PRO_URL } // Priority 5: Last resort high quality
        ];

        let lastError: any = null;

        for (const model of models) {
            try {
                console.log(`[Gemini] Generating Script with model: ${model.name}`);
                const response = await axios.post(
                    `${model.url}?key=${apiKey}`,
                    {
                        contents: [{ parts: [{ text: finalPrompt }] }]
                    }
                );

                let generatedText = response.data.candidates[0].content.parts[0].text;
                const jsonStr = generatedText.replace(/```json\n?|\n?```/g, '').trim();
                const rawScript = JSON.parse(jsonStr);

                // Support both direct array and object with 'cuts' property
                const validScript = Array.isArray(rawScript) ? rawScript : (rawScript.cuts || []);
                if (!validScript || validScript.length === 0) throw new Error("Parsed script is empty");

                // Create a list of valid speaker names for normalization
                const validSpeakerNames = [
                    'Narrator',
                    'SILENT',
                    ...(characters || []).map((c: any) => c.name)
                ].filter(Boolean);

                // Normalize and ensure IDs are numbers
                return validScript.map((cut: any, index: number) => {
                    // LOCKED CUT OVERRIDE logic
                    let lockedOriginal = null;
                    if (existingScript) {
                        lockedOriginal = existingScript.find(c => c.id === cut.id && (c.isConfirmed || c.isAudioConfirmed || c.isImageConfirmed));
                    }

                    if (lockedOriginal) {
                        console.log(`[Gemini] Restoring LOCKED cut #${lockedOriginal.id} content verbatim.`);
                        return {
                            ...cut,
                            id: lockedOriginal.id,
                            speaker: lockedOriginal.speaker,
                            dialogue: lockedOriginal.dialogue,
                            visualPrompt: lockedOriginal.visualPrompt,
                            videoPrompt: lockedOriginal.videoPrompt,
                            audioUrl: lockedOriginal.audioUrl,
                            finalImageUrl: lockedOriginal.finalImageUrl,
                            isConfirmed: lockedOriginal.isConfirmed,
                            isAudioConfirmed: lockedOriginal.isAudioConfirmed,
                            isImageConfirmed: lockedOriginal.isImageConfirmed,
                            estimatedDuration: lockedOriginal.estimatedDuration || cut.estimatedDuration
                        };
                    }

                    // --- STANDARD NORMALIZATION FOR NEW/UNLOCKED CUTS ---
                    let rawSpeaker = cut.speaker || cut.character || cut.name || 'Narrator';
                    let speaker = 'Narrator'; // Default fallback

                    // 1. Try exact match
                    const exactMatch = validSpeakerNames.find(s => s === rawSpeaker);
                    if (exactMatch) {
                        speaker = exactMatch;
                    } else {
                        // 2. Try case-insensitive fuzzy match
                        const fuzzyMatch = validSpeakerNames.find(s => s.toLowerCase() === rawSpeaker.toLowerCase());
                        if (fuzzyMatch) {
                            speaker = fuzzyMatch;
                        } else {
                            // 3. Check if it's a known special case
                            if (rawSpeaker.toUpperCase().includes('SILENT') || rawSpeaker.toUpperCase().includes('NONE')) {
                                speaker = 'SILENT';
                            } else if (rawSpeaker.toUpperCase().includes('NARRA')) {
                                speaker = 'Narrator';
                            } else {
                                // 4. If no match, try to find the character name WITHIN the raw speaker string
                                const partialMatch = validSpeakerNames.find(s => rawSpeaker.toLowerCase().includes(s.toLowerCase()));
                                if (partialMatch) {
                                    speaker = partialMatch;
                                } else {
                                    // Final fallback: if there are characters, use the first one, otherwise Narrator
                                    speaker = validSpeakerNames.length > 2 ? validSpeakerNames[2] : 'Narrator';
                                    console.warn(`[Gemini] Could not resolve speaker "${rawSpeaker}".Falling back to "${speaker}"`);
                                }
                            }
                        }
                    }

                    let dialogue = cut.dialogue || cut.content || cut.text || '...';

                    // SELF-HEALING: Fix common AI hallucinations
                    // 1. If Speaker is SFX but dialogue seems like speech (not wrapped in brackets), change to Narrator
                    if (speaker.toUpperCase() === 'SFX' && !dialogue.trim().startsWith('[')) {
                        console.warn(`[Gemini] Auto - corrected SFX speaker to Narrator for dialogue: "${dialogue.substring(0, 20)}..."`);
                        speaker = 'Narrator';
                    }

                    // 2. If Speaker is SILENT but dialogue is long text, change to Narrator
                    if (speaker.toUpperCase() === 'SILENT' && dialogue.length > 20 && !dialogue.trim().startsWith('[')) {
                        console.warn(`[Gemini] Auto - corrected SILENT speaker to Narrator for dialogue: "${dialogue.substring(0, 20)}..."`);
                        speaker = 'Narrator';
                    }

                    // 3. SFX MIGRATION: Aggressive Detection
                    const sfxRegex = /^\[.*(SFX|Sound|Music|Audio|Effect|BGM).*\]$/i;
                    const sfxParenRegex = /^\(.*(SFX|Sound|Music|Audio|Effect|BGM).*\)$/i;
                    const isSfxDialogue = sfxRegex.test(dialogue.trim()) || sfxParenRegex.test(dialogue.trim()) || dialogue.trim().startsWith('[SFX:');

                    if (speaker.toUpperCase() === 'SFX' || isSfxDialogue) {
                        let description = cut.sfxDescription || '';
                        const cleanDesc = dialogue.replace(/^\[(SFX|Sound|Music|Audio|Effect|BGM):?\s*/i, '').replace(/\]$/, '').trim();

                        if (cleanDesc && cleanDesc !== 'SILENT' && cleanDesc !== '무음') {
                            description = cleanDesc;
                        }

                        console.log(`[Gemini] Auto - corrected SFX cut -> SILENT.Desc: "${description}"`);

                        speaker = 'SILENT';
                        dialogue = '...'; // Enforce silent tag as "..."
                        if (description) {
                            cut.sfxDescription = description;
                        }
                    }

                    // 4. Safety Check: If Speaker is Narrator but dialogue is [SILENT], fix it
                    if (speaker === 'Narrator' && (dialogue === '[SILENT]' || dialogue === '[무음]')) {
                        speaker = 'SILENT';
                    }

                    // 5. FINAL ENFORCEMENT: If Speaker is SILENT, Dialogue MUST be "..."
                    if (speaker === 'SILENT') {
                        dialogue = '...';
                    }

                    return {
                        ...cut,
                        id: index + 1, // STRICTLY enforce unique sequential ID
                        speaker,
                        dialogue,
                        estimatedDuration: Number(cut.estimatedDuration)
                    };
                });
            } catch (error: any) {
                console.warn(`[Gemini] Script generation failed with ${model.name}:`, error.message);
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.error("All Script Generation Models Failed:", lastError);
        throw lastError; // Re-throw the last error to be caught by the UI

    } catch (error) {
        console.error('Gemini Consultation Failed:', error);
        throw error;
    }
};

export const analyzeCompetitorStrategy = async (
    videos: any[],
    apiKey: string,
    queryContext: string
): Promise<StrategicAnalysis> => {
    if (!apiKey) {
        return {
            targetAudience: "초기 단계의 크리에이터 및 성장을 꿈꾸는 유튜브 시청층",
            hookPatterns: ["질문으로 시작하기", "결과물 먼저 보여주기", "반전 있는 썸네일"],
            visualStrategies: ["빠른 컷 전환", "채도 높은 썸네일", "자막 강조"],
            emotionalTriggers: ["호기심", "성장의 욕구", "공포 마케팅"],
            competitiveEdges: ["독보적인 기술력", "친근한 설명 방식"],
            contentGapOpportunities: ["중장년층을 위한 기술 가이드", "실패 사례 분석"]
        };
    }

    // Updated StrategicAnalysis interface internally to match or handle old structure
    // (Note: StrategicAnalysis in types.ts should be updated if possible, 
    // but for now I'll map the richer data to the existing structure for backward compatibility 
    // or slightly adjust the prompt to be richer within the strings)

    const prompt = `
당신은 세계적인 YouTube 성장 컨설턴트이자 데이터 분석가입니다. 
다음 YouTube 검색/트렌드 데이터를 바탕으로, 단순히 요약하는 수준을 넘어 '실행 가능한 고도의 전략 리포트'를 작성하세요.

사용자 입력 컨텍스트: ${queryContext}

데이터 (동영상 리스트):
${JSON.stringify(videos.map(v => ({ title: v.title, channel: v.channelName, views: v.viewCount, publishedAt: v.publishedAt })), null, 2)}

분석 가이드라인 (심층 분석):
1. **Target Audience (Hyper-Niche):** 단순히 '20대 남성'이 아니라, "무엇을 해결하고 싶어하고 무엇을 두려워하는지"에 대한 심리 페르소나를 정의하세요.
2. **Hook Strategies (The First 3s):** 시각적(Thumbnail), 청각적(Intro music/voice), 텍스트(Title keywords)가 어떻게 결합되어 있는지 분석하세요.
3. **Retention Tactics:** 영상 중간에 시청자가 나가지 못하게 하는 '정보의 배치'나 '반전' 요소를 찾아내세요.
4. **Niche Gap (Blue Ocean):** 경쟁자들이 "당연하게 여기고 지나치는 부분"이나 "댓글에서 시청자들이 계속 요구하지만 해결되지 않는 갈증"을 포착하세요.

응답은 JSON 형식으로만 해주세요 (Markdown 블록 없이):
{
  "targetAudience": "...",
  "hookPatterns": ["...", "..."],
  "visualStrategies": ["...", "..."],
  "emotionalTriggers": ["...", "..."],
  "competitiveEdges": ["...", "..."],
  "contentGapOpportunities": ["...", "..."]
}
`;

    // Fallback model list for Competitor Analysis
    const models = [
        { name: 'Gemini 3 Pro (Preview)', url: GEMINI_3_PRO_URL },     // Priority 1
        { name: 'Gemini 3 Flash (Preview)', url: GEMINI_3_FLASH_URL }, // Priority 2
        { name: 'Gemini 2.5 Flash', url: GEMINI_2_5_FLASH_URL },       // Priority 3
        { name: 'Gemini 1.5 Flash', url: GEMINI_1_5_FLASH_URL }        // Priority 4
    ];

    let lastError: any = null;

    for (const model of models) {
        try {
            console.log(`[Gemini] Competitor Analysis with model: ${model.name}`);
            const response = await axios.post(
                `${model.url}?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }]
                }
            );

            const text = response.data.candidates[0].content.parts[0].text;
            const cleanJson = text.replace(/```json\n ?|\n ? ```/g, '').trim();
            return JSON.parse(cleanJson);

        } catch (error: any) {
            console.warn(`[Gemini] Model ${model.name} failed:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    // If all failed
    console.error('[Gemini] All Strategic Analysis models failed:', lastError);
    throw lastError;
};

export const generateStrategyInsight = async (
    trendSnapshot: any,
    competitorSnapshot: any,
    apiKey: string,
    chatHistory?: Array<{ role: 'user' | 'model', text: string }> // NEW: context from discussion
): Promise<StrategyInsight> => {
    if (!apiKey) {
        // Mock success response
        return {
            id: 'mock-strategy',
            createdAt: Date.now(),
            executiveSummary: "본 채널은 '실무 중심의 도파민 지식 콘텐츠'를 핵심 전략으로 설정합니다.",
            keyOpportunities: ["3D 툴 입문자의 급격한 증가", "쉽고 친근한 튜토리얼의 부재"],
            keyRisks: ["기술 변화 속도가 매우 빠름", "유사 장르의 경쟁 심화"],
            recommendedPillars: [
                { pillarName: "도파민 지식", reason: "시청자의 즉각적인 호기심 해결" },
                { pillarName: "실무 워크플로우", reason: "실질적인 도움을 주는 전문성 확보" }
            ],
            recommendedSeries: [
                {
                    id: 's1',
                    title: "1분 만에 끝내는 마스터 클래스",
                    description: "복잡한 기술을 1분 내외의 강력한 후킹과 함께 전달하는 숏폼 시리즈",
                    targetPillar: "도파민 지식",
                    expectedAudience: "바쁜 현대인 및 쇼츠 중독자",
                    benchmarkVideos: []
                }
            ],
            recommendedEpisodes: [
                {
                    id: 'e1',
                    ideaTitle: "언리얼 엔진으로 5분 만에 시네마틱 만들기",
                    oneLiner: "누구나 할 수 있는 하이퀄리티 배경 제작법",
                    angle: "초보자의 눈높이에서 가장 화려한 결과물 도출",
                    format: "Vertical Shorts",
                    notes: "배경 음악 선정이 매우 중요함"
                }
            ],
            characters: [
                { name: "마스터 K", role: "메인 멘토", personality: "냉철하지만 따뜻한 조언가", visualGuide: "오피스룩, 따뜻한 조명, 스마트한 안경" }
            ],
            techStack: [
                { phase: "기획", tool: "Gemini 2.5 Flash", usage: "대본 및 기획안 전반" }
            ],
            marketingStrategy: {
                kpis: ["구독자 1만명", "평균 조회수 10만"],
                viralElements: ["반전 시나리오", "시청자 참여 투표"],
                interactiveIdeas: []
            }
        };
    }

    const chatContext = chatHistory && chatHistory.length > 0
        ? `\n\n**[CRITICAL] User's Strategic Direction (from Chat):**\n${chatHistory.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n')}\n\nIMPORTANT: The above discussion contains the user's latest creative vision and strategic requirements. Prioritize these ideas and requirements over the generic analysis. Construct a COHESIVE and FRESH strategy report that fully integrates these new concepts.`
        : '';

    const prompt = `
당신은 최고의 YouTube 콘텐츠 전략가입니다. 다음 '시장 데이터', '경쟁자 분석 데이터', 그리고 '사용자의 특별 기획 방향(채팅)'을 기반으로 채널의 필승 전략을 수립하세요.

${chatContext}

1. 기초 리서치 데이터:
    - 시장 컨텍스트: ${trendSnapshot.queryContext}
    - 타겟 페르소나 기초: ${competitorSnapshot.analysis?.targetAudience || '정보 없음'}
    - 경쟁자 후킹/공백 패턴: ${competitorSnapshot.analysis?.contentGapOpportunities?.join(', ') || '정보 없음'}

지시사항: 기초 리서치 데이터를 토대로 하되, 위에 제공된 '사용자의 특별 기획 방향(채팅)'을 핵심 원동력으로 삼아 아예 새로운 버전의 전략을 수립하십시오. 기존의 뻔한 분석이 아닌, 사용자가 제안한 참신한 아이디어가 전략 전체(Executive Summary부터 Episode까지)에 녹아들어야 합니다.

위 데이터를 통합하여 다음 형식의 '전략 인사이트'를 생성하세요(한국어로 응답):
    - Executive Summary: 전체적인 채널 운영 방향 및 핵심 차별화 전략
    - Key Opportunities & Risks: 시장 진입 시 활용할 기회와 주의할 리스크
    - Recommended Pillars: 채널을 지탱할 2-3가지 핵심 콘텐츠 기둥
    - Recommended Series: 시리즈 기획 1-2가지(제목, 설명, 타겟 필러, 예상 시청자)
    - Recommended Episodes: 즉시 제작 가능한 에피소드 아이디어 3-5가지
    - Characters: 비중 있는 캐릭터/페르소나 정의 (이름, 역할, 성격, 비주얼 가이드 프롬프트 포함)
    - Tech Stack: 제작 단계별 권장 AI 도구 및 활용법 (기획, 이미지, 비디오, 오디오 등)
    - Marketing & KPI: 인터랙티브 요소, 바이럴 전략 및 주요 목표 지표(KPI)
    - Channel Identity: 채널명, 슬로건, 핵심 가치, 미션, 타겟 오디언스, 톤앤매너, 컬러 팔레트

응답은 JSON 형식으로만 해주세요(Markdown 블록 없이, types.ts의 StrategyInsight 구조와 일치해야 함):
    {
        "executiveSummary": "...",
        "keyOpportunities": ["...", "..."],
        "keyRisks": ["...", "..."],
        "recommendedPillars": [
            { "pillarName": "...", "reason": "..." }
        ],
        "recommendedSeries": [
            {
                "id": "랜덤ID",
                "title": "...",
                "description": "...",
                "targetPillar": "...",
                "expectedAudience": "...",
                "benchmarkVideos": []
            }
        ],
        "recommendedEpisodes": [
            {
                "id": "랜덤ID",
                "ideaTitle": "...",
                "oneLiner": "...",
                "angle": "...",
                "format": "...",
                "notes": "..."
            }
        ],
        "characters": [
            { "name": "...", "role": "...", "personality": "...", "visualGuide": "PROMPT_HERE", "age": "..." }
        ],
        "techStack": [
            { "phase": "기획/이미지/비디오/오디오", "tool": "...", "usage": "..." }
        ],
        "marketingStrategy": {
            "kpis": ["...", "..."],
            "viralElements": ["...", "..."],
            "interactiveIdeas": ["...", "..."]
        },
        "channelIdentity": {
            "channelName": "...",
            "handle": "...",
            "bio": "...",
            "slogan": "...",
            "coreValues": ["...", "..."],
            "mission": "...",
            "targetAudience": "...",
            "toneOfVoice": "...",
            "colorPalette": ["#...", "..."],
            "bannerPrompt": "...",
            "profilePrompt": "...",
            "seoTags": ["...", "..."],
            "hashtags": ["...", "..."],
            "introText": "..."
        }
    }
    `;

    // Prioritize stable models for reliability
    const models = [
        { name: 'Gemini 2.5 Flash', url: GEMINI_2_5_FLASH_URL },       // Priority 1
        { name: 'Gemini 2.0 Flash', url: GEMINI_2_URL },              // Priority 2
        { name: 'Gemini 3 Flash (Preview)', url: GEMINI_3_FLASH_URL }, // Priority 3
        { name: 'Gemini 3 Pro (Preview)', url: GEMINI_3_PRO_URL },     // Priority 4
    ];

    let lastError: any = null;

    for (const model of models) {
        try {
            console.log(`[Gemini] Strategy Generation with model: ${model.name}`);
            const response = await axios.post(
                `${model.url}?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        response_mime_type: "application/json"
                    }
                },
                { timeout: 120000 } // 120 second timeout
            );

            const text = response.data.candidates[0].content.parts[0].text;
            const result = JSON.parse(text);

            // Add ID and timestamps if missing
            return {
                ...result,
                id: result.id || Math.random().toString(36).substring(2, 9),
                createdAt: Date.now(),
                trendSnapshotId: trendSnapshot.id,
                competitorSnapshotId: competitorSnapshot.id
            };

        } catch (error: any) {
            console.warn(`[Gemini] Model ${model.name} failed:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    // If all failed
    console.error('[Gemini] All Strategy Generation models failed:', lastError);
    throw lastError;
};

import { DEFAULT_CONSULTANT_INSTRUCTION } from '../data/personaTemplates';

export const consultStory = async (
    history: ChatMessage[],
    context: ProjectContext,
    apiKey: string,
    customInstruction?: string
): Promise<ConsultationResult> => {
    console.log("[Gemini Service] consultStory called. Has API Key:", !!apiKey, "Key length:", apiKey?.length);
    if (!apiKey) {
        // Mock response for dev without key
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    reply: "That sounds like a great start! A sci-fi mystery on Mars could be really compelling. What kind of tone are you looking for? Dark and gritty, or more adventurous?",
                    suggestedSeriesName: context.seriesName || "Red Dust Mysteries",
                    suggestedEpisodeName: context.episodeName || "The First Signal",
                    suggestedEpisodeNumber: 1,
                    suggestedSeriesStory: "In the year 2150, Mars has been terraformed, but secrets lie beneath the red dust.",
                    suggestedMainCharacters: "Detective Kael, Dr. Aris",
                    suggestedSeriesLocations: [{ name: "Mars Colony Alpha", description: "A dusty, red-tinted dome city.", visualSummary: "Wide shot of a massive red dome city on Mars surface, dusty atmosphere, cinematic lighting" }],
                    suggestedEpisodePlot: "Kael discovers a strange signal coming from the old mines.",
                    suggestedEpisodeCharacters: [{ name: "Mining Chief", role: "Witness", description: "Grumpy old miner.", visualSummary: "Close up of an elderly rugged miner with a thick beard, dirty face, wearing a worn spacesuit, high contrast lighting" }],
                    suggestedEpisodeLocations: [{ name: "Old Mines", description: "Dark, abandoned tunnels.", visualSummary: "Dark claustrophobic mine tunnel with flickering lights, damp walls, mysterious shadows" }],
                    suggestedDuration: 60
                });
            }, 1000);
        });
    }

    try {
        let systemInstruction = customInstruction || DEFAULT_CONSULTANT_INSTRUCTION;

        // Hydrate template variables
        systemInstruction = systemInstruction
            .replace('{{seriesName}}', context.seriesName || '')
            .replace('{{seriesStory}}', context.seriesStory || '')
            .replace('{{characters}}', JSON.stringify(context.characters))
            .replace('{{seriesLocations}}', JSON.stringify(context.seriesLocations))
            .replace('{{seriesProps}}', JSON.stringify(context.seriesProps))
            .replace('{{episodeName}}', context.episodeName || '')
            .replace('{{episodeNumber}}', String(context.episodeNumber))
            .replace('{{episodePlot}}', context.episodePlot || '')
            .replace('{{episodeCharacters}}', JSON.stringify(context.episodeCharacters))
            .replace('{{episodeLocations}}', JSON.stringify(context.episodeLocations))
            .replace('{{episodeProps}}', JSON.stringify(context.episodeProps))
            .replace('{{targetDuration}}', String(context.targetDuration))
            .replace('{{aspectRatio}}', context.aspectRatio)
            .replace('{{masterStyle}}', (context as any).masterStyle || '');



        // Import resolveUrl for idb:// handling
        const { resolveUrl } = await import('../utils/imageStorage');

        const contents = await Promise.all(history.map(async (msg) => {
            const parts: any[] = [];

            // Add text content
            let textContent = msg.content;

            // If there's file content, append it to the text message
            if (msg.fileContent && msg.fileName) {
                if (msg.fileType === 'json') {
                    textContent += `\n\n[Attached JSON file: ${msg.fileName}]\n\`\`\`json\n${msg.fileContent}\n\`\`\``;
                } else {
                    textContent += `\n\n[Attached file: ${msg.fileName}]\n\`\`\`\n${msg.fileContent}\n\`\`\``;
                }
            }

            parts.push({ text: textContent });

            // Check for image in message
            if (msg.image) {
                let imageData = msg.image;

                // Resolve idb:// URLs to actual base64 data
                if (msg.image.startsWith('idb://')) {
                    try {
                        console.log(`[Gemini] Resolving idb:// URL for chat image...`);
                        imageData = await resolveUrl(msg.image) || '';
                        if (!imageData || imageData.startsWith('idb://')) {
                            console.warn(`[Gemini] Failed to resolve idb:// URL, skipping image`);
                            imageData = ''; // Skip this image
                        }
                    } catch (e) {
                        console.error(`[Gemini] Error resolving idb:// URL:`, e);
                        imageData = ''; // Skip this image
                    }
                }

                // Only add image if we have valid base64 data
                if (imageData && imageData.startsWith('data:')) {
                    const cleanBase64 = imageData.split(',')[1] || imageData;
                    parts.push({
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: cleanBase64
                        }
                    });
                }
            }
            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: parts
            };
        }));

        const modelsToTry = [
            { name: 'Gemini 3.0 Pro', url: `${GEMINI_3_PRO_URL}?key=${apiKey}` },
            { name: 'Gemini 2.5 Flash', url: `${GEMINI_2_5_FLASH_URL}?key=${apiKey}` },
            { name: 'Gemini 2.0 Flash Exp', url: `${GEMINI_2_URL}?key=${apiKey}` },
            { name: 'Gemini 1.5 Pro', url: `${GEMINI_PRO_URL}?key=${apiKey}` }
        ];

        let lastError: any = null;
        let response: any = null;

        for (const model of modelsToTry) {
            try {
                console.log(`[Gemini] Consulting AI with model: ${model.name}`);
                response = await axios.post(
                    model.url,
                    {
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: systemInstruction }]
                            },
                            ...contents
                        ],
                        generationConfig: {
                            temperature: 0.9,
                            response_mime_type: "application/json"
                        }
                    }
                );
                if (response) break; // Success!
            } catch (e: any) {
                lastError = e;
                const status = e.response?.status;
                const msg = e.response?.data?.error?.message || e.message;
                console.warn(`[Gemini] Model ${model.name} failed (${status}): ${msg}`);
                // Continue to next model
            }
        }

        if (!response) {
            throw lastError || new Error("All Gemini models failed to respond.");
        }

        const generatedText = response.data.candidates[0].content.parts[0].text;

        try {
            const parsed = JSON.parse(generatedText);
            return {
                reply: parsed.reply,
                suggestedSeriesName: parsed.suggestedSeriesName,
                suggestedEpisodeName: parsed.suggestedEpisodeName,
                suggestedEpisodeNumber: parsed.suggestedEpisodeNumber,
                suggestedSeriesStory: parsed.suggestedSeriesStory,
                suggestedMainCharacters: parsed.suggestedMainCharacters,
                suggestedCharacters: parsed.suggestedCharacters,
                suggestedSeriesLocations: parsed.suggestedSeriesLocations,
                suggestedEpisodePlot: parsed.suggestedEpisodePlot,
                suggestedEpisodeCharacters: parsed.suggestedEpisodeCharacters,
                suggestedEpisodeLocations: parsed.suggestedEpisodeLocations,
                suggestedSeriesProps: parsed.suggestedSeriesProps, // NEW
                suggestedEpisodeProps: parsed.suggestedEpisodeProps, // NEW
                suggestedDuration: parsed.suggestedDuration,
                suggestedStorylineScenes: parsed.suggestedStorylineScenes
            };
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", e);
            return {
                reply: generatedText // Fallback if not JSON
            };
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};

export const enhancePrompt = async (
    basePrompt: string,
    type: 'character' | 'location' | 'style',
    context: string,
    apiKey: string
): Promise<string> => {
    if (!apiKey) return basePrompt + " (Enhanced)";

    const prompt = `
Enhance the following short description into a detailed, high-quality visual prompt.

Type: ${type}
Context: ${context}
Base Description: "${basePrompt}"

**CRITICAL INSTRUCTION:**
- If the "Base Description" contains specific headers or categories (e.g., [Face], [Costume], [Master Style]), **YOU MUST PRESERVE THESE HEADERS** in your output.
- Expand the content *under* each header with high-quality visual details.
- Do NOT merge separate categories into a single paragraph. Keep them distinct.

${type === 'style' ? `
   - Lighting (e.g., Chiaroscuro, Neon, Soft diffused)
   - Color Palette (e.g., Pastel, Desaturated, High contrast neon)
   - Camera/Lens (e.g., Wide angle, Macro, Bokeh, Film grain)

2. CHARACTER:
   - Anatomy/Proportions (e.g., Realistic, Chibi, Slender)
   - Skin/Texture rendering
   - Clothing material details

3. LOCATION:
   - Architectural style
   - Atmospheric elements (Fog, Dust, Rain)
   - Environment scale

4. PROP:
   - Object detail level
   - Texture wear (Rust, Scratches, Pristine)

Example Output:
## 1. VISUAL STYLE
Cinematic Cyberpunk Realism. 35mm film stock aesthetics with heavy grain. Lighting is dominated by neon teals and magentas contrasting with deep crushed blacks.

## 2. CHARACTER
Photorealistic skin textures with visible pores and sweat. Tech-wear fashion with matte black plastic and glowing LED accents.

## 3. LOCATION
Dense futuristic metropolis. Wet pavement reflecting neon lights. Towering Brutalist skyscrapers shrouded in toxic smog.

## 4. PROP
Gritty and used. Guns and gadgets show signs of wear, oil stains, and scratched metal.

- Return ONLY the categorized text.` : `
    REQUIRED STRUCTURE:
    
    [Visual Summary]
    (A concise, 1-2 sentence overview of the subject)

    [Detailed Features]
    (Deep dive into visual appearance. If the input has categories like [Face], [Body], list them here individually)

    [Atmosphere & Vibe]
    (Lighting, mood, texture, and artistic rendering style)

    - **IMPORTANT:** If the Base Description provided specific reference categories (e.g. "[Face]: ...", "[Costume]: ..."), you MUST list them as sub-headers under [Detailed Features] or distinct sections. 
    - Example:
      [Face]: Detailed description of facial features...
      [Costume]: Detailed description of clothing...
    
    - Return ONLY the enhanced prompt text.
`}
`;

    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );
        return response.data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
        console.error("Prompt Enhancement Failed:", error);
        return basePrompt;
    }
};

export const analyzeImage = async (
    imageBase64: string,
    apiKey: string
): Promise<string> => {
    if (!apiKey) return "Analyzed image description...";

    const models = [
        { name: 'Gemini 3 Pro', url: GEMINI_3_PRO_URL }, // User Priority
        { name: 'Gemini 3 Flash Preview', url: GEMINI_3_FLASH_URL },
        { name: 'Gemini 2.5 Flash', url: GEMINI_API_URL },
        { name: 'Gemini 1.5 Flash', url: GEMINI_1_5_FLASH_URL }, // Stable Fallback
        { name: 'Gemini 1.5 Pro', url: GEMINI_PRO_URL } // High Quality Fallback
    ];

    // Dynamic MIME type extraction
    const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
    let mimeType = "image/jpeg";
    let cleanBase64 = imageBase64;

    if (match) {
        mimeType = match[1];
        cleanBase64 = match[2];
    } else {
        cleanBase64 = imageBase64.split(',')[1] || imageBase64;
    }

    let lastError: any = null;

    for (const model of models) {
        try {
            console.log(`[Gemini] Analyzing image with model: ${model.name}`);
            const response = await axios.post(
                `${model.url}?key=${apiKey}`,
                {
                    contents: [{
                        parts: [
                            { text: "Describe this image in high detail, focusing on visual style, lighting, colors, and composition. This description will be used as a prompt to generate similar images. Return ONLY the description." },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: cleanBase64
                                }
                            }
                        ]
                    }]
                }
            );
            return response.data.candidates[0].content.parts[0].text.trim();
        } catch (error: any) {
            console.warn(`[Gemini] Analysis failed with ${model.name}:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    console.error("All Image Analysis Models Failed:", lastError);
    const msg = lastError?.response?.data?.error?.message || lastError?.message || "Unknown error";
    return `Failed to analyze image (All models overloaded/failed): ${msg}`;
};

export const generateVisualPrompt = async (
    context: string,
    referenceImages: string[], // Base64 strings
    apiKey: string
): Promise<string> => {
    if (!apiKey) return "Please provide an API key.";

    const models = [
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-pro:generateContent',
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
    ];

    const parts: any[] = [
        {
            text: `You are a world-class Visual Director and Prompt Engineer. 
Your goal is to write a highly detailed, single-paragraph image generation prompt for a YouTube thumbnail.

INPUT CONTEXT:
${context}

TASK:
1. Analyze the provided reference images (if any) for STYLE, LIGHTING, COMPOSITION, CHARACTER LOOK, and DESIGN DNA.
2. SYNTHESIZE these elements. TRANSLATE the "Design DNA" into COMPOSITION and ENERGY.
3. The prompt must be optimized for a high-end AI image generator (Imagen 3).
4. Focus strictly on VISUALS: lighting (e.g., volumetric, cinematic), camera angle (e.g., dramatic low angle), texture (e.g., 8k, hyper-detailed), and color palette.
5. DO NOT include narrative filler like "This image represents..." or "The scene captures...". Start directly with the subject.
6. NEGATIVE CONSTRAINT: DO NOT Mention, Include, or Render the 'Episode Number' or 'Series Number' in the image. The user will add text overlay separately.
7. LOGO PLACEMENT RULE:
   - If the context mentions a 'Logo' or 'Corporate CI' asset, explicit instruct the generator to place it in the TOP-RIGHT corner of the composition (or on an element in that area).
8. COMPOSITION & TEXT RULE:
   - Title: If the benchmarks suggest bold typography, you MAY ask to render the 'Thumbnail Title'.
   - ABSOLUTE PROHIBITION: Do NOT render 'Episode Number'.
9. Return ONLY the raw prompt string.
`
        }
    ];

    // Attach reference images with correct MIME type
    referenceImages.forEach(base64 => {
        const match = base64.match(/^data:(.+);base64,(.+)$/);
        let mimeType = "image/jpeg";
        let data = base64;

        if (match) {
            mimeType = match[1];
            data = match[2];
        } else {
            // Fallback cleanup if just base64 or has other prefix
            data = base64.split(',')[1] || base64;
        }

        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: data
            }
        });
    });

    let lastError = "Unknown Error";

    for (const modelUrl of models) {
        try {
            console.log(`[Gemini] Trying visual prompt with model: ${modelUrl}`);
            const response = await axios.post(
                `${modelUrl}?key=${apiKey}`,
                {
                    contents: [{ parts }]
                }
            );

            if (response.data && response.data.candidates && response.data.candidates.length > 0) {
                return response.data.candidates[0].content.parts[0].text.trim();
            }
        } catch (error: any) {
            const status = error.response?.status;
            const msg = error.response?.data?.error?.message || error.message;
            console.warn(`[Gemini] Model failed: ${modelUrl} (${status}) - ${msg}`);
            lastError = `${status}: ${msg}`;
            // Continue to next model
        }
    }

    return `Failed to generate visual prompt. Last Error: ${lastError}`;
};

/**
 * AI Instruction Helper - Modify script/video instructions via natural language
 */
export const modifyInstructionWithAI = async (
    currentInstruction: string,
    userRequest: string,
    instructionType: 'script' | 'video',
    apiKey: string
): Promise<{ success: boolean; modifiedInstruction?: string; explanation?: string; error?: string }> => {
    if (!apiKey) {
        return { success: false, error: 'API key is required' };
    }

    const systemPrompt = `You are an AI Instruction Editor specializing in prompt engineering for video/image generation.

Your task: Modify the given ${instructionType === 'script' ? 'Script Generation' : 'Video Prompt'} instructions based on the user's natural language request.

**IMPORTANT RULES:**
1. Preserve the overall structure and existing critical rules (like 8-second limit, audio type rules)
2. Only modify/add/remove parts relevant to the user's request
3. Keep the instruction format consistent (markdown with headers, bullet points, etc.)
4. If the request is unclear, make intelligent assumptions based on video production best practices
5. If the request would break core functionality, explain why and suggest an alternative

**RESPONSE FORMAT (JSON):**
{
    "modifiedInstruction": "The full modified instruction text",
    "explanation": "Brief explanation of what was changed (1-2 sentences in Korean)"
}

Return ONLY raw JSON, no markdown formatting.`;

    const userPrompt = `**Current ${instructionType === 'script' ? 'Script' : 'Video Prompt'} Instructions:**
\`\`\`
${currentInstruction}
\`\`\`

**User's Modification Request:**
"${userRequest}"

Please modify the instructions according to the user's request.`;

    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt }] },
                    { role: 'model', parts: [{ text: 'Understood. I will modify the instructions based on the user request and return the result as JSON.' }] },
                    { role: 'user', parts: [{ text: userPrompt }] }
                ],
                generationConfig: {
                    temperature: 0.7,
                    response_mime_type: "application/json"
                }
            }
        );

        const generatedText = response.data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(generatedText);

        return {
            success: true,
            modifiedInstruction: parsed.modifiedInstruction,
            explanation: parsed.explanation
        };
    } catch (error: any) {
        console.error('[Gemini] Instruction modification failed:', error);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message || 'Failed to modify instruction'
        };
    }
};

export const consultSupport = async (
    history: ChatMessage[],
    apiKey: string,
    systemPrompt: string
): Promise<string> => {
    if (!apiKey) {
        return "죄송합니다. API 키가 설정되지 않아 답변할 수 없습니다. 설정 메뉴에서 Gemini API Key를 입력해주세요.";
    }

    try {
        const contents = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const response = await axios.post(
            `${GEMINI_2_5_FLASH_URL}?key=${apiKey}`,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `SYSTEM_INSTRUCTION: ${systemPrompt}\n\nIMPORTANT: You must output ONLY text, no JSON. Be helpful, concise, and friendly.\n\n` }]
                    },
                    ...contents
                ],
                generationConfig: {
                    temperature: 0.7,
                }
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    } catch (error: any) {
        console.error("Gemini Support Chat Error:", error);
        return `오류가 발생했습니다: ${error.message || 'Unknown Error'}`;
    }
};


// =============================================
// YouTube Trend Analysis Functions (Step 0)
// =============================================


/**
 * Analyze trending videos and extract insights for storytelling and thumbnails
 * Enhanced with competitor benchmarking analysis
 */
export const analyzeTrendVideos = async (
    videos: YouTubeTrendVideo[],
    apiKey: string,
    targetLanguage: string = 'ko'
): Promise<{ insights: TrendAnalysisInsights; translations: Record<string, string>; keywordMeanings: Record<string, string> }> => {
    if (!apiKey) {
        return {
            insights: {
                thumbnail: { recommendations: ['API 키가 필요합니다.'] },
                title: { recommendations: ['API 키가 필요합니다.'] },
                storytelling: { recommendations: ['API 키가 필요합니다.'] }
            },
            translations: {},
            keywordMeanings: {}
        };
    }

    const prompt = `You are a top-tier YouTube content strategist analyzing high-performing videos.

**VIDEO DATA:**
${videos.slice(0, 15).map((v, i) => `${i + 1}. "${v.title}" by ${v.channelName}
   - Views: ${v.viewCount.toLocaleString()}, Engagement: ${((v.likeCount + v.commentCount) / v.viewCount * 100).toFixed(2)}%
   - Duration: ${v.duration || 'Unknown'}`).join('\n')}

**COMPREHENSIVE BENCHMARKING ANALYSIS:**
Analyze these top-performing videos and provide detailed insights in the following categories:

1. **THUMBNAIL ANALYSIS**
   - 색감/색상 패턴 (어떤 컬러가 지배적인가?)
   - 텍스트 스타일 (폰트, 크기, 배치)
   - 구도 (센터 vs 삼분법 vs 기타)
   - 표정/인물 (얼굴 표현, 시선 방향)

2. **TITLE ANALYSIS**
   - 주요 키워드 패턴
   - 제목 길이 (평균 글자 수)
   - 감정 트리거 (숫자, 질문형, 충격적 표현, 이모지)

3. **STORYTELLING/HOOK ANALYSIS (첫 0~10초)**
   - 후킹 기법 (질문, 충격, 예고, 궁금증 유발)
   - 스토리 전개 방식
   - 카메라 워크 패턴

4. **VIDEO LENGTH ANALYSIS**
   - 평균 영상 길이
   - 최적 길이 범위

5. **UPLOAD SCHEDULE (if detectable)**
   - 추천 업로드 요일/시간대
   - 업로드 주기

**KEYWORD TRANSLATION & MEANING:**
${targetLanguage !== 'ko' ? `For non-Korean content, translate AND explain the meaning of key hashtags/topics:
${videos.slice(0, 10).map(v => `- "${v.title}"`).join('\n')}` : 'Extract main keywords and explain their meaning/context for Korean viewers'}

**RESPONSE FORMAT (JSON):**
{
    "insights": {
        "thumbnail": {
            "colorScheme": "지배적 색상 패턴 분석",
            "textStyle": "텍스트 스타일 분석",
            "composition": "구도 분석",
            "faceExpression": "표정/인물 분석",
            "recommendations": ["구체적 추천1", "구체적 추천2", "구체적 추천3"]
        },
        "title": {
            "keywords": "주요 키워드 패턴",
            "length": "제목 길이 분석",
            "emotionalTriggers": "감정 트리거 분석",
            "recommendations": ["제목 작성 팁1", "제목 작성 팁2"]
        },
        "storytelling": {
            "hookMethods": "0~10초 후킹 기법 상세 분석",
            "narrativeStructure": "스토리 전개 방식",
            "cameraWorkPatterns": "카메라 워크 패턴",
            "recommendations": ["후킹 추천1", "후킹 추천2"]
        },
        "videoLength": {
            "avgDuration": "평균 X분 Y초",
            "optimalRange": "최적 범위 (예: 8-12분)",
            "recommendations": ["길이 관련 조언"]
        },
        "uploadSchedule": {
            "bestDays": "추천 요일",
            "bestTimes": "추천 시간대",
            "frequency": "추천 주기",
            "recommendations": ["스케줄 조언"]
        }
    },
    "translations": {
        "original title or keyword": "한국어 번역"
    },
    "keywordMeanings": {
        "keyword": "이 키워드가 유튜브에서 의미하는 바와 사용 맥락 설명 (한국어)"
    }
}

Respond in Korean. Be specific and actionable. Return ONLY raw JSON.`;

    try {
        const response = await axios.post(
            `${GEMINI_2_5_FLASH_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    response_mime_type: "application/json"
                }
            }
        );

        const generatedText = response.data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(generatedText);

        return {
            insights: parsed.insights,
            translations: parsed.translations || {},
            keywordMeanings: parsed.keywordMeanings || {}
        };
    } catch (error: any) {
        console.error('[Gemini] Trend analysis failed:', error);
        return {
            insights: {
                thumbnail: { recommendations: [`분석 실패: ${error.message}`] },
                title: { recommendations: [`분석 실패: ${error.message}`] },
                storytelling: { recommendations: [`분석 실패: ${error.message}`] }
            },
            translations: {},
            keywordMeanings: {}
        };
    }
};

/**
 * Analyze user's channel and provide improvement suggestions
 */
export const analyzeChannelForInsights = async (
    apiKey: string,
    channel: ChannelAnalysis
): Promise<string> => {
    if (!apiKey) {
        return "API 키가 필요합니다.";
    }

    const prompt = `You are a YouTube growth consultant analyzing a channel's performance.

**CHANNEL DATA:**
- Name: ${channel.channelName}
- Subscribers: ${channel.subscriberCount.toLocaleString()}
- Total Videos: ${channel.videoCount}
- Average Views: ${channel.avgViews.toLocaleString()}
- Average Engagement: ${channel.avgEngagement}%

**TOP PERFORMING VIDEOS:**
${channel.topVideos.slice(0, 5).map((v, i) =>
        `${i + 1}. "${v.title}" - ${v.viewCount.toLocaleString()} views (${((v.likeCount + v.commentCount) / v.viewCount * 100).toFixed(2)}% engagement)`
    ).join('\n')}

**RECENT VIDEOS:**
${channel.recentVideos.slice(0, 5).map((v, i) =>
        `${i + 1}. "${v.title}" - ${v.viewCount.toLocaleString()} views`
    ).join('\n')}

**PROVIDE IMPROVEMENT ANALYSIS:**
1. 📌 **썸네일 개선**: 상위 영상과 최근 영상의 썸네일 패턴 비교, 개선점 제안
2. 📝 **제목 최적화**: 클릭률을 높일 수 있는 제목 패턴 제안
3. 🎬 **콘텐츠 구성**: 스토리텔링, 후킹, 편집 스타일 개선점
4. 📅 **업로드 전략**: 적절한 업로드 주기 및 시간대
5. 🎯 **성장 포인트**: 채널 성장을 위한 핵심 조언

Write in Korean. Be specific and actionable. Format with headers and bullet points.`;

    try {
        const response = await axios.post(
            `${GEMINI_2_5_FLASH_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.8
                }
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    } catch (error: any) {
        console.error('[Gemini] Channel analysis failed:', error);
        return `채널 분석 실패: ${error.message || 'Unknown error'}`;
    }
};

export const generateText = async (
    prompt: string,
    apiKey: string,
    responseMimeType?: string,
    generationConfig?: any,
    systemInstruction?: string
): Promise<string> => {
    if (!apiKey) return "API Key is missing.";

    console.log('[generateText] Starting with prompt length:', prompt.length);

    // Prioritize stable models for reliability with long inputs
    const models = [
        { name: 'Gemini 2.5 Flash', url: GEMINI_2_5_FLASH_URL },       // Priority 1: Most stable
        { name: 'Gemini 2.0 Flash', url: GEMINI_2_URL },              // Priority 2: Fast fallback
        { name: 'Gemini 3 Flash (Preview)', url: GEMINI_3_FLASH_URL }, // Priority 3: Latest
        { name: 'Gemini 3 Pro (Preview)', url: GEMINI_3_PRO_URL },     // Priority 4: Powerful but slow
    ];

    let lastError: any = null;

    // Combine system instruction if provided
    const finalPrompt = systemInstruction
        ? `${systemInstruction}\n\nUser Query: ${prompt}`
        : prompt;

    console.log('[generateText] Final prompt length:', finalPrompt.length);

    for (const model of models) {
        try {
            console.log(`[generateText] Trying model: ${model.name}...`);
            const response = await axios.post(
                `${model.url}?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: finalPrompt }] }],
                    generationConfig: {
                        temperature: generationConfig?.temperature ?? 0.7,
                        response_mime_type: responseMimeType || generationConfig?.response_mime_type,
                        ...generationConfig
                    }
                },
                { timeout: 120000 } // 120 second timeout for long inputs
            );

            console.log(`[generateText] Success with ${model.name}!`);
            return response.data.candidates[0].content.parts[0].text;
        } catch (error: any) {
            console.warn(`[generateText] ${model.name} failed:`, error.code || error.message);
            lastError = error;
        }
    }

    console.error('[generateText] All models failed.');
    throw lastError || new Error("All models failed to generate text");
};

