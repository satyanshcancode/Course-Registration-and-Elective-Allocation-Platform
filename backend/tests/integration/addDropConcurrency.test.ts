/**
 * The seat race: what happens when a seat is worth more than one student.
 *
 * These are the tests the add/drop guarantee rests on. Every case releases its
 * requests together and then asks the database what it actually holds, because
 * the only honest evidence that a seat cannot be taken twice is that it wasn't.
 *
 * The locking argument is in docs/CONCURRENCY.md ("The seat race").
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  action,
  buildAddDropWorld,
  doubleBooked,
  heldSeats,
  seatsTaken,
  type AddDropWorld,
} from './addDropWorld.js';
import { getTestPool } from './testDatabase.js';

/** Every student's enrollment source, so promotions can be told from adds. */
async function sourceCounts(windowId: string): Promise<Record<string, number>> {
  const result = await getTestPool().query<{ source: string; count: string }>(
    `SELECT source, count(*) AS count FROM enrollments
     WHERE window_id = $1 AND status = 'ACTIVE'
     GROUP BY source`,
    [windowId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.source, Number(row.count)]));
}

/** The live queue for a course: how many wait, and at which stored positions. */
async function queue(
  windowId: string,
  courseId: string,
): Promise<{ waiting: number; positions: number[] }> {
  const result = await getTestPool().query<{ position: number }>(
    `SELECT position FROM waitlist_entries
     WHERE window_id = $1 AND course_id = $2 AND status = 'WAITING'
     ORDER BY position`,
    [windowId, courseId],
  );
  const positions = result.rows.map((row) => row.position);
  return { waiting: positions.length, positions };
}

/** True when the numbers are all different and run 1,2,3,… with no gaps. */
function uniqueAndConsecutive(positions: readonly number[]): boolean {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  return (
    sorted.length === positions.length &&
    sorted.every((position, index) => position === (sorted[0] ?? 1) + index)
  );
}

describe('100 students racing for 10 seats', () => {
  it('seats exactly 10, queues exactly 90, and overbooks nobody', async () => {
    // One course with 10 seats. 100 eligible students, none of whom submitted a
    // cart, so allocation leaves every seat free and every student with none:
    // the cleanest possible starting line.
    const world = await buildAddDropWorld({
      courses: [{ code: 'RACE401', capacity: 10 }],
      students: Array.from({ length: 100 }, (_, index) => ({
        ranked: [],
        name: `Racer ${String(index).padStart(3, '0')}`,
      })),
    });
    expect(await seatsTaken(world.windowId)).toEqual({ RACE401: 0 });

    // Every request released together: "add RACE401, or queue me if it's full".
    const responses = await Promise.all(
      world.cookies.map((cookie) =>
        action(cookie, '/add', { code: 'RACE401', waitlistIfFull: true }),
      ),
    );

    const outcomes = responses.map((response) =>
      response.status === 200
        ? (response.body as { data: { result: { outcome: string } } }).data.result.outcome
        : `HTTP ${response.status}`,
    );
    const enrolled = outcomes.filter((outcome) => outcome === 'ADDED').length;
    const waitlisted = outcomes.filter((outcome) => outcome === 'WAITLISTED').length;

    expect(enrolled).toBe(10);
    expect(waitlisted).toBe(90);
    // The offering row agrees with the replies, and the trigger's CHECK would
    // have rejected an eleventh seat however the code got there.
    expect(await seatsTaken(world.windowId)).toEqual({ RACE401: 10 });
    expect(await doubleBooked(world.windowId)).toEqual([]);
    expect(await sourceCounts(world.windowId)).toEqual({ ADD: 10 });

    const { waiting, positions } = await queue(world.windowId, world.courseIds.RACE401 ?? '');
    expect(waiting).toBe(90);
    expect(uniqueAndConsecutive(positions)).toBe(true);
  }, 120_000);
});

describe('a drop racing an add', () => {
  it('gives the freed seat to the student waiting, not to the adder', async () => {
    // RACE401 is full with one seat. `holder` has it, `waiter` is queued for it
    // from the allocation run, and `outsider` never submitted and is not queued.
    const world = await buildAddDropWorld({
      courses: [{ code: 'RACE401', capacity: 1 }],
      students: [
        { ranked: ['RACE401'], name: 'Holder', semester: 8 },
        { ranked: ['RACE401'], name: 'Waiter', semester: 5 },
        { ranked: [], name: 'Outsider' },
      ],
    });
    const [holder, , outsider] = world.cookies;
    const [holderId, waiterId, outsiderId] = world.studentIds;

    // Released together: whichever order they arrive in, the waiting student
    // must win — the seat is never visible as "free" to the adder.
    const [drop, add] = await Promise.all([
      action(holder ?? '', '/drop', { code: 'RACE401' }),
      action(outsider ?? '', '/add', { code: 'RACE401', waitlistIfFull: true }),
    ]);

    expect(drop.status).toBe(200);
    expect(add.status).toBe(200);
    const held = await heldSeats(world.windowId);
    expect(held.get(holderId ?? '')).toBeUndefined();
    expect(held.get(waiterId ?? '')).toBe('RACE401');
    // The outsider either queued behind nobody, or was refused the seat — but
    // never took it. They certainly do not hold it.
    expect(held.get(outsiderId ?? '')).toBeUndefined();
    expect(await seatsTaken(world.windowId)).toEqual({ RACE401: 1 });
    expect(await doubleBooked(world.windowId)).toEqual([]);
  }, 60_000);
});

