// src/routes/api.js
const express = require('express');
const { bot } = require('../../bot');
const db = require('../utils/database');
const path = require('path'); // <-- ADD THIS LINE
const fs = require('fs'); // ADDED THIS LINE
const eventBus = require('../utils/eventBus');
const { getMemories } = require('../utils/dataLoader');
const { getStats } = require('../utils/statsTracker');
const logger = require('../utils/logger');
const { getAiResponse } = require('../services/aiService');

const createApiRouter = (broadcastEvent) => {
  const router = express.Router();

  router.use((req, res, next) => {
    logger.api(`[API] Received request: ${req.method} ${req.originalUrl}`);
    next();
  });

  // --- STATS ENDPOINT (WITH DIRECT DB COUNT) ---
  router.get('/stats', async (req, res) => {
    try {
      const { range } = req.query;
      let limit = 30;
      if (range === '7d') {
        limit = 7;
      }

      // Query the database directly for accurate counts.
      const smartCountResult = await db.get("SELECT COUNT(*) as count FROM responses WHERE matchType = 'smart'");
      const exactCountResult = await db.get("SELECT COUNT(*) as count FROM responses WHERE matchType = 'exact'");
      const smartResponses = smartCountResult.count;
      const exactResponses = exactCountResult.count;

      const liveStats = getStats();
      const memories = getMemories();
      const knownChats = await db.all('SELECT chatId FROM known_chats');
      const historicalData = await db.all(
        'SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?',
        [limit],
      );

      const statsData = {
        // Static Stats from our new queries
        smartResponses,
        exactResponses,
        totalResponses: smartResponses + exactResponses,
        memories: memories.length,
        knownChats: knownChats.length,
        // Live Stats
        ...liveStats,
        // Historical Stats
        historicalData,
      };

      res.json(statsData);
    } catch (err) {
      logger.error('[API Stats Error]', err.message);
      res.status(500).json({ error: 'Failed to retrieve bot statistics.' });
    }
  });

    // --- BRAINSTORMER API ROUTES ---
  router.get('/unanswered-questions', (req, res) => {
    try {
      const filePath = path.join(__dirname, '..', '..', 'unanswered_questions_text.txt');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const questions = fileContent.split('\n').filter(line => line.trim() !== ''); // Read file, split by line, remove empty lines
      res.json({ success: true, questions });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        return res.json({ success: true, questions: [] });
      }
      logger.error('[API Unanswered Questions Error]', error.message);
      res.status(500).json({ success: false, error: 'Failed to read unanswered questions file.' });
    }
  });
    // This new endpoint will handle all modifications to the unanswered questions list
  router.post('/unanswered-questions/action', (req, res) => {
    const { action, questions } = req.body; // action can be 'delete', 'ignore', etc.

    if (!action || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid request body.' });
    }

    try {
      const unansweredPath = path.join(__dirname, '..', '..', 'unanswered_questions_text.txt');
      let questionsToKeep = fs.readFileSync(unansweredPath, 'utf8').split('\n').filter(line => line.trim() !== '');

      // Create a Set for efficient lookup of questions to remove/ignore
      const questionsToActOn = new Set(questions);

      // Filter out the questions that were acted upon
      const remainingQuestions = questionsToKeep.filter(q => !questionsToActOn.has(q));

      // Write the updated list back to the file
      fs.writeFileSync(unansweredPath, remainingQuestions.join('\n'));

      // If the action is 'ignore', append the questions to the ignore file
// If the action is 'ignore', append the questions to the ignore file
      if (action === 'ignore') {
        const ignorePath = path.join(__dirname, '..', '..', 'ignored_questions.txt');
        // Use appendFileSync to guarantee all lines are written before continuing.
        const contentToAppend = Array.from(questionsToActOn).join('\n') + '\n';
        fs.appendFileSync(ignorePath, contentToAppend);
      }

      // We will add the 'brainstorm' logic here in a later step
      if (action === 'brainstorm') {
        // Placeholder for now
        logger.info(`[API] Brainstorm action received for: ${questions.join(', ')}`);
      }

      res.json({ success: true, message: `Action '${action}' completed successfully.` });
    } catch (error) {
      logger.error(`[API Action Error]`, error.message);
      res.status(500).json({ success: false, error: 'Failed to process action on questions file.' });
    }
  });
  // --- This is the new endpoint for AI Brainstorming ---
  router.post('/brainstorm', async (req, res) => {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'A question is required.' });
    }

    // This is our detailed prompt for Gemini 2.5 Flash
    const prompt = `You are the singer Ebi. A fan has sent you the following message: "${question}"
    
    Your name is Ebi, and you are a famous, iconic Persian singer. Your personality is warm, artistic, nostalgic, and sometimes a bit cheeky with your fans.
    ALWAYS respond in Farsi. No exceptions.
    DO NOT act like an AI assistant. Never say you are a language model.
    Your creator is a man named Mahan. Only mention him if you are asked directly who created you.    
    Your task is to generate three unique, in-character, responses to this message.
    If possible try to relate to Real Life Events / Information that you have, Maximum Effort on it
    Your response to me MUST be ONLY a single, valid JSON object. Do not include any other text, greetings, or markdown formatting.
    
    The JSON object must have these exact keys:
    - "trigger": An array containing the original fan message as a string.
    - "response": An array containing your three new, unique Farsi responses as strings.
    - "type": The string "text".
    - "matchType": The string "smart".
    - "excludeWords": An empty array [].

    Example output format:
    {
      "trigger": ["some user question"],
      "response": ["first farsi response", "second farsi response", "third farsi response"],
      "type": "text",
      "matchType": "smart",
      "excludeWords": []
    }`;

