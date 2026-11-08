# WebProject – AI-Assisted Child Development Platform

SENG 383 – Software Project III, Fall 2026 · Team **Web2Dev** (Group 2, Section-2)

A web-based decision support platform that brings parents, specialists and the child together around a shared schedule, task list and observation records, with role-based AI summaries. The AI supports decisions; it never makes them.

## Team

| Name | GitHub |
|---|---|
| Hasan Yağız Koşar | [@hasan-yagiz-kosar](https://github.com/hasan-yagiz-kosar) |
| Sude Naz Metli | [@sudenazmetli](https://github.com/sudenazmetli) |
| İrem Ozan | [@iremozan](https://github.com/iremozan) |

- Jira board: https://student-team-kriaqp7j.atlassian.net/jira/software/projects/WEB/boards/4
- CI: https://github.com/SENG383-Web2Dev/WebProject/actions/workflows/ci.yml

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express, JWT authentication |
| Database | SQLite |
| Testing | Jest + Supertest, Vitest, Playwright |
| CI | GitHub Actions |

## Repository Structure

```
WebProject/
├── client/              React (Vite) frontend
├── server/              Node.js + Express backend, SQLite
├── docs/
│   ├── PMP.md           Project Management Plan
│   ├── SRS.md           Software Requirements Specification
│   ├── SDD.md           Software Design Document
│   └── img/             Screenshots and diagrams
└── .github/workflows/   CI pipeline
```

## Running Locally

### Prerequisites

- **Node.js**: v22.13+ or v23.4+ (required for built-in `node:sqlite`; CI runs on Node 22)
- **npm**: v10+ (bundled with Node.js)
- **Git**

### 1. Backend Setup (`server`)

Open a terminal and start the backend server:

```bash
cd server
npm install
npm run seed
npm run dev
```

- The backend API runs on `http://localhost:5000`.
- `npm run seed` creates `./data/app.db` and populates the `tasks` table with sample data (skips automatically if data already exists).
- To run automated backend tests: `npm test` (or `npm run test:coverage`).

### 2. Frontend Setup (`client`)

Open a second terminal and start the frontend dev server:

```bash
cd client
npm install
npm run dev
```

- The frontend application runs on `http://localhost:5173`.
- Vite automatically proxies `/api/*` calls to the Express server on port 5000.
- To run automated frontend tests: `npm test` (or `npm run lint` for Oxlint).

### 3. Verification (Walking Skeleton v0.0)

Once both servers are running:

1. Open `http://localhost:5173` in your browser. The page should load and display the sample tasks from the SQLite database with their status (`Done` or `To do`).
2. You can also verify the backend API endpoints directly:
   - `GET http://localhost:5000/api/health` — Health check endpoint (`{ "status": "ok", ... }`)
   - `GET http://localhost:5000/api/tasks` — Returns sample tasks as JSON array


## Workflow

- Every change goes through a pull request reviewed by a teammate; no direct pushes to `main`.
- Branch names and commit messages start with the Jira issue key:
  - Branch: `WEB-12-express-server`
  - Commit: `WEB-12 Add Express server`
- Only synthetic data is used, created by a seed script.
