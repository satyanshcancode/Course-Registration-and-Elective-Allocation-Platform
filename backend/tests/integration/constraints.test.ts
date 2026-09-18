/**
 * Proves the database itself rejects invalid data, independent of any
 * application code. Each test names the constraint it expects to fire.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { PG_ERROR, type PgErrorCode } from '../../src/database/pgErrors.js';
import {
  addPreference,
  allocatedCount,
  createDraftSubmission,
  createEnrollment,
  createProgram,
  createScenario,
  createStudent,
  createUser,
  createWindow,
  markSubmitted,
} from './fixtures.js';
import { getTestPool } from './testDatabase.js';

const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';

/** Asserts that `promise` rejects with the given SQLSTATE (and constraint name). */
async function expectDatabaseError(
  promise: Promise<unknown>,
  code: PgErrorCode,
  constraint?: string,
): Promise<void> {
  const expected: Record<string, string> = { code };
  if (constraint) {
    expected.constraint = constraint;
  }
  await expect(promise).rejects.toMatchObject(expected);
}

describe('seat capacity', () => {
  it('rejects a negative capacity', async () => {
    const pool = getTestPool();
    const { windowId, courseId } = await createScenario(pool);

    // -1 breaks both "capacity >= 0" and "allocated_count <= capacity";
    // PostgreSQL reports whichever CHECK it evaluates first.
    await expect(
      pool.query(
        'UPDATE registration_window_courses SET capacity = -1 WHERE window_id = $1 AND course_id = $2',
        [windowId, courseId],
      ),
    ).rejects.toMatchObject({
      code: PG_ERROR.CHECK_VIOLATION,
      constraint: expect.stringMatching(
        /^registration_window_courses_(capacity|allocated_count)_check$/,
      ) as unknown,
    });
  });

  it('rejects allocated_count above capacity', async () => {
    const pool = getTestPool();
    const { windowId, courseId } = await createScenario(pool, 2);

    await expectDatabaseError(
      pool.query(
        'UPDATE registration_window_courses SET allocated_count = 3 WHERE window_id = $1 AND course_id = $2',
        [windowId, courseId],
      ),
      PG_ERROR.CHECK_VIOLATION,
      'registration_window_courses_allocated_count_check',
    );
  });

  it('rejects shrinking capacity below the seats already taken', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool, 2);
    await createEnrollment(pool, studentId, windowId, courseId);

    await expectDatabaseError(
      pool.query(
        'UPDATE registration_window_courses SET capacity = 0 WHERE window_id = $1 AND course_id = $2',
        [windowId, courseId],
      ),
      PG_ERROR.CHECK_VIOLATION,
      'registration_window_courses_allocated_count_check',
    );
  });

  it('keeps allocated_count in sync with ACTIVE enrollments and refuses to overbook', async () => {
    const pool = getTestPool();
    const { windowId, courseId, programId, studentId } = await createScenario(pool, 2);
    const second = await createStudent(pool, programId);
    const third = await createStudent(pool, programId);

    const enrollmentId = await createEnrollment(pool, studentId, windowId, courseId);
    await createEnrollment(pool, second, windowId, courseId);
    expect(await allocatedCount(pool, windowId, courseId)).toBe(2);

    // The third seat does not exist: the trigger's increment violates the CHECK.
    await expectDatabaseError(
      createEnrollment(pool, third, windowId, courseId),
      PG_ERROR.CHECK_VIOLATION,
      'registration_window_courses_allocated_count_check',
    );
    expect(await allocatedCount(pool, windowId, courseId)).toBe(2);

    // Dropping frees the seat, and the waiting student can take it.
    await pool.query(
      "UPDATE enrollments SET status = 'DROPPED', dropped_at = now() WHERE id = $1",
      [enrollmentId],
    );
    expect(await allocatedCount(pool, windowId, courseId)).toBe(1);
    await createEnrollment(pool, third, windowId, courseId);
    expect(await allocatedCount(pool, windowId, courseId)).toBe(2);
  });

  it('serialises concurrent enrollments so the last seat is taken exactly once', async () => {
    const pool = getTestPool();
    const { windowId, courseId, programId } = await createScenario(pool, 3);
    const students = await Promise.all(
      Array.from({ length: 8 }, () => createStudent(pool, programId)),
    );

    const attempts = await Promise.allSettled(
      students.map((studentId) => createEnrollment(pool, studentId, windowId, courseId)),
    );

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(3);
    expect(await allocatedCount(pool, windowId, courseId)).toBe(3);
  });
});

