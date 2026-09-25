/**
 * The atomic submit: the happy path, idempotent retries, every refusal, and
 * the proof that a failure part-way through leaves nothing behind.
 *
 * Submitting does not take a seat, so what is tested here is exactly one
 * submission per student, never a partial one, and a server-side arrival
 * order that FCFS can rely on.
 */
import { readCartProblems, type SubmissionReceipt } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { FAULT_AFTER_MARK_SUBMITTED } from '../../src/services/submitService.js';
import { armFault } from '../../src/utils/faultInjection.js';
import {
  createCourse,
  createDepartment,
  createOffering,
  createProgram,
  createStudent,
  createWindow,
  setWindowStatus,
} from './fixtures.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const CART_PATH = '/api/preferences';
const SUBMIT_PATH = '/api/registration/submit';
const STATUS_PATH = '/api/registration/status';

async function buildSubmitWorld(windowStatus = 'OPEN') {
  const pool = getTestPool();
  const cse = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, cse, { code: 'CSE', name: 'Computer Science' });
  const windowId = await createWindow(pool, { name: 'Fall 2026' });

  for (const code of ['CS401', 'CS402', 'CS403']) {
    const id = await createCourse(pool, cse, { code, name: `Course ${code}` });
    await createOffering(pool, windowId, id, 20);
  }
  const locked = await createCourse(pool, cse, { code: 'ME301', minSemester: 8 });
  await createOffering(pool, windowId, locked, 20);

  await setWindowStatus(pool, windowId, windowStatus);
  const student = await createStudent(pool, program, { semester: 6, creditsCompleted: 100 });
  return { pool, windowId, student, program, cse };
}

const cookieFor = (student: string) => sessionFor(student, 'STUDENT');

function saveCart(cookie: string, courseCodes: string[]) {
  return request(buildApp()).put(CART_PATH).set('Cookie', cookie).send({ courseCodes });
}

function submit(cookie: string, key: string, courseCodes: string[]) {
  return request(buildApp())
    .post(SUBMIT_PATH)
    .set('Cookie', cookie)
    .set('Idempotency-Key', key)
    .send({ courseCodes });
}

const problemsOf = (response: request.Response) =>
  readCartProblems((response.body as { details?: unknown }).details);

interface Counts {
  submissions: string;
  submitted: string;
  items: string;
  history: string;
  notifications: string;
}

