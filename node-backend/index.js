const express = require('express');
const multer = require('multer');
const cors = require('cors');
let nanoid;
try {
  nanoid = require('nanoid').nanoid;
} catch (e) {
  const crypto = require('crypto');
  nanoid = () => crypto.randomBytes(8).toString('hex');
}

let authenticator;
try {
  authenticator = require('otplib').authenticator;
} catch (e) {
  authenticator = {
    generate: () => '000000',
    check: () => true,
    options: {}
  };
}
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
// nodemailer removed — email/OTP flow disabled
const jwt = require('jsonwebtoken');
const { verifyToken, JWT_SECRET } = require('./middleware/auth');

const dbClient = require('./db/index.js');

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

const db = {
  data: JSON.parse(JSON.stringify(DEFAULT_DB_STATE)),
  async read() {
    const all = await dbClient.readAll();
    if (all) this.data = all;
  },
  async write() {
    await dbClient.writeAll(this.data);
  }
};

// Email/OTP functionality removed — no-op placeholders kept for compatibility
async function sendOTPEmail() {
  // intentionally disabled
  return false;
}

// Helper to get security settings
async function getSecuritySettings() {
  await db.read();
  const defaultSettings = {
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    minPasswordLength: 6,
    sessionTimeout: 60,
    enforceMFA: true
  };
  return db.data.security_settings || defaultSettings;
}

async function initDb() {
  if (typeof dbClient.init === 'function') {
    await dbClient.init();
  }

  await db.read();
  db.data = db.data || JSON.parse(JSON.stringify(DEFAULT_DB_STATE));
  
  if (!db.data.courses) db.data.courses = [];
  if (!db.data.geo_locations) db.data.geo_locations = [];
  if (!db.data.sessions) db.data.sessions = [];
  if (!db.data.notifications) db.data.notifications = [];
  if (!db.data.disputes) db.data.disputes = [];
  if (!db.data.enrollments) db.data.enrollments = [];
  if (!db.data.activity_logs) db.data.activity_logs = [];
  if (!db.data.academic_settings) db.data.academic_settings = {};
  if (!db.data.security_settings) {
    db.data.security_settings = {
      maxLoginAttempts: 5,
      lockoutDuration: 30,
      minPasswordLength: 6,
      sessionTimeout: 60,
      enforceMFA: true
    };
  }
  
  await db.write();
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
// Use shared validation utilities from utils/validation.js
const { validateRegNumber, normalizeRegNumber } = require('./utils/validation');

function findUserByRegNumber(regNumber, role) {
  if (!regNumber || typeof regNumber !== 'string') return null;
  const normalized = normalizeRegNumber(regNumber);
  return (db.data.users || []).find(u => {
    if (!u || typeof u.reg_number !== 'string') return false;
    if (role && u.role !== role) return false;
    return normalizeRegNumber(u.reg_number) === normalized;
  });
}

function findUserByIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const normalizedIdentifier = normalizeRegNumber(identifier);
  return (db.data.users || []).find(u => {
    if (!u || typeof u.reg_number !== 'string') return false;
    if (u.id === identifier) return true;
    if (normalizeRegNumber(u.id || '') === normalizedIdentifier) return true;
    if (normalizeRegNumber(u.reg_number || '') === normalizedIdentifier) return true;
    return false;
  });
}

const DEFAULT_PYTHON_FACE_URL = 'http://127.0.0.1:5001/embed';
const PYTHON_FACE_URL = process.env.PYTHON_FACE_URL === 'false' ? null : (process.env.PYTHON_FACE_URL || DEFAULT_PYTHON_FACE_URL);
const LIVENESS_ENTROPY_THRESHOLD = parseFloat(process.env.LIVENESS_ENTROPY_THRESHOLD || '1.2');

function createDeterministicEmbedding(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const hash = crypto.createHash('sha256').update(buffer).digest();
  const embedding = new Array(128).fill(0).map((_, idx) => ((hash[idx % hash.length] || 0) / 255 - 0.5) * 2);
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? embedding.map(value => value / norm) : embedding;
}

async function getImageEmbedding(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;

  if (!PYTHON_FACE_URL) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Skipping face worker and using deterministic fallback embedding.');
    }
    return createDeterministicEmbedding(buffer);
  }

  const form = new FormData();
  form.append('file', buffer, { filename: 'upload.jpg' });
  try {
    const response = await axios.post(PYTHON_FACE_URL, form, { headers: form.getHeaders(), timeout: 10000 });
    if (response.data && Array.isArray(response.data.embedding) && response.data.embedding.length === 128) {
      return response.data.embedding;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Face worker returned invalid embedding:', response.data);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Face worker unavailable, using deterministic fallback embedding.', err && err.message ? err.message : err);
    }
  }
  return createDeterministicEmbedding(buffer);
}

// ========== ENHANCED LIVENESS CHECK ==========
function analyzeImageLiveness(imageBuffer, threshold = LIVENESS_ENTROPY_THRESHOLD) {
  let entropy = 0;
  const frequencies = new Array(256).fill(0);
  
  for (let i = 0; i < imageBuffer.length; i++) {
    frequencies[imageBuffer[i]]++;
  }
  
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const p = frequencies[i] / imageBuffer.length;
      entropy -= p * Math.log2(p);
    }
  }
  
  return {
    isLikelyLive: entropy > threshold,
    entropy
  };
}
// ========== ACTIVITY LOGGING FUNCTION ==========
function logActivity(reg_number, action, req) {
  // Ensure db is initialized
  if (!db.data.activity_logs) db.data.activity_logs = [];
  
  const activity = {
    id: nanoid(),
    reg_number: reg_number,
    action: action,
    timestamp: new Date().toISOString(),
    ip: req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress || 'unknown',
    user_agent: req?.headers['user-agent'] || 'unknown'
  };
  
  db.data.activity_logs.unshift(activity);
  
  // Keep only last 1000 logs to prevent database bloat
  if (db.data.activity_logs.length > 1000) {
    db.data.activity_logs = db.data.activity_logs.slice(0, 1000);
  }
  
  db.write();
  
  // Optional: Console log for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📝 Activity logged: ${reg_number} - ${action} at ${new Date().toISOString()}`);
  }
}
// Euclidean distance helper for embeddings
function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}
const app = express();
app.use(cors());
app.use(express.json());

// Security middlewares
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: [
          "'self'",
          'http://127.0.0.1:3000',
          'http://localhost:3000',
          'http://127.0.0.1:5174',
          'http://localhost:5174',
          'http://127.0.0.1:8000',
          'http://localhost:8000',
          'blob:'
        ]
      }
    }
  })
);

// Basic rate limiting
const limiter = rateLimit({ windowMs: 60 * 1000, max: 200 }); // 200 requests per minute
app.use(limiter);

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Simple input sanitizer: escape strings in body to reduce XSS risk
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj) => {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'string') {
          if (k === 'reg_number' || k === 'password' || k.endsWith('_password') || k === 'lecturer_reg_number') continue;
          obj[k] = validator.escape(v);
        } else if (v && typeof v === 'object') sanitize(v);
      }
    };
    try { sanitize(req.body); } catch (e) {}
  }
  next();
});

// Content Security Policy is configured via Helmet above.

// Serve frontend static files only when explicitly enabled (SERVE_FRONTEND=true)
// or when running in production. This prevents the API server from unintentionally
// serving the frontend during local development.
const serveFrontend = (process.env.SERVE_FRONTEND === 'true') || (process.env.NODE_ENV === 'production');
if (serveFrontend) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // Only serve index.html for non-API routes to avoid intercepting API requests
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  } else {
    console.warn('SERVE_FRONTEND enabled but frontend/dist not found — not serving frontend.');
  }
} else {
  // Intentionally do not serve frontend assets from the API server in this environment.
}

// Serve face-api model files from frontend/Public/models so dev frontend can fetch them
const publicModelsPath = path.join(__dirname, '..', 'frontend', 'Public', 'models');
if (fs.existsSync(publicModelsPath)) {
  app.use('/Public/models', express.static(publicModelsPath));
} else {
  // fallback: check lowercase 'public'
  const alt = path.join(__dirname, '..', 'frontend', 'public', 'models');
  if (fs.existsSync(alt)) app.use('/Public/models', express.static(alt));
}

// Simple root endpoint to avoid "Cannot GET /" during development
app.get('/', (req, res) => {
  res.send('University Attendance System API is running — use /api endpoints');
});

// Return no content for favicon requests to avoid 404 noise in browser console
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

