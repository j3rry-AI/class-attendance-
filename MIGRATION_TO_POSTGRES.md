Migration plan: lowdb -> Postgres

Context
- Current backend uses `lowdb` (JSON file) for ease of development. For production we recommend moving to Postgres (or another durable DB) to support concurrency, backups, and scalability.

Steps
1. Choose DB: Postgres recommended for relational data (users, attendance, courses). Install and run a Postgres instance (managed or local).
2. Add an ORM/Query builder: `knex` or `sequelize` or `typeorm`. `knex` + `objection` is lightweight.
3. Create database schema:
   - users (id, name, reg_number, email, role, password_hash, mfa_secret, face_hash, face_descriptor jsonb, created_at, ...)
   - attendance (id, user_id, reg_number, course_id, timestamp, latitude, longitude, location_name)
   - courses, geo_locations, activity_logs, security_settings, etc.
4. Implement a small migration script to export `db.json` and transform into INSERT statements for Postgres. Use `pg` node client and a one-time script.
5. Update backend code:
   - Replace lowdb read/write calls with queries.
   - Keep validation and business logic; abstract DB operations behind a `db/` module for easier testing.
6. Testing: run integration tests against Postgres (use a dedicated test DB instance). Update CI to start a Postgres service via the Actions `services` feature or your CI's service configuration.
7. Backups: configure regular DB backups or use managed provider backups.

Notes
- For quick transition, you can keep lowdb for development and use Postgres in production — use an environment variable to switch implementations.
- Consider adding connection pooling (pg.Pool) and prepared statements.

I can help by creating example migration scripts and a `db/` abstraction layer. Would you like me to scaffold that next?"}