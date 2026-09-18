import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import type { Logger } from '../utils/logger.js';
import { withTransaction } from './transaction.js';

export interface MigrationFile {
  /** Four-digit ordering prefix, e.g. "0001". */
  version: string;
  /** Descriptive part of the filename, e.g. "create_schema_migrations". */
  name: string;
  fileName: string;
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Arbitrary constant key so concurrent runners (e.g. two containers) serialise. */
const MIGRATION_LOCK_KEY = 4_815_162_342;

/** Parses and orders migration filenames; throws on malformed or duplicate versions. */
export function parseMigrationFileNames(fileNames: readonly string[]): MigrationFile[] {
  const migrations = fileNames
    .filter((fileName) => fileName.endsWith('.sql'))
    .map((fileName): MigrationFile => {
      const match = MIGRATION_FILE_PATTERN.exec(fileName);
      const version = match?.[1];
      const name = match?.[2];
      if (version === undefined || name === undefined) {
        throw new Error(
          `Invalid migration filename "${fileName}". Expected NNNN_lower_snake_name.sql`,
        );
      }
      return { version, name, fileName };
    })
    .sort((a, b) => a.version.localeCompare(b.version));

  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}`);
    }
    seen.add(migration.version);
  }
  return migrations;
}

export function selectPendingMigrations(
  migrations: readonly MigrationFile[],
  appliedVersions: ReadonlySet<string>,
): MigrationFile[] {
  return migrations.filter((migration) => !appliedVersions.has(migration.version));
}

async function readAppliedVersions(client: PoolClient): Promise<Set<string>> {
  // Before migration 0001 has run, the tracking table does not exist yet.
  const exists = await client.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.schema_migrations')::text AS table_name",
  );
  if (exists.rows[0]?.table_name == null) {
    return new Set();
  }
  const applied = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(applied.rows.map((row) => row.version));
}

/**
 * Applies every pending .sql migration in `directory`, in version order.
 * Each migration and its schema_migrations row are committed atomically.
 * Returns the migrations that were applied by this call.
 */
export async function runMigrations(
  pool: Pool,
  directory: string,
  logger: Logger,
): Promise<MigrationFile[]> {
  const migrations = parseMigrationFileNames(await readdir(directory));
  const lockClient = await pool.connect();

  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    const pending = selectPendingMigrations(migrations, await readAppliedVersions(lockClient));

    for (const migration of pending) {
      const sql = await readFile(path.join(directory, migration.fileName), 'utf8');
      await withTransaction(pool, async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
      });
      logger.info('Applied migration', { migration: migration.fileName });
    }
    return pending;
  } finally {
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      lockClient.release();
    } catch (unlockError) {
      // Destroying the connection ends the session, which releases the lock.
      logger.warn('Could not release migration lock; discarding connection', {
        error: unlockError,
      });
      lockClient.release(true);
    }
  }
}
