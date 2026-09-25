/**
 * The allocation run against a real database: what it writes, what it refuses,
 * and the proof that a failure part-way through leaves nothing behind.
 *
 * The algorithm itself is tested without a database in
 * `src/allocation/*.test.ts`; what is checked here is the transaction, the
 * constraints and the endpoints.
 */
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  type AllocationPreview,
  type AllocationRunDetail,
  type AllocationRunSummary,
  type AllocationVerification,
  type StudentAllocationResults,
} from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { FAULT_MID_ALLOCATION } from '../../src/services/allocationService.js';
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

const PREVIEW_PATH = '/api/admin/allocation/preview';
const RUN_PATH = '/api/admin/allocation/run';
const RUNS_PATH = '/api/admin/allocation-runs';
const RESULTS_PATH = '/api/allocation/results';

const app = () => buildApp();

interface World {
  windowId: string;
  admin: string;
  courses: Record<string, string>;
  students: string[];
}

/**
 * Six students chasing two seats in the popular course, with a roomier
 * second choice and a third that always has space.
 */
async function buildAllocationWorld(
  options: { studentCount?: number; capacity?: number; method?: string } = {},
): Promise<World> {
  const { studentCount = 6, capacity = 2, method = 'PREFERENCE_PRIORITY' } = options;
  // The window's stored config must agree with its method: a CHECK enforces it.
  const config = method === 'FCFS' ? FCFS_CONFIG : DEFAULT_PREFERENCE_PRIORITY_CONFIG;
  const pool = getTestPool();
  const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, department, { code: 'CSE', name: 'Computer Science' });
  const windowId = await createWindow(pool, { name: 'Fall 2026', method, config });

  const courses: Record<string, string> = {};
  for (const [code, seats] of [
    ['AI401', capacity],
    ['CS402', 3],
    ['CS403', 20],
  ] as const) {
    const id = await createCourse(pool, department, { code, name: `Course ${code}` });
    await createOffering(pool, windowId, id, seats);
    courses[code] = id;
  }
  // AI401 rewards this programme, so scores differ from arrival order.
  await pool.query('INSERT INTO course_program_relevance (course_id, program_id) VALUES ($1, $2)', [
    courses.AI401,
    program,
  ]);
  await setWindowStatus(pool, windowId, 'OPEN');

  const students: string[] = [];
  for (let index = 0; index < studentCount; index += 1) {
    // The later a student submits, the more senior they are: FCFS and
    // Preference + Priority must then disagree.
    const studentId = await createStudent(pool, program, {
      semester: index < studentCount / 2 ? 5 : 8,
      creditsCompleted: 100,
    });
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    await addPreference(pool, submissionId, windowId, courses.AI401 ?? '', 1);
    await addPreference(pool, submissionId, windowId, courses.CS402 ?? '', 2);
    await addPreference(pool, submissionId, windowId, courses.CS403 ?? '', 3);
    await markSubmitted(pool, submissionId, randomUUID());
    students.push(studentId);
  }

  const admin = await createUser(pool, { role: 'ADMIN' });
  return { windowId, admin, courses, students };
}

const adminCookie = (admin: string) => sessionFor(admin, 'ADMIN');

function runAllocation(admin: string, body: object = { confirm: true }) {
  return request(app()).post(RUN_PATH).set('Cookie', adminCookie(admin)).send(body);
}

/** The failure message; supertest types the body as `any`. */
const messageOf = (response: request.Response) =>
  (response.body as { message?: string }).message ?? '';

