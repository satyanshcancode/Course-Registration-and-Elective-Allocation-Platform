/**
 * GET /api/eligibility and /api/eligibility/:code.
 *
 * The pre-check must work before registration opens (a DRAFT window), must be
 * computed server-side, and must never show one student another's record.
 */
import type { CourseEligibilityDetail, EligibilityOverview } from '@course-reg/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  addPrerequisite,
  createCourse,
  createDepartment,
  createOffering,
  createProgram,
  createStudent,
  createUser,
  createWindow,
  markCompleted,
  restrictToProgram,
} from './fixtures.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

/**
 * A DRAFT window offering four courses, so every reason type can be produced:
 *
 * | CS101 | open to all, no rules            | the student has passed it   |
 * | CS201 | open to all                      | fine                        |
 * | CS401 | CSE only, sem 5, 80 cr, needs CS201 | fails four rules at once |
 * | MG101 | open to all                      | fine                        |
 */
async function buildEligibility(status = 'DRAFT') {
  const pool = getTestPool();
  const cse = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const mgmt = await createDepartment(pool, { code: 'MGMT', name: 'Management' });
  const csProgram = await createProgram(pool, cse, { code: 'CSE', name: 'Computer Science' });
  const bbaProgram = await createProgram(pool, mgmt, { code: 'BBA', name: 'Business' });
  const windowId = await createWindow(pool, { status, name: 'Fall 2026' });

  const basics = await createCourse(pool, cse, { code: 'CS101', name: 'Programming Basics' });
  const structures = await createCourse(pool, cse, { code: 'CS201', name: 'Data Structures' });
  const ai = await createCourse(pool, cse, {
    code: 'CS401',
    name: 'Artificial Intelligence',
    minSemester: 5,
    minCredits: 80,
  });
  const management = await createCourse(pool, mgmt, { code: 'MG101', name: 'Principles' });
  await addPrerequisite(pool, ai, structures);
  await restrictToProgram(pool, ai, csProgram);
  for (const course of [basics, structures, ai, management]) {
    await createOffering(pool, windowId, course, 20);
  }

  // A management first-year who has passed CS101: fails every AI rule.
  const newcomer = await createStudent(pool, bbaProgram, { semester: 2, creditsCompleted: 20 });
  await markCompleted(pool, newcomer, basics);

  // A CSE final-year who meets every rule.
  const senior = await createStudent(pool, csProgram, { semester: 7, creditsCompleted: 140 });
  await markCompleted(pool, senior, structures);

  const admin = await createUser(pool, { role: 'ADMIN' });
  return { pool, windowId, newcomer, senior, admin };
}

function getOverview(cookie: string) {
  return request(buildApp()).get('/api/eligibility').set('Cookie', cookie);
}

function byCode(overview: EligibilityOverview, code: string) {
  const course = overview.courses.find((item) => item.code === code);
  if (!course) {
    throw new Error(`${code} is not in the response`);
  }
  return course;
}

