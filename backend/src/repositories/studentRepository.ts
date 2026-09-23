import type { CourseRef, StudentProfile } from '@course-reg/shared';
import type { Pool } from 'pg';
import type { EligibilityStudent } from '../services/eligibilityRules.js';
import type { CourseStatusRecord } from '../types/catalogue.js';
import { mapCourseStatusRow, mapStudentProfileRow } from './mappers.js';
import type {
  CourseRefRow,
  CourseStatusRow,
  EligibilityFactsRow,
  StudentProfileRow,
} from './rows.js';

export interface StudentRepository {
  findProfile(studentId: string): Promise<StudentProfile | null>;
  /** Program, semester, credits and passed courses: the inputs of the eligibility rule. */
  findEligibilityFacts(studentId: string): Promise<EligibilityStudent | null>;
  /**
   * The student's own cart items, active enrollments and waiting places in a
   * window, in one query. Only rows of `studentId` are read; the waitlist
   * position is a count, so no other student's data leaves the database.
   */
  findCourseStatuses(studentId: string, windowId: string): Promise<CourseStatusRecord[]>;
  /** The courses the student has passed, for the "Your record" section. */
  findCompletedCourses(studentId: string): Promise<CourseRef[]>;
}

export function createStudentRepository(pool: Pick<Pool, 'query'>): StudentRepository {
  return {
    async findProfile(studentId) {
      const result = await pool.query<StudentProfileRow>(
        `SELECT s.user_id, u.email, s.name, s.roll_number, s.semester, s.credits_completed,
                s.expected_graduation_term, p.code AS program_code, p.name AS program_name
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN programs p ON p.id = s.program_id
         WHERE s.user_id = $1`,
        [studentId],
      );
      const row = result.rows[0];
      return row ? mapStudentProfileRow(row) : null;
    },

    async findEligibilityFacts(studentId) {
      const result = await pool.query<EligibilityFactsRow>(
        `SELECT s.program_id, p.code AS program_code, p.name AS program_name,
                s.semester, s.credits_completed,
                COALESCE(array_agg(scc.course_id) FILTER (WHERE scc.course_id IS NOT NULL),
                         '{}') AS completed_course_ids
         FROM students s
         JOIN programs p ON p.id = s.program_id
         LEFT JOIN student_completed_courses scc ON scc.student_id = s.user_id
         WHERE s.user_id = $1
         GROUP BY s.user_id, p.code, p.name`,
        [studentId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        programId: row.program_id,
        program: { code: row.program_code, name: row.program_name },
        semester: row.semester,
        creditsCompleted: row.credits_completed,
        completedCourseIds: new Set(row.completed_course_ids),
      };
    },

    async findCourseStatuses(studentId, windowId) {
      const result = await pool.query<CourseStatusRow>(
        `SELECT pi.course_id, ps.status AS kind, pi.rank, NULL::int AS position
         FROM preference_submissions ps
         JOIN preference_items pi ON pi.submission_id = ps.id
         WHERE ps.student_id = $1 AND ps.window_id = $2
         UNION ALL
         SELECT e.course_id, 'ENROLLED', NULL, NULL
         FROM enrollments e
         WHERE e.student_id = $1 AND e.window_id = $2 AND e.status = 'ACTIVE'
         UNION ALL
         SELECT w.course_id, 'WAITLISTED', NULL,
                (SELECT count(*)::int
                 FROM waitlist_entries ahead
                 WHERE ahead.window_id = w.window_id
                   AND ahead.course_id = w.course_id
                   AND ahead.status = 'WAITING'
                   AND ahead.position <= w.position)
         FROM waitlist_entries w
         WHERE w.student_id = $1 AND w.window_id = $2 AND w.status = 'WAITING'`,
        [studentId, windowId],
      );
      return result.rows.map(mapCourseStatusRow);
    },

    async findCompletedCourses(studentId) {
      const result = await pool.query<CourseRefRow>(
        `SELECT c.code, c.name
         FROM student_completed_courses scc
         JOIN courses c ON c.id = scc.course_id
         WHERE scc.student_id = $1
         ORDER BY c.code`,
        [studentId],
      );
      return result.rows.map((row) => ({ code: row.code, name: row.name }));
    },
  };
}
