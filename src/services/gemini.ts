import axios from 'axios';

export interface ScriptCut {
    id: number;
    speaker: string;
    dialogue: string;
    visualPrompt: string;
    estimatedDuration: number;
    draftImageUrl?: string;        // Legacy: Quick preview images
    finalImageUrl?: string;        // NEW: Final quality image from Step 4
    audioUrl?: string;             // NEW: Generated audio from Step 4
    referenceAssetIds?: string[];  // Manual asset selection
    referenceCutIds?: number[];    // NEW: Manual previous cut selection
    isConfirmed?: boolean;         // Lock status
    emotion?: string;              // NEW: Emotional tone (neutral/happy/sad/angry/excited/calm/tense)
    emotionIntensity?: 'low' | 'moderate' | 'high';  // NEW: Emotion strength
    language?: 'en-US' | 'ko-KR';  // NEW: Detected language for voice selection
    voiceGender?: 'male' | 'female' | 'neutral';  // NEW: Manual gender override
    voiceAge?: 'child' | 'young' | 'adult' | 'senior';  // NEW: Age range for voice
    storylineSceneId?: string;     // NEW: Link to source storyline scene
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
    assetDefinitions?: Record<string, any>  // NEW: Step 2 asset definitions
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
                const assetDef = assetDefinitions ? Object.values(assetDefinitions).find(
                    (a: any) => a.type === 'character' && a.name === c.name
                ) : null;

