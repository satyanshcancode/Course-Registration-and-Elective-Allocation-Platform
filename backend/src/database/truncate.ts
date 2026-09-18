import type { ClientBase } from 'pg';

/**
 * Empties every application table (keeping schema_migrations) and resets
 * identity columns and owned sequences. Used by the seed script and by
 * integration tests between cases.
 */
export async function truncateApplicationTables(client: Pick<ClientBase, 'query'>): Promise<void> {
  // Table names come from the catalogue and are quoted with format('%I');
  // identifiers cannot be passed as bind parameters.
  const result = await client.query<{ tables: string | null }>(
    `SELECT string_agg(format('%I', tablename), ', ' ORDER BY tablename) AS tables
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  const tables = result.rows[0]?.tables;
  if (tables) {
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  }
}
