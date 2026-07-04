# System Architecture

Overview
--------
Single-page frontend (browser) communicates with a Node/Express API that handles user registration and attendance check-ins. The Node backend stores structured data in Postgres (or `lowdb` for quick dev). An optional Python face recognition microservice can be run separately and referenced via `PYTHON_FACE_URL`.

ASCII Diagram
-------------

Browser
  └─(HTTPS)──> Node/Express API (node-backend)
                 ├─ DB: Postgres (persistent storage)
                 ├─ Object store: S3 (optional, images)
                 └─ Optional: Python face-service (PYTHON_FACE_URL)

Component responsibilities
--------------------------
- Frontend: `frontend/index.html` + `app.js`
  - Capture webcam image, request geolocation, present MFA code input, POST multipart forms.
- Node Backend: `node-backend/index.js`
  - API endpoints, MFA generation/verification, face-hash fallback, DB access.
- Python Face Service (optional)
  - Heavy face-encoding and matching, returns stable `python_id` and match confidence.
- Storage
  - Dev: `db.json` (lowdb). Prod: Postgres + S3 for images.

Deployment
----------
- Local dev: start a local Postgres instance and set `DATABASE_URL` (see `RUNNING.md`). Optional Python service can be run separately and referenced via `PYTHON_FACE_URL`.
- Prod: deploy the Node backend behind a reverse proxy (Nginx) with TLS, and run the process under a process manager (PM2/systemd). Use a managed Postgres service or a dedicated Postgres server for production.

Security & Ops
--------------
- TLS at reverse proxy, CSP and CORS restrictions, request size limits for uploads, secrets in env/vault.
- Health check endpoint and logs/metrics for observability.

Files added for automation
-------------------------
- `.github/workflows/ci.yml` - GitHub Actions CI to install dependencies and run tests/builds. Configure the CI workflow to start a Postgres service via the Actions `services` feature if needed.

See `RUNNING.md` for local development instructions using a native Postgres service.
