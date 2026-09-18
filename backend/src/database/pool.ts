import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  // An idle client can error (e.g. the server restarted). Without a listener
  // this would crash the process; the pool discards the client itself.
  pool.on('error', (error) => {
    logger.error('Idle PostgreSQL client error', { error });
  });

  return pool;
}