async function counts(windowId: string) {
  const pool = getTestPool();
  const result = await pool.query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM allocation_runs WHERE window_id = $1) AS runs,
       (SELECT count(*) FROM allocation_results) AS results,
       (SELECT count(*) FROM enrollments WHERE window_id = $1) AS enrollments,
       (SELECT count(*) FROM waitlist_entries WHERE window_id = $1) AS waitlist,
       (SELECT count(*) FROM registration_history WHERE window_id = $1
          AND event_type IN ('ALLOCATED', 'WAITLISTED', 'NOT_ALLOCATED')) AS history,
       (SELECT count(*) FROM notifications WHERE type = 'ALLOCATION_RESULT') AS notifications,
       (SELECT count(*) FROM audit_logs WHERE action = 'ALLOCATION_RUN') AS audit`,
    [windowId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('count query returned no row');
  }
  return row;
}

afterEach(() => {
  armFault(null);
});

describe('POST /api/admin/allocation/preview', () => {
  it('needs an admin session', async () => {
    const { students } = await buildAllocationWorld();
    await request(app()).post(PREVIEW_PATH).expect(401);
    await request(app())
      .post(PREVIEW_PATH)
      .set('Cookie', sessionFor(students[0] ?? '', 'STUDENT'))
      .expect(403);
  });

  it('reports both methods side by side and writes nothing', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    const before = await counts(windowId);

    const preview = dataOf(
      await request(app()).post(PREVIEW_PATH).set('Cookie', adminCookie(admin)).expect(200),
    ) as AllocationPreview;

    expect(preview.submissions).toBe(6);
    expect(preview.methods.map((method) => method.method).sort()).toEqual([
      'FCFS',
      'PREFERENCE_PRIORITY',
    ]);
    // Exactly one method is the one the window froze.
    expect(preview.methods.filter((method) => method.willBeUsed)).toHaveLength(1);

    const preference = preview.methods.find((m) => m.method === 'PREFERENCE_PRIORITY');
    expect(preference?.metrics.justifiedEnvy).toBe(0);
    expect(preference?.metrics.allocated).toBe(6);

    expect(await counts(windowId)).toEqual(before);
  });

  it('refuses while the window still has no submissions', async () => {
    const pool = getTestPool();
    const department = await createDepartment(pool);
    const windowId = await createWindow(pool, { name: 'Empty' });
    const course = await createCourse(pool, department);
    await createOffering(pool, windowId, course, 5);
    await setWindowStatus(pool, windowId, 'OPEN');
    const admin = await createUser(pool, { role: 'ADMIN' });

    await request(app()).post(PREVIEW_PATH).set('Cookie', adminCookie(admin)).expect(409);
  });
});

describe('POST /api/admin/allocation/run', () => {
  it('refuses unless the window is closed', async () => {
    const { admin } = await buildAllocationWorld();
    expect(messageOf(await runAllocation(admin).expect(409))).toContain('OPEN');
  });

  it('refuses without an explicit confirmation', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    await runAllocation(admin, {}).expect(400);
    await runAllocation(admin, { confirm: false }).expect(400);
  });

  it('writes every row consistently and moves the window to ALLOCATED', async () => {
    const { admin, windowId, courses } = await buildAllocationWorld();
    const pool = getTestPool();
    await setWindowStatus(pool, windowId, 'CLOSED');

    const detail = dataOf(await runAllocation(admin).expect(200)) as AllocationRunDetail;

    expect(detail.status).toBe('COMPLETED');
    expect(detail.method).toBe('PREFERENCE_PRIORITY');
    expect(detail.outputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.metrics?.justifiedEnvy).toBe(0);
    expect(detail.metrics?.allocated).toBe(6);

    const after = await counts(windowId);
    expect(after).toMatchObject({
      runs: '1',
      enrollments: '6',
      history: '6',
      notifications: '6',
      audit: '1',
    });
    // Two seats in AI401 went to the two highest scores; the rest queue for it.
    const seats = await pool.query<{ allocated_count: number; capacity: number }>(
      'SELECT allocated_count, capacity FROM registration_window_courses WHERE window_id = $1 AND course_id = $2',
      [windowId, courses.AI401],
    );
    expect(seats.rows[0]).toEqual({ allocated_count: 2, capacity: 2 });

    // allocated_count matches the ACTIVE enrollments, as the trigger promises.
    const mismatch = await pool.query(
      `SELECT 1 FROM registration_window_courses o
        WHERE o.window_id = $1
          AND o.allocated_count <> (
            SELECT count(*) FROM enrollments e
             WHERE e.window_id = o.window_id AND e.course_id = o.course_id AND e.status = 'ACTIVE')`,
      [windowId],
    );
    expect(mismatch.rowCount).toBe(0);

    const status = await pool.query<{ status: string }>(
      'SELECT status FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(status.rows[0]?.status).toBe('ALLOCATED');
  });

  it('refuses a second run for the same window', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    await runAllocation(admin).expect(200);

    expect(messageOf(await runAllocation(admin).expect(409))).toContain('already');
  });

  it('rolls everything back and records the run as FAILED when it breaks', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    const pool = getTestPool();
    await setWindowStatus(pool, windowId, 'CLOSED');

    armFault(FAULT_MID_ALLOCATION);
    await runAllocation(admin).expect(500);
    armFault(null);

    // The run row survives — it is the record OF the failure — but nothing
    // the transaction wrote does.
    expect(await counts(windowId)).toMatchObject({
      runs: '1',
      results: '0',
      enrollments: '0',
      waitlist: '0',
      history: '0',
      notifications: '0',
      audit: '0',
    });
    const run = await pool.query<{ status: string; error_message: string | null }>(
      'SELECT status, error_message FROM allocation_runs WHERE window_id = $1',
      [windowId],
    );
    expect(run.rows[0]?.status).toBe('FAILED');
    expect(run.rows[0]?.error_message).toContain(FAULT_MID_ALLOCATION);

    const status = await pool.query<{ status: string }>(
      'SELECT status FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(status.rows[0]?.status).toBe('CLOSED');

    // And a real run afterwards still works.
    await runAllocation(admin).expect(200);
    expect(await counts(windowId)).toMatchObject({ enrollments: '6' });
  });
});

describe('allocation runs', () => {
  it('lists the runs and shows one in detail', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    const created = dataOf(await runAllocation(admin).expect(200)) as AllocationRunDetail;

    const runs = dataOf(
      await request(app()).get(RUNS_PATH).set('Cookie', adminCookie(admin)).expect(200),
    ) as AllocationRunSummary[];
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(created.id);

    const detail = dataOf(
      await request(app())
        .get(`${RUNS_PATH}/${created.id}`)
        .set('Cookie', adminCookie(admin))
        .expect(200),
    ) as AllocationRunDetail;
    expect(detail).toMatchObject({
      id: created.id,
      randomSeed: 42,
      algorithmVersion: 'deferred-acceptance-1.0.0',
    });
    expect(detail.inputSize).toEqual({ students: 6, courses: 3 });
    expect(detail.metrics?.courses).toHaveLength(3);
  });

  it('verifies that a completed run reproduces exactly', async () => {
    const { admin, windowId } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    const created = dataOf(await runAllocation(admin).expect(200)) as AllocationRunDetail;

    const verification = dataOf(
      await request(app())
        .post(`${RUNS_PATH}/${created.id}/verify`)
        .set('Cookie', adminCookie(admin))
        .expect(200),
    ) as AllocationVerification;

    expect(verification.reproducible).toBe(true);
    expect(verification.recomputedHash).toBe(created.outputHash);
    expect(verification.differences).toEqual([]);

    const audit = await getTestPool().query(
      `SELECT 1 FROM audit_logs WHERE action = 'ALLOCATION_VERIFY'`,
    );
    expect(audit.rowCount).toBe(1);
  });

  it('404s for a run that does not exist', async () => {
    const { admin } = await buildAllocationWorld();
    await request(app())
      .get(`${RUNS_PATH}/${randomUUID()}`)
      .set('Cookie', adminCookie(admin))
      .expect(404);
  });
});

describe('GET /api/allocation/results', () => {
  it('is empty before allocation has run', async () => {
    const { students } = await buildAllocationWorld();
    const results = dataOf(
      await request(app())
        .get(RESULTS_PATH)
        .set('Cookie', sessionFor(students[0] ?? '', 'STUDENT'))
        .expect(200),
    ) as StudentAllocationResults;

    expect(results.ranAt).toBeNull();
    expect(results.results).toEqual([]);
  });

  it('gives a student their own outcome for every course they ranked', async () => {
    const { admin, windowId, students } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    await runAllocation(admin).expect(200);

    const student = students[0] ?? '';
    const results = dataOf(
      await request(app())
        .get(RESULTS_PATH)
        .set('Cookie', sessionFor(student, 'STUDENT'))
        .expect(200),
    ) as StudentAllocationResults;

    expect(results.method).toBe('PREFERENCE_PRIORITY');
    expect(results.ranAt).not.toBeNull();
    expect(results.results).toHaveLength(3);
    expect(results.results.map((row) => row.explanation.preferenceRank)).toEqual([1, 2, 3]);
    expect(results.allocated?.type).toBe('ALLOCATED');

    // Every explanation is about this student's own standing, nobody else's.
    const serialised = JSON.stringify(results);
    for (const other of students.slice(1)) {
      expect(serialised).not.toContain(other);
    }
  });

  it('never returns another student’s rows', async () => {
    const { admin, windowId, students } = await buildAllocationWorld();
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');
    await runAllocation(admin).expect(200);

    const first = dataOf(
      await request(app())
        .get(RESULTS_PATH)
        .set('Cookie', sessionFor(students[0] ?? '', 'STUDENT')),
    ) as StudentAllocationResults;
    const second = dataOf(
      await request(app())
        .get(RESULTS_PATH)
        .set('Cookie', sessionFor(students[5] ?? '', 'STUDENT')),
    ) as StudentAllocationResults;

    // Same window, same run, different outcomes — each read from their own rows.
    expect(first.ranAt).toBe(second.ranAt);
    expect(first.results).toHaveLength(3);
    expect(second.results).toHaveLength(3);
  });
});

describe('FCFS as the frozen method', () => {
  it('allocates by arrival order and usually leaves justified envy', async () => {
    const { admin, windowId } = await buildAllocationWorld({ method: 'FCFS' });
    await setWindowStatus(getTestPool(), windowId, 'CLOSED');

    const detail = dataOf(await runAllocation(admin).expect(200)) as AllocationRunDetail;

    expect(detail.method).toBe('FCFS');
    expect(detail.algorithmVersion).toBe('fcfs-1.0.0');
    // The first two to submit are the juniors; the seniors who score higher
    // for AI401 lose the seat to them.
    expect(detail.metrics?.justifiedEnvy).toBeGreaterThan(0);
  });
});