describe('20 students swapping into the same course at once', () => {
  it('fills the free seats and leaves every loser holding what they had', async () => {
    // 20 students each hold a seat in their own course (capacity 1 each), and
    // all 20 try to swap into TARGET, which has 5 free seats.
    const courses = [
      { code: 'TGT400', capacity: 5 },
      ...Array.from({ length: 20 }, (_, index) => ({
        code: `SRC4${String(index).padStart(2, '0')}`,
        capacity: 1,
      })),
    ];
    const world: AddDropWorld = await buildAddDropWorld({
      courses,
      students: Array.from({ length: 20 }, (_, index) => ({
        ranked: [`SRC4${String(index).padStart(2, '0')}`],
        name: `Swapper ${String(index).padStart(2, '0')}`,
      })),
    });
    const before = await heldSeats(world.windowId);
    expect(before.size).toBe(20);

    const responses = await Promise.all(
      world.cookies.map((cookie, index) =>
        action(cookie, '/swap', {
          fromCode: `SRC4${String(index).padStart(2, '0')}`,
          toCode: 'TGT400',
        }),
      ),
    );

    const swapped = responses.filter((response) => response.status === 200).length;
    const refused = responses.filter((response) => response.status === 409);
    expect(swapped).toBe(5);
    expect(refused).toHaveLength(15);
    // Every loser was told the seat had gone, not handed a generic error.
    for (const response of refused) {
      expect((response.body as { details: { type: string }[] }).details[0]?.type).toBe(
        'SEAT_TAKEN',
      );
    }

    const after = await heldSeats(world.windowId);
    expect(after.size).toBe(20);
    const seats = await seatsTaken(world.windowId);
    expect(seats.TGT400).toBe(5);
    expect(await doubleBooked(world.windowId)).toEqual([]);
    // Nobody who lost the race lost their seat either: a failed swap changes
    // nothing at all, because the whole thing is one transaction.
    for (const [studentId, code] of before) {
      const now = after.get(studentId);
      expect(now === code || now === 'TGT400').toBe(true);
    }
  }, 120_000);
});

describe('one student pressing the same button many times', () => {
  it('acts once, whichever of the duplicates the server sees first', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'RACE401', capacity: 5 }],
      students: [{ ranked: [], name: 'Impatient' }],
    });
    const cookie = world.cookies[0] ?? '';
    const key = randomUUID();

    // Ten copies of ONE attempt: the same idempotency key on all of them, which
    // is what the client does when a request seems slow.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => action(cookie, '/add', { code: 'RACE401' }, key)),
    );

    // The first to arrive does the work; the rest either replay it or are told
    // the key is still in flight. None of them may add a second seat.
    expect(responses.filter((response) => response.status === 200).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(await seatsTaken(world.windowId)).toEqual({ RACE401: 1 });
    expect(await doubleBooked(world.windowId)).toEqual([]);

    const rows = await getTestPool().query<{ count: string }>(
      `SELECT count(*) AS count FROM enrollments
       WHERE window_id = $1 AND student_id = $2 AND source = 'ADD'`,
      [world.windowId, world.studentIds[0]],
    );
    expect(rows.rows[0]?.count).toBe('1');
  }, 60_000);

  it('never gives one student two seats from two DIFFERENT keys at once', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'ONE400', capacity: 5 },
        { code: 'TWO400', capacity: 5 },
      ],
      students: [{ ranked: [], name: 'Greedy' }],
    });
    const cookie = world.cookies[0] ?? '';

    // Two genuinely different requests, each with its own key. Exactly one can
    // succeed: the other finds a seat already held.
    const responses = await Promise.all([
      action(cookie, '/add', { code: 'ONE400' }),
      action(cookie, '/add', { code: 'TWO400' }),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const held = await heldSeats(world.windowId);
    expect(held.size).toBe(1);
    expect(await doubleBooked(world.windowId)).toEqual([]);
  }, 60_000);
});

describe('the whole cascade under load', () => {
  it('survives 20 simultaneous drops from a course a queue is waiting on', async () => {
    // POP401 is full with 20 seats; 20 more students wait for it, each holding
    // a seat in BAK402. Every holder drops at the same instant, so 20 drops and
    // 20 promotions — each releasing a BAK402 seat — interleave.
    const world = await buildAddDropWorld({
      courses: [
        { code: 'POP401', capacity: 20 },
        { code: 'BAK402', capacity: 20 },
      ],
      students: Array.from({ length: 40 }, (_, index) => ({
        ranked: ['POP401', 'BAK402'],
        name: `Student ${String(index).padStart(2, '0')}`,
        semester: index % 2 === 0 ? 8 : 5,
      })),
    });
    const holders = await heldSeats(world.windowId);
    const droppers = world.studentIds.filter((id) => holders.get(id) === 'POP401');
    expect(droppers).toHaveLength(20);

    const responses = await Promise.all(
      droppers.map((id) =>
        action(world.cookies[world.studentIds.indexOf(id)] ?? '', '/drop', { code: 'POP401' }),
      ),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    // Each drop frees a POP401 seat that a waiting student takes, releasing
    // their BAK402 seat — and nobody was left wanting BAK402, so it empties.
    expect(await seatsTaken(world.windowId)).toEqual({ POP401: 20, BAK402: 0 });
    expect(await doubleBooked(world.windowId)).toEqual([]);
    expect(await sourceCounts(world.windowId)).toEqual({ WAITLIST_PROMOTION: 20 });
  }, 180_000);
});
