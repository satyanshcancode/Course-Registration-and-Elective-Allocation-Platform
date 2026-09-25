import { isAllocationConfig, type AllocationConfig, type WindowCounts } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import type {
  StudentEligibilityFactsRecord,
  WindowCourseOptionRecord,
  WindowDetailRecord,
  WindowRecord,
} from '../types/catalogue.js';
import { mapWindowSummaryRow } from './mappers.js';
import type {
  EligibilityFactsRow,
  WindowCountsRow,
  WindowCourseOptionRow,
  WindowDetailRow,
  WindowSummaryRow,
} from './rows.js';

/** The policy columns frozen once a window opens. */
export interface WindowPolicyUpdate {
  name: string;
  term: string;
  startsAt: Date;
  endsAt: Date;
  policy: AllocationConfig;
  randomSeed: number;
}

export interface RegistrationWindowRepository {
  /** The OPEN window, otherwise the one that starts latest. */
  findCurrent(): Promise<WindowRecord | null>;
  /** The same window with its allocation policy and seed. */
  findCurrentDetail(): Promise<WindowDetailRecord | null>;
  /** Every course, marked with whether this window offers it. */
  findCourseOptions(windowId: string): Promise<WindowCourseOptionRecord[]>;
  countWindow(windowId: string): Promise<Omit<WindowCounts, 'eligibleStudents'>>;
  /** The eligibility inputs of every student, in one query (admin counts). */
  findAllEligibilityFacts(): Promise<StudentEligibilityFactsRecord[]>;
  /** Locks the window row so a concurrent open/close can't interleave. */
  lockById(windowId: string): Promise<WindowDetailRecord | null>;
  updatePolicy(windowId: string, update: WindowPolicyUpdate): Promise<void>;
  /** Replaces the offered courses, keeping the seats of courses that stay. */
  replaceOfferings(windowId: string, courseCodes: readonly string[]): Promise<void>;
  setStatus(windowId: string, status: string): Promise<void>;
  /**
   * The add/drop period. Deliberately separate from `updatePolicy`: the policy
   * freezes when the window opens, while the period is scheduled afterwards,
   * on a window that is already ALLOCATED.
   */
  setAddDropPeriod(windowId: string, opensAt: Date | null, closesAt: Date | null): Promise<void>;
  /** User ids of every student, for the "registration is open" notifications. */
  findAllStudentUserIds(): Promise<string[]>;
}

/** Seats a newly offered course starts with; the admin edits it on /admin/courses. */
export const DEFAULT_OFFERING_CAPACITY = 30;

