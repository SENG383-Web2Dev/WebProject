# Server – Backend API

Node.js + Express backend with SQLite.

## Endpoints

- `GET /api/health` – Health check endpoint returning `{ status: "ok", uptime, timestamp }`.

## Running Locally

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Start the development server (auto-reloads on file changes):
   ```bash
   npm run dev
   ```

3. Run automated tests:
   ```bash
   npm test
   ```
