/**
 * Admin registration-window management: reading it, editing the draft policy,
 * opening and closing it, and the freeze that holds afterwards — in the
 * service AND in the database.
 */
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  type AdminWindowDetail,
  type UpdateWindowRequest,
} from '@course-reg/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { WINDOW_AUDIT_ACTIONS } from '../../src/services/registrationWindowService.js';
import {
  createCourse,
  createDepartment,
  createOffering,
  createProgram,
  createStudent,
  createUser,
  createWindow,
} from './fixtures.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const WINDOW_PATH = '/api/admin/registration-window';

async function buildWindow(status = 'DRAFT') {
  const pool = getTestPool();
  const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const program = await createProgram(pool, department, { code: 'CSE', name: 'Computer Science' });
  // Offerings are added while the window is still a draft, exactly as an
  // admin would: the freeze trigger rejects them afterwards.
  const windowId = await createWindow(pool, { status: 'DRAFT', name: 'Fall 2026' });

  const ai = await createCourse(pool, department, {
    code: 'CS401',
    name: 'Artificial Intelligence',
  });
  const cloud = await createCourse(pool, department, { code: 'CS402', name: 'Cloud Security' });
  const spare = await createCourse(pool, department, {
    code: 'CS403',
    name: 'Distributed Systems',
  });
  await createOffering(pool, windowId, ai, 20);
  await createOffering(pool, windowId, cloud, 30);
  if (status !== 'DRAFT') {
    await pool.query('UPDATE registration_windows SET status = $2 WHERE id = $1', [
      windowId,
      status,
    ]);
  }

  const admin = await createUser(pool, { role: 'ADMIN' });
  const students = await Promise.all([
    createStudent(pool, program, { semester: 6, creditsCompleted: 100 }),
    createStudent(pool, program, { semester: 7, creditsCompleted: 120 }),
  ]);
  return { pool, windowId, admin, students, program, codes: { ai, cloud, spare } };
}

function adminRequest(admin: string) {
  return { cookie: sessionFor(admin, 'ADMIN'), app: request(buildApp()) };
}

function validUpdate(overrides: Partial<UpdateWindowRequest> = {}): UpdateWindowRequest {
  return {
    name: 'Fall 2026',
    term: '2026-FALL',
    startsAt: new Date('2026-09-21T10:00:00.000Z').toISOString(),
    endsAt: new Date('2099-10-05T18:00:00.000Z').toISOString(),
    courseCodes: ['CS401', 'CS402'],
    policy: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    randomSeed: 2026091801,
    ...overrides,
  };
}

/** The ApiResponse message (supertest types the body as any). */
function messageOf(response: request.Response): string {
  return (response.body as { message?: string }).message ?? '';
}

async function auditRows(pool: ReturnType<typeof getTestPool>, action: string) {
  const result = await pool.query<{
    reason: string | null;
    old_value: unknown;
    new_value: unknown;
  }>('SELECT reason, old_value, new_value FROM audit_logs WHERE action = $1', [action]);
  return result.rows;
}

describe('GET /api/admin/registration-window', () => {
  it('is admin only', async () => {
    const { students } = await buildWindow();
    const [student] = students;
    await request(buildApp()).get(WINDOW_PATH).expect(401);
    await request(buildApp())
      .get(WINDOW_PATH)
      .set('Cookie', sessionFor(student, 'STUDENT'))
      .expect(403);
  });

  it('returns the window, its policy, counts and every course', async () => {
    const { admin } = await buildWindow();
    const { app, cookie } = adminRequest(admin);
    const detail = dataOf(
      await app.get(WINDOW_PATH).set('Cookie', cookie).expect(200),
    ) as AdminWindowDetail;

    expect(detail.window?.name).toBe('Fall 2026');
    expect(detail.policy).toEqual(DEFAULT_PREFERENCE_PRIORITY_CONFIG);
    expect(detail.editable).toBe(true);
    expect(detail.counts).toMatchObject({
      offeredCourses: 2,
      submissions: 0,
      totalStudents: 2,
      eligibleStudents: 2,
    });
    // Every course, marked with whether this window offers it.
    expect(detail.courses.map((course) => [course.code, course.offered])).toEqual([
      ['CS401', true],
      ['CS402', true],
      ['CS403', false],
    ]);
  });

  it('marks the policy as frozen once the window is open', async () => {
    const { admin } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);
    const detail = dataOf(await app.get(WINDOW_PATH).set('Cookie', cookie)) as AdminWindowDetail;
    expect(detail.editable).toBe(false);
  });
});