describe('preference submissions', () => {
  it('rejects the same course twice in one submission', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool);
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    await addPreference(pool, submissionId, windowId, courseId, 1);

    await expectDatabaseError(
      addPreference(pool, submissionId, windowId, courseId, 2),
      PG_ERROR.UNIQUE_VIOLATION,
      'preference_items_submission_course_key',
    );
  });

  it('rejects the same rank twice in one submission', async () => {
    const pool = getTestPool();
    const { windowId, courseId, otherCourseId, studentId } = await createScenario(pool);
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    await addPreference(pool, submissionId, windowId, courseId, 1);

    await expectDatabaseError(
      addPreference(pool, submissionId, windowId, otherCourseId, 1),
      PG_ERROR.UNIQUE_VIOLATION,
      'preference_items_pkey',
    );
  });

  it('rejects ranks outside 1-5', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool);
    const submissionId = await createDraftSubmission(pool, studentId, windowId);

    await expectDatabaseError(
      addPreference(pool, submissionId, windowId, courseId, 6),
      PG_ERROR.CHECK_VIOLATION,
      'preference_items_rank_check',
    );
  });

  it('rejects ranking a course that is not offered in the window', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool);
    const otherWindowId = await createWindow(pool);
    const submissionId = await createDraftSubmission(pool, studentId, otherWindowId);

    await expectDatabaseError(
      addPreference(pool, submissionId, otherWindowId, courseId, 1),
      PG_ERROR.FOREIGN_KEY_VIOLATION,
      'preference_items_offering_fkey',
    );
    // Nor can an item claim a different window than its submission.
    await expectDatabaseError(
      addPreference(pool, submissionId, windowId, courseId, 1),
      PG_ERROR.FOREIGN_KEY_VIOLATION,
      'preference_items_submission_fkey',
    );
  });

  it('rejects two submissions from one student in one window', async () => {
    const pool = getTestPool();
    const { windowId, studentId } = await createScenario(pool);
    await createDraftSubmission(pool, studentId, windowId);

    await expectDatabaseError(
      createDraftSubmission(pool, studentId, windowId),
      PG_ERROR.UNIQUE_VIOLATION,
      'preference_submissions_student_window_key',
    );
  });

  it('rejects a reused idempotency key', async () => {
    const pool = getTestPool();
    const { windowId, programId, studentId } = await createScenario(pool);
    const otherStudent = await createStudent(pool, programId);
    await createDraftSubmission(pool, studentId, windowId, KEY_A);

    await expectDatabaseError(
      createDraftSubmission(pool, otherStudent, windowId, KEY_A),
      PG_ERROR.UNIQUE_VIOLATION,
      'preference_submissions_idempotency_key_key',
    );
  });

  it('requires key, time and sequence once SUBMITTED', async () => {
    const pool = getTestPool();
    const { windowId, studentId } = await createScenario(pool);
    const submissionId = await createDraftSubmission(pool, studentId, windowId);

    await expectDatabaseError(
      pool.query("UPDATE preference_submissions SET status = 'SUBMITTED' WHERE id = $1", [
        submissionId,
      ]),
      PG_ERROR.CHECK_VIOLATION,
      'preference_submissions_submitted_fields_check',
    );
  });

  it('freezes a submission and its items once submitted', async () => {
    const pool = getTestPool();
    const { windowId, courseId, otherCourseId, studentId } = await createScenario(pool);
    const submissionId = await createDraftSubmission(pool, studentId, windowId);
    await addPreference(pool, submissionId, windowId, courseId, 1);
    await markSubmitted(pool, submissionId, KEY_B);

    await expectDatabaseError(
      addPreference(pool, submissionId, windowId, otherCourseId, 2),
      PG_ERROR.OBJECT_NOT_IN_PREREQUISITE_STATE,
    );
    await expectDatabaseError(
      pool.query("UPDATE preference_submissions SET status = 'DRAFT' WHERE id = $1", [
        submissionId,
      ]),
      PG_ERROR.OBJECT_NOT_IN_PREREQUISITE_STATE,
    );
    // Deleting the whole submission (e.g. student removed) still cascades.
    await pool.query('DELETE FROM preference_submissions WHERE id = $1', [submissionId]);
    const items = await pool.query('SELECT 1 FROM preference_items WHERE submission_id = $1', [
      submissionId,
    ]);
    expect(items.rowCount).toBe(0);
  });
});

