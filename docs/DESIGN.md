# Design direction — Quad

**Concept: a warm academic catalogue, not a dashboard.** Allocademy is where a
student finds out what they can take and whether there is room. That is a
reading task before it is a control task, so the interface is built like a
catalogue: clay around warm paper, a soft serif with real character for
anything that names a thing, and a list of ruled entries rather than a grid of
boxed cards.

Students use it under time pressure and in a term when the outcome matters, so
**clarity always beats decoration** — and the one number they came for, how
many seats are left, is drawn as well as written.

All UI follows this document. Tokens live in
[`frontend/src/styles/variables.css`](../frontend/src/styles/variables.css);
every component in `/dev/components` (dev only) shows them in use. Three
directions were built as working pages before this one was chosen —
[`docs/redesign/`](redesign/) has the other two and the reasoning.

## Typography

| Role                    | Face                               | Where                                                              |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Display                 | **Fraunces Variable** (opsz 9–144) | Page titles, course names, card and section headings, the wordmark |
| Interface               | **Work Sans Variable**             | Body text, labels, buttons, navigation, tables                     |
| Figures that must align | **IBM Plex Mono**                  | Course codes, references, hashes, timestamps                       |

**Fraunces earns its place on the optical-size axis.** A 40px page title and a
13px course code are _drawn_ differently rather than scaled — the small sizes
get sturdier serifs and more open counters, the large ones get the contrast and
the slightly odd, warm letterforms that give the product a voice. `font-optical-sizing: auto`
is set on every heading, so this is automatic rather than hand-tuned.

The scale is a 1.2 (minor third) ratio from 1rem, fluid at the top three steps.
`h1` is `--text-3xl` (up to 40px): the page title is the largest thing on the
page by a wide margin, and everything else is quiet.

**Figures are lining and tabular everywhere.** Both Fraunces and Work Sans ship
oldstyle figures by default, which are lovely in a sentence and useless in a
column of seat counts. `base.css` sets `font-variant-numeric: lining-nums
tabular-nums` on body, inputs, tables and buttons, so "59 left" and "6 left"
occupy the same width down a list.

## Colour

Clay surrounds warm paper. One colour is asked to carry meaning, and the other
two are reserved for a single idea each.

| Token                    | Light                | Means                                                |
| ------------------------ | -------------------- | ---------------------------------------------------- |
| `--color-paper`          | `#e8e1d6` clay       | The surround: everything outside the content         |
| `--color-surface`        | `#fdfbf7` warm paper | Where the work is                                    |
| `--color-surface-sunken` | `#f2ece1`            | Wells, table headers, disabled fields                |
| `--color-ink`            | `#241f1a`            | Text                                                 |
| `--color-ink-muted`      | `#585046`            | Secondary text                                       |
| `--color-rule`           | `#d6cdbe`            | Hairlines                                            |
| `--color-rule-strong`    | `#887d6d`            | Control borders                                      |
| `--color-accent`         | `#2f5d4a` forest     | The primary, and the only colour a reader must learn |
| `--color-danger`         | `#a04a26` terracotta | "You cannot have this": full, blocked, destructive   |
| `--color-warning`        | `#8a5a06` amber      | "Not yet": a requirement not met, a window not open  |
| `--color-info`           | `#41566b` slate      | Neutral notices                                      |

**The dark theme ("Lamplight") redefines colour tokens and nothing else** — no
sizes, no shapes, no type. It stays warm: `#191611` paper rather than a neutral
grey, so the product does not become a different thing after dark.

### Department spine

Five tones (`--color-dept-a` … `-e`) colour a 4px spine down the left edge of
each course card, so a long catalogue can be scanned by eye before it is read.
The tone comes from a stable hash of the department code
([`utils/departmentTone.ts`](../frontend/src/utils/departmentTone.ts)), so a
department added to the seed needs no change here and adding one does not
recolour the others. **The department's name is always printed beside the
spine** — the colour is a second way to scan, never the only one.

### Contrast (WCAG 2.2 AA)

[`frontend/src/styles/contrast.mjs`](../frontend/src/styles/contrast.mjs) reads
the values straight out of `variables.css`, so the audit cannot drift from what
ships. Run it with `node frontend/src/styles/contrast.mjs`; it exits non-zero on
any failure.

Text pairs are held to **4.5:1**, and pairs that only draw a boundary or a
control to **3:1** (WCAG 1.4.11). All 48 pairs across both themes pass. The
tightest are the control border on clay (3.11:1) and body text on clay
(12.58:1 — comfortable); when the palette was first written the control border
came out at 2.41:1 and `--color-rule-strong` was darkened until it cleared.

