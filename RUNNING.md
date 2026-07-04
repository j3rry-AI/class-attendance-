Run & Development
-----------------

Dev (recommended): run frontend and backend in separate terminals, or from workspace root with `npm run dev`.

From repo root:

```bash
# start both: runs backend and frontend dev server concurrently
npm run dev
```

Or manually:

```bash
cd node-backend
node index.js

cd ../frontend
npm install   # first time only
npm run dev
```

Production (single process):

```bash
cd frontend
npm run build
cd ../node-backend
node index.js
# Open http://127.0.0.1:3000
```

Notes
- Dev mode: Vite dev server proxies `/api` to `http://127.0.0.1:3000` (see `frontend/vite.config.js`). Both servers must run in dev.
- The backend now requires `DATABASE_URL` for stable operation. Set `DATABASE_URL` to a Postgres connection string before starting the Node backend.
- Prod mode: backend serves the built SPA from `frontend/dist` and provides API routes — only backend needs to run.

Research methodology (summary)
- Aim: Build an attendance system combining client-side face recognition, geofencing and MFA.
- Design: React + Vite frontend, Node/Express backend, `lowdb` JSON file for prototyping. Face descriptors (not raw photos) are stored.
- Implementation: face detection + liveness client-side (face-api.js), descriptors uploaded to backend, geofence checks server-side, email OTP for MFA.
- Evaluation: Functional smoke tests, face match accuracy (FP/FN), bundle size and load time, UX tests.

If you want the full methodology write-up (2 pages) I can add it to `ARCHITECTURE.md`.

Troubleshooting: ERR_CONNECTION_REFUSED after restart
--------------------------------------------------

If you see browser errors like `net::ERR_CONNECTION_REFUSED` for `style.css`, WebSockets, or `/api/login` pointing at port `5174`, the cause is usually a port mismatch after a system restart.

Steps to fix:

1. Check the frontend dev server terminal (where you ran `npm run dev`) — it shows the actual dev URL, e.g. `Local: http://localhost:5173/`.
2. If your browser is still on `http://localhost:5174`, change the URL to the port printed by Vite (usually `5173`) and reload.
3. Start the backend in a separate terminal if it's not running. From the repo root:

```powershell
cd node-backend
# or: npm start, npm run dev, or node index.js depending on your setup
npm run dev
```

4. Confirm both frontend and backend are running and that Vite's proxy to `/api` (see `frontend/vite.config.js`) matches the backend port.

Why this happens: a restart can kill background processes and let Vite reclaim its default port (`5173`). Open tabs or bookmarks that still point to `5174` will fail with connection refused.

If problems persist, run `npm run dev` again and copy the exact `Local:` URL from the terminal into the browser.
