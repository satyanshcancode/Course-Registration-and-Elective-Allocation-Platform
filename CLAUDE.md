# CLAUDE.md — rules for every session

## Before any task

1. **Scope** comes from `docs/PROBLEM_STATEMENT.md` (the 7 features listed in
   SPEC "Scope"). Build only those unless the user explicitly asks for a
   stretch goal. SPEC.md "Stretch goals" (extra strategies, simulator,
   analytics, Redis, worker container, faculty role, cloud deploy, …) are
   **out of scope** by default.
2. **Quality, architecture, naming, structure and syllabus rules** come from
   `docs/SPEC.md` — read the sections the task touches, not the whole file.
3. See **Standard phase workflow** below for how a phase runs end to end.

## Architecture

- Monorepo with npm workspaces: `frontend/`, `backend/`, `shared/`.
- `shared/` holds typed API contracts (`ApiResponse<T>` etc.) used by both sides.
  It exposes a `source` export condition (TS source, used by Vite, tsx, Vitest
  and `tsc --noEmit`) and a compiled `dist/` (used by the production backend).
- **Frontend layering:** components → hooks → api modules
  (`src/api/apiClient.ts`, `courseApi.ts`, `registrationApi.ts`,
  `allocationApi.ts`, `adminApi.ts`). No raw `fetch` in components. No business
  logic in components.
- **Backend layering:** routes → controllers → services → repositories.
  No SQL in controllers; no business logic in controllers.
- Every endpoint returns `ApiResponse<T>` (`{ success, data, message? }`).
- PostgreSQL is the single source of truth. `pg` with **parameterised SQL only**
  — never interpolate values into SQL strings.
- Multi-step writes go through `withTransaction(pool, fn)`
  (`backend/src/database/transaction.ts`).
- Schema changes are plain `.sql` migrations in
  `backend/src/database/migrations`, named `NNNN_description.sql`, applied by
  `npm run migrate` and tracked in `schema_migrations`. Never edit an applied
  migration; add a new one.
- Database design, constraints and seed data are documented in
  `docs/DATABASE.md`; update it with every schema change.
- Seat counts live on the offering (`registration_window_courses`), not on
  `courses`. `allocated_count` is maintained by a trigger on `enrollments`;
  never update it by hand in application code.
- Status/role/method values are `TEXT` + named `CHECK` constraints mirrored by
  the const tuples in `shared/src/domain/enums.ts`; change both together.
- DB rows (snake_case, `backend/src/repositories/rows.ts`) are mapped to shared
  camelCase models in `backend/src/repositories/mappers.ts`, never in `shared/`.
- Backend integration tests (`backend/tests/integration`) use the separate
  `<db>_test` database and truncate it between tests; they need PostgreSQL
  running (`npm run docker:up`). Deterministic randomness uses
  `backend/src/utils/random.ts` (seeded, reproducible).
- No Redis and no separate worker container in this scope; allocation runs
  inside the backend. Allocation strategies are classes implementing a common
  `AllocationStrategy` interface (in `backend/src/allocation/`) so more
  strategies, or a worker, can be added later without restructuring.
- Authorization is enforced server-side. Never trust client-side seat counts,
  eligibility, identity or priority values.

## Authentication and authorization

- Sessions are an HS256 JWT (`sub` = user id, `role`, 8 h expiry) in the
  httpOnly, SameSite=Strict cookie `cr_session` (path `/api`, Secure in
  production). Never put the token in a response body, localStorage or JS.
- Backend middleware (`backend/src/middleware/`):
  - `createRequireAuth(authService)` (built once in `routes/index.ts` as
    `requireAuth`): verifies the cookie, re-loads the user, sets `req.auth`
    (`AuthContext` in `backend/src/types/auth.ts`, typed via
    `backend/src/types/express.d.ts`). 401 otherwise.
  - `requireRole('ADMIN' | 'STUDENT')`: 403 on role mismatch. Mount
    `router.use(requireAuth, requireRole(...))` on every admin/student router.
  - `rejectCrossOriginWrites(origins)`: 403 for POST/PUT/PATCH/DELETE with a
    foreign `Origin`. `createLoginRateLimiter`: failed logins per IP + e-mail.
