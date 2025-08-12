// src/services/searchService.js

const logger = require('../utils/logger');
const config = require('../../config');
// 1. IMPORT our new stats tracking function
const { incrementSearchFailures } = require('../utils/statsTracker');

// This variable will keep track of which API key we are currently using.
let currentKeyIndex = 0;

/**
 * Performs a web search using the Tavily API and handles API key rotation.
 * @param {string} query The search query from the user's message.
 * @returns {Promise<string|null>} A promise that resolves to a concise answer, or null if the search fails.
 */
async function getSearchResults(query) {
  const { apiKeys, apiUrl } = config.search;

  if (!apiKeys || apiKeys.length === 0) {
    logger.error('[Search Service] No Tavily API keys found in config.js. Please check your .env file.');
    return null;
  }

  if (currentKeyIndex >= apiKeys.length) {
    logger.error('[Search Service] All Tavily API keys have been tried and failed. Please check your key limits.');
    // 2. INCREMENT failure counter when all keys are exhausted
    incrementSearchFailures();
    currentKeyIndex = 0;
    return null;
  }

  const currentApiKey = apiKeys[currentKeyIndex];

  try {
    logger.info(`[Search Service] Performing search for: "${query}" using key index ${currentKeyIndex}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: currentApiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 3,
      }),
    });

    if (response.status === 429 || response.status === 402) {
      logger.warn(`[Search Service] API key at index ${currentKeyIndex} is exhausted or invalid. Rotating to the next key.`);
      currentKeyIndex += 1;
      return getSearchResults(query);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.answer || null;
  } catch (error) {
    logger.error(`[Search Service] An error occurred while searching: ${error.message}`);
    // 3. INCREMENT failure counter on any other fetch error
    incrementSearchFailures();
    return null;
  }
}

module.exports = { getSearchResults };