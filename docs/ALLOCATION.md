# Allocation: how seats are decided

Registration closes with more students wanting "Artificial Intelligence" than
it has seats — 112 requests against 20 in the demo data. This document is the
rule book for what happens next: what the model allows, how a student is
scored, what each method does, why one of them is defensible and the other is
not, and how any past run can be proved reproducible.

The engine that implements all of this is `backend/src/allocation/`. It is a
**pure function**: no database, no clock, no `Math.random`. The same input and
the same seed always produce the same output, which is what makes a run
reproducible and what lets the property-based tests throw thousands of random
universes at it without a server.

## 1. The model

- Only **submitted** carts take part. A saved draft is not a submission.
- Each student is allocated **at most one** elective from their ranked list
  (P1–P5).
- A student is only ever allocated a course they **ranked**, are **eligible**
  for — re-checked from the database at allocation time, never trusted from
  when the cart was saved — and that the window **offers**.
- **Capacity is never exceeded.** The application respects it, and the trigger
  on `enrollments` that maintains `allocated_count` has a CHECK that rejects
  the statement if it ever would. The database is the final guard.
- **Waitlists**:
  - a student who got nothing is waitlisted on **every** course they ranked;
  - a student who got their Pn is waitlisted only on the courses they ranked
    **above** Pn, so any later promotion is an upgrade and never a downgrade;
  - waitlist order follows the method — submission order for FCFS, score and
    then the seeded tie-break for Preference + Priority.

Everything else follows from the assignment, so it is derived in one place
(`allocation/results.ts`) rather than twice in the two strategies.

## 2. Scoring

`allocation/scoring.ts`. A score exists only for Preference + Priority; FCFS
does not score, and its result rows carry `null` rather than a number it did
not use.

```
total = preferenceWeights[rank] + every priority bonus that applies
```

| Part                | Default                            | When it applies                                                                          |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Preference weight   | P1 100, P2 80, P3 60, P4 40, P5 20 | Always, by the rank the student gave the course                                          |
| Final year          | +20                                | Semester 7 or 8                                                                          |
| Programme relevance | +25                                | The course is listed as relevant to the student's programme (`course_program_relevance`) |
| Graduation urgency  | +40                                | Expected graduation term is this term or earlier                                         |

The weights and points are the window's frozen policy, editable while it is a
DRAFT and immutable from the moment registration opens.

The score is returned as a **breakdown**, not a total, because a student is
owed an explanation of it:

```
185 (1st preference 100 + final year 20 + programme relevance 25 + graduating this term 40)
```

### The tie-break

Two students can score identically. Each student is given **one** random
number, drawn from the window's stored `random_seed` after sorting students by
id, and it is used for every course they apply to.

It is drawn once per student rather than freshly per comparison for two
reasons. A fresh draw each time would make the ordering **non-transitive** — A
beats B, B beats C, C beats A — so the answer would depend on the order the
comparisons happened to be made. And it would not be reproducible: re-running
the identical input could produce a different result, which would make the
"verify" button meaningless.

Sorting by id before drawing means the numbers do not depend on the order rows
came back from PostgreSQL either.

## 3. FCFS — the baseline

`allocation/fcfsStrategy.ts`, version `fcfs-1.0.0`.

Students are processed in the order their submission arrived — the
`submission_sequence` taken from a database sequence inside the submit
transaction, not any clock the client controls. Each student takes the
highest-ranked course they are eligible for that still has a seat.

Nothing about the student matters except how quickly they pressed Submit.
That is the behaviour the problem statement set out to replace, and the
metrics below are how it is made visible rather than merely asserted.

## 4. Preference + Priority — student-proposing deferred acceptance

`allocation/preferencePriorityStrategy.ts`, version
`deferred-acceptance-1.0.0`.

Each course ranks its applicants by that student's total score **for that
course** (then the tie-break number). Then:

1. Every student proposes to their highest remaining choice.
2. Each course tentatively **holds** the best applicants it has seen, up to
   capacity, and rejects the rest.
3. A rejected student proposes to their next choice. A better applicant
   arriving later **displaces** one already held, who re-enters the queue.
4. Repeat until nobody is holding a rejection. Only then is the result final.

"Deferred" is the important word: a hold is provisional right up to the end,
which is exactly what a one-pass greedy assignment lacks.

### A worked example

Three students, two courses with one seat each. AI is relevant to CSE.

