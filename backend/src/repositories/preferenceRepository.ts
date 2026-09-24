import { REGISTRATION_WINDOW_STATUSES, type SubmissionStatus } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import type { SubmissionWindow } from '../services/registrationWindowRules.js';
import { oneOf } from './mappers.js';
import type { PreferenceItemRow, SubmissionRow } from './rows.js';

/** A student's cart row, without the items. */
export interface SubmissionRecord {
  id: string;
  studentId: string;
  windowId: string;
  status: SubmissionStatus;
  idempotencyKey: string | null;
  submittedAt: Date | null;
  sequence: number | null;
}

/** One saved preference: the course id and its rank. */
export interface PreferenceItemRecord {
  courseId: string;
  code: string;
  rank: number;
}

export interface PreferenceRepository {
  /** The student's cart for a window, or null when they have none yet. */
  findSubmission(studentId: string, windowId: string): Promise<SubmissionRecord | null>;
  /**
   * The cart row, locked FOR UPDATE, creating the DRAFT first if it is
   * missing. Two concurrent submits both end up on the same locked row.
   */
  lockOrCreateSubmission(studentId: string, windowId: string): Promise<SubmissionRecord>;
  findItems(submissionId: string): Promise<PreferenceItemRecord[]>;
  /** Replaces every item atomically; the caller is already in a transaction. */
  replaceItems(
    submissionId: string,
    windowId: string,
    items: readonly { courseId: string; rank: number }[],
  ): Promise<void>;
  /** Marks the cart SUBMITTED with the server's time and the next sequence. */
  markSubmitted(submissionId: string, idempotencyKey: string, submittedAt: Date): Promise<number>;
  /**
   * Reads the window with a FOR SHARE lock: many submits hold it together,
   * but an admin closing the window (FOR UPDATE) waits for them to finish.
   */
  lockWindowForShare(windowId: string): Promise<SubmissionWindow | null>;
  /** Students with no submission at all, for the demo scripts. */
  findStudentsWithoutSubmission(windowId: string, limit: number): Promise<string[]>;
}

function mapSubmission(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    windowId: row.window_id,
    status: oneOf(['DRAFT', 'SUBMITTED'], row.status, 'preference_submissions.status'),
    idempotencyKey: row.idempotency_key,
    submittedAt: row.submitted_at,
    sequence: row.submission_sequence === null ? null : Number(row.submission_sequence),
  };
}

const SUBMISSION_COLUMNS = `id, student_id, window_id, status, idempotency_key,
                            submitted_at, submission_sequence`;

export function createPreferenceRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): PreferenceRepository {
  return {
    async findSubmission(studentId, windowId) {
      const result = await pool.query<SubmissionRow>(
        `SELECT ${SUBMISSION_COLUMNS} FROM preference_submissions
         WHERE student_id = $1 AND window_id = $2`,
        [studentId, windowId],
      );
      const row = result.rows[0];
      return row ? mapSubmission(row) : null;
    },

    async lockOrCreateSubmission(studentId, windowId) {
      // ON CONFLICT DO NOTHING + a locking re-read: when two requests race,
      // one inserts and the other's insert is a no-op, and both then wait on
      // the same row lock instead of failing on the unique constraint.
      await pool.query(
        `INSERT INTO preference_submissions (student_id, window_id, status)
         VALUES ($1, $2, 'DRAFT')
         ON CONFLICT (student_id, window_id) DO NOTHING`,
        [studentId, windowId],
      );
      const result = await pool.query<SubmissionRow>(
        `SELECT ${SUBMISSION_COLUMNS} FROM preference_submissions
         WHERE student_id = $1 AND window_id = $2
         FOR UPDATE`,
        [studentId, windowId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Preference submission disappeared while locking it');
      }
      return mapSubmission(row);
    },

    async findItems(submissionId) {
      const result = await pool.query<PreferenceItemRow>(
        `SELECT pi.course_id, c.code, pi.rank
         FROM preference_items pi
         JOIN courses c ON c.id = pi.course_id
         WHERE pi.submission_id = $1
         ORDER BY pi.rank`,
        [submissionId],
      );
      return result.rows.map((row) => ({
        courseId: row.course_id,
        code: row.code,
        rank: row.rank,
      }));
    },

    async replaceItems(submissionId, windowId, items) {
      await pool.query('DELETE FROM preference_items WHERE submission_id = $1', [submissionId]);
      if (items.length === 0) {
        return;
      }
      // One statement for the whole cart: unnest keeps it a single round trip
      // and the composite FK still checks every course against the window.
      await pool.query(
        `INSERT INTO preference_items (submission_id, window_id, course_id, rank)
         SELECT $1, $2, course_id, rank
         FROM unnest($3::uuid[], $4::smallint[]) AS t(course_id, rank)`,
        [submissionId, windowId, items.map((item) => item.courseId), items.map((item) => item.rank)],
      );
    },

    async markSubmitted(submissionId, idempotencyKey, submittedAt) {
      const result = await pool.query<{ submission_sequence: string }>(
        `UPDATE preference_submissions
         SET status = 'SUBMITTED',
             idempotency_key = $2,
             submitted_at = $3,
             submission_sequence = nextval('preference_submission_sequence')
         WHERE id = $1
         RETURNING submission_sequence`,
        [submissionId, idempotencyKey, submittedAt],
      );
      const sequence = result.rows[0]?.submission_sequence;
      if (sequence === undefined) {
        throw new Error('Submission row vanished while marking it submitted');
      }
      return Number(sequence);
    },

    async lockWindowForShare(windowId) {
      const result = await pool.query<{ status: string; starts_at: Date; ends_at: Date }>(
        `SELECT status, starts_at, ends_at FROM registration_windows
         WHERE id = $1
         FOR SHARE`,
        [windowId],
      );
      const row = result.rows[0];
      return row
        ? {
            status: oneOf(
              REGISTRATION_WINDOW_STATUSES,
              row.status,
              'registration_windows.status',
            ),
            startsAt: row.starts_at,
            endsAt: row.ends_at,
          }
        : null;
    },

    async findStudentsWithoutSubmission(windowId, limit) {
      const result = await pool.query<{ user_id: string }>(
        `SELECT s.user_id
         FROM students s
         LEFT JOIN preference_submissions ps
           ON ps.student_id = s.user_id AND ps.window_id = $1
         WHERE ps.id IS NULL
         ORDER BY s.roll_number
         LIMIT $2`,
        [windowId, limit],
      );
      return result.rows.map((row) => row.user_id);
    },
  };
}
