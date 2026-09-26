import { HISTORY_EVENT_TYPES, type CourseRef, type HistoryEventType } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { oneOf } from './mappers.js';

export interface HistoryEntry {
  studentId: string;
  windowId: string;
  eventType: HistoryEventType;
  /** The course the event is about, when there is one. */
  courseId?: string | null;
  details?: unknown;
}

/** One stored event, with the course it was about resolved to its code. */
export interface HistoryEventRecord {
  id: string;
  eventType: HistoryEventType;
  /** Null when the event has no course, or the course has since been removed. */
  course: CourseRef | null;
  details: unknown;
  createdAt: Date;
}

export interface HistoryPageQuery {
  type?: HistoryEventType | undefined;
  courseCode?: string | undefined;
  /** Everything strictly older than this row id; omit for the newest page. */
  cursor?: string | undefined;
  limit: number;
}

/** What a student has any history for, so the filters offer only real choices. */
export interface HistoryFilterOptions {
  types: HistoryEventType[];
  courses: CourseRef[];
}

/** The student-facing timeline. Append-only: a trigger rejects UPDATEs. */
export interface RegistrationHistoryRepository {
  /**
   * The student's own events, newest first, one page at a time.
   *
   * Keyset, not OFFSET: the cursor is the last row's id, so events written
   * while the student reads cannot shift a page under them. Ordering by `id`
   * alone (rather than by `created_at`) is what makes that exact — ids are the
   * insert order, and a bulk write gives a whole allocation one `created_at`.
   */
  listForStudent(studentId: string, query: HistoryPageQuery): Promise<HistoryEventRecord[]>;
  /** Every type and course the student has an event for, unfiltered. */
  listFilterOptions(studentId: string): Promise<HistoryFilterOptions>;
  /**
   * The last event that GAVE the student this course, so "added" and "swapped
   * into" can be told apart — the enrollment row records both as `ADD`.
   */
  findSeatOrigin(
    studentId: string,
    windowId: string,
    courseId: string,
  ): Promise<HistoryEventType | null>;
  record(entry: HistoryEntry): Promise<void>;
  /**
   * One INSERT for many entries. An allocation writes a row for every student
   * in the window; one statement per row would be hundreds of round trips
   * inside a transaction that is holding the window lock.
   */
  recordMany(entries: readonly HistoryEntry[]): Promise<void>;
}

interface HistoryJoinedRow {
  id: string;
  event_type: string;
  code: string | null;
  name: string | null;
  details: unknown;
  created_at: Date;
}

export function createRegistrationHistoryRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): RegistrationHistoryRepository {
  return {
    async listForStudent(studentId, { type, courseCode, cursor, limit }) {
      const result = await pool.query<HistoryJoinedRow>(
        `SELECT h.id, h.event_type, h.details, h.created_at, c.code, c.name
         FROM registration_history h
         LEFT JOIN courses c ON c.id = h.course_id
         WHERE h.student_id = $1
           AND ($2::text IS NULL OR h.event_type = $2)
           AND ($3::text IS NULL OR c.code = $3)
           AND ($4::bigint IS NULL OR h.id < $4)
         ORDER BY h.id DESC
         LIMIT $5`,
        [studentId, type ?? null, courseCode ?? null, cursor ?? null, limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        eventType: oneOf(HISTORY_EVENT_TYPES, row.event_type, 'registration_history.event_type'),
        course: row.code === null ? null : { code: row.code, name: row.name ?? row.code },
        details: row.details,
        createdAt: row.created_at,
      }));
    },

    async listFilterOptions(studentId) {
      const result = await pool.query<{ event_type: string; code: string | null; name: string }>(
        `SELECT DISTINCT h.event_type, c.code, c.name
         FROM registration_history h
         LEFT JOIN courses c ON c.id = h.course_id
         WHERE h.student_id = $1`,
        [studentId],
      );
      const types = new Set<HistoryEventType>();
      const courses = new Map<string, CourseRef>();
      for (const row of result.rows) {
        types.add(oneOf(HISTORY_EVENT_TYPES, row.event_type, 'registration_history.event_type'));
        if (row.code !== null) {
          courses.set(row.code, { code: row.code, name: row.name });
        }
      }
      return {
        types: [...types].sort(),
        courses: [...courses.values()].sort((a, b) => a.code.localeCompare(b.code)),
      };
    },

    async findSeatOrigin(studentId, windowId, courseId) {
      const result = await pool.query<{ event_type: string }>(
        `SELECT event_type
         FROM registration_history
         WHERE student_id = $1 AND window_id = $2 AND course_id = $3
           AND event_type IN ('ALLOCATED', 'PROMOTED', 'ADDED', 'SWAPPED')
         ORDER BY id DESC
         LIMIT 1`,
        [studentId, windowId, courseId],
      );
      const row = result.rows[0];
      return row
        ? oneOf(HISTORY_EVENT_TYPES, row.event_type, 'registration_history.event_type')
        : null;
    },

    async record(entry) {
      await pool.query(
        `INSERT INTO registration_history (student_id, window_id, course_id, event_type, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          entry.studentId,
          entry.windowId,
          entry.courseId ?? null,
          entry.eventType,
          JSON.stringify(entry.details ?? {}),
        ],
      );
    },

    async recordMany(entries) {
      if (entries.length === 0) {
        return;
      }
      await pool.query(
        `INSERT INTO registration_history (student_id, window_id, course_id, event_type, details)
         SELECT student_id, window_id, course_id, event_type, details
         FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::jsonb[])
           AS t(student_id, window_id, course_id, event_type, details)`,
        [
          entries.map((entry) => entry.studentId),
          entries.map((entry) => entry.windowId),
          entries.map((entry) => entry.courseId ?? null),
          entries.map((entry) => entry.eventType),
          entries.map((entry) => JSON.stringify(entry.details ?? {})),
        ],
      );
    },
  };
}