describe('GET /api/eligibility', () => {
  it('requires a session', async () => {
    await request(buildApp()).get('/api/eligibility').expect(401);
  });

  it('is for students only', async () => {
    const { admin } = await buildEligibility();
    await getOverview(sessionFor(admin, 'ADMIN')).expect(403);
  });

  it('works before registration opens, while the window is a DRAFT', async () => {
    const { senior } = await buildEligibility('DRAFT');
    const response = await getOverview(sessionFor(senior, 'STUDENT')).expect(200);
    const overview = dataOf(response) as EligibilityOverview;

    expect(overview.window?.status).toBe('DRAFT');
    expect(overview.courses).toHaveLength(4);
    // CS201 is already passed, so it isn't offered to them again.
    expect(overview.summary).toEqual({ eligibleCount: 3, totalCount: 4 });
    expect(byCode(overview, 'CS401').eligible).toBe(true);
  });

  it('reports the student’s own record, so they see what was judged', async () => {
    const { senior } = await buildEligibility();
    const overview = dataOf(
      await getOverview(sessionFor(senior, 'STUDENT')),
    ) as EligibilityOverview;

    expect(overview.student).toEqual({
      program: { code: 'CSE', name: 'Computer Science' },
      semester: 7,
      creditsCompleted: 140,
      completedCourses: [{ code: 'CS201', name: 'Data Structures' }],
    });
  });

  it('gives a structured reason for every failing rule', async () => {
    const { newcomer } = await buildEligibility();
    const overview = dataOf(
      await getOverview(sessionFor(newcomer, 'STUDENT')),
    ) as EligibilityOverview;

    expect(byCode(overview, 'CS401')).toMatchObject({
      eligible: false,
      reasons: [
        {
          type: 'PROGRAM_NOT_ALLOWED',
          program: { code: 'BBA', name: 'Business' },
          allowedPrograms: [{ code: 'CSE', name: 'Computer Science' }],
        },
        { type: 'SEMESTER_TOO_LOW', required: 5, actual: 2 },
        { type: 'CREDITS_TOO_LOW', required: 80, actual: 20 },
        { type: 'PREREQUISITE_MISSING', course: { code: 'CS201', name: 'Data Structures' } },
      ],
    });
  });

  it('reports a passed course as ALREADY_COMPLETED', async () => {
    const { newcomer } = await buildEligibility();
    const overview = dataOf(
      await getOverview(sessionFor(newcomer, 'STUDENT')),
    ) as EligibilityOverview;

    expect(byCode(overview, 'CS101')).toMatchObject({
      eligible: false,
      reasons: [{ type: 'ALREADY_COMPLETED' }],
    });
    expect(overview.summary).toEqual({ eligibleCount: 2, totalCount: 4 });
  });

  it('gives each student their own answer, and never the other’s record', async () => {
    const { newcomer, senior } = await buildEligibility();
    const theirs = dataOf(await getOverview(sessionFor(senior, 'STUDENT'))) as EligibilityOverview;
    const response = await getOverview(sessionFor(newcomer, 'STUDENT'));
    const mine = dataOf(response) as EligibilityOverview;

    expect(byCode(theirs, 'CS401').eligible).toBe(true);
    expect(byCode(mine, 'CS401').eligible).toBe(false);
    // No id of any user appears in a student's own response.
    expect(JSON.stringify(response.body)).not.toContain(senior);
  });

  it('reports no courses when no window exists', async () => {
    const pool = getTestPool();
    const department = await createDepartment(pool);
    const program = await createProgram(pool, department);
    const student = await createStudent(pool, program);

    const overview = dataOf(
      await getOverview(sessionFor(student, 'STUDENT')),
    ) as EligibilityOverview;
    expect(overview).toMatchObject({
      window: null,
      courses: [],
      summary: { eligibleCount: 0, totalCount: 0 },
    });
  });
});

describe('GET /api/eligibility/:code', () => {
  it('checks one course for the calling student', async () => {
    const { newcomer } = await buildEligibility();
    const response = await request(buildApp())
      .get('/api/eligibility/CS401')
      .set('Cookie', sessionFor(newcomer, 'STUDENT'))
      .expect(200);
    const detail = dataOf(response) as CourseEligibilityDetail;

    expect(detail.course.code).toBe('CS401');
    expect(detail.course.eligible).toBe(false);
    expect(detail.course.reasons.map((reason) => reason.type)).toEqual([
      'PROGRAM_NOT_ALLOWED',
      'SEMESTER_TOO_LOW',
      'CREDITS_TOO_LOW',
      'PREREQUISITE_MISSING',
    ]);
    expect(detail.student.program.code).toBe('BBA');
  });

  it('is 404 for a course the window does not offer', async () => {
    const { senior } = await buildEligibility();
    await request(buildApp())
      .get('/api/eligibility/CS999')
      .set('Cookie', sessionFor(senior, 'STUDENT'))
      .expect(404);
  });

  it('rejects a malformed course code', async () => {
    const { senior } = await buildEligibility();
    await request(buildApp())
      .get('/api/eligibility/not-a-code')
      .set('Cookie', sessionFor(senior, 'STUDENT'))
      .expect(400);
  });
});
