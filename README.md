# Course Registration and Elective Allocation Platform

A web platform for fair course registration: live seat counts, an eligibility
pre-check, a registration cart with atomic submit, preference-and-priority
allocation for oversubscribed electives, waitlists with automatic promotion,
add/drop, and a personal registration history.

> **Status: Phase 5 (course catalogue).** The stack, database schema, seed
> data, sign-in with role-based access, the design system and app shell, and
> the first feature, the course catalogue with live seat counts, are in place.
> The other features arrive in later phases. The full README comes in the final
> phase.

- Brief: [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md)
- Specification: [docs/SPEC.md](docs/SPEC.md)
- Database design: [docs/DATABASE.md](docs/DATABASE.md)
- Design direction and review: [docs/DESIGN.md](docs/DESIGN.md) (screenshots in
  [docs/screenshots/](docs/screenshots/))

![Student dashboard, desktop](docs/screenshots/student-dashboard-1280-light.png)

## Features

| #   | Feature (from the brief)                      | Status               |
| --- | --------------------------------------------- | -------------------- |
| 1   | Course catalogue with live seat counts        | **Done** (see below) |
| 2   | Eligibility pre-check before the window opens | **Done** (see below) |
| 3   | Registration cart with atomic submit          | **Done** (see below) |
| 4   | Fair allocation for oversubscribed electives  | Planned              |
| 5   | Waitlist with automatic promotion             | Planned              |
| 6   | Add/drop                                      | Planned              |
| 7   | Registration status and history               | Planned              |

**Course catalogue** (`/student/courses`):

- Every offering in the current window, with capacity, allocated, available,
  demand (submitted requests) and the demand ratio. For students it also shows
  their eligibility, with reasons, and their own status.
- Search (debounced), department, credits, "eligible only" and "seats left"
  filters and five sort orders, all kept in the URL so a view can be shared or
  refreshed. Card and table views; the table's row buttons use event delegation.
- Seat numbers refresh every 10 s while the tab is visible. The poll sends the
  last ETag and gets a bodiless 304 when nothing changed. Changed numbers flash
  briefly.
- Course detail (`/student/courses/:code`): full description, every
  eligibility reason, prerequisites met or not, eligible programmes, seats and
  status. Its back link keeps the catalogue filters.
- Admin courses (`/admin/courses`): a sortable table of all offerings with
  oversubscribed rows marked, and "Edit capacity" (reason required, never below
  the allocated seats, written to `audit_logs`).

**Eligibility pre-check** (`/student/eligibility`):

- Every offered course checked against the student's own record — programme,
  semester, credits and passed courses — with the record shown beside it, so
  they can see what the check judged them on.
