/**
 * CLI entry point: `npm run migrate`.
 * Applies pending SQL migrations and exits non-zero on failure.
 */
import { fileURLToPath } from 'node:url';
import { databaseEnvSchema, loadEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrationRunner.js';
import { createPool } from './pool.js';

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('./migrations', import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv(databaseEnvSchema);
  const pool = createPool(env.DATABASE_URL);
  try {
    const applied = await runMigrations(pool, MIGRATIONS_DIRECTORY, logger);
    logger.info(
      applied.length > 0
        ? `Migrations complete: ${applied.length} applied`
        : 'Migrations complete: database already up to date',
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error('Migration failed', { error });
  process.exitCode = 1;
});
