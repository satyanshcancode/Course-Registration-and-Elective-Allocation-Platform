/**
 * Applies pending migrations to the production Supabase database.
 * Reads PRODUCTION_DATABASE_URL from the repo-root .env file.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const out = (line) => process.stdout.write(`${line}\n`);
const errOut = (line) => process.stderr.write(`${line}\n`);

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const envFile = path.join(root, '.env');
const envContent = fs.readFileSync(envFile, 'utf-8');
const match = envContent.match(/^PRODUCTION_DATABASE_URL=(.+)$/m);
if (!match) {
  throw new Error('No PRODUCTION_DATABASE_URL found in .env');
}

const connectionString = match[1].trim();
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const client = await pool.connect();
try {
  out('Connected to Supabase PostgreSQL database.');

  // Lock to avoid concurrent migration runs
  const MIGRATION_LOCK_KEY = 4_815_162_342;
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

  try {
    const appliedRes = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRes.rows.map((r) => r.version));

    const migrationsDir = path.join(root, 'backend/src/database/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      const version = file.slice(0, 4);
      const name = file.slice(5, -4);
      if (appliedVersions.has(version)) {
        continue;
      }

      out(`Applying migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW())',
        [version, name],
      );
      await client.query('COMMIT');
      out(`Successfully applied ${file}.`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }

  // Verify Row Level Security status on all tables in public schema
  const { rows } = await client.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  out('\nRow-Level Security status on Supabase public tables:');
  for (const row of rows) {
    out(`  ${row.tablename.padEnd(30)} rls: ${String(row.rowsecurity)}`);
  }

  const disabled = rows.filter((r) => !r.rowsecurity);
  if (disabled.length > 0) {
    errOut(
      `WARNING: ${disabled.length} tables still have RLS disabled: ${disabled.map((r) => r.tablename).join(', ')}`,
    );
  } else {
    out('\nALL public tables have Row-Level Security enabled!');
  }
} catch (err) {
  errOut(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