| Student | Programme | Semester | P1  | P2  | Score for AI            | Score for CS |
| ------- | --------- | -------- | --- | --- | ----------------------- | ------------ |
| Anya    | CSE       | 8        | AI  | —   | 100 + 20 + 25 = **145** | —            |
| Bharat  | ECE       | 5        | CS  | —   | —                       | 100          |
| Chetan  | CSE       | 5        | AI  | CS  | 100 + 25 = **125**      | 80           |

- Round 1: Anya and Chetan propose to AI; Bharat proposes to CS. AI holds
  Anya (145) and rejects Chetan (125). CS holds Bharat (100).
- Round 2: Chetan proposes to CS with 80. CS compares: Bharat 100 beats
  Chetan 80, so Chetan is rejected again and has no choices left.
- Result: Anya → AI, Bharat → CS, Chetan → nothing, waitlisted on both AI
  (position 1) and CS (position 1).

Now change one thing: give Chetan the higher score for CS (say he is also in
his final year, 80 + 20 = 100 + tie-break). In round 2 CS holds whichever of
the two wins the comparison and returns the other to the queue — the seat is
never simply "already gone because someone got there first".

### Why this is fair

**No justified envy.** When the loop ends, there is no student _s_ and course
_c_ such that _s_ would rather have _c_ than what they hold **and** _c_
admitted someone who scored lower for _c_ than _s_ did. If there were, _s_
must have proposed to _c_ earlier — students propose strictly down their own
list — and been rejected; but a course only ever rejects an applicant worse
than the ones it is holding, and the applicants it holds only ever improve.
So the student it admitted cannot score lower than _s_. The property-based
test asserts this on hundreds of random worlds; the metric reports it on every
real run, and it is always 0.

**Truthful preferences.** In student-proposing deferred acceptance no student
can do better by submitting a list in an order other than their genuine one.
That matters for a registration system: students should be able to rank what
they actually want without trying to game which course is "realistic".

**What it does not promise.** It does not maximise the number of first
choices, and on some inputs FCFS will look better on that single number. What
it guarantees is that every seat can be defended: whoever holds it scored at
least as high for that course as anyone who wanted it. And the fairness it
buys is only as good as the scoring rules the registrar chose — the algorithm
is neutral about whether "final year +20" is the right policy.

## 5. Metrics, and what they mean

Reported for every run and for both methods in the admin preview.

| Metric                               | Meaning                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Students                             | Students with at least one ranked course that could still be allocated. A student whose every preference is now ineligible is not evidence about a method. |
| Allocated / Unallocated              | How many of those got a course, and how many got nothing.                                                                                                  |
| First-choice rate                    | Share of participating students allocated the course they ranked first.                                                                                    |
| Top-three rate                       | Same, for ranks 1–3.                                                                                                                                       |
| Average allocated rank               | Mean position of the course each allocated student received; 1.00 would be perfect.                                                                        |
| Seats offered / filled / utilisation | Offered seats across the window, and how many ended up occupied.                                                                                           |
| Waitlist entries                     | Places in a queue, counted across every course.                                                                                                            |
| **Justified envy**                   | Pairs where a student prefers a course that admitted someone scoring lower for it. **This is the number the argument rests on.**                           |
| Runtime                              | How long the algorithm itself took. Measured by the caller; the engine has no clock.                                                                       |
| Per course                           | Capacity, applicants, allocated, waitlisted and the cut-off score — the lowest score that still got a seat, or `—` if the course did not fill.             |

Justified envy is **always measured on the preference-priority scale**, even
for an FCFS run, because the question being asked is whether an outcome can be
defended on merit. Both methods are measured the same way, which is what makes
the comparison honest. A window that froze FCFS has no weights of its own, so
the defaults are used.

### The demo data, measured

150 submissions, 20 courses, AI at 20 seats against 112 requests:

| Measure                    | FCFS       | Preference + Priority |
| -------------------------- | ---------- | --------------------- |
| Got their first choice     | 43%        | 43%                   |
| Got one of their top three | 93%        | 93%                   |
| Average rank allocated     | **1.61**   | 1.63                  |
| Students with nothing      | 10         | **8**                 |
| Seats filled               | 140 of 865 | **142 of 865**        |
| Waitlist entries           | 96         | 101                   |
| **Justified envy**         | **78**     | **0**                 |
| Time to compute            | 9 ms       | 15 ms                 |

FCFS is marginally ahead on average allocated rank and slightly faster. It
also leaves 78 cases where a student was beaten to a seat by someone who
scored lower for that course, and places two fewer students. That trade — a
hundredth of a rank against 78 indefensible seats — is the whole argument.

## 6. Waitlist promotion

