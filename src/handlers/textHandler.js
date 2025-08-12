// src/handlers/textHandler.js

const logger = require('../utils/logger');
const db = require('../utils/database');
const config = require('../../config');
const { getAiResponse } = require('../services/aiService');
const { getSearchResults } = require('../services/searchService');
const { getBotResponses } = require('../utils/dataLoader');
const {
  logUnansweredQuestion,
  logPotentialFalsePositive,
  createLogEntry,
  normalizeText,
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
  // We multiply by 2 to ensure we always keep pairs of messages
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

async function getUserState(userId) {
  return db.get('SELECT * FROM conversation_state WHERE user_id = ?', [userId]);
}

async function clearUserState(userId) {
  return db.run('DELETE FROM conversation_state WHERE user_id = ?', [userId]);
}

// --- Main Handler Registration ---
function registerTextHandler(bot, eventLogger) {
  bot.on('text', async (ctx) => {
    if (ctx.state.handled) return;
    incrementMessagesProcessed();

    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    const normalizedMessage = normalizeText(messageText);

    try {
      // --- 1. STATE-BASED RESPONSE LOGIC ---
      const currentState = await getUserState(userId);
      if (currentState) {
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
          ctx.state.handled = true;
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
        return;
      }

      // --- 2. DATABASE RESPONSE LOGIC ---
      let matchedItem = null;
      let matchedTrigger = messageText;
      const currentBotResponses = getBotResponses(); // This only contains EXACT matches now

      if (currentBotResponses.exact.has(normalizedMessage)) {
        matchedItem = currentBotResponses.exact.get(normalizedMessage);
        matchedTrigger = matchedItem.trigger;
      } else {
        // If no exact match, query the DB for a smart match
        const smartResponses = await db.all("SELECT id, trigger, response, excludeWords, sets_state, type FROM responses WHERE matchType = 'smart' AND (context_required IS NULL OR context_required = '')");
        
        const messageWords = new Set(normalizedMessage.split(' '));
        let bestMatch = { score: 0, item: null, trigger: null };

        smartResponses.forEach((row) => {
          const item = {
              ...row,
              trigger: JSON.parse(row.trigger),
              response: JSON.parse(row.response),
              excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : [],
          };
          
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
            // False positive logging...
        }
      }

      if (matchedItem) {
        ctx.state.handled = true;
        if (matchedItem.sets_state) {
          await db.run('INSERT OR REPLACE INTO conversation_state (user_id, state) VALUES (?, ?)', [userId, matchedItem.sets_state]);
          logger.info(`[State] Set state for user ${userId} to: ${matchedItem.sets_state}`);
        }
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
        return;
      }

      // --- 3. AI FALLBACK LOGIC (WITH SEARCH) ---
      const isPrivateChat = ctx.chat.type === 'private';
      const isReplyToBot = !!ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;

      if (isPrivateChat || isReplyToBot) {
        let canTriggerAi = isPrivateChat || (config.ai.enabledInGroups || config.ai.groupWhitelist.includes(ctx.chat.id));
        
        if (canTriggerAi) {
          logUnansweredQuestion(ctx);
          const eventType = isPrivateChat ? 'Unanswered DM' : 'Unanswered Reply';
          eventLogger(createLogEntry(ctx, eventType, ctx.message.text));

          try {
            await ctx.replyWithChatAction('typing');

            if (needsWebSearch(messageText)) {
              incrementSearchCalls();
              logger.info(`[Search] Message "${messageText}" triggered a web search.`);
              const searchContext = await getSearchResults(messageText);

              if (searchContext) {
                logger.info(`[Search] Context found: "${searchContext.substring(0, 100)}..."`);
                const finalPersona = `You are playing the role of the singer Ebi. Your task is to answer the user's question. You have been given a piece of text with the exact information needed. You MUST use this text for your answer. **Source Text:** "${searchContext}" **User's Question:** "${messageText}" **Instructions:** 1. Read the Source Text to find the answer to the User's Question. 2. Formulate a response in Farsi, in the persona of Ebi. 3. Your response **MUST** contain the factual answer from the Source Text. 4. **DO NOT** use any of your own knowledge. Rely **ONLY** on the Source Text provided. 5. Do not apologize for your knowledge being limited. Answer the question directly. Begin your Farsi response now.`;
                const aiResponse = await getAiResponse(messageText, finalPersona, { history: [] });
                incrementAiResponses();
                await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
              } else {
                logger.info('[Search] No context found. Proceeding with standard AI call.');
                const history = await getHistory(userId);
                const aiResponse = await getAiResponse(messageText, config.ai.persona, { history });
                incrementAiResponses();
                history.push({ role: 'user', content: messageText }, { role: 'assistant', content: aiResponse });
                await saveHistory(userId, history);
                await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
              }
            } else {
              logger.info(`[AI] No DB match found for "${messageText}". Calling AI...`);
              const history = await getHistory(userId);
              const aiResponse = await getAiResponse(messageText, config.ai.persona, { history });
              incrementAiResponses();
              history.push({ role: 'user', content: messageText }, { role: 'assistant', content: aiResponse });
              await saveHistory(userId, history);

              await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
              const aiLogEntry = createLogEntry(ctx, 'AI Response', messageText);
              eventLogger({ ...aiLogEntry, eventType: `AI Response: "${aiResponse.substring(0, 50)}..."` });
            }
          } catch (e) {
            logger.error(`[AI Error] Failed to send AI response in chat ${ctx.chat.id}. Reason: ${e.message}`);
          }
          ctx.state.handled = true;
          return;
        }
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