/**
 * Connection to the isolated integration-test database.
 *
 * The URL is TEST_DATABASE_URL if set, otherwise DATABASE_URL with "_test"
 * appended to the database name (the postgres container creates that
 * database on first start). Every helper refuses to run against a database
 * whose name does not end in "_test", so the dev database is never touched.
 */
import { Client, Pool } from 'pg';
import { loadDotEnvFile } from '../../src/config/env.js';

const TEST_DATABASE_SUFFIX = '_test';

export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  loadDotEnvFile();
  const explicit = env.TEST_DATABASE_URL;
  if (explicit) {
    return explicit;
  }
  const base = env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'Integration tests need DATABASE_URL or TEST_DATABASE_URL (see .env.example). ' +
        'Start PostgreSQL with `npm run docker:up`.',
    );
  }
  const url = new URL(base);
  url.pathname = `/${databaseNameOf(base)}${TEST_DATABASE_SUFFIX}`;
  return url.toString();
}

export function assertTestDatabase(url: string): void {
  const name = databaseNameOf(url);
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to use "${name}" for tests: name must end in "${TEST_DATABASE_SUFFIX}"`,
    );
  }
}

/** Creates the test database if it is missing (e.g. an older postgres volume). */
export async function ensureTestDatabaseExists(url: string): Promise<void> {
  assertTestDatabase(url);
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const name = databaseNameOf(url);
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      // Identifiers cannot be bind parameters; escapeIdentifier quotes safely.
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    }
  } finally {
    await client.end();
  }
}

let pool: Pool | undefined;

/** Pool shared by the tests of one file (one Vitest module scope). */
export function getTestPool(): Pool {
  if (!pool) {
    const url = resolveTestDatabaseUrl();
    assertTestDatabase(url);
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

export async function closeTestPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
