// src/utils/helpers.js

const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const db = require('./database');

// --- Path Constants ---
const fullLogFilePath = path.join(__dirname, '..', '..', 'unanswered_questions_full.jsonl');
const textLogFilePath = path.join(__dirname, '..', '..', 'unanswered_questions_text.txt');
const potentialFalsePositivesFilePath = path.join(__dirname, '..', '..', 'potential_false_positives.jsonl');

// --- IMPROVEMENT: Standardized Error Logger ---
/**
 * A standardized function for logging errors to the console.
 * @param {string} functionName The name of the function where the error occurred.
 * @param {Error} error The error object.
 */
function logError(functionName, error) {
  logger.error(`[ERROR in ${functionName}]`, error.message);
}

// --- Chat Logging (Now using the Database) ---
/**
 * Retrieves all known group chat IDs from the database.
 * @returns {Promise<number[]>} A promise that resolves to an array of chat IDs.
 */
async function getKnownChats() {
  try {
    const rows = await db.all('SELECT chatId FROM known_chats');
    return rows.map((r) => r.chatId);
  } catch (err) {
    logError('getKnownChats', err);
    return []; // Return an empty array on failure to prevent crashes
  }
}

/**
 * Logs a new group chat ID to the database if it's not already present.
 * @param {number} chatId The ID of the chat to log.
 */
function logChatIfNew(chatId) {
  if (typeof chatId !== 'number' || chatId > 0) return;

  const sql = 'INSERT OR IGNORE INTO known_chats (chatId) VALUES (?)';
  // This is a "fire-and-forget" operation, we don't need to await it.
  db.run(sql, [chatId])
    .then((result) => {
      if (result.changes > 0) {
        logger.info(`[DB] New group chat saved: ${chatId}`);
      }
    })
    .catch((err) => {
      logError('logChatIfNew', err);
    });
}

// --- File-Based Logging (Now using Append-Only) ---
/**
 * Logs unanswered questions by appending to the log files.
 * Saves the full raw message object to one file and ONLY the text to the other.
 * @param {object} ctx The Telegraf context object.
 */
function logUnansweredQuestion(ctx) {
  const update = ctx.update.message || ctx.update.edited_message;
  if (!update) return;

  // --- Log the full message object ---
  try {
    const fullLogLine = `${JSON.stringify(update)}\n`;
    fs.appendFileSync(fullLogFilePath, fullLogLine);
  } catch (error) {
    logError('logUnansweredQuestion (full)', error);
  }

  // --- Log ONLY the message text ---
  if (update.text && typeof update.text === 'string') {
    try {
      const textLogLine = `${update.text}\n`;
      fs.appendFileSync(textLogFilePath, textLogLine);
    } catch (error) {
      logError('logUnansweredQuestion (text)', error);
    }
  }
}

/**
 * Logs potential false positive matches by appending to a file.
 * @param {object} logEntry The complete log object to save.
 */
function logPotentialFalsePositive(logEntry) {
  if (typeof logEntry !== 'object' || logEntry === null) return;
  try {
    const logLine = `${JSON.stringify(logEntry)}\n`;
    fs.appendFileSync(potentialFalsePositivesFilePath, logLine);
  } catch (error) {
    logError('logPotentialFalsePositive', error);
  }
}

/**
 * Creates a standardized log entry object for real-time dashboard events.
 * @param {object} ctx The Telegraf context object.
 * @param {string} eventType The type of event (e.g., 'New User', 'AI Response').
 * @param {string} [trigger=''] The trigger or content of the message.
 * @returns {object} A standardized log object.
 */
function createLogEntry(ctx, eventType, trigger = '') {
  const { from } = ctx;
  const { chat } = ctx;
  const update = ctx.update.message || ctx.update.edited_message;

  logChatIfNew(chat.id);

  const chatInfo = (chat.type === 'group' || chat.type === 'supergroup')
    ? `Group: ${chat.title}`
    : 'Direct Message';

  const userName = from.username
    ? `@${from.username}`
    : `${from.first_name} ${from.last_name || ''}`.trim();

  return {
    eventType,
    user: userName,
    userId: from.id,
    chatInfo,
    chatId: chat.id,
    messageId: update.message_id,
    trigger: trigger || update.text,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Normalizes text for matching purposes (lowercase, punctuation removal, etc.).
 * @param {string} text The input text.
 * @returns {string} The normalized text.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\s,.!?؟،]+/g, ' ')
    .replace(/آ/g, 'ا')
    .replace(/[یي]/g, 'ی')
    .trim();
}

module.exports = {
  getKnownChats,
  logUnansweredQuestion,
  logPotentialFalsePositive,
  createLogEntry,
  normalizeText,
};
