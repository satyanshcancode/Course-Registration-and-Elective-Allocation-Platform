/**
 * An allocated window with an open add/drop period, built the way it happens on
 * the day: real submissions, a real allocation run through the service, then the
 * admin's own endpoint to schedule the period.
 *
 * Shared by `addDrop.test.ts` and `addDropConcurrency.test.ts`, because the
 * seat-race tests need exactly the same starting point as the rule tests — only
 * bigger.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
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

export interface StudentSpec {
  /** Course codes in rank order. An empty list is a student who never submitted. */
  ranked: string[];
  name?: string;
  semester?: number;
}

export interface AddDropWorld {
  windowId: string;
  adminId: string;
  adminCookie: string;
  /** Student ids in the order they were given, so a test can name one. */
  studentIds: string[];
  cookies: string[];
  courseIds: Record<string, string>;
  programId: string;
  departmentId: string;
}

export interface BuildOptions {
  courses: { code: string; capacity: number; minSemester?: number }[];
  students: StudentSpec[];
  /** Leave the period unscheduled, for the "outside the period" cases. */
  period?: { opensAt: string; closesAt: string } | null;
}

const app = () => buildApp();

/** An add/drop period that is open right now, which is the usual case. */
export function openPeriod(): { opensAt: string; closesAt: string } {
  const day = 86_400_000;
  return {
    opensAt: new Date(Date.now() - day).toISOString(),
    closesAt: new Date(Date.now() + day).toISOString(),
  };
}

export async function buildAddDropWorld(options: BuildOptions): Promise<AddDropWorld> {
  const pool = getTestPool();
  const departmentId = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const programId = await createProgram(pool, departmentId, {
    code: 'CSE',
    name: 'Computer Science',
  });
  const windowId = await createWindow(pool, {
    name: 'Fall 2026',
    method: 'PREFERENCE_PRIORITY',
    config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  });

  const courseIds: Record<string, string> = {};
  for (const { code, capacity, minSemester } of options.courses) {
    const id = await createCourse(pool, departmentId, {
      code,
      name: `Course ${code}`,
      ...(minSemester === undefined ? {} : { minSemester }),
    });
    await createOffering(pool, windowId, id, capacity);
    courseIds[code] = id;
  }
  await setWindowStatus(pool, windowId, 'OPEN');

  const studentIds: string[] = [];
  const cookies: string[] = [];
  for (const [index, spec] of options.students.entries()) {
    const studentId = await createStudent(pool, programId, {
      name: spec.name ?? `Student ${String(index).padStart(3, '0')}`,
      // Seniority alternates, so scores and the queue order are not all equal.
      semester: spec.semester ?? (index % 2 === 0 ? 8 : 5),
      creditsCompleted: 100,
    });
    studentIds.push(studentId);
    cookies.push(sessionFor(studentId, 'STUDENT'));
    if (spec.ranked.length === 0) {
      continue;
    }
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    for (const [rank, code] of spec.ranked.entries()) {
      await addPreference(pool, submissionId, windowId, courseIds[code] ?? '', rank + 1);
    }
    await markSubmitted(pool, submissionId, randomUUID());
  }

  const adminId = await createUser(pool, { role: 'ADMIN' });
  const adminCookie = sessionFor(adminId, 'ADMIN');
  await setWindowStatus(pool, windowId, 'CLOSED');
  await request(app())
    .post('/api/admin/allocation/run')
    .set('Cookie', adminCookie)
    .send({ confirm: true })
    .expect(200);

  const period = options.period === undefined ? openPeriod() : options.period;
  if (period) {
    await request(app())
      .put('/api/admin/registration-window/add-drop')
      .set('Cookie', adminCookie)
      .send(period)
      .expect(200);
  }

  return {
    windowId,
    adminId,
    adminCookie,
    studentIds,
    cookies,
    courseIds,
    programId,
    departmentId,
  };
}

/** POSTs one add/drop action with a fresh idempotency key. */
export function action(
  cookie: string,
  path: string,
  body: object,
  key = randomUUID(),
): request.Test {
  return request(app())
    .post(`/api/add-drop${path}`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', key)
    .send(body);
}

/** Seats taken per course code, straight from the offering rows. */
export async function seatsTaken(windowId: string): Promise<Record<string, number>> {
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

/** The course code each student holds a seat in, by student id. */
export async function heldSeats(windowId: string): Promise<Map<string, string>> {
  const result = await getTestPool().query<{ student_id: string; code: string }>(
    `SELECT e.student_id, c.code
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.window_id = $1 AND e.status = 'ACTIVE'`,
    [windowId],
  );
  return new Map(result.rows.map((row) => [row.student_id, row.code]));
}

/** Students holding two ACTIVE seats at once; must always be empty. */
export async function doubleBooked(windowId: string): Promise<string[]> {
  const result = await getTestPool().query<{ student_id: string }>(
    `SELECT e.student_id FROM enrollments e
     WHERE e.window_id = $1 AND e.status = 'ACTIVE'
     GROUP BY e.student_id HAVING count(*) > 1`,
    [windowId],
  );
  return result.rows.map((row) => row.student_id);
}

/** Stored positions of the entries still WAITING for a course, in order. */
export async function waitingPositions(
  windowId: string,
  courseId: string,
): Promise<number[]> {
  const result = await getTestPool().query<{ position: number }>(
    `SELECT position FROM waitlist_entries
     WHERE window_id = $1 AND course_id = $2 AND status = 'WAITING'
     ORDER BY position`,
    [windowId, courseId],
  );
  return result.rows.map((row) => row.position);
}