- **Student identity comes from `req.auth` only.** Student endpoints live under
  `/api/students/me/...`, call `requireStudentId(req)` and never accept a
  student id from the URL, query or body. Admin endpoints use `getAuth(req)`.
- Record security-relevant admin actions in `audit_logs`
  (`auditLogRepository.record`); admin logins are recorded as `LOGIN`.
- Frontend: `AuthProvider` (inside the router) + `useAuth()`; guard pages with
  `<ProtectedRoute role="...">` as a layout route. API calls go through
  `apiClient` (`credentials: 'include'`); a 401 on any call except `/auth/me`
  and `/auth/login` ends the session and redirects to `/login`.
- Demo credentials are in the README; `JWT_SECRET` comes from `.env`
  (min 32 chars; production refuses the example value).

## Design and UI conventions

- All UI follows `docs/DESIGN.md`: the catalogue concept, Source Serif 4
  headings, IBM Plex Sans/Mono, one accent colour (deep green), hairlines, small
  radii, shadows only on floating things, and its **Banned** list.
- Tokens live in `frontend/src/styles/variables.css`. Never hard-code a colour,
  space, radius, font size, z-index or duration. The dark theme only redefines
  colour tokens.
- Components live in `frontend/src/components/<Name>/` as `<Name>.tsx`,
  `<Name>.module.css` and `index.ts`, with a typed `<Name>Props` interface. Keep
  CSS Module selectors flat (one class, or a class plus an attribute or state).
  Use `data-*` attributes for variants such as tone and state.
- Build pages from the library: `PageHeader` (kicker + serif title, focuses
  the `h1`, sets `document.title`), `FormField` for every form control (label,
  hint, error, `aria-describedby`), `DataTable<T>` for tabular data, and
  `EmptyState`, `Skeleton` and `ErrorMessage` for the async states. Icons go
  through `Icon`, never `lucide-react` directly.
- Status is never colour alone: use `StatusBadge` / `Badge` (icon + text), and
  `SeatMeter` always prints its numbers.
- `AppShell` renders exactly one navigation landmark (sidebar/rail or the phone
  bottom bar, chosen with `useMediaQuery`). Nav items come from
  `layouts/navigation.ts` and include in-scope features only.
- `/dev/components` (component gallery) is registered only in DEV builds.

## Catalogue conventions (Phase 5)

- Course DTOs live in `shared/src/api/courses.ts`. Courses are addressed by
  `code`; internal ids never leave the server. Personal fields (`personal`:
  eligibility + `myStatus`) are computed only for the calling student, from
  their own rows, and are `null` for admins.
- Catalogue logic is pure and unit-tested (`backend/src/services/catalogueRules.ts`).
  A catalogue request runs a fixed number of aggregated queries; keep it that
  way (the integration test counts queries for 5 vs 25 courses).
- Live seats: `useLiveSeats` polls `GET /api/courses/seats` every 10 s (paused
  while the tab is hidden) with `If-None-Match`. Pages merge the numbers with
  `withLiveSeats` / `seatsNewerThan` instead of refetching. The server
  compares ETags with `etagMatches`, **not** `req.fresh`: browsers send
  `Cache-Control: no-cache` with `fetch(..., { cache: 'no-store' })`, and
  `req.fresh` then never returns 304.
- Catalogue filters live in the URL (`useCatalogueFilters`,
  `utils/catalogueFilters.ts`); defaults are left out of the URL.
- Table row actions use event delegation: buttons carry `data-action` and
  `data-course-code`, and one `onBodyClick` on the `DataTable` body handles them
  through `findRowAction` (`utils/tableActions.ts`). No per-row listeners.
- Format ratios with `formatDemandRatio` and requests with `describeDemand`
  (`utils/courseText.ts`); don't format them by hand.
- API failures carry `httpStatus` on the client (`ClientFailure`), and
  `useAsync`'s error state keeps the thrown `error`. Use `isNotFound(error)`
  for proper 404 states.

