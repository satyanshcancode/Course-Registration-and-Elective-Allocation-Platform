/**
 * Add/drop over the real API and the real database: the five actions, every
 * refusal, the promotion a drop sets off inside its own transaction, the
 * atomicity of a swap, and the idempotent replay of a retry.
 *
 * What is NOT here is the seat race, which has a file of its own
 * (`addDropConcurrency.test.ts`).
 */
import { readAddDropProblems, type AddDropResult, type AddDropView } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { FAULT_MID_ADD_DROP } from '../../src/services/addDropService.js';
import { armFault } from '../../src/utils/faultInjection.js';
import {
  action,
  buildAddDropWorld,
  doubleBooked,
  heldSeats,
  openPeriod,
  seatsTaken,
  waitingPositions,
  type AddDropWorld,
} from './addDropWorld.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const app = () => buildApp();

afterEach(() => {
  armFault(null);
});

/** Two courses, one seat each, a queue behind the first. */
async function smallWorld(): Promise<AddDropWorld> {
  return buildAddDropWorld({
    courses: [
      { code: 'AI401', capacity: 1 },
      { code: 'CS402', capacity: 1 },
    ],
    students: [
      // Holds AI401 (senior, so it scores highest).
      { ranked: ['AI401', 'CS402'], name: 'Holder', semester: 8 },
      // Waiting for AI401, holds CS402.
      { ranked: ['AI401', 'CS402'], name: 'Waiter', semester: 5 },
      // Never submitted: the late-registration case.
      { ranked: [], name: 'Late', semester: 5 },
    ],
  });
}

const viewOf = (response: request.Response) => dataOf(response) as AddDropView;
const resultOf = (response: request.Response) => dataOf(response) as AddDropResult;
const problemsOf = (response: request.Response) =>
  readAddDropProblems((response.body as { details?: unknown }).details);

function get(cookie: string) {
  return request(app()).get('/api/add-drop').set('Cookie', cookie);
}

