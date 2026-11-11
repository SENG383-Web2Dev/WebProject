# Server – Backend API

Node.js + Express backend with SQLite.

## Endpoints

- `GET /api/health` – Health check endpoint returning `{ status: "ok", uptime, timestamp }`.
- `GET /api/tasks` – Walking skeleton tasks endpoint returning sample tasks from SQLite as JSON (`id`, `title`, `done`, `created_at`).
- `POST /api/auth/login` – Authenticate with `{ email, password }`; returns `{ token, user: { id, name, email, role } }` or `401`/`400` `{ error }`.

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

3. Run automated tests (Jest + Supertest):
   ```bash
   npm test
   ```

4. Run test coverage:
   ```bash
   npm run test:coverage
   ```

## Database (SQLite)

- Uses Node's built-in `node:sqlite` module, so there is no extra package to install (requires Node 22.13+ or 23.4+; the project uses Node 22 in CI).
- The database file is set by `DB_PATH` in `.env` (default `./data/app.db`). The file is git-ignored.
- `src/db.js` exports `openDatabase()`, which creates the tables if they do not exist:
  - `users`: `id`, `name`, `email` (unique, case-insensitive), `password_hash` (bcrypt), `role` (`parent`, `specialist`, or `child`).
  - `tasks` (walking skeleton): `id`, `title`, `done` (`0` or `1`), `created_at`.
- Seed the database with sample tasks and synthetic users (idempotent):
  ```bash
  npm run seed
  ```

### Synthetic Seed Users (Password: `password123`)

| Name | Email | Role |
|---|---|---|
| Ayşe Demir | `ayse.demir@example.com` | `parent` |
| Mehmet Kaya | `mehmet.kaya@example.com` | `specialist` |
| Zeynep Arslan | `zeynep.arslan@example.com` | `specialist` |
| Selin Öz | `selin.oz@example.com` | `specialist` |
| Deniz Demir | `deniz.demir@example.com` | `child` |