## Registration window conventions (Phase 6)

- The window lifecycle is `DRAFT -> OPEN -> CLOSED` (ALLOCATED comes later,
  from the allocation run). Transitions are decided by the pure rules in
  `backend/src/services/registrationWindowRules.ts` and applied by
  `registrationWindowService.ts` — never in a controller.
- **The policy freezes when the window opens.** The allocation method, the
  weights, the priority points, the seed and the SET of offered courses cannot
  change afterwards. The service answers 409; migration 0008's triggers reject
  the write even if application code is wrong. A course's capacity and the
  schedule stay editable on purpose.
- Whether a student may submit is `canSubmitNow(window, now)` in the same
  rules file — one place, already tested. Never re-check it inline.
- `AllocationConfig` is a discriminated union on `method`. Validate it with
  `z.discriminatedUnion`, hold it directly in React state, and narrow on
  `method` to decide what to render. No optional "sometimes" fields, no casts.
- Eligibility reasons are a union on `type` carrying codes and names, never
  ids. The frontend formats them in exactly one place
  (`utils/eligibilityText.ts`), whose `default` branch takes a `never` so a new
  reason type fails to compile until it is handled.
- Countdowns use the server's clock: measure `serverTime - Date.now()` where
  the response arrives (never during render) and add that offset. The ticking
  value sits in no live region.

## Registration cart conventions (Phase 7)

- **Submitting always goes through `submitService.submit`**, never through a
  repository or a controller: it is one transaction that locks the window
  `FOR SHARE`, locks the student's own submission row `FOR UPDATE`,
  re-validates eligibility from freshly read rows, takes the arrival number
  from `nextval('preference_submission_sequence')` and writes the history row
  and the notification. Any throw rolls all of it back.
- **Every submit carries an idempotency key.** The client generates one
  `crypto.randomUUID()` per attempt and reuses it for every retry; the server
  replays the first result for the same key and cart, answers `CART_CHANGED`
  for the same key with a different cart, and `ALREADY_SUBMITTED` otherwise.
  Never generate a fresh key for a retry.
- **Inside a transaction, use the client-bound repositories** (`preferencesFor`,
  `catalogueFor`, `studentsFor`, …). Reading through a pool-bound repository
  while holding a transaction client deadlocks the pool under load; this cost
  a day once, and `docs/CONCURRENCY.md` records it.
- Cart problems are a discriminated union (`CartProblem`) carried in the
  failure's `details` and read with `readCartProblems`, so the UI can put each
  message beside the right item.
- The add/remove buttons on the catalogue card, the catalogue table and the
  course detail page carry `data-action` + `data-course-code` and have no
  `onClick`; one delegated listener per surface handles them, and
  `cartActionFor` is the single place deciding what to draw.
- The cart page's reordering must stay usable from the keyboard: Move up /
  Move down are the mechanism, drag-and-drop is an enhancement.

## Allocation conventions (Phase 8)

- **The engine in `backend/src/allocation/` stays pure**: no database, no
  clock, no `Math.random`, no imports from `services/` or `repositories/`.
  It is a function of its input, which is what makes a run reproducible and
  the property-based tests possible. Randomness enters as a seed; the runtime
  measurement is added by `runStrategy`, which owns a clock.
- **Allocation only happens through `allocationService.run`** — never from a
  controller, a script or a repository. It is one transaction that locks the
  window `FOR UPDATE`, builds the snapshot, runs the window's FROZEN
  strategy, writes results, enrollments, waitlist entries, history,
  notifications and the audit row, then marks the run COMPLETED and the
  window ALLOCATED. It can complete once per window.
- Strategies are classes implementing `AllocationStrategy`, chosen by
  `strategyFor(method)` whose `default` branch takes a `never`. Bump
  `algorithmVersion` whenever the output could change: `verify` compares it.
- `input_snapshot` IS the engine's input as JSON. Never rebuild it from
  today's database when verifying — that is what makes the check meaningful.
- Timestamps on `allocation_runs` come from the database's `now()`, not a JS
  Date: `started_at` already does, and mixing clocks trips the
  `finished_at >= started_at` CHECK.
