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

_Setup and run instructions will be added together with the walking skeleton (v0.0)._

## Workflow

- Every change goes through a pull request reviewed by a teammate; no direct pushes to `main`.
- Branch names and commit messages start with the Jira issue key:
  - Branch: `WEB-12-express-server`
  - Commit: `WEB-12 Add Express server`
- Only synthetic data is used, created by a seed script.
