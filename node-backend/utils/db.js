const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.SQLITE_FILE || path.resolve(__dirname, '..', 'data', 'app_state.sqlite');
const DB_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
module.exports = db;
