import type { PoolClient } from 'pg';
import type { LockedOfferingRow } from './rows.js';

export interface LockedOffering {
  windowId: string;
  courseId: string;
  code: string;
  capacity: number;
  allocated: number;
}

/** Writes to an offering; always used inside withTransaction on its client. */
export interface OfferingRepository {
  /**
   * Locks the offering row (SELECT … FOR UPDATE), so no enrollment can change
   * allocated_count between this check and the capacity update.
   */
  lockByCode(windowId: string, courseCode: string): Promise<LockedOffering | null>;
  updateCapacity(windowId: string, courseId: string, capacity: number): Promise<void>;
}

export function createOfferingRepository(client: Pick<PoolClient, 'query'>): OfferingRepository {
  return {
    async lockByCode(windowId, courseCode) {
      const result = await client.query<LockedOfferingRow>(
        `SELECT rwc.window_id, rwc.course_id, c.code, rwc.capacity, rwc.allocated_count
         FROM registration_window_courses rwc
         JOIN courses c ON c.id = rwc.course_id
         WHERE rwc.window_id = $1 AND c.code = $2
         FOR UPDATE OF rwc`,
        [windowId, courseCode],
      );
      const row = result.rows[0];
      return row
        ? {
            windowId: row.window_id,
            courseId: row.course_id,
            code: row.code,
            capacity: row.capacity,
            allocated: row.allocated_count,
          }
        : null;
    },

    async updateCapacity(windowId, courseId, capacity) {
      await client.query(
        `UPDATE registration_window_courses
         SET capacity = $3
         WHERE window_id = $1 AND course_id = $2`,
        [windowId, courseId, capacity],
      );
    },
  };
}
