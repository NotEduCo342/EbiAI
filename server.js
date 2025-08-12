// server.js
/**
 * @file The main entry point for the application.
 * This file initializes the Express server, the Telegraf bot,
 * and handles startup, shutdown, and real-time event broadcasting.
 * @author Jules
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const readline = require('readline');
const logger = require('./src/utils/logger');
const { bot, setEventLogger, getKnownChats } = require('./bot');
const createApiRouter = require('./src/routes/api');
const db = require('./src/utils/database');
const { authMiddleware } = require('./src/middleware/auth');
const { startScheduler, saveDailyStats, initializeAndLoadStats } = require('./src/utils/scheduler');

const app = express();
app.set('trust proxy', 1);
const port = 3001;

// Stores active Server-Sent Events (SSE) clients for the dashboard feed.
let clients = [];
// A flag to control broadcast messages for the current session, set via startup prompt.
let sendBroadcasts = true;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Real-time Events Endpoint (SSE) ---
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  clients.push({ id: clientId, res });
  logger.info(`[Server] Dashboard client connected. Total clients: ${clients.length}`);

  req.on('close', () => {
    clients = clients.filter((c) => c.id !== clientId);
    logger.info(`[Server] Dashboard client disconnected. Total clients: ${clients.length}`);
  });
});

/**
 * Broadcasts a log entry to all connected dashboard clients.
 * @param {object} logEntry - The log object to send.
 */
function broadcastEvent(logEntry) {
  clients.forEach((c) => c.res.write(`data: ${JSON.stringify(logEntry)}\n\n`));
}
setEventLogger(broadcastEvent);

// --- API & Frontend Routes ---
app.use('/api', authMiddleware, createApiRouter(broadcastEvent));
app.get('/', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/manager', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'manager.html')));
app.get('/brainstormer', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'brainstormer.html')));
app.get('/stats', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'stats.html')));

/**
 * Sends a message to all known group chats.
 * @param {string} message - The message to send. Supports HTML formatting.
 */
async function broadcastToAllGroups(message) {
  const chats = await getKnownChats();
  if (!chats || chats.length === 0) {
    logger.info('[Server] No known groups to broadcast to.');
    return;
  }
  logger.info(`[Server] Broadcasting to ${chats.length} group(s)...`);
  const broadcastPromises = chats.map((chatId) =>
    bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
      .catch((err) => logger.error(`[Broadcast Error] Failed to send to chat ${chatId}: ${err.message}`)));
  await Promise.all(broadcastPromises);
  logger.info('[Server] Broadcast finished.');
}

// --- Graceful Shutdown ---
process.once('SIGINT', async () => {
  logger.info('\n[Server] Gracefully shutting down...');

  logger.info('[Server] Saving final stats before shutdown...');
  await saveDailyStats();

  if (sendBroadcasts) {
    logger.info('[Server] Sending offline message...');
    await broadcastToAllGroups('🤖 ربات ابی برای آپدیت از دسترس خارج شد.');
  } else {
    logger.info('[Server] Skipping shutdown broadcast as requested by user.');
  }

  bot.stop('SIGINT');
  await db.close();

  logger.info('[Server] Shutdown complete.');
  process.exit(0);
});

/**
 * Initializes and starts the application, including the bot and web server.
 * Prompts the user for startup options via the command line.
 */
async function startApplication() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  // Load stats from the database before starting the bot.
  await initializeAndLoadStats();

  const broadcastAnswer = await question('Send startup/shutdown broadcast to all groups? (Y/n): ');
  if (broadcastAnswer.trim().toLowerCase() === 'n') {
    sendBroadcasts = false;
    logger.info('[Broadcast] Broadcasts for this session are DISABLED.');
  }

  const customMessage = await question('Enter optional startup message (or press Enter to skip): ');
  rl.close();

  app.listen(port, async () => {
    const heapUsedMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    logger.warn(`--- MEMORY USAGE REPORT ---\n  Heap Used: ${heapUsedMb} MB\n  -------------------------`);

    logger.info(`[Server] Express server started. Dashboard is live at http://localhost:${port}`);
    bot.launch();
    logger.info('[Bot] Telegraf bot launched and running.');

    // Activate the scheduler to run periodic tasks.
    startScheduler();

    if (sendBroadcasts) {
      let startupMessage = '✅ <b>ابی اکنون برای پاسخ دادن آماده است.</b>';
      if (customMessage.trim() !== '') {
        startupMessage += `\n\n${customMessage}`;
      }
      await broadcastToAllGroups(startupMessage);
    }
  });
}

startApplication();