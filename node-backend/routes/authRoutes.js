const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const appState = require('../models/appState');
const { hashPassword, validateRegNumber, normalizeRegNumber, analyzeImageLiveness } = appState;
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = appState;

async function getSecuritySettings() {
  return appState.getSecuritySettings();
}

router.get('/api/security-settings', async (req, res) => {
  const settings = await getSecuritySettings();
  res.json(settings);
});

router.post('/api/security-settings', async (req, res) => {
  const { maxLoginAttempts, lockoutDuration, minPasswordLength, sessionTimeout, enforceMFA } = req.body;
  await appState.read();
  appState.state.data.security_settings = {
    maxLoginAttempts: maxLoginAttempts || 5,
    lockoutDuration: lockoutDuration || 30,
    minPasswordLength: minPasswordLength || 6,
    sessionTimeout: sessionTimeout || 60,
    enforceMFA: enforceMFA !== undefined ? enforceMFA : true,
    updated_at: new Date().toISOString()
  };
  await appState.write();
  res.json({ success: true, message: 'Security settings updated' });
});

router.post('/api/login', async (req, res) => {
  const { reg_number, password, role } = req.body;
  if (!reg_number || !password || !role) {
    return res.status(400).json({ success: false, message: 'Registration number, password, and role are required' });
  }
  await appState.read();
  const normalizedInput = normalizeRegNumber(reg_number);
  const user = (appState.state.data.users || []).find(u => u.reg_number === reg_number || normalizeRegNumber(u.reg_number) === normalizedInput);
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  const settings = await getSecuritySettings();
  const maxAttempts = settings.maxLoginAttempts || 5;
  const lockoutMinutes = settings.lockoutDuration || 30;

  if (user.locked_until && Date.now() < user.locked_until) {
    const remainingMinutes = Math.ceil((user.locked_until - Date.now()) / 60000);
    return res.status(403).json({ success: false, message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.` });
  }

  if (user.locked_until && Date.now() > user.locked_until) {
    user.login_attempts = 0;
    user.locked_until = null;
  }

  const hashedInputPassword = hashPassword(password);
  if (user.password_hash !== hashedInputPassword) {
    user.login_attempts = (user.login_attempts || 0) + 1;
    const remainingAttempts = maxAttempts - user.login_attempts;
    if (user.login_attempts >= maxAttempts) {
      user.locked_until = Date.now() + lockoutMinutes * 60 * 1000;
      await appState.write();
      return res.status(403).json({ success: false, message: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.` });
    }
    await appState.write();
    return res.status(401).json({ success: false, message: `Invalid password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` });
  }

  if (user.role !== role) {
    return res.status(403).json({ success: false, message: `Invalid role. You are registered as a ${user.role}` });
  }

  user.login_attempts = 0;
  user.locked_until = null;
  await appState.write();
  await appState.logActivity(reg_number, 'login', req);

  if (process.env.REQUIRE_VERIFICATION === 'true' && !user.email_verified && !user.face_hash) {
    return res.status(403).json({ success: false, message: 'Account not fully verified. Please verify your email or register your face before signing in.' });
  }

  const token = jwt.sign({ id: user.id, reg_number: user.reg_number, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token, role: user.role, name: user.name, reg_number: user.reg_number, has_face: !!user.face_hash, message: 'Login successful' });
});

router.post('/api/users/register', async (req, res) => {
  const { name, reg_number, password, role } = req.body;
  if (!name || !reg_number || !password) {
    return res.status(400).json({ detail: 'name, reg_number and password are required' });
  }
  
  // Reject attempts to create lecturer or admin accounts via public signup
  if (role && (role === 'lecturer' || role === 'admin')) {
    return res.status(403).json({ detail: 'Public signup is restricted to student accounts only. Contact administrators to create lecturer or admin accounts.' });
  }
  
  if (!validateRegNumber(reg_number)) {
    return res.status(400).json({ detail: 'Invalid registration number format' });
  }

  await appState.read();
  const existingUser = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) {
    return res.status(400).json({ detail: 'User already exists' });
  }

  const secret = require('otplib').authenticator.generateSecret();
  const user = {
    id: appState.nanoid(),
    name,
    reg_number,
    role: 'student',  // Always 'student' for public signup
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
  appState.state.data.users.push(user);
  await appState.write();
  res.status(201).json({ id: user.id, name: user.name, reg_number: user.reg_number, role: user.role, message: 'Registration successful! You can now login.' });
});

router.post('/api/admin/register-simple', verifyToken, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required. Only admins can create new users.' });
  }
  const { name, reg_number, role, password } = req.body;
  if (!name || !reg_number || !role || !password) {
    return res.status(400).json({ error: 'Missing required fields: name, reg_number, role, password' });
  }
  if (!validateRegNumber(reg_number)) {
    return res.status(400).json({ error: 'Invalid registration number format' });
  }

  await appState.read();
  const existingUser = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const secret = require('otplib').authenticator.generateSecret();
  const newUser = {
    id: appState.nanoid(),
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
  appState.state.data.users.push(newUser);
  await appState.write();
  res.status(201).json({ id: newUser.id, name, reg_number, role, message: 'User created. They can add their face later via profile.' });
});

module.exports = router;
