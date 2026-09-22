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