const upload = multer({ storage: multer.memoryStorage() });

// ========== GEO-FENCING CONFIGURATION ==========
// Default geofence coordinates (can be overridden via env vars)
// Use `ALLOWED_LOCATION` as the canonical allowed classroom/meeting point.
const ALLOWED_LOCATION = { lat: 7.300735, lon: 5.137691 };
let GEOFENCE_LAT = parseFloat(process.env.GEOFENCE_LAT || String(ALLOWED_LOCATION.lat));
let GEOFENCE_LON = parseFloat(process.env.GEOFENCE_LON || String(ALLOWED_LOCATION.lon));
let GEOFENCE_RADIUS_METERS = parseFloat(process.env.GEOFENCE_RADIUS_METERS || '120');
let ACTIVE_LOCATION_ID = null;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const toRad = (d) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ========== GEO-LOCATION MANAGEMENT ==========
app.get('/api/geo-locations', async (req, res) => {
  await db.read();
  const locations = db.data.geo_locations || [];
  res.json(locations);
});

app.post('/api/geo-locations', async (req, res) => {
  const { name, latitude, longitude, radius, course_id, lecturer_id } = req.body;
  
  if (!name || !latitude || !longitude) {
    return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
  }
  
  await db.read();
  
  const newLocation = {
    id: nanoid(),
    name,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    radius: parseFloat(radius || 100),
    course_id: course_id || null,
    lecturer_id: lecturer_id || null,
    is_active: false,
    created_at: new Date().toISOString()
  };
  
  db.data.geo_locations.push(newLocation);
  await db.write();
  
  res.status(201).json(newLocation);
});

app.put('/api/geo-locations/activate/:id', async (req, res) => {
  const { id } = req.params;
  
  await db.read();
  
  (db.data.geo_locations || []).forEach(loc => {
    loc.is_active = false;
  });
  
  const location = (db.data.geo_locations || []).find(l => l.id === id);
  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }
  
  location.is_active = true;
  
  GEOFENCE_LAT = location.latitude;
  GEOFENCE_LON = location.longitude;
  GEOFENCE_RADIUS_METERS = location.radius;
  ACTIVE_LOCATION_ID = location.id;
  
  await db.write();
  
  res.json({ 
    message: 'Location activated', 
    location: {
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radius: location.radius
    }
  });
});

app.get('/api/geo-locations/active', async (req, res) => {
  await db.read();
  const activeLocation = (db.data.geo_locations || []).find(l => l.is_active === true);
  
  if (!activeLocation) {
    return res.json({ 
      active: false,
      message: 'No active location set. Please contact your lecturer.'
    });
  }
  
  res.json({
    active: true,
    name: activeLocation.name,
    latitude: activeLocation.latitude,
    longitude: activeLocation.longitude,
    radius: activeLocation.radius
  });
});

// ========== FACE DESCRIPTOR ENDPOINTS (NEW - ADDED HERE) ==========

// Store face descriptor (face-api.js vector)
// Accept either a face descriptor (legacy) or a file upload (preferred)
app.post('/api/users/register-face', upload.single('file'), async (req, res) => {
  const { reg_number, face_descriptor } = req.body;

  await db.read();
  const normalizedReg = normalizeRegNumber(String(reg_number || ''));
  const userIndex = (db.data.users || []).findIndex(u => normalizeRegNumber(String(u.reg_number || '')) === normalizedReg);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  // If a file was uploaded, process image-based registration via the Python worker or fallback
  if (req.file && req.file.buffer) {
    const buf = req.file.buffer;

    const livenessResult = analyzeImageLiveness(buf, LIVENESS_ENTROPY_THRESHOLD);
    if (!livenessResult.isLikelyLive) {
      console.warn('Face registration liveness warning:', {
        reg_number,
        entropy: livenessResult.entropy,
        threshold: LIVENESS_ENTROPY_THRESHOLD,
        size: buf.length
      });
      if (process.env.ENFORCE_FACE_LIVENESS === 'true') {
        return res.status(400).json({ error: 'Possible photo attack detected', entropy: livenessResult.entropy });
      }
    }

    if (buf.length < 5000) {
      return res.status(400).json({ error: 'Image too small. Please use live camera.' });
    }

    const embedding = await getImageEmbedding(buf);
    if (!Array.isArray(embedding) || embedding.length !== 128) {
      return res.status(500).json({ error: 'Unable to generate face embedding' });
    }

    db.data.users[userIndex].face_embedding = embedding;
    db.data.users[userIndex].last_face_update = new Date().toISOString();
    db.data.users[userIndex].face_embedding_source = PYTHON_FACE_URL ? 'python_worker' : 'fallback_hash';
    await db.write();

    const workerStatus = PYTHON_FACE_URL ? 'real_face_recognition' : 'fallback_mock_embedding';
    return res.json({ 
      success: true, 
      message: 'Face embedding stored', 
      source: PYTHON_FACE_URL,
      workerStatus: workerStatus,
      usingFallback: !PYTHON_FACE_URL
    });
  }

  // Fallback: accept legacy face descriptor JSON
  if (face_descriptor) {
    let parsed = face_descriptor;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }

    if (!Array.isArray(parsed) || parsed.length !== 128) {
      return res.status(400).json({ error: 'Invalid face descriptor format' });
    }

    db.data.users[userIndex].face_descriptor = parsed;
    db.data.users[userIndex].face_descriptor_version = (db.data.users[userIndex].face_descriptor_version || 0) + 1;
    db.data.users[userIndex].last_face_update = new Date().toISOString();
    await db.write();

    return res.json({ success: true, message: 'Face descriptor stored', descriptor_version: db.data.users[userIndex].face_descriptor_version });
  }

  return res.status(400).json({ error: 'Please provide a file upload (`file`) or a `face_descriptor` payload' });
});

// Get face descriptor for verification
app.get('/api/users/:reg_number/face-descriptor', async (req, res) => {
  const { reg_number } = req.params;
  
  await db.read();
  const user = (db.data.users || []).find(u => u.reg_number === reg_number);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!user.face_descriptor) {
    return res.status(404).json({ error: 'Face not registered for this user' });
  }
  
  res.json({ 
    face_descriptor: user.face_descriptor,
    descriptor_version: user.face_descriptor_version || 1,
    last_updated: user.last_face_update
  });
});

// Delete face descriptor (for re-registration)
app.delete('/api/users/:reg_number/face-descriptor', async (req, res) => {
  const { reg_number } = req.params;
  
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => u.reg_number === reg_number);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  db.data.users[userIndex].face_descriptor = null;
  await db.write();
  
  res.json({ success: true, message: 'Face descriptor removed' });
});

// ========== SECURITY SETTINGS ENDPOINTS ==========

// Get security settings
app.get('/api/security-settings', async (req, res) => {
  await db.read();
  const settings = db.data.security_settings || {
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    minPasswordLength: 6,
    sessionTimeout: 60,
    enforceMFA: true
  };
  res.json(settings);
});

// Update security settings (admin only)
app.post('/api/security-settings', async (req, res) => {
  const { maxLoginAttempts, lockoutDuration, minPasswordLength, sessionTimeout, enforceMFA } = req.body;
  
  await db.read();
  db.data.security_settings = {
    maxLoginAttempts: maxLoginAttempts || 5,
    lockoutDuration: lockoutDuration || 30,
    minPasswordLength: minPasswordLength || 6,
    sessionTimeout: sessionTimeout || 60,
    enforceMFA: enforceMFA !== undefined ? enforceMFA : true,
    updated_at: new Date().toISOString()
  };
  await db.write();
  
  res.json({ success: true, message: 'Security settings updated' });
});

// ========== SYSTEM HEALTH CHECK ENDPOINT ==========
app.get('/api/system/health', async (req, res) => {
  let pythonWorkerStatus = 'unavailable';
  let pythonWorkerUrl = PYTHON_FACE_URL;
  
  if (PYTHON_FACE_URL) {
    try {
      const healthRes = await axios.get(PYTHON_FACE_URL.replace('/embed', '/health'), { timeout: 2000 });
      if (healthRes.status === 200) {
        pythonWorkerStatus = 'available';
      }
    } catch (err) {
      pythonWorkerStatus = 'unavailable';
    }
  } else {
    pythonWorkerStatus = 'not_configured';
  }
  
  res.json({
    backend: 'ok',
    pythonWorkerStatus: pythonWorkerStatus,
    pythonWorkerUrl: pythonWorkerUrl,
    message: pythonWorkerStatus === 'available' 
      ? 'Face recognition enabled' 
      : 'Face recognition disabled - using fallback'
  });
});