Allocation is a single moment; a term is not. Seats come free afterwards — an
administrator adds capacity, a student is withdrawn, someone drops — and the
queues built by the run are how those seats are filled. The engine for this is
`services/waitlistPromotionService.ts`, and every path that frees a seat calls
the same function, `processFreedSeats`, **inside its own transaction**: the
action and the promotions it causes commit together or not at all.

Promotion only happens while the window is `ALLOCATED`. Before that there are
no queues to promote from; the service checks the status itself rather than
trusting its caller.

### Offering one seat

When a course has a free seat, the student with the **lowest stored position**
still `WAITING` is considered:

- **Re-checked for eligibility**, from today's rows — not from what was true
  when the cart was saved, and not from the run's snapshot. A student whose
  record has moved under them has their entry `REMOVED` with the reason
  `INELIGIBLE`, and the seat passes to the next in line rather than being left
  empty.
- **Eligible → promoted.** A new `enrollments` row with source
  `WAITLIST_PROMOTION`, the entry marked `PROMOTED`.

### Promotion is always an upgrade

A student only ever waits for courses they ranked **above** whatever they hold,
so moving up cannot be a demotion. When the promoted student was holding a
lower-ranked seat:

- that enrollment becomes `DROPPED` with `drop_reason = 'UPGRADED'`,
- their `WAITING` entries for courses ranked **below** the new one are
  `REMOVED` with the reason `RANKED_BELOW_SEAT` — waiting there could now only
  be a downgrade,
- and **the seat they released is processed the same way**. That is the
  cascade: one withdrawal can move several students, each one upward.

**The cascade always terminates.** Every promotion strictly improves one
student's preference rank — 3rd choice to 1st, never sideways — and a rank
cannot improve past 1. With `n` students and at most 5 preferences each, there
are fewer than `5n` promotions available in total, so the work queue drains.
The property-based tests run the whole thing on hundreds of random worlds;
none of them loops.

### Positions are computed, never rewritten

`waitlist_entries.position` is written once, by the allocation run, and never
touched again. What a student is shown — "3rd of 18 waiting" — is a rank among
the entries that are still `WAITING`, computed in the query:

```sql
rank() OVER (PARTITION BY course_id ORDER BY position)
```

Promoting the person at position 1 therefore moves everybody below them up by
one, with no `UPDATE` at all. Renumbering instead would mean rewriting a whole
queue on every promotion, inside the transaction, while holding its locks —
and would destroy the evidence of what the run originally decided.

### What each promotion writes

| Table                  | Row                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| `enrollments`          | the new seat, source `WAITLIST_PROMOTION`                         |
| `enrollments`          | the released seat, `DROPPED` with `drop_reason = 'UPGRADED'`      |
| `waitlist_entries`     | the entry marked `PROMOTED`, and any now-pointless ones `REMOVED` |
| `registration_history` | `PROMOTED`, plus `DROPPED` and `WAITLIST_REMOVED` as they happen  |
| `notifications`        | one to the promoted student, naming both courses                  |
| `audit_logs`           | one `WAITLIST_PROMOTION` row per promotion                        |

`registration_window_courses.allocated_count` is not in that list on purpose:
the trigger on `enrollments` maintains it, and its CHECK is what makes
overbooking impossible even if this service were wrong.

### The paths that free a seat

1. **Capacity increased** — `PATCH /api/admin/courses/:code/capacity` calls the
   service when the window is `ALLOCATED`, so new seats are never left empty
   beside a queue.
2. **A student withdrawn** — `POST /api/admin/enrollments/:id/withdraw`, with a
   reason that goes to the student and into the audit log.
3. **The sweep** — `POST /api/admin/waitlists/process` offers every free seat
   in the window to whoever is waiting for it. Nothing should reach it, which
   is exactly why it exists: it is the safety net for a seat that freed up
   some other way.

4. **A student drops or swaps** — `POST /api/add-drop/drop` and `/swap` call the
   same function on their own transaction's client, so the student's action and
   the promotion it caused commit together (see "Add/drop" below).

### What the student sees

`GET /api/students/me/waitlist` is their own queues and nobody else's, with the
live position, the seats, their score and the upgrade rule spelled out in the
words of their own situation.

Their results page keeps the run's stored explanation as evidence and brings it
up to date for display (`services/allocationResultsOverlay.ts`, pure and unit
tested): a `PROMOTED` explanation naming the seat they gave up, a released seat
explained by the better course they were given, and a `SEAT_WITHDRAWN` one for
a seat an administrator took back. The stored `allocation_results` row is never
rewritten — that is what makes a run verifiable.

## 7. Add/drop

