import type { Pool } from 'pg';
import { databaseEnvSchema, loadEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { createPool } from '../pool.js';

/**
 * Shared CLI wrapper: loads config, REFUSES to run in production, runs the
 * command and always closes the pool.
 *
 * The refusal has no override. Every seed truncates every application table
 * first, and a production database holds real accounts, submissions and
 * results: there is no argument that makes wiping it the right thing to do, so
 * there is no flag for it. Production starts empty with the migrations applied
 * and its first administrator from `npm run admin:create`.
 */
export function runSeedCommand(name: string, command: (pool: Pool) => Promise<unknown>): void {
  const run = async (): Promise<void> => {
    const env = loadEnv(databaseEnvSchema);
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `${name} deletes every row in every application table and will not run with ` +
          'NODE_ENV=production. Apply the migrations and create the first administrator ' +
          'with `npm run admin:create` instead.',
      );
    }
    const pool = createPool(env.DATABASE_URL);
    try {
      await command(pool);
    } finally {
      await pool.end();
    }
  };

  run().catch((error: unknown) => {
    logger.error(`${name} failed`, { error });
    process.exitCode = 1;
  });
}
