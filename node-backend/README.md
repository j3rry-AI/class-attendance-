# Node backend (minimal)

Run the lightweight Node.js backend with PostgreSQL as the default persistent store.

Install + run:

```powershell
cd node-backend
npm install
npm start
```

Endpoints:
- `POST /api/users/register` (JSON body: `name`, `reg_number`, `password`) → student self-registration without email or photo
- `POST /api/admin/register-simple` (admin JWT required) → create lecturers or students with optional `email` and role selection
- `POST /api/attendance/checkin` (multipart form: `lat`, `lon`, `mfa_code`, `file`)
- `GET /api/users`

Environment:
- `DATABASE_URL` (required for the PostgreSQL-backed backend)
- `GEOFENCE_LAT`, `GEOFENCE_LON`, `GEOFENCE_RADIUS_METERS` (optional)

The backend now uses PostgreSQL for persistent storage. Set `DATABASE_URL` before starting the server.

PM2 Deployment
--------------
For production process management using PM2, install PM2 globally and use the provided ecosystem file:

```bash
npm install -g pm2
npm run start:pm2
```

To stop or restart the process:

```bash
npm run stop:pm2
npm run restart:pm2
```

The PM2 config writes logs to `node-backend/logs/pm2-out.log` and `node-backend/logs/pm2-error.log`.

Embedded SQLite (portable)
--------------------------
For portability and simple handoffs, the backend now uses an embedded SQLite database by default. The SQLite database file is created automatically at `node-backend/data/app_state.sqlite` when the backend is started.

If you prefer Postgres for production, set `DATABASE_URL` and restore the Postgres-backed `db/index.js` implementation. For local, no additional DB installation is required.

The app listens on port 3000 by default. To change the port set `PORT` in your environment.