## Seats, at a glance

The catalogue's whole job is the seat count, so it gets a drawing as well as a
number: a **twenty-dot matrix**, filled = taken, ten per row, two rows.

- **Twenty dots whatever the capacity.** One dot per seat would make an 80-seat
  course four times the height of a 20-seat one, and every row has to be the
  same height down the page. The grid is a fixed `repeat(10, …)`, never
  `auto-fill`, so the block is the same 97×17px on every course and the dots
  line up down a column.
- **Nearly-full and full never look the same.** 59 of 60 rounds to twenty dots,
  which would draw it exactly like a full course — so `filledDots` clamps to 19
  while a seat remains, and to 1 while any seat is taken. That is the one
  distinction the drawing exists to make, and it is unit-tested.
- **The numbers always sit beside it** ("1 of 60 allocated · 59 left"), and a
  full course says the word "Full". The matrix is reinforcement; it is never
  the only signal.

Demand is a ratio (`5.6×`) with the request count, formatted in exactly one
place (`utils/courseText.ts`).

## Shape, depth and layout

- **Radii are small and consistent**: 4px (`sm`), 7px (`md`), 10px (`lg`).
  Enough to feel made rather than machined, not enough to look like a toy.
- **Shadows only on things that genuinely float** — modals and toasts. Cards
  have a hairline, never a shadow.
- **Flexbox** for rows that share a line (nav items, button groups, card
  metadata); **Grid** for the page shells, the catalogue, dashboards and admin
  panels.
- Positioning: `sticky` sidebar and page header, `fixed` phone nav and skip
  link, `absolute` overlays and the card spine, `relative` as their anchor.
- Breakpoints at **1280 / 820 / 390**, as media queries on `width < 64rem` and
  `width < 40rem`. Wide tables scroll inside their own keyboard-focusable
  region; the page itself never scrolls sideways.

## Icons

Lucide, through the `Icon` component only — never imported directly into a
page. 1.5px stroke, sized in `em` so they follow their text.

## Copy

Short, direct and specific: "13 of 50 seats left", "Registration opens Mon 21
Sep, 10:00", "You're #7 on the waitlist". Say what happened and what to do
next. No marketing language and no placeholder text.

## Banned

Purple/blue/pink gradients and gradient text · glassmorphism and blur panels ·
emoji or sparkle icons · giant hero sections or welcome banners inside the app ·
big shadows and large radii on every card · centring everything · rows of
identical stat cards with huge numbers and tiny labels · lorem ipsum or vague
copy · default browser-blue links and buttons · status carried by colour alone.

## Review

### Phase 4: design system and shell

Screenshots were taken with headless Chrome against the Docker dev stack at
1280, 820 and 390px, in light and dark mode, over four rounds. Each round also
checked for horizontal page scroll and measured the toast region against the
bottom navigation.

| Finding                                                                                                       | Fix                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The sign-in panel stretched to the height of the "How registration works" aside                               | `align-items: start` on the login grid                                                                                     |
| The public layout (sign-in, 404) had a sticky page header with nothing to scroll past                         | `PageHeader` takes `sticky={false}`; public pages and the gallery use it                                                   |
| On phones the sticky page header covered a third of the screen                                                | The page header is `position: static` below 40rem                                                                          |
| Seat meters in a column had ragged left edges, because the numbers pushed the bar                             | Compact meters use a fixed grid (`5.5rem minmax(0, 1fr)`), so every bar starts at the same line                            |
| The table filter stretched across the full width                                                              | The filter is capped at a readable width, and the result count sits on the right                                           |
| At 390px the table columns were crushed to a few characters                                                   | The grid is `width: max-content; min-width: 100%` inside a keyboard-focusable scroll region, so the table scrolls sideways |
| The modal sat in the top-left corner, because the reset's `* { margin: 0 }` removed the dialog's auto margin  | `margin: auto` on the dialog                                                                                               |
| Pagination "Previous/Next" labels were hidden with `display: none` on phones, which also removed their names  | The labels are visually clipped instead, so the buttons keep their accessible names                                        |
| The sidebar and the phone bottom bar were both in the DOM, giving two navigation landmarks with the same name | `AppShell` renders only one of them, chosen with `useMediaQuery`                                                           |

Checked against the banned list, none were found: no gradients, blur,
emoji, hero banners, big shadows or radii, rows of stat cards, vague copy or
browser-blue links. In the final round no page scrolls sideways at any width
or theme. On a 390px phone the toast region ends at 768px and the bottom nav
starts at 779px, so toasts never cover it.

