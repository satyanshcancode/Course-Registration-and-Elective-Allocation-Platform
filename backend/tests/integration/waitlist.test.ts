/**
 * Waitlist promotion against a real database: the cascade, the refusals, and
 * the proof that a failure part-way through leaves nothing behind.
 *
 * The world below is small on purpose, and every score is forced by the
 * fixtures rather than by a tie-break, so each promotion has exactly one
 * correct answer:
 *
 *   AI (1 seat)  relevant to ECE      CS (1 seat)  relevant to CSE
 *   Ava    ECE sem 8   P1 AI, P2 CS   AI 145, CS 100
 *   Bo     CSE sem 8   P1 AI, P2 CS   AI 120, CS 125
 *   Cai    ECE sem 5   P1 CS          CS 100
 *
 * Allocation gives AI to Ava and CS to Bo; Cai gets nothing and waits for CS,
 * Bo waits for AI. Withdrawing Ava therefore promotes Bo into AI, which frees
 * the CS seat Bo was holding, which promotes Cai. Two promotions from one
 * withdrawal.
 */
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  type AdminWaitlistView,
  type ProcessWaitlistsResult,
  type StudentAllocationResults,
  type StudentWaitlist,
  type UpdateCapacityResult,
  type WithdrawEnrollmentResult,
} from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { FAULT_MID_PROMOTION } from '../../src/services/waitlistPromotionService.js';
import { armFault } from '../../src/utils/faultInjection.js';
import {
  addPreference,
  createCourse,
  createDepartment,
  createDraftSubmission,
  createOffering,
  createProgram,
  createStudent,
  createUser,
  createWindow,
  markSubmitted,
  setWindowStatus,
} from './fixtures.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const app = () => buildApp();
const adminCookie = (admin: string) => sessionFor(admin, 'ADMIN');
const studentCookie = (student: string) => sessionFor(student, 'STUDENT');

const messageOf = (response: request.Response) =>
  (response.body as { message?: string }).message ?? '';

interface World {
  windowId: string;
  admin: string;
  ai: string;
  cs: string;
  ava: string;
  bo: string;
  cai: string;
}

async function buildAllocatedWorld({ csMinCredits = 0 } = {}): Promise<World> {
  const pool = getTestPool();
  const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const cse = await createProgram(pool, department, { code: 'CSE', name: 'Computer Science' });
  const ece = await createProgram(pool, department, { code: 'ECE', name: 'Electronics' });
  const windowId = await createWindow(pool, {
    name: 'Fall 2026',
    method: 'PREFERENCE_PRIORITY',
    config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  });

  const ai = await createCourse(pool, department, {
    code: 'AI401',
    name: 'Artificial Intelligence',
  });
  const cs = await createCourse(pool, department, {
    code: 'CS402',
    name: 'Cloud Security',
    minCredits: csMinCredits,
  });
  await createOffering(pool, windowId, ai, 1);
  await createOffering(pool, windowId, cs, 1);
  // Relevance is what makes the three scores differ, so no tie-break is needed.
  await pool.query(
    `INSERT INTO course_program_relevance (course_id, program_id) VALUES ($1, $2), ($3, $4)`,
    [ai, ece, cs, cse],
  );
  await setWindowStatus(pool, windowId, 'OPEN');

  async function submit(
    name: string,
    programId: string,
    semester: number,
    ranked: readonly string[],
  ) {
    const studentId = await createStudent(pool, programId, {
      name,
      semester,
      creditsCompleted: 90,
    });
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    for (const [index, courseId] of ranked.entries()) {
      await addPreference(pool, submissionId, windowId, courseId, index + 1);
    }
    await markSubmitted(pool, submissionId, randomUUID());
    return studentId;
  }

  const ava = await submit('Ava', ece, 8, [ai, cs]);
  const bo = await submit('Bo', cse, 8, [ai, cs]);
  const cai = await submit('Cai', ece, 5, [cs]);

  const admin = await createUser(pool, { role: 'ADMIN' });
  await setWindowStatus(pool, windowId, 'CLOSED');
  await request(app())
    .post('/api/admin/allocation/run')
    .set('Cookie', adminCookie(admin))
    .send({ confirm: true })
    .expect(200);

  return { windowId, admin, ai, cs, ava, bo, cai };
}

