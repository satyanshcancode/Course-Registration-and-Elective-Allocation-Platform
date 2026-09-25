/**
 * The registration cart: reading it, replacing it, and every way it can be
 * refused. Submitting is covered in submit.test.ts.
 */
import { MAX_PREFERENCES, readCartProblems, type PreferenceCart } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  addPreference,
  addPrerequisite,
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

const CART_PATH = '/api/preferences';

/**
 * Six CS courses the student can take, plus ME301, which needs a semester
 * they have not reached, and EC301, which exists but is not offered.
 */
async function buildCartWorld(windowStatus = 'OPEN') {
  const pool = getTestPool();
  const cse = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, cse, { code: 'CSE', name: 'Computer Science' });
  const windowId = await createWindow(pool, { name: 'Fall 2026' });

  const codes = ['CS401', 'CS402', 'CS403', 'CS404', 'CS405', 'CS406'];
  const offered = new Map<string, string>();
  for (const code of codes) {
    const id = await createCourse(pool, cse, { code, name: `Course ${code}` });
    await createOffering(pool, windowId, id, 20);
    offered.set(code, id);
  }

  const locked = await createCourse(pool, cse, { code: 'ME301', minSemester: 8 });
  await createOffering(pool, windowId, locked, 20);
  // Exists, but this window does not offer it.
  await createCourse(pool, cse, { code: 'EC301' });

  await setWindowStatus(pool, windowId, windowStatus);

  const student = await createStudent(pool, program, { semester: 6, creditsCompleted: 100 });
  const admin = await createUser(pool, { role: 'ADMIN' });
  return { pool, windowId, offered, student, admin, program, cse };
}

function cookieFor(student: string) {
  return sessionFor(student, 'STUDENT');
}

function getCart(cookie: string) {
  return request(buildApp()).get(CART_PATH).set('Cookie', cookie);
}

function putCart(cookie: string, courseCodes: string[]) {
  return request(buildApp()).put(CART_PATH).set('Cookie', cookie).send({ courseCodes });
}

const problemsOf = (response: request.Response) =>
  readCartProblems((response.body as { details?: unknown }).details);

describe('GET /api/preferences', () => {
  it('requires a student session', async () => {
    const { admin } = await buildCartWorld();
    await request(buildApp()).get(CART_PATH).expect(401);
    await request(buildApp()).get(CART_PATH).set('Cookie', sessionFor(admin, 'ADMIN')).expect(403);
  });

  it('starts empty and editable while the window is open', async () => {
    const { student } = await buildCartWorld();
    const cart = dataOf(await getCart(cookieFor(student)).expect(200)) as PreferenceCart;

    expect(cart).toMatchObject({
      status: 'DRAFT',
      items: [],
      editable: true,
      submittable: true,
      totalCredits: 0,
      reference: null,
    });
    expect(cart.window?.name).toBe('Fall 2026');
  });
});

