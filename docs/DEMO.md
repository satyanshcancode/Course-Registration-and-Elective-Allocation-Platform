# Demo script

A walkthrough that shows every feature in about 20 minutes, in an order that
tells a story: a student checks whether they can take a course, ranks their
choices and submits; the registrar closes registration and compares two ways of
deciding; the students see their results and the reasons behind them; a seat
frees up and the queue moves; add/drop opens; and finally the registrar creates
a real account from scratch.

Each step says what to click and gives one sentence to say while you do it.
Nothing here is faked: every number on screen comes from the real services.

---

## Before you start

```bash
npm run docker:up
npm run docker:demo:reset -- --stage=open
```

Wait for all four containers to report healthy, then open these in tabs:

| Tab                   | What it is                         |
| --------------------- | ---------------------------------- |
| http://localhost:5173 | The app                            |
| http://localhost:8025 | **Mailpit** — the inbox for step 8 |
| A terminal            | For the two concurrency scripts    |

All demo passwords are `Student@123`, and the admin is `admin@university.edu`
with `Admin@123`. Keep this page open — the sign-in screen is the form and
nothing else, so it does not list them.

> **If anything goes wrong mid-demo**, `npm run docker:demo:reset -- --stage=<stage>`
> puts the database back in a known state in a few seconds. The stages are
> `draft`, `open`, `closed`, `allocated` and `add-drop`.

> **Step 9 needs Mailpit.** It catches the invitation instead of delivering it,
> which is the default. If your `.env` points `SMTP_HOST` at a real relay, that
> step sends a real e-mail to whatever address you type — so comment the
> `SMTP_*` lines out before demonstrating, or invite an address you own.

---

## 1. The problem, in one screen (2 min)

**Sign in as** `admin@university.edu`.

1. You land on the **Dashboard**. Point at "Most demanded courses".

   > "Artificial Intelligence has 20 seats and 112 students have asked for it.
   > That is the problem this platform exists to solve — and the thing a
   > first-come-first-served queue settles by who had the fastest connection."

2. Click **Courses** in the sidebar and point at the oversubscribed rows.

   > "Four courses are oversubscribed. Nothing has been decided yet — these are
   > just the requests."

---

## 2. Eligibility, before anything is at stake (3 min)

**Sign out, sign in as** `meera.iyer@university.edu`.

1. Click **Eligibility**.

   > "Meera is in semester 3, studying Mechanical Engineering. The platform
   > checks every offered course against her actual record — her programme, her
   > semester, her credits and the courses she has passed — and shows her that
   > record right beside the result, so she can see what she was judged on."

2. Expand **Not eligible** and find **Artificial Intelligence**.

   > "And it tells her _every_ reason in plain English, not just the first one.
   > She needs semester 5, and she hasn't passed Data Structures. This is
   > available before registration even opens — that is the point. Find out
   > now, not after it closes."

**Sign out, sign in as** `aarav.sharma@university.edu`, click **Eligibility**.

> "Aarav is a CSE student in semester 6. He is eligible for 13 of the 20
> courses, including AI. Same page, same check, different record."

---

## 3. The cart, and the atomic submit (4 min)

Still signed in as **aarav.sharma**.

1. Click **Courses**. Find **Artificial Intelligence** and click **Add to
   cart**. Add three or four more — Machine Learning, Cloud Security,
   Distributed Systems.

   > "He adds courses from the catalogue itself. Notice the seat counts: they
   > refresh every ten seconds on their own, and a number that changes flashes
   > briefly. The tab in the background isn't polling at all."

2. Try to add a course he is **not** eligible for.

   > "An ineligible course doesn't show a dead button — it explains itself."

3. Click **My Cart**. Use **Move up** on the second course.

   > "He ranks up to five. Move up and Move down are the mechanism, and
   > drag-and-drop is an extra on top — so this is fully usable from the
   > keyboard, not keyboard-usable as an afterthought. Focus stays on the item
   > he moved, and its new position is announced."

4. Click **Submit preferences**, read the dialog, confirm.

   > "Submitting is one database transaction. It writes the submission, the
   > ranked items, the history entry and the notification together, or it
   > writes none of them. There is no such thing as a half-submitted cart."

