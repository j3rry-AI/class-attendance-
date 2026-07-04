const crypto = require('crypto');
const { nanoid } = require('nanoid');
const db = require('../db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function createAdmin({ name, reg_number, email, password }) {
  await db.init();
  const state = await db.readAll();
  state.users = state.users || [];

  const exists = state.users.find(u => u.reg_number === reg_number || u.role === 'admin');
  if (exists) {
    console.log('Admin already exists:', exists.reg_number || exists.id);
    return exists;
  }

  const user = {
    id: nanoid(),
    name,
    reg_number,
    email: email || null,
    role: 'admin',
    password_hash: hashPassword(password),
    email_verified: true,
    mfa_secret: null,
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

  state.users.push(user);
  await db.writeAll(state);
  console.log('Admin created:', reg_number);
  return user;
}

// CLI
if (require.main === module) {
  (async () => {
    const name = process.argv[2] || 'Administrator';
    const reg = process.argv[3] || 'ADMIN/001';
    const email = process.argv[4] || 'admin@example.com';
    const password = process.argv[5] || 'changeMe123!';

    try {
      await createAdmin({ name, reg_number: reg, email, password });
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

module.exports = { createAdmin };