The screenshots this round was reviewed from have been replaced by the final set; see [Phase 14](#phase-14-final-review-of-every-page).

### Phase 5: course catalogue, course detail, admin courses

Reviewed at 1280, 820 and 390px in light and dark mode (two rounds of 36
screenshots), plus a keyboard-only pass (23 checks) and end-to-end browser flows
against the Docker stack.

| Finding                                                                                                                                                                                                                                                                                                                                                      | Fix                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| The catalogue scrolled sideways at 1280px (1340px wide). The card's meta line held a `nowrap` department name plus padding for the status stamp, and its implicit `auto` grid track grew to fit.                                                                                                                                                             | The department moved to its own line, and the card header uses `grid-template-columns: minmax(0, 1fr)`                            |
| The admin table widened the whole page (1484px) instead of scrolling inside its region. `DataTable`'s wrapper was a grid with an implicit `auto` column. Also, the `visually-hidden` text in row buttons is `position: absolute`, and with no positioned ancestor inside the scroll box it escaped the `overflow: auto` clip. This was latent since Phase 4. | `.table { grid-template-columns: minmax(0, 1fr) }` and `.scroll { position: relative }`                                           |
| "0.0×" for 2 requests on 50 seats read as "no demand"                                                                                                                                                                                                                                                                                                        | Ratios under 0.05 read "<0.1×"                                                                                                    |
| On phones the filter form filled the first screen, so no course was visible without scrolling                                                                                                                                                                                                                                                                | Below 40rem the selects and toggles fold into a native `<details>` ("Filters and sort · 2 set"), and the search box stays visible |
| The detail page listed the rules ("Requires semester 5…") under a list of the same failed rules                                                                                                                                                                                                                                                              | The rules are named once: in the list when not eligible, in the "You meet every requirement" sentence when eligible               |
| The "Oversubscribed" badge wrapped inside its explanation sentence                                                                                                                                                                                                                                                                                           | The badge sits on its own line above the sentence                                                                                 |
| The capacity dialog's "Now: 20 seats" wrapped on phones, and "At least 0 (seats already allocated)" read oddly before any allocation                                                                                                                                                                                                                         | The ledger labels are Capacity / Allocated / Requests, and the hint names the lower limit only when seats are taken               |
| With no results, the summary repeated the empty state's heading, giving two identical headings                                                                                                                                                                                                                                                               | The summary reads "0 courses"                                                                                                     |

Checked against the banned list: no gradients, blur, emoji or hero banners.
Cards are hairline index cards with 4px radii and no shadow, and the only
shadow is on the capacity dialog. There are no stat-card rows: the admin
summary is one line of text ("20 offerings · 4 oversubscribed"). Every status
has an icon and words: Eligible / Not eligible plus the reason, the student's
own status stamp, Oversubscribed, and Passed / Not passed yet. On an 820px
tablet the admin table scrolls inside its own region, and the ochre left-edge
rule still marks oversubscribed rows while the Status column is out of view. A
seat change flashes an ochre wash for 2 seconds. Its fade uses the duration
tokens, so reduced motion switches it off.

The screenshots this round was reviewed from have been replaced by the final set; see [Phase 14](#phase-14-final-review-of-every-page).

### Phase 6: eligibility pre-check, registration window, dashboards

Reviewed at 1280, 820 and 390px in light and dark mode (24 screenshots per
round, two rounds), with a measured horizontal-overflow check on every
combination, plus end-to-end browser flows against the Docker stack: 22 admin
checks (edit, method switch, both validation failures, save, open, freeze,
close) and 14 student checks in a DRAFT window and 13 in an OPEN one.

| Finding                                                                                                                                                                     | Fix                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The pre-check opened onto a wall of red: "Not eligible" is 19 of 20 courses for a first-year, and at 390px the page ran to 3,900px before the eligible course was reachable | "Not eligible" starts collapsed, "Eligible" starts open. Both are still `<details>`, so either can be opened |
| The search box and the department select stacked instead of sitting side by side, because `SearchBar` is `width: 100%` inside a flex row                                    | The filter row is a two-column grid (`22rem` + `14rem`) that collapses to one column below 48rem             |
| The dashboard said the same thing three times: the status banner, then the card's badge, then "Registration closes in 21d 1h" again                                         | The card keeps the badge and the Opens/Closes schedule; the countdown is the banner's job                    |
| "Close registration" was a red button, but closing is the normal next step, not a destructive one — and red is reserved for problems                                        | The page button is primary; the confirm dialog stays `tone="danger"`, so focus still starts on Cancel        |

Checked against the banned list: no gradients, blur, emoji or hero banners.
The counts are one line of text ("20 courses offered · 286 of 300 students
eligible for at least one · 150 submissions so far"), not a row of stat cards.
Every status carries an icon and words: the window badge, Eligible / Not
eligible on each group, and "Policy frozen" with a lock. Each ineligibility
reason is a sentence with its own icon, never colour alone. In the final round
no page scrolls sideways at any width or theme.

The screenshots this round was reviewed from have been replaced by the final set; see [Phase 14](#phase-14-final-review-of-every-page).

### Phase 10: add/drop

One round against the Docker dev stack at 1280 and 390px, light and dark, from
the `add-drop` demo stage: a student holding a seat, a student holding nothing,
and the period closed.

| Finding                                                                                                                                                                                                | Fix                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| "To change course instead, use **Swap** on one of the courses below" was laid out as three columns, because `.hint` was `display: flex` and the text around the `<strong>` became anonymous flex items | `.hint` is a block; the one hint that carries an icon aligns it with `vertical-align` instead                                 |
| At 390px a gap the height of the heading sat between "Courses with a free seat" and the filter: stacked, `flex: 1 1 18ch` on the heading is a basis on the vertical axis                               | `flex: none` on the heading inside the phone media query, and the stacked header stretches rather than starting its items     |
| The page said when add/drop closes twice within 100px — the header countdown, then a banner repeating the same date                                                                                    | The banner appears only when the period is closed, where it gives the range and the reason; the countdown is the header's job |
| Nine solid accent "Swap into …" buttons made a column of competing calls to action, and left the one real one (the queue offered after a losing race) no room                                          | The repeated per-course actions are secondary; `primary` is kept for the race-lost offer, and `danger` for Drop               |

Checked against the banned list: no gradients, blur, emoji or hero banners. The
seat meters print their numbers, every status is an icon plus words (Enrolled,
Full, the waitlist position), and the drop dialog is `tone="danger"`, so focus
starts on Cancel. Outside the period every action button is `disabled` and the
reason is a sentence, not a greyed-out mystery. No sideways scroll at either
width or theme.

The screenshots this round was reviewed from have been replaced by the final set; see [Phase 14](#phase-14-final-review-of-every-page).

### Phase 14: final review of every page

One pass over all 26 pages, each at 1280px in light mode and 390px in dark
mode, against this document. The set is regenerated by
[`scripts/screenshot.mjs`](../scripts/screenshot.mjs), which drives a headless
Chrome over the DevTools Protocol and needs no extra dependency; a full pass
spans two demo stages, because an editable cart only exists while the window is
open and results, waitlists and add/drop only exist after allocation has run:

```bash
npm run docker:demo:reset -- --stage=add-drop
node scripts/screenshot.mjs --stage=add-drop
npm run docker:demo:reset -- --stage=open
node scripts/screenshot.mjs --stage=open
```

| Finding                                                                                                                                                                                                                                                                                                                                                 | Fix                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The activation, reset and forgot-password cards sat about 118px left of centre, by different amounts per page. `AuthPanel`'s grid used `justify-content: center`, which centres the TRACK — and the track was sized to the panel's max-content (over 700px once a page held a long sentence or an e-mail address), with the 30rem card at its left edge | `justify-items: center` as well, so the CARD is centred inside the track                                                         |
| The 404 page kept a 44rem column hard against the left edge of a 1280px public page, the very thing `AuthPanel` centres its card to avoid                                                                                                                                                                                                               | A `centred` prop, passed only on the public route; inside the app shell it stays left-aligned like every other page there        |
| On the admin dashboard, "Most demanded courses" printed the demand ratio twice in neighbouring columns — `describeDemand` renders "112 requests · 5.6×", and the next column is "Demand ÷ seats"                                                                                                                                                        | `describeRequests` for the count alone; `describeDemand` now composes it, so there is still one place that words a request count |
| The timeline said "Allocation gave you a seat in CS404 …, 76th in line for it", then used "in line" again in the next sentence for real waitlist positions. `finalRank` is a placing among everyone who asked for the course, not a place in a queue, so a student who held a seat appeared to be 76th in a queue for it                                | "ranked 76th among its applicants". The dashboard's recent activity reads from the same function, so it is fixed in both         |
| The activation shot had to create an account to have an unspent invitation, and that account was still there when the next shots counted students ("302 students")                                                                                                                                                                                      | The invitee is one fixed, realistic record, deleted as soon as its shot is taken                                                 |

Checked against the banned list: none found on any page. No page scrolls
sideways at either width or theme — wide tables scroll inside their own
keyboard-focusable region. Status is never colour alone anywhere: every badge
carries an icon and words, and every seat meter prints its numbers.
