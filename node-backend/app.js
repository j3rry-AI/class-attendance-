const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const appState = require('./models/appState');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const courseRoutes = require('./routes/courseRoutes');
const lecturerRoutes = require('./routes/lecturerRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      scriptSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      imgSrc: ['\'self\'', 'data:', 'blob:'],
      mediaSrc: ['\'self\'', 'blob:'],
      connectSrc: ['\'self\'', 'http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:8000', 'http://localhost:8000', 'blob:']
    }
  }
}));

app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

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
    try {
      sanitize(req.body);
    } catch (e) {}
  }
  next();
});

const serveFrontend = (process.env.SERVE_FRONTEND === 'true') || (process.env.NODE_ENV === 'production');
if (serveFrontend) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    // multer is configured per-route in route files to avoid double-parsing multipart bodies
    // const upload = multer({ storage: multer.memoryStorage() });
    // app.use(upload.any());
// const upload = multer({ storage: multer.memoryStorage() });
// app.use(upload.any());

app.use(authRoutes);
app.use(userRoutes);
app.use(attendanceRoutes);
app.use(courseRoutes);
app.use(lecturerRoutes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested resource does not exist' });
});

// Global Express error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error caught by Express error handler:', err);
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message || 'Unexpected error'
  });
});

async function initDb() {
  await appState.initDb();
}

module.exports = { app, initDb };
