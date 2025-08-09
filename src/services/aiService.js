// src/services/aiService.js

const config = require('../../config');
// 1. IMPORT our new stats tracking functions
const { addTokens, incrementAiFailures } = require('../utils/statsTracker');

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetries(providerName, apiUrl, headers, body) {
  let currentBackoff = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        const errorMessage = `[AI Service] CRITICAL: API key for ${providerName}`
          + ' is invalid (401). Please check your .env file.';
        console.error(errorMessage);
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // 2. RETURN an object with both the text and the token usage
      return {
        text: data.choices[0].message.content,
        tokensUsed: data.usage.total_tokens,
      };
    } catch (error) {
      const logData = {
        service: providerName,
        model: body.model,
        attempt,
        maxRetries: MAX_RETRIES,
        errorMessage: error.message,
      };
      console.error('[AI Service] Request failed.', logData);

      if (attempt < MAX_RETRIES) {
        // eslint-disable-next-line no-await-in-loop
        await delay(currentBackoff);
        currentBackoff *= 2;
      }
    }
  }

  // 3. IF all retries fail, increment the failure counter
  incrementAiFailures();
  return null;
}

/**
 * Gets a response from a configured AI provider, now with history support.
 * @param {string} userInput - The user's message to the bot.
 * @param {string} persona - The full persona prompt for the AI.
 * @param {object} [options={}] - Optional parameters.
 * @param {string} [options.provider] - The specific provider to use.
 * @param {string} [options.model] - The specific model to use.
 * @param {Array} [options.history] - The recent conversation history array.
 * @returns {Promise<string>} A promise that resolves to the AI's generated response.
 */
async function getAiResponse(userInput, persona, options = {}) {
  const providerName = options.provider || config.ai.defaultProvider;
  const providerConfig = config.aiProviders[providerName];

  if (!providerConfig) {
    console.error(`[AI Service] Error: Provider "${providerName}" is not defined in config.js.`);
    return 'یک مشکل فنی در بخش هوش مصنوعی بوجود آمده است.';
  }

  const modelName = options.model || providerConfig.model;

  console.log(`[AI Service] Using provider: ${providerName}, model: ${modelName}`);

  const headers = {
    Authorization: `Bearer ${providerConfig.apiKey}`,
    'Content-Type': 'application/json',
  };

  let messages;
  if (options.history && options.history.length > 0) {
    console.log('[AI Service] Continuing conversation with history.');
    messages = [
      { role: 'system', content: config.ai.personaLite },
      ...options.history,
      { role: 'user', content: userInput },
    ];
  } else {
    console.log('[AI Service] Starting new conversation with full persona.');
    messages = [
      { role: 'system', content: persona },
      { role: 'user', content: userInput },
    ];
  }

  const body = {
    model: modelName,
    messages,
  };

  // 4. RECEIVE the result object instead of just text
  const result = await fetchWithRetries(providerName, providerConfig.apiUrl, headers, body);

  if (result === null) {
    console.error(`[AI Service] All attempts for provider ${providerName} failed.`);
    return 'متاسفانه در حال حاضر نمیتونم به این سوال جواب بدم. شاید بعدا بتونم.';
  }

  // 5. REPORT the token usage to our tracker
  addTokens(result.tokensUsed);

  // 6. RETURN only the text to the handler
  return result.text;
}

module.exports = { getAiResponse };