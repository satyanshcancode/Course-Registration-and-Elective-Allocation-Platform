/**
 * The CO_ADMIN role over HTTP.
 *
 * The feature is a single sentence — "everything an administrator can do,
 * except manage staff accounts" — so these tests are mostly a matrix rather
 * than a narrative: every administrative endpoint is walked with a co-admin's
 * cookie and must NOT answer 403, every staff-management endpoint must, and a
 * student must be refused by both sets. A new admin route that forgets its
 * middleware, or a Team route that loses `requireAdminManager`, fails here.
 */
import type { TeamList } from '@course-reg/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemoryMailer } from '../../src/mail/memoryMailer.js';
import {
  createCourse,
  createDepartment,
  createProgram,
  createStudent,
  createUser,
} from './fixtures.js';
import { ALLOWED_ORIGIN, buildAppWithMail, dataOf, sessionFor, tokenFromEmail } from './http.js';
import { getTestPool } from './testDatabase.js';

type App = ReturnType<typeof buildAppWithMail>['app'];

interface World {
  app: App;
  mailer: MemoryMailer;
  adminId: string;
  coAdminId: string;
  studentUserId: string;
  admin: string;
  coAdmin: string;
  student: string;
}

let world: World;

beforeEach(async () => {
  const pool = getTestPool();
  const { app, mailer } = buildAppWithMail();
  const departmentId = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const cse = await createProgram(pool, departmentId, { code: 'BTECH-CSE', name: 'B.Tech CSE' });
  await createCourse(pool, departmentId, { code: 'CS201', name: 'Data Structures' });

  const adminId = await createUser(pool, {
    email: 'registrar@test.edu',
    role: 'ADMIN',
    name: 'Priya Raman',
  });
  const coAdminId = await createUser(pool, {
    email: 'deputy@test.edu',
    role: 'CO_ADMIN',
    name: 'Devika Menon',
  });
  const studentUserId = await createStudent(pool, cse);

  world = {
    app,
    mailer,
    adminId,
    coAdminId,
    studentUserId,
    admin: sessionFor(adminId, 'ADMIN'),
    coAdmin: sessionFor(coAdminId, 'CO_ADMIN'),
    student: sessionFor(studentUserId, 'STUDENT'),
  };
});

const send = (method: 'get' | 'post' | 'patch' | 'put', path: string, cookie: string) =>
  request(world.app)[method](path).set('Origin', ALLOWED_ORIGIN).set('Cookie', cookie);

/**
 * Every administrative endpoint, by method and path. Reads are enough to prove
 * the guard: a 403 comes from the middleware before any handler runs, so a
 * route that answers anything else has let the caller through.
 */
const ADMIN_ENDPOINTS: readonly (readonly ['get' | 'post' | 'patch', string])[] = [
  ['get', '/api/admin/students'],
  ['get', '/api/admin/reference-data'],
  ['get', '/api/admin/course-catalogue'],
  ['get', '/api/admin/courses'],
  ['get', '/api/admin/registration-window'],
  ['get', '/api/admin/allocation-runs'],
  ['get', '/api/admin/waitlists'],
  ['post', '/api/admin/students/import/preview'],
  ['post', '/api/admin/course-catalogue/import/preview'],
];

/** The staff-management endpoints: ADMIN only, and the whole difference. */
const TEAM_ENDPOINTS: readonly (readonly ['get' | 'post', string])[] = [
  ['get', '/api/admin/team'],
  ['post', '/api/admin/team'],
  ['post', '/api/admin/team/00000000-0000-4000-8000-000000000001/invitation'],
  ['post', '/api/admin/team/00000000-0000-4000-8000-000000000001/deactivate'],
  ['post', '/api/admin/team/00000000-0000-4000-8000-000000000001/reactivate'],
];

