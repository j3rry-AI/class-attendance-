const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function runMigrations(dbPath) {
  try {
    const migrationsDir = path.join(__dirname);
    const sqlFile = path.join(migrationsDir, 'create_sessions_and_attendance.sql');
    if (!fs.existsSync(sqlFile)) {
      console.warn('Migrations SQL file not found:', sqlFile);
      return;
    }

    if (!dbPath) {
      dbPath = process.env.SQLITE_FILE || path.resolve(__dirname, '..', 'data', 'app_state.sqlite');
    }

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const db = new DatabaseSync(dbPath);
    const sql = fs.readFileSync(sqlFile, 'utf8');
    db.exec(sql);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    console.log('✅ Migrations applied to', dbPath);
    db.close && db.close();
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  }
}

module.exports = runMigrations;
