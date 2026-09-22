# CLAUDE.md — rules for every session

## Before any task

1. Read `docs/PROBLEM_STATEMENT.md` and `docs/SPEC.md` at the start of every task.
2. **Scope** comes from `docs/PROBLEM_STATEMENT.md` (the 7 features listed in
   SPEC "Scope"). Build only those unless the user explicitly asks for a
   stretch goal. SPEC.md "Stretch goals" (extra strategies, simulator,
   analytics, Redis, worker container, faculty role, cloud deploy, …) are
   **out of scope** by default.
3. **Quality, architecture, naming, structure and syllabus rules** come from
   `docs/SPEC.md`.

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

## Definition of done for every phase

You run these yourself and fix failures yourself before reporting:

1. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` — all
   pass with zero errors.
2. `npm run format:check` passes.
3. The Docker stack is verified running: `docker compose up --build -d`, all
   containers healthy, `GET http://localhost:4000/api/health` and
   `http://localhost:5173` respond.

## Git

- Commit your own work in logical steps with conventional commit messages
  (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`).
- Default branch is `main`.
