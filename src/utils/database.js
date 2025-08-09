// src/utils/database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', '..', 'bot_database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

/**
 * Ensures that all required tables exist in the database.
 * Creates them if they are missing.
 */
function initializeDatabase() {
  const createDailyStatsTable = `
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      messagesProcessed INTEGER DEFAULT 0,
      aiResponses INTEGER DEFAULT 0,
      searchCalls INTEGER DEFAULT 0
    );
  `;
  db.exec(createDailyStatsTable, (err) => {
    if (err) {
      console.error('[DB Init] Could not create daily_stats table:', err.message);
    } else {
      console.log('[DB Init] daily_stats table is ready.');
    }
  });
}

/**
 * Promisified wrapper for db.get
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<object>} A promise that resolves to the first row found.
 */
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

/**
 * Promisified wrapper for db.all
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<Array>} A promise that resolves to an array of all rows found.
 */
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

/**
 * Promisified wrapper for db.run
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<object>} A promise that resolves to the `this` context of the execution.
 */
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function afterRun(err) {
    if (err) return reject(err);
    resolve(this);
  });
});

/**
 * A function to gracefully close the database connection.
 * @returns {Promise<void>}
 */
const close = () => new Promise((resolve, reject) => {
  db.close((err) => {
    if (err) return reject(err);
    console.log('Database connection closed.');
    resolve();
  });
});

// Run the initialization function when this module is first loaded
initializeDatabase();

// Export the promisified functions and the initialization function
module.exports = {
  get,
  all,
  run,
  close,
};