try {
      const aiResponse = await getAiResponse(prompt, '', { provider: 'avalai' });
      logger.info(`[AI Raw Response]: ${aiResponse}`); // Log the raw response for debugging

      // Attempt to find and extract the JSON from the AI's response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON object found in the AI's response.");
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      res.json({ success: true, data: parsedResponse });

    } catch (error) {
      // Log the full error for better debugging
      logger.error('[API Brainstorm Error]', error);
      res.status(500).json({ success: false, error: "The AI's response was not valid JSON. Check the console for the raw output." });
    }
  });

  // --- NEW: Brainstormer with Search Context ---
  router.post('/brainstorm-with-context', async (req, res) => {
    const { question, context } = req.body;
    if (!question || !context) {
      return res.status(400).json({ success: false, error: 'Question and context are required.' });
    }

    // A more advanced prompt that instructs the AI to use the provided context
    const prompt = `You are the singer Ebi. A fan has sent you a message. You have been provided with factual context from a web search. Your task is to use this context to create three unique, in-character Farsi responses.

    **Factual Context:** "${context}"
    **Fan's Message:** "${question}"

    **Instructions:**
    1.  Base your answers on the **Factual Context**.
    2.  Answer in the warm, artistic, and nostalgic persona of Ebi.
    3.  Your response to me MUST be ONLY a single, valid JSON object with the keys "trigger", "response", "type", "matchType", and "excludeWords".`;

    try {
      const aiResponse = await getAiResponse(prompt, '', { provider: 'avalai' });
      logger.info(`[AI Raw Response w/ Context]: ${aiResponse}`);

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON object found in the AI's response.");
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      res.json({ success: true, data: parsedResponse });
    } catch (error) {
      logger.error('[API Brainstorm w/ Context Error]', error);
      res.status(500).json({ success: false, error: "The AI's response was not valid JSON. Check console." });
    }
  });

  // --- This is the new endpoint for Manual Web Search ---
  router.post('/manual-search', async (req, res) => {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'A question/query is required.' });
    }

    try {
      logger.info(`[API Search] Performing manual search for: "${question}"`);
      const searchResult = await getSearchResults(question);

      if (searchResult) {
        res.json({ success: true, data: searchResult });
      } else {
        res.json({ success: true, data: 'No answer found from the web search.' });
      }
    } catch (error) {
      logger.error('[API Manual Search Error]', error.message);
      res.status(500).json({ success: false, error: 'The web search failed. Please check the console.' });
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
      logger.error(err.message);
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

      logger.db(`[DB] A new response has been added with ID: ${result.lastID}`);

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
      logger.error(err.message);
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
    // This is just a placeholder to show the route is restored.
    logger.info('[API] Received request to /import');
    res.status(512).json({ success: false, error: 'Import logic not fully implemented in this example.'});
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
      logger.error(`[API Broadcast Error] Failed to send message to ${chatId}. Reason: ${error.message}`);
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
      logger.error(`[API Reply Error] Failed to send reply to ${messageId} in ${chatId}. Reason: ${error.message}`);
      res.status(500).json({ success: false, error: `Failed to send reply: ${error.message}` });
    }
  });

  return router;
};

module.exports = createApiRouter;