describe('PATCH /api/admin/registration-window', () => {
  it('saves the schedule, offered courses and policy, and writes an audit row', async () => {
    const { admin, pool } = await buildWindow();
    const { app, cookie } = adminRequest(admin);

    const detail = dataOf(
      await app
        .patch(WINDOW_PATH)
        .set('Cookie', cookie)
        .send(
          validUpdate({
            name: 'Fall 2026 (revised)',
            courseCodes: ['CS401', 'CS403'],
            policy: FCFS_CONFIG,
            reason: 'Dropped Cloud Security this term',
          }),
        )
        .expect(200),
    ) as AdminWindowDetail;

    expect(detail.window?.name).toBe('Fall 2026 (revised)');
    expect(detail.policy).toEqual(FCFS_CONFIG);
    expect(detail.courses.filter((course) => course.offered).map((course) => course.code)).toEqual([
      'CS401',
      'CS403',
    ]);

    const rows = await auditRows(pool, WINDOW_AUDIT_ACTIONS.update);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('Dropped Cloud Security this term');
    expect(rows[0]?.old_value).toMatchObject({ courseCodes: ['CS401', 'CS402'] });
    expect(rows[0]?.new_value).toMatchObject({ courseCodes: ['CS401', 'CS403'] });
  });

  it('keeps the seats of a course that stays offered', async () => {
    const { admin, pool } = await buildWindow();
    const { app, cookie } = adminRequest(admin);
    await app.patch(WINDOW_PATH).set('Cookie', cookie).send(validUpdate()).expect(200);

    const result = await pool.query<{ capacity: number }>(
      `SELECT rwc.capacity FROM registration_window_courses rwc
       JOIN courses c ON c.id = rwc.course_id WHERE c.code = 'CS401'`,
    );
    expect(result.rows[0]?.capacity).toBe(20);
  });

  it('rejects preference weights that increase down the list', async () => {
    const { admin } = await buildWindow();
    const { app, cookie } = adminRequest(admin);
    const response = await app
      .patch(WINDOW_PATH)
      .set('Cookie', cookie)
      .send(
        validUpdate({
          policy: {
            method: 'PREFERENCE_PRIORITY',
            preferenceWeights: { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 },
            priorityPoints: DEFAULT_PREFERENCE_PRIORITY_CONFIG.priorityPoints,
          },
        }),
      )
      .expect(400);
    expect(JSON.stringify(response.body)).toMatch(/must not increase/i);
  });

  it('rejects points outside 0–100 and a closing time before the opening one', async () => {
    const { admin } = await buildWindow();
    const { app, cookie } = adminRequest(admin);

    await app
      .patch(WINDOW_PATH)
      .set('Cookie', cookie)
      .send(
        validUpdate({
          policy: {
            method: 'PREFERENCE_PRIORITY',
            preferenceWeights: { 1: 200, 2: 80, 3: 60, 4: 40, 5: 20 },
            priorityPoints: DEFAULT_PREFERENCE_PRIORITY_CONFIG.priorityPoints,
          },
        }),
      )
      .expect(400);

    const response = await app
      .patch(WINDOW_PATH)
      .set('Cookie', cookie)
      .send(validUpdate({ endsAt: new Date('2026-09-20T10:00:00.000Z').toISOString() }))
      .expect(400);
    expect(JSON.stringify(response.body)).toMatch(/close after it opens/i);
  });

  it('rejects weights sent with the FCFS method', async () => {
    const { admin } = await buildWindow();
    const { app, cookie } = adminRequest(admin);
    await app
      .patch(WINDOW_PATH)
      .set('Cookie', cookie)
      .send(
        validUpdate({
          policy: {
            method: 'FCFS',
            preferenceWeights: DEFAULT_PREFERENCE_PRIORITY_CONFIG.preferenceWeights,
          } as never,
        }),
      )
      .expect(400);
  });
});

