const { nanoid } = require('nanoid');
const { hashPassword, hashBuffer } = require('../utils/validation');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');
const db = require('../db');

function createAppController({ app, services, helpers }) {
  const { getDbState, setDbState, readDbState, writeDbState } = services;
  const { normalizeRegNumber, validateRegNumber, analyzeImageLiveness } = helpers;

  async function ensureDbReady() {
    await db.init();
    await readDbState();
  }

  return {
    async initDb() {
      await ensureDbReady();
    },
    async getSecuritySettings(req, res) {
      await readDbState();
      const defaultSettings = {
        maxLoginAttempts: 5,
        lockoutDuration: 30,
        minPasswordLength: 6,
        sessionTimeout: 60,
        enforceMFA: true
      };
      res.json(db.data.security_settings || defaultSettings);
    },
    async updateSecuritySettings(req, res) {
      const { maxLoginAttempts, lockoutDuration, minPasswordLength, sessionTimeout, enforceMFA } = req.body;
      await readDbState();
      db.data.security_settings = {
        maxLoginAttempts: maxLoginAttempts || 5,
        lockoutDuration: lockoutDuration || 30,
        minPasswordLength: minPasswordLength || 6,
        sessionTimeout: sessionTimeout || 60,
        enforceMFA: enforceMFA !== undefined ? enforceMFA : true,
        updated_at: new Date().toISOString()
      };
      await writeDbState();
      res.json({ success: true, message: 'Security settings updated' });
    }
  };
}

module.exports = createAppController;
