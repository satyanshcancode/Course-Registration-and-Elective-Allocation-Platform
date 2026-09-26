import type { DepartmentRef, ProgramRef, RegistrationWindowStatus } from '@course-reg/shared';
import { isOneOf, REGISTRATION_WINDOW_STATUSES } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { RowMappingError } from './mappers.js';
import type { AdminCourseRow } from './rows.js';

export interface CourseUse {
  windowName: string;
  status: RegistrationWindowStatus;
}

/** A course record with its rule lists and where it is offered. */
export interface AdminCourseRecord {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  description: string;
  minSemester: number;
  minCredits: number;
  isActive: boolean;
  prerequisites: { code: string; name: string }[];
  eligiblePrograms: ProgramRef[];
  relevantPrograms: ProgramRef[];
  offeredIn: CourseUse[];
}

export interface CourseWrite {
  name: string;
  credits: number;
  departmentCode: string;
  description: string;
  minSemester: number;
  minCredits: number;
  prerequisites: readonly string[];
  eligiblePrograms: readonly string[];
  relevantPrograms: readonly string[];
}

export interface AdminCourseRepository {
  /** Every course, active or not, with its rules. One query. */
  list(): Promise<AdminCourseRecord[]>;
  findByCode(code: string): Promise<AdminCourseRecord | null>;
  lockByCode(code: string): Promise<AdminCourseRecord | null>;
  create(code: string, input: CourseWrite): Promise<string>;
  update(courseId: string, input: CourseWrite): Promise<void>;
  /** Replaces all three rule lists. */
  replaceRules(courseId: string, input: CourseWrite): Promise<void>;
  setActive(courseId: string, isActive: boolean): Promise<void>;
  listDepartments(): Promise<DepartmentRef[]>;
  listPrograms(): Promise<ProgramRef[]>;
  /** Code and name of every course, for the pickers. */
  listCourseRefs(): Promise<{ code: string; name: string }[]>;
}

function toWindowStatus(value: string): RegistrationWindowStatus {
  if (!isOneOf(REGISTRATION_WINDOW_STATUSES, value)) {
    throw new RowMappingError('registration_windows.status', value);
  }
  return value;
}

/**
 * The rule lists and the windows a course is offered in, aggregated in SQL.
 * Four correlated aggregates rather than four round trips per course: the
 * catalogue must stay one query however many courses there are.
 */
const COURSE_SELECT = `
  SELECT c.id, c.code, c.name, c.credits, c.description,
         c.min_semester, c.min_credits, c.is_active,
         d.code AS department_code, d.name AS department_name,
         COALESCE((SELECT json_agg(json_build_object('code', p.code, 'name', p.name)
                                   ORDER BY p.code)
                   FROM course_prerequisites cp
                   JOIN courses p ON p.id = cp.prerequisite_course_id
                   WHERE cp.course_id = c.id), '[]'::json) AS prerequisites,
         COALESCE((SELECT json_agg(json_build_object('code', pr.code, 'name', pr.name)
                                   ORDER BY pr.code)
                   FROM course_eligible_programs cep
                   JOIN programs pr ON pr.id = cep.program_id
                   WHERE cep.course_id = c.id), '[]'::json) AS eligible_programs,
         COALESCE((SELECT json_agg(json_build_object('code', pr.code, 'name', pr.name)
                                   ORDER BY pr.code)
                   FROM course_program_relevance cpr
                   JOIN programs pr ON pr.id = cpr.program_id
                   WHERE cpr.course_id = c.id), '[]'::json) AS relevant_programs,
         COALESCE((SELECT json_agg(json_build_object('windowName', w.name, 'status', w.status)
                                   ORDER BY w.starts_at DESC)
                   FROM registration_window_courses rwc
                   JOIN registration_windows w ON w.id = rwc.window_id
                   WHERE rwc.course_id = c.id), '[]'::json) AS offered_in
  FROM courses c
  JOIN departments d ON d.id = c.department_id`;

function toRecord(row: AdminCourseRow): AdminCourseRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    credits: row.credits,
    department: { code: row.department_code, name: row.department_name },
    description: row.description,
    minSemester: row.min_semester,
    minCredits: row.min_credits,
    isActive: row.is_active,
    prerequisites: row.prerequisites,
    eligiblePrograms: row.eligible_programs,
    relevantPrograms: row.relevant_programs,
    offeredIn: row.offered_in.map((use) => ({
      windowName: use.windowName,
      status: toWindowStatus(use.status),
    })),
  };
}