describe('GET /api/add-drop', () => {
  it('shows the caller their own seat, the courses with room, and the full ones', async () => {
    const world = await smallWorld();
    const [holder] = world.cookies;

    const view = viewOf(await get(holder ?? '').expect(200));

    expect(view.period.open).toBe(true);
    expect(view.held?.course.code).toBe('AI401');
    expect(view.held?.source).toBe('ALLOCATION');
    expect(view.held?.preferenceRank).toBe(1);
    // Both courses are full in this world, and the seat they hold is not listed
    // among the options — it is the thing they would be moving away from.
    expect(view.available.map((course) => course.code)).toEqual([]);
    expect(view.full.map((course) => course.code)).toEqual(['CS402']);
  });

  it('is read-only, with the dates, outside the period', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 1 }],
      students: [{ ranked: ['AI401'] }],
      period: {
        opensAt: new Date(Date.now() + 86_400_000).toISOString(),
        closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
    });

    const view = viewOf(await get(world.cookies[0] ?? '').expect(200));
    expect(view.period.open).toBe(false);
    expect(view.period.closedReason).toBe('The add/drop period has not started yet.');
    expect(view.period.opensAt).not.toBeNull();
  });

  it('never lists a course the caller is not eligible for', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 5 },
        // Final-year only, and the student is in semester 5.
        { code: 'ADV701', capacity: 5, minSemester: 7 },
      ],
      students: [{ ranked: ['AI401'], semester: 5 }],
    });

    const view = viewOf(await get(world.cookies[0] ?? '').expect(200));
    const listed = [...view.available, ...view.full].map((course) => course.code);
    expect(listed).not.toContain('ADV701');
  });

  it('refuses an admin: add/drop changes a student’s own enrolment', async () => {
    await smallWorld();
    const admin = await getTestPool().query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`,
    );
    await get(sessionFor(admin.rows[0]?.id ?? '', 'ADMIN')).expect(403);
  });
});

describe('POST /api/add-drop/drop', () => {
  it('releases the seat and promotes the next eligible student, in one transaction', async () => {
    const world = await smallWorld();
    const [holder] = world.cookies;
    const [holderId, waiterId] = world.studentIds;

    const result = resultOf(await action(holder ?? '', '/drop', { code: 'AI401' }).expect(200));

    expect(result.result.outcome).toBe('DROPPED');
    if (result.result.outcome !== 'DROPPED') {
      throw new Error('unreachable');
    }
    // Waiter was next in line for AI401 and was holding CS402, so they move up
    // and release CS402 — the cascade, inside the same transaction.
    expect(result.result.promotions.promoted).toHaveLength(1);
    expect(result.result.promotions.promoted[0]?.course.code).toBe('AI401');
    expect(result.result.promotions.promoted[0]?.fromCourse?.code).toBe('CS402');

    const held = await heldSeats(world.windowId);
    expect(held.get(holderId ?? '')).toBeUndefined();
    expect(held.get(waiterId ?? '')).toBe('AI401');
    // AI401 was never free for a moment: the promotion invariant in action.
    expect(await seatsTaken(world.windowId)).toEqual({ AI401: 1, CS402: 0 });
    expect(await doubleBooked(world.windowId)).toEqual([]);
  });

  it('keeps the student’s other queues unless they ask to leave them', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 1 },
        { code: 'CS402', capacity: 1 },
      ],
      // Two seniors take both seats; the junior waits for both and gets
      // nothing. The seniority gap matters: with equal scores the seeded
      // tie-break decides who holds AI401, and this test names the holder.
      students: [
        { ranked: ['AI401'], semester: 8 },
        { ranked: ['CS402'], semester: 8 },
        { ranked: ['AI401', 'CS402'], semester: 5 },
      ],
    });
    const [first] = world.cookies;

    const kept = resultOf(await action(first ?? '', '/drop', { code: 'AI401' }).expect(200));
    if (kept.result.outcome !== 'DROPPED') {
      throw new Error('unreachable');
    }
    expect(kept.result.leftWaitlists).toEqual([]);
  });

  it('leaves every queue too when asked', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 2 },
        { code: 'CS402', capacity: 1 },
      ],
      students: [
        { ranked: ['CS402', 'AI401'], semester: 8 },
        // Gets AI401, waits for CS402 (ranked above it).
        { ranked: ['CS402', 'AI401'], semester: 5 },
      ],
      period: openPeriod(),
    });
    const second = world.cookies[1] ?? '';

    const result = resultOf(
      await action(second, '/drop', { code: 'AI401', leaveWaitlists: true }).expect(200),
    );
    if (result.result.outcome !== 'DROPPED') {
      throw new Error('unreachable');
    }
    expect(result.result.leftWaitlists.map((course) => course.code)).toEqual(['CS402']);
    expect(result.view.waiting).toEqual([]);
  });

  it('refuses a code that is not the seat actually held, and a student with none', async () => {
    const world = await smallWorld();
    const [holder, , late] = world.cookies;

    const wrong = await action(holder ?? '', '/drop', { code: 'CS402' }).expect(409);
    expect(problemsOf(wrong)).toEqual([
      { type: 'NOT_THE_HELD_SEAT', code: 'CS402', heldCode: 'AI401' },
    ]);

    const none = await action(late ?? '', '/drop', { code: 'AI401' }).expect(409);
    expect(problemsOf(none)).toEqual([{ type: 'NO_SEAT_HELD' }]);
  });
});

describe('POST /api/add-drop/add', () => {
  it('lets a student who never submitted take a free seat (late registration)', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: ['AI401'] }, { ranked: [], name: 'Late' }],
    });
    const late = world.cookies[1] ?? '';

    const result = resultOf(await action(late, '/add', { code: 'AI401' }).expect(200));

    expect(result.result).toEqual({ outcome: 'ADDED', course: { code: 'AI401', name: 'Course AI401' } });
    expect(result.view.held?.course.code).toBe('AI401');
    // A seat taken here was never ranked, so it carries no preference rank.
    expect(result.view.held?.preferenceRank).toBeNull();
    expect(result.view.held?.source).toBe('ADD');
    expect((await heldSeats(world.windowId)).get(world.studentIds[1] ?? '')).toBe('AI401');
  });

  it('refuses a full course with SEAT_TAKEN, and queues instead when asked', async () => {
    const world = await smallWorld();
    const late = world.cookies[2] ?? '';

    const refused = await action(late, '/add', { code: 'AI401' }).expect(409);
    expect(problemsOf(refused)).toEqual([{ type: 'SEAT_TAKEN', code: 'AI401', capacity: 1 }]);
    expect(refused.body).toMatchObject({ message: 'That seat was just taken.' });

    const queued = resultOf(
      await action(late, '/add', { code: 'AI401', waitlistIfFull: true }).expect(200),
    );
    if (queued.result.outcome !== 'WAITLISTED') {
      throw new Error('unreachable');
    }
    expect(queued.result.courseWasFull).toBe(true);
    expect(queued.result.position).toBeGreaterThan(0);
  });

  it('refuses a student who already holds a seat, pointing them at swapping', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 1 },
        { code: 'CS402', capacity: 5 },
      ],
      students: [{ ranked: ['AI401'] }],
    });

    const response = await action(world.cookies[0] ?? '', '/add', { code: 'CS402' }).expect(409);
    expect(problemsOf(response)).toEqual([
      { type: 'ALREADY_HOLDS_SEAT', code: 'CS402', heldCode: 'AI401' },
    ]);
  });

  it('refuses an ineligible course, an unknown one and one not offered', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 5 },
        { code: 'ADV701', capacity: 5, minSemester: 7 },
      ],
      students: [{ ranked: [], semester: 5 }],
    });
    const late = world.cookies[0] ?? '';

    expect(problemsOf(await action(late, '/add', { code: 'ADV701' }).expect(409))).toMatchObject([
      { type: 'NOT_ELIGIBLE', code: 'ADV701' },
    ]);
    expect(problemsOf(await action(late, '/add', { code: 'ZZ999' }).expect(409))).toEqual([
      { type: 'UNKNOWN_COURSE', code: 'ZZ999' },
    ]);

    // A real course the window does not offer reads differently again.
    const other = await getTestPool().query<{ code: string }>(
      `INSERT INTO courses (code, name, department_id, credits, description, min_semester, min_credits)
       VALUES ('OTH300', 'Elsewhere', $1, 4, '', 1, 0) RETURNING code`,
      [world.departmentId],
    );
    expect(
      problemsOf(await action(late, '/add', { code: other.rows[0]?.code ?? '' }).expect(409)),
    ).toEqual([{ type: 'NOT_OFFERED', code: 'OTH300' }]);
  });

  it('refuses every action outside the add/drop period', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: [] }],
      period: null,
    });
    const late = world.cookies[0] ?? '';

    for (const [path, body] of [
      ['/add', { code: 'AI401' }],
      ['/drop', { code: 'AI401' }],
      ['/swap', { fromCode: 'AI401', toCode: 'AI401' }],
      ['/waitlist/join', { code: 'AI401' }],
      ['/waitlist/leave', { code: 'AI401' }],
    ] as const) {
      const response = await action(late, path, body).expect(409);
      expect(problemsOf(response)).toEqual([
        { type: 'PERIOD_CLOSED', reason: 'The add/drop period has not been scheduled yet.' },
      ]);
    }
  });
});

describe('POST /api/add-drop/swap', () => {
  it('moves the seat atomically and offers the old one to its queue', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 1 },
        { code: 'CS402', capacity: 2 },
      ],
      students: [
        // Holds AI401; CS402 has room to swap into.
        { ranked: ['AI401'], semester: 8 },
        // Waiting for AI401.
        { ranked: ['AI401'], semester: 5 },
      ],
    });
    const [holder] = world.cookies;

    const result = resultOf(
      await action(holder ?? '', '/swap', { fromCode: 'AI401', toCode: 'CS402' }).expect(200),
    );

    if (result.result.outcome !== 'SWAPPED') {
      throw new Error('unreachable');
    }
    expect(result.result.from.code).toBe('AI401');
    expect(result.result.to.code).toBe('CS402');
    // The released AI401 seat went straight to the student waiting for it.
    expect(result.result.promotions.promoted[0]?.course.code).toBe('AI401');
    const held = await heldSeats(world.windowId);
    expect(held.get(world.studentIds[0] ?? '')).toBe('CS402');
    expect(held.get(world.studentIds[1] ?? '')).toBe('AI401');
    expect(await doubleBooked(world.windowId)).toEqual([]);
  });

  it('keeps the old seat when the new course is full', async () => {
    const world = await smallWorld();
    const [holder] = world.cookies;

    const response = await action(holder ?? '', '/swap', {
      fromCode: 'AI401',
      toCode: 'CS402',
    }).expect(409);

    expect(problemsOf(response)).toEqual([{ type: 'SEAT_TAKEN', code: 'CS402', capacity: 1 }]);
    // Nothing moved: the student still holds exactly what they had.
    expect((await heldSeats(world.windowId)).get(world.studentIds[0] ?? '')).toBe('AI401');
    expect(await seatsTaken(world.windowId)).toEqual({ AI401: 1, CS402: 1 });
  });

  it('refuses swapping a course for itself and swapping a seat not held', async () => {
    const world = await smallWorld();
    const [holder] = world.cookies;

    expect(
      problemsOf(
        await action(holder ?? '', '/swap', { fromCode: 'AI401', toCode: 'AI401' }).expect(409),
      ),
    ).toEqual([{ type: 'SAME_COURSE', code: 'AI401' }]);
    expect(
      problemsOf(
        await action(holder ?? '', '/swap', { fromCode: 'CS402', toCode: 'AI401' }).expect(409),
      ),
    ).toEqual([{ type: 'NOT_THE_HELD_SEAT', code: 'CS402', heldCode: 'AI401' }]);
  });
});

describe('the waitlist during add/drop', () => {
  it('appends a late joiner after everybody the allocation run placed', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 1 }],
      students: [
        { ranked: ['AI401'], semester: 8 },
        { ranked: ['AI401'], semester: 5 },
        { ranked: ['AI401'], semester: 5 },
        { ranked: [], name: 'Late' },
      ],
    });
    const late = world.cookies[3] ?? '';
    const courseId = world.courseIds.AI401 ?? '';

    const before = await waitingPositions(world.windowId, courseId);
    const result = resultOf(await action(late, '/waitlist/join', { code: 'AI401' }).expect(200));

    if (result.result.outcome !== 'WAITLISTED') {
      throw new Error('unreachable');
    }
    // Last in line, because positions only ever go up and are never renumbered.
    expect(result.result.position).toBe(before.length + 1);
    const after = await waitingPositions(world.windowId, courseId);
    expect(Math.max(...after)).toBeGreaterThan(Math.max(...before));
  });

  it('gives a student the seat when one freed up before they asked to queue', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: ['AI401'] }, { ranked: [], name: 'Late' }],
    });

    const result = resultOf(
      await action(world.cookies[1] ?? '', '/waitlist/join', { code: 'AI401' }).expect(200),
    );
    expect(result.result.outcome).toBe('ADDED');
  });

  it('lets a student leave a queue, and refuses one they are not on', async () => {
    const world = await smallWorld();
    const late = world.cookies[2] ?? '';

    await action(late, '/add', { code: 'AI401', waitlistIfFull: true }).expect(200);
    const left = resultOf(await action(late, '/waitlist/leave', { code: 'AI401' }).expect(200));
    expect(left.result).toEqual({
      outcome: 'WAITLIST_LEFT',
      course: { code: 'AI401', name: 'Course AI401' },
    });
    expect(left.view.waiting).toEqual([]);

    const again = await action(late, '/waitlist/leave', { code: 'AI401' }).expect(409);
    expect(problemsOf(again)).toEqual([{ type: 'NOT_WAITING', code: 'AI401' }]);

    // A student who left is not offered the seat again.
    const entries = await getTestPool().query<{ status: string; removal_reason: string }>(
      `SELECT status, removal_reason FROM waitlist_entries
       WHERE window_id = $1 AND student_id = $2`,
      [world.windowId, world.studentIds[2]],
    );
    expect(entries.rows).toEqual([{ status: 'REMOVED', removal_reason: 'STUDENT_LEFT' }]);
  });

  it('ends a queue joined in add/drop as soon as the student takes any seat', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 1 },
        { code: 'CS402', capacity: 5 },
      ],
      students: [{ ranked: ['AI401'], semester: 8 }, { ranked: [], name: 'Late' }],
    });
    const late = world.cookies[1] ?? '';

    await action(late, '/waitlist/join', { code: 'AI401' }).expect(200);
    const added = resultOf(await action(late, '/add', { code: 'CS402' }).expect(200));

    // Promotion could never honour an unranked queue for a student holding a
    // seat, so the entry is ended rather than left as a promise.
    expect(added.view.waiting).toEqual([]);
    const entries = await getTestPool().query<{ status: string; removal_reason: string }>(
      `SELECT status, removal_reason FROM waitlist_entries
       WHERE window_id = $1 AND student_id = $2`,
      [world.windowId, world.studentIds[1]],
    );
    expect(entries.rows).toEqual([{ status: 'REMOVED', removal_reason: 'SEAT_ELSEWHERE' }]);
  });

  it('refuses a student holding a seat from joining a queue', async () => {
    const world = await smallWorld();

    const response = await action(world.cookies[0] ?? '', '/waitlist/join', {
      code: 'CS402',
    }).expect(409);
    expect(problemsOf(response)).toEqual([
      { type: 'ALREADY_HOLDS_SEAT', code: 'CS402', heldCode: 'AI401' },
    ]);
  });
});

describe('idempotency', () => {
  it('replays the first answer for a retry with the same key', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: ['AI401'] }, { ranked: [], name: 'Late' }],
    });
    const late = world.cookies[1] ?? '';
    const key = randomUUID();

    const first = resultOf(await action(late, '/add', { code: 'AI401' }, key).expect(200));
    const retry = resultOf(await action(late, '/add', { code: 'AI401' }, key).expect(200));

    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);
    // One seat, one history row, one notification — not two of each.
    const counts = await getTestPool().query<{ enrollments: string; history: string }>(
      `SELECT
         (SELECT count(*) FROM enrollments
           WHERE window_id = $1 AND student_id = $2 AND source = 'ADD') AS enrollments,
         (SELECT count(*) FROM registration_history
           WHERE window_id = $1 AND student_id = $2 AND event_type = 'ADDED') AS history`,
      [world.windowId, world.studentIds[1]],
    );
    expect(counts.rows[0]).toEqual({ enrollments: '1', history: '1' });
  });

  it('refuses the same key used for a different change', async () => {
    const world = await buildAddDropWorld({
      courses: [
        { code: 'AI401', capacity: 5 },
        { code: 'CS402', capacity: 5 },
      ],
      students: [{ ranked: [], name: 'Late' }],
    });
    const late = world.cookies[0] ?? '';
    const key = randomUUID();

    await action(late, '/add', { code: 'AI401' }, key).expect(200);
    const response = await action(late, '/add', { code: 'CS402' }, key).expect(409);
    expect(problemsOf(response)).toEqual([{ type: 'REQUEST_CHANGED' }]);
  });
});

describe('rollback', () => {
  it('leaves nothing behind when the action fails half-way', async () => {
    const world = await smallWorld();
    const [holder] = world.cookies;
    const before = await seatsTaken(world.windowId);

    armFault(FAULT_MID_ADD_DROP);
    await action(holder ?? '', '/drop', { code: 'AI401' }).expect(500);
    armFault(null);

    // The seat, the promotion it caused, the history and the notification all
    // go back together.
    expect(await seatsTaken(world.windowId)).toEqual(before);
    expect((await heldSeats(world.windowId)).get(world.studentIds[0] ?? '')).toBe('AI401');
    const trail = await getTestPool().query<{ count: string }>(
      `SELECT count(*) AS count FROM registration_history
       WHERE window_id = $1 AND event_type IN ('DROPPED', 'PROMOTED')`,
      [world.windowId],
    );
    expect(trail.rows[0]?.count).toBe('0');

    // And the student can still drop afterwards: the key was rolled back too.
    await action(holder ?? '', '/drop', { code: 'AI401' }).expect(200);
  });
});

describe('the admin add/drop period', () => {
  it('needs an allocated window, and is audited when it changes', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: ['AI401'] }],
      period: null,
    });
    const period = openPeriod();

    await request(app())
      .put('/api/admin/registration-window/add-drop')
      .set('Cookie', world.adminCookie)
      .send(period)
      .expect(200);

    const audit = await getTestPool().query<{ action: string; new_value: unknown }>(
      `SELECT action, new_value FROM audit_logs WHERE action = 'ADD_DROP_PERIOD_UPDATED'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.new_value).toMatchObject({ addDropClosesAt: period.closesAt });
  });

  it('refuses a period that closes before it opens', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: ['AI401'] }],
      period: null,
    });

    await request(app())
      .put('/api/admin/registration-window/add-drop')
      .set('Cookie', world.adminCookie)
      .send({ opensAt: new Date().toISOString(), closesAt: new Date(0).toISOString() })
      .expect(400);
  });

  it('clearing the period stops every student action', async () => {
    const world = await buildAddDropWorld({
      courses: [{ code: 'AI401', capacity: 5 }],
      students: [{ ranked: [], name: 'Late' }],
    });

    await request(app())
      .put('/api/admin/registration-window/add-drop')
      .set('Cookie', world.adminCookie)
      .send({ opensAt: null, closesAt: null })
      .expect(200);

    const response = await action(world.cookies[0] ?? '', '/add', { code: 'AI401' }).expect(409);
    expect(problemsOf(response)).toMatchObject([{ type: 'PERIOD_CLOSED' }]);
  });
});
