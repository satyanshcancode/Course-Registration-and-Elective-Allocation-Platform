import type { Pool } from 'pg';
import type { WindowRecord } from '../types/catalogue.js';
import { mapWindowSummaryRow } from './mappers.js';
import type { WindowSummaryRow } from './rows.js';

export interface RegistrationWindowRepository {
  /** The OPEN window, otherwise the one that starts latest. */
  findCurrent(): Promise<WindowRecord | null>;
}

export function createRegistrationWindowRepository(
  pool: Pick<Pool, 'query'>,
): RegistrationWindowRepository {
  return {
    async findCurrent() {
      const result = await pool.query<WindowSummaryRow>(
        `SELECT id, name, term, status, starts_at, ends_at
         FROM registration_windows
         ORDER BY (status = 'OPEN') DESC, starts_at DESC
         LIMIT 1`,
      );
      const row = result.rows[0];
      return row ? mapWindowSummaryRow(row) : null;
    },
  };
}
