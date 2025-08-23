// src/handlers/textHandler.js
/**
 * @file Manages all incoming text messages, routing them through a multi-layered
 * response pipeline: state-based -> database -> AI.
 * @author Jules
 */

const logger = require('../utils/logger');
const db = require('../utils/database');
const config = require('../../config');
const { getAiResponse } = require('../services/aiService');
const { getSearchResults } = require('../services/searchService');
const { getBotResponses } = require('../utils/dataLoader');
const {
  createLogEntry,
  normalizeText,
  logUnansweredQuestion,
} = require('../utils/helpers');

const {
  incrementMessagesProcessed,
  incrementAiResponses,
  incrementSearchCalls,
} = require('../utils/statsTracker');

// This now represents the number of CONVERSATION TURNS (1 turn = 1 user message + 1 bot response)
const MAX_HISTORY_TURNS = 2;

// --- DB Functions for AI History ---
async function getHistory(userId) {
  const row = await db.get('SELECT history FROM ai_history WHERE user_id = ?', [userId]);
  return row ? JSON.parse(row.history) : [];
}

async function saveHistory(userId, history) {
  const maxMessages = MAX_HISTORY_TURNS * 2;
  while (history.length > maxMessages) {
    history.shift();
  }
  const historyJson = JSON.stringify(history);
  await db.run(
    'INSERT OR REPLACE INTO ai_history (user_id, history, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [userId, historyJson],
  );
}

// --- Helper Functions ---
function needsWebSearch(messageText) {
  const normalizedMessage = normalizeText(messageText);
  const searchTriggers = [
    'kiist', 'kieh', 'chist', 'chieh', 'kojast', 'koja bood',
    'che zamani', 'tarikh', 'cheghadr', 'gheymat', 'tedad',
    'akharin khabar', 'che khabar az',
  ];
  return searchTriggers.some((trigger) => normalizedMessage.includes(trigger));
}

function getSearchPersona(searchContext, messageText) {
  return `You are playing the role of the singer Ebi. Your task is to answer the user's question. You have been given a piece of text with the exact information needed. You MUST use this text for your answer. **Source Text:** "${searchContext}" **User's Question:** "${messageText}" **Instructions:** 1. Read the Source Text to find the answer to the User's Question. 2. Formulate a response in Farsi, in the persona of Ebi. 3. Your response **MUST** contain the factual answer from the Source Text. 4. **DO NOT** use any of your own knowledge. Rely **ONLY** on the Source Text provided. 5. Do not apologize for your knowledge being limited. Answer the question directly. Begin your Farsi response now.`;
}

async function getUserState(userId) {
  return db.get('SELECT * FROM conversation_state WHERE user_id = ?', [userId]);
}

async function clearUserState(userId) {
  return db.run('DELETE FROM conversation_state WHERE user_id = ?', [userId]);
}