describe('enrollments and waitlist', () => {
  it('rejects two ACTIVE enrollments for the same student and course', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool, 5);
    await createEnrollment(pool, studentId, windowId, courseId);

    await expectDatabaseError(
      createEnrollment(pool, studentId, windowId, courseId),
      PG_ERROR.UNIQUE_VIOLATION,
      'enrollments_one_active_per_student_course_idx',
    );
  });

  it('allows re-enrolling after a drop (history is kept)', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool, 5);
    await createEnrollment(pool, studentId, windowId, courseId, 'DROPPED');

    await expect(createEnrollment(pool, studentId, windowId, courseId)).resolves.toBeTypeOf(
      'string',
    );
  });

  it('rejects a dropped enrollment without a drop time', async () => {
    const pool = getTestPool();
    const { windowId, courseId, studentId } = await createScenario(pool, 5);
    const enrollmentId = await createEnrollment(pool, studentId, windowId, courseId);

    await expectDatabaseError(
      pool.query("UPDATE enrollments SET status = 'DROPPED' WHERE id = $1", [enrollmentId]),
      PG_ERROR.CHECK_VIOLATION,
      'enrollments_dropped_at_check',
    );
  });

  it('allows one WAITING entry per student per course and unique positions', async () => {
    const pool = getTestPool();
    const { windowId, courseId, programId, studentId } = await createScenario(pool);
    const other = await createStudent(pool, programId);
    const insert = (student: string, position: number) =>
      pool.query(
        `INSERT INTO waitlist_entries (student_id, window_id, course_id, score, position)
         VALUES ($1, $2, $3, 100, $4)`,
        [student, windowId, courseId, position],
      );
    await insert(studentId, 1);

    await expectDatabaseError(
      insert(studentId, 2),
      PG_ERROR.UNIQUE_VIOLATION,
      'waitlist_entries_one_waiting_per_student_course_idx',
    );
    await expectDatabaseError(
      insert(other, 1),
      PG_ERROR.UNIQUE_VIOLATION,
      'waitlist_entries_waiting_position_idx',
    );
  });
});

describe('identity and windows', () => {
  it('treats e-mail addresses case-insensitively', async () => {
    const pool = getTestPool();
    await createUser(pool, { email: 'Ada.Lovelace@University.edu' });

    await expectDatabaseError(
      createUser(pool, { email: 'ada.lovelace@university.edu' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'users_email_key',
    );
  });

  it('only stores bcrypt hashes, never plain passwords', async () => {
    const pool = getTestPool();

    await expectDatabaseError(
      pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES ('x@university.edu', 'Admin@123', 'ADMIN')",
      ),
      PG_ERROR.CHECK_VIOLATION,
      'users_password_hash_bcrypt_check',
    );
  });

  it('does not allow an ADMIN user to have a student profile', async () => {
    const pool = getTestPool();
    const { programId } = await createScenario(pool);
    const adminId = await createUser(pool, { role: 'ADMIN' });

    await expectDatabaseError(
      createStudent(pool, programId, { userId: adminId }),
      PG_ERROR.FOREIGN_KEY_VIOLATION,
      'students_user_fkey',
    );
  });

  it('rejects a semester outside 1-8 and negative credits', async () => {
    const pool = getTestPool();
    const { departmentId } = await createScenario(pool);
    const programId = await createProgram(pool, departmentId);

    await expectDatabaseError(
      createStudent(pool, programId, { semester: 9 }),
      PG_ERROR.CHECK_VIOLATION,
      'students_semester_check',
    );
    await expectDatabaseError(
      createStudent(pool, programId, { creditsCompleted: -1 }),
      PG_ERROR.CHECK_VIOLATION,
      'students_credits_completed_check',
    );
  });

  it('allows only one OPEN registration window', async () => {
    const pool = getTestPool();
    await createWindow(pool, { status: 'OPEN' });

    await expectDatabaseError(
      createWindow(pool, { status: 'OPEN' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'registration_windows_single_open_idx',
    );
  });

  it('rejects a window that ends before it starts or whose config disagrees with its method', async () => {
    const pool = getTestPool();
    const insertWindow = (endsOffset: string, method: string) =>
      pool.query(
        `INSERT INTO registration_windows
           (name, term, starts_at, ends_at, allocation_method, config, random_seed)
         VALUES ('Bad', '2026-FALL', now(), now() + $1::interval, $2, $3, 1)`,
        [endsOffset, method, DEFAULT_PREFERENCE_PRIORITY_CONFIG],
      );

    await expectDatabaseError(
      insertWindow('-1 day', 'PREFERENCE_PRIORITY'),
      PG_ERROR.CHECK_VIOLATION,
      'registration_windows_dates_check',
    );
    await expectDatabaseError(
      insertWindow('1 day', 'FCFS'),
      PG_ERROR.CHECK_VIOLATION,
      'registration_windows_config_method_check',
    );
  });

  it('keeps registration history append-only', async () => {
    const pool = getTestPool();
    const { studentId, windowId } = await createScenario(pool);
    await pool.query(
      "INSERT INTO registration_history (student_id, window_id, event_type) VALUES ($1, $2, 'SUBMITTED')",
      [studentId, windowId],
    );

    await expectDatabaseError(
      pool.query("UPDATE registration_history SET event_type = 'DROPPED'"),
      PG_ERROR.OBJECT_NOT_IN_PREREQUISITE_STATE,
    );
  });
});
