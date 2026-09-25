import type { HistoryEventType } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';

export interface HistoryEntry {
  studentId: string;
  windowId: string;
  eventType: HistoryEventType;
  /** The course the event is about, when there is one. */
  courseId?: string | null;
  details?: unknown;
}

/** The student-facing timeline. Append-only: a trigger rejects UPDATEs. */
export interface RegistrationHistoryRepository {
  record(entry: HistoryEntry): Promise<void>;
  /**
   * One INSERT for many entries. An allocation writes a row for every student
   * in the window; one statement per row would be hundreds of round trips
   * inside a transaction that is holding the window lock.
   */
  recordMany(entries: readonly HistoryEntry[]): Promise<void>;
}

export function createRegistrationHistoryRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): RegistrationHistoryRepository {
  return {
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
