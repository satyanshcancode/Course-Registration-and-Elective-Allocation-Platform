import type { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

/** The subset of pg.Pool that withTransaction needs (eases testing). */
export type TransactionPool = Pick<Pool, 'connect'>;

/**
 * Runs `work` inside a single database transaction on one pooled client.
 *
 * COMMIT on success, ROLLBACK on any thrown error (which is then re-thrown).
 * If ROLLBACK itself fails the client is destroyed rather than returned to the
 * pool, so a connection in an unknown state is never reused.
 */
export async function withTransaction<T>(
  pool: TransactionPool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let brokenConnection: Error | undefined;

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnection =
        rollbackError instanceof Error ? rollbackError : new Error('ROLLBACK failed');
      logger.error('Transaction rollback failed', { error: rollbackError });
    }
    throw error;
  } finally {
    client.release(brokenConnection);
  }
}
