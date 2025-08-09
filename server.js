// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const readline = require('readline');
const { bot, setEventLogger, getKnownChats } = require('./bot');
const createApiRouter = require('./src/routes/api');
const db = require('./src/utils/database');
const { authMiddleware } = require('./src/middleware/auth');
// 1. IMPORT all necessary scheduler functions
const { startScheduler, saveDailyStats, initializeAndLoadStats } = require('./src/utils/scheduler');

const app = express();
app.set('trust proxy', 1);
const port = 3000;
let clients = [];

// NEW: A flag to control broadcasting for this specific session.
let sendBroadcasts = true;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Real-time Events Endpoint (SSE) ---
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  clients.push({ id: clientId, res });
  console.log(`[Server] Dashboard client connected. Total clients: ${clients.length}`);

  req.on('close', () => {
    clients = clients.filter((c) => c.id !== clientId);
    console.log(`[Server] Dashboard client disconnected. Total clients: ${clients.length}`);
  });
});

function broadcastEvent(logEntry) {
  clients.forEach((c) => c.res.write(`data: ${JSON.stringify(logEntry)}\n\n`));
}
setEventLogger(broadcastEvent);

// --- API Routes ---
app.use('/api', authMiddleware, createApiRouter(broadcastEvent));

// --- Static Frontend Routes ---
app.get('/', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/manager', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'manager.html'));
});
app.get('/stats', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'stats.html'));
});

// --- Graceful Shutdown and Startup Broadcast ---
async function broadcastToAllGroups(message) {
  const chats = await getKnownChats();
  if (!chats || chats.length === 0) {
    console.log('[Server] No known groups to broadcast to.');
    return;
  }
  console.log(`[Server] Broadcasting to ${chats.length} group(s)...`);
  const broadcastPromises = chats.map((chatId) => bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch((err) => console.error(`[Broadcast Error] Failed to send message to chat ${chatId}: ${err.message}`)));
  await Promise.all(broadcastPromises);
  console.log('[Server] Broadcast finished.');
}

// CORRECTED SHUTDOWN BLOCK
process.once('SIGINT', async () => {
  console.log('\n[Server] Gracefully shutting down...');

  // 2. SAVE the final stats from the current session before closing.
  console.log('[Server] Saving final stats before shutdown...');
  await saveDailyStats();

  if (sendBroadcasts) {
    console.log('Sending offline message...');
    await broadcastToAllGroups('🤖 ربات ابی برای آپدیت از دسترس خارج شد.');
  } else {
    console.log('Skipping shutdown broadcast as requested by user.');
  }

  bot.stop('SIGINT');
  await db.close();

  console.log('[Server] Shutdown complete.');
  process.exit(0);
});

// CORRECTED STARTUP FUNCTION
async function startApplication() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  // 3. LOAD today's stats from the database BEFORE the bot starts.
  await initializeAndLoadStats();

  // Ask the new question first.
  const broadcastAnswer = await question('Send startup/shutdown broadcast to all groups? (Y/n): ');
  if (broadcastAnswer.trim().toLowerCase() === 'n') {
    sendBroadcasts = false;
    console.log('[Broadcast] Broadcasts for this session are DISABLED.');
  }

  const customMessage = await question('Enter optional startup message (or press Enter to skip): ');
  rl.close();

  app.listen(port, async () => {
    console.log(`[Server] Express server started. Dashboard is live at http://localhost:${port}`);
    bot.launch();
    console.log('[Bot] Telegraf bot launched and running.');

    // 4. ACTIVATE the smart scheduler on startup.
    startScheduler();

    // Check our flag before sending the message.
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