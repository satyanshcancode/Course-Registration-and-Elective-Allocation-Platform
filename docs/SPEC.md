# Course Registration and Elective Allocation Platform — Specification

## Purpose

Academic project for a subject covering HTML5, CSS3, JavaScript
fundamentals, advanced and asynchronous JavaScript, DOM and modern tooling,
TypeScript, TypeScript for web apps, static analysis, debugging, testing,
code quality, Git and GitHub. The app must be real and working, and must
demonstrate these concepts naturally.

## Scope

Build these first, in this order.

1. **Course catalogue with live seat counts** — capacity, allocated,
   available, demand, demand/capacity ratio; polling for live updates.
2. **Eligibility pre-check before the window opens** — program, semester,
   credits, prerequisites; shows _Eligible_ / _Not eligible_ + reason.
3. **Registration cart** — add, remove, rank preferences, reorder with
   accessible move up/down buttons (not drag-only), save draft, atomic
   submit. Submit is ONE database transaction with an idempotency key;
   no partial state; no duplicate submissions.
4. **Allocation for oversubscribed electives** — common
   `AllocationStrategy` interface with classes. Implement:
   - `FCFSStrategy` (baseline, server-side order only)
   - `PreferencePriorityStrategy` — score = preference weight
     (P1 = 100, P2 = 80, P3 = 60, P4 = 40, P5 = 20) plus mock priority
     points such as final year +20, program relevance +25, graduation
     urgency +40; ties broken by a seeded random generator whose seed is
     stored.

   Store each allocation run with its seed, algorithm version, config and
   input snapshot so it can be reproduced. Each student gets a
   plain-language explanation of their result without revealing other
   students' data.

5. **Waitlist** ordered by allocation score; when a seat frees up,
   promotion rechecks eligibility, enrolls the next student, updates seats
   and creates a notification, all in one transaction.
6. **Add/drop screen** — drop triggers waitlist promotion; add allowed if
   seats and eligibility permit.
7. **Student registration status and history view** — every submit,
   allocation, waitlist move, promotion, add, drop.

### Concurrency requirement

A test with 100 simultaneous students and 10 seats must give 10 enrolled,
90 waitlisted, 0 overbooking (transactions, `SELECT ... FOR UPDATE` row
locking, unique and check constraints).

## Roles

- **Student** — sees and changes only their own data.
- **Admin** — manages courses and the registration window
  (`DRAFT`, `OPEN`, `CLOSED`, `ALLOCATED`), runs allocation, sees
  waitlists.

All authorization is enforced server-side. Never trust client-side seat
counts, eligibility, identity or priority values.

## Stack

- **Frontend:** React, TypeScript, Vite, React Router, Fetch API, CSS
  Modules plus organised global CSS. No Tailwind.
- **Backend:** Node, Express, TypeScript, PostgreSQL via `pg` with
  parameterised SQL, zod validation, bcrypt password hashing, JWT auth,
  rate limiting on login and submit.
- **Shared:** a `shared/` workspace with typed API request/response
  contracts.
- **Tooling:** ESLint, Prettier, tsc strict, Vitest, React Testing Library,
  supertest, Docker, Docker Compose, Git.

## Architecture rules

- **Frontend:** components → hooks → api modules (`apiClient.ts`,
  `courseApi.ts`, `registrationApi.ts`, `allocationApi.ts`, `adminApi.ts`).
  No raw `fetch` in components.
- **Backend:** routes → controllers → services → repositories. No SQL in
  controllers, no business logic in React components.
- Generic `ApiResponse<T> { success, data, message? }` on every endpoint.
- Allocation strategies as classes so more can be added later.

## Syllabus requirements

Use these naturally; never fake them in production code.

### HTML5

Semantic elements (`header`, `nav`, `main`, `section`, `article`, `aside`,
`footer`, `table`, `dialog`), real forms with
`required`/`min`/`max`/`pattern`/`type` attributes plus TypeScript
validation on top, a help page with a `<video controls>` and captions
explaining how registration works.

### CSS3

Global `border-box`, CSS variables for spacing/colour/radius/type,
element/class/attribute/pseudo-class/pseudo-element selectors, low
specificity, Flexbox (nav, button groups, card metadata), Grid (dashboard,
catalogue, admin panels), relative/absolute/sticky/fixed positioning
(sticky sidebar, badges, modal overlay, toast area), media queries for
desktop/tablet/mobile, scrollable tables on small screens, subtle
transitions.

### JavaScript

Array methods (`map`, `filter`, `reduce`, `find`, `some`, `every`, `sort`),
objects, events, a closure-based `debounce()` used by course search,
`async`/`await`, `Promise.all` on the student dashboard,
`Promise.allSettled` where partial failure matters, event delegation on the
course action table, `useRef`-based DOM work (focus, scroll,
`document.title`, dialog).

### TypeScript

Interfaces for domain models and props, type aliases and unions for roles
and statuses, intersection types where concerns combine, generics
(`ApiResponse<T>`, `DataTable<T>`, async state), discriminated unions and
type guards for narrowing, inference for trivial values.

### UI states and accessibility

Every async UI state handles loading, success, empty, error and retry.
Accessibility: labels, keyboard navigation, visible focus, accessible
dialogs, status never conveyed by colour alone.

## Demo data

Seed about 300 students across 5 programs, about 20 courses, with eligible
and ineligible students, popular and undersubscribed courses, varied
priorities and preference lists.

Deliberate demo case: **"Artificial Intelligence"** with capacity 20 and
100 eligible applicants whose preferences are AI, Cloud Security,
Distributed Systems, Blockchain.

Demo logins: one admin and a few named students, documented in the README.

## Later deliverables

- `/dev/javascript-lab` page (scope, closure, event loop order with
  `queueMicrotask`/`Promise`/`setTimeout`, capture/target/bubble, prototype
  chain), hidden in production.
- `docs/SYLLABUS_MAPPING.md` mapping every syllabus topic to files.
- Full README (overview, problem, features, architecture, setup, Docker,
  API, allocation logic, testing, limitations, future scope).

## Stretch goals

**Do NOT build unless explicitly asked.**

Lottery, Priority-only, Preference-only, Deferred Acceptance and Hybrid
strategies; admin simulator and policy comparison; policy freeze workflow;
analytics dashboard; audit log UI and run replay; Redis cache; separate
allocation worker container; faculty role; cloud deployment.

## Code quality

Strict TypeScript, no `any`, no duplicated business logic, small focused
functions, meaningful names, ESLint clean, Prettier formatted, tests for
all important business logic, conventional commit messages.
