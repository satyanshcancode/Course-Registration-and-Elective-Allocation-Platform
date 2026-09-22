/** HTTP helpers shared by the API integration tests. */
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import type request from 'supertest';
import { createApp } from '../../src/app.js';
import { SESSION_COOKIE_NAME } from '../../src/config/session.js';
import { createServices } from '../../src/container.js';
import { getTestPool } from './testDatabase.js';

export const JWT_SECRET = 'integration-test-secret-that-is-long-enough-123';
export const ALLOWED_ORIGIN = 'http://localhost:5173';

export function buildApp(pool: Pool = getTestPool()) {
  return createApp({
    corsOrigins: [ALLOWED_ORIGIN],
    jsonBodyLimit: '100kb',
    cookieSecure: false,
    services: createServices(pool, { jwtSecret: JWT_SECRET }),
  });
}

/** A valid session cookie for a user, without going through /auth/login. */
export function sessionFor(userId: string, role: 'STUDENT' | 'ADMIN'): string {
  const token = jwt.sign({ role }, JWT_SECRET, { subject: userId, expiresIn: '1h' });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** The ApiResponse `data` field (supertest types the body as any). */
export function dataOf(response: request.Response): unknown {
  return (response.body as { data: unknown }).data;
}

/**
 * A pool whose query() calls are counted, to prove an endpoint runs a fixed
 * number of queries (no N+1). Everything else is delegated to the real pool.
 */
export function countingPool(pool: Pool): { pool: Pool; queries: () => number; reset: () => void } {
  let count = 0;
  const counted = new Proxy(pool, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (property === 'query' && typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          count += 1;
          return (value as (...queryArgs: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
  return {
    pool: counted,
    queries: () => count,
    reset: () => {
      count = 0;
    },
  };
}
