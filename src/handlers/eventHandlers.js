// src/handlers/eventHandlers.js

const fs = require('fs');
const path = require('path');
const db = require('../utils/database');
const eventBus = require('../utils/eventBus');
const config = require('../../config');
const { getAiResponse } = require('../services/aiService');
const {
    logUnansweredQuestion,
    logPotentialFalsePositive,
    createLogEntry,
    normalizeText
} = require('../utils/helpers');

const botResponses = {
    smart: [],
    exact: new Map()
};
let memories = [];

async function loadData() {
    botResponses.smart = [];
    botResponses.exact.clear();
    try {
        const memoriesFilePath = path.join(__dirname, '..', '..', 'memories.json');
        memories = JSON.parse(fs.readFileSync(memoriesFilePath, 'utf8')).memories;
        console.log(`[Data] Loaded ${memories.length} memories.`);
    } catch (err) {
        console.error("[Data] Could not read or parse memories.json!", err);
    }
    try {
        const sql = "SELECT * FROM responses WHERE context_required IS NULL OR context_required = ''";
        const rows = await db.all(sql);
        rows.forEach(row => {
            const item = { ...row, trigger: JSON.parse(row.trigger), response: JSON.parse(row.response), excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : [] };
            if (item.matchType === 'exact') {
                const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
                for (const trigger of triggers) {
                    botResponses.exact.set(normalizeText(trigger), item);
                }
            } else {
                botResponses.smart.push(item);
            }
        });
        console.log(`[Data] Initialized with ${botResponses.smart.length} 'Smart' and ${botResponses.exact.size} 'Exact' non-contextual responses.`);
    } catch (err) {
        console.error("[Data] Error loading responses from database:", err.message);
    }
}

async function getUserState(userId) {
    return db.get("SELECT * FROM conversation_state WHERE user_id = ?", [userId]);
}

async function clearUserState(userId) {
    return db.run("DELETE FROM conversation_state WHERE user_id = ?", [userId]);
}

