import type { HistoryEventType } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';

export interface HistoryEntry {
  studentId: string;
  windowId: string;
  eventType: HistoryEventType;
  details?: unknown;
}

/** The student-facing timeline. Append-only: a trigger rejects UPDATEs. */
export interface RegistrationHistoryRepository {
  record(entry: HistoryEntry): Promise<void>;
}

export function createRegistrationHistoryRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): RegistrationHistoryRepository {
  return {
    async record(entry) {
      await pool.query(
        `INSERT INTO registration_history (student_id, window_id, event_type, details)
         VALUES ($1, $2, $3, $4)`,
        [
          entry.studentId,
          entry.windowId,
          entry.eventType,
          JSON.stringify(entry.details ?? {}),
        ],
      );
    },
  };
}
