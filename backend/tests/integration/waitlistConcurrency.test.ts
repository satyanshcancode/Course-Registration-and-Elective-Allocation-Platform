/**
 * What happens when seats free up at the same instant.
 *
 * Promotion is serialised per window by a transaction-scoped advisory lock, so
 * two freed seats never negotiate over the same waiting student and never take
 * their course locks in opposite orders. These tests are what that claim rests
 * on: many withdrawals at once on one course, and simultaneous freeings on
 * different courses whose cascades overlap.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
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
import { buildApp, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const app = () => buildApp();
const adminCookie = (admin: string) => sessionFor(admin, 'ADMIN');

interface Built {
  windowId: string;
  admin: string;
  courseIds: Record<string, string>;
}

/**
 * `seats` students take the seats in `codes`, `waiting` more rank the same
 * courses and end up in the queues. Allocation runs for real, so the positions
 * are the ones the engine chose.
 */
async function buildAllocatedWorld(options: {
  courses: { code: string; capacity: number }[];
  /** Each student's ranked codes, in order. */
  students: string[][];
}): Promise<Built> {
  const pool = getTestPool();
  const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, department, { code: 'CSE', name: 'Computer Science' });
  const windowId = await createWindow(pool, {
    name: 'Fall 2026',
    method: 'PREFERENCE_PRIORITY',
    config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  });

  const courseIds: Record<string, string> = {};
  for (const { code, capacity } of options.courses) {
    const id = await createCourse(pool, department, { code, name: `Course ${code}` });
    await createOffering(pool, windowId, id, capacity);
    courseIds[code] = id;
  }
  await setWindowStatus(pool, windowId, 'OPEN');

  for (const [index, ranked] of options.students.entries()) {
    // Seniority decreasing with arrival, so scores and arrival order differ.
    const studentId = await createStudent(pool, program, {
      name: `Student ${String(index).padStart(2, '0')}`,
      semester: index % 2 === 0 ? 8 : 5,
      creditsCompleted: 100,
    });
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    for (const [rank, code] of ranked.entries()) {
      await addPreference(pool, submissionId, windowId, courseIds[code] ?? '', rank + 1);
    }
    await markSubmitted(pool, submissionId, randomUUID());
  }

  const admin = await createUser(pool, { role: 'ADMIN' });
  await setWindowStatus(pool, windowId, 'CLOSED');
  await request(app())
    .post('/api/admin/allocation/run')
    .set('Cookie', adminCookie(admin))
    .send({ confirm: true })
    .expect(200);
  return { windowId, admin, courseIds };
}

async function activeEnrollmentIds(courseId: string): Promise<string[]> {
  const result = await getTestPool().query<{ id: string }>(
    `SELECT id FROM enrollments WHERE course_id = $1 AND status = 'ACTIVE' ORDER BY id`,
    [courseId],
  );
  return result.rows.map((row) => row.id);
}

async function seatsTaken(windowId: string): Promise<Record<string, number>> {
  const result = await getTestPool().query<{ code: string; allocated_count: number }>(
    `SELECT c.code, o.allocated_count
     FROM registration_window_courses o
     JOIN courses c ON c.id = o.course_id
     WHERE o.window_id = $1
     ORDER BY c.code`,
    [windowId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.code, row.allocated_count]));
}

/** Every ACTIVE enrollment, to prove nobody ended up holding two seats. */
async function doubleBookedStudents(windowId: string): Promise<string[]> {
  const result = await getTestPool().query<{ name: string }>(
    `SELECT s.name
     FROM enrollments e
     JOIN students s ON s.user_id = e.student_id
     WHERE e.window_id = $1 AND e.status = 'ACTIVE'
     GROUP BY s.name
     HAVING count(*) > 1`,
    [windowId],
  );
  return result.rows.map((row) => row.name);
}