describe('a co-administrator on the administrative endpoints', () => {
  it.each(ADMIN_ENDPOINTS)('is not forbidden from %s %s', async (method, path) => {
    const response = await send(method, path, world.coAdmin).send({});
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(401);
  });

  it('reads the student list exactly as an administrator does', async () => {
    const asAdmin = await send('get', '/api/admin/students', world.admin);
    const asCoAdmin = await send('get', '/api/admin/students', world.coAdmin);
    expect(asCoAdmin.status).toBe(200);
    expect(dataOf(asCoAdmin)).toEqual(dataOf(asAdmin));
  });

  it('may change what an administrator may change', async () => {
    const response = await send('post', '/api/admin/course-catalogue', world.coAdmin).send({
      code: 'CS999',
      name: 'Advanced Topics',
      description: 'A course created by a co-administrator.',
      department: 'CSE',
      credits: 3,
      minSemester: 5,
      minCredits: 80,
      prerequisites: [],
      eligiblePrograms: ['BTECH-CSE'],
      relevantPrograms: [],
    });
    expect(response.status).toBe(201);
  });

  it('is recorded as the actor on what it does', async () => {
    await send('post', '/api/admin/course-catalogue', world.coAdmin).send({
      code: 'CS998',
      name: 'Seminar',
      description: 'Audited to the co-administrator who created it.',
      department: 'CSE',
      credits: 3,
      minSemester: 5,
      minCredits: 80,
      prerequisites: [],
      eligiblePrograms: ['BTECH-CSE'],
      relevantPrograms: [],
    });
    const audit = await getTestPool().query<{ actor_user_id: string }>(
      `SELECT actor_user_id FROM audit_logs WHERE action = 'COURSE_CREATED' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(audit.rows[0]?.actor_user_id).toBe(world.coAdminId);
  });
});

describe('a co-administrator on the staff endpoints', () => {
  it.each(TEAM_ENDPOINTS)('is forbidden from %s %s', async (method, path) => {
    const response = await send(method, path, world.coAdmin).send({});
    expect(response.status).toBe(403);
  });

  it('cannot invite anybody, not even a co-administrator', async () => {
    const response = await send('post', '/api/admin/team', world.coAdmin).send({
      name: 'A Second Deputy',
      email: 'second.deputy@test.edu',
    });
    expect(response.status).toBe(403);
    const created = await getTestPool().query(`SELECT id FROM users WHERE email = $1`, [
      'second.deputy@test.edu',
    ]);
    expect(created.rowCount).toBe(0);
  });

  it('cannot deactivate the administrator above them', async () => {
    const response = await send(
      'post',
      `/api/admin/team/${world.adminId}/deactivate`,
      world.coAdmin,
    ).send({});
    expect(response.status).toBe(403);
    const after = await getTestPool().query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id = $1`,
      [world.adminId],
    );
    expect(after.rows[0]?.is_active).toBe(true);
  });

  it('cannot deactivate another co-administrator, or themselves', async () => {
    const other = await createUser(getTestPool(), {
      email: 'third@test.edu',
      role: 'CO_ADMIN',
    });
    for (const id of [other, world.coAdminId]) {
      const response = await send('post', `/api/admin/team/${id}/deactivate`, world.coAdmin).send(
        {},
      );
      expect(response.status).toBe(403);
    }
  });
});

describe('a student', () => {
  it.each([...ADMIN_ENDPOINTS, ...TEAM_ENDPOINTS])(
    'is forbidden from %s %s',
    async (method, path) => {
      const response = await send(method, path, world.student).send({});
      expect(response.status).toBe(403);
    },
  );
});

describe('no endpoint lets a role be set', () => {
  it('ignores a role smuggled into a student creation', async () => {
    const response = await send('post', '/api/admin/students', world.admin).send({
      rollNumber: 'CSE26001',
      name: 'Asha Menon',
      email: 'asha.menon@test.edu',
      program: 'BTECH-CSE',
      semester: 5,
      creditsCompleted: 88,
      expectedGraduationTerm: '2028-SPRING',
      completedCourses: [],
      role: 'ADMIN',
    });
    expect(response.status).toBe(201);
    const created = await getTestPool().query<{ role: string }>(
      `SELECT role FROM users WHERE email = $1`,
      ['asha.menon@test.edu'],
    );
    expect(created.rows[0]?.role).toBe('STUDENT');
  });

  it('ignores a role smuggled into a CSV import', async () => {
    const csv = [
      'rollNumber,name,email,program,semester,creditsCompleted,expectedGraduationTerm,completedCourses,role',
      'CSE26002,Imported Person,imported@test.edu,BTECH-CSE,5,88,2028-SPRING,,ADMIN',
    ].join('\n');
    const response = await send('post', '/api/admin/students/import', world.admin).send({ csv });
    expect(response.status).toBe(200);
    const created = await getTestPool().query<{ role: string }>(
      `SELECT role FROM users WHERE email = $1`,
      ['imported@test.edu'],
    );
    expect(created.rows[0]?.role).toBe('STUDENT');
  });

  it('ignores a role smuggled into a password change', async () => {
    const response = await send('put', '/api/account/password', world.coAdmin).send({
      currentPassword: 'Test@123',
      newPassword: 'Changed@123',
      role: 'ADMIN',
    });
    expect(response.status).toBe(200);
    const after = await getTestPool().query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [world.coAdminId],
    );
    expect(after.rows[0]?.role).toBe('CO_ADMIN');
  });
});

