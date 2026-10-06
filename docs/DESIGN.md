# Design direction

> **[`docs/redesign/target-ui.png`](redesign/target-ui.png) is the source of
> truth for the look, and it overrides this document wherever the two
> disagree.** It shows four screens — Dashboard, Course catalogue, Eligibility
> check, My cart — and every other page uses the same system so the product
> reads as one thing. Where the image is silent, this document decides.
>
> Nothing in it was eyeballed. [`scripts/measure-target.py`](../scripts/measure-target.py)
> finds the four screens on the sheet, samples the colours and measures the
> structure, reporting every number as **1440-viewport pixels**;
> [`scripts/compare-target.py`](../scripts/compare-target.py) puts a
> screenshot beside its quadrant and draws the pixel difference. The tables
> below are that script's output, rounded to the pixel.

**Concept: a warm academic catalogue with a dashboard's front door.**
Allocademy is where a student finds out what they can take and whether there is
room. That is a reading task before it is a control task, so the interface is
built like a catalogue — warm paper, a soft serif for anything that names a
thing — and the one screen that is a control surface, the dashboard, answers
four questions before it asks anything.

Students use it under time pressure and in a term when the outcome matters, so
**clarity always beats decoration** — and the one number they came for, how
many seats are left, is drawn as well as written.

All UI follows this document. Tokens live in
[`frontend/src/styles/variables.css`](../frontend/src/styles/variables.css);
every component in `/dev/components` (dev only) shows them in use. Three
directions were built as working pages before this one was chosen —
[`docs/redesign/`](redesign/) has the other two and the reasoning.

## Typography

| Role                    | Face                               | Where                                                             |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| Display                 | **Fraunces Variable** (opsz 9–144) | Page titles, standalone section headings, the wordmark            |
| Interface               | **Work Sans Variable**             | Card headings, figures, body, labels, buttons, navigation, tables |
| Figures that must align | **IBM Plex Mono**                  | Course codes, references, hashes, timestamps                      |

**Fraunces earns its place on the optical-size axis.** A 40px page title and a
13px course code are _drawn_ differently rather than scaled — the small sizes
get sturdier serifs and more open counters, the large ones get the contrast and
the slightly odd, warm letterforms that give the product a voice. `font-optical-sizing: auto`
is set on every heading, so this is automatic rather than hand-tuned.