describe('promotions that happen at the same time', () => {
  it('survives 20 simultaneous withdrawals from one course', async () => {
    // 20 seats in the popular course, 20 more students waiting for it.
    const students = Array.from({ length: 40 }, () => ['POP401', 'BAK402']);
    const world = await buildAllocatedWorld({
      courses: [
        { code: 'POP401', capacity: 20 },
        { code: 'BAK402', capacity: 20 },
      ],
      students,
    });
    const enrollments = await activeEnrollmentIds(world.courseIds.POP401 ?? '');
    expect(enrollments).toHaveLength(20);

    const responses = await Promise.all(
      enrollments.map((id) =>
        request(app())
          .post(`/api/admin/enrollments/${id}/withdraw`)
          .set('Cookie', adminCookie(world.admin))
          .send({ reason: 'Simultaneous withdrawal test' }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    // Each withdrawal frees a seat that someone waiting takes, so POP401 ends
    // exactly full. Everyone who took one was holding BAK402 and released it
    // on the way up, and nobody was left wanting BAK402 — so it empties.
    expect(await seatsTaken(world.windowId)).toEqual({ POP401: 20, BAK402: 0 });
    expect(await doubleBookedStudents(world.windowId)).toEqual([]);

    const promoted = await getTestPool().query<{ count: string }>(
      `SELECT count(*) AS count FROM enrollments
       WHERE window_id = $1 AND source = 'WAITLIST_PROMOTION' AND status = 'ACTIVE'`,
      [world.windowId],
    );
    expect(Number(promoted.rows[0]?.count)).toBe(20);
  });

  it('handles freeings on different courses whose cascades overlap', async () => {
    // Everyone ranks both courses, so a promotion into A frees a seat in B and
    // the two cascades run into each other.
    const students = [
      ...Array.from({ length: 6 }, () => ['ALFA401', 'BETA402']),
      ...Array.from({ length: 6 }, () => ['BETA402', 'ALFA401']),
    ];
    const world = await buildAllocatedWorld({
      courses: [
        { code: 'ALFA401', capacity: 3 },
        { code: 'BETA402', capacity: 3 },
      ],
      students,
    });
    const [alpha] = await activeEnrollmentIds(world.courseIds.ALFA401 ?? '');
    const [beta] = await activeEnrollmentIds(world.courseIds.BETA402 ?? '');

    const responses = await Promise.all(
      [alpha, beta].map((id) =>
        request(app())
          .post(`/api/admin/enrollments/${id}/withdraw`)
          .set('Cookie', adminCookie(world.admin))
          .send({ reason: 'Overlapping cascades' }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const seats = await seatsTaken(world.windowId);
    expect(seats.ALFA401).toBeLessThanOrEqual(3);
    expect(seats.BETA402).toBeLessThanOrEqual(3);
    expect(await doubleBookedStudents(world.windowId)).toEqual([]);

    // No student was promoted twice into the same course either.
    const twice = await getTestPool().query<{ name: string }>(
      `SELECT s.name
       FROM enrollments e
       JOIN students s ON s.user_id = e.student_id
       WHERE e.window_id = $1 AND e.source = 'WAITLIST_PROMOTION'
       GROUP BY s.name, e.course_id
       HAVING count(*) > 1`,
      [world.windowId],
    );
    expect(twice.rows).toEqual([]);
  });

  it('does not deadlock when a sweep runs beside a withdrawal', async () => {
    const students = Array.from({ length: 10 }, () => ['ONE401', 'TWO402']);
    const world = await buildAllocatedWorld({
      courses: [
        { code: 'ONE401', capacity: 4 },
        { code: 'TWO402', capacity: 4 },
      ],
      students,
    });
    const [enrollment] = await activeEnrollmentIds(world.courseIds.ONE401 ?? '');

    const [withdrawal, sweep] = await Promise.all([
      request(app())
        .post(`/api/admin/enrollments/${enrollment ?? ''}/withdraw`)
        .set('Cookie', adminCookie(world.admin))
        .send({ reason: 'Racing the sweep' }),
      request(app()).post('/api/admin/waitlists/process').set('Cookie', adminCookie(world.admin)),
    ]);

    expect([withdrawal.status, sweep.status]).toEqual([200, 200]);
    expect(await doubleBookedStudents(world.windowId)).toEqual([]);
    const seats = await seatsTaken(world.windowId);
    expect(seats.ONE401).toBeLessThanOrEqual(4);
    expect(seats.TWO402).toBeLessThanOrEqual(4);
  });
});
