import type { AdminStudentStatus, ProgramRef } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import type { AdminStudentRow } from './rows.js';

/** A student as the administrator's list shows them, before the token lookup. */
export interface AdminStudentRecord {
  userId: string;
  rollNumber: string;
  name: string;
  email: string;
  program: ProgramRef;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: string;
  isActive: boolean;
  /** False for an invited account: no password has been set yet. */
  hasPassword: boolean;
}

export interface AdminStudentFilter {
  search: string | undefined;
  program: string | undefined;
  semester: number | undefined;
  status: AdminStudentStatus | undefined;
  limit: number;
  offset: number;
}

export interface StudentWrite {
  rollNumber: string;
  name: string;
  email: string;
  programCode: string;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: string;
  /** Course codes. Replaces whatever was recorded before. */
  completedCourses: readonly string[];
}

export interface AdminStudentRepository {
  /** One page, plus the total, both scoped by the same filter. */
  list(filter: AdminStudentFilter): Promise<{ items: AdminStudentRecord[]; total: number }>;
  findByRollNumber(rollNumber: string): Promise<AdminStudentRecord | null>;
  /** Locks the student and their user row, for an edit or a status change. */
  lockByRollNumber(rollNumber: string): Promise<AdminStudentRecord | null>;
  /** Creates the user and the student profile. Returns the new user id. */
  create(input: StudentWrite): Promise<string>;
  update(userId: string, input: StudentWrite): Promise<void>;
  /** Replaces the passed-courses list wholesale. */
  replaceCompletedCourses(userId: string, courseCodes: readonly string[]): Promise<void>;
  findCompletedCourseCodes(userId: string): Promise<string[]>;
  /** Which of `rollNumbers` are already taken — one query, for a CSV import. */
  findExistingRollNumbers(rollNumbers: readonly string[]): Promise<Set<string>>;
  /** Which of `emails` are already taken. Case-insensitive (CITEXT). */
  findExistingEmails(emails: readonly string[]): Promise<Set<string>>;
  listPrograms(): Promise<(ProgramRef & { id: string })[]>;
}

/**
 * The status filter in SQL. Derived from two columns rather than stored, so
 * there is no third place for it to drift out of step with:
 *   INVITED  = no password yet (and not deactivated)
 *   ACTIVE   = a password, and allowed in
 *   INACTIVE = deactivated, whatever else is true
 */
const STATUS_PREDICATE: Readonly<Record<AdminStudentStatus, string>> = {
  INVITED: 'u.is_active AND u.password_hash IS NULL',
  ACTIVE: 'u.is_active AND u.password_hash IS NOT NULL',
  INACTIVE: 'NOT u.is_active',
};

const SELECT_COLUMNS = `s.roll_number, s.name, u.email,
        p.code AS program_code, p.name AS program_name,
        s.semester, s.credits_completed, s.expected_graduation_term,
        u.is_active, u.password_hash IS NOT NULL AS has_password`;

function toRecord(row: AdminStudentRow & { user_id: string }): AdminStudentRecord {
  return {
    userId: row.user_id,
    rollNumber: row.roll_number,
    name: row.name,
    email: row.email,
    program: { code: row.program_code, name: row.program_name },
    semester: row.semester,
    creditsCompleted: row.credits_completed,
    expectedGraduationTerm: row.expected_graduation_term,
    isActive: row.is_active,
    hasPassword: row.has_password,
  };
}