/** The enrollment id of the seat a student holds, for the withdraw endpoint. */
async function activeEnrollment(studentId: string, courseId: string): Promise<string> {
  const result = await getTestPool().query<{ id: string }>(
    `SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = 'ACTIVE'`,
    [studentId, courseId],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('expected an active enrollment');
  }
  return id;
}

function withdraw(admin: string, enrollmentId: string, reason = 'Left the programme') {
  return request(app())
    .post(`/api/admin/enrollments/${enrollmentId}/withdraw`)
    .set('Cookie', adminCookie(admin))
    .send({ reason });
}

async function state(windowId: string) {
  const result = await getTestPool().query<{
    student: string;
    code: string;
    kind: string;
    status: string;
    reason: string | null;
  }>(
    `SELECT s.name AS student, c.code, 'enrollment' AS kind, e.status, e.drop_reason AS reason
     FROM enrollments e
     JOIN students s ON s.user_id = e.student_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.window_id = $1
     UNION ALL
     SELECT s.name, c.code, 'waitlist', w.status, w.removal_reason
     FROM waitlist_entries w
     JOIN students s ON s.user_id = w.student_id
     JOIN courses c ON c.id = w.course_id
     WHERE w.window_id = $1
     ORDER BY student, kind, code`,
    [windowId],
  );
  return result.rows;
}

async function seatsTaken(windowId: string, courseId: string): Promise<number> {
  const result = await getTestPool().query<{ allocated_count: number }>(
    'SELECT allocated_count FROM registration_window_courses WHERE window_id = $1 AND course_id = $2',
    [windowId, courseId],
  );
  return result.rows[0]?.allocated_count ?? Number.NaN;
}

afterEach(() => {
  armFault(null);
});

describe('the allocated world this file starts from', () => {
  it('gives Ava AI and Bo CS, and leaves Cai waiting', async () => {
    const world = await buildAllocatedWorld();

    expect(await state(world.windowId)).toEqual([
      { student: 'Ava', code: 'AI401', kind: 'enrollment', status: 'ACTIVE', reason: null },
      { student: 'Bo', code: 'CS402', kind: 'enrollment', status: 'ACTIVE', reason: null },
      { student: 'Bo', code: 'AI401', kind: 'waitlist', status: 'WAITING', reason: null },
      { student: 'Cai', code: 'CS402', kind: 'waitlist', status: 'WAITING', reason: null },
    ]);
  });
});

