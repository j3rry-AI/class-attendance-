// Native SQLite-backed state store using Node 22's built-in sqlite (no native addons)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.SQLITE_FILE || path.resolve(__dirname, '..', 'data', 'app_state.sqlite');
const DB_DIR = path.dirname(DB_FILE);
const DB_ID = 'main';

const DEFAULT_STATE = {
  users: [],
  attendance: [],
  courses: [],
  geo_locations: [],
  security_settings: {},
  sessions: [],
  notifications: [],
  disputes: [],
  enrollments: [],
  activity_logs: [],
  academic_settings: {}
};

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db;

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const row = db.prepare('SELECT payload FROM app_state WHERE id = ?').get(DB_ID);
  if (!row) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO app_state (id, payload, updated_at) VALUES (?, ?, ?)').run(DB_ID, JSON.stringify(DEFAULT_STATE), now);
  }
}

module.exports = {
  async init() {
    db = new DatabaseSync(DB_FILE);
    ensureSchema();
    // simple sanity check
    db.prepare('SELECT 1').get();
  },

  async readAll() {
    const row = db.prepare('SELECT payload FROM app_state WHERE id = ?').get(DB_ID);
    if (!row || !row.payload) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    try {
      return JSON.parse(row.payload);
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  },

  async writeAll(data) {
    const payload = data || DEFAULT_STATE;
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO app_state (id, payload, updated_at) 
        VALUES (?, ?, ?) 
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `).run(DB_ID, JSON.stringify(payload), now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },

  async getUsers() {
    const state = await this.readAll();
    return state.users || [];
  },

  async insertUser(user) {
    const state = await this.readAll();
    state.users = state.users || [];
    state.users.push(user);
    await this.writeAll(state);
    return user;
  },

  async writeAttendance(att) {
    const state = await this.readAll();
    state.attendance = state.attendance || [];
    state.attendance.push(att);
    await this.writeAll(state);
  }
};