export function createAdminStudentRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): AdminStudentRepository {
  return {
    async list({ search, program, semester, status, limit, offset }) {
      // The status predicate is chosen from the constant map above, never built
      // from the request: only the map's own SQL can reach the query string.
      const statusClause = status ? `AND (${STATUS_PREDICATE[status]})` : '';
      const result = await pool.query<AdminStudentRow & { user_id: string; total: string }>(
        `SELECT s.user_id, ${SELECT_COLUMNS},
                count(*) OVER () AS total
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN programs p ON p.id = s.program_id
         WHERE ($1::text IS NULL
                OR s.name ILIKE '%' || $1 || '%'
                OR s.roll_number ILIKE '%' || $1 || '%'
                OR u.email ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR p.code = $2)
           AND ($3::int IS NULL OR s.semester = $3)
           ${statusClause}
         ORDER BY s.roll_number
         LIMIT $4 OFFSET $5`,
        [search ?? null, program ?? null, semester ?? null, limit, offset],
      );
      return {
        items: result.rows.map(toRecord),
        // count(*) OVER () is the total before LIMIT; 0 rows means 0 matches.
        total: Number(result.rows[0]?.total ?? 0),
      };
    },

    async findByRollNumber(rollNumber) {
      const result = await pool.query<AdminStudentRow & { user_id: string }>(
        `SELECT s.user_id, ${SELECT_COLUMNS}
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN programs p ON p.id = s.program_id
         WHERE s.roll_number = $1`,
        [rollNumber],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async lockByRollNumber(rollNumber) {
      const result = await pool.query<AdminStudentRow & { user_id: string }>(
        `SELECT s.user_id, ${SELECT_COLUMNS}
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN programs p ON p.id = s.program_id
         WHERE s.roll_number = $1
         FOR UPDATE OF s, u`,
        [rollNumber],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async create(input) {
      // The user row first: students.user_id references it. password_hash stays
      // NULL, which is exactly what "invited" means.
      const user = await pool.query<{ id: string }>(
        `INSERT INTO users (email, role) VALUES ($1, 'STUDENT') RETURNING id`,
        [input.email],
      );
      const userId = user.rows[0]?.id;
      if (userId === undefined) {
        throw new Error('Failed to create the student user row');
      }

      // The programme is resolved by code inside the INSERT: a code that does
      // not exist inserts no row, which the rowCount check below turns into an
      // error rather than a silently missing profile.
      const student = await pool.query(
        `INSERT INTO students
           (user_id, roll_number, name, program_id, semester, credits_completed,
            expected_graduation_term)
         SELECT $1, $2, $3, p.id, $5, $6, $7
         FROM programs p WHERE p.code = $4`,
        [
          userId,
          input.rollNumber,
          input.name,
          input.programCode,
          input.semester,
          input.creditsCompleted,
          input.expectedGraduationTerm,
        ],
      );
      if (student.rowCount !== 1) {
        throw new Error(`Unknown programme code ${input.programCode}`);
      }
      return userId;
    },

    async update(userId, input) {
      await pool.query('UPDATE users SET email = $2 WHERE id = $1', [userId, input.email]);
      const result = await pool.query(
        `UPDATE students s
         SET roll_number = $2, name = $3, program_id = p.id, semester = $5,
             credits_completed = $6, expected_graduation_term = $7
         FROM programs p
         WHERE s.user_id = $1 AND p.code = $4`,
        [
          userId,
          input.rollNumber,
          input.name,
          input.programCode,
          input.semester,
          input.creditsCompleted,
          input.expectedGraduationTerm,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error(`Unknown programme code ${input.programCode}`);
      }
    },

    async replaceCompletedCourses(userId, courseCodes) {
      await pool.query('DELETE FROM student_completed_courses WHERE student_id = $1', [userId]);
      if (courseCodes.length === 0) {
        return;
      }
      // completed_term stays NULL: the registrar is asserting that the course
      // WAS passed, which is what the prerequisite check needs, not when.
      const inserted = await pool.query(
        `INSERT INTO student_completed_courses (student_id, course_id)
         SELECT $1, c.id FROM courses c WHERE c.code = ANY ($2::text[])`,
        [userId, [...courseCodes]],
      );
      if (inserted.rowCount !== courseCodes.length) {
        throw new Error('One of the completed course codes does not exist');
      }
    },

    async findCompletedCourseCodes(userId) {
      const result = await pool.query<{ code: string }>(
        `SELECT c.code FROM student_completed_courses scc
         JOIN courses c ON c.id = scc.course_id
         WHERE scc.student_id = $1
         ORDER BY c.code`,
        [userId],
      );
      return result.rows.map((row) => row.code);
    },

    async findExistingRollNumbers(rollNumbers) {
      if (rollNumbers.length === 0) {
        return new Set();
      }
      const result = await pool.query<{ roll_number: string }>(
        'SELECT roll_number FROM students WHERE roll_number = ANY ($1::text[])',
        [[...rollNumbers]],
      );
      return new Set(result.rows.map((row) => row.roll_number));
    },

    async findExistingEmails(emails) {
      if (emails.length === 0) {
        return new Set();
      }
      // Compared as CITEXT, returned lower-cased, so the caller's own
      // lower-cased lookups match whatever case the database holds.
      const result = await pool.query<{ email: string }>(
        'SELECT lower(email::text) AS email FROM users WHERE email = ANY ($1::citext[])',
        [[...emails]],
      );
      return new Set(result.rows.map((row) => row.email));
    },

    async listPrograms() {
      const result = await pool.query<{ id: string; code: string; name: string }>(
        'SELECT id, code, name FROM programs ORDER BY code',
      );
      return result.rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
    },
  };
}
