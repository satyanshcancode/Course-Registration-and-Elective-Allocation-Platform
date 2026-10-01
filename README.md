# Course Registration and Elective Allocation Platform

A web platform for fair course registration: a live course catalogue, an
eligibility pre-check before the window opens, a registration cart that submits
atomically, preference-and-priority allocation for oversubscribed electives,
waitlists that promote automatically as seats free up, add/drop, and a personal
registration history.

![Student dashboard](docs/screenshots/student-dashboard-1280-light.png)

| Document                                                   | What it covers                                    |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [docs/PROBLEM_STATEMENT.md](docs/PROBLEM_STATEMENT.md)     | The brief                                         |
| [docs/SPEC.md](docs/SPEC.md)                               | Scope, quality rules and conventions              |
| [docs/ALLOCATION.md](docs/ALLOCATION.md)                   | How seats are decided, and why it is fair         |
| [docs/CONCURRENCY.md](docs/CONCURRENCY.md)                 | The atomic submit, promotion and the seat race    |
| [docs/DATABASE.md](docs/DATABASE.md)                       | Schema, constraints and seed data                 |
| [docs/DESIGN.md](docs/DESIGN.md)                           | The visual system and every review round          |
| [docs/DEMO.md](docs/DEMO.md)                               | A step-by-step script for demonstrating it        |
| [docs/javascript-concepts.md](docs/javascript-concepts.md) | Where the JavaScript and TypeScript concepts live |

---

## The problem

When registration opens, hundreds of students try to register in the same few
minutes. A first-come-first-served queue rewards whoever has the fastest
internet connection, not whoever most needs or deserves the seat — and when an
elective is oversubscribed, the leftovers get settled by informal appeals to
the department.

This platform replaces that with something a registrar can defend:

- **Speed stops mattering.** Submitting early gives no advantage. Every
  submitted cart is collected first, and seats are decided afterwards, once,
  for everybody at the same time.
- **The rules are fixed before anyone plays.** Opening registration **freezes**
  the allocation policy — the method, the weights, the priority points, the
  tie-break seed and the set of offered courses. They cannot be changed
  afterwards, and the database refuses the change even if the application is
  wrong.
- **Every student gets a reason.** Not "you didn't get in", but their own
  score, how it was made up, and the cut-off the last seat went at.
- **A past run can be proved.** Each run stores its own input; re-running that
  stored input through the same algorithm version must produce the same output
  hash.

On the demo data the difference is concrete: first-come-first-served leaves
**78** cases of justified envy — a student who wanted a course more and scored
higher than somebody who got it — while preference-and-priority leaves **0**.

---

## Features

All seven features in the brief are built, plus the account and course
management the platform needs to run on real data instead of a seed.

| #   | Feature                                        | Status   |
| --- | ---------------------------------------------- | -------- |
| 1   | Course catalogue with live seat counts         | **Done** |
| 2   | Eligibility pre-check before the window opens  | **Done** |
| 3   | Registration cart with atomic submit           | **Done** |
| 4   | Fair allocation for oversubscribed electives   | **Done** |
| 5   | Waitlist with automatic promotion              | **Done** |
| 6   | Add/drop                                       | **Done** |
| 7   | Registration status and history                | **Done** |
| +   | Accounts, student records and course catalogue | **Done** |

### 1. Course catalogue — `/student/courses`

Every course offered this term, with capacity, seats taken, seats left, how
many students have requested it and the demand ratio. For a student it also
shows whether they can take it and why.

Seat numbers refresh every 10 seconds while the tab is visible; a hidden tab
sends nothing. The poll sends the last `ETag` and gets an empty **304** back
when nothing has changed, and changed numbers flash briefly rather than the
page reloading. Search, department, credits, "eligible only" and "seats left"
filters and five sort orders all live in the URL, so a view can be shared or
refreshed. Cards or table, the reader's choice.

![Course catalogue](docs/screenshots/student-courses-1280-light.png)

### 2. Eligibility pre-check — `/student/eligibility`

