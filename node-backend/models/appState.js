const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const { normalizeRegNumber, validateRegNumber, hashBuffer, hashPassword, analyzeImageLiveness } = require('../utils/validation');
// require the db module explicitly to avoid resolving to `db.json`
const dbClient = require('../db/index');

const DEFAULT_DB_STATE = {
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

const state = {
  data: JSON.parse(JSON.stringify(DEFAULT_DB_STATE))
};

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

function ensureDefaults() {
  if (!state.data.users) state.data.users = [];
  if (!state.data.attendance) state.data.attendance = [];
  if (!state.data.courses) state.data.courses = [];
  if (!state.data.geo_locations) state.data.geo_locations = [];
  if (!state.data.sessions) state.data.sessions = [];
  if (!state.data.notifications) state.data.notifications = [];
  if (!state.data.disputes) state.data.disputes = [];
  if (!state.data.enrollments) state.data.enrollments = [];
  if (!state.data.activity_logs) state.data.activity_logs = [];
  if (!state.data.academic_settings) state.data.academic_settings = {};
  if (!state.data.security_settings) {
    state.data.security_settings = {
      maxLoginAttempts: 5,
      lockoutDuration: 30,
      minPasswordLength: 6,
      sessionTimeout: 60,
      enforceMFA: true
    };
  }
}

async function seedAdminAccount() {
  // Ensure admin account exists with ID 'ADMIN/002' and password 'Admin123!'
  const adminExists = (state.data.users || []).find(u => u.reg_number === 'ADMIN/002');
  if (!adminExists) {
    const secret = require('otplib').authenticator.generateSecret();
    const adminUser = {
      id: 'admin_' + nanoid(),
      name: 'System Administrator',
      reg_number: 'ADMIN/002',
      role: 'admin',
      password_hash: hashPassword('Admin123!'),
      email_verified: true,
      mfa_secret: secret,
      face_hash: null,
      temp_otp: null,
      temp_otp_expires: null,
      login_attempts: 0,
      locked_until: null,
      face_descriptor: null,
      face_descriptor_version: 0,
      last_face_update: null,
      created_at: new Date().toISOString()
    };
    state.data.users.push(adminUser);
    console.log('✅ Admin account seeded: ADMIN/002');
  }
}

async function initDb() {
  if (typeof dbClient.init === 'function') {
    await dbClient.init();
  }
  await read();
  ensureDefaults();
  await seedAdminAccount();
  await write();
}

async function read() {
  const all = await dbClient.readAll();
  state.data = all && typeof all === 'object' ? all : JSON.parse(JSON.stringify(DEFAULT_DB_STATE));
  ensureDefaults();
  return state.data;
}

async function write() {
  await dbClient.writeAll(state.data);
}

function getState() {
  return state.data;
}

function findUserByRegNumber(regNumber, role) {
  if (!regNumber || typeof regNumber !== 'string') return null;
  const normalized = normalizeRegNumber(regNumber);
  return (state.data.users || []).find(u => {
    if (!u || typeof u.reg_number !== 'string') return false;
    if (role && u.role !== role) return false;
    return normalizeRegNumber(u.reg_number) === normalized;
  });
}

function findUserByIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const normalizedIdentifier = normalizeRegNumber(identifier);
  return (state.data.users || []).find(u => {
    if (!u || typeof u.reg_number !== 'string') return false;
    if (u.id === identifier) return true;
    if (normalizeRegNumber(u.id || '') === normalizedIdentifier) return true;
    if (normalizeRegNumber(u.reg_number || '') === normalizedIdentifier) return true;
    return false;
  });
}

async function expireOldSessions() {
  const now = new Date();
  let changed = false;
  if (!Array.isArray(state.data.sessions)) state.data.sessions = [];
  state.data.sessions.forEach(session => {
    if (session && session.status === 'active') {
      const endTime = new Date(session.end_time || session.created_at || session.created_at);
      if (!isNaN(endTime.getTime()) && now > endTime) {
        session.status = 'expired';
        session.expired_at = now.toISOString();
        changed = true;
      }
    }
  });
  if (changed) await write();
  return changed;
}

async function expireOldLocations() {
  const now = new Date();
  let changed = false;
  if (!Array.isArray(state.data.geo_locations)) state.data.geo_locations = [];
  state.data.geo_locations.forEach(location => {
    if (location && location.is_active) {
      const activatedAt = location.activated_at ? new Date(location.activated_at) : new Date(location.created_at || 0);
      if (!isNaN(activatedAt.getTime()) && now - activatedAt > 30 * 60 * 1000) {
        location.is_active = false;
        changed = true;
      }
    }
  });
  if (changed) await write();
  return changed;
}

const DEFAULT_LIVENESS_ENTROPY_THRESHOLD = parseFloat(process.env.LIVENESS_ENTROPY_THRESHOLD || '1.2');

function createDeterministicEmbedding(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const hash = crypto.createHash('sha256').update(buffer).digest();
  const embedding = new Array(128).fill(0).map((_, idx) => ((hash[idx % hash.length] || 0) / 255 - 0.5) * 2);
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? embedding.map(value => value / norm) : embedding;
}

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const toRad = (d) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getSecuritySettings() {
  await read();
  return state.data.security_settings || {
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    minPasswordLength: 6,
    sessionTimeout: 60,
    enforceMFA: true
  };
}

async function logActivity(reg_number, action, req) {
  if (!state.data.activity_logs) state.data.activity_logs = [];
  state.data.activity_logs.unshift({
    id: nanoid(),
    reg_number,
    action,
    timestamp: new Date().toISOString(),
    ip: req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress || 'unknown',
    user_agent: req?.headers['user-agent'] || 'unknown'
  });
  if (state.data.activity_logs.length > 1000) {
    state.data.activity_logs = state.data.activity_logs.slice(0, 1000);
  }
  await write();
}

module.exports = {
  DEFAULT_DB_STATE,
  state,
  initDb,
  read,
  write,
  getState,
  findUserByRegNumber,
  findUserByIdentifier,
  getSecuritySettings,
  logActivity,
  seedAdminAccount,
  expireOldSessions,
  expireOldLocations,
  hashPassword,
  hashBuffer,
  validateRegNumber,
  normalizeRegNumber,
  analyzeImageLiveness,
  euclideanDistance,
  haversineMeters,
  JWT_SECRET: process.env.JWT_SECRET || 'supersecretjwtkey',
  jwt,
  nanoid
};
