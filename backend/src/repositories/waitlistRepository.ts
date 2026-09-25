/**
 * Everything promotion reads and writes, plus the two read models behind the
 * student and admin waitlist pages.
 *
 * Every method here is used inside the caller's transaction (promotion) or on
 * the pool (the read models), so the factory takes either. The promotion
 * methods are deliberately one-row-at-a-time: a cascade is a handful of steps,
 * and each one has to see what the step before it did.
 */
import {
  ENROLLMENT_SOURCES,
  WAITLIST_REMOVAL_REASONS,
  WAITLIST_STATUSES,
  type EnrollmentDropReason,
  type EnrollmentSource,
  type PreferenceRank,
  type WaitlistRemovalReason,
  type WaitlistStatus,
  type WaitlistStudentRef,
} from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { oneOf } from './mappers.js';

/** An offering locked FOR UPDATE, so its free seats cannot move underneath us. */
export interface LockedCourseSeats {
  courseId: string;
  code: string;
  name: string;
  capacity: number;
  allocated: number;
}

/** The next student in line for a course, with everything promotion needs. */
export interface WaitingCandidate {
  entryId: string;
  studentId: string;
  student: WaitlistStudentRef;
  position: number;
  score: number;
  preferenceRank: PreferenceRank;
}

/** The seat a student holds in this window right now. */
export interface HeldSeat {
  enrollmentId: string;
  courseId: string;
  code: string;
  name: string;
  /** How they came by it: allocation, or a promotion since. */
  source: EnrollmentSource;
  /** Null when the held course was not one of their ranked preferences. */
  preferenceRank: PreferenceRank | null;
}

export interface EnrollmentRecord extends HeldSeat {
  windowId: string;
  studentId: string;
  student: WaitlistStudentRef;
  windowStatus: string;
}

export interface CourseRefRow {
  courseId: string;
  code: string;
  name: string;
}

/** One row of the student's own waitlist page. */
export interface StudentWaitlistRow extends CourseRefRow {
  status: WaitlistStatus;
  /** Live rank among the entries still WAITING; null once the entry ended. */
  position: number | null;
  waiting: number;
  capacity: number;
  allocated: number;
  score: number;
  preferenceRank: PreferenceRank;
  reason: WaitlistRemovalReason | null;
  endedAt: Date | null;
}

export interface RosterRow {
  enrollmentId: string;
  student: WaitlistStudentRef;
  source: EnrollmentSource;
  preferenceRank: PreferenceRank | null;
  enrolledAt: Date;
}

export interface WaitlistRow {
  student: WaitlistStudentRef;
  status: WaitlistStatus;
  position: number | null;
  storedPosition: number;
  score: number;
  preferenceRank: PreferenceRank;
  reason: WaitlistRemovalReason | null;
}

export interface WaitlistRepository {
  /**
   * Serialises promotion for one window. Transaction-scoped, so it is released
   * by COMMIT or ROLLBACK and never leaks; see docs/CONCURRENCY.md.
   */
  lockWindowForPromotion(windowId: string): Promise<void>;
  /** The window's status, so promotion can refuse to run outside ALLOCATED. */
  findWindowStatus(windowId: string): Promise<string | null>;
  lockOffering(windowId: string, courseId: string): Promise<LockedCourseSeats | null>;
  findOfferingByCode(windowId: string, code: string): Promise<LockedCourseSeats | null>;
  nextWaiting(windowId: string, courseId: string): Promise<WaitingCandidate | null>;
  markPromoted(entryId: string): Promise<void>;
  markRemoved(entryId: string, reason: WaitlistRemovalReason): Promise<void>;
  /**
   * Removes the student's WAITING entries for courses they ranked BELOW
   * `rank` (a larger number is a lower choice). Returns what it removed.
   */
  removeEntriesRankedBelow(
    windowId: string,
    studentId: string,
    rank: PreferenceRank,
    reason: WaitlistRemovalReason,
  ): Promise<CourseRefRow[]>;
  findHeldSeat(windowId: string, studentId: string): Promise<HeldSeat | null>;
  findEnrollment(enrollmentId: string): Promise<EnrollmentRecord | null>;
  enroll(
    windowId: string,
    studentId: string,
    courseId: string,
    source: EnrollmentSource,
  ): Promise<void>;
  dropEnrollment(enrollmentId: string, reason: EnrollmentDropReason): Promise<void>;
  /** Offered courses that have both a free seat and somebody waiting. */
  coursesWithFreeSeats(windowId: string): Promise<string[]>;
  listOfferedCourses(windowId: string): Promise<CourseRefRow[]>;
  listStudentEntries(windowId: string, studentId: string): Promise<StudentWaitlistRow[]>;
  listRoster(windowId: string, courseId: string): Promise<RosterRow[]>;
  listWaitlist(windowId: string, courseId: string): Promise<WaitlistRow[]>;
}

