/**
 * CLI: `npm run demo:reset -- --stage=<draft|open|closed|allocated|add-drop>`
 *
 * Puts the development database into a known state before a demonstration, so
 * a live walk-through always starts from the same place.
 *
 * The stages are cumulative and each one goes through the REAL service, not a
 * shortcut UPDATE: closing the window freezes the policy and notifies every
 * student, and allocating runs the same transaction the admin's button runs.
 * A demo that is set up by hand proves nothing about the app.
 *
 * It refuses to run with NODE_ENV=production.
 */
import type { Pool } from 'pg';
import { appEnvSchema, loadEnv } from '../config/env.js';
import { createServices } from '../container.js';
import { createPool } from '../database/pool.js';
import { seedDatabase } from '../database/seeds/seedDatabase.js';
import { seedDemoSubmissions } from '../database/seeds/demoSubmissions.js';
import { logger } from '../utils/logger.js';

export const DEMO_STAGES = ['draft', 'open', 'closed', 'allocated', 'add-drop'] as const;

/** How long the demo's add/drop period runs, relative to now, in hours. */
const ADD_DROP_HOURS = { from: -1, to: 24 } as const;
export type DemoStage = (typeof DEMO_STAGES)[number];

function isStage(value: string): value is DemoStage {
  return (DEMO_STAGES as readonly string[]).includes(value);
}

function readStage(argv: readonly string[]): DemoStage {
  const raw = argv.find((arg) => arg.startsWith('--stage='))?.slice('--stage='.length) ?? 'open';
  if (!isStage(raw)) {
    throw new Error(`Unknown stage ${JSON.stringify(raw)}. Use one of: ${DEMO_STAGES.join(', ')}.`);
  }
  return raw;
}

async function findAdminId(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1`,
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('No admin account exists; the seed did not run.');
  }
  return id;
}

/** What the database holds once the stage is reached. */
async function summarise(pool: Pool) {
  const result = await pool.query<Record<string, string>>(
    `SELECT
       (SELECT status FROM registration_windows ORDER BY starts_at DESC LIMIT 1) AS window_status,
       (SELECT count(*)::text FROM preference_submissions WHERE status = 'SUBMITTED') AS submissions,
       (SELECT count(*)::text FROM enrollments WHERE status = 'ACTIVE') AS enrollments,
       (SELECT count(*)::text FROM waitlist_entries WHERE status = 'WAITING') AS waitlist,
       (SELECT coalesce(max(allocated_count), 0)::text
          FROM registration_window_courses o
          JOIN courses c ON c.id = o.course_id
         WHERE c.code = 'CS401') AS ai_allocated,
       (SELECT CASE
                 WHEN add_drop_opens_at IS NULL THEN 'not scheduled'
                 WHEN now() BETWEEN add_drop_opens_at AND add_drop_closes_at THEN 'open'
                 ELSE 'closed'
               END
          FROM registration_windows ORDER BY starts_at DESC LIMIT 1) AS add_drop`,
  );
  return result.rows[0] ?? {};
}

async function reachStage(pool: Pool, stage: DemoStage): Promise<void> {
  const env = loadEnv(appEnvSchema);

  // draft: the base seed, which wipes application data first.
  const seeded = await seedDatabase(pool, { logger });
  logger.info('Demo reset: base seed', { ...seeded });
  if (stage === 'draft') {
    return;
  }

  // open: ~150 realistic submissions, aarav and priya deliberately without one.
  const submissions = await seedDemoSubmissions(pool, { logger });
  logger.info('Demo reset: submissions', { ...submissions });
  if (stage === 'open') {
    return;
  }

  const services = createServices(pool, { jwtSecret: env.JWT_SECRET });
  const adminId = await findAdminId(pool);

  // closed: through the real service, so the audit row and the notifications
  // exist exactly as they would on the day.
  await services.registrationWindowService.close(adminId, {
    reason: 'Demo reset: closing registration',
  });
  logger.info('Demo reset: window closed');
  if (stage === 'closed') {
    return;
  }

  // allocated: the same transaction the admin's "Run allocation" button runs.
  const run = await services.allocationService.run(adminId, 'Demo reset: allocation run');
  logger.info('Demo reset: allocation complete', {
    runId: run.id,
    method: run.method,
    allocated: run.metrics?.allocated ?? 0,
    justifiedEnvy: run.metrics?.justifiedEnvy ?? 0,
  });
  if (stage === 'allocated') {
    return;
  }

  // add-drop: the period an admin opens once results are published, through the
  // real service, so the audit row exists exactly as it would on the day.
  const hour = 3_600_000;
  await services.registrationWindowService.setAddDropPeriod(adminId, {
    opensAt: new Date(Date.now() + ADD_DROP_HOURS.from * hour).toISOString(),
    closesAt: new Date(Date.now() + ADD_DROP_HOURS.to * hour).toISOString(),
    reason: 'Demo reset: opening add/drop',
  });
  logger.info('Demo reset: add/drop period open');
}

async function main(): Promise<void> {
  const env = loadEnv(appEnvSchema);
  if (env.NODE_ENV === 'production') {
    throw new Error('demo:reset wipes and rebuilds the database; it will not run in production');
  }
  const stage = readStage(process.argv.slice(2));
  const pool = createPool(env.DATABASE_URL);
  try {
    await reachStage(pool, stage);
    const summary = await summarise(pool);
    process.stdout.write(
      `\nDemo database is at stage "${stage}"\n` +
        `  window          ${summary.window_status ?? '—'}\n` +
        `  submissions     ${summary.submissions ?? '0'}\n` +
        `  enrollments     ${summary.enrollments ?? '0'}\n` +
        `  waitlist        ${summary.waitlist ?? '0'}\n` +
        `  CS401 allocated ${summary.ai_allocated ?? '0'}\n` +
        `  add/drop        ${summary.add_drop ?? '—'}\n\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error('demo:reset failed', { error });
  process.exitCode = 1;
});
