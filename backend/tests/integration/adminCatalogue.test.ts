/**
 * The course catalogue over HTTP: create, edit, retire, and the CSV import.
 *
 * The retirement rules are the interesting part: a course a live window offers
 * cannot be retired, and the service, the response and migration 0012's trigger
 * all have to agree about that.
 */
import {
  buildCsvTemplate,
  COURSE_CSV_COLUMNS,
  COURSE_CSV_EXAMPLE,
  type AdminCatalogue,
  type AdminCourseRecord,
  type CsvImportReport,
} from '@course-reg/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  createDepartment,
  createOffering,
  createProgram,
  createUser,
  createWindow,
  setWindowStatus,
} from './fixtures.js';
import { ALLOWED_ORIGIN, buildAppWithMail, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

let app: ReturnType<typeof buildAppWithMail>['app'];
let admin: string;
let adminId: string;

beforeEach(async () => {
  const pool = getTestPool();
  app = buildAppWithMail().app;
  const departmentId = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  await createDepartment(pool, { code: 'ECE', name: 'Electronics' });
  await createProgram(pool, departmentId, { code: 'BTECH-CSE', name: 'B.Tech CSE' });
  await createProgram(pool, departmentId, { code: 'BTECH-ECE', name: 'B.Tech ECE' });
  await createCourse(pool, departmentId, { code: 'CS201', name: 'Data Structures' });
  adminId = await createUser(pool, { email: 'registrar@test.edu', role: 'ADMIN' });
  admin = sessionFor(adminId, 'ADMIN');
});

const call = (method: 'get' | 'post' | 'patch', path: string) =>
  request(app)[method](path).set('Origin', ALLOWED_ORIGIN).set('Cookie', admin);

function validCourse(overrides: Record<string, unknown> = {}) {
  return {
    code: 'CS410',
    name: 'Distributed Systems',
    credits: 4,
    department: 'CSE',
    description: 'Consensus, replication and fault tolerance.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: ['CS201'],
    eligiblePrograms: ['BTECH-CSE'],
    relevantPrograms: ['BTECH-CSE'],
    ...overrides,
  };
}

const createCourseRecord = (body: unknown) =>
  call('post', '/api/admin/course-catalogue').send(body as object);

async function catalogue(): Promise<AdminCatalogue> {
  return dataOf(await call('get', '/api/admin/course-catalogue')) as AdminCatalogue;
}

// ---------------------------------------------------------------------------

describe('POST /api/admin/course-catalogue', () => {
  it('creates a course with all three rule lists', async () => {
    const response = await createCourseRecord(validCourse());

    expect(response.status).toBe(201);
    expect(dataOf(response)).toMatchObject({
      code: 'CS410',
      name: 'Distributed Systems',
      credits: 4,
      department: { code: 'CSE' },
      minSemester: 5,
      minCredits: 80,
      prerequisites: [{ code: 'CS201' }],
      eligiblePrograms: [{ code: 'BTECH-CSE' }],
      relevantPrograms: [{ code: 'BTECH-CSE' }],
      isActive: true,
      offeredIn: [],
      canDeactivate: true,
    });
  });

  it('creates a course open to every programme when the list is empty', async () => {
    const response = await createCourseRecord(
      validCourse({ eligiblePrograms: [], relevantPrograms: [] }),
    );

    expect(response.status).toBe(201);
    expect((dataOf(response) as AdminCourseRecord).eligiblePrograms).toEqual([]);
  });

  it('refuses a duplicate code, naming the field', async () => {
    await createCourseRecord(validCourse());

    const response = await createCourseRecord(validCourse({ name: 'Something else' }));

    expect(response.status).toBe(409);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe('code');
  });

  it('refuses a malformed code', async () => {
    expect((await createCourseRecord(validCourse({ code: 'CS4100' }))).status).toBe(400);
    expect((await createCourseRecord(validCourse({ code: 'C1' }))).status).toBe(400);
  });

  it('refuses a course that is its own prerequisite', async () => {
    const response = await createCourseRecord(
      validCourse({ code: 'CS410', prerequisites: ['CS410'] }),
    );

    expect(response.status).toBe(400);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe(
      'prerequisites',
    );
  });

  it('refuses a department that does not exist', async () => {
    const response = await createCourseRecord(validCourse({ department: 'XYZ' }));
    expect(response.status).toBe(400);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe(
      'department',
    );
  });

  it('refuses a prerequisite that does not exist', async () => {
    const response = await createCourseRecord(validCourse({ prerequisites: ['CS999'] }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('writes an audit row', async () => {
    await createCourseRecord(validCourse());

    const audit = await getTestPool().query<{ new_value: { code: string } }>(
      `SELECT new_value FROM audit_logs WHERE action = 'COURSE_CREATED'`,
    );
    expect(audit.rows[0]?.new_value.code).toBe('CS410');
  });
});

describe('PATCH /api/admin/course-catalogue/:code', () => {
  beforeEach(async () => {
    await createCourseRecord(validCourse());
  });

  it('replaces the rule lists wholesale', async () => {
    const response = await call('patch', '/api/admin/course-catalogue/CS410').send({
      name: 'Distributed Systems II',
      credits: 3,
      department: 'ECE',
      description: 'Rewritten.',
      minSemester: 6,
      minCredits: 100,
      prerequisites: [],
      eligiblePrograms: ['BTECH-ECE'],
      relevantPrograms: ['BTECH-ECE'],
    });

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({
      code: 'CS410',
      name: 'Distributed Systems II',
      credits: 3,
      department: { code: 'ECE' },
      minSemester: 6,
      prerequisites: [],
      eligiblePrograms: [{ code: 'BTECH-ECE' }],
    });
  });

  it('records the old and the new values', async () => {
    await call('patch', '/api/admin/course-catalogue/CS410').send(
      validCourse({ name: 'Renamed', code: undefined }),
    );

    const audit = await getTestPool().query<{
      old_value: { name: string };
      new_value: { name: string };
    }>(`SELECT old_value, new_value FROM audit_logs WHERE action = 'COURSE_UPDATED'`);
    expect(audit.rows[0]?.old_value.name).toBe('Distributed Systems');
    expect(audit.rows[0]?.new_value.name).toBe('Renamed');
  });

  it('answers 404 for a code that does not exist', async () => {
    const response = await call('patch', '/api/admin/course-catalogue/CS999').send(
      validCourse({ code: undefined }),
    );
    expect(response.status).toBe(404);
  });

  it('refuses making a course its own prerequisite', async () => {
    const response = await call('patch', '/api/admin/course-catalogue/CS410').send(
      validCourse({ code: undefined, prerequisites: ['CS410'] }),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Retirement and the window freeze
// ---------------------------------------------------------------------------

describe('retiring a course', () => {
  /** A course offered in a window at `status`. */
  async function offeredIn(status: string): Promise<string> {
    const pool = getTestPool();
    const departmentId = await createDepartment(pool);
    const courseId = await createCourse(pool, departmentId, { code: 'CS777', name: 'Offered' });
    const windowId = await createWindow(pool, { name: 'Fall 2026' });
    // Offerings are added while the window is still a draft; the freeze
    // triggers reject adding them afterwards.
    await createOffering(pool, windowId, courseId, 30);
    if (status !== 'DRAFT') {
      await setWindowStatus(pool, windowId, status);
    }
    return 'CS777';
  }

  const retire = (code: string) =>
    call('post', `/api/admin/course-catalogue/${code}/deactivate`).send({});

  it('retires a course that no window offers', async () => {
    await createCourseRecord(validCourse());

    const response = await retire('CS410');

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({ isActive: false, canDeactivate: false });
  });

  it('retires a course offered only in a DRAFT window', async () => {
    const code = await offeredIn('DRAFT');

    const response = await retire(code);

    // A draft is still being planned, so nobody is registering for it yet.
    expect(response.status).toBe(200);
    expect((dataOf(response) as AdminCourseRecord).isActive).toBe(false);
  });

  it.each(['OPEN', 'CLOSED', 'ALLOCATED'])(
    'refuses to retire a course offered in a %s window, naming the window',
    async (status) => {
      const code = await offeredIn(status);

      const response = await retire(code);

      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toContain('Fall 2026');
      expect((response.body as { message: string }).message).toContain(status.toLowerCase());
      // And the course is untouched.
      const record = (await catalogue()).courses.find((course) => course.code === code);
      expect(record?.isActive).toBe(true);
    },
  );

  it('reports canDeactivate: false for such a course, so the button can say so', async () => {
    const code = await offeredIn('OPEN');

    const record = (await catalogue()).courses.find((course) => course.code === code);

    expect(record).toMatchObject({
      canDeactivate: false,
      offeredIn: [{ windowName: 'Fall 2026', status: 'OPEN' }],
    });
  });

  it('is refused by the database trigger even when the service is bypassed', async () => {
    const code = await offeredIn('OPEN');
    const pool = getTestPool();

    // The service is the first guard; this is the backstop migration 0012 adds.
    await expect(
      pool.query('UPDATE courses SET is_active = false WHERE code = $1', [code]),
    ).rejects.toThrow(/no longer a draft/);
  });

  it('never deletes: the course and its offering survive retirement', async () => {
    const code = await offeredIn('DRAFT');
    await retire(code);

    const pool = getTestPool();
    const course = await pool.query('SELECT 1 FROM courses WHERE code = $1', [code]);
    const offering = await pool.query(
      `SELECT 1 FROM registration_window_courses rwc
       JOIN courses c ON c.id = rwc.course_id WHERE c.code = $1`,
      [code],
    );
    expect(course.rowCount).toBe(1);
    expect(offering.rowCount).toBe(1);
  });

  it('refuses retiring a course that is already retired', async () => {
    await createCourseRecord(validCourse());
    await retire('CS410');

    expect((await retire('CS410')).status).toBe(400);
  });

  it('reinstates a retired course', async () => {
    await createCourseRecord(validCourse());
    await retire('CS410');

    const response = await call('post', '/api/admin/course-catalogue/CS410/reactivate').send({});

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({ isActive: true, canDeactivate: true });
  });

  it('records both changes, with the reason', async () => {
    await createCourseRecord(validCourse());
    await call('post', '/api/admin/course-catalogue/CS410/deactivate').send({
      reason: 'Replaced by CS411',
    });
    await call('post', '/api/admin/course-catalogue/CS410/reactivate').send({});

    const audit = await getTestPool().query<{ action: string; reason: string | null }>(
      `SELECT action, reason FROM audit_logs
       WHERE action IN ('COURSE_DEACTIVATED', 'COURSE_REACTIVATED') ORDER BY created_at`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'COURSE_DEACTIVATED',
      'COURSE_REACTIVATED',
    ]);
    expect(audit.rows[0]?.reason).toBe('Replaced by CS411');
  });
});

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

describe('course CSV import', () => {
  const header = COURSE_CSV_COLUMNS.join(',');

  const row = (code: string, overrides: Partial<Record<string, string>> = {}) =>
    [
      code,
      overrides.name ?? `Course ${code}`,
      overrides.credits ?? '4',
      overrides.department ?? 'CSE',
      overrides.description ?? 'A course.',
      overrides.minSemester ?? '5',
      overrides.minCredits ?? '80',
      overrides.prerequisites ?? '',
      overrides.eligiblePrograms ?? 'BTECH-CSE',
      overrides.relevantPrograms ?? 'BTECH-CSE',
    ].join(',');

  const preview = (csv: string) =>
    call('post', '/api/admin/course-catalogue/import/preview').send({ csv });
  const confirm = (csv: string) => call('post', '/api/admin/course-catalogue/import').send({ csv });

  async function codes(): Promise<string[]> {
    return (await catalogue()).courses.map((course) => course.code);
  }

  it('previews a valid file and writes nothing', async () => {
    const csv = `${header}\n${row('CS410')}\n${row('CS411')}\n`;

    const report = dataOf(await preview(csv)) as CsvImportReport;

    expect(report.applied).toBe(false);
    expect(report.counts).toMatchObject({ total: 2, ok: 2, imported: 0 });
    expect(await codes()).toEqual(['CS201']);
  });

  it('imports every valid row on confirm', async () => {
    const csv = `${header}\n${row('CS410')}\n${row('CS411')}\n`;

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.counts.imported).toBe(2);
    // Courses send no e-mail, so there is no count to report.
    expect(report.invitationsSent).toBeNull();
    expect(await codes()).toEqual(['CS201', 'CS410', 'CS411']);
  });

  it('lets a prerequisite name a course an EARLIER row of the same file creates', async () => {
    const csv = [header, row('CS410'), row('CS411', { prerequisites: 'CS410' })].join('\n');

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.counts.imported).toBe(2);
    const created = (await catalogue()).courses.find((course) => course.code === 'CS411');
    expect(created?.prerequisites.map((item) => item.code)).toEqual(['CS410']);
  });

  it('calls out a code that already exists', async () => {
    const report = dataOf(await preview(`${header}\n${row('CS201')}\n`)) as CsvImportReport;

    expect(report.counts).toMatchObject({ ok: 0, duplicate: 1 });
  });

  it('calls out a code repeated within the file', async () => {
    const csv = [header, row('CS410'), row('CS410', { name: 'Again' })].join('\n');

    const report = dataOf(await preview(csv)) as CsvImportReport;

    expect(report.rows[0]?.verdict).toEqual({ kind: 'ok' });
    expect(report.rows[1]?.verdict.kind).toBe('duplicate');
  });

  it('rejects a relevance bonus for a programme that may not take the course', async () => {
    const csv = `${header}\n${row('CS410', { eligiblePrograms: 'BTECH-CSE', relevantPrograms: 'BTECH-ECE' })}\n`;

    const report = dataOf(await preview(csv)) as CsvImportReport;

    expect(report.rows[0]?.verdict).toMatchObject({
      kind: 'invalid',
      errors: [
        { column: 'relevantPrograms', message: expect.stringContaining('BTECH-ECE') as string },
      ],
    });
  });

  it('imports only the valid rows of a mixed file', async () => {
    const csv = [
      header,
      row('CS410'),
      row('nope', { credits: 'four' }),
      row('CS412', { department: 'XYZ' }),
    ].join('\n');

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.counts).toMatchObject({ total: 3, ok: 1, invalid: 2, imported: 1 });
    expect(await codes()).toEqual(['CS201', 'CS410']);
  });

  it('reads its own downloadable template', async () => {
    const template = buildCsvTemplate(COURSE_CSV_COLUMNS, COURSE_CSV_EXAMPLE);

    const report = dataOf(await preview(template)) as CsvImportReport;

    expect(report.fileError).toBeNull();
    expect(report.counts.total).toBe(1);
    // The example's description contains a comma, so this also proves the
    // template's quoting survives the round trip.
    expect(report.rows[0]?.values.description).toBe(COURSE_CSV_EXAMPLE[4]);
    expect(report.rows[0]?.values.code).toBe(COURSE_CSV_EXAMPLE[0]);
  });

  it('reports a header missing a column, and imports nothing', async () => {
    const report = dataOf(await confirm('code,name\nCS410,Something\n')) as CsvImportReport;

    expect(report.fileError).toMatch(/missing the column/);
    expect(report.counts.imported).toBe(0);
    expect(await codes()).toEqual(['CS201']);
  });

  it('writes one audit row for the batch', async () => {
    await confirm(`${header}\n${row('CS410')}\n${row('CS411')}\n`);

    const audit = await getTestPool().query<{ new_value: { imported: number; codes: string[] } }>(
      `SELECT new_value FROM audit_logs WHERE action = 'COURSES_IMPORTED'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.new_value).toMatchObject({ imported: 2, codes: ['CS410', 'CS411'] });
  });
});