A term does not end when the results are published. Timetables clash, minds
change, and students who never submitted a cart still need a course. Add/drop is
the period an administrator opens for that, and the rules are the same rules —
one elective per student, capacity never exceeded, a free seat never visible
while somebody eligible waits for it — applied to a student acting on their own
enrolment instead of a batch acting on everyone's.

The pure decisions live in `services/addDropRules.ts`; the transaction that
carries them out is `services/addDropService.ts`. The locking is in
`docs/CONCURRENCY.md` ("The seat race").

### The period

`add_drop_opens_at` and `add_drop_closes_at` on the window (migration 0011), set
from `/admin/registration-window` through `PUT
/api/admin/registration-window/add-drop`, with an `ADD_DROP_PERIOD_UPDATED`
audit row every time. Both ends or neither: a period with only an opening time
would be one that never closes, and the CHECK refuses it.

It is deliberately **not** part of the frozen policy (migration 0008). Freezing
exists so that nobody changes the rules students submitted against; extending
add/drop by a day changes no rule, and the window is `ALLOCATED` by then, so the
service allows it there and nowhere else.

Outside the period every student action is refused with `PERIOD_CLOSED` (or
`NOT_ALLOCATED` before the run), and the page goes read-only with the dates.
`canAddDropNow(window, now)` is the only place that decides this, and the
transaction re-reads the window and asks it again — the page's idea of the
period is never trusted.

### The five actions

| Action             | What it does                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **DROP**           | Releases the seat (`STUDENT_DROP`) and, in the SAME transaction, offers it on.             |
| **ADD**            | Takes a free seat in an eligible, offered course. Only for a student holding nothing.      |
| **SWAP**           | Moves atomically from the held seat to another course. Either it happens, or nothing does. |
| **WAITLIST_JOIN**  | Joins a full course's queue. Only for a student holding nothing.                           |
| **WAITLIST_LEAVE** | Ends the entry as `REMOVED` with the reason `STUDENT_LEFT`.                                |

Every one of them carries an idempotency key, is rate-limited per session,
re-checks eligibility server-side from today's rows, writes a
`registration_history` row and a notification, and leaves `allocated_count` to
the trigger on `enrollments`.

**DROP** is the interesting one. The freed seat goes through
`processFreedSeats` before the transaction commits, so the promotion invariant
holds without a gap: the seat is never observable as "free" while an eligible
student is waiting for it. The student keeps their own waitlist entries unless
they ask to leave them (`leaveWaitlists: true`) — dropping a course is not a
statement about the others they wanted.

**SWAP** releases the old seat and then takes the new one, in that order,
because `enrollments_one_active_per_student_window_idx` allows exactly one
ACTIVE seat per student. If taking the new seat fails for any reason, the
rollback puts the old one back; that is what "the student keeps their old seat"
means, and it is not a special case in the code but the transaction doing its
job. The released seat then goes through `processFreedSeats` like any other.

**ADD** and **SWAP** may land on a course the student never ranked. Allocation
only ever gives a ranked course; add/drop gives whatever the student asks for,
which is why `enrollments.source` is `ADD` and the seat carries no preference
rank.

### Late registration

A student who never submitted a cart has no `preference_submissions` row, no
results and no waitlist entries. They may still add and join queues during
add/drop, which is the whole point: nothing in add/drop reads a submission.

That is why the waitlist reads outer-join the ranked preferences instead of
requiring them (see `waitlistRepository`): an entry with no rank behind it is a
real entry, and promotion has to offer it a seat in its turn.

### Why late joiners do not jump the queue

`waitlist_entries.position` is written once and never renumbered — the rule from
Phase 9, unchanged. A late joiner is given
`max(position) + 1` over **every** entry the course has ever had, not over the
ones still `WAITING`.

The difference matters. Promoting or removing an entry leaves its position
behind as a gap, and reusing that gap would drop the newcomer into the middle of
a queue the allocation run ordered by score. Taking the maximum instead means
every entry created after the run has a position higher than every entry the run
created, so the run's ordering is preserved exactly and add/drop arrivals form a
tail in commit order. The per-window advisory lock is what makes "commit order"
a well-defined thing to be in.

So a student who joins on day three of add/drop waits behind everyone the run
placed, and behind everyone who joined on day two. They are not being punished;
they are simply last, which is what arriving last means.

### Joining a queue needs an empty timetable

A queue place is only ever offered to a student holding no seat.