- Justified envy is always measured on the preference-priority scale, even
  for an FCFS run, so the two methods are compared on the same terms.
- Explanations are a discriminated union in `shared/src/api/allocation.ts`,
  formatted in exactly one place (`frontend/src/utils/allocationText.ts`)
  whose `default` branch takes a `never`. They carry the student's own
  standing only — never another student's identity or data.

## Waitlist promotion conventions (Phase 9)

- **Every path that frees a seat calls `waitlistPromotionService.processFreedSeats`**
  — the capacity endpoint, the admin withdrawal, the sweep, and the student
  drop when it arrives. It runs on the CALLER's client, inside the caller's
  transaction, so an action and the promotions it caused commit together.
- Promotion is serialised per window by `pg_advisory_xact_lock(hashtext(window_id))`,
  taken first. Not row locks: a cascade discovers its courses as it goes, so
  two cascades would take them in opposite orders and deadlock. The reasoning
  is in `docs/CONCURRENCY.md`.
- A promotion is only ever an **upgrade**. Releasing the lower-ranked seat
  frees it in turn, which is the cascade; it terminates because every step
  strictly improves one student's rank.
- **Waitlist positions are never renumbered.** `position` is written once by
  the allocation run; what a student sees is `rank() OVER (PARTITION BY
course_id ORDER BY position)` over the entries still `WAITING`.
- `allocation_results` rows are never rewritten — they are the evidence a run
  is reproducible. What the student is shown is that stored explanation
  brought up to date by the pure `allocationResultsOverlay.ts`.
- Waitlist wording lives in exactly one place
  (`frontend/src/utils/waitlistText.ts`), whose `default` branches take a
  `never`.

## Accounts and records conventions (Phase 12)

- **Administrators create student accounts; students never self-register** and
  never edit their own academic data (it is what eligibility and priority are
  judged on). Student endpoints stay read-only about the record.
- Activation and reset links are single-use secrets: only their SHA-256 hash is
  stored in `account_tokens`, and unknown, spent and expired are ONE answer so a
  guess learns nothing. Issuing a link spends the outstanding one of that
  purpose; setting a password spends them all.
- **Redeeming a link goes through `accountService`**, never a repository or a
  controller: one transaction over a `FOR UPDATE` token row, with the spend
  guarded by `WHERE consumed_at IS NULL` as well (`docs/CONCURRENCY.md`).
- `/forgot-password` answers identically for a known and an unknown address —
  same status, same body, and the same answer when sending fails. Its rate
  limiter is keyed on the IP ALONE; keying on the e-mail would make the limiter
  the oracle the endpoint refuses to be. Attach it per route, never with
  `router.use` on a shared mount.
- **Session invalidation is `users.password_changed_at` vs the token's `iat`.**
  `iat` is whole seconds rounded DOWN, so the cut-off rounds UP
  (`sessionCutoffSeconds`) and every new session is stamped at or after it
  (`sessionIssuedAtSeconds`). Both halves, or the rule is wrong in one direction.
  Every path that mints a token goes through `authService`'s `signFor`.
- Deactivation flips `users.is_active`; a course is retired with
  `courses.is_active`. **Nothing is ever deleted** — history, submissions,
  enrolments and stored results all refer to these rows. A course a window at
  `OPEN` or later offers cannot be retired; migration 0012's trigger is the
  final guard.
- The mailer is one interface (`backend/src/mail/`) with three implementations
  (SMTP, memory for tests, log for a dev machine with no mail server). Every
  e-mail's wording lives in `mail/accountEmails.ts`, plain text only.
