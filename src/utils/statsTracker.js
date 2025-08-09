// src/utils/statsTracker.js

const stats = {
  // Existing live stats
  messagesProcessed: 0,
  aiResponses: 0,
  searchCalls: 0,

  // --- NEW: Cost and Error Tracking Stats ---
  tokensUsed: 0,
  estimatedCost: 0, // Stored in USD
  aiFailures: 0,
  searchFailures: 0,
};

// --- NEW: Cost calculation constant (DeepSeek model on OpenRouter) ---
// This is ~$0.20 per 1 million input tokens and ~$0.20 per 1 million output tokens.
// We'll use an average for simplicity.
const COST_PER_TOKEN = 0.0000002;

/**
 * Loads initial stats from a database record.
 * @param {object} initialStats - The stats object from the daily_stats table.
 */
const loadStats = (initialStats) => {
  if (initialStats) {
    console.log('[Stats Tracker] Loading stats from database:', initialStats);
    stats.messagesProcessed = initialStats.messagesProcessed || 0;
    stats.aiResponses = initialStats.aiResponses || 0;
    stats.searchCalls = initialStats.searchCalls || 0;
    // Note: We don't load cost/token/error data as it's not stored historically yet.
  }
};

const incrementMessagesProcessed = () => {
  stats.messagesProcessed += 1;
};

const incrementAiResponses = () => {
  stats.aiResponses += 1;
};

const incrementSearchCalls = () => {
  stats.searchCalls += 1;
};

// --- NEW: Functions to update our new counters ---

/**
 * Adds the token count from an API call to the total and calculates the cost.
 * @param {number} tokenCount - The number of total tokens used in a call.
 */
const addTokens = (tokenCount) => {
  if (typeof tokenCount === 'number') {
    stats.tokensUsed += tokenCount;
    stats.estimatedCost += tokenCount * COST_PER_TOKEN;
  }
};

const incrementAiFailures = () => {
  stats.aiFailures += 1;
};

const incrementSearchFailures = () => {
  stats.searchFailures += 1;
};

// Function to get the current stats
const getStats = () => stats;

// Resets all live counters to zero
const resetStats = () => {
  console.log('[Stats Tracker] Resetting live counters.');
  Object.keys(stats).forEach((key) => {
    stats[key] = 0;
  });
};

module.exports = {
  getStats,
  resetStats,
  loadStats,
  incrementMessagesProcessed,
  incrementAiResponses,
  incrementSearchCalls,
  addTokens, // Export the new functions
  incrementAiFailures,
  incrementSearchFailures,
};