/**
 * Proves the concurrency primitives this app depends on survive Supabase's
 * TRANSACTION pooler (Supavisor, port 6543).
 *
 * Transaction pooling hands a different backend connection to every
 * transaction, so anything that outlives a transaction is unsafe: session
 * advisory locks, `SET` outside a transaction, LISTEN/NOTIFY, server-side
 * cursors. This app was already written the safe way, and this script is what
 * says so rather than assuming it:
 *
 *   1. a transaction is atomic and rolls back as a unit
 *   2. SELECT ... FOR UPDATE actually blocks a second writer
 *   3. pg_advisory_xact_lock excludes a second holder, and is RELEASED at
 *      commit — the property the whole waitlist cascade rests on
 *      (backend/src/repositories/waitlistRepository.ts, docs/CONCURRENCY.md)
 *
 * Point 3's second half is the one that would bite silently: a leaked lock on
 * a pooled connection would deadlock a later, unrelated request.
 *
 * Usage: DATABASE_URL=<transaction pooler URL> node scripts/check-pooler.mjs
 */
import process from 'node:process';
import pg from 'pg';

const CONNECTION_STRING = process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  process.stderr.write('DATABASE_URL is required (use the transaction pooler, port 6543)\n');
  process.exit(1);
}

const LOCK_KEY = 987_654_321;
const out = (line) => process.stdout.write(`${line}\n`);

function client() {
  return new pg.Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed });
  out(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const a = client();
const b = client();
await a.connect();
await b.connect();

try {
  // A scratch table, so nothing here can touch real rows.
  await a.query('CREATE TABLE IF NOT EXISTS pooler_check (id INT PRIMARY KEY, n INT NOT NULL)');
  await a.query(
    'INSERT INTO pooler_check (id, n) VALUES (1, 0) ON CONFLICT (id) DO UPDATE SET n = 0',
  );

  // 1. Atomicity ------------------------------------------------------------
  await a.query('BEGIN');
  await a.query('UPDATE pooler_check SET n = 42 WHERE id = 1');
  await a.query('ROLLBACK');
  const afterRollback = await a.query('SELECT n FROM pooler_check WHERE id = 1');
  record(
    'transaction rolls back as a unit',
    afterRollback.rows[0].n === 0,
    `n=${afterRollback.rows[0].n}`,
  );

  // 2. SELECT ... FOR UPDATE blocks a second writer --------------------------
  await a.query('BEGIN');
  await a.query('SELECT n FROM pooler_check WHERE id = 1 FOR UPDATE');

  await b.query('BEGIN');
  await b.query("SET LOCAL lock_timeout = '1500ms'");
  let blocked = false;
  try {
    await b.query('SELECT n FROM pooler_check WHERE id = 1 FOR UPDATE');
  } catch (error) {
    // 55P03 lock_not_available: it waited and gave up, which is the proof.
    blocked = error.code === '55P03';
  }
  await b.query('ROLLBACK');
  await a.query('COMMIT');
  record('SELECT ... FOR UPDATE blocks a second writer', blocked);

  // 3a. pg_advisory_xact_lock excludes a second holder -----------------------
  await a.query('BEGIN');
  await a.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
  await b.query('BEGIN');
  const contended = await b.query('SELECT pg_try_advisory_xact_lock($1) AS got', [LOCK_KEY]);
  await b.query('ROLLBACK');
  record('pg_advisory_xact_lock excludes a second holder', contended.rows[0].got === false);

  // 3b. ... and is released when the transaction commits ---------------------
  await a.query('COMMIT');
  await b.query('BEGIN');
  const afterCommit = await b.query('SELECT pg_try_advisory_xact_lock($1) AS got', [LOCK_KEY]);
  await b.query('COMMIT');
  record('the advisory lock is released at COMMIT', afterCommit.rows[0].got === true);

  // 3c. ... and nothing is left holding it on any pooled connection ----------
  const leaked = await a.query(
    `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = $1`,
    [LOCK_KEY],
  );
  record(
    'no advisory lock is left behind on the pool',
    leaked.rows[0].n === 0,
    `${leaked.rows[0].n} held`,
  );

  // 4. Parameterised statements (extended protocol) --------------------------
  const params = await a.query('SELECT $1::int + $2::int AS sum', [20, 22]);
  record('parameterised queries work through the pooler', params.rows[0].sum === 42);

  await a.query('DROP TABLE pooler_check');
} finally {
  await a.end();
  await b.end();
}

const failed = results.filter((r) => !r.passed);
out('');
out(`${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
