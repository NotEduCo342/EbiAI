// src/handlers/commandHandler.js

const logger = require('../utils/logger');
const { getMemories } = require('../utils/dataLoader'); // Import the getter function
const { createLogEntry } = require('../utils/helpers');
const { incrementMessagesProcessed } = require('../utils/statsTracker');

function registerCommandHandlers(bot, eventLogger) {
  bot.start(async (ctx) => {
    incrementMessagesProcessed();
    ctx.state.handled = true;
    const logEntry = createLogEntry(ctx, 'New User', '/start');
    eventLogger(logEntry);
    try {
      await ctx.reply('Hello! I am your friendly bot. I am ready to go!');
    } catch (e) {
      logger.warn(`[Warn] Failed to send /start reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
    }
  });

  bot.command('memory', async (ctx) => {
    incrementMessagesProcessed();
    ctx.state.handled = true;
    const currentMemories = getMemories(); // Call the function to get fresh data
    let memoryMessage = 'ذهنم در حال حاضر خالیه، چیزی برای به یاد آوردن ندارم.';
    if (currentMemories && currentMemories.length > 0) {
      const randomIndex = Math.floor(Math.random() * currentMemories.length);
      memoryMessage = currentMemories[randomIndex];
    }
    try {
      await ctx.reply(memoryMessage, { reply_to_message_id: ctx.message.message_id });
    } catch (e) {
      logger.warn(`[Warn] Failed to send /memory reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
    }
    const logEntry = createLogEntry(ctx, 'Triggered Response', '/memory');
    eventLogger(logEntry);
  });
}

module.exports = { registerCommandHandlers };