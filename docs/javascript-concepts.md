# JavaScript concepts in the app

Where the syllabus's JavaScript topics appear in real, working code. Each
section names the file, says what the code does and why the concept fits.

## Scope — what a name can see

[`backend/src/utils/random.ts`](../backend/src/utils/random.ts).

Scope is the region of code where a name is visible. JavaScript has three that
matter here, from outside in: **module** scope (anything declared at the top
level of a file, private to that file unless exported), **function** scope, and
**block** scope — the `{ … }` of an `if`, a loop or a bare block, which `let`
and `const` respect and `var` does not.

The seeded generator is built on exactly this. `state` is declared inside
`mulberry32` and never leaves it:

```ts
function mulberry32(seed: number): () => number {
  let state = seed >>> 0; // function scope: nothing outside can reach it
  return () => {
    state = (state + 0x6d2b79f5) >>> 0; // …but the returned function still can
    /* … */
  };
}
```

There is no `generator.state` to tamper with, and two generators made from the
same seed cannot interfere, because each call to `mulberry32` creates a fresh
`state`. That is what makes an allocation run reproducible.

Block scope is why `shuffle` is correct:

```ts
for (let i = result.length - 1; i > 0; i -= 1) {
  const j = int(0, i); // a NEW j each iteration, not one shared binding
  [result[i], result[j]] = [result[j] as T, result[i] as T];
}
```

With `var j`, every iteration would share one binding — harmless here because
`j` is used immediately, but the classic bug the moment a callback outlives the
iteration:

```js
for (var i = 0; i < 3; i += 1) setTimeout(() => console.log(i)); // 3, 3, 3
for (let i = 0; i < 3; i += 1) setTimeout(() => console.log(i)); // 0, 1, 2
```

`let` gives each iteration its own binding, so each callback closes over its
own `i`. This codebase uses `const` by default, `let` only where a value really
is reassigned, and `var` nowhere — ESLint's `no-var` enforces it.

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

**The three phases.** A click does not only bubble. It is dispatched in
**capture** (window down to the target), then at the **target**, then **bubble**
(target back up to the window). `addEventListener` listens in the bubble phase
unless it is passed `{ capture: true }`, which is why one listener high up hears
everything below it. Two ways to interfere, neither used in the row handlers:
`event.stopPropagation()` ends the journey, so an ancestor's delegated listener
never runs — the usual cause of a delegated handler that mysteriously does
nothing — and `event.preventDefault()` leaves propagation alone but cancels the
browser's own reaction (following a link, submitting a form). The cart's
"unsaved changes" guard uses `preventDefault` on `beforeunload` for exactly
that reason.

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

## The event loop — microtasks before macrotasks

JavaScript runs on one thread with one call stack. Anything asynchronous is
handed to the host (the browser or Node), which puts the callback in a queue;
the **event loop** takes from a queue only when the stack is empty. There are
two kinds of queue, and the difference is the ordering rule:

- **Macrotasks** (the task queue): `setTimeout`, `setInterval`, I/O, a user
  event. **One** is taken per turn of the loop.
- **Microtasks**: promise reactions (`.then`, `catch`, `finally`, and
  everything after an `await`) and `queueMicrotask`. After each macrotask —
  and after the current synchronous script finishes — the loop drains the
  **whole** microtask queue before touching the task queue again.

So microtasks always run before the next macrotask, even one scheduled first
with a zero delay. The classic ordering:

```js
console.log('1');
setTimeout(() => console.log('2'), 0); // macrotask
Promise.resolve().then(() => console.log('3')); // microtask
console.log('4');
// 1, 4, 3, 2
```

`1` and `4` are plain synchronous statements. The stack then empties, the loop
drains the microtask queue (`3`), and only then runs the timer (`2`). It also
means a microtask that queues another microtask is run in the same drain — an
endless chain of promises can starve timers, whereas an endless chain of
`setTimeout` cannot.

