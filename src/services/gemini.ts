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
const GEMINI_PRO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const GEMINI_2_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

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
      - Do NOT translate Character, Location, or Prop names. Use them EXACTLY as they appear in the provided lists (e.g., if "Stick" is English, keep it "Stick" even if writing in Korean).
      
      **AUDIO TYPE RULES (CRITICAL - MUST FOLLOW):**
      Every cut MUST have a clearly defined audio type. Choose ONE:
      
      - **DIALOGUE:** Has a speaker and spoken text.
        • speaker MUST be a specific character name from the "Available Characters" list above.
        • Do NOT use nicknames or placeholders. Use the exact name (e.g., "Max Fisher").
        • If the speaker is a generic narrator, use exactly "Narrator".
        • Every dialogue line MUST have a valid speaker. Do NOT leave it blank or as "Unknown".
        
      - **SILENT:** No spoken audio at all.
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
        - ALWAYS use the EXACT asset names from "Available Characters" and "Available Locations" lists.
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
                // Visual source priority: Step 2 Asset Def (Highest) > Step 1 Visual Summary
                const step1Desc = c.description || '';
                const step1Visual = c.visualSummary || '';
                const step2Desc = (assetDef as any)?.description || '';

                const visualDetails = step2Desc || step1Visual;

                if (visualDetails && visualDetails !== step1Desc) {
                    // EXPLICITLY separate Narrative vs Visual to prevent AI confusion
                    // This ensures "Old Name" in visual details doesn't override "New Name" in narrative
                    return `- ${c.name} (${c.role}):
  * Story Context: ${step1Desc}
  * Visual Appearance: ${visualDetails}`;
                }

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
                // Visual source priority: Step 2 Asset Def (Highest) > Step 1 Visual Summary
                const step1Desc = l.description || '';
                const step1Visual = l.visualSummary || '';
                const step2Desc = (assetDef as any)?.description || '';

                const visualDetails = step2Desc || step1Visual;

                if (visualDetails && visualDetails !== step1Desc) {
                    return `- ${l.name}:
  * Story Context: ${step1Desc}
  * Visual Appearance: ${visualDetails}`;
                }

                return `- ${l.name}: ${step1Desc}`;
            }).join('\n');
        } else {
            locationInfo = 'No specific locations defined';
        }

        // Build storyline context if available
        let storylineContext = '';
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

        const prompt = `
      You are a professional screenwriter. Create a video script for a YouTube short.
      
      **Series Information:**
      Series: "${seriesName}"
      Episode: "${episodeName}"
      
      **Episode Plot:**
      ${episodePlot || 'Create an engaging short story'}
      
      **Available Characters:**
      ${characterInfo}
      
      **Available Locations:**
      ${locationInfo}
      ${storylineContext}
      ${lockedCutsContext}
      
      **Production Details:**
      - Target Duration: ${targetDuration} seconds
      - Visual Style: ${JSON.stringify(stylePrompts)}
      
      ${customInstructions || DEFAULT_SCRIPT_INSTRUCTIONS}
    `;

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            }
        );

        let generatedText = response.data.candidates[0].content.parts[0].text;

        // Remove markdown formatting if present
        generatedText = generatedText.replace(/```json\n?|\n?```/g, '').trim();

        const rawScript = JSON.parse(generatedText);

        // Create a list of valid speaker names for normalization
        const validSpeakerNames = [
            'Narrator',
            'SILENT',
            ...(characters || []).map((c: any) => c.name)
        ].filter(Boolean);

        // Normalize and ensure IDs are numbers
        return rawScript.map((cut: any, index: number) => {
            // ... (Rest of locked cut logic stays same)
            // NEW: LOCKED CUT OVERRIDE
            // Before applying ANY AI-correction logic, check if this cut slot belongs to a locked cut.
            // We align based on Index (since ID might shift if AI inserts checks, though we asked it not to).
            // Better: aligned by content match? No, that's impossible if content changed.
            // Best: Use the existingScript array index if available, assuming AI followed instructions to keep count similar.
            // BUT: AI might add/remove cuts. 
            // safer strategy: If we passed existingScript, we asked AI to keep locked cuts. 
            // We can try to match by ID if the AI preserved IDs.

            let lockedOriginal = null;
            if (existingScript) {
                // 1. Try exact ID match (if AI kept the ID)
                lockedOriginal = existingScript.find(c => c.id === cut.id && (c.isConfirmed || c.isAudioConfirmed || c.isImageConfirmed));

                // 2. Fallback: If AI renumbered but we are in the "preserve" zone? 
                // Actually, if ID mismatch, it's risky. But let's trust exact ID match first found in the AI output.
                // The AI prompt explicitly included [CUT #ID].
            }

            if (lockedOriginal) {
                console.log(`[Gemini] Restoring LOCKED cut #${lockedOriginal.id} content verbatim.`);
                return {
                    ...cut, // Keep any new metadata AI might have added (like sfxDescription if it hallucinated?) - actually NO.
                    // We must restore core content exactly.
                    id: lockedOriginal.id, // Enforce original ID
                    speaker: lockedOriginal.speaker,
                    dialogue: lockedOriginal.dialogue,
                    visualPrompt: lockedOriginal.visualPrompt,
                    // Preserve other locked props
                    videoPrompt: lockedOriginal.videoPrompt,
                    audioUrl: lockedOriginal.audioUrl,
                    finalImageUrl: lockedOriginal.finalImageUrl,
                    isConfirmed: lockedOriginal.isConfirmed,
                    isAudioConfirmed: lockedOriginal.isAudioConfirmed,
                    isImageConfirmed: lockedOriginal.isImageConfirmed,
                    // Use AI's estimated duration if original didn't have one? No, keep original.
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
                        // (e.g. "Kael (angry)" -> "Kael")
                        const partialMatch = validSpeakerNames.find(s => rawSpeaker.toLowerCase().includes(s.toLowerCase()));
                        if (partialMatch) {
                            speaker = partialMatch;
                        } else {
                            // Final fallback: if there are characters, use the first one, otherwise Narrator
                            speaker = validSpeakerNames.length > 2 ? validSpeakerNames[2] : 'Narrator';
                            console.warn(`[Gemini] Could not resolve speaker "${rawSpeaker}". Falling back to "${speaker}"`);
                        }
                    }
                }
            }

            let dialogue = cut.dialogue || cut.content || cut.text || '...';

            // SELF-HEALING: Fix common AI hallucinations
            // 1. If Speaker is SFX but dialogue seems like speech (not wrapped in brackets), change to Narrator
            if (speaker.toUpperCase() === 'SFX' && !dialogue.trim().startsWith('[')) {
                console.warn(`[Gemini] Auto-corrected SFX speaker to Narrator for dialogue: "${dialogue.substring(0, 20)}..."`);
                speaker = 'Narrator';
            }

            // 2. If Speaker is SILENT but dialogue is long text, change to Narrator
            if (speaker.toUpperCase() === 'SILENT' && dialogue.length > 20 && !dialogue.trim().startsWith('[')) {
                console.warn(`[Gemini] Auto-corrected SILENT speaker to Narrator for dialogue: "${dialogue.substring(0, 20)}..."`);
                speaker = 'Narrator';
            }

            // 3. SFX MIGRATION: Aggressive Detection
            // If Speaker is 'SFX' OR Dialogue is purely bracketed/parenthesized SFX
            const sfxRegex = /^\[.*(SFX|Sound|Music|Audio|Effect|BGM).*\]$/i;
            const sfxParenRegex = /^\(.*(SFX|Sound|Music|Audio|Effect|BGM).*\)$/i;
            const isSfxDialogue = sfxRegex.test(dialogue.trim()) || sfxParenRegex.test(dialogue.trim()) || dialogue.trim().startsWith('[SFX:');

            if (speaker.toUpperCase() === 'SFX' || isSfxDialogue) {
                // Extract description from dialogue if possible
                let description = cut.sfxDescription || '';

                // Try to clean up the dialogue to get the description
                // e.g., "[SFX: Alarm]" -> "Alarm"
                const cleanDesc = dialogue.replace(/^\[(SFX|Sound|Music|Audio|Effect|BGM):?\s*/i, '').replace(/\]$/, '').trim();

                if (cleanDesc && cleanDesc !== 'SILENT' && cleanDesc !== '무음') {
                    description = cleanDesc;
                }

                console.log(`[Gemini] Auto-corrected SFX cut -> SILENT. Desc: "${description}"`);

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

    } catch (error) {
        console.error('Gemini Script Generation Failed:', error);
        throw error;
    }
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
            .replace('{{aspectRatio}}', context.aspectRatio);



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
Requirements:
- Add sensory details (lighting, texture, atmosphere).
- Specify artistic style if relevant to the context.
- Keep it focused and evocative.
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

    try {
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

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
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
    } catch (error) {
        console.error("Image Analysis Failed:", error);
        return "Failed to analyze image.";
    }
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
