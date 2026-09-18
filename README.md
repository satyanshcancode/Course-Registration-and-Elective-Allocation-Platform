# Course Registration and Elective Allocation Platform

A web platform for fair course registration: live seat counts, an eligibility
pre-check, a registration cart with atomic submit, preference-and-priority
allocation for oversubscribed electives, waitlists with automatic promotion,
add/drop, and a personal registration history.

> **Status: Phase 1 (project setup).** The stack, tooling and a health check are
> in place; business features arrive in later phases. The full README comes in
> the final phase.

- Brief: [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md)
- Specification: [docs/SPEC.md](docs/SPEC.md)

## Stack

| Layer    | Technology                                                              |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 6, React Router 7, CSS Modules               |
| Backend  | Node 20, Express 5, TypeScript, `pg` (PostgreSQL 16), zod               |
| Shared   | `@course-reg/shared` — typed API contracts (`ApiResponse<T>`, …)        |
| Tooling  | ESLint (type-aware), Prettier, Vitest, React Testing Library, supertest |
| Runtime  | Docker, Docker Compose                                                  |

```text
.
├── backend/    Express API (routes → controllers → services → repositories)
├── frontend/   React SPA (components → hooks → api)
├── shared/     Types shared by both sides
├── docs/       Problem statement and specification
├── docker-compose.yml        Development stack (hot reload)
└── docker-compose.prod.yml   Production-like stack (nginx on :8080)
```

## Run with Docker (recommended)

Requires Docker Desktop (or Docker Engine with Compose v2).

```bash
cp .env.example .env          # then change POSTGRES_PASSWORD / DATABASE_URL
npm run docker:up             # docker compose up --build -d
```

| URL                              | What                            |
| -------------------------------- | ------------------------------- |
| http://localhost:5173            | Frontend (Vite, hot reload)     |
| http://localhost:4000/api/health | Backend health (API + database) |
| localhost:5432                   | PostgreSQL                      |

The backend waits for PostgreSQL to be healthy, applies migrations
(`npm run migrate`), then starts with hot reload. Source folders are
bind-mounted; `node_modules` live in named volumes so host and container
dependencies never mix. File watching uses polling so hot reload works on
Windows and macOS bind mounts.

| Script                     | Does                                                 |
| -------------------------- | ---------------------------------------------------- |
| `npm run docker:up`        | Build and start the dev stack in the background      |
| `npm run docker:logs`      | Follow logs                                          |
| `npm run docker:down`      | Stop the dev stack (keeps data)                      |
| `npm run docker:reset`     | Stop and **delete volumes** (database, node_modules) |
| `npm run docker:prod`      | Build and start the production stack on :8080        |
| `npm run docker:prod:down` | Stop the production stack                            |

After changing dependencies, refresh the `node_modules` volumes with
`npm run docker:reset && npm run docker:up`.

**Production stack:** `npm run docker:prod`, then open http://localhost:8080.
nginx serves the built frontend and proxies `/api` to the backend; only port
8080 is published.

## Run without Docker

Requires Node.js ≥ 20.12 and a PostgreSQL 16 server.

```bash
cp .env.example .env    # point DATABASE_URL at your PostgreSQL
npm install
npm run migrate
npm run dev             # backend on :4000, frontend on :5173
```

Tip: `docker compose up -d postgres` runs just the database in Docker.

## Quality checks

```bash
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # tsc in every workspace
npm run test           # Vitest in every workspace
npm run build          # shared → backend → frontend
npm run format:check   # Prettier
```
