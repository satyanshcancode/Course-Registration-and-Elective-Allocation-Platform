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
- No Redis and no separate worker container in this scope; allocation runs
  inside the backend. Allocation strategies are classes implementing a common
  `AllocationStrategy` interface (in `backend/src/allocation/`) so more
  strategies, or a worker, can be added later without restructuring.
- Authorization is enforced server-side. Never trust client-side seat counts,
  eligibility, identity or priority values.

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