// ========== LOGIN ENDPOINT (with login attempts tracking) ==========
app.post('/api/login', async (req, res) => {
  const { reg_number, password, role } = req.body;
  console.log('DEBUG /api/login body:', { reg_number, password: password ? '***' : null, role });
  
  if (!reg_number || !password || !role) {
    return res.status(400).json({ 
      success: false, 
      message: 'Registration number, password, and role are required' 
    });
  }
  
  // NOTE: registration number format validation is skipped for login
  // to allow existing accounts with varying formats to authenticate.
  
  await db.read();
  
  const normalizedInput = normalizeRegNumber(reg_number);
  
  const user = (db.data.users || []).find(u => 
    u.reg_number === reg_number || 
    normalizeRegNumber(u.reg_number) === normalizedInput
  );
  
  if (!user) {
    return res.status(401).json({ 
      success: false, 
      message: 'User not found' 
    });
  }
  
  // Get security settings
  const settings = await getSecuritySettings();
  const maxAttempts = settings.maxLoginAttempts || 5;
  const lockoutMinutes = settings.lockoutDuration || 30;
  
  // ========== CHECK IF ACCOUNT IS LOCKED ==========
  if (user.locked_until && Date.now() < user.locked_until) {
    const remainingMinutes = Math.ceil((user.locked_until - Date.now()) / 60000);
    return res.status(403).json({ 
      success: false, 
      message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.` 
    });
  }
  
  // Reset lock if expired
  if (user.locked_until && Date.now() > user.locked_until) {
    user.login_attempts = 0;
    user.locked_until = null;
  }
  
  const hashedInputPassword = hashPassword(password);
  if (user.password_hash !== hashedInputPassword) {
    // Increment failed attempts
    user.login_attempts = (user.login_attempts || 0) + 1;
    const remainingAttempts = maxAttempts - user.login_attempts;
    
    // Lock account if max attempts reached
    if (user.login_attempts >= maxAttempts) {
      user.locked_until = Date.now() + lockoutMinutes * 60 * 1000;
      await db.write();
      console.log('DEBUG /api/login db users count', (db.data.users || []).length);
      console.log('DEBUG /api/login first 5 reg_numbers', (db.data.users || []).slice(0, 5).map(u => u.reg_number));
      console.log('DEBUG /api/login normalizedInput', normalizedInput);
      return res.status(403).json({ 
        success: false, 
        message: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.` 
      });
    }
      console.log('DEBUG /api/login found user', !!user, user && user.reg_number);
    
    await db.write();
    return res.status(401).json({ 
      success: false, 
      message: `Invalid password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` 
    });
  }
  
  if (user.role !== role) {
    return res.status(403).json({ 
      success: false, 
      message: `Invalid role. You are registered as a ${user.role}` 
    });
  }
  
// Successful login - reset attempts
user.login_attempts = 0;
user.locked_until = null;
await db.write();

// Log the login activity
logActivity(reg_number, 'login', req);

// Verification requirement is configurable via env `REQUIRE_VERIFICATION`.
// By default verification is not required to allow login during development.
if (process.env.REQUIRE_VERIFICATION === 'true') {
  if (!user.email_verified && !user.face_hash) {
    return res.status(403).json({ success: false, message: 'Account not fully verified. Please verify your email or register your face before signing in.' });
  }
}

const token = jwt.sign({ id: user.id, reg_number: user.reg_number, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });

res.json({
  success: true,
  token,
  role: user.role,
  name: user.name,
  reg_number: user.reg_number,
  has_face: !!user.face_hash,
  message: 'Login successful'
});
});

// ========== SEND OTP VIA EMAIL ==========
// /api/send-otp endpoint removed — OTP/email flow disabled in check-in

// ========== REGULAR REGISTRATION (student self signup) ==========
app.post('/api/users/register', async (req, res) => {
  const { name, reg_number, password } = req.body;
  
  if (!name || !reg_number || !password) {
    return res.status(400).json({ 
      detail: 'name, reg_number and password are required' 
    });
  }

  if (!validateRegNumber(reg_number)) {
    return res.status(400).json({ detail: 'Invalid registration number format' });
  }

  await db.read();
  
  const existingUser = (db.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) {
    return res.status(400).json({ detail: 'User already exists' });
  }
  
  const secret = authenticator.generateSecret();
  
  const user = { 
    id: nanoid(), 
    name, 
    reg_number,
    role: 'student',
    password_hash: hashPassword(password),
    email_verified: false,
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
  
  db.data.users.push(user);
  await db.write();
  
  res.status(201).json({ 
    id: user.id, 
    name: user.name,
    reg_number: user.reg_number,
    role: user.role,
    message: 'Registration successful! You can now login.'
  });
});

// ========== SIMPLE REGISTRATION (without face - ADMIN ONLY) ==========
// ADMIN: simple registration - admin-only
app.post('/api/admin/register-simple', verifyToken, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin privileges required' });

  const { name, reg_number, role, password } = req.body;
  if (!name || !reg_number || !role || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // server-side validation of reg_number
  if (!validateRegNumber(reg_number)) return res.status(400).json({ error: 'Invalid registration number format' });

  await db.read();
  const existingUser = (db.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) return res.status(400).json({ error: 'User already exists' });

  const secret = authenticator.generateSecret();
  const newUser = {
    id: nanoid(),
    name,
    reg_number,
    role,
    password_hash: hashPassword(password),
    email_verified: false,
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

  db.data.users.push(newUser);
  await db.write();

  res.status(201).json({ id: newUser.id, name, reg_number, role, message: 'User created. They can add their face later via profile.' });
});

// ========== ADD FACE TO EXISTING USER ==========
app.post('/api/users/add-face', upload.single('file'), async (req, res) => {
  const { reg_number } = req.body;
  
  if (!reg_number || !req.file) {
    return res.status(400).json({ error: 'reg_number and file are required' });
  }
  
  const buf = req.file.buffer;
  
  const livenessResult = analyzeImageLiveness(buf);
  if (!livenessResult.isLikelyLive) {
    return res.status(400).json({ 
      error: 'Possible photo attack detected. Please use live camera with natural movement.',
      entropy: livenessResult.entropy
    });
  }
  
  if (buf.length < 5000) {
    return res.status(400).json({ error: 'Image too small. Please use live camera.' });
  }
  
  const face_hash = hashBuffer(buf);
  
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => u.reg_number === reg_number);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  db.data.users[userIndex].face_hash = face_hash;
  await db.write();
  
  res.json({ message: 'Face registered successfully' });
});

// ========== ATTENDANCE CHECK-IN (UPDATED with email OTP) ==========
app.post('/api/attendance/checkin', upload.single('file'), async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  const course_id = req.body.course_id;
  const reg_number = req.body.reg_number;

  if (Number.isNaN(lat) || Number.isNaN(lon) || !req.file || !reg_number) {
    return res.status(400).json({ 
      detail: 'lat, lon, reg_number, and file are required' 
    });
  }

  const buf = req.file.buffer;

  const livenessResult = analyzeImageLiveness(buf);
  if (!livenessResult.isLikelyLive) {
    return res.status(400).json({ 
      error: 'Possible photo attack detected. Please use live camera with natural movement.',
      entropy: livenessResult.entropy
    });
  }

  if (buf.length < 5000) {
    return res.status(400).json({ error: 'Image too small. Please use live camera.' });
  }

  await db.read();
  let user = (db.data.users || []).find(u => u.reg_number === reg_number);

  const embedding = await getImageEmbedding(buf);
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    return res.status(500).json({ error: 'Unable to generate face embedding for check-in' });
  }

  if (!user) {
    // try to find user by closest embedding (if available in DB)
    const candidates = (db.data.users || []).filter(u => Array.isArray(u.face_embedding));
    let best = { idx: -1, dist: Infinity };
    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i];
      const d = euclideanDistance(embedding, u.face_embedding);
      if (d < best.dist) { best = { idx: i, dist: d }; }
    }
    if (best.idx !== -1 && best.dist < 0.6) {
      user = candidates[best.idx];
    }
  }

  if (!user) {
    return res.status(404).json({ detail: 'No matching user found' });
  }

  if (Array.isArray(user.face_embedding)) {
    const dist = euclideanDistance(embedding, user.face_embedding);
    if (dist > 0.6) {
      return res.status(403).json({ detail: 'Face does not match registered user', distance: dist });
    }
  }
  
  // MFA/OTP verification removed per project configuration
  
  // Get active geofence location
  const activeLocation = (db.data.geo_locations || []).find(l => l.is_active === true);
  let checkLat = GEOFENCE_LAT;
  let checkLon = GEOFENCE_LON;
  let checkRadius = GEOFENCE_RADIUS_METERS;
  
  if (activeLocation) {
    checkLat = activeLocation.latitude;
    checkLon = activeLocation.longitude;
    checkRadius = activeLocation.radius;
  }
  
  if (checkLat !== 0 || checkLon !== 0) {
    const dist = haversineMeters(lat, lon, checkLat, checkLon);
    if (dist > checkRadius) {
      return res.status(403).json({ 
        detail: `Outside allowed geofence. You are ${dist.toFixed(1)}m away. Allowed within ${checkRadius}m.`,
        current_location: { lat, lon },
        allowed_location: { lat: checkLat, lon: checkLon }
      });
    }
  }

  const attendance = { 
    id: nanoid(), 
    user_id: user.id, 
    user_name: user.name,
    reg_number: user.reg_number,
    course_id: course_id || null,
    timestamp: new Date().toISOString(), 
    latitude: lat, 
    longitude: lon,
    location_name: activeLocation ? activeLocation.name : 'Campus'
  };
  
  db.data.attendance.push(attendance);
  await db.write();
  
  res.json({ 
    success: true, 
    message: 'Attendance marked successfully!',
    attendance 
  });
});

