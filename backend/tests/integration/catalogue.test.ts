/**
 * Course catalogue, course detail, current window and live seats, over HTTP
 * against the test database with the real service graph.
 */
import type {
  CatalogueCourse,
  CataloguePage,
  CourseDetail,
  CurrentWindowResponse,
  SeatSnapshot,
} from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCourseCatalogueRepository } from '../../src/repositories/courseCatalogueRepository.js';
import { createStudentRepository } from '../../src/repositories/studentRepository.js';
import { toCourseEligibility, toEligibilityCourse } from '../../src/services/catalogueRules.js';
import { evaluateEligibility } from '../../src/services/eligibilityRules.js';
import {
  addPreference,
  addPrerequisite,
  createCourse,
  createDepartment,
  createDraftSubmission,
  createEnrollment,
  createOffering,
  createProgram,
  createStudent,
  createUser,
  createWaitlistEntry,
  createWindow,
  markCompleted,
  markSubmitted,
  restrictToProgram,
} from './fixtures.js';
import { buildApp, countingPool, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

/**
 * Five offerings in an OPEN window:
 *
 * | code  | dept | cr | cap | taken | submitted demand | notes                         |
 * | CS101 | CSE  | 3  | 10  | 0     | 0                | "me" has passed it            |
 * | CS202 | CSE  | 3  | 5   | 1     | 3                | "me" holds a seat             |
 * | CS401 | CSE  | 4  | 2   | 0     | 3 (+1 draft)     | CS programme, sem 5, 80 cr, needs CS101 |
 * | MG302 | MGMT | 3  | 1   | 1     | 0                | full; "me" is 2nd in line     |
 * | MG999 | MGMT | 2  | 0   | 0     | 0                | no seats at all               |
 */
async function buildCatalogue() {
  const pool = getTestPool();
  const cse = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const mgmt = await createDepartment(pool, { code: 'MGMT', name: 'Management' });
  const csProgram = await createProgram(pool, cse);
  const bbaProgram = await createProgram(pool, mgmt);
  const windowId = await createWindow(pool, { name: 'Fall 2026', status: 'OPEN' });

  const basics = await createCourse(pool, cse, {
    code: 'CS101',
    name: 'Programming Basics',
    credits: 3,
  });
  const databases = await createCourse(pool, cse, {
    code: 'CS202',
    name: 'Database Systems',
    credits: 3,
  });
  const ai = await createCourse(pool, cse, {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    minSemester: 5,
    minCredits: 80,
    description: 'Search and planning. Four programming assignments.',
  });
  const venture = await createCourse(pool, mgmt, {
    code: 'MG302',
    name: 'Entrepreneurship',
    credits: 3,
  });
  const seminar = await createCourse(pool, mgmt, {
    code: 'MG999',
    name: 'Closed Seminar',
    credits: 2,
  });
  await addPrerequisite(pool, ai, basics);
  await restrictToProgram(pool, ai, csProgram);
  await createOffering(pool, windowId, basics, 10);
  await createOffering(pool, windowId, databases, 5);
  await createOffering(pool, windowId, ai, 2);
  await createOffering(pool, windowId, venture, 1);
  await createOffering(pool, windowId, seminar, 0);

  // "me": CS, semester 6, passed CS101. Draft cart AI #1, DB #2; holds a DB
  // seat; waiting for MG302 behind one other student.
  const me = await createStudent(pool, csProgram, { semester: 6, creditsCompleted: 100 });
  await markCompleted(pool, me, basics);
  const myCart = await createDraftSubmission(pool, me, windowId);
  await addPreference(pool, myCart, windowId, ai, 1);
  await addPreference(pool, myCart, windowId, databases, 2);
  await createEnrollment(pool, me, windowId, databases);

  // A first-year management student who meets none of AI's rules.
  const newcomer = await createStudent(pool, bbaProgram, { semester: 2, creditsCompleted: 20 });

  // Three submitted carts (demand) and one draft (not demand yet).
  for (let i = 0; i < 3; i += 1) {
    const student = await createStudent(pool, csProgram);
    const submission = await createDraftSubmission(pool, student, windowId);
    await addPreference(pool, submission, windowId, ai, 1);
    await addPreference(pool, submission, windowId, databases, 2);
    await markSubmitted(pool, submission, randomUUID());
  }
  const drafter = await createStudent(pool, csProgram);
  await addPreference(pool, await createDraftSubmission(pool, drafter, windowId), windowId, ai, 1);

  // MG302 is full; the promoted entry is history and doesn't count as "ahead".
  const seatHolder = await createStudent(pool, csProgram);
  await createEnrollment(pool, seatHolder, windowId, venture);
  await createWaitlistEntry(pool, seatHolder, windowId, venture, 1, 'PROMOTED');
  await createWaitlistEntry(pool, drafter, windowId, venture, 3);
  await createWaitlistEntry(pool, me, windowId, venture, 5);

  const admin = await createUser(pool, { role: 'ADMIN' });
  return {
    pool,
    windowId,
    ids: { basics, databases, ai, venture, seminar },
    me,
    newcomer,
    drafter,
    admin,
    csProgram,
    cse,
  };
}

type Catalogue = Awaited<ReturnType<typeof buildCatalogue>>;

async function getCatalogue(cookie: string, query = '') {
  const response = await request(buildApp()).get(`/api/courses${query}`).set('Cookie', cookie);
  expect(response.status).toBe(200);
  return dataOf(response) as CataloguePage;
}

const codesOf = (page: CataloguePage) => page.items.map((item) => item.code);
const byCode = (page: CataloguePage, code: string): CatalogueCourse => {
  const found = page.items.find((item) => item.code === code);
  if (!found) {
    throw new Error(`${code} not in page`);
  }
  return found;
};

describe('GET /api/courses — filters, sorting and paging', () => {
  it('lists every offering by code, with filter options for the whole window', async () => {
    const { me } = await buildCatalogue();
    const page = await getCatalogue(sessionFor(me, 'STUDENT'));

    expect(codesOf(page)).toEqual(['CS101', 'CS202', 'CS401', 'MG302', 'MG999']);
    expect(page.window).toMatchObject({ name: 'Fall 2026', status: 'OPEN' });
    expect(page.filterOptions).toEqual({
      departments: [
        { code: 'CSE', name: 'Computer Science' },
        { code: 'MGMT', name: 'Management' },
      ],
      credits: [2, 3, 4],
    });
    expect(page).toMatchObject({ page: 1, pageSize: 12, totalItems: 5, totalPages: 1 });
  });

  it.each([
    ['?search=cs4', ['CS401']],
    ['?search=DATA', ['CS202']],
    ['?department=MGMT', ['MG302', 'MG999']],
    ['?credits=3', ['CS101', 'CS202', 'MG302']],
    ['?onlyAvailable=true', ['CS101', 'CS202', 'CS401']],
    ['?department=CSE&credits=3&search=sys', ['CS202']],
    ['?search=nothing-matches', []],
  ])('%s', async (query, expected) => {
    const { me } = await buildCatalogue();
    expect(codesOf(await getCatalogue(sessionFor(me, 'STUDENT'), query))).toEqual(expected);
  });

  it('onlyEligible uses the calling student’s own eligibility', async () => {
    const { me, newcomer, admin } = await buildCatalogue();

    // "me" has already passed CS101.
    expect(codesOf(await getCatalogue(sessionFor(me, 'STUDENT'), '?onlyEligible=true'))).toEqual([
      'CS202',
      'CS401',
      'MG302',
      'MG999',
    ]);
    expect(
      codesOf(await getCatalogue(sessionFor(newcomer, 'STUDENT'), '?onlyEligible=true')),
    ).toEqual(['CS101', 'CS202', 'MG302', 'MG999']);
    // Admins have no eligibility: the filter doesn't hide anything.
    expect(await getCatalogue(sessionFor(admin, 'ADMIN'), '?onlyEligible=true')).toMatchObject({
      totalItems: 5,
    });
  });

  it.each([
    ['?sort=demand', ['CS202', 'CS401', 'CS101', 'MG302', 'MG999']],
    ['?sort=demandRatio', ['CS401', 'CS202', 'CS101', 'MG302', 'MG999']],
    ['?sort=available', ['CS101', 'CS202', 'CS401', 'MG302', 'MG999']],
    ['?sort=name', ['CS401', 'MG999', 'CS202', 'MG302', 'CS101']],
    ['?sort=code&order=desc', ['MG999', 'MG302', 'CS401', 'CS202', 'CS101']],
  ])('sorts %s', async (query, expected) => {
    const { me } = await buildCatalogue();
    expect(codesOf(await getCatalogue(sessionFor(me, 'STUDENT'), query))).toEqual(expected);
  });

  it('pages after filtering and sorting', async () => {
    const { me } = await buildCatalogue();
    const cookie = sessionFor(me, 'STUDENT');

    const second = await getCatalogue(cookie, '?pageSize=2&page=2');
    expect(codesOf(second)).toEqual(['CS401', 'MG302']);
    expect(second).toMatchObject({ page: 2, pageSize: 2, totalItems: 5, totalPages: 3 });

    const pastTheEnd = await getCatalogue(cookie, '?pageSize=2&page=9');
    expect(pastTheEnd.items).toEqual([]);
    expect(pastTheEnd.totalItems).toBe(5);
  });

  it('rejects invalid parameters with field errors', async () => {
    const { me } = await buildCatalogue();
    const response = await request(buildApp())
      .get('/api/courses?sort=popularity&pageSize=500&onlyAvailable=yes')
      .set('Cookie', sessionFor(me, 'STUDENT'));

    expect(response.status).toBe(400);
    const fields = (response.body as { errors: { field: string }[] }).errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['sort', 'pageSize', 'onlyAvailable']));
  });

  it('requires a session', async () => {
    await buildCatalogue();
    const app = buildApp();
    for (const path of [
      '/api/courses',
      '/api/courses/CS401',
      '/api/courses/seats',
      '/api/registration-windows/current',
    ]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
});

describe('GET /api/courses — seats and demand', () => {
  it('counts SUBMITTED preference items only, and divides by capacity', async () => {
    const { me } = await buildCatalogue();
    const page = await getCatalogue(sessionFor(me, 'STUDENT'));

    expect(byCode(page, 'CS401')).toMatchObject({
      capacity: 2,
      allocated: 0,
      available: 2,
      demand: 3, // the drafter's and my own draft carts are not counted
      demandRatio: 1.5,
      shortDescription: 'Search and planning.',
      prerequisites: [{ code: 'CS101', name: 'Programming Basics' }],
    });
    expect(byCode(page, 'CS202')).toMatchObject({
      capacity: 5,
      allocated: 1,
      available: 4,
      demand: 3,
      demandRatio: 0.6,
    });
    expect(byCode(page, 'MG302')).toMatchObject({ allocated: 1, available: 0, demand: 0 });
    // No seats: the ratio is null rather than Infinity/NaN.
    expect(byCode(page, 'MG999')).toMatchObject({ capacity: 0, demand: 0, demandRatio: null });
  });
});

describe('GET /api/courses — personal fields', () => {
  it('shows the caller’s own cart, seat and waitlist place', async () => {
    const { me } = await buildCatalogue();
    const page = await getCatalogue(sessionFor(me, 'STUDENT'));
    const status = (code: string) => byCode(page, code).personal?.myStatus;

    expect(status('CS101')).toEqual({ code: 'NOT_SELECTED' });
    expect(status('CS401')).toEqual({ code: 'IN_DRAFT_CART', rank: 1 });
    // Holding a seat outranks the draft rank for the same course.
    expect(status('CS202')).toEqual({ code: 'ENROLLED' });
    // Position 5 behind one WAITING entry (the PROMOTED one no longer counts).
    expect(status('MG302')).toEqual({ code: 'WAITLISTED', position: 2 });
  });

  it('never reflects other students’ carts or reveals who they are', async () => {
    const { newcomer, me, drafter } = await buildCatalogue();
    const response = await request(buildApp())
      .get('/api/courses')
      .set('Cookie', sessionFor(newcomer, 'STUDENT'));
    const page = dataOf(response) as CataloguePage;

    // Others submitted, drafted, enrolled and queued; the newcomer did nothing.
    expect(page.items.every((item) => item.personal?.myStatus.code === 'NOT_SELECTED')).toBe(true);
    const body = JSON.stringify(response.body);
    for (const otherId of [me, drafter]) {
      expect(body).not.toContain(otherId);
    }
  });

  it('gives admins the catalogue without personal fields', async () => {
    const { admin } = await buildCatalogue();
    const page = await getCatalogue(sessionFor(admin, 'ADMIN'));
    expect(page.items.every((item) => item.personal === null)).toBe(true);
  });

  it('computes eligibility on the server with the same pure rule', async () => {
    const { pool, windowId, newcomer } = await buildCatalogue();
    const page = await getCatalogue(sessionFor(newcomer, 'STUDENT'));

    // The rule applied directly to the database facts gives the same answers.
    const facts = await createStudentRepository(pool).findEligibilityFacts(newcomer);
    const offerings = await createCourseCatalogueRepository(pool).listOfferings(windowId);
    for (const offering of offerings) {
      const expected = toCourseEligibility(
        evaluateEligibility(facts!, toEligibilityCourse(offering)),
        offering,
      );
      expect(byCode(page, offering.code).personal?.eligibility).toEqual(expected);
    }

    expect(byCode(page, 'CS401').personal?.eligibility).toEqual({
      eligible: false,
      reasons: [
        { code: 'PROGRAM_NOT_ELIGIBLE' },
        { code: 'SEMESTER_TOO_LOW', requiredSemester: 5, currentSemester: 2 },
        { code: 'INSUFFICIENT_CREDITS', requiredCredits: 80, completedCredits: 20 },
        {
          code: 'MISSING_PREREQUISITES',
          missingCourses: [{ code: 'CS101', name: 'Programming Basics' }],
        },
      ],
    });
  });
});

describe('GET /api/courses/:code', () => {
  it('returns the full detail with prerequisites met or not for this student', async () => {
    const { me, newcomer } = await buildCatalogue();
    const app = buildApp();

    const mine = await request(app)
      .get('/api/courses/cs401')
      .set('Cookie', sessionFor(me, 'STUDENT'));
    expect(mine.status).toBe(200);
    expect(dataOf(mine) as CourseDetail).toMatchObject({
      code: 'CS401',
      description: 'Search and planning. Four programming assignments.',
      minSemester: 5,
      minCredits: 80,
      demand: 3,
      demandRatio: 1.5,
      prerequisites: [{ code: 'CS101', name: 'Programming Basics', met: true }],
      personal: { eligibility: { eligible: true }, myStatus: { code: 'IN_DRAFT_CART', rank: 1 } },
      window: { name: 'Fall 2026' },
    });
    expect((dataOf(mine) as CourseDetail).eligiblePrograms).toHaveLength(1);

    const theirs = await request(app)
      .get('/api/courses/CS401')
      .set('Cookie', sessionFor(newcomer, 'STUDENT'));
    expect((dataOf(theirs) as CourseDetail).prerequisites).toEqual([
      { code: 'CS101', name: 'Programming Basics', met: false },
    ]);
  });

  it('marks prerequisites as unknown (null) for admins', async () => {
    const { admin } = await buildCatalogue();
    const response = await request(buildApp())
      .get('/api/courses/CS401')
      .set('Cookie', sessionFor(admin, 'ADMIN'));
    expect(dataOf(response) as CourseDetail).toMatchObject({
      personal: null,
      prerequisites: [{ code: 'CS101', met: null }],
    });
  });

  it('404s for a course that is not offered and 400s for a malformed code', async () => {
    const { me } = await buildCatalogue();
    const app = buildApp();
    const cookie = sessionFor(me, 'STUDENT');

    const missing = await request(app).get('/api/courses/XX999').set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect((missing.body as { message: string }).message).toBe(
      'No course with code XX999 is offered in Fall 2026.',
    );
    expect((await request(app).get('/api/courses/drop%20table').set('Cookie', cookie)).status).toBe(
      400,
    );
  });
});

describe('GET /api/courses/seats', () => {
  it('returns the numbers with an ETag, and 304 while nothing changes', async () => {
    const { pool, me, windowId, ids, csProgram } = await buildCatalogue();
    const app = buildApp();
    const cookie = sessionFor(me, 'STUDENT');

    const first = await request(app).get('/api/courses/seats').set('Cookie', cookie);
    expect(first.status).toBe(200);
    const snapshot = dataOf(first) as SeatSnapshot;
    expect(first.headers.etag).toBe(`"${snapshot.version}"`);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    expect(snapshot.courses.find((c) => c.code === 'CS401')).toEqual({
      code: 'CS401',
      capacity: 2,
      allocated: 0,
      available: 2,
      demand: 3,
    });

    const unchanged = await request(app)
      .get('/api/courses/seats')
      .set('Cookie', cookie)
      .set('If-None-Match', first.headers.etag!);
    expect(unchanged.status).toBe(304);
    expect(unchanged.text).toBe('');

    // Browsers add "Cache-Control: no-cache" to fetch(…, { cache: 'no-store' });
    // the explicit If-None-Match must still be honoured.
    const fromBrowser = await request(app)
      .get('/api/courses/seats')
      .set('Cookie', cookie)
      .set('Cache-Control', 'no-cache')
      .set('Pragma', 'no-cache')
      .set('If-None-Match', first.headers.etag!);
    expect(fromBrowser.status).toBe(304);

    // Someone takes a CS101 seat: the version changes and the body comes back.
    await createEnrollment(pool, await createStudent(pool, csProgram), windowId, ids.basics);
    const changed = await request(app)
      .get('/api/courses/seats')
      .set('Cookie', cookie)
      .set('If-None-Match', first.headers.etag!);
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(first.headers.etag);
    expect((dataOf(changed) as SeatSnapshot).courses.find((c) => c.code === 'CS101')).toMatchObject(
      {
        allocated: 1,
        available: 9,
      },
    );
  });
});

describe('GET /api/registration-windows/current', () => {
  it('prefers the OPEN window over a newer draft, and reports the server time', async () => {
    const { pool, me } = await buildCatalogue();
    await createWindow(pool, { name: 'Spring 2027' });
    await pool.query(
      `UPDATE registration_windows SET starts_at = now() + interval '90 days',
              ends_at = now() + interval '100 days' WHERE name = 'Spring 2027'`,
    );

    const response = await request(buildApp())
      .get('/api/registration-windows/current')
      .set('Cookie', sessionFor(me, 'STUDENT'));
    const body = dataOf(response) as CurrentWindowResponse;
    expect(body.window).toMatchObject({ name: 'Fall 2026', status: 'OPEN', term: '2026-FALL' });
    expect(Math.abs(Date.parse(body.serverTime) - Date.now())).toBeLessThan(60_000);

    // Without an OPEN window, the most recent one is current.
    await pool.query(`UPDATE registration_windows SET status = 'CLOSED' WHERE name = 'Fall 2026'`);
    const later = await request(buildApp())
      .get('/api/registration-windows/current')
      .set('Cookie', sessionFor(me, 'STUDENT'));
    expect((dataOf(later) as CurrentWindowResponse).window?.name).toBe('Spring 2027');
  });
});

describe('query count (no N+1)', () => {
  async function addCourses(catalogue: Catalogue, count: number) {
    const { pool, windowId, cse, csProgram, ids } = catalogue;
    for (let i = 0; i < count; i += 1) {
      const courseId = await createCourse(pool, cse, { code: `CS5${String(i).padStart(2, '0')}` });
      await addPrerequisite(pool, courseId, ids.basics);
      await restrictToProgram(pool, courseId, csProgram);
      await createOffering(pool, windowId, courseId, 3);
    }
  }

  it('runs the same number of queries for 5 courses as for 25', async () => {
    const catalogue = await buildCatalogue();
    const counter = countingPool(catalogue.pool);
    const app = buildApp(counter.pool);
    const cookie = sessionFor(catalogue.me, 'STUDENT');

    await request(app).get('/api/courses').set('Cookie', cookie).expect(200);
    const withFive = counter.queries();

    await addCourses(catalogue, 20);
    counter.reset();
    const response = await request(app).get('/api/courses?pageSize=48').set('Cookie', cookie);
    expect((dataOf(response) as CataloguePage).totalItems).toBe(25);

    expect(counter.queries()).toBe(withFive);
    // Session check, window, offerings, the student's facts and statuses.
    expect(withFive).toBeLessThanOrEqual(5);
  });
});
