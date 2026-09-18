# Course Registration and Elective Allocation Platform

A web platform for fair course registration: live seat counts, an eligibility
pre-check, a registration cart with atomic submit, preference-and-priority
allocation for oversubscribed electives, waitlists with automatic promotion,
add/drop, and a personal registration history.

> **Status: Phase 3 (authentication).** The stack, database schema, seed data,
> sign-in with role-based access and a health
> check are in place; API endpoints and screens arrive in later phases. The full
> README comes in the final phase.

- Brief: [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md)
- Specification: [docs/SPEC.md](docs/SPEC.md)
- Database design: [docs/DATABASE.md](docs/DATABASE.md)

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
├── docs/       Problem statement, specification, database design
├── docker/     PostgreSQL init scripts (creates the test database)
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

## Authentication

Sign in at `/login` with one of the [demo accounts](#demo-accounts). Students land
on `/student`, administrators on `/admin`.

- **Session cookie.** `POST /api/auth/login` checks the password with bcrypt and
  sets a signed JWT (HS256, user id + role, 8 hours) in the `cr_session` cookie:
  `HttpOnly` (JavaScript can't read it), `SameSite=Strict`, `Path=/api`, and
  `Secure` in production. The token is never in a response body or localStorage.
- **No account enumeration.** An unknown e-mail and a wrong password give the same
  401 message, and both paths run a bcrypt comparison so timing looks the same.
- **Brute-force limit.** At most 10 failed sign-ins per IP and e-mail every 15
  minutes, then `429`.
- **CSRF.** Besides `SameSite=Strict`, state-changing requests with a foreign
  `Origin` header are rejected (`403`).
- **Authorization on the server.** Every request re-validates the cookie and
  re-loads the user (`requireAuth`); `requireRole` returns `403` for the wrong
  role. Student endpoints take the student's identity from the session, never
  from an id in the request. Admin sign-ins are written to `audit_logs`.
- **Frontend.** `AuthProvider` restores the session via `GET /api/auth/me`;
  `<ProtectedRoute>` sends visitors to `/login` (and back afterwards) and sends
  users of the other role to their own home. If a session expires, the next API
  call sends you to `/login` with a notice.

| Endpoint                | Access    | Purpose                                            |
| ----------------------- | --------- | -------------------------------------------------- |
| `POST /api/auth/login`  | public    | Sign in; sets the session cookie; returns the user |
| `POST /api/auth/logout` | public    | Clears the session cookie                          |
| `GET /api/auth/me`      | signed in | Current user (plus profile summary for students)   |
| `GET /api/students/me`  | student   | The caller's own student profile                   |
| `GET /api/admin/ping`   | admin     | Role check                                         |

`JWT_SECRET` must be set in `.env` (at least 32 characters; see `.env.example`).
The server refuses to start in production with the example value.

## Seed data and demo accounts

```bash
npm run docker:seed                    # reset + load demo data (inside Docker)
npm run docker:seed:demo-submissions   # open Fall 2026 and add ~150 submissions
```

Outside Docker use `npm run seed` and `npm run seed:demo-submissions`. Both are
deterministic and safe to re-run; `seed` wipes all application data first.
See [docs/DATABASE.md](docs/DATABASE.md#seed-data) for what gets created.

### Demo accounts

> **Demo-only credentials.** They are published here so the app can be
> demonstrated. Never reuse them anywhere real.

| Role    | E-mail                        | Password      | Situation                                                                     |
| ------- | ----------------------------- | ------------- | ----------------------------------------------------------------------------- |
| Admin   | `admin@university.edu`        | `Admin@123`   | Manages courses, the registration window and allocation                       |
| Student | `aarav.sharma@university.edu` | `Student@123` | CSE, semester 6: eligible for Artificial Intelligence (program relevance +25) |
| Student | `meera.iyer@university.edu`   | `Student@123` | Mechanical, semester 3: **not** eligible for Artificial Intelligence          |
| Student | `rohan.verma@university.edu`  | `Student@123` | CSE, final year, graduating this term: highest priority (+20 +25 +40)         |
| Student | `priya.nair@university.edu`   | `Student@123` | ECE, semester 5: eligible for Artificial Intelligence, no priority bonus      |

The 296 generated students also use `Student@123`; their e-mail is their roll
number, e.g. `cse24004@university.edu`.

## Run without Docker

Requires Node.js ≥ 20.12 and a PostgreSQL 16 server.

```bash
cp .env.example .env    # point DATABASE_URL at your PostgreSQL
npm install
npm run migrate
npm run seed            # optional demo data
npm run dev             # backend on :4000, frontend on :5173
```

Tip: `docker compose up -d postgres` runs just the database in Docker.

## Quality checks

```bash
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # tsc in every workspace
npm run test           # Vitest in every workspace (backend integration tests need PostgreSQL)
npm run build          # shared → backend → frontend
npm run format:check   # Prettier
```
