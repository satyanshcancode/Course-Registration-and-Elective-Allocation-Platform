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

## 6. Reproducibility

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

## 7. Running it

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

## 8. Demonstrating it

```bash
npm run docker:demo:reset -- --stage=closed   # 150 submissions, window closed
npm run docker:demo:reset -- --stage=allocated # …and allocation run for real
```

Each stage goes through the real service, not a shortcut `UPDATE`, so the
audit rows and notifications exist exactly as they would on the day.
