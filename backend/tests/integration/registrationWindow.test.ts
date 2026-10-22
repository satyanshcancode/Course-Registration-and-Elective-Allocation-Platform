/**
 * Admin registration-window management: reading it, editing the draft policy,
 * opening and closing it, and the freeze that holds afterwards — in the
 * service AND in the database.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  type AdminWindowDetail,
  type UpdateWindowRequest,
} from '@course-reg/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createServices } from '../../src/container.js';
import { createMemoryMailer } from '../../src/mail/memoryMailer.js';
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
import {
  APP_BASE_URL,
  JWT_SECRET,
  TEST_HASH_ROUNDS,
  buildApp,
  dataOf,
  sessionFor,
} from './http.js';
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
    actor_user_id: string | null;
    reason: string | null;
    old_value: unknown;
    new_value: unknown;
  }>('SELECT actor_user_id, reason, old_value, new_value FROM audit_logs WHERE action = $1', [
    action,
  ]);
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

describe('PATCH /api/admin/registration-window/deadline', () => {
  const DEADLINE_PATH = `${WINDOW_PATH}/deadline`;

  it('is admin only', async () => {
    const { students } = await buildWindow('OPEN');
    const [student] = students;
    await request(buildApp()).patch(DEADLINE_PATH).expect(401);
    await request(buildApp())
      .patch(DEADLINE_PATH)
      .set('Cookie', sessionFor(student, 'STUDENT'))
      .send({ endsAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(403);
  });

  it('extends the deadline of an open window, records an audit log, and leaves policy unchanged', async () => {
    const { admin, pool, windowId } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const initialWindow = await pool.query<{
      starts_at: string;
      ends_at: string;
      status: string;
      allocation_method: string;
      random_seed: string;
      config: unknown;
    }>(
      'SELECT starts_at, ends_at, status, allocation_method, random_seed, config FROM registration_windows WHERE id = $1',
      [windowId],
    );
    const previousEndsAt = new Date(initialWindow.rows[0]!.ends_at).toISOString();

    const newDeadline = new Date(Date.now() + 14 * 86400000).toISOString();
    const response = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: newDeadline, reason: 'Extended by faculty request' })
      .expect(200);

    const detail = dataOf(response) as AdminWindowDetail;
    expect(new Date(detail.window?.endsAt ?? '').getTime()).toBe(new Date(newDeadline).getTime());
    expect(detail.window?.status).toBe('OPEN');
    expect(detail.editable).toBe(false);

    // Verify database state: only ends_at changed
    const afterWindow = await pool.query<{
      starts_at: string;
      ends_at: string;
      status: string;
      allocation_method: string;
      random_seed: string;
      config: unknown;
    }>(
      'SELECT starts_at, ends_at, status, allocation_method, random_seed, config FROM registration_windows WHERE id = $1',
      [windowId],
    );

    expect(new Date(afterWindow.rows[0]!.ends_at).getTime()).toBe(new Date(newDeadline).getTime());
    expect(afterWindow.rows[0]!.status).toBe(initialWindow.rows[0]!.status);
    expect(new Date(afterWindow.rows[0]!.starts_at).getTime()).toBe(
      new Date(initialWindow.rows[0]!.starts_at).getTime(),
    );
    expect(afterWindow.rows[0]!.allocation_method).toBe(initialWindow.rows[0]!.allocation_method);
    expect(afterWindow.rows[0]!.random_seed).toBe(initialWindow.rows[0]!.random_seed);
    expect(afterWindow.rows[0]!.config).toEqual(initialWindow.rows[0]!.config);

    // Verify offerings are unchanged
    const offerings = await pool.query(
      'SELECT course_id, capacity FROM registration_window_courses WHERE window_id = $1 ORDER BY course_id',
      [windowId],
    );
    expect(offerings.rows).toHaveLength(2);

    // Verify audit log entry
    const rows = await auditRows(pool, WINDOW_AUDIT_ACTIONS.updateDeadline);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_user_id).toBe(admin);
    expect(rows[0]?.reason).toBe('Extended by faculty request');
    expect(rows[0]?.old_value).toEqual({ endsAt: previousEndsAt });
    expect(rows[0]?.new_value).toEqual({ endsAt: newDeadline });
  });

  it('shortens the deadline to a future time', async () => {
    const { admin, pool, windowId } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const newDeadline = new Date(Date.now() + 2 * 86400000).toISOString();
    const response = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: newDeadline })
      .expect(200);

    const detail = dataOf(response) as AdminWindowDetail;
    expect(new Date(detail.window?.endsAt ?? '').getTime()).toBe(new Date(newDeadline).getTime());

    const after = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(new Date(after.rows[0]!.ends_at).getTime()).toBe(new Date(newDeadline).getTime());
  });

  it('refuses invalid deadline values', async () => {
    const { admin } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const response = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: 'not-a-valid-date' });

    expect(response.status).toBe(400);
  });

  it('refuses a deadline in the past or present, leaving the existing deadline unchanged', async () => {
    const { admin, pool, windowId } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    // Ensure starts_at is in the past so that pastDate is strictly testing the past-deadline check
    await pool.query(
      "UPDATE registration_windows SET starts_at = now() - interval '2 days' WHERE id = $1",
      [windowId],
    );

    const before = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );

    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const response = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: pastDate });

    expect(response.status).toBe(400);
    expect(messageOf(response)).toMatch(/future/i);

    const after = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(new Date(after.rows[0]!.ends_at).getTime()).toBe(
      new Date(before.rows[0]!.ends_at).getTime(),
    );
    expect(await auditRows(pool, WINDOW_AUDIT_ACTIONS.updateDeadline)).toHaveLength(0);
  });

  it('refuses a deadline that is not after the opening time', async () => {
    const { admin, pool, windowId } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    // Set starts_at to a future time (e.g. 2 hours from now)
    await pool.query(
      "UPDATE registration_windows SET starts_at = now() + interval '2 hours' WHERE id = $1",
      [windowId],
    );

    const before = await pool.query<{ starts_at: string; ends_at: string }>(
      'SELECT starts_at, ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );
    // Deadline is in the future (1 hour from now), but BEFORE starts_at (2 hours from now)
    const beforeStartsAt = new Date(Date.now() + 3600000).toISOString();

    const response = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: beforeStartsAt });

    expect(response.status).toBe(400);
    expect(messageOf(response)).toMatch(/close after it opens/i);

    const after = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(new Date(after.rows[0]!.ends_at).getTime()).toBe(
      new Date(before.rows[0]!.ends_at).getTime(),
    );
  });

  it('refuses when the window is not OPEN (DRAFT, CLOSED, or ALLOCATED)', async () => {
    const { admin, pool, windowId } = await buildWindow('DRAFT');
    const { app, cookie } = adminRequest(admin);
    const newDeadline = new Date(Date.now() + 86400000).toISOString();

    // 1. DRAFT
    const draftRes = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: newDeadline });
    expect(draftRes.status).toBe(409);
    expect(messageOf(draftRes)).toMatch(/still a draft/i);

    // 2. CLOSED
    await pool.query("UPDATE registration_windows SET status = 'CLOSED' WHERE id = $1", [windowId]);
    const closedRes = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: newDeadline });
    expect(closedRes.status).toBe(409);
    expect(messageOf(closedRes)).toMatch(/already closed/i);

    // 3. ALLOCATED
    await pool.query("UPDATE registration_windows SET status = 'ALLOCATED' WHERE id = $1", [
      windowId,
    ]);
    const allocatedRes = await app
      .patch(DEADLINE_PATH)
      .set('Cookie', cookie)
      .send({ endsAt: newDeadline });
    expect(allocatedRes.status).toBe(409);
    expect(messageOf(allocatedRes)).toMatch(/already allocated/i);
  });

  it('rolls back the deadline update if the audit log insert fails', async () => {
    const { pool, windowId } = await buildWindow('OPEN');
    const before = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );

    const services = createServices(pool, {
      jwtSecret: JWT_SECRET,
      appBaseUrl: APP_BASE_URL,
      mailer: createMemoryMailer(),
      passwordHashRounds: TEST_HASH_ROUNDS,
    });

    const newDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
    // Non-existent actorUserId UUID triggers foreign key constraint violation in audit_logs table
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    await expect(
      services.registrationWindowService.updateDeadline(nonExistentUserId, {
        endsAt: newDeadline,
      }),
    ).rejects.toThrow();

    // Check PostgreSQL state: ends_at rolled back to original value
    const after = await pool.query<{ ends_at: string }>(
      'SELECT ends_at FROM registration_windows WHERE id = $1',
      [windowId],
    );
    expect(new Date(after.rows[0]!.ends_at).getTime()).toBe(
      new Date(before.rows[0]!.ends_at).getTime(),
    );
    expect(await auditRows(pool, WINDOW_AUDIT_ACTIONS.updateDeadline)).toHaveLength(0);
  });

  it('continues protecting policy and offered courses via database freeze triggers after deadline change', async () => {
    const { admin, pool, windowId, codes } = await buildWindow('OPEN');
    const { app, cookie } = adminRequest(admin);

    const newDeadline = new Date(Date.now() + 5 * 86400000).toISOString();
    await app.patch(DEADLINE_PATH).set('Cookie', cookie).send({ endsAt: newDeadline }).expect(200);

    // Attempting to change policy directly in the database is blocked by freeze trigger
    await expect(
      pool.query("UPDATE registration_windows SET allocation_method = 'FCFS' WHERE id = $1", [
        windowId,
      ]),
    ).rejects.toThrow(/frozen/i);

    // Attempting to add an offering directly in the database is blocked by freeze trigger
    await expect(createOffering(pool, windowId, codes.spare, 15)).rejects.toThrow(/frozen/i);
  });

  it('allows student submissions once an expired window deadline is extended', async () => {
    const { admin, pool, windowId, students } = await buildWindow('OPEN');
    const [student] = students;
    const { app, cookie: adminCookie } = adminRequest(admin);
    const studentCookie = sessionFor(student, 'STUDENT');

    // Save student cart with CS401
    await request(buildApp())
      .put('/api/preferences')
      .set('Cookie', studentCookie)
      .send({ courseCodes: ['CS401'] })
      .expect(200);

    // Expire the window: starts 2 days ago, ended 1 hour ago
    await pool.query(
      "UPDATE registration_windows SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 hour' WHERE id = $1",
      [windowId],
    );

    // Student submission fails because window deadline has passed
    const refusedRes = await request(buildApp())
      .post('/api/registration/submit')
      .set('Cookie', studentCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ courseCodes: ['CS401'] });
    expect(refusedRes.status).toBe(409);

    // Admin extends deadline to 3 days in the future
    const extendedDeadline = new Date(Date.now() + 3 * 86400000).toISOString();
    await app
      .patch(DEADLINE_PATH)
      .set('Cookie', adminCookie)
      .send({ endsAt: extendedDeadline, reason: 'Late submissions allowed' })
      .expect(200);

    // Student submission now succeeds immediately
    const acceptedRes = await request(buildApp())
      .post('/api/registration/submit')
      .set('Cookie', studentCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ courseCodes: ['CS401'] });
    expect(acceptedRes.status).toBe(200);
  });
});