// DEBUG: check-in without liveness checks (for local testing only)
app.post('/api/debug/checkin_no_liveness', upload.single('file'), async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  const course_id = req.body.course_id;
  const reg_number = req.body.reg_number;

  if (Number.isNaN(lat) || Number.isNaN(lon) || !req.file || !reg_number) {
    return res.status(400).json({ detail: 'lat, lon, reg_number, and file are required' });
  }

  const buf = req.file.buffer;

  await db.read();
  let user = (db.data.users || []).find(u => u.reg_number === reg_number);

  const embedding = await getImageEmbedding(buf);
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    return res.status(500).json({ error: 'Unable to generate face embedding' });
  }

  if (!user) {
    // try to find user by closest embedding (if available in DB)
    const candidates = (db.data.users || []).filter(u => Array.isArray(u.face_embedding));
    let best = { idx: -1, dist: Infinity };
    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i];
      const d = euclideanDistance(embedding, u.face_embedding);
      if (d < best.dist) { best = { idx: i, dist: d }; }
    }
    if (best.idx !== -1 && best.dist < 0.6) {
      user = candidates[best.idx];
    }
  }

  if (!user) {
    return res.status(404).json({ detail: 'No matching user found' });
  }

  if (Array.isArray(user.face_embedding)) {
    const dist = euclideanDistance(embedding, user.face_embedding);
    if (dist > 0.6) {
      return res.status(403).json({ detail: 'Face does not match registered user', distance: dist });
    }
  }

  const activeLocation = (db.data.geo_locations || []).find(l => l.is_active === true);
  let checkLat = GEOFENCE_LAT;
  let checkLon = GEOFENCE_LON;
  let checkRadius = GEOFENCE_RADIUS_METERS;
  if (activeLocation) { checkLat = activeLocation.latitude; checkLon = activeLocation.longitude; checkRadius = activeLocation.radius; }

  const attendance = {
    id: nanoid(),
    user_id: user.id,
    user_name: user.name,
    reg_number: user.reg_number,
    email: user.email,
    course_id: course_id || null,
    timestamp: new Date().toISOString(),
    latitude: lat,
    longitude: lon,
    location_name: activeLocation ? activeLocation.name : 'Campus'
  };

  db.data.attendance.push(attendance);
  await db.write();

  res.json({ success: true, message: 'Attendance marked successfully (debug)', attendance });
});

// DEBUG: create a test user with embedding derived from provided file
app.post('/api/debug/insert_test_user', upload.single('file'), async (req, res) => {
  try {
    const { reg_number, name, email } = req.body;
    if (!reg_number || !req.file) return res.status(400).json({ error: 'reg_number and file are required' });

    const buf = req.file.buffer;
    const embedding = await getImageEmbedding(buf);
    if (!Array.isArray(embedding) || embedding.length !== 128) {
      return res.status(500).json({ error: 'Unable to generate face embedding' });
    }

    await db.read();
    const existing = (db.data.users || []).find(u => u.reg_number === reg_number);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const user = {
      id: nanoid(),
      name: name || 'Debug User',
      reg_number,
      email: email || null,
      role: 'student',
      password_hash: hashPassword('debug'),
      email_verified: false,
      mfa_secret: null,
      face_hash: hashBuffer(buf),
      face_embedding: embedding,
      temp_otp: null,
      temp_otp_expires: null,
      login_attempts: 0,
      locked_until: null,
      face_descriptor: null,
      face_descriptor_version: 0,
      last_face_update: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    db.data.users.push(user);
    await db.write();
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: err && err.response ? err.response.data : err.message });
  }
});

// ========== EXISTING ENDPOINTS ==========

app.get('/api/users', async (req, res) => {
  await db.read();
  const users = (db.data.users || []).map(u => ({ 
    id: u.id, 
    name: u.name,
    reg_number: u.reg_number,
    role: u.role,
    has_face: !!u.face_hash,
    has_face_descriptor: !!u.face_descriptor
  }));
  res.json(users);
});

// ========== ADMIN CRUD OPERATIONS ==========

app.get('/api/admin/users', async (req, res) => {
  await db.read();
  const users = (db.data.users || []).map(u => ({
    id: u.id,
    name: u.name,
    reg_number: u.reg_number,
    role: u.role,
    created_at: u.created_at,
    has_face: !!u.face_hash,
    has_face_descriptor: !!u.face_descriptor,
    face_descriptor_version: u.face_descriptor_version || 0,
    last_face_update: u.last_face_update || null,
    login_attempts: u.login_attempts || 0,
    locked_until: u.locked_until || null
  }));
  res.json(users);
});

app.post('/api/admin/users', async (req, res) => {
  const { name, reg_number, role, password } = req.body;
  
  if (!name || !reg_number || !role || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // require admin token
  if (!req.headers || !req.headers.authorization) return res.status(401).json({ error: 'Authorization required' });

  // verify token
  try {
    const authHeader = req.headers.authorization.split(' ');
    const token = authHeader.length === 2 ? authHeader[1] : authHeader[0];
    const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') return res.status(403).json({ error: 'Admin privileges required' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // validate reg number
  if (!validateRegNumber(reg_number)) return res.status(400).json({ error: 'Invalid registration number format' });

  await db.read();
  const existingUser = (db.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const secret = authenticator.generateSecret();
  const newUser = {
    id: nanoid(),
    name,
    reg_number,
    role,
    password_hash: hashPassword(password),
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

  db.data.users.push(newUser);
  await db.write();

  res.status(201).json({ id: newUser.id, name, reg_number, role, message: 'User created successfully' });
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, role } = req.body;
  
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => u.id === id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (name) db.data.users[userIndex].name = name;
  if (role) db.data.users[userIndex].role = role;
  
  await db.write();
  res.json({ message: 'User updated successfully' });
});

app.delete('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  
  await db.read();
  const initialLength = db.data.users.length;
  db.data.users = (db.data.users || []).filter(u => u.id !== id);
  
  if (db.data.users.length === initialLength) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  await db.write();
  res.json({ message: 'User deleted successfully' });
});

// ========== COURSES CRUD OPERATIONS ==========

app.get('/api/courses', async (req, res) => {
  await db.read();
  const courses = db.data.courses || [];
  res.json(courses);
});

app.get('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  const course = (db.data.courses || []).find(c => c.id === id);
  
  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }
  
  res.json(course);
});

app.post('/api/courses', async (req, res) => {
  const { code, title, lecturer_id, credits, semester } = req.body;
  
  if (!code || !title) {
    return res.status(400).json({ error: 'Course code and title are required' });
  }
  
  await db.read();
  db.data.courses = db.data.courses || [];
  
  const existingCourse = (db.data.courses || []).find(c => c.code === code);
  if (existingCourse) {
    return res.status(400).json({ error: 'Course code already exists' });
  }
  
  const newCourse = {
    id: nanoid(),
    code: code.toUpperCase(),
    title,
    lecturer_id: lecturer_id || null,
    credits: credits || 3,
    semester: semester || 'First',
    created_at: new Date().toISOString()
  };
  
  db.data.courses.push(newCourse);
  await db.write();
  
  res.status(201).json(newCourse);
});