The reason is the promotion rule, not caution. Promotion is only ever an
**upgrade**: a student is moved to a course they ranked strictly higher than the
one they hold. A queue joined during add/drop has no rank behind it — the
student never ranked that course — so "would this be an upgrade?" has no answer,
and the cascade's termination argument (every promotion strictly improves one
student's rank) would have nothing to stand on.

Two consequences follow, and both are enforced:

- **Joining while holding a seat is refused** (`ALREADY_HOLDS_SEAT`), and the
  message points at swapping, which is the action for a change.
- **Taking any seat ends the queues joined during add/drop**, marked `REMOVED`
  with the reason `SEAT_ELSEWHERE`. Leaving them `WAITING` would be leaving a
  promise that promotion could never keep. Places the student **ranked** are
  untouched: a course they ranked still beats a seat they added, and promotion
  knows it.

The second point is why `staleEntryReason` in
`services/waitlistPromotionService.ts` has three branches rather than one, and
why a seat with no rank (an `ADD`) does not disqualify a ranked entry above it.

### What add/drop writes

| Table                  | Row                                                                          |
| ---------------------- | ---------------------------------------------------------------------------- |
| `enrollments`          | the new seat (source `ADD`); the released one `DROPPED` with its reason      |
| `waitlist_entries`     | a new `WAITING` entry, or one `REMOVED` as `STUDENT_LEFT` / `SEAT_ELSEWHERE` |
| `registration_history` | `ADDED`, `DROPPED`, `SWAPPED`, `WAITLIST_JOINED`, `WAITLIST_LEFT`            |
| `notifications`        | one `ENROLLMENT_CHANGE` naming what changed                                  |
| `add_drop_requests`    | the idempotency key with the reply that was sent                             |

`allocation_results` is not in that list, and never will be: those rows are the
evidence the run is reproducible. What the student is shown is that stored
explanation brought up to date by `allocationResultsOverlay.ts`, which since
this phase can also say `SEAT_DROPPED` (they released it themselves, as opposed
to `SEAT_WITHDRAWN`) and `ADDED` (they took it during add/drop). A seat in a
course they never ranked has no stored row at all, so the results endpoint
reports it separately as `held`.

### Demonstrating it

```bash
npm run docker:demo:reset -- --stage=add-drop   # allocated, period open
npm run docker:demo:seat-race                   # 100 students, 10 seats
```

## 8. Reproducibility

Every run stores what it would need to happen again:

- `method` and `algorithm_version` (e.g. `deferred-acceptance-1.0.0`),
- `random_seed`, the window's frozen tie-break seed,
- `config_snapshot`, the frozen weights and priority points,
- `input_snapshot` — **the engine's input as JSON**, not a rebuild
  instruction: the students, their sequence numbers and facts, their
  preferences, the eligibility already resolved, and the courses with their
  capacities,
- `output_hash`, a SHA-256 over the sorted decisions (not the timings, which
  differ every time),
- `metrics`.

`POST /api/admin/allocation-runs/:id/verify` feeds the **stored** snapshot back
through the **same strategy version** and compares hashes. It writes nothing
except a line in `audit_logs` recording who checked and when. Using the stored
snapshot rather than today's database is the point: the database has moved on,
the snapshot has not.

If the algorithm version has changed since the run, the response says so
explicitly rather than quietly reporting a mismatch.

## 9. Running it

`POST /api/admin/allocation/run` (see `services/allocationService.ts`):

1. **Own transaction:** insert the `allocation_runs` row as `RUNNING`. The
   unique index allows one per window, so a second attempt is refused here.
2. **One transaction:** lock the window `FOR UPDATE`, build the snapshot, run
   the frozen strategy, then write `allocation_results`, `enrollments`
   (source `ALLOCATION`), `waitlist_entries`, one `registration_history` row
   and one notification per student, an `audit_logs` row, mark the run
   `COMPLETED` and set the window to `ALLOCATED`. Any throw rolls all of it
   back; an integration test injects a fault mid-way and asserts every table
   is untouched.
3. **Separate transaction:** mark the run `FAILED` with the error. It has to
   be separate, because the rollback above does not reach a row created
   before it.

Every write is bulk — one statement per table, via `unnest`. A 300-student run
would otherwise be over a thousand round trips while holding the window lock.

Allocation for a closed window can complete **once**. Afterwards the window is
`ALLOCATED` and the service refuses another run.

## 10. Demonstrating it

```bash
npm run docker:demo:reset -- --stage=closed   # 150 submissions, window closed
npm run docker:demo:reset -- --stage=allocated # …and allocation run for real
```

Each stage goes through the real service, not a shortcut `UPDATE`, so the
audit rows and notifications exist exactly as they would on the day.