Every offered course checked against the student's own record — programme,
semester, credits and passed courses — with the record shown beside it, so they
can see exactly what the check judged them on. Ineligible courses list **every**
reason in plain English ("Needs semester 5 — you're in semester 4", "Complete
CS201 Data Structures first"), never just one.

It works while the window is still a draft. That is the whole point: find out
before registration opens, not after it closes.

![Eligibility check](docs/screenshots/student-eligibility-1280-light.png)

### 3. Registration cart — `/student/cart`

Add courses from the catalogue cards, the catalogue table or the course detail
page, then rank up to five with Move up / Move down. Drag-and-drop is an extra,
never the only way, and focus follows the moved item while a polite live region
announces its new position.

**Submitting is one transaction carrying an idempotency key.** The browser
generates one `crypto.randomUUID()` per attempt and reuses it for every retry,
so a dropped connection is always safe to retry and can never create a second
submission. There is no such thing as a half-submitted cart, and the arrival
number comes from a database sequence. Afterwards the page shows a receipt with
the reference, the time and the arrival number.

How that is guaranteed, with a sequence diagram:
[docs/CONCURRENCY.md](docs/CONCURRENCY.md).

![The cart](docs/screenshots/student-cart-1280-light.png)

### 4. Allocation — `/admin/allocation-runs`, `/student/results`

Two methods behind one interface: **FCFS** (submission order) and
**Preference + Priority** (student-proposing deferred acceptance). **Preview**
runs both on a fresh snapshot and shows them side by side without writing
anything, so the registrar can see what each would do before committing.
**Run** is one transaction and can complete only once per window.

Students get a plain-English explanation for every course they ranked — their
score, what it was made of, and what the last seat went for — and never see
another student's data.

![An allocation run](docs/screenshots/admin-allocation-run-1280-light.png)
![A student's results](docs/screenshots/student-results-1280-light.png)

### 5. Waitlists — `/student/waitlist`, `/admin/waitlists`

A student who missed out is queued for every course they ranked above whatever
they got, so a promotion is always an **upgrade**, never a sideways move. When
a seat frees up, the next eligible student in that queue takes it — and the
seat they release frees in turn, which can cascade. It all happens inside the
transaction of whatever freed the first seat, so an action and the promotions
it caused commit together or not at all.

Positions are never renumbered: a student's place is computed over the entries
still waiting, so the queue stays honest as people leave it.

![Waitlists](docs/screenshots/admin-waitlists-1280-light.png)

### 6. Add/drop — `/student/add-drop`

While the add/drop period is open, a student can drop their elective, add one
with a free seat, swap in a single step, or join and leave waitlists. Outside
the period every such request is refused by the server, and the button says why
rather than being greyed out with no explanation. A swap moves the seat in one
step: if the new course fills up first, the student keeps the one they have.

![Add or drop a course](docs/screenshots/student-add-drop-1280-light.png)

### 7. Status and history — `/student/history`, `/student/notifications`

Where the student stands right now, and the whole timeline that got them there:
submitted, allocated, waitlisted, promoted, added, dropped. Events carry
structured facts, not prebuilt sentences, so the wording lives in one place on
the client and can change without rewriting history.

![Registration history](docs/screenshots/student-history-1280-light.png)

### Accounts, records and the course catalogue

**Administrators create student accounts; students never self-register**, and
never edit their own academic data — it is what eligibility and priority are
judged on, so it belongs to the registrar. A student activates their account
from an e-mailed, single-use link. Courses and their rules are maintained at
`/admin/course-catalogue`, by hand or from a CSV in a preview-then-confirm
flow. Nothing is ever deleted: an account is deactivated, a course is retired,
and every submission, enrolment and result keeps pointing at a row that still
exists.

![Students](docs/screenshots/admin-students-1280-light.png)
![Course catalogue administration](docs/screenshots/admin-course-catalogue-1280-light.png)

---

## Architecture

```mermaid
flowchart TB
    subgraph browser["Browser"]
        pages["Pages<br/>student · admin · public"]
        hooks["Hooks<br/>useAsync · useCart · usePolling"]
        apimod["API modules<br/>apiClient + one per area"]
        pages --> hooks --> apimod
    end

    shared["@course-reg/shared<br/>ApiResponse&lt;T&gt;, domain models,<br/>enums, discriminated unions"]

    subgraph api["Backend (Express 5)"]
        mw["Middleware<br/>requireAuth · requireRole<br/>rejectCrossOriginWrites · rate limits"]
        routes["Routes"]
        controllers["Controllers<br/>validate (zod), shape the response"]
        services["Services<br/>all business rules + transactions"]
        pure["Pure rule modules<br/>eligibility · catalogue · cart<br/>window · add/drop"]
        engine["Allocation engine<br/>pure: no DB, no clock, no random"]
        repos["Repositories<br/>parameterised SQL only"]
        mw --> routes --> controllers --> services
        services --> pure
        services --> engine
        services --> repos
    end

    db[("PostgreSQL 16<br/>constraints · triggers<br/>advisory locks")]
    mail["Mailer<br/>SMTP · memory · log"]

    apimod -- "HTTPS, cr_session cookie" --> mw
    repos --> db
    services --> mail
    apimod -. imports .-> shared
    controllers -. imports .-> shared
```

**The rules that keep it that shape:**

- **Layers go one way.** Routes → controllers → services → repositories. There
  is no SQL in a controller and no business logic in one; there is no `fetch`
  in a React component.
- **One contract, both sides.** `shared/` holds the API types, so a renamed
  field is a compile error rather than a runtime surprise. It is consumed as
  TypeScript source in development and as a compiled build in production.
- **PostgreSQL is the source of truth**, not a place to store what the
  application already decided. Capacity, status values, uniqueness and the
  frozen policy are enforced by constraints and triggers, so the database
  refuses a bad write even if the application asks for one.
- **The rules are pure and tested without a database.** Eligibility, catalogue,
  cart, window, add/drop and the whole allocation engine are functions of their
  input.
- **Authorization is server-side, always.** Seat counts, eligibility, identity
  and priority coming from a browser are never trusted.

```text
.
├── backend/    Express API (routes → controllers → services → repositories)
│   ├── src/allocation/   the pure allocation engine
│   ├── src/database/     migrations, transactions, seed
│   └── tests/            integration tests against a real PostgreSQL
├── frontend/   React SPA (components → hooks → api)
│   ├── src/components/   the component library
│   ├── src/pages/        one folder per area
│   └── src/styles/       reset, tokens, base
├── shared/     Types shared by both sides
├── docs/       Specification, design, allocation, concurrency, demo
├── docker/     PostgreSQL init scripts (creates the test database)
├── scripts/    The documentation screenshot runner
├── docker-compose.yml        Development stack (hot reload)
└── docker-compose.prod.yml   Production-like stack (nginx on :8080)
```

---

## Tech stack

| Part                        | Used for                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **React 19**                | The whole UI. Function components and hooks only — no class components, no state library needed      |
| **TypeScript 5.9**          | Everywhere, `strict` plus `noUncheckedIndexedAccess`. `any` is a lint error                          |
| **Vite 6**                  | Dev server with hot reload, and the production build with route-level code splitting                 |
| **React Router 7**          | Routing, lazy route chunks, and the layout routes that guard student and admin areas                 |
| **CSS Modules + CSS3**      | All styling. Design tokens as custom properties; no Tailwind, no CSS-in-JS                           |
| **Node 20.12+**             | The backend runtime (developed on 20, verified on 22 and 24)                                         |
| **Express 5**               | HTTP, middleware, routing                                                                            |
| **PostgreSQL 16**           | The source of truth: constraints, triggers, transactions, `FOR UPDATE`/`FOR SHARE`, advisory locks   |
| **`pg`**                    | The database driver. Parameterised SQL only — no ORM, so the SQL is visible and reviewable           |
| **zod**                     | Validating every request body and query at the boundary, where `unknown` becomes a typed value       |
| **jsonwebtoken + bcryptjs** | The session cookie and password hashing                                                              |
| **nodemailer**              | Invitation and password-reset e-mail                                                                 |
| **Mailpit**                 | Catches every e-mail in development so the flows can be demonstrated                                 |
| **Vitest**                  | Every test, in all three workspaces                                                                  |
| **React Testing Library**   | Component and page tests, driven the way a user drives the UI                                        |
| **axe-core**                | An accessibility check on every page and component                                                   |
| **supertest**               | Integration tests through the real Express app against a real database                               |
| **fast-check**              | Property-based tests for allocation and waitlist promotion                                           |
| **ESLint (type-aware)**     | `strictTypeChecked` + `stylisticTypeChecked`, plus a11y and React Hooks rules; zero warnings allowed |
| **Prettier**                | Formatting, checked in CI-style with `format:check`                                                  |
| **Docker + Compose**        | The whole stack, development and production-like                                                     |

---

## Running it

### With Docker (recommended)

Requires Docker Desktop, or Docker Engine with Compose v2.

```bash
cp .env.example .env          # then change POSTGRES_PASSWORD, DATABASE_URL and JWT_SECRET
npm run docker:up             # docker compose up --build -d
npm run docker:demo:reset -- --stage=open
```

| URL                              | What                                            |
| -------------------------------- | ----------------------------------------------- |
| http://localhost:5173            | The app (Vite, hot reload)                      |
| http://localhost:4000/api/health | Backend health (API + database)                 |
| http://localhost:8025            | **Mailpit** — every invitation and reset e-mail |
| localhost:5432                   | PostgreSQL                                      |
| localhost:1025                   | Mailpit's SMTP, which the backend sends through |

The backend waits for PostgreSQL to be healthy, applies migrations, then starts
with hot reload. Source folders are bind-mounted; `node_modules` live in named
volumes so host and container dependencies never mix. File watching uses
polling, so hot reload works on Windows and macOS bind mounts.

| Script                        | Does                                                |
| ----------------------------- | --------------------------------------------------- |
| `npm run docker:up`           | Build and start the dev stack in the background     |
| `npm run docker:logs`         | Follow the logs                                     |
| `npm run docker:down`         | Stop it (keeps the data)                            |
| `npm run docker:reset`        | Stop and **delete the volumes** (database, modules) |
| `npm run docker:prod`         | Build and start the production stack on :8080       |
| `npm run docker:prod:down`    | Stop the production stack                           |
| `npm run docker:admin:create` | Create an administrator account interactively       |

After changing dependencies, refresh the `node_modules` volumes with
`npm run docker:reset && npm run docker:up`.

**Production stack:** `npm run docker:prod`, then open http://localhost:8080.
nginx serves the built frontend and proxies `/api` to the backend; only port
8080 is published. It starts with an empty database plus the migrations — the
seed and every demo script refuse to run there, with no override — so the first
administrator is created with `npm run admin:create`.

### Without Docker

Requires Node.js ≥ 20.12 and a PostgreSQL 16 server.

```bash
cp .env.example .env    # point DATABASE_URL at your PostgreSQL
npm install
npm run migrate
npm run seed            # optional demo data
npm run dev             # backend on :4000, frontend on :5173
```

`docker compose up -d postgres` runs just the database in Docker if that is
easier. Without `SMTP_HOST` set, account e-mails are written to the backend log
with the link included, so the invitation and reset flows still work.

---

## Demo accounts and demo stages

> **Demo-only credentials.** They are published here so the project can be
> demonstrated, and the sign-in page lists them in a **development build only**
> — the component holding them is removed by the bundler otherwise. Never reuse
> them anywhere real.

| Role    | E-mail                        | Password      | Situation                                                                                        |
| ------- | ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Admin   | `admin@university.edu`        | `Admin@123`   | Courses, the registration window, allocation, students                                           |
| Student | `aarav.sharma@university.edu` | `Student@123` | CSE, semester 6. Eligible for AI (programme relevance +25). **No submission** — use for the cart |
| Student | `priya.nair@university.edu`   | `Student@123` | ECE, semester 5. Eligible for AI, no priority bonus. **No submission**                           |
| Student | `meera.iyer@university.edu`   | `Student@123` | Mechanical, semester 3. **Not** eligible for AI                                                  |
| Student | `rohan.verma@university.edu`  | `Student@123` | CSE, final year, graduating this term: the highest priority (+20 +25 +40)                        |

The other 296 generated students also use `Student@123`; their e-mail is their
roll number, e.g. `cse24004@university.edu`.

### Demo stages

One command puts the database in any state you want to demonstrate:

```bash
npm run docker:demo:reset -- --stage=draft      # base seed; the window is not open yet
npm run docker:demo:reset -- --stage=open       # + ~150 submissions
npm run docker:demo:reset -- --stage=closed     # + registration closed
npm run docker:demo:reset -- --stage=allocated  # + a real allocation run
npm run docker:demo:reset -- --stage=add-drop   # + the add/drop period open
```

Each stage is cumulative and goes through the **real service**, never a
shortcut `UPDATE`: closing freezes the policy and notifies every student, and
allocating runs the same transaction the admin's button runs. Outside Docker,
`npm run demo:reset -- --stage=...`. It refuses to run in production.

The seed deliberately leaves **aarav.sharma** and **priya.nair** without a
submission, so the cart and the atomic submit can be demonstrated live rather
than described. It also sets up the headline case: **Artificial Intelligence**,
20 seats, 112 requests.

### Proving the concurrency guarantees

```bash
npm run docker:demo:concurrent-submit                 # 50 students, default
npm run docker:demo:concurrent-submit -- --students=100
npm run docker:demo:seat-race                         # 100 students, 10 seats
npm run docker:demo:seat-race -- --students=200 --seats=20
```

The first fires every student's submit **twice at the same instant with the
same idempotency key**, then checks the database and prints PASS/FAIL for
duplicates, partial carts, one submission per student, and unique gap-free
arrival numbers. The second prepares a course with exactly N free seats and
fires one "add, or join the waitlist if full" per student simultaneously, then
reports enrolled, waitlisted, overbooked, duplicate enrolments and whether the
waitlist positions are unique and consecutive. Both are explained in
[docs/CONCURRENCY.md](docs/CONCURRENCY.md).

A full walkthrough to demonstrate the project is
[docs/DEMO.md](docs/DEMO.md).

---

## How allocation works

The short version; the rule book, the worked example and the fairness argument
are in [docs/ALLOCATION.md](docs/ALLOCATION.md).

Only **submitted** carts take part, and each student gets **at most one**
elective from their ranked list — one they ranked, are still eligible for
(re-checked from the database at allocation time, never trusted from when the
cart was saved), and that the window offers.

**Preference + Priority** gives each student a score **per course**:

```
score = preference weight  (1st 100 · 2nd 80 · 3rd 60 · 4th 40 · 5th 20)
      + final year         (+20)
      + programme relevance(+25)
      + graduation urgency (+40)
```

Ties are broken by one seeded number per student, drawn once, so the ordering
is stable and the run is repeatable. Seats are then assigned by
**student-proposing deferred acceptance**: every student applies to their top
choice, each course provisionally keeps its highest scorers up to capacity and
releases the rest, and the released students apply to their next choice. It
settles because every rejection moves a student strictly down their own list.

The result is **no justified envy**: nobody is left wanting a course more than
somebody who got it while also scoring higher for it. **FCFS** is implemented
too, purely so the two can be compared on the same data — on the demo seed it
leaves 78 such cases against 0.

Each run then writes its input snapshot, and
`POST /api/admin/allocation-runs/:id/verify` re-runs **that stored input**
through the same algorithm version and compares output hashes. Rebuilding the
input from today's database would prove nothing, which is why it does not.

---

## API overview

Every endpoint answers `ApiResponse<T>` — `{ success, data, message? }`.
Student endpoints live under `/api/students/me/...` and take the student's
identity from the session cookie, never from the URL or the body.

**Authentication and accounts**

| Endpoint                          | Access    | Purpose                                                            |
| --------------------------------- | --------- | ------------------------------------------------------------------ |
| `POST /api/auth/login`            | public    | Sign in; sets the session cookie                                   |
| `POST /api/auth/logout`           | public    | Clears it                                                          |
| `GET /api/auth/me`                | signed in | The current user                                                   |
| `GET /api/auth/activation/:token` | public    | Is this link usable? Spent, expired and unknown are **one** answer |
| `POST /api/auth/activate`         | public    | Sets the first password and signs in                               |
| `POST /api/auth/forgot-password`  | public    | The same answer whether or not the address exists                  |
| `POST /api/auth/reset-password`   | public    | Replaces the password and signs every other device out             |
| `PUT /api/account/password`       | signed in | Change password, either role                                       |

**Catalogue and eligibility**

| Endpoint                                | Access    | Purpose                                                      |
| --------------------------------------- | --------- | ------------------------------------------------------------ |
| `GET /api/registration-windows/current` | signed in | The window, plus the **server's** time                       |
| `GET /api/courses`                      | signed in | The catalogue: search, filters, sort, paging                 |
| `GET /api/courses/:code`                | signed in | One course in full, prerequisites met or not                 |
| `GET /api/courses/seats`                | signed in | Seat numbers only, with an `ETag`; `If-None-Match` → **304** |
| `GET /api/eligibility`                  | student   | Every offered course checked against the caller              |

**The cart, allocation and waitlists**

| Endpoint                                     | Access  | Purpose                                                        |
| -------------------------------------------- | ------- | -------------------------------------------------------------- |
| `GET` / `PUT /api/preferences`               | student | Read and save the draft cart in rank order                     |
| `POST /api/registration/submit`              | student | One atomic submit; needs an idempotency key                    |
| `POST /api/admin/allocation/preview`         | admin   | Both methods on a fresh snapshot. Writes nothing               |
| `POST /api/admin/allocation/run`             | admin   | `CLOSED → ALLOCATED`, once per window                          |
| `POST /api/admin/allocation-runs/:id/verify` | admin   | Re-runs the stored snapshot and compares hashes                |
| `GET /api/allocation/results`                | student | The caller's own outcome and the reasoning behind it           |
| `GET /api/students/me/waitlist`              | student | The caller's own queues, with live positions                   |
| `POST /api/admin/enrollments/:id/withdraw`   | admin   | Releases a seat and promotes whoever is next, cascade included |
| `POST /api/admin/waitlists/process`          | admin   | The safety sweep: offers every free seat to its waitlist       |

**Add/drop and the student's record**

| Endpoint                             | Access  | Purpose                                   |
| ------------------------------------ | ------- | ----------------------------------------- |
| `POST /api/students/me/add-drop/...` | student | Add, drop, swap, join or leave a waitlist |
| `GET /api/students/me/status`        | student | Where they stand now                      |
| `GET /api/students/me/history`       | student | Their timeline, newest first              |
| `GET /api/students/me/notifications` | student | Their messages, with read and read-all    |

**Administration**

| Endpoint                                                       | Access | Purpose                                                    |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `GET` / `PATCH /api/admin/registration-window`                 | admin  | The window and its policy. `DRAFT` only: `409` once frozen |
| `POST /api/admin/registration-window/open                      | close` | admin                                                      | Freeze the policy and notify everyone, then close |
| `GET /api/admin/courses`                                       | admin  | Offerings with seats, demand and an oversubscribed flag    |
| `PATCH /api/admin/courses/:code/capacity`                      | admin  | `409` below the allocated seats; audited                   |
| `GET`/`POST`/`PATCH /api/admin/course-catalogue`               | admin  | Course records and their rules; retire and reinstate       |
| `GET`/`POST`/`PATCH /api/admin/students`                       | admin  | Student accounts; invite, deactivate, reactivate           |
| `POST /api/admin/{students,course-catalogue}/import[/preview]` | admin  | CSV import: preview judges, confirm re-judges and writes   |

---

## Security

- **Sessions are an httpOnly cookie.** `cr_session` holds an HS256 JWT (user id
  - role, 8 hours), `SameSite=Strict`, `Path=/api`, `Secure` in production. The
    token never appears in a response body, in `localStorage` or in reach of
    JavaScript.
- **Authorization is re-checked on every request.** The cookie is verified and
  the user re-loaded from the database; `requireRole` answers `403` for the
  wrong role. A student's identity always comes from the session.
- **No account enumeration.** An unknown e-mail and a wrong password give the
  same `401`, and both run a bcrypt comparison so the timing matches.
  `/forgot-password` answers identically for a known and an unknown address —
  same status, same body, even when sending fails — and its rate limiter is
  keyed on the IP **alone**, because keying it on the e-mail would make the
  limiter itself the oracle the endpoint refuses to be.
- **Links are stored as hashes.** Only the SHA-256 of an activation or reset
  token reaches the database, so a leaked table cannot be turned back into
  working links. Unknown, spent and expired are one answer. Redeeming one is a
  transaction over a locked row, so two requests carrying the same link cannot
  both succeed.
- **Changing a password ends every other session**, by comparing
  `users.password_changed_at` with each token's `iat`; the device that made the
  change gets a fresh cookie in the same response.
- **Brute force and abuse are rate limited:** failed sign-ins per IP and
  e-mail, the public account endpoints per IP, and submits per student.
- **CSRF:** `SameSite=Strict`, and state-changing requests arriving with a
  foreign `Origin` are rejected with `403`.
- **SQL injection:** parameterised statements only. No value is ever
  interpolated into a statement, anywhere.
- **The client is never trusted** for seat counts, eligibility, identity or
  priority. Every one is recomputed on the server from its own rows.
- **Admin actions are audited.** Every create, edit, import, invitation,
  deactivation, retirement, capacity change, window transition and allocation
  run writes an `audit_logs` row with its old and new values. Admin sign-ins
  are recorded too.
- **Nothing is deleted.** Accounts deactivate, courses retire. Every historical
  row keeps pointing at something that still exists.

`JWT_SECRET` must be at least 32 characters, and the server refuses to start in
production with the example value. `.env` is gitignored; `.env.example`
documents every setting and contains no secret.

---

## Testing

```bash
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # tsc --noEmit in every workspace
npm run test           # Vitest in all three workspaces
npm run build          # shared → backend → frontend
npm run format:check   # Prettier
```

| Workspace   | Files   | Tests    | What                                                                                                                                  |
| ----------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/`   | 4       | 19       | Contracts, type guards, domain rules                                                                                                  |
| `backend/`  | 41      | 636      | Pure rules, the allocation engine, property-based tests, and integration tests through the real Express app against a real PostgreSQL |
| `frontend/` | 59      | 443      | Components, hooks, pages and utilities with React Testing Library, plus an axe check on each                                          |
| **Total**   | **104** | **1098** |                                                                                                                                       |

The backend integration tests need PostgreSQL running (`npm run docker:up`).
They use a separate `<db>_test` database, never the development one, and
truncate it between tests. They cover the things only a real database can
prove: that the atomic submit is atomic, that a fault injected mid-allocation
rolls back every table, that concurrent promotions do not deadlock or
double-book, and that the constraints refuse what they should.

Vitest runs at most 2 workers per workspace; raise it with
`VITEST_MAX_WORKERS=<n>` on a machine with memory to spare.

---

## Limitations

Honest about what this is and is not:

- **Priority scoring is a mock**, as the brief specifies. Final year,
  programme relevance and graduation urgency are plausible stand-ins for
  whatever a real registrar would weigh; the weights are configurable per
  window, but they are not a real institution's policy.
- **Allocation runs inside the backend process**, not in a worker. It is a pure
  function and takes about 14 ms for 150 students over 20 courses, so for this
  scale a queue and a separate container would be ceremony. The strategy
  interface is there so one can be added without restructuring.
- **One elective per student per window.** The model allows exactly one, which
  is what the brief describes; multi-course allocation would change the
  matching problem, not just the code.
- **One registration window at a time** is what the UI assumes, even though the
  schema allows several.
- **No live updates beyond seat counts.** Seats poll every 10 seconds; results
  and waitlist positions refresh when the page is loaded or retried. There are
  no WebSockets.
- **Not deployed.** It runs locally under Docker, including a production-like
  stack, but there is no hosted environment and no CI pipeline.
- **E-mail is Mailpit in development.** The SMTP mailer is real and
  configurable, but it has only ever been pointed at a local catcher.
- **No bulk student self-service.** A student cannot correct their own record,
  by design — but that means a wrong record needs a registrar.

---

## Future scope

- **More allocation methods.** The engine takes a new strategy as one class and
  one `case`; the factory's `default` branch takes a `never`, so the build
  fails until the case exists. A **weighted lottery** is the obvious next one —
  random within priority bands, which some institutions prefer precisely
  because it cannot be gamed — alongside a proper serial dictatorship and a
  course-proposing variant for comparison.
- **An allocation simulator**, so a registrar can try weights against last
  term's data before freezing a policy.
- **A help page with a captioned video** walking through registration. It is
  specified but not built; `/student/help` currently redirects to the dashboard
  rather than showing an unfinished page.
- **A `/dev/javascript-lab` page**, hidden in production, demonstrating the
  language concepts interactively. The written version is
  [docs/javascript-concepts.md](docs/javascript-concepts.md).
- **Deployment**: a hosted environment, a CI pipeline running lint, typecheck,
  tests and build on every push, and real SMTP.
- **A worker container and a job queue** if allocation ever has to run for tens
  of thousands of students, plus Redis for seat counts if polling stops being
  enough.
- **Analytics for the registrar**: demand trends across terms, which
  prerequisites block the most students, how often add/drop is used.
- **A faculty role**, between student and registrar, able to see their own
  courses' rosters without administrative rights.