The scale is not a ratio any more: every step is a size measured off the
target and rounded to the pixel (13 / 15 / 17 / 20 / 24 / 30 / 40), with the
top three fluid so a 1024px laptop is not shouted at. `h1` is `--text-3xl` (up
to 40px): the page title is the largest thing on the page by a wide margin,
and everything else is quiet. The table under
[Measured from the target](#measured-from-the-target) says which role takes
which step.

**Figures are lining and tabular everywhere.** Both Fraunces and Work Sans ship
oldstyle figures by default, which are lovely in a sentence and useless in a
column of seat counts. `base.css` sets `font-variant-numeric: lining-nums
tabular-nums` on body, inputs, tables and buttons, so "59 left" and "6 left"
occupy the same width down a list.

## Colour

**The app is light only.** There is no dark theme, no `prefers-color-scheme`
block and no dark token: the target is a light interface, `:root` declares
`color-scheme: light` so the browser does not darken a form control behind our
back, and the product looks the same whatever the operating system prefers.

A warm off-white page, near-white cards, one deep green that carries meaning,
and three status hues reserved for a single idea each. The values are sampled
from the target.

| Token                    | Value                | Means                                                |
| ------------------------ | -------------------- | ---------------------------------------------------- |
| `--color-paper`          | `#f0ece4` warm beige | The page **and** the sidebar — they are one surface  |
| `--color-surface`        | `#fdfbf7` near-white | Cards, where the work is                             |
| `--color-surface-raised` | `#f9f6f0`            | The header strip, a shade above the page             |
| `--color-surface-sunken` | `#e8e4da`            | Wells, disabled fields, a quiet badge                |
| `--color-ink`            | `#1a1d1f`            | Text                                                 |
| `--color-ink-muted`      | `#6c6b64`            | Secondary text                                       |
| `--color-rule`           | `#e8e4da`            | Hairlines                                            |
| `--color-rule-strong`    | `#8d8475`            | Control borders                                      |
| `--color-accent`         | `#0b4a3a` deep green | The primary, and the only colour a reader must learn |
| `--color-accent-soft`    | `#e0e4da`            | The active navigation item                           |
| `--color-accent-wash`    | `#e5efe5`            | The cart's registration-window panel                 |
| `--color-link`           | `#2f6b52`            | A link inside running text                           |
| `--color-success`        | `#0b7d3e`            | "You can have this": eligible, allocated, open       |
| `--color-success-bright` | `#0c9b58`            | The same idea as a **drawing**: a bar, a dot, a node |
| `--color-danger`         | `#b6413e` red        | "You cannot have this": full, blocked, destructive   |
| `--color-warning`        | `#8a5a06` amber      | "Not yet": waitlisted, a window not open             |
| `--color-info`           | `#3b5ba5` blue       | Neutral notices                                      |
| `--color-track`          | `#e0dedc`            | The unfilled part of a seat bar                      |

Four more pairs tint the rounded squares behind a figure's icon — `--tile-info-*`,
`--tile-danger-*`, `--tile-success-*`, `--tile-warning-*`. They are the
dashboard's blue, red, green and orange, and they only ever hold an icon.

### No colour without a key

An earlier draft gave every course card a 4px coloured spine, hashed from
its department code. It is gone, and so are the `--color-dept-*` tokens.
Five tones with nothing anywhere telling a reader what plum meant is
decoration wearing the costume of information, and the department's name is
printed on the card anyway. **A colour in this interface either carries a
labelled key or it does not appear.** The remaining coloured edges are
states with words beside them: a selected nav item, an error, a warning.

### Contrast (WCAG 2.2 AA)

[`frontend/src/styles/contrast.mjs`](../frontend/src/styles/contrast.mjs) reads
the values straight out of `variables.css`, so the audit cannot drift from what
ships. Run it with `node frontend/src/styles/contrast.mjs`; it exits non-zero on
any failure.

Text pairs are held to **4.5:1**, and pairs that only draw a boundary, a dot, a
bar or an icon to **3:1** (WCAG 1.4.11). There is one theme, so there is one
pass: **all 36 pairs clear their threshold.**

Three colours sampled off the target did not, and were darkened along their own
hue until they did. They are the only places the image was overruled:

| Sampled                        | Shipped   | Why                                           |
| ------------------------------ | --------- | --------------------------------------------- |
| `#88857D` nav, `#7F7E76` muted | `#6c6b64` | 3.1:1 and 3.5:1 on the page; text needs 4.5:1 |
| `#0DA05C` bright green         | `#0c9b58` | 2.9:1 on the page; a bar or a dot needs 3:1   |
| light input borders            | `#8d8475` | a control's own boundary needs 3:1            |

The brightest green survives as `--color-success-bright` for bars, dots and
tile icons, and `--color-success` is the darker one the words use — the two
exist precisely so the drawing can stay bright while the writing stays
readable.

## Seats, at a glance

The catalogue's whole job is the seat count, so it gets a drawing as well as a
number: a **bar**, filled = taken, with a dot of the same tone captioning the
figures beside it. (It was a twenty-dot matrix until v1.5; the target draws a
bar, and the target wins.)

- **Nearly-full and full never look the same.** 59 of 60 is 98.3%, which would
  draw as a full bar — so `filledPercent` clamps to 98 while a seat remains,
  and to 2 while any seat is taken. That is the one distinction the drawing
  exists to make, and it is unit-tested.
- **The numbers always sit beside it** ("1 of 60 seats · 59 left"), and a full
  course says the word "Full". The bar is reinforcement; it is never the only
  signal. The tone goes green, amber, red as the course fills, and each of
  those has a word beside it.

Demand is a ratio (`5.6×`) with the request count, formatted in exactly one
place (`utils/courseText.ts`).

## Measured from the target

Each screen on the sheet is a 1440-wide viewport scaled to 760px, so one
target pixel is 1.895 CSS pixels. These are the measurements the tokens were
set from, with each one's share of the viewport beside it — the proportions
are what survive a different screen width.

| Thing                   | Measured                               | Token                        | Share of the 1440 viewport |
| ----------------------- | -------------------------------------- | ---------------------------- | -------------------------- |
| Sidebar                 | 292px                                  | `--sidebar-width` (18rem)    | 20.3% of width             |
| Header bar              | 81px                                   | `--app-header-height` (5rem) | 5.6% of width              |
| Content gutter          | 30px                                   | `--app-gutter` (2rem)        | 2.1% of width              |
| Gap between cards       | 20px                                   | `--space-grid`               | 1.4% of width              |
| Card padding            | 24px                                   | `--space-5`                  | 1.7% of width              |
| Card radius             | 10px                                   | `--radius-lg`                | —                          |
| Control and chip radius | 8px                                    | `--radius-md`                | —                          |
| Figure-tile radius      | 14px                                   | `--radius-tile`              | —                          |
| Stat card               | 256 x 152                              | —                            | 17.8% of width             |
| Figure tile             | 56px                                   | `--tile-size`                | —                          |
| Activity tile           | 36px                                   | `--tile-size-sm`             | —                          |
| Nav item                | 52px tall, 4px accent bar              | —                            | —                          |
| Avatar                  | 44px                                   | —                            | —                          |
| Toggle                  | 48 x 26, 18px knob                     | —                            | —                          |
| Button                  | 44px; 36px small; 56px final           | `--control-height*`          | —                          |
| Table row               | 48px                                   | —                            | —                          |
| Seat bar                | 8px, pill                              | —                            | —                          |
| Photograph band         | 92px on a card, 192px on a course page | —                            | —                          |

The dashboard's three content rows measure 1.35fr / 1fr, then 1fr / 1fr, with
four equal stat cards above them. The cart is 1fr / 19rem. The catalogue is
three equal columns.

### Type, measured the same way

| Role                      | Measured | Face     | Weight | Token         |
| ------------------------- | -------- | -------- | ------ | ------------- |
| Page title                | 40px     | serif    | 700    | `--text-3xl`  |
| Section heading           | 28px     | serif    | 700    | `--text-xl`   |
| Card title                | 18-20px  | **sans** | 700    | `--text-md`   |
| Figure (a stat's number)  | 30px     | **sans** | 700    | `--text-xl`   |
| Page description          | 20px     | sans     | 400    | `--text-md`   |
| Body                      | 17px     | sans     | 400    | `--text-base` |
| Meta, table cell          | 15px     | sans     | 400    | `--text-sm`   |
| Small label, table header | 13px     | sans     | 400    | `--text-xs`   |

The serif sets the page title, the standalone section headings and the
wordmark. **Every card heading in the target is a bold grotesque**, which is
why `Card` overrides the element default — a card's title names a panel, not a
document.

Icons sit on a 16 / 20 / 24px grid through the `Icon` component. 24px in the
sidebar and beside a card title, 16px inside a line of text.

## Shape, depth and layout

- **Radii are consistent**: 6px (`sm`, small tags), 8px (`md`, controls and
  chips), 10px (`lg`, cards), 14px (`tile`, the rounded square behind a figure
  icon), and `--radius-pill` only where the shape IS the affordance: a switch,
  an avatar, a seat bar, a step number.
- **Cards sit on the page rather than above it**: a hairline plus
  `--shadow-card`, which is two shadows at 3-4% and no spread. `--shadow-float`
  and `--shadow-overlay` stay for the things that genuinely leave the page:
  menus, dialogs, toasts.
- **Flexbox** for rows that share a line (nav items, button groups, card
  metadata); **Grid** for the page shells, the catalogue, dashboards and admin
  panels.
- Positioning: `sticky` sidebar and page header, `fixed` phone nav and skip
  link, `absolute` overlays and badges, `relative` as their anchor.
- Breakpoints at **1440 / 820 / 390**, as media queries on `width < 64rem` and
  `width < 40rem`. 1440 is the width the target was drawn at and the width the
  comparison screenshots are taken at. Wide tables scroll inside their own keyboard-focusable
  region; the page itself never scrolls sideways.

## The shared system

Every page is built from these. A page that needs something new reports it
rather than inventing a global style, because two pages inventing the same
thing twice is how a design system dies.

| Piece                       | What it is for                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| `PageHeader`                | The serif title, its description, right-aligned actions; focuses the h1  |
| `Card`                      | A hairline-bordered article with an optional icon, title and actions     |
| `Button` / `LinkButton`     | primary (the one green button), secondary (hairline), danger, ghost      |
| `Badge` / `StatusBadge`     | A soft-filled chip, always icon + word, never colour alone               |
| `CourseCode`                | A course code as a bordered tag                                          |
| `SeatMeter`                 | The seat bar and its figures                                             |
| `StatTile`                  | One headline number: tinted icon tile, figure, label, link               |
| `ProgressRing`              | A proportion as a ring with the percentage written in it                 |
| `Stepper`                   | Where someone is in a short sequence (Select, Review, Submit)            |
| `Toggle`                    | A `role="switch"` button for a setting that applies at once              |
| `Tabs`                      | ARIA tabs with a roving tabindex; the selected one takes the accent      |
| `DataTable`                 | Typed columns, sorting, filtering, paging, with its own async states     |
| `EmptyState`                | A dashed note, left-aligned, with the one action that continues the flow |
| `ErrorMessage` / `Skeleton` | The other two async states                                               |
| `Notice`                    | A tinted line of explanation: why a period is closed, how to reorder     |
| `WindowCard`                | The registration window and its countdown, in a page header              |
| `CoursePhoto`               | The photograph at the top of a course card                               |
| `CourseCard`                | One catalogue entry, photograph to buttons, with its "⋮"                 |
| `GlobalSearch`              | The header's catalogue search, with Ctrl+K / Cmd+K                       |

### Course photographs

Each catalogue card opens with a photograph: dark, wide and cinematic — server
halls, circuit boards, bridges and city nights — the mood the target sets.

Seventeen of them live in
[`frontend/public/course-photos`](../frontend/public/course-photos), and a
course picks one by hashing its own code (`utils/coursePhoto.ts`), so a course
always wears the same picture and three neighbouring cards almost never repeat.

They are **all CC0 or public domain**, found through the Openverse API, which
is what makes the credit in the README accurate rather than guessed;
[`docs/redesign/course-photos.json`](redesign/course-photos.json) records each
one's title, creator, licence and source page. They were downloaded once,
cropped to the band's proportions and committed: **nothing is hotlinked, and
no request leaves the reader's browser for anyone else's server.**

The picture is decoration — the code, name, department and seat count are all
written out underneath — so it carries an empty `alt` and is hidden from
assistive technology. It is also `loading="lazy"`, because a catalogue of
twelve cards should not cost twelve images before the first paint.

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

## Decisions, and why

The redesign was reviewed against a checklist of the things that make an
interface look generated rather than designed. Each one below is a decision,
not a preference, so a later change has something to argue with.

**Coloured left stripes: removed.** See "No colour without a key" above. A
callout that used to be a 3px coloured left edge is now a full 1px border in
the same colour, which is what it was always trying to say. The one survivor
is the active-item marker in the sidebar, which marks a selected state the
user just caused, not a category.

**Seat dot grids: kept, as data.** Twenty dots is the one drawing in the
product that earns its place: the catalogue's job is "is there room", and a
filled matrix answers it faster than a number. It is kept because **the exact
figures sit beside it on every surface** ("1 of 60 allocated · 59 left"), so
the dots add speed and never carry the fact alone. A dot grid with no number
beside it would be ornament, and would have gone.

**Em dashes: not in the interface.** Every one in the UI copy is now a comma,
a colon or a second sentence. The exception is the `—` printed in a table cell
for a missing value: there it is a value meaning "none", not punctuation, and
it is the convention a registrar's printout already uses. Documents in `docs/`
keep their em dashes; they are prose, not interface.

**Icons: few, and the same few.** Lucide only, through `Icon`, at one stroke
weight, sized in `em`. An icon appears where it adds meaning a word cannot
(status badges, nav, the sort direction) and nowhere as decoration. No icon
sits next to a heading just to fill the space.

**No checkmark bullet lists.** A list of green ticks is a marketing device.
Lists are plain. A check icon _inside_ a `StatusBadge` is different and stays:
there it is one of several icons distinguishing one state from another, with
the word beside it.

**Hover: functional and subtle.** A hover tells you a thing is interactive and
stops there: a background one step warmer, a border one step darker, an
underline. Nothing lifts, scales, glows or changes colour family. Transitions
are `--duration-base` and respect `prefers-reduced-motion`.

**Skeletons: kept.** Every async surface still draws the shape of what is
coming. They are honest about layout, they stop the page jumping, and
`DataTable` marks its skeleton `aria-busy` so tests and assistive technology
can tell loading from loaded.

**Privacy and Terms: written, and marked as a template.** Both pages are
linked from both footers and say plainly what the software does with a
student's data and how a seat is decided. Both open with a callout stating
that the data controller, the retention period, the applicable law and the
complaints route are the university's to fill in. Inventing those would be
writing legal advice from a codebase, which is worse than leaving the gap
visible.

## Review

> Entries before v1.6 describe reviews in a dark theme. The app no longer has
> one — v1.6 removed it — and they are kept because they are what happened.

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