- Courses are grouped into Eligible and Not eligible (collapsible), and each
  ineligible course lists **every** reason in plain English ("Needs semester 5
  — you're in semester 4", "Complete CS201 Data Structures first").
- It works while the window is still a draft. That is the point: check before
  registration opens, not after it closes.
- A registration banner on every student page counts down to the opening or
  closing, measured against the **server's** clock, so a wrong device clock
  can't mislead anyone.

**Registration cart** (`/student/cart`):

- Add or remove a course from the catalogue cards, the catalogue table or the
  course detail page. All three use the same delegated `data-action` handler
  and the same rule for what to offer, so an ineligible course explains itself
  instead of showing a dead button and a full cart says so.
- Rank up to five choices with Move up / Move down (drag-and-drop is an extra,
  never the only way). Focus stays on the moved item and a polite live region
  announces its new position. Unsaved changes are shown, warned about on
  leaving the page, and persisted with **Save draft**.
- **Submitting is one transaction with an idempotency key.** The confirm dialog
  generates one `crypto.randomUUID()` and reuses it for every retry, so a
  network failure is safe to retry and cannot create a duplicate. There is
  never a partial submission, and the arrival order comes from a database
  sequence. Afterwards the page shows an immutable receipt with the reference,
  the time and the arrival number.
- How this is guaranteed, with a sequence diagram:
  [docs/CONCURRENCY.md](docs/CONCURRENCY.md).

**Registration window** (`/admin/registration-window`):

- Schedule the window, choose the offered courses, and pick the allocation
  method. The method-specific settings render from the `AllocationConfig`
  union, so Preference + Priority shows the P1–P5 weights, the priority points
  and the tie-break seed, while FCFS shows why it rewards fast connections.
- Opening registration **freezes the policy**: method, weights, priority
  points, seed and the set of offered courses can no longer change. The service
  answers `409`, and a database trigger rejects the change even if it is
  attempted directly. Seats per course stay editable.
- Opening also notifies every student, in the same transaction. Every change,
  open and close is written to `audit_logs` with old and new values.

**Dashboards** — the student dashboard loads the window, the eligibility
summary and the notification count together with `Promise.allSettled`, so one
failing section shows its own Retry while the rest of the page still works. It
also shows the cart and what to do next. The admin dashboard shows the window,
its counts and the five most demanded courses.

How the JavaScript and TypeScript concepts are used is written up in
[docs/javascript-concepts.md](docs/javascript-concepts.md).

## Stack

| Layer    | Technology                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 6, React Router 7, CSS Modules                              |
| Backend  | Node 20.12+ (developed on 20 and 24), Express 5, TypeScript, `pg` (PostgreSQL 16), zod |
| Shared   | `@course-reg/shared` — typed API contracts (`ApiResponse<T>`, …)                       |
| Tooling  | ESLint (type-aware), Prettier, Vitest, React Testing Library, supertest                |
| Runtime  | Docker, Docker Compose                                                                 |

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

| Catalogue endpoint                        | Access    | Purpose                                                                                                                                                      |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/registration-windows/current`   | signed in | The OPEN (else latest) window and the server time                                                                                                            |
| `GET /api/courses`                        | signed in | Catalogue page: `search`, `department`, `credits`, `onlyAvailable`, `onlyEligible`, `sort`, `order`, `page`, `pageSize` (≤ 48); personal fields for students |
| `GET /api/courses/:code`                  | signed in | One course in full, prerequisites met or not                                                                                                                 |
| `GET /api/courses/seats`                  | signed in | Seat numbers only, with `ETag`; `If-None-Match` → `304`                                                                                                      |
| `GET /api/admin/courses`                  | admin     | Every offering with seats, demand and an oversubscribed flag                                                                                                 |
| `PATCH /api/admin/courses/:code/capacity` | admin     | `{ capacity, reason }`; `409` below the allocated seats; audited                                                                                             |

| Eligibility and window endpoint                   | Access  | Purpose                                                                                      |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `GET /api/eligibility`                            | student | Every offered course checked against the caller, plus their record and a summary. Any status |
| `GET /api/eligibility/:code`                      | student | The same for one course                                                                      |
| `GET /api/students/me/notifications/unread-count` | student | Unread notifications, for the dashboard                                                      |
| `GET /api/admin/registration-window`              | admin   | The window with its policy, counts and every course                                          |
| `PATCH /api/admin/registration-window`            | admin   | Schedule, offered courses and policy. `DRAFT` only: `409` once frozen                        |
| `POST /api/admin/registration-window/open`        | admin   | `DRAFT → OPEN`. Freezes the policy and notifies every student                                |
| `POST /api/admin/registration-window/close`       | admin   | `OPEN → CLOSED`                                                                              |

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

`seed:demo-submissions` deliberately leaves **aarav.sharma** and **priya.nair**
without a submission, so the cart and the atomic submit can be demonstrated
live rather than described.

### Proving the concurrency guarantees

```bash
npm run docker:demo:concurrent-submit                 # 50 students, default
npm run docker:demo:concurrent-submit -- --students=100
```

Every student fires their submit twice at the same instant with the same
idempotency key. The script then checks the database and prints PASS/FAIL for
duplicates, partial carts, one submission per student, and unique, gap-free
arrival numbers. Outside Docker: `npm run demo:concurrent-submit`. It refuses
to run with `NODE_ENV=production`.

### Demo accounts

> **Demo-only credentials.** They are published here so the app can be
> demonstrated. Never reuse them anywhere real.

| Role    | E-mail                        | Password      | Situation                                                                                                                    |
| ------- | ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Admin   | `admin@university.edu`        | `Admin@123`   | Manages courses, the registration window and allocation                                                                      |
| Student | `aarav.sharma@university.edu` | `Student@123` | CSE, semester 6: eligible for Artificial Intelligence (program relevance +25). **No submission** — use them to demo the cart |
| Student | `meera.iyer@university.edu`   | `Student@123` | Mechanical, semester 3: **not** eligible for Artificial Intelligence                                                         |
| Student | `rohan.verma@university.edu`  | `Student@123` | CSE, final year, graduating this term: highest priority (+20 +25 +40)                                                        |
| Student | `priya.nair@university.edu`   | `Student@123` | ECE, semester 5: eligible for Artificial Intelligence, no priority bonus. **No submission** — use them to demo the cart      |

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