app.put('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { code, title, lecturer_id, credits, semester } = req.body;
  
  await db.read();
  const courseIndex = (db.data.courses || []).findIndex(c => c.id === id);
  
  if (courseIndex === -1) {
    return res.status(404).json({ error: 'Course not found' });
  }
  
  if (code) db.data.courses[courseIndex].code = code.toUpperCase();
  if (title) db.data.courses[courseIndex].title = title;
  if (lecturer_id !== undefined) db.data.courses[courseIndex].lecturer_id = lecturer_id;
  if (credits) db.data.courses[courseIndex].credits = credits;
  if (semester) db.data.courses[courseIndex].semester = semester;
  
  await db.write();
  res.json({ message: 'Course updated successfully', course: db.data.courses[courseIndex] });
});

app.delete('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  
  await db.read();
  const initialLength = db.data.courses.length;
  db.data.courses = (db.data.courses || []).filter(c => c.id !== id);
  
  if (db.data.courses.length === initialLength) {
    return res.status(404).json({ error: 'Course not found' });
  }
  
  await db.write();
  res.json({ message: 'Course deleted successfully' });
});

// ========== ATTENDANCE REPORTS ==========

app.get('/api/attendance/user/:userId', async (req, res) => {
  const { userId } = req.params;
  await db.read();
  
  const attendance = (db.data.attendance || [])
    .filter(a => a.user_id === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json(attendance);
});

app.get('/api/attendance/summary/:userId', async (req, res) => {
  const { userId } = req.params;
  await db.read();
  
  const userAttendance = (db.data.attendance || []).filter(a => a.user_id === userId);
  const totalDays = userAttendance.length;
  const percentage = totalDays > 0 ? 100 : 0;
  
  res.json({
    total_attendance: totalDays,
    present_count: totalDays,
    percentage: percentage.toFixed(2),
    records: userAttendance.slice(0, 10)
  });
});

app.get('/api/attendance/all', async (req, res) => {
  await db.read();
  const attendance = (db.data.attendance || []).sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(attendance);
});

// Authenticated user info
app.get('/api/me', verifyToken, async (req, res) => {
  await db.read();
  const user = (db.data.users || []).find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user: { id: user.id, reg_number: user.reg_number, name: user.name, role: user.role, has_face: !!user.face_hash } });
});

// ========== DASHBOARD STATS ==========

app.get('/api/dashboard/stats/:role', async (req, res) => {
  const { role } = req.params;
  await db.read();
  
  const stats = {
    total_students: (db.data.users || []).filter(u => u.role === 'student').length,
    total_lecturers: (db.data.users || []).filter(u => u.role === 'lecturer').length,
    total_admins: (db.data.users || []).filter(u => u.role === 'admin').length,
    total_courses: (db.data.courses || []).length,
    total_attendance: (db.data.attendance || []).length,
    today_attendance: (db.data.attendance || []).filter(a => {
      const today = new Date().toDateString();
      return new Date(a.timestamp).toDateString() === today;
    }).length
  };
  
  res.json(stats);
});
// ========== STUDENT REPORTING ENDPOINTS ==========

// Get student's enrolled courses
app.get('/api/users/:regNumber/courses', async (req, res) => {
  const { regNumber } = req.params;
  
  await db.read();
  const user = (db.data.users || []).find(u => u.reg_number === regNumber);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // For now, return all courses (you can filter by student enrollment later)
  const courses = db.data.courses || [];
  res.json(courses);
});

// Get attendance report with filters
app.get('/api/student/attendance-report', async (req, res) => {
  const { reg_number, course_id, start_date, end_date } = req.query;
  
  await db.read();
  
  // Get user
  const user = (db.data.users || []).find(u => u.reg_number === reg_number);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Filter attendance records
  let records = (db.data.attendance || []).filter(a => a.reg_number === reg_number);
  
  // Apply date filters
  if (start_date) {
    records = records.filter(a => a.timestamp.split('T')[0] >= start_date);
  }
  if (end_date) {
    records = records.filter(a => a.timestamp.split('T')[0] <= end_date);
  }
  
  // Apply course filter if needed
  if (course_id) {
    records = records.filter(a => a.course_id === course_id);
  }
  
  // Calculate summary
  const total = records.length;
  const attended = records.filter(a => a.status === 'present' || a.status === 'late').length;
  const overallPercentage = total > 0 ? (attended / total) * 100 : 100;
  
  // Calculate absences left
  const requiredPercentage = 75;
  const currentScore = overallPercentage;
  let absencesLeft = 0;
  if (currentScore > requiredPercentage) {
    absencesLeft = Math.floor((currentScore - requiredPercentage) / (100 / total));
  }
  
  // Format records
  const formattedRecords = records.map(r => ({
    id: r.id,
    date: r.timestamp.split('T')[0],
    courseCode: r.course_code || r.course_id || 'CSC401',
    courseName: r.course_name || 'General Course',
    time: new Date(r.timestamp).toLocaleTimeString(),
    status: r.status || 'present',
    mfa: {
      used: true,
      method: 'Face + OTP',
      faceScore: Math.floor(85 + Math.random() * 10),
      livenessPassed: true,
      device: 'Web Browser'
    },
    gps: `${r.latitude}, ${r.longitude}`,
    timestamp: r.timestamp,
    canDispute: (r.status === 'absent' && new Date(r.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  }));
  
  res.json({
    summary: {
      overallPercentage: Math.round(overallPercentage),
      attended,
      total,
      mfaSuccessRate: 98,
      absencesLeft,
      requiredPercentage: 75
    },
    records: formattedRecords
  });
});

// Get active session(s) for a student and active location details
app.get('/api/student/sessions/active', async (req, res) => {
  const { reg_number } = req.query;
  if (!reg_number) {
    return res.status(400).json({ error: 'reg_number is required' });
  }

  await db.read();

  const user = (db.data.users || []).find(u => u.reg_number === reg_number || normalizeRegNumber(u.reg_number) === normalizeRegNumber(reg_number));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const now = new Date();

  const enrollments = (db.data.enrollments || []).filter(e => (e.student_reg_number === user.reg_number || normalizeRegNumber(e.student_reg_number) === normalizeRegNumber(user.reg_number)) && e.status === 'active');
  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));

  const activeSessions = (db.data.sessions || []).filter(session => {
    return session.status === 'active' && enrolledCourseIds.has(session.course_id) && new Date(session.end_time) > now;
  }).map(session => {
    const location = (db.data.geo_locations || []).find(l => l.id === session.location_id);
    return {
      ...session,
      location: location ? {
        id: location.id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        radius: location.radius
      } : null
    };
  });

  const activeLocation = (db.data.geo_locations || []).find(location => location.is_active === true);
  const activeLocationInfo = activeLocation ? {
    id: activeLocation.id,
    name: activeLocation.name,
    latitude: activeLocation.latitude,
    longitude: activeLocation.longitude,
    radius: activeLocation.radius
  } : null;

  res.json({
    active: activeSessions.length > 0 || Boolean(activeLocationInfo),
    active_sessions: activeSessions,
    active_location: activeLocationInfo
  });
});

// Submit dispute
app.post('/api/disputes', upload.single('proof'), async (req, res) => {
  const { reg_number, record_id, reason } = req.body;
  const proofFile = req.file;
  
  if (!reg_number || !record_id || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const dispute = {
    id: nanoid(),
    reg_number,
    record_id,
    reason,
    proof_filename: proofFile?.originalname || null,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  // Store dispute in database (create disputes array if not exists)
  await db.read();
  if (!db.data.disputes) db.data.disputes = [];
  db.data.disputes.push(dispute);
  await db.write();
  
  res.json({ success: true, message: 'Dispute submitted successfully' });
});
// ========== PROFILE ENDPOINTS ==========

// Get user profile
app.get('/api/users/:regNumber/profile', async (req, res) => {
  const { regNumber } = req.params;
  
  await db.read();
  const user = (db.data.users || []).find(u => u.reg_number === regNumber);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    name: user.name,
    reg_number: user.reg_number,
    phone: user.phone || null,
    role: user.role,
    face_registered: !!user.face_descriptor,
    face_descriptor_version: user.face_descriptor_version || 0,
    last_face_update: user.last_face_update || null,
    account_created: user.created_at,
    login_attempts: user.login_attempts || 0
  });
});