describe('POST /api/admin/enrollments/:id/withdraw', () => {
  it('needs an admin session', async () => {
    const world = await buildAllocatedWorld();
    const enrollment = await activeEnrollment(world.ava, world.ai);
    await request(app()).post(`/api/admin/enrollments/${enrollment}/withdraw`).expect(401);
    await request(app())
      .post(`/api/admin/enrollments/${enrollment}/withdraw`)
      .set('Cookie', studentCookie(world.bo))
      .send({ reason: 'Give me that seat' })
      .expect(403);
  });

  it('insists on a reason', async () => {
    const world = await buildAllocatedWorld();
    const enrollment = await activeEnrollment(world.ava, world.ai);
    await withdraw(world.admin, enrollment, '').expect(400);
    await request(app())
      .post(`/api/admin/enrollments/${enrollment}/withdraw`)
      .set('Cookie', adminCookie(world.admin))
      .send({})
      .expect(400);
  });

  it('promotes the next student, and cascades into the seat they release', async () => {
    const world = await buildAllocatedWorld();
    const enrollment = await activeEnrollment(world.ava, world.ai);

    const result = dataOf(
      await withdraw(world.admin, enrollment).expect(200),
    ).valueOf() as WithdrawEnrollmentResult;

    expect(result.promotions.promoted).toEqual([
      {
        student: expect.objectContaining({ name: 'Bo' }) as unknown,
        course: { code: 'AI401', name: 'Artificial Intelligence' },
        fromCourse: { code: 'CS402', name: 'Cloud Security' },
      },
      {
        student: expect.objectContaining({ name: 'Cai' }) as unknown,
        course: { code: 'CS402', name: 'Cloud Security' },
        fromCourse: null,
      },
    ]);

    expect(await state(world.windowId)).toEqual([
      {
        student: 'Ava',
        code: 'AI401',
        kind: 'enrollment',
        status: 'DROPPED',
        reason: 'ADMIN_WITHDRAWAL',
      },
      { student: 'Bo', code: 'AI401', kind: 'enrollment', status: 'ACTIVE', reason: null },
      {
        student: 'Bo',
        code: 'CS402',
        kind: 'enrollment',
        status: 'DROPPED',
        reason: 'UPGRADED',
      },
      { student: 'Bo', code: 'AI401', kind: 'waitlist', status: 'PROMOTED', reason: null },
      { student: 'Cai', code: 'CS402', kind: 'enrollment', status: 'ACTIVE', reason: null },
      { student: 'Cai', code: 'CS402', kind: 'waitlist', status: 'PROMOTED', reason: null },
    ]);

    // The trigger kept the seat counts right through six enrollment writes.
    expect(await seatsTaken(world.windowId, world.ai)).toBe(1);
    expect(await seatsTaken(world.windowId, world.cs)).toBe(1);
  });

  it('writes the history, the notifications and the audit trail', async () => {
    const world = await buildAllocatedWorld();
    await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(200);
    const pool = getTestPool();

    const history = await pool.query<{ name: string; event_type: string; code: string | null }>(
      `SELECT s.name, h.event_type, c.code
       FROM registration_history h
       JOIN students s ON s.user_id = h.student_id
       LEFT JOIN courses c ON c.id = h.course_id
       WHERE h.window_id = $1 AND h.event_type IN ('PROMOTED', 'DROPPED', 'WAITLIST_REMOVED')
       ORDER BY s.name, h.event_type`,
      [world.windowId],
    );
    expect(history.rows).toEqual([
      { name: 'Ava', event_type: 'DROPPED', code: 'AI401' },
      { name: 'Bo', event_type: 'DROPPED', code: 'CS402' },
      { name: 'Bo', event_type: 'PROMOTED', code: 'AI401' },
      { name: 'Cai', event_type: 'PROMOTED', code: 'CS402' },
    ]);

    const promotionNotes = await pool.query<{ title: string; body: string }>(
      `SELECT title, body FROM notifications WHERE type = 'WAITLIST_PROMOTION' ORDER BY title`,
    );
    expect(promotionNotes.rows).toEqual([
      {
        title: 'A seat opened in AI401 Artificial Intelligence',
        body: "You've been moved from CS402 Cloud Security. Your CS402 seat was released.",
      },
      {
        title: 'A seat opened in CS402 Cloud Security',
        body: 'You were next on the waitlist, and the seat is now yours.',
      },
    ]);

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs
       WHERE action IN ('ENROLLMENT_WITHDRAWN', 'WAITLIST_PROMOTION') ORDER BY action, id`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'ENROLLMENT_WITHDRAWN',
      'WAITLIST_PROMOTION',
      'WAITLIST_PROMOTION',
    ]);
  });

  it('skips a student who is no longer eligible, and removes their entry', async () => {
    // CS now needs 90 credits, and Cai's record has dropped below that.
    const world = await buildAllocatedWorld({ csMinCredits: 90 });
    await getTestPool().query('UPDATE students SET credits_completed = 10 WHERE user_id = $1', [
      world.cai,
    ]);

    const result = dataOf(
      await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(200),
    ).valueOf() as WithdrawEnrollmentResult;

    expect(result.promotions.promoted.map((move) => move.course.code)).toEqual(['AI401']);
    expect(result.promotions.removed).toEqual([
      {
        student: expect.objectContaining({ name: 'Cai' }) as unknown,
        course: { code: 'CS402', name: 'Cloud Security' },
        reason: 'INELIGIBLE',
      },
    ]);
    // The seat stays empty rather than going to someone who cannot take it.
    expect(await seatsTaken(world.windowId, world.cs)).toBe(0);
  });

  it('rolls the whole cascade back when anything fails', async () => {
    const world = await buildAllocatedWorld();
    const before = await state(world.windowId);
    armFault(FAULT_MID_PROMOTION);

    await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(500);

    // Not just the promotions: the withdrawal that caused them is gone too.
    expect(await state(world.windowId)).toEqual(before);
    expect(await seatsTaken(world.windowId, world.ai)).toBe(1);
  });

  it('refuses before allocation has run', async () => {
    const world = await buildAllocatedWorld();
    const enrollment = await activeEnrollment(world.ava, world.ai);
    await setWindowStatus(getTestPool(), world.windowId, 'CLOSED');

    expect(messageOf(await withdraw(world.admin, enrollment).expect(409))).toContain('CLOSED');
  });

  it('refuses an enrollment that has already been released', async () => {
    const world = await buildAllocatedWorld();
    const enrollment = await activeEnrollment(world.ava, world.ai);
    await withdraw(world.admin, enrollment).expect(200);

    await withdraw(world.admin, enrollment).expect(404);
  });
});

describe('PATCH /api/admin/courses/:code/capacity', () => {
  it('offers the new seats to whoever is waiting', async () => {
    const world = await buildAllocatedWorld();

    const response = await request(app())
      .patch('/api/admin/courses/AI401/capacity')
      .set('Cookie', adminCookie(world.admin))
      .send({ capacity: 2, reason: 'A second lab group opened up' })
      .expect(200);
    const result = dataOf(response).valueOf() as UpdateCapacityResult;

    expect(result.offering.capacity).toBe(2);
    // Bo moves up into AI, which frees CS for Cai: the same cascade.
    expect(result.promotions?.promoted.map((move) => move.course.code)).toEqual(['AI401', 'CS402']);
    expect(messageOf(response)).toContain('2 students were promoted');
    expect(await seatsTaken(world.windowId, world.ai)).toBe(2);
  });

  it('promotes nobody before allocation has run', async () => {
    const world = await buildAllocatedWorld();
    await setWindowStatus(getTestPool(), world.windowId, 'CLOSED');

    const result = dataOf(
      await request(app())
        .patch('/api/admin/courses/AI401/capacity')
        .set('Cookie', adminCookie(world.admin))
        .send({ capacity: 3, reason: 'Still planning the term' })
        .expect(200),
    ).valueOf() as UpdateCapacityResult;

    expect(result.promotions).toBeNull();
    expect(await seatsTaken(world.windowId, world.ai)).toBe(1);
  });
});

describe('POST /api/admin/waitlists/process', () => {
  it('fills a seat that was freed without going through the service', async () => {
    const world = await buildAllocatedWorld();
    // A seat vanishing behind the application's back is exactly what the
    // sweep exists for.
    await getTestPool().query(
      `UPDATE enrollments SET status = 'DROPPED', dropped_at = now(), drop_reason = 'STUDENT_DROP'
       WHERE student_id = $1 AND course_id = $2`,
      [world.ava, world.ai],
    );

    const result = dataOf(
      await request(app())
        .post('/api/admin/waitlists/process')
        .set('Cookie', adminCookie(world.admin))
        .expect(200),
    ).valueOf() as ProcessWaitlistsResult;

    expect(result.coursesChecked).toBe(1);
    expect(result.promotions.promoted.map((move) => move.course.code)).toEqual(['AI401', 'CS402']);
  });

  it('is happy to find nothing to do', async () => {
    const world = await buildAllocatedWorld();

    const result = dataOf(
      await request(app())
        .post('/api/admin/waitlists/process')
        .set('Cookie', adminCookie(world.admin))
        .expect(200),
    ).valueOf() as ProcessWaitlistsResult;

    expect(result).toEqual({ coursesChecked: 0, promotions: { promoted: [], removed: [] } });
  });
});

describe('GET /api/students/me/waitlist', () => {
  it('shows the caller their own queue, with a live position', async () => {
    const world = await buildAllocatedWorld();

    const waitlist = dataOf(
      await request(app())
        .get('/api/students/me/waitlist')
        .set('Cookie', studentCookie(world.cai))
        .expect(200),
    ).valueOf() as StudentWaitlist;

    expect(waitlist.held).toBeNull();
    expect(waitlist.waiting).toHaveLength(1);
    expect(waitlist.waiting[0]).toMatchObject({
      course: { code: 'CS402' },
      position: 1,
      waiting: 1,
      preferenceRank: 1,
    });
    expect(waitlist.ended).toEqual([]);
  });

  it('moves the entry to "ended" once the student is promoted', async () => {
    const world = await buildAllocatedWorld();
    await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(200);

    const waitlist = dataOf(
      await request(app())
        .get('/api/students/me/waitlist')
        .set('Cookie', studentCookie(world.bo))
        .expect(200),
    ).valueOf() as StudentWaitlist;

    expect(waitlist.held).toEqual({
      course: { code: 'AI401', name: 'Artificial Intelligence' },
      rank: 1,
    });
    expect(waitlist.waiting).toEqual([]);
    expect(waitlist.ended.map((entry) => [entry.course.code, entry.status])).toEqual([
      ['AI401', 'PROMOTED'],
    ]);
  });

  it('is refused to an admin, who has no waitlist of their own', async () => {
    const world = await buildAllocatedWorld();
    await request(app())
      .get('/api/students/me/waitlist')
      .set('Cookie', adminCookie(world.admin))
      .expect(403);
  });
});

describe('GET /api/admin/waitlists', () => {
  it('lists the roster and the queue for one course', async () => {
    const world = await buildAllocatedWorld();

    const view = dataOf(
      await request(app())
        .get('/api/admin/waitlists?course=CS402')
        .set('Cookie', adminCookie(world.admin))
        .expect(200),
    ).valueOf() as AdminWaitlistView;

    expect(view.courses.map((course) => course.code)).toEqual(['AI401', 'CS402']);
    expect(view.course).toMatchObject({ code: 'CS402', capacity: 1, allocated: 1, available: 0 });
    expect(view.enrolled.map((row) => row.student.name)).toEqual(['Bo']);
    expect(view.waitlist.map((row) => [row.student.name, row.position])).toEqual([['Cai', 1]]);
  });

  it('offers the picker when no course is chosen', async () => {
    const world = await buildAllocatedWorld();

    const view = dataOf(
      await request(app())
        .get('/api/admin/waitlists')
        .set('Cookie', adminCookie(world.admin))
        .expect(200),
    ).valueOf() as AdminWaitlistView;

    expect(view.course).toBeNull();
    expect(view.courses).toHaveLength(2);
  });
});

describe('GET /api/allocation/results, after promotion', () => {
  it('tells the promoted student they moved, and names the seat they gave up', async () => {
    const world = await buildAllocatedWorld();
    await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(200);

    const results = dataOf(
      await request(app())
        .get('/api/allocation/results')
        .set('Cookie', studentCookie(world.bo))
        .expect(200),
    ).valueOf() as StudentAllocationResults;

    expect(results.allocated?.type).toBe('PROMOTED');
    expect(results.allocated).toMatchObject({
      course: { code: 'AI401' },
      fromCourse: { code: 'CS402' },
      fromRank: 2,
    });
  });

  it('tells the withdrawn student their seat was released', async () => {
    const world = await buildAllocatedWorld();
    await withdraw(world.admin, await activeEnrollment(world.ava, world.ai)).expect(200);

    const results = dataOf(
      await request(app())
        .get('/api/allocation/results')
        .set('Cookie', studentCookie(world.ava))
        .expect(200),
    ).valueOf() as StudentAllocationResults;

    expect(results.allocated).toBeNull();
    expect(results.results.map((result) => result.explanation.type)).toContain('SEAT_WITHDRAWN');
  });
});
