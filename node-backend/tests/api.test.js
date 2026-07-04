const request = require('supertest');
const app = require('../index');
const db = require('../db');

beforeAll(async () => {
  await db.init();
  await new Promise(resolve => setTimeout(resolve, 250));
});

function makeReg(prefix = 'TST') {
  return prefix + Date.now().toString().slice(-6);
}

async function registerUser({ name = 'Test User', reg_number, password = 'pass1234' } = {}) {
  const res = await request(app)
    .post('/api/users/register')
    .send({ name, reg_number, password })
    .set('Accept', 'application/json');

  expect(res.statusCode).toBe(201);
  return res.body;
}

describe('Basic API tests', () => {
  test('GET /api/security-settings returns settings', async () => {
    const res = await request(app).get('/api/security-settings');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('maxLoginAttempts');
  }, 10000);

  test('POST /api/users/register allows student signup without email or photo', async () => {
    const reg = makeReg();
    const body = await registerUser({ name: 'Student Test', reg_number: reg, password: 'pass1234' });

    expect(body).toHaveProperty('reg_number', reg);
    expect(body).toHaveProperty('role', 'student');
    expect(body).toHaveProperty('message');
  }, 15000);

  test('POST /api/admin/register-simple can create a user', async () => {
    const { createAdmin } = require('../scripts/create_admin');
    const reg = makeReg('ADM');

    await createAdmin({ name: 'Automated Test', reg_number: reg, email: 'admin-test@example.com', password: 'pass1234' });

    const state = await db.readAll();
    const found = (state.users || []).find(u => u.reg_number === reg);
    expect(found).toBeTruthy();
  }, 15000);

  test('full auth flow: login and access /api/me', async () => {
    const reg = makeReg();
    await registerUser({ name: 'Auth Test', reg_number: reg, password: 'pass1234' });

    const loginRes = await request(app)
      .post('/api/login')
      .send({ reg_number: reg, password: 'pass1234', role: 'student' })
      .set('Accept', 'application/json');

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body).toHaveProperty('user');
    expect(meRes.body.user.reg_number).toBe(reg);
  }, 20000);

  test('attendance checkin with file upload and OTP', async () => {
    const reg = makeReg();
    await registerUser({ name: 'Attendance Test', reg_number: reg, password: 'pass1234' });

    const loginRes = await request(app)
      .post('/api/login')
      .send({ reg_number: reg, password: 'pass1234', role: 'student' })
      .set('Accept', 'application/json');
    expect(loginRes.statusCode).toBe(200);
    const token = loginRes.body.token;

    const crypto = require('crypto');
    const img = crypto.randomBytes(6000);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .field('reg_number', reg)
      .field('mfa_code', '123456')
      .field('lat', '7.2906')
      .field('lon', '5.2014')
      .attach('file', img, 'photo.jpg');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  }, 30000);
});
