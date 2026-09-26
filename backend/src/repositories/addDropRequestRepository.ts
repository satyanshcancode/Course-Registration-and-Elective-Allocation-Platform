/**
 * The add/drop idempotency ledger.
 *
 * Phase 7 could keep the key on `preference_submissions`, because a student has
 * exactly one of those. Add/drop actions repeat, so each attempt gets a row of
 * its own holding the reply that was sent.
 *
 * Every method runs on the caller's transaction client: the claim and the work
 * it authorises have to commit together, or a crash between them would leave a
 * key that replays an answer nobody ever received.
 */
import type { AddDropAction, AddDropOutcome } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';

/**
 * What a key turned out to be:
 *   - `claimed` — this attempt is the first; go and do the work.
 *   - `replay`  — the same key and the SAME request; return the stored answer.
 *   - `conflict` — the same key for a DIFFERENT request, or one still in
 *     flight. Either way, acting again would be acting twice.
 */
export type IdempotencyClaim =
  { kind: 'claimed' } | { kind: 'replay'; result: AddDropOutcome } | { kind: 'conflict' };

export interface AddDropRequestRepository {
  claim(
    studentId: string,
    windowId: string,
    idempotencyKey: string,
    action: AddDropAction,
    request: unknown,
  ): Promise<IdempotencyClaim>;
  /** Stores the answer, so every later retry of the same key replays it. */
  recordResult(idempotencyKey: string, result: AddDropOutcome): Promise<void>;
}

export function createAddDropRequestRepository(
  db: Pick<Pool | PoolClient, 'query'>,
): AddDropRequestRepository {
  return {
    async claim(studentId, windowId, idempotencyKey, action, request) {
      const body = JSON.stringify(request);
      // INSERT first: two requests with one key can arrive before any row
      // exists, and exactly one of them wins the primary key.
      const inserted = await db.query(
        `INSERT INTO add_drop_requests (idempotency_key, student_id, window_id, action, request)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [idempotencyKey, studentId, windowId, action, body],
      );
      if (inserted.rowCount === 1) {
        return { kind: 'claimed' };
      }

      // Somebody else holds the key. FOR UPDATE, so a retry that arrives while
      // the first attempt is still running waits for it rather than guessing.
      //
      // The request is compared with jsonb `=`, in the database: PostgreSQL
      // stores jsonb keys in its own order, so comparing two JSON.stringify
      // strings would call an identical request different.
      const existing = await db.query<{ same_request: boolean; result: AddDropOutcome | null }>(
        `SELECT (student_id = $2 AND action = $3 AND request = $4::jsonb) AS same_request, result
         FROM add_drop_requests
         WHERE idempotency_key = $1
         FOR UPDATE`,
        [idempotencyKey, studentId, action, body],
      );
      const row = existing.rows[0];
      // No row means it was deleted between the two statements (only a removed
      // student does that); a null result means the first attempt is still
      // running, or rolled back after claiming. Both are conflicts: acting now
      // would be acting twice.
      if (!row?.same_request || row.result === null) {
        return { kind: 'conflict' };
      }
      return { kind: 'replay', result: row.result };
    },

    async recordResult(idempotencyKey, result) {
      await db.query(`UPDATE add_drop_requests SET result = $2::jsonb WHERE idempotency_key = $1`, [
        idempotencyKey,
        JSON.stringify(result),
      ]);
    },
  };
}