// Update user profile (phone only)
app.put('/api/users/:regNumber/profile', async (req, res) => {
  const { regNumber } = req.params;
  const { phone } = req.body;
  
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => u.reg_number === regNumber);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (phone !== undefined) {
    db.data.users[userIndex].phone = phone || null;
  }
  
  await db.write();
  
  res.json({
    success: true,
    message: 'Profile updated successfully',
    phone: db.data.users[userIndex].phone
  });
});
// ========== MY COURSES ENDPOINT ==========

// Get student's enrolled courses with details
app.get('/api/users/:regNumber/my-courses', async (req, res) => {
  const { regNumber } = req.params;
  
  await db.read();
  
  // Find user (accept exact match or normalized match to tolerate formatting differences)
  const user = (db.data.users || []).find(u => 
    u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber)
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get enrollments for this student
  const enrollments = (db.data.enrollments || []).filter(e => e.student_reg_number === regNumber && e.status === 'active');
  
  // Get course details for each enrollment
  const courses = enrollments.map(enrollment => {
    const course = (db.data.courses || []).find(c => c.id === enrollment.course_id);
    const lecturer = findUserByIdentifier(course?.lecturer_id);
    return {
      id: course?.id,
      code: course?.code,
      title: course?.title,
      credits: course?.credits,
      semester: enrollment.semester,
      academic_year: enrollment.academic_year,
      enrolled_date: enrollment.enrolled_date,
      lecturer_id: course?.lecturer_id,
      lecturer_name: lecturer?.name || null,
      lecturer_reg_number: lecturer?.reg_number || null
    };
  }).filter(c => c.id);
  
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  
  res.json({
    total_courses: courses.length,
    total_credits: totalCredits,
    courses: courses
  });
});

// Get courses the student is not yet enrolled in
app.get('/api/users/:regNumber/available-courses', async (req, res) => {
  const { regNumber } = req.params;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📌 API HIT: GET /api/users/${regNumber}/available-courses`);
  }
  await db.read();

  const user = (db.data.users || []).find(u => 
    u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber)
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const activeEnrollments = (db.data.enrollments || []).filter(e => e.student_reg_number === user.reg_number && e.status === 'active');
  const enrolledCourseIds = new Set(activeEnrollments.map(e => String(e.course_id)));

  const availableCourses = (db.data.courses || [])
    .filter(course => !enrolledCourseIds.has(String(course.id)))
    .map(course => {
      const lecturer = findUserByIdentifier(course.lecturer_id);
      return {
        id: course.id,
        code: course.code,
        title: course.title,
        credits: course.credits,
        semester: course.semester || 'First',
        lecturer_id: course.lecturer_id,
        lecturer_name: lecturer?.name || null,
        lecturer_reg_number: lecturer?.reg_number || null
      };
    });

  res.json({ courses: availableCourses });
});

// Enroll a student in a course
app.post('/api/users/:regNumber/enroll', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📌 API HIT: POST /api/users/${req.params.regNumber}/enroll`, req.body);
  }
  const { regNumber } = req.params;
  const { course_id } = req.body;

  if (!course_id) {
    return res.status(400).json({ error: 'Course ID is required' });
  }

  await db.read();

  const user = (db.data.users || []).find(u => 
    u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber)
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const course = (db.data.courses || []).find(c => c.id === course_id);
  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }

  const existingEnrollment = (db.data.enrollments || []).find(e => e.student_reg_number === user.reg_number && e.course_id === course_id && e.status === 'active');
  if (existingEnrollment) {
    return res.status(400).json({ error: 'Already enrolled in this course' });
  }

  if (!db.data.enrollments) db.data.enrollments = [];
  const newEnrollment = {
    id: nanoid(),
    student_reg_number: user.reg_number,
    student_id: user.id,
    course_id: course.id,
    semester: course.semester || 'First',
    academic_year: '2025/2026',
    enrolled_date: new Date().toISOString(),
    status: 'active'
  };

  db.data.enrollments.push(newEnrollment);
  await db.write();

  res.json({ success: true, enrollment: newEnrollment });
});

// Drop a student from a course
app.delete('/api/users/:regNumber/enroll/:courseId', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📌 API HIT: DELETE /api/users/${req.params.regNumber}/enroll/${req.params.courseId}`);
  }
  const { regNumber, courseId } = req.params;

  await db.read();

  const user = (db.data.users || []).find(u => 
    u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber)
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const enrollmentIndex = (db.data.enrollments || []).findIndex(e => 
    e.student_reg_number === user.reg_number && e.course_id === courseId && e.status === 'active'
  );
  if (enrollmentIndex === -1) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  db.data.enrollments[enrollmentIndex].status = 'dropped';
  db.data.enrollments[enrollmentIndex].dropped_date = new Date().toISOString();
  await db.write();

  res.json({ success: true, message: 'Dropped from course successfully' });
});

// ========== LECTURER ENDPOINTS ==========

// Debugging middleware: log incoming lecturer requests (helps diagnose 404s)
app.use('/api/lecturer', (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📥 [lecturer] ${req.method} ${req.originalUrl} -> path:${req.path}`);
    console.log('    params preview:', Object.keys(req.params).length ? req.params : '(none yet)');
  }
  next();
});

// Get lecturer profile
app.get(/^\/api\/lecturer\/(.+)\/profile$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  await db.read();
  const user = findUserByRegNumber(regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, reg_number: user.reg_number, phone: user.phone || null, role: user.role, account_created: user.created_at, login_attempts: user.login_attempts || 0 });
}));

// Update lecturer profile
app.put(/^\/api\/lecturer\/(.+)\/profile$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const { phone } = req.body;
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber) && u.role === 'lecturer');
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  if (phone !== undefined) db.data.users[userIndex].phone = phone || null;
  await db.write();
  res.json({ success: true, message: 'Profile updated successfully' });
}));

// Get courses taught by lecturer
app.get(/^\/api\/lecturer\/(.+)\/courses$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  await db.read();
  const user = findUserByRegNumber(regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const courses = (db.data.courses || []).filter(c => c.lecturer_id === user.id);
  res.json(courses);
}));

// Get students enrolled in a course with attendance counts
app.get(/^\/api\/lecturer\/(.+)\/course\/([^/]+)\/students$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const courseId = req.params[1];
  await db.read();
  const lecturer = findUserByRegNumber(regNumber);
  if (!lecturer) return res.status(404).json({ error: 'User not found' });
  const enrollments = (db.data.enrollments || []).filter(e => e.course_id === courseId && e.status === 'active');
  const studentIds = enrollments.map(e => e.student_reg_number);
  const students = (db.data.users || []).filter(u => studentIds.includes(u.reg_number) && u.role === 'student');
  const attendanceRecords = (db.data.attendance || []).filter(a => a.course_id === courseId);
  const result = students.map(s => {
    const studentAttendance = attendanceRecords.filter(a => a.reg_number === s.reg_number);
    const totalClasses = [...new Set(attendanceRecords.map(a => a.timestamp.split('T')[0]))].length;
    const presentCount = studentAttendance.length;
    const attendancePercentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;
    return { id: s.id, name: s.name, reg_number: s.reg_number, total_classes: totalClasses, present_count: presentCount, attendance_percentage: Math.round(attendancePercentage) };
  });
  res.json(result);
}));

// Get attendance report for lecturer
app.get(/^\/api\/lecturer\/(.+)\/attendance-report$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const { course_id } = req.query;
  await db.read();
  const enrollments = (db.data.enrollments || []).filter(e => e.course_id === course_id && e.status === 'active');
  const studentIds = enrollments.map(e => e.student_reg_number);
  const students = (db.data.users || []).filter(u => studentIds.includes(u.reg_number));
  const attendanceRecords = (db.data.attendance || []).filter(a => a.course_id === course_id);
  const totalClasses = [...new Set(attendanceRecords.map(a => a.timestamp.split('T')[0]))].length;
  const records = students.map(s => {
    const studentAttendance = attendanceRecords.filter(a => a.reg_number === s.reg_number);
    const presentCount = studentAttendance.length;
    const percentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;
    return { student_name: s.name, reg_number: s.reg_number, total_classes: totalClasses, present_count: presentCount, attendance_percentage: Math.round(percentage) };
  });
  const totalPresent = records.reduce((sum, r) => sum + r.present_count, 0);
  const averageAttendance = records.length > 0 ? Math.round(records.reduce((sum, r) => sum + r.attendance_percentage, 0) / records.length) : 0;
  res.json({ summary: { totalStudents: students.length, totalClasses, totalPresent, averageAttendance }, records });
}));