describe('opening and closing registration', () => {
  it('opens a draft window, freezes the policy and notifies every student', async () => {
    const { admin, pool, students } = await buildWindow();
    const { app, cookie } = adminRequest(admin);

    const detail = dataOf(
      await app
        .post(`${WINDOW_PATH}/open`)
        .set('Cookie', cookie)
        .send({ reason: 'Term starts today' })
        .expect(200),
    ) as AdminWindowDetail;

    expect(detail.window?.status).toBe('OPEN');
    expect(detail.editable).toBe(false);

    const notifications = await pool.query<{ user_id: string; title: string; body: string }>(
      "SELECT user_id, title, body FROM notifications WHERE type = 'WINDOW_STATUS'",
    );
    expect(notifications.rows).toHaveLength(students.length);
    expect(new Set(notifications.rows.map((row) => row.user_id))).toEqual(new Set(students));
    expect(notifications.rows[0]?.title).toBe('Registration for Fall 2026 is open');
    expect(notifications.rows[0]?.body).toMatch(/submit before/i);

    const rows = await auditRows(pool, WINDOW_AUDIT_ACTIONS.open);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('Term starts today');
    expect(rows[0]?.new_value).toMatchObject({ status: 'OPEN' });
  });

  it('refuses to open a window with no offered courses, and writes nothing', async () => {
    const pool = getTestPool();
    const windowId = await createWindow(pool, { status: 'DRAFT', name: 'Empty' });
    const admin = await createUser(pool, { role: 'ADMIN' });
    const { app, cookie } = adminRequest(admin);

    const response = await app.post(`${WINDOW_PATH}/open`).set('Cookie', cookie).send({});
    expect(response.status).toBe(409);
    expect(messageOf(response)).toMatch(/at least one course/i);

    const after = await pool.query<{ status: string }>(
      'SELECT status FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(after.rows[0]?.status).toBe('DRAFT');
    expect(await auditRows(pool, WINDOW_AUDIT_ACTIONS.open)).toHaveLength(0);
  });

  it('refuses to open a window whose closing time has passed', async () => {
    const pool = getTestPool();
    const department = await createDepartment(pool);
    const course = await createCourse(pool, department);
    const windowId = await createWindow(pool, {
      status: 'DRAFT',
      name: 'Past',
      startsAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
      endsAt: new Date('2020-02-01T00:00:00.000Z').toISOString(),
    });
    await createOffering(pool, windowId, course, 10);
    const admin = await createUser(pool, { role: 'ADMIN' });
    const { app, cookie } = adminRequest(admin);

    const response = await app.post(`${WINDOW_PATH}/open`).set('Cookie', cookie).send({});
    expect(response.status).toBe(409);
    expect(messageOf(response)).toMatch(/already be over/i);
  });

  it('closes an open window and records it', async () => {
    const { admin, pool } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const detail = dataOf(
      await app.post(`${WINDOW_PATH}/close`).set('Cookie', cookie).send({}).expect(200),
    ) as AdminWindowDetail;

    expect(detail.window?.status).toBe('CLOSED');
    expect(await auditRows(pool, WINDOW_AUDIT_ACTIONS.close)).toHaveLength(1);
  });

  it('refuses to reopen a closed window', async () => {
    const { admin } = await buildWindow('CLOSED');
    const { app, cookie } = adminRequest(admin);

    const reopen = await app.post(`${WINDOW_PATH}/open`).set('Cookie', cookie).send({});
    expect(reopen.status).toBe(409);
    expect(messageOf(reopen)).toMatch(/already closed/i);
  });

  it('refuses to close a draft window', async () => {
    const { admin } = await buildWindow('DRAFT');
    const { app, cookie } = adminRequest(admin);

    const close = await app.post(`${WINDOW_PATH}/close`).set('Cookie', cookie).send({});
    expect(close.status).toBe(409);
    expect(messageOf(close)).toMatch(/still a draft/i);
  });
});

describe('the frozen policy', () => {
  it('refuses a PATCH once the window is open', async () => {
    const { admin } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const response = await app
      .patch(WINDOW_PATH)
      .set('Cookie', cookie)
      .send(validUpdate({ policy: FCFS_CONFIG }));

    expect(response.status).toBe(409);
    expect(messageOf(response)).toMatch(/frozen/i);
  });

  it('is enforced by the database, not only by the service', async () => {
    const { pool, windowId } = await buildWindow('OPEN');

    // A direct UPDATE of a frozen column, exactly as a buggy script would do.
    await expect(
      pool.query(`UPDATE registration_windows SET allocation_method = 'FCFS' WHERE id = $1`, [
        windowId,
      ]),
    ).rejects.toThrow(/frozen/i);

    await expect(
      pool.query(`UPDATE registration_windows SET random_seed = 99 WHERE id = $1`, [windowId]),
    ).rejects.toThrow(/frozen/i);

    await expect(
      pool.query(
        `UPDATE registration_windows SET config = '{"method":"FCFS"}'::jsonb WHERE id = $1`,
        [windowId],
      ),
    ).rejects.toThrow(/frozen/i);
  });

  it('freezes the set of offered courses in the database too', async () => {
    const { pool, windowId, codes } = await buildWindow('OPEN');

    await expect(
      pool.query(
        `INSERT INTO registration_window_courses (window_id, course_id, capacity)
         VALUES ($1, $2, 10)`,
        [windowId, codes.spare],
      ),
    ).rejects.toThrow(/frozen/i);

    await expect(
      pool.query(
        `DELETE FROM registration_window_courses WHERE window_id = $1 AND course_id = $2`,
        [windowId, codes.ai],
      ),
    ).rejects.toThrow(/frozen/i);
  });

  it('still allows the schedule and a course’s capacity to change', async () => {
    const { pool, windowId, codes } = await buildWindow('OPEN');

    await pool.query(
      `UPDATE registration_windows SET ends_at = ends_at + interval '1 day' WHERE id = $1`,
      [windowId],
    );
    await pool.query(
      `UPDATE registration_window_courses SET capacity = 25
       WHERE window_id = $1 AND course_id = $2`,
      [windowId, codes.ai],
    );

    const result = await pool.query<{ capacity: number }>(
      `SELECT capacity FROM registration_window_courses WHERE window_id = $1 AND course_id = $2`,
      [windowId, codes.ai],
    );
    expect(result.rows[0]?.capacity).toBe(25);
  });
});
