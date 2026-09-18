import type { Pool } from 'pg';

export interface HealthRepository {
  /** Resolves if the database answers a trivial query; rejects otherwise. */
  pingDatabase(): Promise<void>;
}

export function createHealthRepository(pool: Pick<Pool, 'query'>): HealthRepository {
  return {
    async pingDatabase() {
      await pool.query('SELECT 1');
    },
  };
}
