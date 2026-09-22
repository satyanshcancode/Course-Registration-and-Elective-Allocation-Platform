/** Admin course list and capacity editing, over HTTP against the test database. */
import type { AdminCourseList, AdminCourseOffering } from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CAPACITY_CHANGED_ACTION } from '../../src/services/adminCourseService.js';
import {
  addPreference,
  allocatedCount,
  createCourse,
  createDepartment,
  createDraftSubmission,
  createEnrollment,
  createOffering,
  createProgram,
  createStudent,
  createUser,
  createWindow,
  markSubmitted,
} from './fixtures.js';
import { ALLOWED_ORIGIN, buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

/** CS401: 4 seats, 3 taken, 6 submitted requests. CS202: 10 seats, no requests. */
async function buildOfferings() {
  const pool = getTestPool();
  const departmentId = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const programId = await createProgram(pool, departmentId);
  const windowId = await createWindow(pool, { name: 'Fall 2026', status: 'OPEN' });
  const ai = await createCourse(pool, departmentId, {
    code: 'CS401',
    name: 'Artificial Intelligence',
  });
  const databases = await createCourse(pool, departmentId, {
    code: 'CS202',
    name: 'Database Systems',
  });
  await createOffering(pool, windowId, ai, 4);
  await createOffering(pool, windowId, databases, 10);

  for (let i = 0; i < 6; i += 1) {
    const student = await createStudent(pool, programId);
    const submission = await createDraftSubmission(pool, student, windowId);
    await addPreference(pool, submission, windowId, ai, 1);
    await markSubmitted(pool, submission, randomUUID());
    if (i < 3) {
      await createEnrollment(pool, student, windowId, ai);
    }
  }

  const adminId = await createUser(pool, { role: 'ADMIN' });
  const studentId = await createStudent(pool, programId);
  return { pool, windowId, ai, adminId, studentId };
}

function patchCapacity(cookie: string, code: string, body: unknown) {
  return request(buildApp())
    .patch(`/api/admin/courses/${code}/capacity`)
    .set('Origin', ALLOWED_ORIGIN)
    .set('Cookie', cookie)
    .send(body as object);
}

async function capacityOf(windowId: string, courseId: string): Promise<number | undefined> {
  const result = await getTestPool().query<{ capacity: number }>(
    'SELECT capacity FROM registration_window_courses WHERE window_id = $1 AND course_id = $2',
    [windowId, courseId],
  );
  return result.rows[0]?.capacity;
}

async function auditRows() {
  const result = await getTestPool().query<{
    actor_user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    old_value: unknown;
    new_value: unknown;
    reason: string;
  }>('SELECT * FROM audit_logs WHERE action = $1', [CAPACITY_CHANGED_ACTION]);
  return result.rows;
}

describe('admin endpoints are admin-only', () => {
  it('gives students 403 on the course list and on capacity changes', async () => {
    const { studentId, windowId, ai } = await buildOfferings();
    const cookie = sessionFor(studentId, 'STUDENT');

    const list = await request(buildApp()).get('/api/admin/courses').set('Cookie', cookie);
    expect(list.status).toBe(403);

    const change = await patchCapacity(cookie, 'CS401', { capacity: 40, reason: 'Let me in' });
    expect(change.status).toBe(403);
    expect(await capacityOf(windowId, ai)).toBe(4);
    expect(await auditRows()).toHaveLength(0);
  });
});

describe('GET /api/admin/courses', () => {
  it('lists every offering with seats, demand and an oversubscribed flag', async () => {
    const { adminId } = await buildOfferings();
    const response = await request(buildApp())
      .get('/api/admin/courses')
      .set('Cookie', sessionFor(adminId, 'ADMIN'));

    expect(response.status).toBe(200);
    const list = dataOf(response) as AdminCourseList;
    expect(list.window?.name).toBe('Fall 2026');
    expect(list.items).toEqual([
      expect.objectContaining({
        code: 'CS202',
        capacity: 10,
        allocated: 0,
        demand: 0,
        demandRatio: 0,
        oversubscribed: false,
      }),
      expect.objectContaining({
        code: 'CS401',
        capacity: 4,
        allocated: 3,
        available: 1,
        demand: 6,
        demandRatio: 1.5,
        oversubscribed: true,
      }),
    ]);
  });
});

describe('PATCH /api/admin/courses/:code/capacity', () => {
  it('changes the capacity and records who, old, new and why in audit_logs', async () => {
    const { adminId, windowId, ai } = await buildOfferings();

    const response = await patchCapacity(sessionFor(adminId, 'ADMIN'), 'cs401', {
      capacity: 12,
      reason: '  Second lab room approved  ',
    });

    expect(response.status).toBe(200);
    expect(dataOf(response) as AdminCourseOffering).toMatchObject({
      code: 'CS401',
      capacity: 12,
      allocated: 3,
      available: 9,
      demandRatio: 0.5,
      oversubscribed: false,
    });
    expect((response.body as { message: string }).message).toBe('CS401 capacity is now 12.');
    expect(await capacityOf(windowId, ai)).toBe(12);

    const [entry, ...others] = await auditRows();
    expect(others).toHaveLength(0);
    expect(entry).toMatchObject({
      actor_user_id: adminId,
      entity_type: 'registration_window_course',
      entity_id: `${windowId}:${ai}`,
      old_value: { courseCode: 'CS401', capacity: 4 },
      new_value: { courseCode: 'CS401', capacity: 12 },
      reason: 'Second lab room approved',
    });
  });

  it('rejects a capacity below the seats already allocated, changing nothing', async () => {
    const { adminId, windowId, ai } = await buildOfferings();

    const response = await patchCapacity(sessionFor(adminId, 'ADMIN'), 'CS401', {
      capacity: 2,
      reason: 'Room is smaller',
    });

    expect(response.status).toBe(409);
    const message = "Capacity can't be lower than 3: 3 seats are already allocated.";
    expect(response.body).toEqual({
      success: false,
      data: null,
      message,
      errors: [{ field: 'capacity', message }],
    });
    expect(await capacityOf(windowId, ai)).toBe(4);
    expect(await allocatedCount(getTestPool(), windowId, ai)).toBe(3);
    expect(await auditRows()).toHaveLength(0);
  });

  it('allows cutting capacity exactly down to the allocated count', async () => {
    const { adminId, windowId, ai } = await buildOfferings();
    const response = await patchCapacity(sessionFor(adminId, 'ADMIN'), 'CS401', {
      capacity: 3,
      reason: 'Room is smaller',
    });
    expect(response.status).toBe(200);
    expect(await capacityOf(windowId, ai)).toBe(3);
  });

  it.each([
    [{ capacity: 12 }, 'reason'],
    [{ capacity: 12, reason: 'ok' }, 'reason'],
    [{ capacity: -1, reason: 'Room is smaller' }, 'capacity'],
    [{ capacity: 2.5, reason: 'Room is smaller' }, 'capacity'],
    [{ capacity: '12', reason: 'Room is smaller' }, 'capacity'],
    [{ capacity: 4, reason: 'Nothing changes' }, 'capacity'],
  ])('rejects %o with a field error on %s', async (body, field) => {
    const { adminId, windowId, ai } = await buildOfferings();
    const response = await patchCapacity(sessionFor(adminId, 'ADMIN'), 'CS401', body);

    expect(response.status).toBe(400);
    const fields = (response.body as { errors: { field: string }[] }).errors.map((e) => e.field);
    expect(fields).toContain(field);
    expect(await capacityOf(windowId, ai)).toBe(4);
    expect(await auditRows()).toHaveLength(0);
  });

  it('404s for a course that is not offered', async () => {
    const { adminId } = await buildOfferings();
    const response = await patchCapacity(sessionFor(adminId, 'ADMIN'), 'ME999', {
      capacity: 5,
      reason: 'Room is smaller',
    });
    expect(response.status).toBe(404);
  });
});