5. Point at the receipt.

   > "He gets a reference, a timestamp and an arrival number that came from a
   > database sequence. And submitting early bought him nothing — that is the
   > whole design."

---

## 4. Proving the submit really is atomic (2 min)

In the terminal:

```bash
npm run docker:demo:concurrent-submit -- --students=100
```

> "Saying it is atomic is easy. This fires a hundred students at the database
> at the same instant — and each of them submits **twice simultaneously with
> the same idempotency key**, which is exactly what a user hammering a button
> on a flaky connection looks like."

When it finishes, read the PASS lines aloud:

> "No duplicate submissions. No partial carts. Exactly one submission per
> student. And the arrival numbers are unique with no gaps. The retry is safe
> because the server replays the first result for a key it has already seen,
> rather than doing the work again."

---

## 5. Two ways to decide, side by side (4 min)

**Sign in as** `admin@university.edu`.

1. **Registration Window** → **Close registration**, confirm.

   > "Registration is now closed. Note what was already frozen when it
   > _opened_: the method, the weights, the priority points, the tie-break seed
   > and the set of offered courses. They can't be changed now — the service
   > refuses, and a database trigger refuses too, even if the application code
   > were wrong. You cannot change the rules after seeing the entries."

2. **Allocation Runs** → **Preview both methods**.

   > "This runs both algorithms on a fresh snapshot and writes absolutely
   > nothing. It's a dry run, so the registrar can see what each would do
   > before committing to either."

3. Point at the two **justified envy** numbers.

   > "This is the number that matters. Justified envy counts the cases where a
   > student wanted a course more than someone who got it, _and_ scored higher
   > for it. First-come-first-served leaves 78 of those. Preference and
   > priority leaves zero — not by luck, but because deferred acceptance
   > provably cannot produce one."

   > "Both are measured on the same scale, deliberately, so the comparison is
   > honest rather than flattering."

4. Click **Run allocation**, confirm.

   > "One transaction: results, enrolments, waitlist entries, history, a
   > notification for every student, and an audit row. Then the window becomes
   > allocated. It can only ever complete once."

5. Open the run from the list. Point at the summary, then the per-course table.

   > "Every course, its applicants, how many got in, how many are queued, and
   > the score the last seat went for. Fourteen milliseconds for 150 students
   > over 20 courses — the engine is a pure function, so there's no database in
   > the loop."

6. Scroll to **Verify reproducibility** and click it.

   > "Each run stored its own input. This re-runs _that stored snapshot_ —
   > not today's database, which has moved on — through the same algorithm
   > version and compares output hashes. That is what makes 'reproducible' a
   > claim you can check rather than a promise."

---

## 6. What a student is actually told (3 min)

**Sign in as** `rohan.verma@university.edu` (final year, highest priority).

1. Click **Results**.

   > "Rohan got a seat. But look at what he's told about every course he
   > ranked, not just the one he got."

2. Point at a waitlisted course.

   > "His score for this course, broken down into the parts that made it — his
   > preference weight, plus final year, plus programme relevance, plus
   > graduation urgency. Then the cut-off: what the last seat actually went
   > for. And his place in the queue."

   > "He never sees another student's name or score. Just his own standing, and
   > enough of the shape of the result to see it was fair."

3. Click **History**.

   > "And the whole timeline: what he submitted, when, what allocation did, and
   > what happens next. These are stored as structured facts, not sentences —
   > the wording lives in one place and can be changed without rewriting
   > anybody's history."

---

## 7. A seat frees up, and the queue moves (3 min)

**Sign in as** `admin@university.edu`.

1. **Waitlists** → choose **CS401 · Artificial Intelligence**. Note the course
   is full, and note who is **#1** in the queue.

   > "Twenty seats, all taken, and a queue behind them."

2. In the holders table, click **Withdraw** on any student, give a reason, and
   confirm.

   > "Suppose this student leaves the course. The seat doesn't sit empty and it
   > isn't handed out by hand."