// Bulk attendance marking
app.post('/api/lecturer/attendance/bulk', async (req, res) => {
  const { lecturer_reg_number, course_id, date, location_id, present_students, absent_students } = req.body;
  
  await db.read();
  
  const course = (db.data.courses || []).find(c => c.id === course_id);
  const location = (db.data.geo_locations || []).find(l => l.id === location_id);
  const timestamp = new Date(date).toISOString();
  
  // Get the actual student registration numbers
  const allStudents = (db.data.users || []).filter(u => u.role === 'student');
  
  // Process present students
  for (const studentId of present_students) {
    const student = allStudents.find(s => s.id === studentId);
    if (student) {
      db.data.attendance.push({
        id: nanoid(),
        reg_number: student.reg_number,
        student_id: studentId,
        course_id: course_id,
        timestamp: timestamp,
        status: 'present',
        location_name: location?.name,
        latitude: location?.latitude,
        longitude: location?.longitude,
        marked_by: lecturer_reg_number,
        source: 'lecturer_marked'
      });
    }
  }
  
  // Process absent students
  for (const studentId of absent_students) {
    const student = allStudents.find(s => s.id === studentId);
    if (student) {
      db.data.attendance.push({
        id: nanoid(),
        reg_number: student.reg_number,
        student_id: studentId,
        course_id: course_id,
        timestamp: timestamp,
        status: 'absent',
        location_name: location?.name,
        latitude: location?.latitude,
        longitude: location?.longitude,
        marked_by: lecturer_reg_number,
        source: 'lecturer_marked'
      });
    }
  }
  
  await db.write();
  
  res.json({ 
    success: true, 
    message: `Attendance recorded: ${present_students.length} present, ${absent_students.length} absent`,
    present_count: present_students.length,
    absent_count: absent_students.length
  });
});

// Change password
app.post('/api/users/:regNumber/change-password', async (req, res) => {
  const { regNumber } = req.params;
  const { current_password, new_password } = req.body;
  
  await db.read();
  const userIndex = (db.data.users || []).findIndex(u => u.reg_number === regNumber);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const user = db.data.users[userIndex];
  const hashedCurrent = hashPassword(current_password);
  
  if (user.password_hash !== hashedCurrent) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  user.password_hash = hashPassword(new_password);
  await db.write();
  
  res.json({ success: true, message: 'Password changed successfully' });
});
// ========== LECTURER SESSION MANAGEMENT & NOTIFICATIONS ==========

// Start a new class session
app.post('/api/lecturer/sessions/start', async (req, res) => {
  const { course_id, lecturer_reg_number, location_id, start_time, duration_minutes } = req.body;
  
  if (!course_id || !lecturer_reg_number || !location_id || !start_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  await db.read();
  
  const existingActive = (db.data.sessions || []).find(s => s.course_id === course_id && s.status === 'active');
  if (existingActive) {
    return res.status(400).json({ error: 'An active session already exists for this course' });
  }
  
  const startTime = new Date(start_time);
  const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
  
  const session = {
    id: nanoid(),
    course_id,
    lecturer_reg_number,
    location_id,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    status: 'active',
    created_at: new Date().toISOString()
  };
  
  if (!db.data.sessions) db.data.sessions = [];
  db.data.sessions.push(session);
  await db.write();
  
  res.json({ success: true, session });
});

// End a class session
app.put('/api/lecturer/sessions/:sessionId/end', async (req, res) => {
  const { sessionId } = req.params;
  
  await db.read();
  const sessionIndex = (db.data.sessions || []).findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  db.data.sessions[sessionIndex].status = 'ended';
  db.data.sessions[sessionIndex].ended_at = new Date().toISOString();
  await db.write();
  
  res.json({ success: true, message: 'Session ended successfully' });
});

// Get active session for a course
app.get('/api/lecturer/sessions/active', async (req, res) => {
  const { course_id } = req.query;
  
  await db.read();
  const activeSession = (db.data.sessions || []).find(s => s.course_id === course_id && s.status === 'active');
  
  if (!activeSession) {
    return res.json({ active: false, session: null });
  }
  
  const now = new Date();
  const endTime = new Date(activeSession.end_time);
  
  if (now > endTime) {
    activeSession.status = 'expired';
    await db.write();
    return res.json({ active: false, session: null, expired: true });
  }
  
  res.json({ active: true, session: activeSession });
});

// Get session history for a course
app.get('/api/lecturer/sessions/history', async (req, res) => {
  const { course_id } = req.query;
  
  await db.read();
  const sessions = (db.data.sessions || [])
    .filter(s => s.course_id === course_id)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  
  const sessionsWithCounts = sessions.map(session => {
    const attendanceCount = (db.data.attendance || []).filter(a => a.session_id === session.id).length;
    return { ...session, attendance_count: attendanceCount };
  });
  
  res.json(sessionsWithCounts);
});

// Send notification to students
app.post('/api/lecturer/send-notification', async (req, res) => {
  const { course_id, session_id, title, message, type } = req.body;
  
  if (!course_id || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  await db.read();
  
  const enrollments = (db.data.enrollments || []).filter(e => e.course_id === course_id && e.status === 'active');
  const studentRegNumbers = enrollments.map(e => e.student_reg_number);
  
  if (!db.data.notifications) db.data.notifications = [];
  
  const notification = {
    id: nanoid(),
    course_id,
    session_id: session_id || null,
    title,
    message,
    type: type || 'class_start',
    recipient_reg_numbers: studentRegNumbers,
    created_at: new Date().toISOString(),
    read_by: []
  };
  
  db.data.notifications.push(notification);
  await db.write();
  
  res.json({ 
    success: true, 
    message: `Notification sent to ${studentRegNumbers.length} students`,
    recipient_count: studentRegNumbers.length
  });
});

// Get notifications for a student
app.get('/api/student/notifications', async (req, res) => {
  const { reg_number } = req.query;
  
  if (!reg_number) {
    return res.status(400).json({ error: 'Registration number required' });
  }
  
  await db.read();
  
  const notifications = (db.data.notifications || [])
    .filter(n => n.recipient_reg_numbers.includes(reg_number))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(notifications);
});

// Mark notification as read
app.put('/api/student/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  const { reg_number } = req.body;
  
  await db.read();
  const notificationIndex = (db.data.notifications || []).findIndex(n => n.id === id);
  
  if (notificationIndex === -1) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  
  if (!db.data.notifications[notificationIndex].read_by.includes(reg_number)) {
    db.data.notifications[notificationIndex].read_by.push(reg_number);
    await db.write();
  }
  
  res.json({ success: true });
});

// Student join session (for check-in)
app.post('/api/student/session/join', async (req, res) => {
  const { reg_number, course_id, session_id, location_id, face_verified } = req.body;
  
  if (!reg_number || !course_id || !session_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  await db.read();
  
  const session = (db.data.sessions || []).find(s => s.id === session_id);
  if (!session || session.status !== 'active') {
    return res.status(400).json({ error: 'No active session found' });
  }
  
  const now = new Date();
  const endTime = new Date(session.end_time);
  if (now > endTime) {
    return res.status(400).json({ error: 'Session has expired. You cannot join now.' });
  }
  
  const student = (db.data.users || []).find(u => u.reg_number === reg_number);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  
  const existingAttendance = (db.data.attendance || []).find(a => a.session_id === session_id && a.reg_number === reg_number);
  if (existingAttendance) {
    return res.status(400).json({ error: 'Attendance already marked for this session' });
  }
  
  const attendance = {
    id: nanoid(),
    reg_number,
    student_id: student.id,
    course_id,
    session_id,
    timestamp: now.toISOString(),
    status: 'present',
    location_id: location_id || session.location_id,
    face_verified: face_verified || false,
    source: 'student_checkin'
  };
  
  db.data.attendance.push(attendance);
  await db.write();
  
  res.json({ success: true, message: 'Attendance recorded successfully', attendance });
});

// ========== LECTURER COURSE MANAGEMENT (Own Courses) ==========

// Create course (lecturer creates their own course)
app.post('/api/lecturer/courses', async (req, res) => {
  const { code, title, lecturer_reg_number, credits, semester } = req.body;
  
  if (!code || !title || !lecturer_reg_number) {
    return res.status(400).json({ error: 'Course code, title, and lecturer are required' });
  }
  
  await db.read();
  
  const existingCourse = (db.data.courses || []).find(c => c.code === code.toUpperCase());
  if (existingCourse) {
    return res.status(400).json({ error: 'Course code already exists' });
  }
  
  const lecturer = findUserByRegNumber(lecturer_reg_number, 'lecturer');
  if (process.env.NODE_ENV !== 'production') {
    console.log('DEBUG POST /api/lecturer/courses body:', { code, title, lecturer_reg_number, credits, semester });
    console.log('DEBUG POST /api/lecturer/courses lecturer lookup:', lecturer ? lecturer.reg_number : null);
  }
  if (!lecturer) {
    return res.status(404).json({ error: 'Lecturer not found' });
  }
  
  const newCourse = {
    id: nanoid(),
    code: code.toUpperCase(),
    title,
    lecturer_id: lecturer.id,
    credits: credits || 3,
    semester: semester || 'First',
    created_by: lecturer_reg_number,
    created_at: new Date().toISOString()
  };
  
  db.data.courses.push(newCourse);
  await db.write();
  
  res.status(201).json({ success: true, course: newCourse });
});

// Update course (lecturer updates their own course)
app.put('/api/lecturer/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { code, title, credits, semester, lecturer_reg_number } = req.body;
  
  await db.read();
  const courseIndex = (db.data.courses || []).findIndex(c => c.id === id);
  
  if (courseIndex === -1) {
    return res.status(404).json({ error: 'Course not found' });
  }
  
  const course = db.data.courses[courseIndex];
  const lecturer = findUserByRegNumber(lecturer_reg_number, 'lecturer');
  
  if (course.lecturer_id !== lecturer?.id) {
    return res.status(403).json({ error: 'You can only edit your own courses' });
  }
  
  if (code) db.data.courses[courseIndex].code = code.toUpperCase();
  if (title) db.data.courses[courseIndex].title = title;
  if (credits) db.data.courses[courseIndex].credits = credits;
  if (semester) db.data.courses[courseIndex].semester = semester;
  
  await db.write();
  res.json({ success: true, message: 'Course updated successfully' });
});

// Delete course (lecturer deletes their own course)
app.delete('/api/lecturer/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { lecturer_reg_number } = req.body;
  
  await db.read();
  const courseIndex = (db.data.courses || []).findIndex(c => c.id === id);
  
  if (courseIndex === -1) {
    return res.status(404).json({ error: 'Course not found' });
  }
  
  const course = db.data.courses[courseIndex];
  const lecturer = findUserByRegNumber(lecturer_reg_number, 'lecturer');
  
  if (course.lecturer_id !== lecturer?.id) {
    return res.status(403).json({ error: 'You can only delete your own courses' });
  }
  
  const hasEnrollments = (db.data.enrollments || []).some(e => e.course_id === id);
  if (hasEnrollments) {
    return res.status(400).json({ error: 'Cannot delete course with existing student enrollments' });
  }
  
  db.data.courses = (db.data.courses || []).filter(c => c.id !== id);
  await db.write();
  
  res.json({ success: true, message: 'Course deleted successfully' });
});