export function createAdminCourseRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): AdminCourseRepository {
  /** Rewrites one of the three join tables from a list of codes. */
  async function replaceLinks(
    courseId: string,
    table: 'course_prerequisites' | 'course_eligible_programs' | 'course_program_relevance',
    codes: readonly string[],
  ): Promise<void> {
    // `table` and the column names come from this module's own literal union,
    // never from a request, so nothing user-supplied reaches the query text.
    const column = table === 'course_prerequisites' ? 'prerequisite_course_id' : 'program_id';
    const source = table === 'course_prerequisites' ? 'courses' : 'programs';

    await pool.query(`DELETE FROM ${table} WHERE course_id = $1`, [courseId]);
    if (codes.length === 0) {
      return;
    }
    const result = await pool.query(
      `INSERT INTO ${table} (course_id, ${column})
       SELECT $1, s.id FROM ${source} s WHERE s.code = ANY ($2::text[])`,
      [courseId, [...codes]],
    );
    if (result.rowCount !== codes.length) {
      throw new Error(`One of the codes given for ${table} does not exist`);
    }
  }

  return {
    async list() {
      const result = await pool.query<AdminCourseRow>(`${COURSE_SELECT} ORDER BY c.code`);
      return result.rows.map(toRecord);
    },

    async findByCode(code) {
      const result = await pool.query<AdminCourseRow>(`${COURSE_SELECT} WHERE c.code = $1`, [code]);
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async lockByCode(code) {
      // The row is locked first, then re-read with its aggregates: FOR UPDATE
      // cannot be used with the aggregate sub-selects above.
      const locked = await pool.query<{ id: string }>(
        'SELECT id FROM courses WHERE code = $1 FOR UPDATE',
        [code],
      );
      if (locked.rows[0] === undefined) {
        return null;
      }
      const result = await pool.query<AdminCourseRow>(`${COURSE_SELECT} WHERE c.code = $1`, [code]);
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async create(code, input) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO courses
           (code, name, department_id, credits, description, min_semester, min_credits)
         SELECT $1, $2, d.id, $4, $5, $6, $7
         FROM departments d WHERE d.code = $3
         RETURNING id`,
        [
          code,
          input.name,
          input.departmentCode,
          input.credits,
          input.description,
          input.minSemester,
          input.minCredits,
        ],
      );
      const id = result.rows[0]?.id;
      if (id === undefined) {
        throw new Error(`Unknown department code ${input.departmentCode}`);
      }
      return id;
    },

    async update(courseId, input) {
      const result = await pool.query(
        `UPDATE courses c
         SET name = $2, department_id = d.id, credits = $4, description = $5,
             min_semester = $6, min_credits = $7
         FROM departments d
         WHERE c.id = $1 AND d.code = $3`,
        [
          courseId,
          input.name,
          input.departmentCode,
          input.credits,
          input.description,
          input.minSemester,
          input.minCredits,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error(`Unknown department code ${input.departmentCode}`);
      }
    },

    async replaceRules(courseId, input) {
      await replaceLinks(courseId, 'course_prerequisites', input.prerequisites);
      await replaceLinks(courseId, 'course_eligible_programs', input.eligiblePrograms);
      await replaceLinks(courseId, 'course_program_relevance', input.relevantPrograms);
    },

    async setActive(courseId, isActive) {
      await pool.query('UPDATE courses SET is_active = $2 WHERE id = $1', [courseId, isActive]);
    },

    async listDepartments() {
      const result = await pool.query<{ code: string; name: string }>(
        'SELECT code, name FROM departments ORDER BY code',
      );
      return result.rows;
    },

    async listPrograms() {
      const result = await pool.query<{ code: string; name: string }>(
        'SELECT code, name FROM programs ORDER BY code',
      );
      return result.rows;
    },

    async listCourseRefs() {
      const result = await pool.query<{ code: string; name: string }>(
        'SELECT code, name FROM courses ORDER BY code',
      );
      return result.rows;
    },
  };
}