                // Use Step 2 description if available (more detailed), otherwise Step 1
                const description = (assetDef as any)?.description || c.description;
                return `- ${c.name} (${c.role}): ${description}`;
            }).join('\n');
        } else {
            characterInfo = 'No specific characters defined';
        }

        // Build location info string with Step 2 asset details
        let locationInfo = '';
        if (locations && locations.length > 0) {
            locationInfo = locations.map(l => {
                // Try to find matching asset definition from Step 2
                const assetDef = assetDefinitions ? Object.values(assetDefinitions).find(
                    (a: any) => a.type === 'location' && a.name === l.name
                ) : null;

                // Use Step 2 description if available (more detailed), otherwise Step 1
                const description = (assetDef as any)?.description || l.description;
                return `- ${l.name}: ${description}`;
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
      
      **Production Details:**
      - Target Duration: ${targetDuration} seconds
      - Visual Style: ${JSON.stringify(stylePrompts)}
      
      **Instructions:**
      Break the episode plot into cinematic cuts that fit within ${targetDuration} seconds total.
      
      **Strict Constraints:**
      1. **Duration:** Each cut must be LESS THAN 8 seconds.
      2. **One Visual Per Cut:** Each cut must depict exactly ONE static visual scene. Do not describe scene transitions or multiple sequential actions in a single visual prompt. If the visual changes, create a new cut.
      3. **Asset Names:** You MUST use the exact official names provided in "Available Characters" and "Available Locations" when writing visual prompts. 
         - Example: If the location is "Company Office", use "Company Office". Do NOT use "Meriel's Office" or "The office".
         - This is critical for automated asset matching.
      
      For each cut, provide:
      - speaker: Name of the speaker (use character names from above) or "Narrator"
      - dialogue: The spoken text that advances the story
      - language: Detected language code based on dialogue text (en-US for English, ko-KR for Korean)
      - emotion: Emotional tone of the dialogue (neutral/happy/sad/angry/excited/calm/tense)
      - emotionIntensity: Strength of the emotion (low/moderate/high)
      - visualPrompt: **CRITICAL - Use STRICT cinematographic format with ALL FIVE components:**
        Format: (Shot Size) + (Angle) + (Subject & Action) + (Camera Movement) + (Lighting/Style)
        
        REQUIRED COMPONENTS:
        1. Shot Size: Wide shot / Medium shot / Close-up / Extreme close-up / Full shot / Medium close-up
        2. Angle: Eye-level / Low angle / High angle / Dutch angle / Over-the-shoulder / Bird's eye view
        3. Subject & Action: [Character Name] + specific action/pose + [Location Name] + environment details
        4. Camera Movement: Static / Slow pan / Zoom in / Zoom out / Tracking / Dolly
        5. Lighting/Style: Golden hour / Dramatic shadows / Soft lighting / Neon / Cinematic / Noir / etc.
        
        GOOD Example: "Wide shot, low angle, Detective Kane standing in Rain-Soaked Street looking up at building, static camera, dramatic noir lighting with wet pavement reflections"
        BAD Example: "Detective in the street" (missing all components)
        
        **Use ONLY exact character/location names from lists above. Vary shot sizes and angles for visual diversity.**
      - estimatedDuration: Duration in seconds (Must be < 8s)
      
      **Important:**
      - Use the characters and locations defined above
      - Ensure the dialogue tells the episode plot cohesively
      - Visual prompts should reference specific characters/locations by name for consistency
      - Total duration should approximately match ${targetDuration} seconds
      
      Return ONLY a raw JSON array of objects with keys: id, speaker, dialogue, language, emotion, emotionIntensity, visualPrompt, estimatedDuration.
      Do not include markdown formatting like \`\`\`json.
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

        const generatedText = response.data.candidates[0].content.parts[0].text;
        const script = JSON.parse(generatedText);

        // Ensure IDs are numbers
        return script.map((cut: any, index: number) => ({
            ...cut,
            id: index + 1,
            estimatedDuration: Number(cut.estimatedDuration)
        }));

    } catch (error) {
        console.error('Gemini Script Generation Failed:', error);
        throw error;
    }
};

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

export interface AiCharacter {
    name: string;
    role: string;
    description: string;
}

export interface StorylineScene {
    id?: string;
    sceneNumber: number;
    estimatedTime: string;
    content: string;
    directionNotes: string;
    linkedCutIds?: number[];  // NEW: Track which cuts belong to this scene
}

export interface ConsultationResult {
    reply: string;
    suggestedSeriesName?: string;
    suggestedEpisodeName?: string;
    suggestedEpisodeNumber?: number;
    suggestedSeriesStory?: string;
    suggestedMainCharacters?: string;
    suggestedCharacters?: AiCharacter[];
    suggestedSeriesLocations?: { name: string; description: string }[];
    suggestedEpisodePlot?: string;
    suggestedEpisodeCharacters?: AiCharacter[];
    suggestedEpisodeLocations?: { name: string; description: string }[];
    suggestedDuration?: number;
    suggestedStorylineScenes?: StorylineScene[];  // NEW: AI-suggested storyline breakdown
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
    targetDuration: number;
    aspectRatio: string;
}

export const consultStory = async (
    history: ChatMessage[],
    context: ProjectContext,
    apiKey: string
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
                    suggestedSeriesLocations: [{ name: "Mars Colony Alpha", description: "A dusty, red-tinted dome city." }],
                    suggestedEpisodePlot: "Kael discovers a strange signal coming from the old mines.",
                    suggestedEpisodeCharacters: [{ name: "Mining Chief", role: "Witness", description: "Grumpy old miner." }],
                    suggestedEpisodeLocations: [{ name: "Old Mines", description: "Dark, abandoned tunnels." }],
                    suggestedDuration: 60
                });
            }, 1000);
        });
    }

    try {
        const systemInstruction = `You are a creative writing partner for a video production workflow. 
        Your goal is to help the user develop a story for a series and a specific episode.
        
        CURRENT PROJECT CONTEXT (Use this to inform your suggestions):
        - Series Name: "${context.seriesName}"
        - Series Story: "${context.seriesStory}"
        - Main Characters: ${JSON.stringify(context.characters)}
        - Series Locations: ${JSON.stringify(context.seriesLocations)}
        - Episode Name: "${context.episodeName}" (Ep #${context.episodeNumber})
        - Episode Plot: "${context.episodePlot}"
        - Episode Characters: ${JSON.stringify(context.episodeCharacters)}
        - Episode Locations: ${JSON.stringify(context.episodeLocations)}
        - Target Duration: ${context.targetDuration}s
        - Aspect Ratio: ${context.aspectRatio}
        
        You should chat naturally, but also try to extract or suggest specific project details when possible.
        
        CRITICAL - CHARACTER AND LOCATION DESCRIPTIONS:
        When suggesting characters or locations, the "description" field must include BOTH:
        1. Story context/personality traits (1-2 sentences)
        2. Detailed visual image prompt for AI generation (specific appearance details)
        
        Format example for character:
        "A cynical detective who has seen too much. Visual: A tall middle-aged man, sharp angular features, tired blue eyes, wearing a gray trench coat over a rumpled suit, stubble on chin, holding a lit cigarette, noir lighting with dramatic shadows"
        
        Format example for location:
        "The main hub of the Mars colony where all trade happens. Visual: A massive dome-shaped structure with red sand visible outside through transparent walls, futuristic chrome buildings inside, holographic market stalls, blue-tinted lighting, bustling crowd of people in spacesuits"
        
        IMPORTANT DISTINCTION:
        - "suggestedCharacters": MAIN CHARACTERS for the ENTIRE SERIES (name, role, description with story context + visual prompt)
        - "suggestedSeriesLocations": KEY LOCATIONS for the SERIES (name, description with context + visual prompt)
        - "suggestedEpisodeCharacters": Characters ONLY in THIS EPISODE (name, role, description with context + visual prompt)
        - "suggestedEpisodeLocations": Locations ONLY in THIS EPISODE (name, description with context + visual prompt)
        - "suggestedStorylineScenes": Scene breakdown array with sceneNumber, estimatedTime, content, directionNotes
        
        ALWAYS return valid JSON:
        {
            "reply": "Your conversational response...",
            "suggestedSeriesName": "Series name (optional)",
            "suggestedEpisodeName": "Episode name (optional)",
            "suggestedEpisodeNumber": 1 (optional),
            "suggestedSeriesStory": "Brief series summary (optional)",
            "suggestedMainCharacters": "Character list string (optional)",
            "suggestedCharacters": [{"name": "Name", "role": "Role", "description": "Story context. Visual: detailed appearance"}] (optional),
            "suggestedSeriesLocations": [{"name": "Name", "description": "Context. Visual: detailed appearance"}] (optional),
            "suggestedEpisodePlot": "Episode plot summary (optional)",
            "suggestedEpisodeCharacters": [{"name": "Name", "role": "Role", "description": "Story context. Visual: detailed appearance"}] (optional),
            "suggestedEpisodeLocations": [{"name": "Name", "description": "Context. Visual: detailed appearance"}] (optional),
            "suggestedDuration": 60 (optional),
            "suggestedStorylineScenes": [{"sceneNumber": 1, "estimatedTime": "0:00-0:30", "content": "Summary", "directionNotes": "Notes"}] (optional)
        }
        
        If the user hasn't provided enough info, omit fields or suggest creative defaults.
        Keep the "reply" engaging and helpful. Ask follow-up questions to develop the story.
        `;

        const contents = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: systemInstruction }] // Prepend system instruction as first user message context
                    },
                    ...contents
                ],
                generationConfig: {
                    temperature: 0.9,
                    response_mime_type: "application/json"
                }
            }
        );

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
    You are an expert visual prompt engineer for AI image generation (Midjourney/Stable Diffusion).
    Enhance the following short description into a detailed, high-quality visual prompt.
    
    Type: ${type}
    Context: ${context}
    Base Description: "${basePrompt}"
    
    Requirements:
    - Add sensory details (lighting, texture, atmosphere).
    - Specify artistic style if relevant to the context.
    - Keep it focused and evocative.
    - Return ONLY the enhanced prompt text.
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
        // Remove header if present (data:image/jpeg;base64,)
        const cleanBase64 = imageBase64.split(',')[1] || imageBase64;

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{
                    parts: [
                        { text: "Describe this image in high detail, focusing on visual style, lighting, colors, and composition. This description will be used as a prompt to generate similar images. Return ONLY the description." },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
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
