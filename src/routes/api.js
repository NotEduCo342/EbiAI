// src/routes/api.js
const express = require('express');
const { bot } = require('../../bot');
const db = require('../utils/database');
const eventBus = require('../utils/eventBus');
const { getBotResponses, getMemories } = require('../utils/dataLoader');
const { getStats } = require('../utils/statsTracker');

const createApiRouter = (broadcastEvent) => {
  const router = express.Router();

  router.use((req, res, next) => {
    console.log(`[API] Received request: ${req.method} ${req.originalUrl}`);
    next();
  });

  // --- STATS ENDPOINT (NOW WITH HISTORICAL DATA) ---
// --- STATS ENDPOINT (NOW WITH TIME RANGE LOGIC) ---
// --- STATS ENDPOINT (NOW WITH COST & ERROR DATA) ---
router.get('/stats', async (req, res) => {
  try {
    const { range } = req.query;
    let limit = 30;
    if (range === '7d') {
      limit = 7;
    }

    const liveStats = getStats();
    const botResponses = getBotResponses();
    const memories = getMemories();
    const knownChats = await db.all('SELECT chatId FROM known_chats');
    const historicalData = await db.all(
      `SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?`,
      [limit],
    );

    const statsData = {
      // Static Stats
      smartResponses: botResponses.smart.length,
      exactResponses: botResponses.exact.size,
      totalResponses: botResponses.smart.length + botResponses.exact.size,
      memories: memories.length,
      knownChats: knownChats.length,
      // Live Stats (now includes cost and error data)
      ...liveStats,
      // Historical Stats for the chart
      historicalData,
    };

    res.json(statsData);
  } catch (err) {
    console.error('[API Stats Error]', err.message);
    res.status(500).json({ error: 'Failed to retrieve bot statistics.' });
  }
});

  // --- EXISTING RESPONSE ROUTES ---
  router.get('/responses', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM responses ORDER BY id DESC', []);
      const results = rows.map((row) => ({
        ...row,
        trigger: JSON.parse(row.trigger),
        response: JSON.parse(row.response),
        excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : null,
      }));
      res.json(results);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Error reading from database.');
    }
  });

  router.post('/responses', async (req, res) => {
    const {
      trigger, response, type, matchType, excludeWords,
    } = req.body;

    if (!trigger || !response || !type || !matchType) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    try {
      const triggerValues = trigger.includes('\n') ? trigger.split('\n').map((line) => line.trim()).filter((line) => line) : [trigger];
      const responseValues = response.includes('\n') ? response.split('\n').map((line) => line.trim()).filter((line) => line) : [response];
      const excludeWordsValues = (excludeWords && excludeWords.trim() !== '') ? excludeWords.split('\n').map((line) => line.trim()).filter((line) => line) : [];

      const params = [
        JSON.stringify(triggerValues),
        JSON.stringify(responseValues),
        type,
        matchType,
        JSON.stringify(excludeWordsValues),
      ];

      const sql = 'INSERT INTO responses (trigger, response, type, matchType, excludeWords) VALUES (?, ?, ?, ?, ?)';
      const result = await db.run(sql, params);

      console.log(`[DB] A new response has been added with ID: ${result.lastID}`);

      broadcastEvent({
        eventType: 'ADMIN_ACTION',
        user: 'Admin',
        trigger: `Added response for trigger: "${triggerValues[0]}"`,
        chatInfo: 'Dashboard',
        timestamp: new Date().toISOString(),
      });

      eventBus.emit('reload_data');
      res.status(201).json({ success: true, message: 'Response added successfully!' });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, error: 'Error writing to database.' });
    }
  });

  // --- OTHER EXISTING ROUTES ---
  router.post('/import', async (req, res) => {
    const { jsonData } = req.body;
    if (!jsonData) {
      return res.status(400).json({ success: false, error: 'No JSON data provided.' });
    }
    // ... (Your full import logic would be here)
  });

  router.post('/broadcast', async (req, res) => {
    const { chatId, message } = req.body;
    if (!chatId || !message) return res.status(400).json({ success: false, error: 'Chat ID and message are required.' });
    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
      broadcastEvent({
        eventType: 'ADMIN_ACTION',
        user: 'Admin',
        trigger: `Sent broadcast to Chat ID: ${chatId}`,
        chatInfo: 'Dashboard',
        timestamp: new Date().toISOString(),
      });
      res.status(200).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
      console.error(`[API Broadcast Error] Failed to send message to ${chatId}. Reason: ${error.message}`);
      res.status(500).json({ success: false, error: `Failed to send message: ${error.message}` });
    }
  });

  router.post('/reply', async (req, res) => {
    const { chatId, messageId, message } = req.body;
    if (!chatId || !messageId || !message) return res.status(400).json({ success: false, error: 'Chat ID, Message ID, and message are required.' });
    try {
      await bot.telegram.sendMessage(chatId, message, { reply_to_message_id: messageId, parse_mode: 'HTML' });
      broadcastEvent({
        eventType: 'ADMIN_ACTION',
        user: 'Admin',
        trigger: `Sent reply to Message ID: ${messageId} in Chat ID: ${chatId}`,
        chatInfo: 'Dashboard',
        timestamp: new Date().toISOString(),
      });
      res.status(200).json({ success: true, message: 'Reply sent successfully!' });
    } catch (error) {
      console.error(`[API Reply Error] Failed to send reply to ${messageId} in ${chatId}. Reason: ${error.message}`);
      res.status(500).json({ success: false, error: `Failed to send reply: ${error.message}` });
    }
  });

  return router;
};

module.exports = createApiRouter;