async function counts(pool: ReturnType<typeof getTestPool>): Promise<Counts> {
  const result = await pool.query<{
    submissions: string;
    submitted: string;
    items: string;
    history: string;
    notifications: string;
  }>(
    `SELECT
       (SELECT count(*) FROM preference_submissions) AS submissions,
       (SELECT count(*) FROM preference_submissions WHERE status = 'SUBMITTED') AS submitted,
       (SELECT count(*) FROM preference_items) AS items,
       (SELECT count(*) FROM registration_history WHERE event_type = 'SUBMITTED') AS history,
       (SELECT count(*) FROM notifications) AS notifications`,
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

describe('POST /api/registration/submit', () => {
  it('needs a UUID idempotency key', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);

    await request(buildApp())
      .post(SUBMIT_PATH)
      .set('Cookie', cookie)
      .send({ courseCodes: ['CS401'] })
      .expect(400);
    await submit(cookie, 'not-a-uuid', ['CS401']).expect(400);
  });

  it('records the submission, its order, the history and the notification', async () => {
    const { student, pool } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS402', 'CS401']).expect(200);

    const receipt = dataOf(
      await submit(cookie, randomUUID(), ['CS402', 'CS401']).expect(200),
    ) as SubmissionReceipt;

    expect(receipt.items.map((item) => [item.rank, item.code])).toEqual([
      [1, 'CS402'],
      [2, 'CS401'],
    ]);
    expect(receipt.reference).toMatch(/^REF-[0-9A-F]{8}$/);
    expect(receipt.sequence).toBeGreaterThan(0);
    expect(Date.parse(receipt.submittedAt)).not.toBeNaN();

    expect(await counts(pool)).toMatchObject({
      submitted: '1',
      items: '2',
      history: '1',
      notifications: '1',
    });

    const notification = await pool.query<{ title: string }>('SELECT title FROM notifications');
    expect(notification.rows[0]?.title).toMatch(/We received your 2 preferences for Fall 2026/);
  });

  it('is reported by the status endpoint afterwards', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);
    const receipt = dataOf(await submit(cookie, randomUUID(), ['CS401'])) as SubmissionReceipt;

    const status = dataOf(
      await request(buildApp()).get(STATUS_PATH).set('Cookie', cookie).expect(200),
    ) as SubmissionReceipt;
    expect(status.reference).toBe(receipt.reference);
    expect(status.sequence).toBe(receipt.sequence);
  });

  it('replays the same key and payload without writing anything new', async () => {
    const { student, pool } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    const key = randomUUID();
    await saveCart(cookie, ['CS401', 'CS402']).expect(200);

    const first = dataOf(
      await submit(cookie, key, ['CS401', 'CS402']).expect(200),
    ) as SubmissionReceipt;
    const before = await counts(pool);
    const replay = dataOf(
      await submit(cookie, key, ['CS401', 'CS402']).expect(200),
    ) as SubmissionReceipt;

    expect(replay.reference).toBe(first.reference);
    expect(replay.sequence).toBe(first.sequence);
    expect(replay.submittedAt).toBe(first.submittedAt);
    expect(await counts(pool)).toEqual(before);
  });

  it('refuses the same key with a different payload', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    const key = randomUUID();
    await saveCart(cookie, ['CS401']).expect(200);
    await submit(cookie, key, ['CS401']).expect(200);

    const response = await submit(cookie, key, ['CS402']).expect(409);
    expect(problemsOf(response)).toEqual([{ type: 'CART_CHANGED' }]);
  });

  it('refuses a new key once the cart is submitted', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);
    await submit(cookie, randomUUID(), ['CS401']).expect(200);

    const response = await submit(cookie, randomUUID(), ['CS401']).expect(409);
    expect(problemsOf(response)).toEqual([{ type: 'ALREADY_SUBMITTED' }]);
  });

  it('refuses when the codes do not match the saved cart', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401', 'CS402']).expect(200);

    // Same courses, different order: still not the cart that was saved.
    const response = await submit(cookie, randomUUID(), ['CS402', 'CS401']).expect(409);
    expect(problemsOf(response)).toEqual([{ type: 'CART_CHANGED' }]);
  });

  it('refuses while the window is still a draft', async () => {
    const { student, pool, windowId } = await buildSubmitWorld('DRAFT');
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);

    const response = await submit(cookie, randomUUID(), ['CS401']).expect(409);
    expect(problemsOf(response).map((problem) => problem.type)).toEqual(['WINDOW_NOT_OPEN']);
    expect((await counts(pool)).submitted).toBe('0');
    expect(windowId).toBeTruthy();
  });

  it('refuses once the window has closed', async () => {
    const { student, pool, windowId } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);
    await setWindowStatus(pool, windowId, 'CLOSED');

    const response = await submit(cookie, randomUUID(), ['CS401']).expect(409);
    expect(problemsOf(response).map((problem) => problem.type)).toEqual(['WINDOW_NOT_OPEN']);
  });

  it('refuses after the closing time, even while the status is still OPEN', async () => {
    const { student, pool, windowId } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);
    await pool.query(
      `UPDATE registration_windows SET starts_at = now() - interval '2 days',
                                       ends_at = now() - interval '1 day'
       WHERE id = $1`,
      [windowId],
    );

    const response = await submit(cookie, randomUUID(), ['CS401']).expect(409);
    expect(problemsOf(response).map((problem) => problem.type)).toEqual(['WINDOW_NOT_OPEN']);
  });

  it('refuses a course the student became ineligible for', async () => {
    const { student, pool } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401']).expect(200);

    // The record changes after the draft was saved.
    await pool.query('UPDATE students SET semester = 1, credits_completed = 0 WHERE user_id = $1', [
      student,
    ]);
    await pool.query(`UPDATE courses SET min_semester = 5 WHERE code = 'CS401'`);

    const response = await submit(cookie, randomUUID(), ['CS401']).expect(409);
    expect(problemsOf(response).map((problem) => problem.type)).toEqual(['NOT_ELIGIBLE']);
    expect((await counts(pool)).submitted).toBe('0');
  });

  it('refuses an empty cart', async () => {
    const { student } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, []).expect(200);
    await submit(cookie, randomUUID(), []).expect(400);
  });

  it('rolls back completely when something fails after the submission is marked', async () => {
    const { student, pool } = await buildSubmitWorld();
    const cookie = cookieFor(student);
    await saveCart(cookie, ['CS401', 'CS402']).expect(200);
    const before = await counts(pool);

    armFault(FAULT_AFTER_MARK_SUBMITTED);
    await submit(cookie, randomUUID(), ['CS401', 'CS402']).expect(500);
    armFault(null);

    // The draft survives untouched: no submission, no sequence, no history,
    // no notification, and the cart items are still there.
    expect(await counts(pool)).toEqual(before);
    const row = await pool.query<{ status: string; submission_sequence: string | null }>(
      'SELECT status, submission_sequence FROM preference_submissions',
    );
    expect(row.rows[0]).toMatchObject({ status: 'DRAFT', submission_sequence: null });

    // And submitting afterwards still works.
    const receipt = dataOf(
      await submit(cookie, randomUUID(), ['CS401', 'CS402']).expect(200),
    ) as SubmissionReceipt;
    expect(receipt.items).toHaveLength(2);
  });
});
