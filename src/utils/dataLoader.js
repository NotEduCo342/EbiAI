// src/utils/dataLoader.js

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { normalizeText } = require('./helpers');
const logger = require('./logger');

let memories = [];
const botResponses = {
  smart: [], // Smart responses will be loaded on-demand
  exact: new Map(),
};

async function loadData() {
  botResponses.exact.clear();
  memories = [];

  try {
    const memoriesFilePath = path.join(__dirname, '..', '..', 'memories.json');
    memories = JSON.parse(fs.readFileSync(memoriesFilePath, 'utf8')).memories;
    logger.info(`[Data] Loaded ${memories.length} memories.`);
  } catch (err) {
    logger.error('[Data] Could not read or parse memories.json!', err);
  }

  try {
    // We now ONLY pre-load 'exact' match types into memory for speed.
    const sql = "SELECT trigger, response, excludeWords, sets_state, id FROM responses WHERE matchType = 'exact' AND (context_required IS NULL OR context_required = '')";
    const rows = await db.all(sql);

    rows.forEach((row) => {
      const item = {
        ...row,
        trigger: JSON.parse(row.trigger),
        response: JSON.parse(row.response),
        excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : [],
      };
      const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
      triggers.forEach((trigger) => {
        botResponses.exact.set(normalizeText(trigger), item);
      });
    });

    logger.db(`[Data] Pre-loaded ${botResponses.exact.size} 'Exact' match responses into memory.`);
  } catch (err) {
    logger.error('[Data] Error loading responses from database:', err.message);
  }
}

module.exports = {
  loadData,
  getMemories: () => memories,
  getBotResponses: () => botResponses,
};