function registerHandlers(bot, eventLogger) {

    bot.start(async (ctx) => {
        ctx.state.handled = true;
        const logEntry = createLogEntry(ctx, 'New User', '/start');
        eventLogger(logEntry);
        try {
            await ctx.reply('Hello! I am your friendly bot. I am ready to go!');
        } catch (e) {
            console.warn(`[Warn] Failed to send /start reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
        }
    });

    bot.command('memory', async (ctx) => {
        ctx.state.handled = true;
        let memoryMessage = "ذهنم در حال حاضر خالیه، چیزی برای به یاد آوردن ندارم.";
        if (memories && memories.length > 0) {
            const randomIndex = Math.floor(Math.random() * memories.length);
            memoryMessage = memories[randomIndex];
        }
        try {
            await ctx.reply(memoryMessage, { reply_to_message_id: ctx.message.message_id });
        } catch (e) {
            console.warn(`[Warn] Failed to send /memory reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
        }
        const logEntry = createLogEntry(ctx, 'Triggered Response', '/memory');
        eventLogger(logEntry);
    });

    bot.on('text', async (ctx) => {
        if (ctx.state.handled) return;

        const userId = ctx.from.id;
        const messageText = ctx.message.text;
        const normalizedMessage = normalizeText(messageText);

        // The main try/catch block for our own logic errors
        try {
            const currentState = await getUserState(userId);

            if (currentState) {
                console.log(`[State] User ${userId} is in state: ${currentState.state}. Processing answer.`);
                const sql = "SELECT * FROM responses WHERE context_required = ?";
                const contextualResponses = (await db.all(sql, [currentState.state])).map(r => ({ ...r, trigger: JSON.parse(r.trigger), response: JSON.parse(r.response) }));
                let matchedItem = null;
                let wildcardFallback = null;
                for (const item of contextualResponses) {
                    if (item.trigger.includes('*')) {
                        wildcardFallback = item;
                        continue;
                    }
                    const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
                    for (const trigger of triggers) {
                        const normalizedTrigger = normalizeText(trigger);
                        if (normalizedMessage.includes(normalizedTrigger)) {
                            matchedItem = item;
                            break;
                        }
                    }
                    if (matchedItem) break;
                }
                if (!matchedItem && wildcardFallback) {
                    console.log(`[State] No specific match found. Using wildcard fallback for state: ${currentState.state}`);
                    matchedItem = wildcardFallback;
                }
                await clearUserState(userId);
                
                if (matchedItem) {
                    ctx.state.handled = true;
                    const logEntry = createLogEntry(ctx, 'Contextual Response', matchedItem.trigger.join(', '));
                    eventLogger(logEntry);
                    const responseToSend = Array.isArray(matchedItem.response) ? matchedItem.response[Math.floor(Math.random() * matchedItem.response.length)] : matchedItem.response;
                    // ADDED SAFETY NET
                    try {
                        await ctx.reply(responseToSend, { reply_to_message_id: ctx.message.message_id });
                    } catch (e) {
                         console.warn(`[Warn] Failed to send contextual reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
                    }
                } else {
                    // ADDED SAFETY NET
                    try {
                        await ctx.reply("بنظر میرسه که ممکنه پیامت رو نفهمیده باشم، بیا از اول شروع کنیم ( پیامت برای قرارگیری در آپدیت بعدی برای سازنده ارسال شد ).", { reply_to_message_id: ctx.message.message_id });
                    } catch (e) {
                        console.warn(`[Warn] Failed to send contextual fallback reply in chat ${ctx.chat.id}. Reason: ${e.message}`);
                    }
                }
                return;
            }

            let matchedItem = null;
            let matchedTrigger = messageText;
            if (botResponses.exact.has(normalizedMessage)) {
                matchedItem = botResponses.exact.get(normalizedMessage);
                matchedTrigger = matchedItem.trigger;
            }
            if (!matchedItem) {
                const messageWords = new Set(normalizedMessage.split(' '));
                let bestMatch = { score: 0, item: null, trigger: null };
                for (const item of botResponses.smart) {
                    const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
                    for (const trigger of triggers) {
                        const normalizedTrigger = normalizeText(trigger);
                        const triggerWords = normalizedTrigger.split(' ');
                        if (triggerWords.length === 0 || triggerWords[0] === '') continue;
                        let matches = 0;
                        triggerWords.forEach(word => {
                            if (word && messageWords.has(word)) matches++;
                        });
                        const score = matches / triggerWords.length;
                        const priorityScore = item.sets_state ? score + config.smartMatch.statePriorityBoost : score;
                        if (priorityScore > bestMatch.score) {
                            bestMatch = { score: priorityScore, item, trigger };
                        }
                    }
                }
                if (bestMatch.item && bestMatch.score >= config.smartMatch.scoreThreshold) {
                    matchedItem = bestMatch.item;
                    matchedTrigger = bestMatch.trigger;
                    const triggerWords = new Set(normalizeText(bestMatch.trigger).split(' '));
                    const extraWords = [...messageWords].filter(word => !triggerWords.has(word));
                    logPotentialFalsePositive({ userInput: messageText, matchedTrigger, score: bestMatch.score, extraWords, user: ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(), timestamp: new Date().toISOString() });
                }
            }

            if (matchedItem) {
                ctx.state.handled = true;
                if (matchedItem.sets_state) {
                    await db.run("INSERT OR REPLACE INTO conversation_state (user_id, state) VALUES (?, ?)", [userId, matchedItem.sets_state]);
                    console.log(`[State] Set state for user ${userId} to: ${matchedItem.sets_state}`);
                }
                const logEntry = createLogEntry(ctx, 'Triggered Response', Array.isArray(matchedTrigger) ? matchedTrigger.join(', ') : matchedTrigger);
                eventLogger(logEntry);
                const responseToSend = Array.isArray(matchedItem.response) ? matchedItem.response[Math.floor(Math.random() * matchedItem.response.length)] : matchedItem.response;
                // ADDED SAFETY NET
                try {
                    await ctx.reply(responseToSend, { reply_to_message_id: ctx.message.message_id });
                } catch(e) {
                    console.warn(`[Warn] Failed to send DB response in chat ${ctx.chat.id}. Reason: ${e.message}`);
                }
                return;
            }

            const isPrivateChat = ctx.chat.type === 'private';
            const isReplyToBot = !!ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;
            
            if (isPrivateChat || isReplyToBot) {
                let canTriggerAi = false;
                if (isPrivateChat) {
                    canTriggerAi = true;
                } else {
                    const isAllowedInThisGroup = config.ai.enabledInGroups || config.ai.groupWhitelist.includes(ctx.chat.id);
                    if (isAllowedInThisGroup) {
                        canTriggerAi = true;
                    } else {
                        console.log(`[Guardrail] AI response blocked in group ${ctx.chat.id} because it's not whitelisted.`);
                    }
                }
                if (canTriggerAi) {
                    logUnansweredQuestion(ctx);
                    const eventType = isPrivateChat ? 'Unanswered DM' : 'Unanswered Reply';
                    const logEntry = createLogEntry(ctx, eventType, ctx.message.text);
                    eventLogger(logEntry);
                    
                    // This entire block is now wrapped in a safety net.
                    try {
                        await ctx.replyWithChatAction('typing');
                        console.log(`[AI] No DB match found for "${messageText}". Calling AI...`);
                        const aiResponse = await getAiResponse(messageText, config.ai.persona);
                        await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });

                        const aiLogEntry = createLogEntry(ctx, 'AI Response', messageText);
                        eventLogger({ ...aiLogEntry, eventType: `AI Response: "${aiResponse.substring(0, 50)}..."` });
                    } catch (e) {
                        console.warn(`[Warn] Failed to send AI response or typing action in chat ${ctx.chat.id}. Reason: ${e.message}`);
                        // We can optionally send a non-reply message if the reply itself fails.
                        try {
                           await ctx.sendMessage("متاسفانه مشکلی در ارسال پاسخ پیش آمد.");
                        } catch (finalError) {
                            console.error(`[Critical] Failed even to send a simple message to chat ${ctx.chat.id}.`);
                        }
                    }
                    
                    ctx.state.handled = true;
                    return;
                }
            }

        } catch (error) {
            // This outer catch now only handles our internal logic errors, not Telegram API errors.
            console.error('[Handler Error] An unexpected error occurred in the text handler:', error);
            try {
                await ctx.reply("متاسفانه مشکلی پیش آمده، لطفا دوباره تلاش کنید.");
            } catch(e) {
                console.warn(`[Warn] Failed to send final error message to chat ${ctx.chat.id}. Reason: ${e.message}`);
            }
        }
    });
}

eventBus.on('reload_data', () => {
    console.log('[EventBus] Received reload_data signal. Reloading responses from database...');
    loadData();
});

module.exports = { loadData, registerHandlers };