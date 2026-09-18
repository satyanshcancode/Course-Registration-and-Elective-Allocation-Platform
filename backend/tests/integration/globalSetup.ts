/**
 * Runs once before the integration project: makes sure the test database
 * exists and is migrated to the latest schema.
 */
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runMigrations } from '../../src/database/migrationRunner.js';
import { createLogger } from '../../src/utils/logger.js';
import {
  assertTestDatabase,
  ensureTestDatabaseExists,
  resolveTestDatabaseUrl,
} from './testDatabase.js';

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../src/database/migrations', import.meta.url),
);

export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  assertTestDatabase(url);
  await ensureTestDatabaseExists(url);

  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await runMigrations(pool, MIGRATIONS_DIRECTORY, createLogger('warn'));
  } finally {
    await pool.end();
  }
}
