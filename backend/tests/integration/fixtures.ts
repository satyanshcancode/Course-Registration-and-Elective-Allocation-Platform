/**
 * Minimal row builders for integration tests. Each returns the generated id(s)
 * and accepts overrides for the columns a test cares about.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';

// Low cost factor: fast, and still a real bcrypt hash that passes the CHECK.
export const TEST_PASSWORD = 'Test@123';
export const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

let counter = 0;
const nextId = (): number => {
  counter += 1;
  return counter;
};

async function insertReturningId(
  pool: Pool,
  sql: string,
  values: unknown[],
  column = 'id',
): Promise<string> {
  const result = await pool.query<Record<string, string>>(sql, values);
  const id = result.rows[0]?.[column];
  if (id === undefined) {
    throw new Error(`Insert did not return ${column}`);
  }
  return id;
}

/** 1 -> "B", 26 -> "BA": department codes must be letters only. */
function toLetters(n: number): string {
  let value = n;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  } while (value > 0);
  return letters;
}

export function createDepartment(
  pool: Pool,
  overrides: { code?: string; name?: string } = {},
): Promise<string> {
  const n = nextId();
  return insertReturningId(
    pool,
    'INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING id',
    [overrides.code ?? `DEP${toLetters(n)}`, overrides.name ?? `Department ${n}`],
  );
}

export function createProgram(
  pool: Pool,
  departmentId: string,
  overrides: { code?: string; name?: string } = {},
): Promise<string> {
  const n = nextId();
  return insertReturningId(
    pool,
    'INSERT INTO programs (code, name, department_id) VALUES ($1, $2, $3) RETURNING id',
    [overrides.code ?? `PROG-${n}`, overrides.name ?? `Program ${n}`, departmentId],
  );
}

export function createUser(
  pool: Pool,
  overrides: { email?: string; role?: 'STUDENT' | 'ADMIN' } = {},
): Promise<string> {
  const n = nextId();
  // password_changed_at is backdated a minute because that is what real
  // accounts look like: one is created, and its sessions come later. Left at
  // now(), a session token minted by a test in the same second would carry an
  // `iat` below the account's cut-off and be refused — correctly, but for a
  // situation that only a test can create (see services/accountTokens.ts).
  return insertReturningId(
    pool,
    `INSERT INTO users (email, password_hash, role, password_changed_at)
     VALUES ($1, $2, $3, now() - interval '1 minute')
     RETURNING id`,
    [overrides.email ?? `user${n}@university.edu`, TEST_PASSWORD_HASH, overrides.role ?? 'STUDENT'],
  );
}

export async function createStudent(
  pool: Pool,
  programId: string,
  overrides: {
    semester?: number;
    creditsCompleted?: number;
    userId?: string;
    /** A readable name, for tests whose expectations name the student. */
    name?: string;
  } = {},
): Promise<string> {
  const userId = overrides.userId ?? (await createUser(pool));
  const n = nextId();
  return insertReturningId(
    pool,
    `INSERT INTO students
       (user_id, roll_number, name, program_id, semester, credits_completed, expected_graduation_term)
     VALUES ($1, $2, $3, $4, $5, $6, '2028-SPRING')
     RETURNING user_id`,
    [
      userId,
      `ROLL${String(n).padStart(4, '0')}`,
      overrides.name ?? `Student ${n}`,
      programId,
      overrides.semester ?? 5,
      overrides.creditsCompleted ?? 90,
    ],
    'user_id',
  );
}

export interface CourseOverrides {
  code?: string;
  name?: string;
  credits?: number;
  description?: string;
  minSemester?: number;
  minCredits?: number;
}

export function createCourse(
  pool: Pool,
  departmentId: string,
  overrides: CourseOverrides = {},
): Promise<string> {
  const n = nextId();
  return insertReturningId(
    pool,
    `INSERT INTO courses (code, name, department_id, credits, description, min_semester, min_credits)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      overrides.code ?? `TST${String(n % 1000).padStart(3, '0')}`,
      overrides.name ?? `Course ${n}`,
      departmentId,
      overrides.credits ?? 4,
      overrides.description ?? '',
      overrides.minSemester ?? 1,
      overrides.minCredits ?? 0,
    ],
  );
}

export async function addPrerequisite(
  pool: Pool,
  courseId: string,
  prerequisiteCourseId: string,
): Promise<void> {
  await pool.query(
    'INSERT INTO course_prerequisites (course_id, prerequisite_course_id) VALUES ($1, $2)',
    [courseId, prerequisiteCourseId],
  );
}

export async function restrictToProgram(
  pool: Pool,
  courseId: string,
  programId: string,
): Promise<void> {
  await pool.query('INSERT INTO course_eligible_programs (course_id, program_id) VALUES ($1, $2)', [
    courseId,
    programId,
  ]);
}

export async function markCompleted(
  pool: Pool,
  studentId: string,
  courseId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO student_completed_courses (student_id, course_id, completed_term)
     VALUES ($1, $2, '2025-FALL')`,
    [studentId, courseId],
  );
}