describe('PUT /api/preferences', () => {
  it('replaces the cart and derives the ranks from the order', async () => {
    const { student } = await buildCartWorld();
    const cart = dataOf(
      await putCart(cookieFor(student), ['CS402', 'CS401']).expect(200),
    ) as PreferenceCart;

    expect(cart.items.map((item) => [item.rank, item.code])).toEqual([
      [1, 'CS402'],
      [2, 'CS401'],
    ]);
    expect(cart.totalCredits).toBe(cart.items.reduce((sum, item) => sum + item.credits, 0));
  });

  it('replaces rather than appends, and an empty list clears the cart', async () => {
    const { student } = await buildCartWorld();
    const cookie = cookieFor(student);
    await putCart(cookie, ['CS401', 'CS402', 'CS403']).expect(200);

    const replaced = dataOf(await putCart(cookie, ['CS404']).expect(200)) as PreferenceCart;
    expect(replaced.items.map((item) => item.code)).toEqual(['CS404']);

    const cleared = dataOf(await putCart(cookie, []).expect(200)) as PreferenceCart;
    expect(cleared.items).toEqual([]);
  });

  it('accepts a lower-case code and normalises it', async () => {
    const { student } = await buildCartWorld();
    const cart = dataOf(await putCart(cookieFor(student), ['cs401']).expect(200)) as PreferenceCart;
    expect(cart.items[0]?.code).toBe('CS401');
  });

  it('rejects more than the maximum', async () => {
    const { student } = await buildCartWorld();
    const tooMany = ['CS401', 'CS402', 'CS403', 'CS404', 'CS405', 'CS406'];
    const response = await putCart(cookieFor(student), tooMany).expect(400);
    // The schema caps the array before the rules see it.
    expect(JSON.stringify(response.body)).toMatch(new RegExp(`at most ${MAX_PREFERENCES}`));
  });

  it('rejects a duplicate course', async () => {
    const { student } = await buildCartWorld();
    const response = await putCart(cookieFor(student), ['CS401', 'CS401']).expect(400);
    expect(problemsOf(response)).toEqual([{ type: 'DUPLICATE', code: 'CS401' }]);
  });

  it('rejects a course this window does not offer', async () => {
    const { student } = await buildCartWorld();
    const response = await putCart(cookieFor(student), ['EC301']).expect(400);
    expect(problemsOf(response)).toEqual([{ type: 'NOT_OFFERED', code: 'EC301' }]);
  });

  it('rejects a course that does not exist', async () => {
    const { student } = await buildCartWorld();
    const response = await putCart(cookieFor(student), ['ZZ999']).expect(400);
    expect(problemsOf(response)).toEqual([{ type: 'UNKNOWN_COURSE', code: 'ZZ999' }]);
  });

  it('rejects a course the student is not eligible for, with the reasons', async () => {
    const { student } = await buildCartWorld();
    const response = await putCart(cookieFor(student), ['ME301']).expect(400);
    const [problem] = problemsOf(response);

    expect(problem).toMatchObject({ type: 'NOT_ELIGIBLE', code: 'ME301' });
    expect(problem?.type === 'NOT_ELIGIBLE' && problem.eligibility.eligible).toBe(false);
  });

  it('reports every problem at once and saves nothing', async () => {
    const { student, pool } = await buildCartWorld();
    const response = await putCart(cookieFor(student), ['ME301', 'ZZ999', 'CS401']).expect(400);

    expect(problemsOf(response).map((problem) => problem.type)).toEqual([
      'NOT_ELIGIBLE',
      'UNKNOWN_COURSE',
    ]);
    const saved = await pool.query('SELECT 1 FROM preference_items');
    expect(saved.rowCount).toBe(0);
  });

  it('is allowed while the window is still a draft, so a cart can be prepared early', async () => {
    const { student } = await buildCartWorld('DRAFT');
    const cart = dataOf(await putCart(cookieFor(student), ['CS401']).expect(200)) as PreferenceCart;

    expect(cart.items.map((item) => item.code)).toEqual(['CS401']);
    expect(cart.editable).toBe(true);
    // Saving is fine; submitting is not, and the cart says why.
    expect(cart.submittable).toBe(false);
    expect(cart.submitBlockedReason).toMatch(/draft/i);
  });

  it('is rejected once the window has closed', async () => {
    const { student, pool, windowId } = await buildCartWorld();
    await putCart(cookieFor(student), ['CS401']).expect(200);
    await setWindowStatus(pool, windowId, 'CLOSED');

    const response = await putCart(cookieFor(student), ['CS402']).expect(400);
    expect(problemsOf(response).map((problem) => problem.type)).toEqual(['WINDOW_NOT_OPEN']);

    const cart = dataOf(await getCart(cookieFor(student))) as PreferenceCart;
    expect(cart.items.map((item) => item.code)).toEqual(['CS401']);
    expect(cart.editable).toBe(false);
  });

  it('is rejected once the cart is submitted', async () => {
    const { student, pool, windowId, offered } = await buildCartWorld();
    const submissionId = await createDraftSubmission(pool, student, windowId);
    const courseId = offered.get('CS401');
    await addPreference(pool, submissionId, windowId, courseId!, 1);
    await markSubmitted(pool, submissionId, randomUUID());

    const response = await putCart(cookieFor(student), ['CS402']).expect(409);
    expect(problemsOf(response)).toEqual([{ type: 'ALREADY_SUBMITTED' }]);
  });

  it('never touches another student’s cart', async () => {
    const { student, program, pool } = await buildCartWorld();
    const other = await createStudent(pool, program, { semester: 6, creditsCompleted: 100 });

    await putCart(cookieFor(student), ['CS401']).expect(200);
    const theirs = dataOf(await getCart(cookieFor(other))) as PreferenceCart;

    expect(theirs.items).toEqual([]);
  });

  it('re-checks eligibility on read, so a cart can go stale', async () => {
    const { student, pool, offered, cse } = await buildCartWorld();
    await putCart(cookieFor(student), ['CS401']).expect(200);

    // The registrar adds a prerequisite the student has not passed.
    const prerequisite = await createCourse(pool, cse, { code: 'CS101' });
    await addPrerequisite(pool, offered.get('CS401')!, prerequisite);

    const cart = dataOf(await getCart(cookieFor(student))) as PreferenceCart;
    expect(cart.items[0]?.eligibility.eligible).toBe(false);
  });
});
