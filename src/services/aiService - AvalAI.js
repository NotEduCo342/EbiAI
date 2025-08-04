// src/services/aiService.js

const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getAiResponse(userInput, persona) {
    // --- DIAGNOSTIC STEP 1: Log the key to be 100% sure it's correct ---
    console.log('[DIAGNOSTIC] Key being used by aiService:', process.env.AVALAI_API_KEY);

    // --- DIAGNOSTIC STEP 2: Use a different, very common model to test ---
    const modelName = "deepseek-chat"; 
    // gemini-2.5-flash
    // gpt-4o-mini
    // deepseek-chat
    
    let currentBackoff = INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[AI Service] Attempt ${attempt} with model ${modelName} via AvalAI...`);
            
            const response = await fetch("https://api.avalai.ir/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.AVALAI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": modelName,
                    "messages": [
                        { "role": "system", "content": persona },
                        { "role": "user", "content": userInput }
                    ]
                })
            });

            if (response.status === 401) {
                console.error("[AI Service] CRITICAL: AvalAI returned 401 Unauthorized. This confirms the API key is the issue.");
                return "یک مشکل فنی در بخش هوش مصنوعی بوجود آمده است.";
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.choices[0].message.content;

            return text; // Success!

        } catch (error) {
            const logData = { service: "AvalAI", model: modelName, attempt, maxRetries: MAX_RETRIES, errorMessage: error.message };
            console.error("[AI Service] Request failed.", logData);

            if (attempt < MAX_RETRIES) {
                await delay(currentBackoff);
                currentBackoff *= 2;
            }
        }
    }

    console.error("[AI Service] All AI attempts failed after reaching max retries.");
    return "متاسفانه در حال حاضر نمیتونم به این سوال جواب بدم. شاید بعدا بتونم.";
}

module.exports = { getAiResponse };