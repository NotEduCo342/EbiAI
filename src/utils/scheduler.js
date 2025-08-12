// src/utils/scheduler.js

const logger = require('./logger');
const db = require('./database');
const statsTracker = require('./statsTracker');

/**
 * Saves the current live stats to the database.
 * This function now only saves the latest counts without resetting them.
 */
async function saveDailyStats() {
  const liveStats = statsTracker.getStats();
  const today = new Date().toISOString().split('T')[0];

  logger.info(`[Scheduler] Saving stats for date: ${today}`);
  try {
    const sql = `
      INSERT INTO daily_stats (date, messagesProcessed, aiResponses, searchCalls)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        messagesProcessed = ?,
        aiResponses = ?,
        searchCalls = ?;
    `;
    // We now use the stats values for both INSERT and UPDATE
    await db.run(sql, [
      today,
      liveStats.messagesProcessed,
      liveStats.aiResponses,
      liveStats.searchCalls,
      liveStats.messagesProcessed,
      liveStats.aiResponses,
      liveStats.searchCalls,
    ]);
    logger.info('[Scheduler] Daily stats saved successfully.');
  } catch (error) {
    logger.error('[Scheduler] Failed to save daily stats:', error.message);
  }
}

/**
 * Loads today's stats from the DB on startup.
 */
async function initializeAndLoadStats() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const todaysStats = await db.get('SELECT * FROM daily_stats WHERE date = ?', [today]);
    if (todaysStats) {
      statsTracker.loadStats(todaysStats);
    } else {
      logger.info('[Scheduler] No stats found for today. Starting fresh.');
    }
  } catch (error) {
    logger.error('[Scheduler] Failed to load initial stats:', error.message);
  }
}

/**
 * Starts the smart scheduler to save stats at midnight.
 */
function startScheduler() {
  const runAtMidnight = () => {
    // 1. Calculate time until next midnight
    const now = new Date();
    const night = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // The next day
      0, 0, 0, // at 00:00:00
    );
    const msUntilMidnight = night.getTime() - now.getTime();

    logger.info(`[Scheduler] Next save scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes.`);

    // 2. Set a timeout for the next midnight
    setTimeout(() => {
      logger.info('[Scheduler] Midnight reached. Saving final stats for the day.');
      saveDailyStats(); // Save the final stats for the day that just ended
      statsTracker.resetStats(); // Reset for the new day
      // 3. Set a 24-hour interval for all subsequent midnights
      setInterval(() => {
        saveDailyStats();
        statsTracker.resetStats();
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  };

  runAtMidnight();
}

module.exports = { startScheduler, saveDailyStats, initializeAndLoadStats };