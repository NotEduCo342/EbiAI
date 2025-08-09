// src/middleware/antiSpam.js

const config = require('../../config');
// NEW: Import config
const userHistory = new Map();

const antiSpamMiddleware = (ctx, next) => {
  if (ctx.state.handled) return next();

  const update = ctx.update.message || ctx.update.edited_message;
  if (!update || !update.text) return next();

  const { from } = ctx;
  const { chat } = ctx;
  const userName = from.username ? `@${from.username}` : from.first_name;
  const chatTitle = chat.title ? `'${chat.title}'` : 'a private chat';
  const messageTimestamp = update.date * 1000;
  const now = Date.now();

  // NEW: Using config value
  if (now - messageTimestamp > config.antiSpam.oldMessageThreshold) {
    console.log(`[Ignored] Old message from ${userName} in ${chatTitle}.`);
    return;
  }

  if (update.reply_to_message && update.reply_to_message.from.id !== ctx.botInfo.id) {
    console.log(`[Ignored] Reply from ${userName} in ${chatTitle} (was a reply to another user).`);
    return;
  }

  const userId = from.id;
  const messageText = update.text;
  const userData = userHistory.get(userId);

  if (userData) {
    const { lastTime, lastText } = userData;

    // NEW: Using config value
    if (now - lastTime < config.antiSpam.generalCooldown) {
      console.log(`[Spam] General cooldown triggered by ${userName} in ${chatTitle}.`);
      return;
    }
    // NEW: Using config value
    if (messageText === lastText && now - lastTime < config.antiSpam.duplicateCooldown) {
      console.log(`[Spam] Duplicate message cooldown triggered by ${userName} in ${chatTitle}.`);
      return;
    }
  }

  userHistory.set(userId, { lastTime: now, lastText: messageText });
  return next();
};

module.exports = { antiSpamMiddleware };
