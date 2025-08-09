// src/utils/dataLoader.js

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { normalizeText } = require('./helpers');

let memories = [];
const botResponses = {
  smart: [],
  exact: new Map(),
};

async function loadData() {
  botResponses.smart = [];
  botResponses.exact.clear();
  memories = [];

  try {
    const memoriesFilePath = path.join(__dirname, '..', '..', 'memories.json');
    memories = JSON.parse(fs.readFileSync(memoriesFilePath, 'utf8')).memories;
    console.log(`[Data] Loaded ${memories.length} memories.`);
  } catch (err) {
    console.error('[Data] Could not read or parse memories.json!', err);
  }

  try {
    const sql = "SELECT * FROM responses WHERE context_required IS NULL OR context_required = ''";
    const rows = await db.all(sql);
    rows.forEach((row) => {
      const item = {
        ...row,
        trigger: JSON.parse(row.trigger),
        response: JSON.parse(row.response),
        excludeWords: row.excludeWords ? JSON.parse(row.excludeWords) : [],
      };

      if (item.matchType === 'exact') {
        const triggers = Array.isArray(item.trigger) ? item.trigger : [item.trigger];
        triggers.forEach((trigger) => {
          botResponses.exact.set(normalizeText(trigger), item);
        });
      } else {
        botResponses.smart.push(item);
      }
    });
    const exactCount = botResponses.exact.size;
    const smartCount = botResponses.smart.length;
    console.log(`[Data] Initialized with ${smartCount} 'Smart' and ${exactCount} 'Exact' non-contextual responses.`);
  } catch (err) {
    console.error('[Data] Error loading responses from database:', err.message);
  }
}

// NEW: Export functions that return the current state of the data.
module.exports = {
  loadData,
  getMemories: () => memories,
  getBotResponses: () => botResponses,
};