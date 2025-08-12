// bot.js
const logger = require('./src/utils/logger');
const { Telegraf } = require('telegraf');
const { antiSpamMiddleware } = require('./src/middleware/antiSpam');
const { registerHandlers } = require('./src/handlers/eventHandlers');
const { getKnownChats } = require('./src/utils/helpers');

// --- Bot Initialization ---
const bot = new Telegraf(process.env.BOT_TOKEN);
let eventLogger = () => {};

// --- Middleware Registration ---
bot.use(antiSpamMiddleware);

// --- Handler Registration ---
// We now wrap this in an async function to await the handler registration.
async function initializeBot() {
  await registerHandlers(bot, (logEntry) => {
    if (eventLogger) {
      eventLogger(logEntry);
    }
  });
}

// Call the async initialization function.
initializeBot();

// --- Functions for server.js ---
function setEventLogger(loggerCallback) {
  eventLogger = loggerCallback;
}

// --- Exports for server.js ---
module.exports = { bot, setEventLogger, getKnownChats };