import { Pool, type PoolConfig } from 'pg';
import { logger } from '../utils/logger.js';

export interface PoolOptions {
  /**
   * Connections this process may hold.
   *
   * A long-lived server wants a real pool. A serverless function does NOT:
   * every concurrent invocation is its own instance with its own pool, so a
   * max of 10 there means 10 × however many instances Vercel happens to be
   * running, which exhausts the database's connection limit long before the
   * traffic justifies it. One or two per instance is the right shape, with the
   * transaction pooler doing the real multiplexing.
   */
  max?: number;
  /**
   * TLS to the database. Supabase's pooler terminates TLS with a certificate
   * this process has no CA bundle for, so verification is relaxed while the
   * connection itself stays encrypted. On a trusted network (the Docker
   * stack) it is off entirely.
   */
  ssl?: boolean;
}

export function createPool(connectionString: string, options: PoolOptions = {}): Pool {
  const config: PoolConfig = {
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
  if (options.ssl) {
    config.ssl = { rejectUnauthorized: false };
  }
  const pool = new Pool(config);

  // An idle client can error (e.g. the server restarted). Without a listener
  // this would crash the process; the pool discards the client itself.
  pool.on('error', (error) => {
    logger.error('Idle PostgreSQL client error', { error });
  });

  return pool;
}