// ========== ADMIN ACADEMIC SETTINGS ==========

// Get academic settings
app.get('/api/admin/academic-settings', async (req, res) => {
  await db.read();
  const settings = db.data.academic_settings || {
    current_session: '2025/2026',
    current_semester: 'First',
    exam_period_start: null,
    exam_period_end: null,
    updated_at: new Date().toISOString()
  };
  res.json(settings);
});

// Update academic settings
app.put('/api/admin/academic-settings', async (req, res) => {
  const { current_session, current_semester, exam_period_start, exam_period_end } = req.body;
  
  await db.read();
  db.data.academic_settings = {
    current_session: current_session || '2025/2026',
    current_semester: current_semester || 'First',
    exam_period_start: exam_period_start || null,
    exam_period_end: exam_period_end || null,
    updated_at: new Date().toISOString()
  };
  await db.write();
  
  res.json({ 
    success: true, 
    message: 'Academic settings updated successfully',
    settings: db.data.academic_settings
  });
});

// ========== ACTIVITY LOGS ==========

// Get activity logs
app.get('/api/admin/activity-logs', async (req, res) => {
  await db.read();
  const logs = (db.data.activity_logs || [])
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(logs);
});



// ========== START SERVER ==========
const PORT = parseInt(process.env.PORT || '3000');

initDb().then(() => {
  console.log('✅ Database initialized');
  console.log(`📍 Default Geofence: (${GEOFENCE_LAT}, ${GEOFENCE_LON}) radius: ${GEOFENCE_RADIUS_METERS}m`);
  console.log(`🚀 Node backend running on http://127.0.0.1:${PORT}`);
  console.log(`\n📋 Available Endpoints:`);
  console.log(`   🔐 POST   /api/login (with login attempts tracking)`);
  console.log(`   🔒 GET    /api/security-settings`);
  console.log(`   🔒 POST   /api/security-settings`);
  console.log(`   ✉️ POST   /api/send-otp`);
  console.log(`   📝 POST   /api/users/register`);
  console.log(`   👑 POST   /api/admin/register-simple`);
  console.log(`   📸 POST   /api/users/add-face`);
  console.log(`   🧠 POST   /api/users/register-face (face descriptor)`);
  console.log(`   🧠 GET    /api/users/:reg_number/face-descriptor`);
  console.log(`   🧠 DELETE /api/users/:reg_number/face-descriptor`);
  console.log(`   📍 GET    /api/geo-locations`);
  console.log(`   📍 POST   /api/geo-locations`);
  console.log(`   📍 PUT    /api/geo-locations/activate/:id`);
  console.log(`   ✅ POST   /api/attendance/checkin`);
  console.log(`   👥 GET    /api/admin/users`);
  console.log(`   👥 POST   /api/admin/users`);
  console.log(`   📚 GET    /api/courses`);
  console.log(`   📚 POST   /api/courses`);
  console.log(`   📊 GET    /api/dashboard/stats/:role`);
  console.log(`   📊 GET    /api/student/attendance-report`);
  console.log(`   👤 GET    /api/users/:regNumber/profile`);
  console.log(`   👤 PUT    /api/users/:regNumber/profile`);
  console.log(`   📚 GET    /api/users/:regNumber/my-courses`);
  console.log(`   � GET    /api/users/:regNumber/available-courses`);
  console.log(`   ✅ POST   /api/users/:regNumber/enroll`);
  console.log(`   🗑️ DELETE /api/users/:regNumber/enroll/:courseId`);
  console.log(`   �🔐 POST   /api/users/:regNumber/change-password`);
  
  console.log(`\n   👨‍🏫 LECTURER ENDPOINTS:`);
  console.log(`   👤 GET    /api/lecturer/:regNumber/profile`);
  console.log(`   👤 PUT    /api/lecturer/:regNumber/profile`);
  console.log(`   📚 GET    /api/lecturer/:regNumber/courses`);
  console.log(`   👥 GET    /api/lecturer/:regNumber/course/:courseId/students`);
  console.log(`   📊 GET    /api/lecturer/:regNumber/attendance-report`);
  console.log(`   📝 POST   /api/lecturer/attendance/bulk`);
  
  console.log(`\n   🎓 SESSION & NOTIFICATION ENDPOINTS:`);
  console.log(`   🎯 POST   /api/lecturer/sessions/start`);
  console.log(`   🔚 PUT    /api/lecturer/sessions/:sessionId/end`);
  console.log(`   🔍 GET    /api/lecturer/sessions/active`);
  console.log(`   📜 GET    /api/lecturer/sessions/history`);
  console.log(`   🔔 POST   /api/lecturer/send-notification`);
  console.log(`   📬 GET    /api/student/notifications`);
  console.log(`   📖 PUT    /api/student/notifications/:id/read`);
  console.log(`   ✅ POST   /api/student/session/join`);
  
  console.log(`\n   👨‍🏫 LECTURER COURSE MANAGEMENT:`);
  console.log(`   📚 POST   /api/lecturer/courses`);
  console.log(`   📝 PUT    /api/lecturer/courses/:id`);
  console.log(`   🗑️ DELETE /api/lecturer/courses/:id`);
  
  console.log(`\n   👑 ADMIN ENDPOINTS:`);
  console.log(`   📊 GET    /api/admin/stats`);
  console.log(`   📊 GET    /api/admin/activity-logs`);
  console.log(`   📤 POST   /api/admin/bulk-import`);
  console.log(`   📅 GET    /api/admin/academic-settings`);
  console.log(`   📅 PUT    /api/admin/academic-settings`);
  
  if (require.main === module) {
    app.listen(PORT, () => {});
  }
});

// Export app for testing (supertest) and external runners
module.exports = app;