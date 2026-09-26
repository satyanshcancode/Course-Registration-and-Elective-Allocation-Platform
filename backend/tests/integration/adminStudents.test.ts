/**
 * Student records over HTTP: validation, uniqueness, authorisation, and the
 * two-step CSV import.
 */
import {
  buildCsvTemplate,
  STUDENT_CSV_COLUMNS,
  STUDENT_CSV_EXAMPLE,
  type AdminStudentDetail,
  type AdminStudentPage,
  type CreateStudentResult,
  type CsvImportReport,
} from '@course-reg/shared';
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
import { ALLOWED_ORIGIN, buildAppWithMail, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

type App = ReturnType<typeof buildAppWithMail>['app'];

interface World {
  app: App;
  mailer: MemoryMailer;
  adminId: string;
  studentId: string;
  admin: string;
  student: string;
  programs: string[];
  courses: string[];
}

let world: World;

beforeEach(async () => {
  const pool = getTestPool();
  const { app, mailer } = buildAppWithMail();
  const departmentId = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
  const cse = await createProgram(pool, departmentId, { code: 'BTECH-CSE', name: 'B.Tech CSE' });
  await createProgram(pool, departmentId, { code: 'BTECH-ECE', name: 'B.Tech ECE' });
  await createCourse(pool, departmentId, { code: 'CS201', name: 'Data Structures' });
  await createCourse(pool, departmentId, { code: 'MA201', name: 'Linear Algebra' });

  const adminId = await createUser(pool, { email: 'registrar@test.edu', role: 'ADMIN' });
  const studentId = await createStudent(pool, cse);

  world = {
    app,
    mailer,
    adminId,
    studentId,
    admin: sessionFor(adminId, 'ADMIN'),
    student: sessionFor(studentId, 'STUDENT'),
    programs: ['BTECH-CSE', 'BTECH-ECE'],
    courses: ['CS201', 'MA201'],
  };
});

function validStudent(overrides: Record<string, unknown> = {}) {
  return {
    rollNumber: 'CSE26001',
    name: 'Asha Menon',
    email: 'asha.menon@test.edu',
    program: 'BTECH-CSE',
    semester: 5,
    creditsCompleted: 88,
    expectedGraduationTerm: '2028-SPRING',
    completedCourses: ['CS201'],
    ...overrides,
  };
}

const asAdmin = (method: 'post' | 'patch' | 'get', path: string) =>
  request(world.app)[method](path).set('Origin', ALLOWED_ORIGIN).set('Cookie', world.admin);

const create = (body: unknown) => asAdmin('post', '/api/admin/students').send(body as object);

// ---------------------------------------------------------------------------

describe('POST /api/admin/students', () => {
  it('creates the account, records it, and e-mails the invitation', async () => {
    const response = await create(validStudent());

    expect(response.status).toBe(201);
    const result = dataOf(response) as CreateStudentResult;
    expect(result.student).toMatchObject({
      rollNumber: 'CSE26001',
      name: 'Asha Menon',
      email: 'asha.menon@test.edu',
      program: { code: 'BTECH-CSE' },
      status: 'INVITED',
      invitationPending: true,
    });
    expect(world.mailer.lastTo('asha.menon@test.edu')?.text).toMatch(/\/activate\?token=/);
  });

  it('stores the completed courses the record was created with', async () => {
    await create(validStudent({ completedCourses: ['CS201', 'MA201'] }));

    const detail = await asAdmin('get', '/api/admin/students/CSE26001');
    expect((dataOf(detail) as AdminStudentDetail).completedCourses.map((c) => c.code)).toEqual([
      'CS201',
      'MA201',
    ]);
  });

  it('refuses a duplicate roll number, naming the field', async () => {
    await create(validStudent());

    const response = await create(validStudent({ email: 'other@test.edu' }));

    expect(response.status).toBe(409);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe(
      'rollNumber',
    );
  });

  it('refuses a duplicate e-mail, naming the field', async () => {
    await create(validStudent());

    const response = await create(validStudent({ rollNumber: 'CSE26002' }));

    expect(response.status).toBe(409);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe('email');
  });

  it('treats e-mail case-insensitively, as the column does', async () => {
    await create(validStudent());

    const response = await create(
      validStudent({ rollNumber: 'CSE26002', email: 'ASHA.MENON@TEST.EDU' }),
    );

    expect(response.status).toBe(409);
  });

  it('rejects every invalid field at once', async () => {
    const response = await create(
      validStudent({
        rollNumber: 'x',
        name: '',
        email: 'not-an-email',
        semester: 99,
        creditsCompleted: -5,
        expectedGraduationTerm: 'soon',
      }),
    );

    expect(response.status).toBe(400);
    const fields = (response.body as { errors?: { field: string }[] }).errors?.map(
      (error) => error.field,
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        'rollNumber',
        'name',
        'email',
        'semester',
        'creditsCompleted',
        'expectedGraduationTerm',
      ]),
    );
  });

  it('refuses a programme that does not exist', async () => {
    const response = await create(validStudent({ program: 'BTECH-XYZ' }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('creates nothing when the invitation cannot be sent', async () => {
    // Creating an account nobody can be told about is worse than not creating it.
    world.mailer.failNext();

    const response = await create(validStudent());

    expect(response.status).toBe(500);
    const existing = await getTestPool().query('SELECT 1 FROM students WHERE roll_number = $1', [
      'CSE26001',
    ]);
    expect(existing.rowCount).toBe(0);
  });

  it('writes an audit row naming the actor', async () => {
    await create(validStudent());

    const audit = await getTestPool().query<{ action: string; actor_user_id: string }>(
      `SELECT action, actor_user_id FROM audit_logs WHERE action = 'STUDENT_CREATED'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.actor_user_id).toBe(world.adminId);
  });
});

describe('PATCH /api/admin/students/:rollNumber', () => {
  it('saves every field, including a replaced completed-courses list', async () => {
    await create(validStudent());

    const response = await asAdmin('patch', '/api/admin/students/CSE26001').send(
      validStudent({ semester: 6, creditsCompleted: 110, completedCourses: ['MA201'] }),
    );

    expect(response.status).toBe(200);
    const detail = await asAdmin('get', '/api/admin/students/CSE26001');
    const data = dataOf(detail) as AdminStudentDetail;
    expect(data.student).toMatchObject({ semester: 6, creditsCompleted: 110 });
    expect(data.completedCourses.map((course) => course.code)).toEqual(['MA201']);
  });

  it('records the old and the new values', async () => {
    await create(validStudent());
    await asAdmin('patch', '/api/admin/students/CSE26001').send(validStudent({ semester: 7 }));

    const audit = await getTestPool().query<{
      old_value: { semester: number };
      new_value: { semester: number };
    }>(`SELECT old_value, new_value FROM audit_logs WHERE action = 'STUDENT_UPDATED'`);
    expect(audit.rows[0]?.old_value.semester).toBe(5);
    expect(audit.rows[0]?.new_value.semester).toBe(7);
  });

  it('answers 404 for a roll number that does not exist', async () => {
    const response = await asAdmin('patch', '/api/admin/students/NOSUCH99').send(validStudent());
    expect(response.status).toBe(404);
  });

  it('refuses a roll number that belongs to somebody else', async () => {
    await create(validStudent());
    await create(validStudent({ rollNumber: 'CSE26002', email: 'other@test.edu' }));

    const response = await asAdmin('patch', '/api/admin/students/CSE26002').send(
      validStudent({ rollNumber: 'CSE26001', email: 'other@test.edu' }),
    );

    expect(response.status).toBe(409);
  });
});

describe('GET /api/admin/students', () => {
  beforeEach(async () => {
    await create(validStudent());
    await create(
      validStudent({
        rollNumber: 'ECE26001',
        email: 'ravi@test.edu',
        name: 'Ravi Shah',
        program: 'BTECH-ECE',
        semester: 3,
        completedCourses: [],
      }),
    );
  });

  it('lists students with their derived status', async () => {
    const response = await asAdmin('get', '/api/admin/students');

    expect(response.status).toBe(200);
    const page = dataOf(response) as AdminStudentPage;
    // The two created here, plus the bare fixture student.
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.rollNumber)).toContain('CSE26001');
    expect(page.programs.map((program) => program.code)).toEqual(['BTECH-CSE', 'BTECH-ECE']);
  });

  it('searches name, roll number and e-mail', async () => {
    for (const term of ['Ravi', 'ECE26001', 'ravi@test.edu']) {
      const response = await asAdmin(
        'get',
        `/api/admin/students?search=${encodeURIComponent(term)}`,
      );
      const page = dataOf(response) as AdminStudentPage;
      expect(page.items.map((item) => item.rollNumber)).toEqual(['ECE26001']);
    }
  });

  it('filters by programme and by semester', async () => {
    const byProgram = dataOf(
      await asAdmin('get', '/api/admin/students?program=BTECH-ECE'),
    ) as AdminStudentPage;
    expect(byProgram.items.map((item) => item.rollNumber)).toEqual(['ECE26001']);

    const bySemester = dataOf(
      await asAdmin('get', '/api/admin/students?semester=3'),
    ) as AdminStudentPage;
    expect(bySemester.items.map((item) => item.rollNumber)).toEqual(['ECE26001']);
  });

  it('filters by status', async () => {
    const invited = dataOf(
      await asAdmin('get', '/api/admin/students?status=INVITED'),
    ) as AdminStudentPage;
    expect(invited.items.map((item) => item.rollNumber).sort()).toEqual(['CSE26001', 'ECE26001']);

    // The fixture student has a password, so they are ACTIVE.
    const active = dataOf(
      await asAdmin('get', '/api/admin/students?status=ACTIVE'),
    ) as AdminStudentPage;
    expect(active.total).toBe(1);
  });

  it('pages, reporting the total across all pages', async () => {
    const response = await asAdmin('get', '/api/admin/students?pageSize=2&page=2');

    const page = dataOf(response) as AdminStudentPage;
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3, pageCount: 2 });
    expect(page.items).toHaveLength(1);
  });

  it('rejects an unknown status rather than ignoring it', async () => {
    expect((await asAdmin('get', '/api/admin/students?status=NOPE')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

describe('authorisation', () => {
  const ENDPOINTS: { method: 'get' | 'post' | 'patch'; path: string }[] = [
    { method: 'get', path: '/api/admin/students' },
    { method: 'get', path: '/api/admin/students/CSE26001' },
    { method: 'post', path: '/api/admin/students' },
    { method: 'patch', path: '/api/admin/students/CSE26001' },
    { method: 'post', path: '/api/admin/students/CSE26001/invitation' },
    { method: 'post', path: '/api/admin/students/CSE26001/deactivate' },
    { method: 'post', path: '/api/admin/students/CSE26001/reactivate' },
    { method: 'post', path: '/api/admin/students/import/preview' },
    { method: 'post', path: '/api/admin/students/import' },
    { method: 'get', path: '/api/admin/reference-data' },
    { method: 'get', path: '/api/admin/course-catalogue' },
    { method: 'post', path: '/api/admin/course-catalogue' },
    { method: 'patch', path: '/api/admin/course-catalogue/CS201' },
    { method: 'post', path: '/api/admin/course-catalogue/CS201/deactivate' },
    { method: 'post', path: '/api/admin/course-catalogue/CS201/reactivate' },
    { method: 'post', path: '/api/admin/course-catalogue/import/preview' },
    { method: 'post', path: '/api/admin/course-catalogue/import' },
  ];

  it.each(ENDPOINTS)('answers 403 for a student on $method $path', async ({ method, path }) => {
    const response = await request(world.app)
      [method](path)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', world.student)
      .send({});

    expect(response.status).toBe(403);
  });

  it.each(ENDPOINTS)('answers 401 with no session on $method $path', async ({ method, path }) => {
    const response = await request(world.app)[method](path).set('Origin', ALLOWED_ORIGIN).send({});

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

describe('student CSV import', () => {
  const header = STUDENT_CSV_COLUMNS.join(',');

  const row = (
    rollNumber: string,
    email: string,
    overrides: Partial<Record<string, string>> = {},
  ) =>
    [
      overrides.rollNumber ?? rollNumber,
      overrides.name ?? 'Imported Student',
      overrides.email ?? email,
      overrides.program ?? 'BTECH-CSE',
      overrides.semester ?? '5',
      overrides.creditsCompleted ?? '88',
      overrides.expectedGraduationTerm ?? '2028-SPRING',
      overrides.completedCourses ?? 'CS201',
    ].join(',');

  const preview = (csv: string) =>
    asAdmin('post', '/api/admin/students/import/preview').send({ csv });
  const confirm = (csv: string) => asAdmin('post', '/api/admin/students/import').send({ csv });

  async function countStudents(): Promise<number> {
    const result = await getTestPool().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM students',
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it('previews a valid file and writes nothing', async () => {
    const csv = `${header}\n${row('IMP0001', 'one@test.edu')}\n${row('IMP0002', 'two@test.edu')}\n`;
    const before = await countStudents();

    const response = await preview(csv);

    expect(response.status).toBe(200);
    const report = dataOf(response) as CsvImportReport;
    expect(report.applied).toBe(false);
    expect(report.counts).toMatchObject({ total: 2, ok: 2, duplicate: 0, invalid: 0, imported: 0 });
    expect(await countStudents()).toBe(before);
    expect(world.mailer.sent).toHaveLength(0);
  });

  it('imports every valid row on confirm and invites each one', async () => {
    const csv = `${header}\n${row('IMP0001', 'one@test.edu')}\n${row('IMP0002', 'two@test.edu')}\n`;

    const response = await confirm(csv);

    const report = dataOf(response) as CsvImportReport;
    expect(report.applied).toBe(true);
    expect(report.counts.imported).toBe(2);
    expect(report.invitationsSent).toBe(2);
    expect(world.mailer.lastTo('one@test.edu')?.text).toMatch(/\/activate\?token=/);
    expect(world.mailer.lastTo('two@test.edu')?.text).toMatch(/\/activate\?token=/);

    const listed = dataOf(
      await asAdmin('get', '/api/admin/students?search=IMP'),
    ) as AdminStudentPage;
    expect(listed.items.map((item) => item.rollNumber).sort()).toEqual(['IMP0001', 'IMP0002']);
  });

  it('judges a mixed file row by row, and writes nothing on the preview', async () => {
    const csv = [
      header,
      row('IMP0001', 'one@test.edu'),
      row('bad', 'not-an-email', { semester: '99' }),
      row('IMP0003', 'three@test.edu', { program: 'BTECH-NOPE' }),
    ].join('\n');
    const before = await countStudents();

    const report = dataOf(await preview(csv)) as CsvImportReport;

    expect(report.counts).toMatchObject({ total: 3, ok: 1, invalid: 2, imported: 0 });
    expect(report.rows[0]?.verdict).toEqual({ kind: 'ok' });
    expect(report.rows[1]?.verdict.kind).toBe('invalid');
    expect(report.rows[2]?.verdict.kind).toBe('invalid');
    expect(await countStudents()).toBe(before);
  });

  it('imports only the valid rows of a mixed file, and reports the rest', async () => {
    const csv = [
      header,
      row('IMP0001', 'one@test.edu'),
      row('bad', 'not-an-email'),
      row('IMP0003', 'three@test.edu'),
    ].join('\n');

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.counts).toMatchObject({ total: 3, ok: 2, invalid: 1, imported: 2 });
    // Nothing is imported halfway and silently: the bad row is listed.
    expect(report.rows[1]?.verdict.kind).toBe('invalid');
    const listed = dataOf(
      await asAdmin('get', '/api/admin/students?search=IMP'),
    ) as AdminStudentPage;
    expect(listed.total).toBe(2);
  });

  it('calls out a row whose roll number already exists', async () => {
    await create(validStudent({ rollNumber: 'IMP0001', email: 'taken@test.edu' }));
    const csv = `${header}\n${row('IMP0001', 'fresh@test.edu')}\n`;

    const report = dataOf(await preview(csv)) as CsvImportReport;

    expect(report.counts).toMatchObject({ total: 1, ok: 0, duplicate: 1 });
    expect(report.rows[0]?.verdict).toMatchObject({
      kind: 'duplicate',
      message: expect.stringContaining('IMP0001') as string,
    });
  });

  it('calls out BOTH rows when one file repeats a roll number', async () => {
    const csv = [header, row('IMP0001', 'one@test.edu'), row('IMP0001', 'two@test.edu')].join('\n');

    const report = dataOf(await preview(csv)) as CsvImportReport;

    // The first is importable, the second is the duplicate — and neither is a
    // constraint violation discovered halfway through writing.
    expect(report.rows[0]?.verdict).toEqual({ kind: 'ok' });
    expect(report.rows[1]?.verdict.kind).toBe('duplicate');
    expect(report.counts).toMatchObject({ ok: 1, duplicate: 1 });
  });

  it('imports in ONE transaction: a failure part-way leaves nothing behind', async () => {
    // The completed course is deleted between the preview and the confirm, so
    // the write of the SECOND row fails inside the transaction.
    const csv = [header, row('IMP0001', 'one@test.edu'), row('IMP0002', 'two@test.edu')].join('\n');
    expect((dataOf(await preview(csv)) as CsvImportReport).counts.ok).toBe(2);

    const pool = getTestPool();
    // A trigger that rejects the second insert, simulating a mid-import failure.
    await pool.query(`
      CREATE FUNCTION fail_on_second_student() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.roll_number = 'IMP0002' THEN
          RAISE EXCEPTION 'simulated failure';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER students_fail_second BEFORE INSERT ON students
        FOR EACH ROW EXECUTE FUNCTION fail_on_second_student();
    `);

    try {
      const before = await countStudents();
      const response = await confirm(csv);

      expect(response.status).toBe(500);
      // Neither row was written: the first is rolled back with the second.
      expect(await countStudents()).toBe(before);
    } finally {
      await pool.query('DROP TRIGGER students_fail_second ON students');
      await pool.query('DROP FUNCTION fail_on_second_student()');
    }
  });

  it('reads its own downloadable template', async () => {
    const template = buildCsvTemplate(STUDENT_CSV_COLUMNS, STUDENT_CSV_EXAMPLE);

    const report = dataOf(await preview(template)) as CsvImportReport;

    // The example names a programme and courses this world does not have, so it
    // reads as one complete row with named problems — never as a parse failure.
    expect(report.fileError).toBeNull();
    expect(report.counts.total).toBe(1);
    expect(report.rows[0]?.values.rollNumber).toBe(STUDENT_CSV_EXAMPLE[0]);
  });

  it('reports a header that is missing a column, and imports nothing', async () => {
    const report = dataOf(await confirm('rollNumber,name\nIMP0001,Someone\n')) as CsvImportReport;

    expect(report.fileError).toMatch(/missing the column/);
    expect(report.rows).toHaveLength(0);
    expect(report.counts.imported).toBe(0);
  });

  it('reports an unreadable file by line, and imports nothing', async () => {
    const csv = `${header}\n"unclosed,quote\n`;

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.fileError).toMatch(/Line \d+: .*quoted value/);
    expect(report.counts.imported).toBe(0);
  });

  it('rejects an empty upload', async () => {
    expect((await preview('')).status).toBe(400);
  });

  it('re-judges the file on confirm rather than trusting the preview', async () => {
    const csv = `${header}\n${row('IMP0001', 'one@test.edu')}\n`;
    expect((dataOf(await preview(csv)) as CsvImportReport).counts.ok).toBe(1);

    // The roll number is taken between the preview and the confirm.
    await create(validStudent({ rollNumber: 'IMP0001', email: 'sneaked@test.edu' }));

    const report = dataOf(await confirm(csv)) as CsvImportReport;

    expect(report.counts).toMatchObject({ ok: 0, duplicate: 1, imported: 0 });
  });
});
