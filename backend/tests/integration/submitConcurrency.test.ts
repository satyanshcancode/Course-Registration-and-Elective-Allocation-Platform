/**
 * What happens when submits arrive at the same instant.
 *
 * Submitting does not take a seat, so these tests do not chase a seat race
 * (that is add/drop, Phase 10). They prove the four guarantees this phase
 * owes: no duplicate submissions, no partial ones, idempotent retries, and a
 * server-side arrival order FCFS can rely on.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createCourse,
  createDepartment,
  createOffering,
  createProgram,
  createStudent,
  createWindow,
  setWindowStatus,
} from './fixtures.js';
import { buildApp, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const CART_PATH = '/api/preferences';
const SUBMIT_PATH = '/api/registration/submit';

/** The rate limiter counts per student, so 20 attempts by one student need room. */
const app = () => buildApp();

async function buildWorld(studentCount: number) {
  const pool = getTestPool();
  const cse = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, cse, { code: 'CSE', name: 'Computer Science' });
  const windowId = await createWindow(pool, { name: 'Fall 2026' });

  const codes = ['CS401', 'CS402', 'CS403'];
  for (const code of codes) {
    const id = await createCourse(pool, cse, { code, name: `Course ${code}` });
    // Capacity is irrelevant here: a submit never takes a seat.
    await createOffering(pool, windowId, id, 5);
  }
  await setWindowStatus(pool, windowId, 'OPEN');

  const students: string[] = [];
  for (let index = 0; index < studentCount; index += 1) {
    students.push(await createStudent(pool, program, { semester: 6, creditsCompleted: 100 }));
  }
  return { pool, windowId, students, codes };
}

async function saveCart(student: string, codes: string[]) {
  await request(app())
    .put(CART_PATH)
    .set('Cookie', sessionFor(student, 'STUDENT'))
    .send({ courseCodes: codes })
    .expect(200);
}

function submit(student: string, key: string, codes: string[]) {
  return request(app())
    .post(SUBMIT_PATH)
    .set('Cookie', sessionFor(student, 'STUDENT'))
    .set('Idempotency-Key', key)
    .send({ courseCodes: codes });
}

describe('simultaneous submits', () => {
  it('gives 100 students exactly one submission each, even when every one retries at the same instant', async () => {
    const studentCount = 100;
    const { pool, students, codes } = await buildWorld(studentCount);
    const cart = codes.slice(0, 3);
    await Promise.all(students.map((student) => saveCart(student, cart)));

    // Every student fires their submit AND a duplicate with the same key,
    // all released together.
    const keys = new Map(students.map((student) => [student, randomUUID()]));
    const responses = await Promise.all(
      students.flatMap((student) => {
        const key = keys.get(student) ?? randomUUID();
        return [submit(student, key, cart), submit(student, key, cart)];
      }),
    );

    expect(responses).toHaveLength(studentCount * 2);
    // Both the original and its duplicate answer 200: one did the work, the
    // other replayed it.
    expect(responses.filter((response) => response.status === 200)).toHaveLength(studentCount * 2);

    const rows = await pool.query<{
      submitted: string;
      distinct_students: string;
      sequences: string;
      distinct_sequences: string;
      min_sequence: string;
      max_sequence: string;
    }>(
      `SELECT count(*) AS submitted,
                count(DISTINCT student_id) AS distinct_students,
                count(submission_sequence) AS sequences,
                count(DISTINCT submission_sequence) AS distinct_sequences,
                min(submission_sequence) AS min_sequence,
                max(submission_sequence) AS max_sequence
         FROM preference_submissions
         WHERE status = 'SUBMITTED'`,
    );
    const summary = rows.rows[0];

    // Exactly one submission per student, and no duplicates.
    expect(summary?.submitted).toBe(String(studentCount));
    expect(summary?.distinct_students).toBe(String(studentCount));

    // Every sequence number is unique and the run is gap-free.
    expect(summary?.distinct_sequences).toBe(String(studentCount));
    expect(Number(summary?.max_sequence) - Number(summary?.min_sequence) + 1).toBe(studentCount);

    // Every cart is complete: no partial submission.
    const partial = await pool.query<{ count: string }>(
      `SELECT count(*) AS count
         FROM preference_submissions ps
         LEFT JOIN preference_items pi ON pi.submission_id = ps.id
         WHERE ps.status = 'SUBMITTED'
         GROUP BY ps.id
         HAVING count(pi.*) <> $1`,
      [cart.length],
    );
    expect(partial.rowCount).toBe(0);

    // One history row and one notification per student, no more.
    const side = await pool.query<{ history: string; notifications: string }>(
      `SELECT
           (SELECT count(*) FROM registration_history WHERE event_type = 'SUBMITTED') AS history,
           (SELECT count(*) FROM notifications) AS notifications`,
    );
    expect(side.rows[0]).toEqual({
      history: String(studentCount),
      notifications: String(studentCount),
    });
  }, 120_000);

  it('lets exactly one of 20 different keys win for the same student', async () => {
    const { pool, students, codes } = await buildWorld(1);
    const student = students[0];
    if (!student) {
      throw new Error('no student');
    }
    const cart = codes.slice(0, 2);
    await saveCart(student, cart);

    const attempts = Array.from({ length: 20 }, () => submit(student, randomUUID(), cart));
    const responses = await Promise.all(attempts);

    const accepted = responses.filter((response) => response.status === 200);
    const conflicts = responses.filter((response) => response.status === 409);
    // The per-student rate limit may absorb some attempts; whichever answer
    // they get, only one submission may exist.
    expect(accepted).toHaveLength(1);
    expect(
      conflicts.length + accepted.length + responses.filter((r) => r.status === 429).length,
    ).toBe(20);

    const rows = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM preference_submissions WHERE status = 'SUBMITTED'`,
    );
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('never submits a cart different from the one it validated, while a save races it', async () => {
    const { pool, students, codes } = await buildWorld(1);
    const student = students[0];
    if (!student) {
      throw new Error('no student');
    }
    const original = codes.slice(0, 2);
    const rewritten = [...codes].reverse();
    await saveCart(student, original);

    // A submit of the original cart and a PUT replacing it, released together.
    const [submitted] = await Promise.all([
      submit(student, randomUUID(), original),
      request(app())
        .put(CART_PATH)
        .set('Cookie', sessionFor(student, 'STUDENT'))
        .send({ courseCodes: rewritten }),
    ]);

    const stored = await pool.query<{ status: string; code: string; rank: number }>(
      `SELECT ps.status, c.code, pi.rank
       FROM preference_submissions ps
       JOIN preference_items pi ON pi.submission_id = ps.id
       JOIN courses c ON c.id = pi.course_id
       ORDER BY pi.rank`,
    );
    const storedCodes = stored.rows.map((row) => row.code);

    if (submitted.status === 200) {
      // The submit won the row lock: what is stored must be what it validated,
      // and the racing save must have been refused.
      expect(stored.rows.every((row) => row.status === 'SUBMITTED')).toBe(true);
      expect(storedCodes).toEqual(original);
    } else {
      // The save won: nothing was submitted, and the cart is the new one.
      expect(submitted.status).toBe(409);
      expect(stored.rows.every((row) => row.status === 'DRAFT')).toBe(true);
      expect(storedCodes).toEqual(rewritten);
    }
  });
});
