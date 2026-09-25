# JavaScript concepts in the app

Where the syllabus's JavaScript topics appear in real, working code. Each
section names the file, says what the code does and why the concept fits.

## Closure-based `debounce()` — course search

[`frontend/src/utils/debounce.ts`](../frontend/src/utils/debounce.ts), used by
[`CatalogueFilterForm.tsx`](../frontend/src/pages/student/catalogue/CatalogueFilterForm.tsx).

`debounce(fn, waitMs)` returns a new function. That function _closes over_ a
`timer` variable (and the latest arguments) which lives on after `debounce`
has returned. Every call clears the pending timer and starts a new one, so
`fn` runs once, `waitMs` after the **last** call:

```ts
export function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined; // private to this closure
  let latestArgs: TArgs | undefined;

  const invoke = () => {
    const args = latestArgs;
    timer = undefined;
    latestArgs = undefined;
    if (args) fn(...args);
  };

  const debounced = (...args: TArgs) => {
    latestArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(invoke, waitMs);
  };

  // cancel(), flush() and pending() share the same closure.
  return Object.assign(debounced, { cancel, flush, pending });
}
```

The catalogue search box calls it on every keystroke with a 300 ms wait.
Typing "security" sends one request and makes one URL update, not eight. The
form also uses the extra methods:

- `flush()` on Enter, so a submitted search happens at once.
- `cancel()` on "Clear filters" and when the form unmounts, so a stale
  search can't fire later.

The debounced function is created once and kept in a `useRef`. If it were
recreated on every render, each keystroke would get a fresh closure and a
fresh timer, and nothing would be debounced. The RTL test
`searches only once typing stops (debounced)` checks this with fake timers.

## Event delegation — the catalogue table

[`frontend/src/utils/tableActions.ts`](../frontend/src/utils/tableActions.ts)
and [`CatalogueTable.tsx`](../frontend/src/pages/student/catalogue/CatalogueTable.tsx).

Each row has a "View details" button, but no button has its own `onClick`.
Each one carries its intent in `data-*` attributes:

```html
<button type="button" data-action="view" data-course-code="CS401">
  <span>View details</span> <svg>…</svg>
</button>
```

The table body gets **one** click listener (`DataTable`'s `onBodyClick` on the
`<tbody>`). It works because click events **bubble**. A click starts at the
element actually under the pointer and travels up through every ancestor, so
the `<tbody>` hears clicks from all its rows:

- **`event.target`** is where the click started. It is often _not_ the
  button: it can be the `<svg>` icon, one of its `<path>`s, or the `<span>`
  of text.
- **`event.currentTarget`** is the element whose listener is running now,
  here always the `<tbody>`.

`findRowAction(target, container)` walks back up from the target with
`closest('[data-action][data-course-code]')`. It uses `container.contains()`
to ignore buttons outside this table, skips disabled buttons, and returns
`{ action, courseCode }`. The table then looks the action up in a map
(`{ view: … }`), so a later action such as "Add to cart" is one more entry,
not one more listener per row.

Keyboard users get this for free: pressing Enter or Space on a `<button>`
fires a `click` event, which bubbles the same way. Tests:

- `tableActions.test.ts` clicks on a nested `<path>` and `<span>`.
- `StudentCoursesPage.test.tsx` clicks the icon inside a row button and
  checks the navigation.

## Polling with the Page Visibility API — live seat counts

[`frontend/src/hooks/usePolling.ts`](../frontend/src/hooks/usePolling.ts),
[`useLiveSeats.ts`](../frontend/src/hooks/useLiveSeats.ts) and
[`utils/liveSeats.ts`](../frontend/src/utils/liveSeats.ts).

The catalogue and course detail pages ask `GET /api/courses/seats` for new
numbers every 10 seconds:

- **Visibility:** `usePolling` listens for `visibilitychange`. While
  `document.visibilityState === 'hidden'` it clears its `setInterval`, so a
  background tab sends nothing. When the tab becomes visible again it polls at
  once and restarts the interval.
