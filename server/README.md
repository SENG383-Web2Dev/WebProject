# Server – Backend API

Node.js + Express backend with SQLite.

## Endpoints

- `GET /api/health` – Health check endpoint returning `{ status: "ok", uptime, timestamp }`.
- `POST /api/auth/login` – Authenticate with `{ email, password }`; returns `{ token, user: { id, name, email, role } }` or `401`/`400` `{ error }`. For a child account `user` also has `childProfileId`.
- `GET /api/auth/me` – Protected (`Bearer <token>`); returns the logged-in user's profile `{ id, name, email, role }` (plus `childProfileId` for a child account), the same object as the login `user`.
- `POST /api/auth/logout` – Protected (`Bearer <token>`); returns `{ message: "Logged out." }`.
- `GET /api/children` – Protected (`parent`); returns child profiles owned by the logged-in parent.
- `GET /api/children/:childId` – Protected (`requireChildAccess`: owning parent, actively linked specialist, or the child's own account); returns the child profile (`403` otherwise, `FR-M2-06`).
- `GET /api/children/:childId/specialists` – Protected (`parent`); returns specialists actively linked to the child.
- `POST /api/children/:childId/specialists` – Protected (`parent`); links a registered specialist by `{ email, specialistType }` (`404` if not a registered specialist).
- `DELETE /api/children/:childId/specialists/:specialistId` – Protected (`parent`); marks the active specialist link inactive (`204 No Content`).
- `GET /api/specialist/children` – Protected (`specialist`); returns children actively linked to the logged-in specialist.
- `GET /api/children/:childId/tasks` – Protected (`requireChildAccess`: owning parent, actively linked specialist, or the child's own account); returns the child's tasks with `status` (`pending` or `done`) and `assignedBy` `{ id, name }`, earliest due date first (`FR-M4-02`, `FR-M4-04`).
- `POST /api/children/:childId/tasks` – Protected (`parent` or linked `specialist`); assigns a task with `{ title, description, developmentArea, dueDate }`. `title` and `dueDate` (`YYYY-MM-DD`) are required and `developmentArea` must be one of `Language`, `Motor`, `Social-emotional`, `Cognitive`, `Self-care` (`400` otherwise, `FR-M4-01`, `FR-M4-05`, `FR-M4-06`). Returns `201` with the new `pending` task.
- `PATCH /api/tasks/:id/done` – Protected (`child`); the child marks one of their own tasks as done (`403` for another child's task, `404` if the task does not exist, `FR-M4-03`).

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
  - `events`: `id`, `child_id` (FK -> `children`), `created_by` (FK -> `users`), `title`, `start_time`, `end_time`, `created_at`.
  - `tasks`: `id`, `child_id` (FK -> `children`), `assigned_by` (FK -> `users`), `title`, `description`, `development_area`, `due_date`, `status` (`pending` or `done`), `done_at`, `created_at`. A database created before WEB-47 still has the old walking-skeleton `tasks` table (`id`, `title`, `done`, `created_at`); `openDatabase()` drops it and creates the new one, because it only held sample rows.
- Seed the database with synthetic users, child profiles, initial specialist links, and sample tasks for Deniz Demir (idempotent):
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