3. Point at the queue: the student who was #1 now holds a seat.

   > "Whoever was next and still eligible took it automatically, inside the
   > same transaction as the withdrawal — so the seat being freed and the seat
   > being filled commit together, or neither happens."

   > "And a promotion is only ever an upgrade: a student is only queued for
   > courses they ranked _above_ whatever they already hold. So when they move
   > up, the seat they release frees in turn, which can cascade — and it always
   > terminates, because every step moves somebody strictly up their own list."

4. Optionally click **Process waitlists**.

   > "This is the safety net: it offers every free seat in the window to its
   > queue. On a healthy database it finds nothing to do, which is the point."

---

## 8. Add/drop, and the seat race (3 min)

**Still as admin:**

1. **Registration Window** → scroll to **Add/drop period**. Set it to open now
   and close tomorrow, then **Save the add/drop period**.

   > "Results are published, so the registrar opens a window for changes."

**Sign in as any allocated student** (the dashboard of
`rohan.verma@university.edu` will do), click **Add/Drop**.

2. Point at **Drop** and **Swap**.

   > "They can drop the course, or swap into another one in a single step — and
   > a swap is genuinely one step: if the new course fills up first, they keep
   > the seat they already had rather than ending up with nothing."

3. Mention the closed case.

   > "Outside the period every one of these is refused by the server, and the
   > button says why instead of being greyed out with no explanation."

**In the terminal:**

```bash
npm run docker:demo:seat-race
```

> "The other half of the concurrency story. This finds a course with exactly
> ten free seats, finds a hundred eligible students holding nothing, and fires
> one 'add, or join the waitlist if full' per student at the same instant."

Read the result:

> "Exactly ten enrolled. Nobody overbooked, nobody enrolled twice, and the
> waitlist positions are unique and consecutive with no gaps. A hundred
> simultaneous requests for ten seats, and the database never lied about how
> many were left."

> "`--students` and `--seats` take it further if the machine can stand it."

---

## 9. A real account, from nothing (3 min)

**Sign in as** `admin@university.edu`.

1. Click **Students**.

   > "Three hundred accounts, searchable and filterable. And note what isn't
   > here: there's no sign-up page anywhere in this application. Students never
   > register themselves and never edit their own programme, semester or
   > credits — those are exactly what eligibility and priority are judged on,
   > so they belong to the registrar."

2. Click **Add student**, fill in a real-looking record, save.

   > "The account and the invitation e-mail are created in **one transaction**.
   > If the e-mail can't be sent, nothing is created at all — an account nobody
   > can be told about is worse than no account."

3. **Switch to the Mailpit tab** (http://localhost:8025) and open the new
   message.

   > "In development every e-mail lands here instead of being delivered.
   > There's the invitation."

4. Click the activation link in the e-mail. Set a password.

   > "The link works exactly once and expires after 48 hours. Only its SHA-256
   > hash is stored, so a leaked database can't be turned back into working
   > links — and an unknown link, a spent one and an expired one all give the
   > _same_ answer, so guessing teaches you nothing. Setting the password signs
   > them straight in."

5. Optionally: sign out, go to **Forgot your password?**, enter an address that
   does not exist.

   > "And this answers identically whether or not the address exists — same
   > status, same message, even if the mail server is down. Otherwise the page
   > itself becomes a way of discovering which addresses are real."

6. Back as admin, open a student and show **Deactivate**.

   > "Finally: nothing here is ever deleted. An account is deactivated, a
   > course is retired. Every submission, enrolment, waitlist place and stored
   > result still points at a row that exists — which is what makes the history
   > trustworthy, and what makes a past allocation run still verifiable a year
   > later."

---

## Closing (1 min)

> "Seven features, all working against a real PostgreSQL: a live catalogue, an
> eligibility pre-check, an atomic cart, a defensible allocation, waitlists
> that promote themselves, add/drop and a full history — plus the account and
> course management it needs to run on real data."

> "The two things I'd point at are the ones you can check rather than take on
> trust: justified envy at zero against first-come-first-served's 78, and a
> past run that re-runs from its own stored input to the same hash."

---

## Resetting afterwards

```bash
npm run docker:demo:reset -- --stage=open
```

And to stop everything:

```bash
npm run docker:down
```
