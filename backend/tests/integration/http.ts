/** HTTP helpers shared by the API integration tests. */
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import type request from 'supertest';
import { createApp } from '../../src/app.js';
import { SESSION_COOKIE_NAME } from '../../src/config/session.js';
import { createServices } from '../../src/container.js';
import { createMemoryMailer, type MemoryMailer } from '../../src/mail/memoryMailer.js';
import { getTestPool } from './testDatabase.js';

export const JWT_SECRET = 'integration-test-secret-that-is-long-enough-123';
export const ALLOWED_ORIGIN = 'http://localhost:5173';

/** The origin activation and reset links in test e-mails point at. */
export const APP_BASE_URL = 'http://localhost:5173';

/**
 * bcrypt cost 4: still a real hash the column's format check accepts, but fast
 * enough that a test can set a dozen passwords.
 */
export const TEST_HASH_ROUNDS = 4;

/**
 * The app plus the mailer it was built with, so a test can read the activation
 * link out of the message the request sent.
 */
export function buildAppWithMail(pool: Pool = getTestPool()): {
  app: ReturnType<typeof createApp>;
  mailer: MemoryMailer;
} {
  const mailer = createMemoryMailer();
  const app = createApp({
    corsOrigins: [ALLOWED_ORIGIN],
    jsonBodyLimit: '100kb',
    cookieSecure: false,
    services: createServices(pool, {
      jwtSecret: JWT_SECRET,
      appBaseUrl: APP_BASE_URL,
      mailer,
      passwordHashRounds: TEST_HASH_ROUNDS,
    }),
  });
  return { app, mailer };
}

export function buildApp(pool: Pool = getTestPool()) {
  return buildAppWithMail(pool).app;
}

/** The `token` query parameter of the single link in an e-mail's text. */
export function tokenFromEmail(text: string): string {
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No activation token found in the e-mail:\n${text}`);
  }
  return match[1];
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
