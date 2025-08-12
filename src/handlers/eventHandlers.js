// src/handlers/eventHandlers.js

const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');
const { loadData } = require('../utils/dataLoader');
const { registerCommandHandlers } = require('./commandHandler');
const { registerTextHandler } = require('./textHandler');

/**
 * Loads all necessary data and registers all bot event handlers.
 * This function is now ASYNC to ensure data is loaded before handlers are active.
 * @param {object} bot The Telegraf bot instance.
 * @param {function} eventLogger The function to log events to the dashboard.
 */
async function registerHandlers(bot, eventLogger) {
  // First, AWAIT the data load to ensure it completes.
  await loadData();

  // Next, register the specialized handlers.
  registerCommandHandlers(bot, eventLogger);
  registerTextHandler(bot, eventLogger);

  logger.info('[Handlers] All event handlers have been registered.');
}

// Set up the listener to AWAIT the data reload.
eventBus.on('reload_data', async () => {
  logger.info('[EventBus] Received reload_data signal. Reloading data...');
  await loadData();
  logger.info('[EventBus] Data reload complete.');
});

module.exports = { registerHandlers };