- **No overlap:** an `inFlight` flag means a slow request is never doubled up.
- **Cheap when nothing changed:** the poller keeps the response's `ETag` and
  sends it back as `If-None-Match` (`getConditional` in
  [`apiClient.ts`](../frontend/src/api/apiClient.ts), with
  `cache: 'no-store'` so the browser cache doesn't hide the 304). The server
  answers **304 Not Modified** with an empty body when the numbers are the same.
- **Merge, don't refetch:** new numbers go into the courses already on screen
  (`withLiveSeats`). Unchanged courses keep their object identity. A course
  whose numbers changed gets `data-changed="true"` for 2 seconds, and a CSS
  transition shows it briefly (switched off under `prefers-reduced-motion`
  through the duration tokens).
- **Screen readers:** the "Seats updated 8s ago" line is deliberately _not_
  a live region, so a refresh every 10 seconds doesn't interrupt anyone.

## `Promise.all` — independent requests together

[`frontend/src/hooks/useCatalogue.ts`](../frontend/src/hooks/useCatalogue.ts)
and [`backend/src/services/catalogueService.ts`](../backend/src/services/catalogueService.ts).

The catalogue page needs the current registration window (with the server's
clock, for "closes in 3 weeks") and a page of courses. Neither depends on
the other, so both requests start together:

```ts
const [windowResponse, pageResponse] = await Promise.all([
  getCurrentWindow(signal),
  getCatalogue(query, signal),
]);
```

The page waits for the slower request, not for the sum of both. If either
rejects, the whole load fails once and the page shows one error with a
Retry button.

The backend does the same for a student's personal data: their eligibility
facts and their cart, seat and waitlist rows are two independent queries run
with `Promise.all` alongside the catalogue query.

## Array methods

The catalogue rules in
[`backend/src/services/catalogueRules.ts`](../backend/src/services/catalogueRules.ts)
are a pipeline of pure array methods:

- `map` turns offering rows into DTOs.
- `filter` applies the search and filter rules.
- `sort` uses a comparator built per sort key, with ties broken by code.
- `slice` makes a page.
- `reduce` groups a student's status rows by course.
- `some` / `every` / `find` appear in the ETag matcher, the filters and the
  form parsers.

## `Promise.allSettled` — a dashboard that survives one failure

[`frontend/src/hooks/useDashboardSections.ts`](../frontend/src/hooks/useDashboardSections.ts),
used by [`StudentDashboardPage.tsx`](../frontend/src/pages/student/StudentDashboardPage.tsx).

The student dashboard needs three unrelated things: the registration window,
the eligibility summary and the unread notification count. None depends on
another, so all three start together — but unlike the catalogue, a failure in
one of them must **not** blank the page:

```ts
const settled = await Promise.allSettled(running.map((key) => loaders[key](signal)));
```

- `Promise.all` **rejects as soon as any one promise does**, and the other
  results are lost. The whole dashboard would become a single error page
  because the notification count was briefly unavailable.
- `Promise.allSettled` always fulfils, with one
  `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }` per
  input, in input order. Each section is then set from its own result.

So the failing card shows its own message and a Retry button while its
neighbours render normally. Retry re-runs **only that loader** — the healthy
sections are never refetched. The RTL test proves both halves: one rejected
loader leaves the others on screen, and retrying it calls one API function a
second time while the other two stay at one call each.

## The countdown, and whose clock it uses

[`frontend/src/utils/countdown.ts`](../frontend/src/utils/countdown.ts),
[`useServerClock.ts`](../frontend/src/hooks/useServerClock.ts) and
[`RegistrationStatusBanner`](../frontend/src/components/RegistrationStatusBanner/RegistrationStatusBanner.tsx).

"Closes in 3h 12m" is only true if it is measured against the right clock. A
device whose date is two days behind would tell a student they still have
plenty of time.

- **The offset is measured once.** `/api/registration-windows/current`
  returns `serverTime`; the moment the response arrives the client stores
  `Date.parse(serverTime) - Date.now()`. Every later comparison uses
  `deviceNow + offset`, so only the _rate_ of the device clock matters, not
  what it is set to.
- **Reading the clock is a side effect**, so it happens where the data is
  loaded, never during render. (React's lint rules make this explicit: calling
  `Date.now()` in a component body is flagged as impure.)
- **One tick per second, only while visible.** `useServerClock` reuses
  `usePolling`, so a hidden tab stops ticking entirely and catches up the
  instant it is shown again.
- **Nothing is announced.** The countdown sits in no live region: a screen
  reader reading "3h 11m 59s" every second would make the page unusable. The
  text is read normally when the user reaches it.

`describeCountdown` is pure — window plus `now` in, words out — so the whole
matrix (draft, open, closed, allocated, and each one past its date) is unit
tested without a browser.

## The cart: drag-and-drop, `beforeunload` and `crypto.randomUUID()`

[`CartList.tsx`](../frontend/src/pages/student/cart/CartList.tsx),
[`CartPage.tsx`](../frontend/src/pages/student/cart/CartPage.tsx) and
[`useBeforeUnload.ts`](../frontend/src/hooks/useBeforeUnload.ts).

**Native drag-and-drop is the enhancement, never the mechanism.** Each `<li>`
is `draggable` and uses the browser's own events — `dragstart` sets
`effectAllowed` and one item of `text/plain` data (Firefox will not start a
drag without it), `dragover` calls `preventDefault()` (without it the browser
refuses the drop) and sets `dropEffect`, and `drop` performs the move:

```tsx
const handleDragOver = (index: number) => (event: DragEvent<HTMLLIElement>) => {
  event.preventDefault(); // "yes, you may drop here"
  event.dataTransfer.dropEffect = 'move';
  setOverIndex(index);
};
```

Dragging is impossible with a keyboard and hard with a screen reader, so the
real controls are Move up / Move down buttons with names like "Move Cloud
Security up to rank 1". Both paths call the same `moveItem(items, from, to)`,
which is pure and unit tested.

**Focus and a polite announcement after a move.** Moving an item re-renders
the list, so the button that was pressed may be gone or disabled (at rank 1
"Move up" is disabled). An effect keyed on the new order focuses the moved
item's first usable button, and a separate `aria-live="polite"` paragraph is
given one sentence — "Cloud Security moved to choice 1 of 3." The list itself
is not a live region: announcing every item on every move would be unusable.

**`beforeunload` only while there is something to lose.**

```ts
useEffect(() => {
  if (!when) return undefined; // nothing unsaved: no listener at all
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault();
  };
  window.addEventListener('beforeunload', warn);
  return () => {
    window.removeEventListener('beforeunload', warn);
  };
}, [when]);
```

`preventDefault()` is what asks the browser for its own "leave site?" prompt;
the wording belongs to the browser and cannot be changed. Attaching the
listener permanently would slow every navigation for no reason, so the hook
takes a boolean and the cart passes `dirty`.

**`crypto.randomUUID()` for the idempotency key.** The key is generated once,
when the confirm dialog opens, and kept in state:

```ts
const openConfirm = () => {
  setSubmitKey(crypto.randomUUID()); // once per attempt...
  setConfirmOpen(true);
};
```

Every retry of that attempt — including the one offered after "We couldn't
confirm your submission" — sends the **same** key, so the server replays the
first result instead of creating a second submission. A fresh key per click
would defeat the whole mechanism. `crypto.randomUUID()` is the platform's own
v4 generator (secure context only, which `localhost` and HTTPS both are); no
library is needed. See [CONCURRENCY.md](CONCURRENCY.md).

## Classes, prototypes and the strategy pattern — allocation

[`backend/src/allocation/`](../backend/src/allocation/): `types.ts` declares
the interface, `fcfsStrategy.ts` and `preferencePriorityStrategy.ts` implement
it, `index.ts` chooses between them.

**One interface, two classes.**

```ts
export interface AllocationStrategy {
  readonly method: AllocationMethod;
  readonly algorithmVersion: string;
  allocate(input: AllocationInput): AllocationOutput;
}
```

The caller never asks which method it has:

```ts
const strategy = strategyFor(window.policy.method);
const output = runStrategy(strategy, input);
```

Adding a third method means writing one class and adding one `case`. The
factory's `default` branch takes a `never`, so the build fails until that
case exists — the same trick as the eligibility formatter.

**Classes are prototypes at runtime.** `class FcfsStrategy { allocate() {} }`
is, underneath, a constructor function whose `prototype` object holds
`allocate`. Every instance gets a hidden link to that one object, so a
thousand strategy instances share a single `allocate` function rather than
carrying a copy each, and a method call walks the prototype chain to find it:

```ts
const one = strategyFor('FCFS');
const two = strategyFor('FCFS');
one !== two; // different objects
Object.getPrototypeOf(one) === Object.getPrototypeOf(two); // same prototype
Object.hasOwn(one, 'allocate'); // false — it lives on the prototype
```

That is asserted in `allocation.test.ts`, because it is the reason the
pattern is cheap: the interface costs an object per strategy, not per call.

**Pure functions, and why it matters here.** The whole engine is a pure
function of its input — no database, no clock, no `Math.random`:

- the same input and seed always produce the same output, which is what
  makes `POST /allocation-runs/:id/verify` mean something;
- a test is an object in and an object out, so 5,000 students over 50 courses
  is checked in milliseconds with no server;
- the property-based tests can generate thousands of random universes and
  assert the rules hold in all of them.

The two things a pure function cannot do are done by its caller. `runStrategy`
times the call with `performance.now()` and adds `runtimeMs`; the service owns
the transaction and the clock. Randomness is passed in as a **seed**, not
taken from the environment, and `tieBreaksFor` draws one number per student
from it — once, not per comparison, because a fresh draw each time would make
the ordering non-transitive and the run unrepeatable.

# TypeScript highlights

Where the syllabus's TypeScript topics do real work in this app.

## Discriminated unions and exhaustive `never` checks — eligibility reasons

[`shared/src/domain/eligibility.ts`](../shared/src/domain/eligibility.ts) and
[`frontend/src/utils/eligibilityText.ts`](../frontend/src/utils/eligibilityText.ts).

A reason is not a string. It is a union discriminated on `type`, and each
member carries exactly the values its sentence needs:

```ts
export type IneligibilityReason =
  | { type: 'PROGRAM_NOT_ALLOWED'; program: ProgramRef; allowedPrograms: ProgramRef[] }
  | { type: 'SEMESTER_TOO_LOW'; required: number; actual: number }
  | { type: 'CREDITS_TOO_LOW'; required: number; actual: number }
  | { type: 'PREREQUISITE_MISSING'; course: CourseRef }
  | { type: 'ALREADY_COMPLETED' };
```

Switching on `type` narrows the object, so `reason.required` exists in one
branch and is a compile error in another. The default branch is the interesting
part:

```ts
function unhandledReason(value: never): string {
  throw new Error(`Unhandled eligibility reason: ${JSON.stringify(value)}`);
}
```

`value` can only be assigned `never`, and the union is only `never` once every
member has been handled above. **Adding a sixth reason type breaks the build
here** until someone writes its sentence — the compiler, not a code review,
catches the missing case. The same idea guards `describeMyStatus` and
`describeWindow`.

Because each reason carries names rather than database ids, there is exactly
one formatter for the whole app: the catalogue card, the course detail page and
the pre-check all call `describeReason`, so the wording cannot drift.

## A union that drives a form — `AllocationConfig`

[`shared/src/domain/allocationConfig.ts`](../shared/src/domain/allocationConfig.ts),
[`PolicyFields.tsx`](../frontend/src/pages/admin/window/PolicyFields.tsx) and
[`utils/windowForm.ts`](../frontend/src/utils/windowForm.ts).

The allocation policy is a union too:

```ts
type AllocationConfig =
  | { method: 'FCFS' }
  | {
      method: 'PREFERENCE_PRIORITY';
      preferenceWeights: PreferenceWeights;
      priorityPoints: PriorityPoints;
    };
```

The admin form holds **that union itself** as React state, so the shape of the
data decides the shape of the form:

```tsx
if (policy.method === 'FCFS') {
  return <p>Seats go to whoever submits first…</p>;
}
// Past this line TypeScript knows preferenceWeights and priorityPoints exist.
return <>{PREFERENCE_RANKS.map((rank) => <input value={policy.preferenceWeights[rank]} … />)}</>;
```

There is no `weights?: …` that is "only there sometimes", no `as` cast and no
runtime guard to remember: choosing FCFS makes the weight fields _impossible_
to reference, not merely hidden. `PreferenceWeights` is
`Record<PreferenceRank, number>`, so a missing rank is a type error.

The same union crosses the wire and the database. Zod validates it with
`z.discriminatedUnion('method', …)`, so weights sent with `method: 'FCFS'` are
rejected as a bad request, and a `CHECK` constraint makes the JSONB column
agree with the `allocation_method` column.