**Where the app relies on it.** Nothing here schedules microtasks to exploit
the ordering; this is one of the concepts explained rather than demonstrated.
What the app does depend on is the first half of the rule — that an `await`
resumes in a microtask, before any timer:

```ts
const current = await getCurrentWindow(signal);
// Still the same turn of the loop as the response: no setTimeout, no render,
// nothing else has moved Date.now() on.
setWindow({ ...current, clockOffsetMs: Date.parse(current.serverTime) - Date.now() });
```

in [`useRegistrationWindow.tsx`](../frontend/src/hooks/useRegistrationWindow.tsx).
The clock offset is measured **where the response arrives**, never during a
render, precisely because that line runs before anything else gets a turn.

The other half shows up in `usePolling`: `setInterval` is a macrotask, and a
browser is free to throttle or stop timers in a hidden tab. The hook does not
rely on the browser's goodwill — it clears the interval on `visibilitychange`
and polls once on the way back.

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

## `this`, and why this codebase rarely needs it

`this` is not decided where a function is written — it is decided by **how it
is called**. The same function body sees a different `this` for each call:

```js
const strategy = strategyFor('FCFS');
strategy.algorithmVersion; // read through the receiver: the object before the dot
strategy.allocate(input); // inside allocate, `this` is strategy

const loose = strategy.allocate;
loose(input); // `this` is undefined — modules are always strict mode
```

That last line is the classic bug: pulling a method out of its object loses its
receiver. The fixes are `strategy.allocate.bind(strategy)` or a wrapper that
keeps the dot, `(input) => strategy.allocate(input)`.

**Arrow functions have no `this` of their own.** They close over the `this` of
the scope they were written in, exactly like any other variable, which is what
makes them safe as callbacks:

```js
send(method, params = {}) {
  const id = this.#nextId++;
  return new Promise((resolve, reject) => {
    // Arrow: `this` is still the DevTools instance inside the executor.
    this.#pending.set(id, { resolve, reject });
    this.#socket.send(JSON.stringify({ id, method, params }));
  });
}
```

in [`scripts/screenshot.mjs`](../scripts/screenshot.mjs). Written
`new Promise(function (resolve, reject) { this.#pending … })`, `this` would be
`undefined` and the private field would throw. The same file shows the other
way out: its `static attach()` has no instance yet, so it holds one in a
`const client` and closes over that instead of reaching for `this`.

**Where `this` actually earns its place here.**
[`createAdmin.ts`](../backend/src/scripts/createAdmin.ts) extends Node's
`Writable` so the password is not echoed while it is typed, and Node calls
`_write` as a method on the stream:

```ts
override _write(chunk, encoding, callback): void {
  if (!this.muted) {
    process.stdout.write(chunk, encoding);
  }
  callback();
}
```

`this.muted` is the whole point: the instance carries the state, and the
framework decides when to call. The two allocation strategies are classes for a
different reason — `method` and `algorithmVersion` are read off the instance by
`strategyFor` and `runStrategy`, so two interchangeable implementations can be
told apart. `allocate` itself is a pure function of its argument and touches no
`this` at all.

**Everywhere else the codebase sidesteps it.** Most "objects with methods" here
are factory functions returning an object literal of closures, not classes:

- `createSeededRandom` closes over `next` and `int`. `shuffle` calls `int(0, i)`
  — a plain function it captured — not `this.int(0, i)`, so
  `const { shuffle } = createSeededRandom(1)` keeps working, where the same
  destructuring of a class instance would break.
- Repositories and services are built the same way, closing over their `pool`,
  so a controller can pass one of their functions around as a value.
- Every React component is a function; state comes from hooks, so there is no
  `this` to bind in a render.

The rule this codebase follows: use a class when a type has several
interchangeable implementations or a framework will call it as a method, and
prefer a closure otherwise — a closure cannot lose its receiver, because it
never had one.

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
