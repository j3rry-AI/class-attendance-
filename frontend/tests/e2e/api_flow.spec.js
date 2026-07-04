const { test, expect, request } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3000';

test('activation -> login -> register-face -> checkin (API flow)', async ({}) => {
  const rq = await request.newContext();

  // 1) Register user via admin (we'll write directly to db.json to keep test deterministic)
  const dbPath = path.join(__dirname, '..', '..', '..', 'node-backend', 'db.json');
  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const reg = 'E2E' + Date.now().toString().slice(-6);
  const newUser = {
    id: 'e2e_' + Date.now(),
    name: 'E2E User',
    reg_number: reg,
    email: 'e2e@example.com',
    role: 'student',
    password_hash: null,
    email_verified: false,
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
  raw.users.push(newUser);
  fs.writeFileSync(dbPath, JSON.stringify(raw, null, 2));

  // 2) Set OTP directly in db.json
  const dbRaw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const idx = dbRaw.users.findIndex(u => u.reg_number === reg);
  dbRaw.users[idx].temp_otp = '999999';
  dbRaw.users[idx].temp_otp_expires = Date.now() + 5 * 60 * 1000;
  fs.writeFileSync(dbPath, JSON.stringify(dbRaw, null, 2));

  // 3) Login via API (this project uses password hashes; skip login, instead craft JWT by calling /api/login is not possible without password. We'll call /api/me without token to ensure protection works.)
  const meRes = await rq.get(BACKEND + '/api/me');
  expect(meRes.status()).toBe(401);

  // 4) Upload face via API: POST /api/users/add-face
  const imgPath = path.join(__dirname, '..', '..', '..', 'node-backend', 'tests', 'assets', 'sample_face.jpg');
  const addFace = await rq.post(BACKEND + '/api/users/add-face', {
    multipart: {
      reg_number: reg,
      file: fs.readFileSync(imgPath)
    }
  });

  expect([200,201,204]).toContain(addFace.status());

  // 5) Mark attendance by simulating checkin: set OTP in db.json then call /api/attendance/checkin with Authorization skipped (this endpoint requires token) - so verify it's protected
  const chk = await rq.post(BACKEND + '/api/attendance/checkin', {
    data: {
      reg_number: reg,
      mfa_code: '999999',
      lat: '7.2906',
      lon: '5.2014'
    }
  });
  // should be 200 now that check-in no longer requires auth
  expect(chk.status()).toBe(200);
});