export async function createWaitlistEntry(
  pool: Pool,
  studentId: string,
  windowId: string,
  courseId: string,
  position: number,
  status: 'WAITING' | 'PROMOTED' | 'REMOVED' = 'WAITING',
): Promise<void> {
  await pool.query(
    `INSERT INTO waitlist_entries (student_id, window_id, course_id, position, status, promoted_at, removed_at)
     VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $5 = 'PROMOTED' THEN now() END,
             CASE WHEN $5 = 'REMOVED' THEN now() END)`,
    [studentId, windowId, courseId, position, status],
  );
}

export function createWindow(
  pool: Pool,
  overrides: {
    name?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    config?: unknown;
    method?: string;
  } = {},
): Promise<string> {
  const n = nextId();
  return insertReturningId(
    pool,
    `INSERT INTO registration_windows
       (name, term, starts_at, ends_at, status, allocation_method, config, random_seed)
     VALUES ($1, '2026-FALL', $4::timestamptz, $5::timestamptz, $2, $6, $3, 42)
     RETURNING id`,
    [
      overrides.name ?? `Window ${n}`,
      overrides.status ?? 'DRAFT',
      overrides.config ?? DEFAULT_PREFERENCE_PRIORITY_CONFIG,
      overrides.startsAt ?? new Date().toISOString(),
      overrides.endsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString(),
      overrides.method ?? 'PREFERENCE_PRIORITY',
    ],
  );
}

/**
 * Moves a window to a later status. Offerings must already exist: the freeze
 * trigger (migration 0008) rejects adding or removing them afterwards, which
 * is exactly what an admin faces.
 */
export async function setWindowStatus(pool: Pool, windowId: string, status: string): Promise<void> {
  await pool.query('UPDATE registration_windows SET status = $2 WHERE id = $1', [windowId, status]);
}

export async function createOffering(
  pool: Pool,
  windowId: string,
  courseId: string,
  capacity = 2,
): Promise<void> {
  await pool.query(
    'INSERT INTO registration_window_courses (window_id, course_id, capacity) VALUES ($1, $2, $3)',
    [windowId, courseId, capacity],
  );
}

export function createDraftSubmission(
  pool: Pool,
  studentId: string,
  windowId: string,
  idempotencyKey: string | null = null,
): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO preference_submissions (student_id, window_id, idempotency_key)
     VALUES ($1, $2, $3) RETURNING id`,
    [studentId, windowId, idempotencyKey],
  );
}

export async function addPreference(
  pool: Pool,
  submissionId: string,
  windowId: string,
  courseId: string,
  rank: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO preference_items (submission_id, window_id, course_id, rank)
     VALUES ($1, $2, $3, $4)`,
    [submissionId, windowId, courseId, rank],
  );
}

export async function markSubmitted(
  pool: Pool,
  submissionId: string,
  idempotencyKey: string,
): Promise<void> {
  await pool.query(
    `UPDATE preference_submissions
     SET status = 'SUBMITTED', idempotency_key = $2, submitted_at = now(),
         submission_sequence = nextval('preference_submission_sequence')
     WHERE id = $1`,
    [submissionId, idempotencyKey],
  );
}

export function createEnrollment(
  pool: Pool,
  studentId: string,
  windowId: string,
  courseId: string,
  status: 'ACTIVE' | 'DROPPED' = 'ACTIVE',
): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO enrollments (student_id, window_id, course_id, status, source, dropped_at)
     VALUES ($1, $2, $3, $4, 'ALLOCATION', CASE WHEN $4 = 'DROPPED' THEN now() END)
     RETURNING id`,
    [studentId, windowId, courseId, status],
  );
}

/** A window with one offered course and a student: the usual starting point. */
export async function createScenario(pool: Pool, capacity = 2) {
  const departmentId = await createDepartment(pool);
  const programId = await createProgram(pool, departmentId);
  const courseId = await createCourse(pool, departmentId);
  const otherCourseId = await createCourse(pool, departmentId);
  const windowId = await createWindow(pool);
  await createOffering(pool, windowId, courseId, capacity);
  await createOffering(pool, windowId, otherCourseId, capacity);
  const studentId = await createStudent(pool, programId);
  return { departmentId, programId, courseId, otherCourseId, windowId, studentId };
}

export async function allocatedCount(
  pool: Pool,
  windowId: string,
  courseId: string,
): Promise<number> {
  const result = await pool.query<{ allocated_count: number }>(
    `SELECT allocated_count FROM registration_window_courses
     WHERE window_id = $1 AND course_id = $2`,
    [windowId, courseId],
  );
  return result.rows[0]?.allocated_count ?? Number.NaN;
}
