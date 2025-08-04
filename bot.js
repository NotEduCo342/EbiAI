// bot.js

const { Telegraf } = require('telegraf');
const { antiSpamMiddleware } = require('./src/middleware/antiSpam');
const { loadData, registerHandlers } = require('./src/handlers/eventHandlers');
const { getKnownChats } = require('./src/utils/helpers');

// --- Bot Initialization ---
const bot = new Telegraf(process.env.BOT_TOKEN || '7966271636:AAFEoYXxtFk-IRfSl_wv48jMxaeAWZ8FmH4'); // Remember to replace your token
let eventLogger = () => {}; // This will be set by server.js

// --- Data Loading ---
loadData();

// --- Middleware Registration ---
bot.use(antiSpamMiddleware);

// --- Handler Registration ---
// We pass the bot instance and the eventLogger function to the handler registration module.
registerHandlers(bot, (logEntry) => {
    if (eventLogger) {
        eventLogger(logEntry);
    }
});

// --- Functions for server.js ---
function setEventLogger(loggerCallback) {
    eventLogger = loggerCallback;
}

// --- Exports for server.js ---
module.exports = { bot, setEventLogger, getKnownChats };