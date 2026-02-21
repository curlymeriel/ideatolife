const axios = require('axios');

async function testGeminiTTS() {
    const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
    // Use the API key from the environment or pass it as an argument
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.argv[2];

    if (!apiKey) {
        console.error("Please provide Gemini API key as an argument.");
        return;
    }

    const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;

    try {
        const response = await axios.post(
            `${GEMINI_TTS_URL}?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: "테스트 음성입니다." }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Aoede"
                            }
                        }
                    }
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );

        console.log("Raw Response:");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (e) {
        if (e.response) {
            console.error("API Error Response:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
    }
}

testGeminiTTS();
