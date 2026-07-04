Evaluation Summary for Supervisor

Project: University Attendance System
Date: 2026-06-09

Metrics & Targets

- Functional Correctness: critical-path unit & integration tests (register, login, attendance) — target: 100% for critical tests.
- Authentication Security: JWT validation, token expiry, hashed passwords — target: no high-severity auth findings, tokens expire (12h by default).
- ID Format Compliance: student IDs (three letters + six digits), lecturer composed IDs — target: 100% of saved records match regex.
- Face Recognition Accuracy: precision >= 95%, FAR <= 1% (validate on labeled set).
- Latency: API p95 < 200ms under expected load.
- Reliability: 5xx error rate <1%.
- Usability: median registration/login time < 60s, success >= 98%.

Measurement Plan

- Unit & integration tests: `jest` + `supertest` (node-backend/tests)
- E2E tests: Playwright/Cypress (recommended next step)
- Load testing: `k6` or `artillery`
- Face metrics: run evaluation script against labeled descriptors (separate script)
- Monitoring: aggregate logs and expose p95/p99 in a simple Prometheus/Grafana stack (future)

What I implemented now

- Added `node-backend/utils/validation.js` with validation, normalization, hashing, and liveness helper.
- Added `node-backend/tests/validation.test.js` and a `test` script in `node-backend/package.json` using `jest`.
- Created this summary file.

Next actions (automated)

- Run `npm install` in `node-backend` to install `jest` and `supertest`.
- Run `npm test` to execute unit tests.

Notes

- I kept backend server code unchanged to avoid starting the server during tests; tests import the standalone `utils/validation.js`.
- We can expand tests to cover auth flows and API endpoints using `supertest` once you want the test runner to start the app.