describe('managing the team as an administrator', () => {
  const invite = (body: { name: string; email: string }) =>
    send('post', '/api/admin/team', world.admin).send(body);

  it('lists both staff roles, and never a student', async () => {
    const response = await send('get', '/api/admin/team', world.admin);
    expect(response.status).toBe(200);
    const team = dataOf(response) as TeamList;
    expect(team.members.map((member) => member.email).sort()).toEqual([
      'deputy@test.edu',
      'registrar@test.edu',
    ]);
    expect(team.activeAdmins).toBe(1);
    expect(team.members.find((member) => member.id === world.adminId)?.isSelf).toBe(true);
  });

  it('invites a co-administrator, who activates and can then administer', async () => {
    const response = await invite({ name: 'New Deputy', email: 'new.deputy@test.edu' });
    expect(response.status).toBe(201);

    const created = await getTestPool().query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1`,
      ['new.deputy@test.edu'],
    );
    expect(created.rows[0]?.role).toBe('CO_ADMIN');

    const token = tokenFromEmail(world.mailer.sent.at(-1)?.text ?? '');
    const activated = await request(world.app)
      .post('/api/auth/activate')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ token, password: 'Deputy@123' });
    expect(activated.status).toBe(200);

    // The session the activation handed back is a working co-admin session.
    // supertest types set-cookie as possibly absent, and an absent one would
    // make the two checks below pass for the wrong reason.
    const setCookie: unknown = activated.headers['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    const cookie = setCookie as string[];
    const courses = await request(world.app)
      .get('/api/admin/courses')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_ORIGIN);
    expect(courses.status).toBe(200);

    const team = await request(world.app)
      .get('/api/admin/team')
      .set('Cookie', cookie)
      .set('Origin', ALLOWED_ORIGIN);
    expect(team.status).toBe(403);
  });

  it('records an audit row naming the invitation as a staff one', async () => {
    await invite({ name: 'Audited Deputy', email: 'audited@test.edu' });
    const audit = await getTestPool().query<{ action: string; actor_user_id: string }>(
      `SELECT action, actor_user_id FROM audit_logs WHERE action = 'CO_ADMIN_INVITED'`,
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    expect(audit.rows[0]?.actor_user_id).toBe(world.adminId);
  });

  it('refuses an address that already belongs to an account', async () => {
    const response = await invite({ name: 'Clash', email: 'deputy@test.edu' });
    expect(response.status).toBe(409);
    expect((response.body as { errors: { field: string }[] }).errors[0]?.field).toBe('email');
  });

  it('deactivates a co-administrator, which ends their session at once', async () => {
    const before = await request(world.app)
      .get('/api/admin/courses')
      .set('Cookie', world.coAdmin)
      .set('Origin', ALLOWED_ORIGIN);
    expect(before.status).toBe(200);

    const response = await send(
      'post',
      `/api/admin/team/${world.coAdminId}/deactivate`,
      world.admin,
    ).send({ reason: 'Left the registrar’s office' });
    expect(response.status).toBe(200);

    const after = await request(world.app)
      .get('/api/admin/courses')
      .set('Cookie', world.coAdmin)
      .set('Origin', ALLOWED_ORIGIN);
    expect(after.status).toBe(401);
  });

  it('keeps a deactivated co-administrator’s audit history', async () => {
    await send('post', '/api/admin/course-catalogue', world.coAdmin).send({
      code: 'CS997',
      name: 'Before Deactivation',
      description: 'Created while still active.',
      department: 'CSE',
      credits: 3,
      minSemester: 5,
      minCredits: 80,
      prerequisites: [],
      eligiblePrograms: ['BTECH-CSE'],
      relevantPrograms: [],
    });
    await send('post', `/api/admin/team/${world.coAdminId}/deactivate`, world.admin).send({});

    const audit = await getTestPool().query(
      `SELECT id FROM audit_logs WHERE actor_user_id = $1 AND action = 'COURSE_CREATED'`,
      [world.coAdminId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('reactivates them again', async () => {
    await send('post', `/api/admin/team/${world.coAdminId}/deactivate`, world.admin).send({});
    const response = await send(
      'post',
      `/api/admin/team/${world.coAdminId}/reactivate`,
      world.admin,
    ).send({});
    expect(response.status).toBe(200);

    const courses = await request(world.app)
      .get('/api/admin/courses')
      .set('Cookie', world.coAdmin)
      .set('Origin', ALLOWED_ORIGIN);
    expect(courses.status).toBe(200);
  });

  it('refuses to deactivate the last active administrator', async () => {
    const response = await send(
      'post',
      `/api/admin/team/${world.adminId}/deactivate`,
      world.admin,
    ).send({});
    expect(response.status).toBe(400);
    expect((response.body as { message: string }).message).toMatch(/last active administrator/i);

    const after = await getTestPool().query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id = $1`,
      [world.adminId],
    );
    expect(after.rows[0]?.is_active).toBe(true);
  });

  it('allows it once a second administrator exists', async () => {
    const second = await createUser(getTestPool(), {
      email: 'second.registrar@test.edu',
      role: 'ADMIN',
    });
    const response = await send(
      'post',
      `/api/admin/team/${world.adminId}/deactivate`,
      world.admin,
    ).send({});
    expect(response.status).toBe(200);

    const after = await getTestPool().query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id IN ($1, $2) AND is_active`,
      [world.adminId, second],
    );
    expect(after.rowCount).toBe(1);
  });

  it('does not reach a student through a team endpoint', async () => {
    const response = await send(
      'post',
      `/api/admin/team/${world.studentUserId}/deactivate`,
      world.admin,
    ).send({});
    expect(response.status).toBe(404);

    const after = await getTestPool().query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id = $1`,
      [world.studentUserId],
    );
    expect(after.rows[0]?.is_active).toBe(true);
  });

  it('refuses to resend an invitation to somebody who has a password', async () => {
    const response = await send(
      'post',
      `/api/admin/team/${world.coAdminId}/invitation`,
      world.admin,
    ).send({});
    expect(response.status).toBe(400);
    expect((response.body as { message: string }).message).toMatch(/already set a password/i);
  });
});
