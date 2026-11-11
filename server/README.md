# Server – Backend API

Node.js + Express backend with SQLite.

## Endpoints

- `GET /api/health` – Health check endpoint returning `{ status: "ok", uptime, timestamp }`.
- `GET /api/tasks` – Walking skeleton tasks endpoint returning sample tasks from SQLite as JSON (`id`, `title`, `done`, `created_at`).
- `POST /api/auth/login` – Authenticate with `{ email, password }`; returns `{ token, user: { id, name, email, role } }` or `401`/`400` `{ error }`.
- `GET /api/auth/me` – Protected (`Bearer <token>`); returns the logged-in user's profile `{ id, name, email, role }`.
- `POST /api/auth/logout` – Protected (`Bearer <token>`); returns `{ message: "Logged out." }`.
- `GET /api/children` – Protected (`parent`); returns child profiles owned by the logged-in parent.
- `GET /api/children/:childId` – Protected (`requireChildAccess`: owning parent, actively linked specialist, or the child's own account); returns the child profile (`403` otherwise, `FR-M2-06`).
- `GET /api/children/:childId/specialists` – Protected (`parent`); returns specialists actively linked to the child.
- `POST /api/children/:childId/specialists` – Protected (`parent`); links a registered specialist by `{ email, specialistType }` (`404` if not a registered specialist).
- `DELETE /api/children/:childId/specialists/:specialistId` – Protected (`parent`); marks the active specialist link inactive (`204 No Content`).
- `GET /api/specialist/children` – Protected (`specialist`); returns children actively linked to the logged-in specialist.

All other `/api/*` endpoints require a valid `Authorization: Bearer <token>` header (`requireAuth` -> `401` on missing/invalid token) and can restrict roles via `requireRole(...roles)` (`403` when role is not allowed).

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
  - `children`: `id`, `parent_id` (FK -> `users`), `child_account_id` (unique FK -> `users`, optional), `name`, `birth_date`.
  - `specialist_links`: `id`, `child_id` (FK -> `children`), `specialist_id` (FK -> `users`), `specialist_type`, `active` (`0` or `1`), `created_at`, `UNIQUE (child_id, specialist_id)`.
  - `tasks` (walking skeleton): `id`, `title`, `done` (`0` or `1`), `created_at`.
- Seed the database with sample tasks, synthetic users, child profiles, and initial specialist links (idempotent):
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