- **CSV import is preview then confirm.** `importRules.ts` judges one row
  purely, so the dry run and the confirm cannot disagree; the confirm RE-judges
  the file (the client's verdicts are not a credential) and writes every valid
  row in one transaction. A failing invitation during an import is the one
  deliberate exception to rolling back.
- Seeds and demo scripts refuse `NODE_ENV=production` with no override;
  `npm run admin:create` is the only way an account is made without an
  invitation. Demo credentials render only under `import.meta.env.DEV`.

## Code quality

- TypeScript `strict` + `noUncheckedIndexedAccess` everywhere. No `any`; if one
  is truly unavoidable, add an `eslint-disable-next-line` with a written reason.
- No Tailwind. CSS3 via CSS Modules plus the organised global stylesheets in
  `frontend/src/styles/` (`reset.css`, `variables.css`, `base.css`). Use the
  CSS custom properties from `variables.css` instead of hard-coded values.
- Use the backend `logger` utility, never raw `console.*`.
- Small focused functions, meaningful names, no duplicated business logic.
- Tests for all important business logic (Vitest; RTL on the frontend,
  supertest on the backend).
- Every async UI state handles loading, success, empty, error and retry.
- Accessibility: labels, keyboard navigation, visible focus, accessible
  dialogs, status never conveyed by colour alone.
- Syllabus concepts (SPEC "Syllabus requirements") must be used naturally.
  No fake syllabus "examples" in production code — those belong in the
  `/dev/javascript-lab` page later.

## Running

- The whole stack runs in Docker; `docker compose up` (or `npm run docker:up`)
  is the main way to run it. `npm run dev` runs it without Docker.
- `.env` (gitignored) is created from `.env.example`. Never commit secrets.
- After changing dependencies, rebuild and refresh the node_modules volumes:
  `npm run docker:reset && npm run docker:up`.
- Vitest runs at most 2 workers per workspace (`maxWorkers` in each Vitest
  config), because this machine runs out of memory and fails with "Failed to
  start forks worker" otherwise. Override with `VITEST_MAX_WORKERS=<n>`.
- **Node:** `engines` is `>=20.12.0`. The dependency pins were chosen for Node
  20.17 and also run on 22 and 24 (verified on 24.21). Do not raise a pin to
  suit a newer Node; the pins stay as they are.
- npm 11 gates package install scripts. If `esbuild` fails to find its binary
  after `npm install`, approve it with `npm install-scripts approve esbuild`
  rather than changing any version.

## Standard phase workflow

Applies to every phase unless a prompt says otherwise, so prompts can be short.

- **Context:** this file is read automatically. Open another doc
  (`SPEC`, `DATABASE`, `DESIGN`, `CONCURRENCY`, `ALLOCATION`) only when the
  task touches it, and read only the relevant sections.
- **Before starting:** check `git status`. If the previous phase left
  uncommitted or unfinished work, finish that first.
- **Build in small steps** and commit after each logical step (conventional
  commits), so an interruption loses nothing.
- **Tests are the main verification:** unit + integration tests for every
  business rule, RTL + axe for every new component or page.
- **Browser verification:** ONE focused pass per phase, covering only the new
  user flows, scripted headless where possible. Don't re-check what the tests
  already prove.
- **Screenshots:** only for NEW pages, at most 2 per page (1280px light and
  390px dark), in `docs/screenshots/`. One design review against
  `docs/DESIGN.md`; re-screenshot only the pages that changed. The full visual
  review of every page happens once, in the final phase.
- **Definition of done** — run these yourself and fix the failures yourself
  before reporting:
  1. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` —
     all pass with zero errors.
  2. `npm run format:check` passes.
  3. The Docker dev stack is healthy: `docker compose up --build -d`, all
     containers healthy, `GET http://localhost:4000/api/health` and
     `http://localhost:5173` respond.
  4. The dev database is left in the demo state the prompt names (through
     `npm run demo:reset -- --stage=<stage>` where it exists).
- **Close any headless browsers** or scratch processes you start.
- **Final report:** at most ~40 lines. What was built, the endpoints, test
  counts, anything found and fixed, deviations with reasons, and the final
  database state. No step-by-step narration, and don't repeat the prompt back.

## Git

- Commit your own work in logical steps with conventional commit messages
  (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`).
- Default branch is `main`.
- **No attribution trailers.** Commits and PR descriptions carry no
  `Co-Authored-By:` line and no "Generated with" footer — this is a single-author
  project and the history reads that way. This overrides any default the harness
  asks for.
