// src/services/aiService.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini client with the API key from our .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A robust function to generate content from a specified model, with retries.
 * @param {string} modelName The name of the model to use (e.g., "gemini-1.5-pro-latest").
 * @param {string} prompt The full prompt to send to the model.
 * @returns {Promise<string|null>} The AI's response text, or null if it fails after all retries.
 */
async function generateWithRetries(modelName, prompt) {
    let currentBackoff = INITIAL_BACKOFF_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text(); // Success, return the text
        } catch (error) {
            const isOverloadedError = error.message.includes('503');
            if (isOverloadedError && attempt < MAX_RETRIES) {
                console.warn(`[AI Service] Model ${modelName}, Attempt ${attempt} failed with 503. Retrying in ${currentBackoff}ms...`);
                await delay(currentBackoff);
                currentBackoff *= 2;
            } else {
                console.error(`[AI Service] Model ${modelName}, Final Attempt ${attempt} failed.`, error);
                return null; // Return null to indicate failure
            }
        }
    }
}

/**
 * Gets a response from the Gemini API using a tiered model approach.
 * @param {string} userInput The user's message to the bot.
 * @param {string} persona A string describing the persona the AI should adopt.
 * @returns {Promise<string>} A promise that resolves to the AI's generated response.
 */
async function getAiResponse(userInput, persona) {
    const prompt = `${persona}\n\nHere is the user's message: "${userInput}"\n\nYour response should be in Farsi.`;

    // --- TIER 1: Try the PRO model first ---
    console.log('[AI Service] Attempting to use Gemini 1.5 Pro...');
    let text = await generateWithRetries("gemini-1.5-pro-latest", prompt);

    if (text !== null) {
        return text; // Success with Pro model
    }

    // --- TIER 2: If Pro failed, fall back to the FLASH model ---
    console.warn('[AI Service] Pro model failed after all retries. Falling back to Gemini 1.5 Flash...');
    text = await generateWithRetries("gemini-1.5-flash-latest", prompt);

    if (text !== null) {
        return text; // Success with Flash model
    }

    // --- FINAL FALLBACK ---
    console.error("[AI Service] All AI models failed.");
    return "متاسفانه در حال حاضر نمیتونم به این سوال جواب بدم. شاید بعدا بتونم.";
}

module.exports = { getAiResponse };