const SUMMARY_COLUMNS = `id, name, term, status, starts_at, ends_at,
                         add_drop_opens_at, add_drop_closes_at`;

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, allocation_method, config, random_seed`;

/** The stored JSONB is validated, not trusted: a bad row is a bug worth seeing. */
function readPolicy(value: unknown, windowId: string): AllocationConfig {
  if (!isAllocationConfig(value)) {
    throw new Error(`Registration window ${windowId} has an invalid allocation config.`);
  }
  return value;
}

function mapDetailRow(row: WindowDetailRow): WindowDetailRecord {
  return {
    ...mapWindowSummaryRow(row),
    policy: readPolicy(row.config, row.id),
    randomSeed: Number(row.random_seed),
  };
}

export function createRegistrationWindowRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): RegistrationWindowRepository {
  /** Same ordering everywhere: the OPEN window, otherwise the newest. */
  const CURRENT_ORDER = `ORDER BY (status = 'OPEN') DESC, starts_at DESC LIMIT 1`;

  return {
    async findCurrent() {
      const result = await pool.query<WindowSummaryRow>(
        `SELECT ${SUMMARY_COLUMNS} FROM registration_windows ${CURRENT_ORDER}`,
      );
      const row = result.rows[0];
      return row ? mapWindowSummaryRow(row) : null;
    },

    async findCurrentDetail() {
      const result = await pool.query<WindowDetailRow>(
        `SELECT ${DETAIL_COLUMNS} FROM registration_windows ${CURRENT_ORDER}`,
      );
      const row = result.rows[0];
      return row ? mapDetailRow(row) : null;
    },

    async findCourseOptions(windowId) {
      const result = await pool.query<WindowCourseOptionRow>(
        `WITH demand AS (
           SELECT pi.course_id, count(*)::int AS demand
           FROM preference_items pi
           JOIN preference_submissions ps ON ps.id = pi.submission_id
           WHERE pi.window_id = $1 AND ps.status = 'SUBMITTED'
           GROUP BY pi.course_id
         )
         SELECT c.code, c.name, c.credits,
                d.code AS department_code, d.name AS department_name,
                rwc.window_id IS NOT NULL AS offered,
                rwc.capacity,
                COALESCE(dm.demand, 0) AS demand
         FROM courses c
         JOIN departments d ON d.id = c.department_id
         LEFT JOIN registration_window_courses rwc
           ON rwc.course_id = c.id AND rwc.window_id = $1
         LEFT JOIN demand dm ON dm.course_id = c.id
         ORDER BY c.code`,
        [windowId],
      );
      return result.rows.map((row) => ({
        code: row.code,
        name: row.name,
        credits: row.credits,
        department: { code: row.department_code, name: row.department_name },
        offered: row.offered,
        capacity: row.capacity,
        demand: row.demand,
      }));
    },

    async countWindow(windowId) {
      const result = await pool.query<WindowCountsRow>(
        `SELECT
           (SELECT count(*)::int FROM registration_window_courses WHERE window_id = $1)
             AS offered_courses,
           (SELECT count(*)::int FROM preference_submissions
            WHERE window_id = $1 AND status = 'SUBMITTED') AS submissions,
           (SELECT count(*)::int FROM students) AS total_students`,
        [windowId],
      );
      const row = result.rows[0];
      return {
        offeredCourses: row?.offered_courses ?? 0,
        submissions: row?.submissions ?? 0,
        totalStudents: row?.total_students ?? 0,
      };
    },

    async findAllEligibilityFacts() {
      const result = await pool.query<EligibilityFactsRow & { user_id: string }>(
        `SELECT s.user_id, s.program_id, p.code AS program_code, p.name AS program_name,
                s.semester, s.credits_completed,
                COALESCE(array_agg(scc.course_id) FILTER (WHERE scc.course_id IS NOT NULL),
                         '{}') AS completed_course_ids
         FROM students s
         JOIN programs p ON p.id = s.program_id
         LEFT JOIN student_completed_courses scc ON scc.student_id = s.user_id
         GROUP BY s.user_id, p.code, p.name`,
      );
      return result.rows.map((row) => ({
        studentId: row.user_id,
        programId: row.program_id,
        program: { code: row.program_code, name: row.program_name },
        semester: row.semester,
        creditsCompleted: row.credits_completed,
        completedCourseIds: new Set(row.completed_course_ids),
      }));
    },

    async lockById(windowId) {
      const result = await pool.query<WindowDetailRow>(
        `SELECT ${DETAIL_COLUMNS} FROM registration_windows WHERE id = $1 FOR UPDATE`,
        [windowId],
      );
      const row = result.rows[0];
      return row ? mapDetailRow(row) : null;
    },

    async updatePolicy(windowId, update) {
      await pool.query(
        `UPDATE registration_windows
         SET name = $2, term = $3, starts_at = $4, ends_at = $5,
             allocation_method = $6, config = $7, random_seed = $8
         WHERE id = $1`,
        [
          windowId,
          update.name,
          update.term,
          update.startsAt,
          update.endsAt,
          update.policy.method,
          JSON.stringify(update.policy),
          update.randomSeed,
        ],
      );
    },

    async replaceOfferings(windowId, courseCodes) {
      // Courses that stay keep their row (and so their capacity and seats).
      await pool.query(
        `DELETE FROM registration_window_courses rwc
         USING courses c
         WHERE rwc.course_id = c.id
           AND rwc.window_id = $1
           AND NOT (c.code = ANY ($2::text[]))`,
        [windowId, courseCodes],
      );
      await pool.query(
        `INSERT INTO registration_window_courses (window_id, course_id, capacity)
         SELECT $1, c.id, $3
         FROM courses c
         WHERE c.code = ANY ($2::text[])
         ON CONFLICT (window_id, course_id) DO NOTHING`,
        [windowId, courseCodes, DEFAULT_OFFERING_CAPACITY],
      );
    },

    async setAddDropPeriod(windowId, opensAt, closesAt) {
      await pool.query(
        `UPDATE registration_windows
         SET add_drop_opens_at = $2, add_drop_closes_at = $3
         WHERE id = $1`,
        [windowId, opensAt, closesAt],
      );
    },

    async setStatus(windowId, status) {
      await pool.query(`UPDATE registration_windows SET status = $2 WHERE id = $1`, [
        windowId,
        status,
      ]);
    },

    async findAllStudentUserIds() {
      const result = await pool.query<{ user_id: string }>(`SELECT user_id FROM students`);
      return result.rows.map((row) => row.user_id);
    },
  };
}
