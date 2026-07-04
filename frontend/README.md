# Frontend

Simple static frontend (no build). Open `index.html` in a browser or serve with a static server.

It uses the webcam and browser geolocation API and sends images to the backend endpoints.

The backend is a Node/Express service located in `../node-backend` (run `npm install && npm start`). By default it listens on port 3000; set the `PORT` environment variable if you need a different port.

Troubleshooting: dev server port mismatch
----------------------------------------

If you see `net::ERR_CONNECTION_REFUSED` for assets, WebSockets, or `/api/*` and your browser URL uses port `5174`, try this:

1. From the repo root run the combined dev command which starts frontend and backend together:

```bash
npm run dev
```

2. Look at the frontend terminal output — Vite prints the `Local:` URL (commonly `http://localhost:5173`).
3. Make sure your browser is using that exact `Local:` URL (change `5174` to `5173` if needed) and reload.
4. If the backend isn't running, start it in a separate terminal with:

```bash
cd node-backend
npm run dev # or npm start / node index.js
```

This happens after restarts because Vite may reclaim its default port (`5173`) while old tabs still point to the previous port (`5174`).
