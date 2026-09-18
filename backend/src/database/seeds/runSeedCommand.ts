import type { Pool } from 'pg';
import { databaseEnvSchema, loadEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { createPool } from '../pool.js';

/**
 * Shared CLI wrapper: loads config, refuses to wipe a production database
 * unless explicitly allowed, runs the command and always closes the pool.
 */
export function runSeedCommand(name: string, command: (pool: Pool) => Promise<unknown>): void {
  const run = async (): Promise<void> => {
    const env = loadEnv(databaseEnvSchema);
    if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
      throw new Error(
        `${name} resets data; pass --allow-production to run it with NODE_ENV=production`,
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
