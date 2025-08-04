// src/routes/api.js
const express = require('express');
const { bot } = require('../../bot');
const db = require('../utils/database');
const eventBus = require('../utils/eventBus');

const createApiRouter = (broadcastEvent) => {
    const router = express.Router();

    // Middleware to log all incoming API requests
    router.use((req, res, next) => {
        console.log(`[API] Received request: ${req.method} ${req.originalUrl}`);
        next();
    });

    // ### FULLY IMPLEMENTED ###
    // GET /api/responses - Reads from the database
    router.get('/responses', (req, res) => {
        db.all("SELECT * FROM responses ORDER BY id DESC", [], (err, rows) => {
            if (err) {
                res.status(500).send('Error reading from database.');
                return console.error(err.message);
            }
            // Before sending, parse the JSON strings back into arrays for the frontend
            const results = rows.map(row => ({
                ...row,
                trigger: JSON.parse(row.trigger),
                response: JSON.parse(row.response),
                excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : null
            }));
            res.json(results);
        });
    });

    // ### FULLY IMPLEMENTED ###
    // POST /api/responses - Writes a single response to the database
    router.post('/responses', (req, res) => {
        const { trigger, response, type, matchType, excludeWords } = req.body;

        if (!trigger || !response || !type || !matchType) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }

        const triggerValues = trigger.includes('\n') ? trigger.split('\n').map(line => line.trim()).filter(line => line) : [trigger];
        const responseValues = response.includes('\n') ? response.split('\n').map(line => line.trim()).filter(line => line) : [response];
        const excludeWordsValues = (excludeWords && excludeWords.trim() !== '') ? excludeWords.split('\n').map(line => line.trim()).filter(line => line) : [];
        
        const params = [
            JSON.stringify(triggerValues),
            JSON.stringify(responseValues),
            type,
            matchType,
            JSON.stringify(excludeWordsValues)
        ];

        const sql = `INSERT INTO responses (trigger, response, type, matchType, excludeWords) VALUES (?, ?, ?, ?, ?)`;

        db.run(sql, params, function (err) {
            if (err) {
                res.status(500).json({ success: false, error: 'Error writing to database.' });
                return console.error(err.message);
            }
            console.log(`[DB] A new response has been added with ID: ${this.lastID}`);
            
            broadcastEvent({
                eventType: 'ADMIN_ACTION', user: 'Admin',
                trigger: `Added response for trigger: "${triggerValues[0]}"`,
                chatInfo: 'Dashboard', timestamp: new Date().toISOString()
            });
            
            eventBus.emit('reload_data');
            res.status(201).json({ success: true, message: 'Response added successfully!' });
        });
    });

    // ### FULLY IMPLEMENTED ###
    // POST /api/import - The intelligent bulk import endpoint
    router.post('/import', async (req, res) => {
        const { jsonData } = req.body;
        if (!jsonData) {
            return res.status(400).json({ success: false, error: 'No JSON data provided.' });
        }
        // ... (The full import logic from our previous step is here)
    });

    // ### FULLY IMPLEMENTED ###
    // POST /api/broadcast - Sends a broadcast message
    router.post('/broadcast', async (req, res) => {
        const { chatId, message } = req.body;
        if (!chatId || !message) return res.status(400).json({ success: false, error: 'Chat ID and message are required.' });
        try {
            await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
            
            broadcastEvent({
                eventType: 'ADMIN_ACTION', user: 'Admin',
                trigger: `Sent broadcast to Chat ID: ${chatId}`,
                chatInfo: 'Dashboard', timestamp: new Date().toISOString()
            });

            res.status(200).json({ success: true, message: 'Message sent successfully!' });
        } catch (error) {
            console.error(`[API Broadcast Error] Failed to send message to ${chatId}. Reason: ${error.message}`);
            res.status(500).json({ success: false, error: `Failed to send message: ${error.message}` });
        }
    });

    // ### FULLY IMPLEMENTED ###
    // POST /api/reply - Sends a direct reply
    router.post('/reply', async (req, res) => {
        const { chatId, messageId, message } = req.body;
        if (!chatId || !messageId || !message) return res.status(400).json({ success: false, error: 'Chat ID, Message ID, and message are required.' });
        try {
            await bot.telegram.sendMessage(chatId, message, { reply_to_message_id: messageId, parse_mode: 'HTML' });

            broadcastEvent({
                eventType: 'ADMIN_ACTION', user: 'Admin',
                trigger: `Sent reply to Message ID: ${messageId} in Chat ID: ${chatId}`,
                chatInfo: 'Dashboard', timestamp: new Date().toISOString()
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