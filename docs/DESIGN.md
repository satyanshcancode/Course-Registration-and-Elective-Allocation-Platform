# Design direction

**Concept: the university course catalogue, digitised.** The interface borrows
from printed academic catalogues, timetables and registrar forms: calm, precise,
information-dense and trustworthy. Students use it under time pressure, so
clarity always beats decoration.

All UI follows this document. Tokens live in
[`frontend/src/styles/variables.css`](../frontend/src/styles/variables.css); every
component in `/dev/components` (dev only) shows them in use.

## Typography

| Role                                   | Face                                                          | Why                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headings                               | **Source Serif 4** (variable, `opsz` axis)                    | A bookish transitional serif made for catalogues and long reading. Its optical-size axis gives headings sharper, higher-contrast "display" letterforms while small text stays sturdy — the character comes from the cut, not from bolding everything. Fraunces was considered but its soft, wonky shapes read as editorial or playful rather than institutional. |
| UI and body                            | **IBM Plex Sans** 400 / 500 / 600                             | Engineered, slightly technical, very legible at 14–16px, with a clear distinction between `I`, `l` and `1`. Not Inter, not Roboto.                                                                                                                                                                                                                               |
| Codes, seat counts, timestamps, tables | **IBM Plex Mono** 400 / 500, plus `tabular-nums` in Plex Sans | Course codes read like catalogue labels; digits line up in columns like a timetable.                                                                                                                                                                                                                                                                             |

- All fonts are self-hosted through `@fontsource` (Latin subset only), loaded in
  `styles/fonts.css`. No Google Fonts CDN.
- Scale: ratio **1.2** (minor third) from a 1rem base:
  12.2 · 13.3 · **16** · 19.2 · 23 · 27.6 · 33.2 · 39.8 px. The three largest
  steps are fluid (`clamp()`), so page titles shrink on phones without media queries.
- Headings: serif, weight 560–620 (not 700), `letter-spacing: -0.015em` to
  `-0.02em`, line-height 1.15–1.2, `font-optical-sizing: auto`.
- Body: 1rem / 1.55. Dense UI text (tables, meta) 0.833rem / 1.45.
- **Kicker**: a small uppercase label above a serif title
  (`FALL 2026 · REGISTRATION`): Plex Sans 600, 0.694rem, `letter-spacing: 0.08em`,
  muted ink.

## Colour

**Accent: deep library green `#1F4D3A`.** It recalls cloth-bound catalogues,
green-shaded desk lamps and the registrar's stamp, and reads as calm and
institutional rather than commercial. Oxblood was the alternative, but this
product's most common negative status is "not allocated" (brick red), and red
validation errors sit right next to primary buttons. With an oxblood accent the
main action would look like a destructive one, so red is reserved for problems.
The allocated/success green is a separate, yellower moss (`#2D6630`), and it
always appears with a check icon and the word, so the two greens are never
confused.

Semantic tokens (light "paper" / dark "ink"):

| Token                    | Light     | Dark      | Use                                                      |
| ------------------------ | --------- | --------- | -------------------------------------------------------- |
| `--color-paper`          | `#F7F5F0` | `#1B1916` | Page background (warm off-white / warm charcoal)         |
| `--color-surface`        | `#FCFBF8` | `#23201C` | Cards, tables, inputs, header                            |
| `--color-surface-sunken` | `#EFECE4` | `#16140F` | Table stripes, meter track, code blocks                  |
| `--color-ink`            | `#1D1B17` | `#ECE7DC` | Primary text (never pure black/white)                    |
| `--color-ink-muted`      | `#5A554C` | `#B3AC9E` | Secondary text, captions, kickers                        |
| `--color-rule`           | `#DCD6CA` | `#3A3630` | Hairline borders and table rules (decorative)            |
| `--color-rule-strong`    | `#8C8577` | `#7D7667` | Input borders, meter edges (≥ 3:1, WCAG 1.4.11)          |
| `--color-accent`         | `#1F4D3A` | `#8CC3A4` | Primary buttons, active nav, links, focus ring           |
| `--color-success`        | `#2D6630` | `#96C68E` | Allocated, enrolled, eligible                            |
| `--color-warning`        | `#85560A` | `#DDAE55` | Waitlisted, nearly full (ochre)                          |
| `--color-danger`         | `#9A2F22` | `#E8978A` | Not allocated, errors, full, destructive actions (brick) |
| `--color-info`           | `#475467` | `#AEB8C6` | Pending, draft, neutral notices (slate)                  |

