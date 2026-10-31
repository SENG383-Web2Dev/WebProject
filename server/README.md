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

## Database (SQLite)

- Uses Node's built-in `node:sqlite` module, so there is no extra package to install (requires Node 22.13+ or 23.4+; the project uses Node 22 in CI).
- The database file is set by `DB_PATH` in `.env` (default `./data/app.db`). The file is git-ignored.
- `src/db.js` exports `openDatabase()`, which creates the `tasks` table if it does not exist:
  - `id` (integer primary key), `title` (required text), `done` (0 or 1, default 0), `created_at` (timestamp).
- Fill the table with sample tasks (skips if the table already has rows):
  ```bash
  npm run seed
  ```
