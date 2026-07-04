const { load } = require('./env');
load();
// apply SQL migrations (creates `sessions` and `attendance` tables)
try {
  const runMigrations = require('./migrations/initDb');
  runMigrations();
} catch (e) {
  console.warn('Migration runner failed (continuing):', e && e.message);
}

const { app, initDb } = require('./app');
const PORT = parseInt(process.env.PORT || '3000');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason, promise);
  setTimeout(() => process.exit(1), 100);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 100);
});

initDb().then(() => {
  console.log('✅ Database initialized');
  console.log(`🚀 Node backend running on http://127.0.0.1:${PORT}`);
  app.listen(PORT, () => {});
}).catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