Each status colour has a `-soft` background (`--color-success-soft` …) for badges
and notices. Status is **never shown by colour alone**: every status has a
colour, an icon and a text label (`StatusBadge`), and the seat meter always prints
its numbers.

The dark theme is an "ink" version: a warm charcoal paper with light warm ink.
It is a single `@media (prefers-color-scheme: dark)` block that only redefines
colour tokens.

### Contrast (WCAG 2.2 AA)

Computed with the WCAG relative-luminance formula. Text needs 4.5:1;
non-text UI (input borders, focus ring, meter fill) needs 3:1.

| Pair                                   | Light         | Dark          |
| -------------------------------------- | ------------- | ------------- |
| ink on paper                           | 15.78:1       | 14.22:1       |
| ink on surface                         | 16.62:1       | 13.15:1       |
| ink on surface-sunken (stripes)        | 14.56:1       | 14.92:1       |
| ink-muted on paper                     | 6.79:1        | 7.78:1        |
| ink-muted on surface                   | 7.15:1        | 7.19:1        |
| ink-muted on surface-sunken            | 6.27:1        | 8.16:1        |
| accent on paper (links, active nav)    | 8.84:1        | 8.73:1        |
| accent on surface                      | 9.31:1        | 8.08:1        |
| accent on accent-soft                  | 7.89:1        | 6.65:1        |
| on-accent on accent (primary button)   | 9.31:1        | 8.41:1        |
| on-accent on accent-hover              | 12.12:1       | 10.04:1       |
| success on success-soft / surface      | 5.70 / 6.64:1 | 7.11 / 8.31:1 |
| warning on warning-soft / surface      | 5.22 / 6.09:1 | 6.67 / 7.92:1 |
| danger on danger-soft / surface        | 5.98 / 7.24:1 | 6.41 / 7.12:1 |
| info on info-soft / surface            | 6.27 / 7.43:1 | 7.00 / 8.09:1 |
| rule-strong on surface (input borders) | 3.54:1        | 3.60:1        |
| accent on surface-sunken (meter fill)  | 8.16:1        | 9.16:1        |

`--color-rule` is deliberately below 3:1: hairlines separate content that is
already grouped by alignment and spacing. They're decorative, not the only cue.

## Shape, depth and layout

- **Hairlines, not boxes.** 1px warm-grey rules separate content. Cards are
  hairline-bordered surfaces with no shadow.
- **Shadows only for things that float**: modals, toasts and menus
  (`--shadow-float`, `--shadow-overlay`).
- **Small radii**: 2px (tags, badges), 4px (inputs, buttons, cards), 6px
  (dialogs). No pills, no 24px rounded cards.
- **Left-aligned grids** with clear alignment lines. Tables are set like a
  timetable: tabular numerals, hairline rules, subtle striping, right-aligned numbers.
- **Course codes** look like catalogue labels: Plex Mono 500, letter-spaced,
  uppercase, in a thin outlined tag (`CourseCode`).
- **Seat availability** is a slim 6px horizontal meter with the exact numbers
  beside it ("37 of 50 allocated · 13 left"), never a donut.
- **Kicker + serif title** for section and page headings.
- **Motion** is short and functional only: 120ms (hover, press) and 180ms
  (dialog, toast, status change), with a standard ease-out curve. Nothing
  bounces, parallaxes or fades in on scroll. `prefers-reduced-motion` switches
  transitions and animations off.

## Layout

- **Desktop (≥ 1024px)**: a CSS Grid shell with a sticky left sidebar (15rem)
  and the content column. The top bar is sticky, and inside `main` a sticky page
  header holds the title and actions.
- **Tablet (640–1023px)**: the sidebar collapses to a 4rem icon rail. Labels
  appear as tooltips on hover and keyboard focus, and stay in the accessibility
  tree the whole time.
- **Mobile (< 640px)**: a fixed bottom navigation bar with the four most-used
  destinations plus **More** (the rest). Content is padded so nothing hides
  behind the bar, and toasts sit above it.

## Icons

Lucide, used through one `Icon` wrapper: 1.5px stroke (absolute), 16/20/24px
grid, `aria-hidden`. Every icon sits next to visible text or has a
visually-hidden label. No emoji, no sparkles.

## Copy

Short, direct and specific: "13 of 50 seats left", "Registration opens Mon 21
Sep, 10:00", "You're #7 on the waitlist". Say what happened and what to do next.
No marketing language and no placeholder text.

## Banned