interface StudentColumns {
  name: string;
  email: string;
  program_code: string;
  semester: number;
}

/** The student columns every admin-facing row selects, so they stay identical. */
const STUDENT_COLUMNS = `s.name, u.email, p.code AS program_code, s.semester`;
const STUDENT_JOINS = `JOIN students s ON s.user_id = %ALIAS%.student_id
                       JOIN users u ON u.id = s.user_id
                       JOIN programs p ON p.id = s.program_id`;

const studentJoins = (alias: string) => STUDENT_JOINS.replaceAll('%ALIAS%', alias);

function toStudentRef(row: StudentColumns): WaitlistStudentRef {
  return {
    name: row.name,
    email: row.email,
    program: row.program_code,
    semester: row.semester,
  };
}

const asRank = (value: number | null): PreferenceRank | null =>
  value === null ? null : (value as PreferenceRank);

export function createWaitlistRepository(db: Pick<Pool | PoolClient, 'query'>): WaitlistRepository {
  return {
    async lockWindowForPromotion(windowId) {
      // hashtext gives the bigint the advisory lock functions want. Two windows
      // could in principle collide on it; the cost would be one waiting, which
      // is the behaviour we want anyway.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [windowId]);
    },

    async findWindowStatus(windowId) {
      const result = await db.query<{ status: string }>(
        'SELECT status FROM registration_windows WHERE id = $1',
        [windowId],
      );
      return result.rows[0]?.status ?? null;
    },

    async lockOffering(windowId, courseId) {
      const result = await db.query<{
        course_id: string;
        code: string;
        name: string;
        capacity: number;
        allocated_count: number;
      }>(
        `SELECT o.course_id, c.code, c.name, o.capacity, o.allocated_count
         FROM registration_window_courses o
         JOIN courses c ON c.id = o.course_id
         WHERE o.window_id = $1 AND o.course_id = $2
         FOR UPDATE OF o`,
        [windowId, courseId],
      );
      const row = result.rows[0];
      return row
        ? {
            courseId: row.course_id,
            code: row.code,
            name: row.name,
            capacity: row.capacity,
            allocated: row.allocated_count,
          }
        : null;
    },

    async findOfferingByCode(windowId, code) {
      const result = await db.query<{
        course_id: string;
        code: string;
        name: string;
        capacity: number;
        allocated_count: number;
      }>(
        `SELECT o.course_id, c.code, c.name, o.capacity, o.allocated_count
         FROM registration_window_courses o
         JOIN courses c ON c.id = o.course_id
         WHERE o.window_id = $1 AND c.code = $2`,
        [windowId, code],
      );
      const row = result.rows[0];
      return row
        ? {
            courseId: row.course_id,
            code: row.code,
            name: row.name,
            capacity: row.capacity,
            allocated: row.allocated_count,
          }
        : null;
    },

    async nextWaiting(windowId, courseId) {
      // Lowest stored position wins; positions are never renumbered, so the
      // gaps promotion leaves behind do not change who is next.
      const result = await db.query<
        StudentColumns & {
          id: string;
          student_id: string;
          position: number;
          score: number;
          rank: number;
        }
      >(
        `SELECT w.id, w.student_id, w.position, w.score, pi.rank, ${STUDENT_COLUMNS}
         FROM waitlist_entries w
         ${studentJoins('w')}
         JOIN preference_items pi
           ON pi.window_id = w.window_id AND pi.course_id = w.course_id
         JOIN preference_submissions ps
           ON ps.id = pi.submission_id AND ps.student_id = w.student_id
         WHERE w.window_id = $1 AND w.course_id = $2 AND w.status = 'WAITING'
           AND ps.status = 'SUBMITTED'
         ORDER BY w.position
         LIMIT 1`,
        [windowId, courseId],
      );
      const row = result.rows[0];
      return row
        ? {
            entryId: row.id,
            studentId: row.student_id,
            student: toStudentRef(row),
            position: row.position,
            score: row.score,
            preferenceRank: row.rank as PreferenceRank,
          }
        : null;
    },

    async markPromoted(entryId) {
      await db.query(
        `UPDATE waitlist_entries SET status = 'PROMOTED', promoted_at = now()
         WHERE id = $1 AND status = 'WAITING'`,
        [entryId],
      );
    },

    async markRemoved(entryId, reason) {
      await db.query(
        `UPDATE waitlist_entries
         SET status = 'REMOVED', removed_at = now(), removal_reason = $2
         WHERE id = $1 AND status = 'WAITING'`,
        [entryId, reason],
      );
    },

    async removeEntriesRankedBelow(windowId, studentId, rank, reason) {
      const result = await db.query<{ course_id: string; code: string; name: string }>(
        `WITH ranked AS (
           SELECT pi.course_id, pi.rank
           FROM preference_items pi
           JOIN preference_submissions ps ON ps.id = pi.submission_id
           WHERE pi.window_id = $1 AND ps.student_id = $2 AND ps.status = 'SUBMITTED'
         ), removed AS (
           UPDATE waitlist_entries w
           SET status = 'REMOVED', removed_at = now(), removal_reason = $4
           FROM ranked
           WHERE w.window_id = $1 AND w.student_id = $2 AND w.status = 'WAITING'
             AND w.course_id = ranked.course_id AND ranked.rank > $3
           RETURNING w.course_id
         )
         SELECT removed.course_id, c.code, c.name
         FROM removed JOIN courses c ON c.id = removed.course_id`,
        [windowId, studentId, rank, reason],
      );
      return result.rows.map((row) => ({
        courseId: row.course_id,
        code: row.code,
        name: row.name,
      }));
    },

    async findHeldSeat(windowId, studentId) {
      const result = await db.query<{
        id: string;
        course_id: string;
        code: string;
        name: string;
        rank: number | null;
        source: string;
      }>(
        `SELECT e.id, e.course_id, c.code, c.name, pi.rank, e.source
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN preference_submissions ps
           ON ps.window_id = e.window_id AND ps.student_id = e.student_id
          AND ps.status = 'SUBMITTED'
         LEFT JOIN preference_items pi
           ON pi.submission_id = ps.id AND pi.course_id = e.course_id
         WHERE e.window_id = $1 AND e.student_id = $2 AND e.status = 'ACTIVE'`,
        [windowId, studentId],
      );
      const row = result.rows[0];
      return row
        ? {
            enrollmentId: row.id,
            courseId: row.course_id,
            code: row.code,
            name: row.name,
            source: oneOf(ENROLLMENT_SOURCES, row.source, 'enrollments.source'),
            preferenceRank: asRank(row.rank),
          }
        : null;
    },

    async findEnrollment(enrollmentId) {
      const result = await db.query<
        StudentColumns & {
          id: string;
          window_id: string;
          student_id: string;
          course_id: string;
          code: string;
          name: string;
          rank: number | null;
          source: string;
          window_status: string;
        }
      >(
        `SELECT e.id, e.window_id, e.student_id, e.course_id, c.code, c.name, pi.rank,
                e.source, rw.status AS window_status, ${STUDENT_COLUMNS}
         FROM enrollments e
         ${studentJoins('e')}
         JOIN courses c ON c.id = e.course_id
         JOIN registration_windows rw ON rw.id = e.window_id
         LEFT JOIN preference_submissions ps
           ON ps.window_id = e.window_id AND ps.student_id = e.student_id
          AND ps.status = 'SUBMITTED'
         LEFT JOIN preference_items pi
           ON pi.submission_id = ps.id AND pi.course_id = e.course_id
         WHERE e.id = $1 AND e.status = 'ACTIVE'`,
        [enrollmentId],
      );
      const row = result.rows[0];
      return row
        ? {
            enrollmentId: row.id,
            windowId: row.window_id,
            studentId: row.student_id,
            student: toStudentRef(row),
            courseId: row.course_id,
            code: row.code,
            name: row.name,
            source: oneOf(ENROLLMENT_SOURCES, row.source, 'enrollments.source'),
            preferenceRank: asRank(row.rank),
            windowStatus: row.window_status,
          }
        : null;
    },

    async enroll(windowId, studentId, courseId, source) {
      // The trigger on enrollments maintains allocated_count, and its CHECK is
      // the final guard: an INSERT that would overbook is rejected here.
      await db.query(
        `INSERT INTO enrollments (student_id, window_id, course_id, source)
         VALUES ($1, $2, $3, $4)`,
        [studentId, windowId, courseId, source],
      );
    },

    async dropEnrollment(enrollmentId, reason) {
      await db.query(
        `UPDATE enrollments
         SET status = 'DROPPED', dropped_at = now(), drop_reason = $2
         WHERE id = $1 AND status = 'ACTIVE'`,
        [enrollmentId, reason],
      );
    },

    async coursesWithFreeSeats(windowId) {
      const result = await db.query<{ course_id: string }>(
        `SELECT o.course_id
         FROM registration_window_courses o
         WHERE o.window_id = $1 AND o.allocated_count < o.capacity
           AND EXISTS (
             SELECT 1 FROM waitlist_entries w
             WHERE w.window_id = o.window_id AND w.course_id = o.course_id
               AND w.status = 'WAITING'
           )
         ORDER BY o.course_id`,
        [windowId],
      );
      return result.rows.map((row) => row.course_id);
    },

    async listOfferedCourses(windowId) {
      const result = await db.query<{ course_id: string; code: string; name: string }>(
        `SELECT o.course_id, c.code, c.name
         FROM registration_window_courses o
         JOIN courses c ON c.id = o.course_id
         WHERE o.window_id = $1
         ORDER BY c.code`,
        [windowId],
      );
      return result.rows.map((row) => ({
        courseId: row.course_id,
        code: row.code,
        name: row.name,
      }));
    },

    async listStudentEntries(windowId, studentId) {
      // The live position is a rank among the WAITING entries of the same
      // course, computed here rather than stored, so a promotion anywhere
      // above moves everyone below up without a single UPDATE.
      const result = await db.query<{
        course_id: string;
        code: string;
        name: string;
        status: string;
        position: number | null;
        stored_position: number;
        waiting: number;
        capacity: number;
        allocated_count: number;
        score: number;
        rank: number;
        removal_reason: string | null;
        ended_at: Date | null;
      }>(
        `WITH live AS (
           SELECT id,
                  rank() OVER (PARTITION BY course_id ORDER BY position) AS live_position,
                  count(*) OVER (PARTITION BY course_id) AS waiting
           FROM waitlist_entries
           WHERE window_id = $1 AND status = 'WAITING'
         )
         SELECT w.course_id, c.code, c.name, w.status, w.position AS stored_position,
                live.live_position::int AS position, coalesce(live.waiting, 0)::int AS waiting,
                o.capacity, o.allocated_count, w.score, pi.rank, w.removal_reason,
                coalesce(w.promoted_at, w.removed_at) AS ended_at
         FROM waitlist_entries w
         JOIN courses c ON c.id = w.course_id
         JOIN registration_window_courses o
           ON o.window_id = w.window_id AND o.course_id = w.course_id
         JOIN preference_submissions ps
           ON ps.window_id = w.window_id AND ps.student_id = w.student_id
          AND ps.status = 'SUBMITTED'
         JOIN preference_items pi ON pi.submission_id = ps.id AND pi.course_id = w.course_id
         LEFT JOIN live ON live.id = w.id
         WHERE w.window_id = $1 AND w.student_id = $2
         ORDER BY pi.rank`,
        [windowId, studentId],
      );
      return result.rows.map((row) => ({
        courseId: row.course_id,
        code: row.code,
        name: row.name,
        status: oneOf(WAITLIST_STATUSES, row.status, 'waitlist_entries.status'),
        position: row.position,
        waiting: row.waiting,
        capacity: row.capacity,
        allocated: row.allocated_count,
        score: row.score,
        preferenceRank: row.rank as PreferenceRank,
        reason:
          row.removal_reason === null
            ? null
            : oneOf(
                WAITLIST_REMOVAL_REASONS,
                row.removal_reason,
                'waitlist_entries.removal_reason',
              ),
        endedAt: row.ended_at,
      }));
    },

    async listRoster(windowId, courseId) {
      const result = await db.query<
        StudentColumns & {
          id: string;
          source: string;
          rank: number | null;
          enrolled_at: Date;
        }
      >(
        `SELECT e.id, e.source, pi.rank, e.enrolled_at, ${STUDENT_COLUMNS}
         FROM enrollments e
         ${studentJoins('e')}
         LEFT JOIN preference_submissions ps
           ON ps.window_id = e.window_id AND ps.student_id = e.student_id
          AND ps.status = 'SUBMITTED'
         LEFT JOIN preference_items pi
           ON pi.submission_id = ps.id AND pi.course_id = e.course_id
         WHERE e.window_id = $1 AND e.course_id = $2 AND e.status = 'ACTIVE'
         ORDER BY s.name`,
        [windowId, courseId],
      );
      return result.rows.map((row) => ({
        enrollmentId: row.id,
        student: toStudentRef(row),
        source: oneOf(ENROLLMENT_SOURCES, row.source, 'enrollments.source'),
        preferenceRank: asRank(row.rank),
        enrolledAt: row.enrolled_at,
      }));
    },

    async listWaitlist(windowId, courseId) {
      const result = await db.query<
        StudentColumns & {
          status: string;
          position: number | null;
          stored_position: number;
          score: number;
          rank: number;
          removal_reason: string | null;
        }
      >(
        `WITH live AS (
           SELECT id, rank() OVER (ORDER BY position) AS live_position
           FROM waitlist_entries
           WHERE window_id = $1 AND course_id = $2 AND status = 'WAITING'
         )
         SELECT w.status, w.position AS stored_position, live.live_position::int AS position,
                w.score, pi.rank, w.removal_reason, ${STUDENT_COLUMNS}
         FROM waitlist_entries w
         ${studentJoins('w')}
         JOIN preference_submissions ps
           ON ps.window_id = w.window_id AND ps.student_id = w.student_id
          AND ps.status = 'SUBMITTED'
         JOIN preference_items pi ON pi.submission_id = ps.id AND pi.course_id = w.course_id
         LEFT JOIN live ON live.id = w.id
         WHERE w.window_id = $1 AND w.course_id = $2
         ORDER BY w.status <> 'WAITING', w.position`,
        [windowId, courseId],
      );
      return result.rows.map((row) => ({
        student: toStudentRef(row),
        status: oneOf(WAITLIST_STATUSES, row.status, 'waitlist_entries.status'),
        position: row.position,
        storedPosition: row.stored_position,
        score: row.score,
        preferenceRank: row.rank as PreferenceRank,
        reason:
          row.removal_reason === null
            ? null
            : oneOf(
                WAITLIST_REMOVAL_REASONS,
                row.removal_reason,
                'waitlist_entries.removal_reason',
              ),
      }));
    },
  };
}
