// src/services/aiService.js

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets a response from the OpenRouter API using the DeepSeek model,
 * with structured logging and intelligent error handling.
 * @param {string} userInput The user's message to the bot.
 * @param {string} persona A string describing the persona the AI should adopt.
 * @returns {Promise<string>} A promise that resolves to the AI's generated response.
 */
async function getAiResponse(userInput, persona) {
    const modelName = "deepseek/deepseek-chat";
    let currentBackoff = INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[AI Service] Attempt ${attempt} with model ${modelName} via OpenRouter...`);
            
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
                // NEW: Specific check for a bad API key. No point in retrying this.
                console.error("[AI Service] CRITICAL: API key is invalid or unauthorized (401). Please check your .env file.");
                return "یک مشکل فنی در بخش هوش مصنوعی بوجود آمده است."; // A more technical error for the admin
            }

            if (!response.ok) {
                // Throw a generic error for other bad responses to trigger the retry logic.
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const text = data.choices[0].message.content;

            return text; // Success!

        } catch (error) {
            // UPDATED: More detailed logging
            const logData = {
                service: "OpenRouter",
                model: modelName,
                attempt: attempt,
                maxRetries: MAX_RETRIES,
                errorMessage: error.message
            };
            console.error("[AI Service] Request failed.", logData);

            if (attempt < MAX_RETRIES) {
                await delay(currentBackoff);
                currentBackoff *= 2;
            }
        }
    }

    // If the loop finishes without a successful return, we've failed completely.
    console.error("[AI Service] All AI attempts failed after reaching max retries.");
    return "متاسفانه در حال حاضر نمیتونم به این سوال جواب بدم. شاید بعدا بتونم.";
}

module.exports = { getAiResponse };