// --- Response Pipeline: 1. State-based Logic ---
async function handleStatefulResponse(ctx, eventLogger) {
  const userId = ctx.from.id;
  const normalizedMessage = normalizeText(ctx.message.text);
  const currentState = await getUserState(userId);

  if (!currentState) return false;

  logger.info(`[State] User ${userId} is in state: ${currentState.state}. Processing answer.`);
  const sql = 'SELECT * FROM responses WHERE context_required = ?';
  const contextualResponses = (await db.all(sql, [currentState.state]))
    .map((r) => ({ ...r, trigger: JSON.parse(r.trigger), response: JSON.parse(r.response) }));

  let matchedItem = null;
  const wildcardFallback = contextualResponses.find((item) => item.trigger.includes('*'));

  contextualResponses.find((item) => {
    const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
    return triggers.find((trigger) => {
      if (trigger === '*') return false;
      const normalizedTrigger = normalizeText(trigger);
      if (normalizedMessage.includes(normalizedTrigger)) {
        matchedItem = item;
        return true;
      }
      return false;
    });
  });

  if (!matchedItem && wildcardFallback) {
    logger.info(`[State] No specific match found. Using wildcard fallback for state: ${currentState.state}`);
    matchedItem = wildcardFallback;
  }

  await clearUserState(userId);

  if (matchedItem) {
    // Enhanced logging
    logger.info(`[State] Matched contextual trigger: "${matchedItem.trigger.join(', ')}" for user ${userId}.`);
    const logEntry = createLogEntry(ctx, 'Contextual Response', matchedItem.trigger.join(', '));
    eventLogger(logEntry);
    const responseToSend = Array.isArray(matchedItem.response)
      ? matchedItem.response[Math.floor(Math.random() * matchedItem.response.length)]
      : matchedItem.response;
    try {
      await ctx.reply(responseToSend, { reply_to_message_id: ctx.message.message_id });
    } catch (e) {
      logger.warn(`[Warn] Failed to send contextual reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
    }
  } else {
    try {
      const replyText = 'بنظر میرسه که ممکنه پیامت رو نفهمیده باشم، بیا از اول شروع کنیم'
        + ' ( پیامت برای قرارگیری در آپدیت بعدی برای سازنده ارسال شد ).';
      await ctx.reply(replyText, { reply_to_message_id: ctx.message.message_id });
    } catch (e) {
      logger.warn(`[Warn] Failed to send contextual fallback reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
    }
  }
  return true;
}

// --- Response Pipeline: 2. Database Logic ---
async function handleDatabaseResponse(ctx, eventLogger) {
  const userId = ctx.from.id;
  const { text: messageText } = ctx.message;
  const normalizedMessage = normalizeText(messageText);

  let matchedItem = null;
  let matchedTrigger = messageText;
  let matchType = ''; // To improve logging
  const currentBotResponses = getBotResponses();

  if (currentBotResponses.exact.has(normalizedMessage)) {
    matchedItem = currentBotResponses.exact.get(normalizedMessage);
    matchedTrigger = matchedItem.trigger;
    matchType = 'Exact';
  } else {
    const smartResponses = await db.all("SELECT id, trigger, response, excludeWords, sets_state, type FROM responses WHERE matchType = 'smart' AND (context_required IS NULL OR context_required = '')");
    const messageWords = new Set(normalizedMessage.split(' '));
    let bestMatch = { score: 0, item: null, trigger: null };

    smartResponses.forEach((row) => {
      const item = { ...row, trigger: JSON.parse(row.trigger), response: JSON.parse(row.response), excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : [] };
      const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
      triggers.forEach((trigger) => {
        const normalizedTrigger = normalizeText(trigger);
        const triggerWords = normalizedTrigger.split(' ');
        if (triggerWords.length > 0 && triggerWords[0] !== '') {
          const matches = triggerWords.reduce((count, word) => (word && messageWords.has(word) ? count + 1 : count), 0);
          const score = matches / triggerWords.length;
          const priorityScore = item.sets_state ? score + config.smartMatch.statePriorityBoost : score;
          if (priorityScore > bestMatch.score) {
            bestMatch = { score: priorityScore, item, trigger };
          }
        }
      });
    });

    if (bestMatch.item && bestMatch.score >= config.smartMatch.scoreThreshold) {
      matchedItem = bestMatch.item;
      matchedTrigger = bestMatch.trigger;
      matchType = `Smart (${(bestMatch.score).toFixed(2)})`;
    }
  }

  if (!matchedItem) return false;

  if (matchedItem.sets_state) {
    await db.run('INSERT OR REPLACE INTO conversation_state (user_id, state) VALUES (?, ?)', [userId, matchedItem.sets_state]);
    logger.info(`[State] Set state for user ${userId} to: ${matchedItem.sets_state}`);
  }

  // Enhanced logging for terminal
  logger.info(`[DB] Matched: "${matchedTrigger}" | Type: ${matchType} | User: ${userId}`);

  const logEntry = createLogEntry(ctx, 'Triggered Response', Array.isArray(matchedTrigger) ? matchedTrigger.join(', ') : matchedTrigger);
  eventLogger(logEntry);

  const responseToSend = Array.isArray(matchedItem.response)
    ? matchedItem.response[Math.floor(Math.random() * matchedItem.response.length)]
    : matchedItem.response;

  try {
    await ctx.reply(responseToSend, { reply_to_message_id: ctx.message.message_id });
  } catch (e) {
    logger.warn(`[Warn] Failed to send DB response in chat ${ctx.chat.id}. Reason: ${e.message}`);
  }

  return true;
}

// --- Response Pipeline: 3. AI Fallback Logic ---
async function handleAiResponse(ctx, eventLogger) {
  const userId = ctx.from.id;
  const { text: messageText } = ctx.message;
  const isPrivateChat = ctx.chat.type === 'private';
  const isReplyToBot = !!ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;

  const canTriggerAi = isPrivateChat
    || (config.ai.enabledInGroups && (isReplyToBot || config.ai.groupWhitelist.includes(ctx.chat.id)));

  if (!canTriggerAi) return false;

  logUnansweredQuestion(ctx);
  const eventType = isPrivateChat ? 'Unanswered DM' : 'Unanswered Reply';
  eventLogger(createLogEntry(ctx, eventType, messageText));

  try {
    await ctx.replyWithChatAction('typing');
    let aiResponse;

    // Conditionally enable history only for private chats.
    const useHistory = isPrivateChat;
    let history = [];
    if (useHistory) {
      logger.info(`[AI] Private chat with ${userId}. Loading conversation history.`);
      history = await getHistory(userId);
    } else {
      logger.info(`[AI] Group chat with ${userId}. History is disabled.`);
    }

    if (needsWebSearch(messageText)) {
      incrementSearchCalls();
      logger.info(`[AI] Message from ${userId} triggered a web search.`);
      const searchContext = await getSearchResults(messageText);

      if (searchContext) {
        logger.info(`[AI] Web search found context for user ${userId}. Length: ${searchContext.length}`);
        const finalPersona = getSearchPersona(searchContext, messageText);
        // History is intentionally disabled here to focus on the search context.
        aiResponse = await getAiResponse(messageText, finalPersona, { history: [] });
      } else {
        logger.info(`[AI] Web search found no context. Falling back to standard AI for user ${userId}.`);
        // Pass the conditional history (will be empty for groups).
        aiResponse = await getAiResponse(messageText, config.ai.persona, { history });
        // Only save history if it's a private chat.
        if (useHistory) {
          history.push({ role: 'user', content: messageText }, { role: 'assistant', content: aiResponse });
          await saveHistory(userId, history);
        }
      }
    } else {
      logger.info(`[AI] No DB match. Calling standard AI for user ${userId}.`);
      // Pass the conditional history (will be empty for groups).
      aiResponse = await getAiResponse(messageText, config.ai.persona, { history });
      // Only save history if it's a private chat.
      if (useHistory) {
        history.push({ role: 'user', content: messageText }, { role: 'assistant', content: aiResponse });
        await saveHistory(userId, history);
      }
    }

    incrementAiResponses();
    logger.info(`[AI] Replying to ${userId} with AI response. Length: ${aiResponse.length}`);
    await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });

    // This log goes to the dashboard feed
    const aiLogEntry = createLogEntry(ctx, 'AI Response', messageText);
    eventLogger({ ...aiLogEntry, eventType: `AI Response: "${aiResponse.substring(0, 50)}..."` });
  } catch (e) {
    logger.error(`[AI Error] Failed to send AI response in chat ${ctx.chat.id}. Reason: ${e.message}`);
  }

  return true;
}

// --- Main Handler Registration ---
function registerTextHandler(bot, eventLogger) {
  bot.on('text', async (ctx) => {
    if (ctx.state.handled) return;
    incrementMessagesProcessed();

    try {
      if (await handleStatefulResponse(ctx, eventLogger)) {
        ctx.state.handled = true;
        return;
      }
      if (await handleDatabaseResponse(ctx, eventLogger)) {
        ctx.state.handled = true;
        return;
      }
      if (await handleAiResponse(ctx, eventLogger)) {
        ctx.state.handled = true;
      }
    } catch (error) {
      logger.error('[Handler Error] An unexpected error occurred in the text handler:', error);
      try {
        await ctx.reply('متاسفانه مشکلی پیش آمده، لطفا دوباره تلاش کنید.');
      } catch (e) {
        logger.warn(`[Warn] Failed to send final error message to chat ${ctx.chat.id}. Reason: ${e.message}`);
      }
    }
  });
}

module.exports = { registerTextHandler };