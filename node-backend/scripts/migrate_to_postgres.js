// Migration helper for moving a legacy JSON state file into the PostgreSQL app_state row.
// Usage: set DATABASE_URL env, then node scripts/migrate_to_postgres.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const dbPath = path.join(__dirname, '..', 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.error('db.json not found');
    process.exit(1);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('Please set DATABASE_URL env var to your Postgres connection string');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const state = {
    users: raw.users || [],
    attendance: raw.attendance || [],
    courses: raw.courses || [],
    geo_locations: raw.geo_locations || [],
    security_settings: raw.security_settings || {},
    sessions: raw.sessions || [],
    notifications: raw.notifications || [],
    disputes: raw.disputes || [],
    enrollments: raw.enrollments || [],
    activity_logs: raw.activity_logs || [],
    academic_settings: raw.academic_settings || {}
  };

  await client.query(
    'INSERT INTO app_state (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()',
    ['main', state]
  );

  await client.end();
  console.log('Migration complete');
}

main().catch(err => { console.error(err); process.exit(1); });
