// src/handlers/textHandler.js

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

const conversationHistories = new Map();
const MAX_HISTORY_LENGTH = 2;

/**
 * A simple helper function to decide if a message needs a web search.
 * @param {string} messageText The user's message.
 * @returns {boolean} True if a search is likely needed.
 */
function needsWebSearch(messageText) {
  const normalizedMessage = normalizeText(messageText);
  const searchTriggers = [
    'کیست', 'کیه',
    'چیست', 'چیه',
    'کجاست', 'کجا بود',
    'چه زمانی', 'تاریخ',
    'چقدر', 'قیمت', 'تعداد',
    'آخرین خبر', 'چه خبر از',
  ];
  return searchTriggers.some((trigger) => normalizedMessage.includes(trigger));
}

async function getUserState(userId) {
  return db.get('SELECT * FROM conversation_state WHERE user_id = ?', [userId]);
}

async function clearUserState(userId) {
  return db.run('DELETE FROM conversation_state WHERE user_id = ?', [userId]);
}

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
        console.log(`[State] User ${userId} is in state: ${currentState.state}. Processing answer.`);
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
          console.log(`[State] No specific match found. Using wildcard fallback for state: ${currentState.state}`);
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
            console.warn(`[Warn] Failed to send contextual reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
          }
        } else {
          try {
            const replyText = 'بنظر میرسه که ممکنه پیامت رو نفهمیده باشم، بیا از اول شروع کنیم'
              + ' ( پیامت برای قرارگیری در آپدیت بعدی برای سازنده ارسال شد ).';
            await ctx.reply(replyText, { reply_to_message_id: ctx.message.message_id });
          } catch (e) {
            console.warn(`[Warn] Failed to send contextual fallback reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
          }
        }
        return;
      }

      // --- 2. DATABASE RESPONSE LOGIC ---
      let matchedItem = null;
      let matchedTrigger = messageText;
      const currentBotResponses = getBotResponses();

      if (currentBotResponses.exact.has(normalizedMessage)) {
        matchedItem = currentBotResponses.exact.get(normalizedMessage);
        matchedTrigger = matchedItem.trigger;
      }
      if (!matchedItem) {
        const messageWords = new Set(normalizedMessage.split(' '));
        let bestMatch = { score: 0, item: null, trigger: null };

        currentBotResponses.smart.forEach((item) => {
          const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
          triggers.forEach((trigger) => {
            const normalizedTrigger = normalizeText(trigger);
            const triggerWords = normalizedTrigger.split(' ');
            if (triggerWords.length > 0 && triggerWords[0] !== '') {
              const matches = triggerWords.reduce((count, word) => {
                if (word && messageWords.has(word)) {
                  return count + 1;
                }
                return count;
              }, 0);

              const score = matches / triggerWords.length;
              const priorityScore = item.sets_state
                ? score + config.smartMatch.statePriorityBoost
                : score;

              if (priorityScore > bestMatch.score) {
                bestMatch = { score: priorityScore, item, trigger };
              }
            }
          });
        });

        if (bestMatch.item && bestMatch.score >= config.smartMatch.scoreThreshold) {
          matchedItem = bestMatch.item;
          matchedTrigger = bestMatch.trigger;
          const triggerWords = new Set(normalizeText(bestMatch.trigger).split(' '));
          const extraWords = [...messageWords].filter((word) => !triggerWords.has(word));
          const user = ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
          logPotentialFalsePositive({
            userInput: messageText,
            matchedTrigger,
            score: bestMatch.score,
            extraWords,
            user,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (matchedItem) {
        ctx.state.handled = true;
        if (matchedItem.sets_state) {
          await db.run('INSERT OR REPLACE INTO conversation_state (user_id, state) VALUES (?, ?)', [userId, matchedItem.sets_state]);
          console.log(`[State] Set state for user ${userId} to: ${matchedItem.sets_state}`);
        }
        const logEntry = createLogEntry(ctx, 'Triggered Response', Array.isArray(matchedTrigger) ? matchedTrigger.join(', ') : matchedTrigger);
        eventLogger(logEntry);
        const responseToSend = Array.isArray(matchedItem.response)
          ? matchedItem.response[Math.floor(Math.random() * matchedItem.response.length)]
          : matchedItem.response;
        try {
          await ctx.reply(responseToSend, { reply_to_message_id: ctx.message.message_id });
        } catch (e) {
          console.warn(`[Warn] Failed to send DB response in chat ${ctx.chat.id}. Reason: ${e.message}`);
        }
        return;
      }

      // --- 3. AI FALLBACK LOGIC (WITH SEARCH) ---
      const isPrivateChat = ctx.chat.type === 'private';
      const isReplyToBot = !!ctx.message.reply_to_message
        && ctx.message.reply_to_message.from.id === ctx.botInfo.id;

      if (isPrivateChat || isReplyToBot) {
        let canTriggerAi = false;
        if (isPrivateChat) {
          canTriggerAi = true;
        } else {
          const isAllowedInThisGroup = config.ai.enabledInGroups
            || config.ai.groupWhitelist.includes(ctx.chat.id);
          if (isAllowedInThisGroup) {
            canTriggerAi = true;
          } else {
            console.log(
              `[Guardrail] AI response blocked in group ${ctx.chat.id} because it's not whitelisted.`,
            );
          }
        }
        if (canTriggerAi) {
          logUnansweredQuestion(ctx);
          const eventType = isPrivateChat ? 'Unanswered DM' : 'Unanswered Reply';
          const logEntry = createLogEntry(ctx, eventType, ctx.message.text);
          eventLogger(logEntry);

          try {
            await ctx.replyWithChatAction('typing');

            // This is the new, complete logic block for handling search vs. normal conversation
            if (needsWebSearch(messageText)) {
              incrementSearchCalls();
              console.log(`[Search] Message "${messageText}" triggered a web search.`);
              const searchContext = await getSearchResults(messageText);

              if (searchContext) {
                console.log(`[Search] Context found: "${searchContext.substring(0, 100)}..."`);
                const finalPersona = `You are playing the role of the singer Ebi. Your task is to answer the user's question.
You have been given a piece of text with the exact information needed. You MUST use this text for your answer.

**Source Text:** "${searchContext}"
**User's Question:** "${messageText}"

**Instructions:**
1. Read the Source Text to find the answer to the User's Question.
2. Formulate a response in Farsi, in the persona of Ebi.
3. Your response **MUST** contain the factual answer from the Source Text.
4. **DO NOT** use any of your own knowledge. Rely **ONLY** on the Source Text provided.
5. Do not apologize for your knowledge being limited. Answer the question directly.

Begin your Farsi response now.`;
                const options = { history: [] }; // Isolate the search call
                const aiResponse = await getAiResponse(messageText, finalPersona, options);
                incrementAiResponses();

                await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
                const aiLogEntry = createLogEntry(ctx, 'AI Search Response', messageText);
                eventLogger({ ...aiLogEntry, eventType: `AI Search Response: "${aiResponse.substring(0, 50)}..."` });
              } else {
                // If search fails, fall back to a normal AI response
                console.log('[Search] No context found or search failed. Proceeding with standard AI call.');
                const history = conversationHistories.get(userId) || [];
                const options = { history };
                const aiResponse = await getAiResponse(messageText, config.ai.persona, options);
                incrementAiResponses();
                history.push({ role: 'user', content: messageText });
                history.push({ role: 'assistant', content: aiResponse });
                while (history.length > MAX_HISTORY_LENGTH) { history.shift(); }
                conversationHistories.set(userId, history);
                await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
              }
            } else {
              // This is the normal path for a conversational AI call
              console.log(`[AI] No DB match found for "${messageText}". Calling AI...`);
              const history = conversationHistories.get(userId) || [];
              const options = { history };
              const aiResponse = await getAiResponse(messageText, config.ai.persona, options);
              incrementAiResponses();

              history.push({ role: 'user', content: messageText });
              history.push({ role: 'assistant', content: aiResponse });
              while (history.length > MAX_HISTORY_LENGTH) {
                history.shift();
              }
              conversationHistories.set(userId, history);

              await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });

              const aiLogEntry = createLogEntry(ctx, 'AI Response', messageText);
              const eventMessage = `AI Response: "${aiResponse.substring(0, 50)}..."`;
              eventLogger({ ...aiLogEntry, eventType: eventMessage });
            }
          } catch (e) {
            const warnMessage = `[Warn] Failed to send AI response or typing action in chat ${ctx.chat.id}.`
              + ` Reason: ${e.message}`;
            console.warn(warnMessage);
            try {
              await ctx.sendMessage('متاسفانه مشکلی در ارسال پاسخ پیش آمد.');
            } catch (finalError) {
              console.error(`[Critical] Failed even to send a simple message to chat ${ctx.chat.id}.`);
            }
          }

          ctx.state.handled = true;
          return;
        }
      }
    } catch (error) {
      console.error('[Handler Error] An unexpected error occurred in the text handler:', error);
      try {
        await ctx.reply('متاسفانه مشکلی پیش آمده، لطفا دوباره تلاش کنید.');
      } catch (e) {
        console.warn(`[Warn] Failed to send final error message to chat ${ctx.chat.id}. Reason: ${e.message}`);
      }
    }
  });
}

module.exports = { registerTextHandler };