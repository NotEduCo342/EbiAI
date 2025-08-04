// src/utils/database.js

const sqlite3 = require('sqlite3').verbose();
const path =require('path');

const dbPath = path.resolve(__dirname, '..', '..', 'bot_database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

/**
 * Promisified wrapper for db.get
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<object>} A promise that resolves to the first row found.
 */
const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

/**
 * Promisified wrapper for db.all
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<Array>} A promise that resolves to an array of all rows found.
 */
const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

/**
 * Promisified wrapper for db.run
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to bind to the query.
 * @returns {Promise<object>} A promise that resolves to the `this` context of the execution.
 */
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};
/**
 * NEW: A function to gracefully close the database connection.
 * @returns {Promise<void>}
 */
const close = () => {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) return reject(err);
            console.log('Database connection closed.');
            resolve();
        });
    });
};

// Export the promisified functions
module.exports = {
    get,
    all,
    run,
    close
};