Purple/blue/pink gradients and gradient text · glassmorphism and blur panels ·
emoji or sparkle icons · giant hero sections or welcome banners inside the app ·
big shadows and large radii on every card · centring everything · rows of
identical stat cards with huge numbers and tiny labels · lorem ipsum or vague
copy · default browser-blue links and buttons.

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

Final screenshots, in [`docs/screenshots/`](screenshots/):

| Page                      | Width, theme    | File                                                                             |
| ------------------------- | --------------- | -------------------------------------------------------------------------------- |
| Sign in                   | 1280, light     | [login-1280-light.png](screenshots/login-1280-light.png)                         |
| Student dashboard         | 1280, light     | [student-dashboard-1280-light.png](screenshots/student-dashboard-1280-light.png) |
| Student dashboard (rail)  | 820, light      | [student-dashboard-820-light.png](screenshots/student-dashboard-820-light.png)   |
| Cart placeholder (phone)  | 390, dark (ink) | [student-cart-390-dark.png](screenshots/student-cart-390-dark.png)               |
| Admin dashboard           | 1280, dark      | [admin-dashboard-1280-dark.png](screenshots/admin-dashboard-1280-dark.png)       |
| Component gallery: table  | 820, light      | [gallery-table-820-light.png](screenshots/gallery-table-820-light.png)           |
| Component gallery: dialog | 1280, light     | [gallery-modal-1280-light.png](screenshots/gallery-modal-1280-light.png)         |

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

Final screenshots:

| Page                                   | Width, theme | File                                                                                     |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| Catalogue, cards                       | 1280, light  | [catalogue-cards-1280-light.png](screenshots/catalogue-cards-1280-light.png)             |
| Catalogue, cards (rail)                | 820, dark    | [catalogue-cards-820-dark.png](screenshots/catalogue-cards-820-dark.png)                 |
| Catalogue, table (phone)               | 390, light   | [catalogue-table-390-light.png](screenshots/catalogue-table-390-light.png)               |
| Course detail, eligible                | 1280, light  | [detail-1280-light.png](screenshots/detail-1280-light.png)                               |
| Course detail, not eligible            | 1280, dark   | [detail-ineligible-1280-dark.png](screenshots/detail-ineligible-1280-dark.png)           |
| Course detail (phone)                  | 390, dark    | [detail-390-dark.png](screenshots/detail-390-dark.png)                                   |
| Admin courses                          | 1280, light  | [admin-courses-1280-light.png](screenshots/admin-courses-1280-light.png)                 |
| Edit capacity, validation (phone)      | 390, light   | [admin-dialog-390-light.png](screenshots/admin-dialog-390-light.png)                     |
| Live update, changed seats highlighted | 1280, light  | [catalogue-live-update-1280-light.png](screenshots/catalogue-live-update-1280-light.png) |

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

Final screenshots:

| Page                               | Width, theme | File                                                                             |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Eligibility pre-check              | 1280, light  | [eligibility-1280-light.png](screenshots/eligibility-1280-light.png)             |
| Eligibility pre-check (phone)      | 390, dark    | [eligibility-390-dark.png](screenshots/eligibility-390-dark.png)                 |
| Student dashboard                  | 1280, light  | [student-dashboard-1280-light.png](screenshots/student-dashboard-1280-light.png) |
| Student dashboard (rail)           | 820, dark    | [student-dashboard-820-dark.png](screenshots/student-dashboard-820-dark.png)     |
| Registration window, draft form    | 1280, light  | [admin-window-1280-light.png](screenshots/admin-window-1280-light.png)           |
| Registration window, policy frozen | 1280, dark   | [admin-window-1280-dark.png](screenshots/admin-window-1280-dark.png)             |
| Admin dashboard                    | 1280, light  | [admin-dashboard-1280-light.png](screenshots/admin-dashboard-1280-light.png)     |
| Admin dashboard (phone)            | 390, light   | [admin-dashboard-390-light.png](screenshots/admin-dashboard-390-light.png)       |

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

Final screenshots:

| Page                                 | Width, theme | File                                                                                     |
| ------------------------------------ | ------------ | ---------------------------------------------------------------------------------------- |
| Add/drop, holding a seat             | 1280, light  | [student-add-drop-1280-light.png](screenshots/student-add-drop-1280-light.png)           |
| Add/drop, holding nothing            | 390, dark    | [student-add-drop-390-dark.png](screenshots/student-add-drop-390-dark.png)               |
| Registration window, add/drop period | 1280, light  | [admin-add-drop-period-1280-light.png](screenshots/admin-add-drop-period-1280-light.png) |
