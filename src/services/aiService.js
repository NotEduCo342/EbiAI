// src/services/aiService.js

const logger = require('../utils/logger');
const config = require('../../config');
const { addTokens, incrementAiFailures } = require('../utils/statsTracker');

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetries(providerName, apiUrl, headers, body) {
  let currentBackoff = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      // --- DEBUG: Log the request details ---
      logger.api(`[AI Service] Attempt ${attempt}: Sending request to ${providerName} at ${apiUrl}`);
      logger.api(`[AI Service] Request Body: ${JSON.stringify(body, null, 2)}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        const errorMessage = `[AI Service] CRITICAL: API key for ${providerName} is invalid (401 Unauthorized). Please check your .env file.`;
        logger.error(errorMessage);
        return null;
      }

      // --- ENHANCED ERROR HANDLING ---
      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.response = response; // Attach the full response to the error object
        throw error;
      }

      const data = await response.json();
      
      // Ensure the response structure is what we expect
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
          throw new Error("Received an unexpected response structure from the AI provider.");
      }

      return {
        text: data.choices[0].message.content,
        tokensUsed: data.usage ? data.usage.total_tokens : 0, // Handle cases where usage might not be returned
      };

    } catch (error) {
      // --- DETAILED ERROR LOGGING ---
      const logData = {
        service: providerName,
        model: body.model,
        attempt,
        maxRetries: MAX_RETRIES,
        errorMessage: error.message,
      };

      // If the error includes a response object, extract more details
      if (error.response) {
        logData.statusCode = error.response.status;
        logData.statusText = error.response.statusText;
        // Use a .then() block because .text() is async
        await error.response.text().then(text => {
            logData.responseText = text;
        });
      }
      
      logger.error('[AI Service] Request failed.', logData);

      if (attempt < MAX_RETRIES) {
        await delay(currentBackoff);
        currentBackoff *= 2;
      }
    }
  }

  incrementAiFailures();
  return null;
}

/**
 * Gets a response from a configured AI provider.
 */
async function getAiResponse(userInput, persona, options = {}) {
  const providerName = options.provider || config.ai.defaultProvider;
  const providerConfig = config.aiProviders[providerName];

  if (!providerConfig) {
    logger.error(`[AI Service] Error: Provider "${providerName}" is not defined in config.js.`);
    return 'یک مشکل فنی در بخش هوش مصنوعی بوجود آمده است.';
  }

  const modelName = options.model || providerConfig.model;

  logger.info(`[AI Service] Using provider: ${providerName}, model: ${modelName}`);

  const headers = {
    Authorization: `Bearer ${providerConfig.apiKey}`,
    'Content-Type': 'application/json',
  };

  let messages;
  if (options.history && options.history.length > 0) {
    logger.info('[AI Service] Continuing conversation with history.');
    messages = [
      { role: 'system', content: config.ai.personaLite },
      ...options.history,
      { role: 'user', content: userInput },
    ];
  } else {
    logger.info('[AI Service] Starting new conversation with full persona.');
    messages = [
      { role: 'system', content: persona },
      { role: 'user', content: userInput },
    ];
  }

  const body = {
    model: modelName,
    messages,
  };

  const result = await fetchWithRetries(providerName, providerConfig.apiUrl, headers, body);

  if (result === null) {
    logger.error(`[AI Service] All attempts for provider ${providerName} failed.`);
    return 'متاسفانه در حال حاضر نمیتونم به این سوال جواب بدم. شاید بعدا بتونم.';
  }

  addTokens(result.tokensUsed);
  return result.text;
}

module.exports = { getAiResponse };