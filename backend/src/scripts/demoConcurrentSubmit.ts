/**
 * CLI: `npm run demo:concurrent-submit [-- --students=50]`
 *
 * Fires N students at the RUNNING API at the same instant, each one sending
 * their submit twice with the same idempotency key, and then checks the
 * database for what the four guarantees in `docs/CONCURRENCY.md` promise:
 * no duplicate submissions, no partial ones, idempotent retries, and a
 * unique, gap-free arrival order.
 *
 * It talks to the API over HTTP on purpose — the point is to exercise the
 * real middleware, transaction and constraints, not a function call.
 *
 * Sessions are minted here with the same JWT secret the API verifies, which
 * keeps the burst to the requests being measured instead of N sign-ins. It
 * refuses to run with NODE_ENV=production.
 */
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import {
  IDEMPOTENCY_KEY_HEADER,
  MAX_PREFERENCES,
  type EligibilityOverview,
} from '@course-reg/shared';
import { appEnvSchema, loadEnv } from '../config/env.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../config/session.js';
import { createPool } from '../database/pool.js';
import { logger } from '../utils/logger.js';

const DEFAULT_STUDENTS = 50;
const DEFAULT_API_URL = 'http://localhost:4000/api';
/** How many courses each student ranks in the burst. */
const CART_SIZE = 3;

interface Options {
  students: number;
  apiUrl: string;
}

function readOptions(argv: readonly string[]): Options {
  const value = (name: string) =>
    argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const students = Number(value('students') ?? DEFAULT_STUDENTS);
  if (!Number.isInteger(students) || students < 1 || students > 500) {
    throw new Error('--students must be a whole number between 1 and 500');
  }
  return { students, apiUrl: (value('api') ?? DEFAULT_API_URL).replace(/\/$/, '') };
}

interface Participant {
  userId: string;
  rollNumber: string;
  cookie: string;
  courseCodes: string[];
  idempotencyKey: string;
}

/** The eligible course codes out of GET /api/eligibility's envelope. */
function readEligibleCodes(payload: unknown): string[] {
  const data = (payload as { data?: EligibilityOverview | null }).data;
  return (data?.courses ?? []).filter((course) => course.eligible).map((course) => course.code);
}

interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Extra headers as plain pairs, e.g. the idempotency key. */
  headers?: Record<string, string>;
}

class ApiClient {
  constructor(private readonly baseUrl: string) {}

  request(path: string, cookie: string, options: ApiRequest = {}): Promise<Response> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: cookie,
      ...options.headers,
    });
    return fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
    });
  }
}

async function findOpenWindow(pool: Pool): Promise<{ id: string; name: string }> {
  const result = await pool.query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM registration_windows
     ORDER BY starts_at DESC LIMIT 1`,
  );
  const window = result.rows[0];
  if (!window) {
    throw new Error('No registration window exists. Run `npm run seed` first.');
  }
  if (window.status !== 'OPEN') {
    throw new Error(
      `Window "${window.name}" is ${window.status}; run \`npm run demo:reset -- --stage=open\` first.`,
    );
  }
  return { id: window.id, name: window.name };
}

/** Students who have not submitted yet, in roll-number order. */
async function findCandidates(
  pool: Pool,
  windowId: string,
  limit: number,
): Promise<{ userId: string; rollNumber: string }[]> {
  const result = await pool.query<{ user_id: string; roll_number: string }>(
    `SELECT s.user_id, s.roll_number
       FROM students s
       LEFT JOIN preference_submissions ps
         ON ps.student_id = s.user_id AND ps.window_id = $1
      WHERE ps.id IS NULL
      ORDER BY s.roll_number
      LIMIT $2`,
    [windowId, limit],
  );
  return result.rows.map((row) => ({ userId: row.user_id, rollNumber: row.roll_number }));
}

/**
 * Gives every participant a saved draft cart, one at a time-ish, BEFORE the
 * burst: the measurement is about submitting, not about filling a cart.
 */
async function prepareCarts(
  api: ApiClient,
  secret: string,
  candidates: readonly { userId: string; rollNumber: string }[],
): Promise<Participant[]> {
  const prepared = await Promise.all(
    candidates.map(async ({ userId, rollNumber }): Promise<Participant | null> => {
      const token = jwt.sign({ role: 'STUDENT' }, secret, {
        subject: userId,
        expiresIn: SESSION_TTL_SECONDS,
      });
      const cookie = `${SESSION_COOKIE_NAME}=${token}`;

      const eligibility = await api.request('/eligibility', cookie);
      if (!eligibility.ok) {
        return null;
      }
      const courseCodes = readEligibleCodes(await eligibility.json()).slice(
        0,
        Math.min(CART_SIZE, MAX_PREFERENCES),
      );
      if (courseCodes.length === 0) {
        return null;
      }

      const saved = await api.request('/preferences', cookie, {
        method: 'PUT',
        body: { courseCodes },
      });
      if (!saved.ok) {
        return null;
      }
      return { userId, rollNumber, cookie, courseCodes, idempotencyKey: randomUUID() };
    }),
  );
  return prepared.filter((participant): participant is Participant => participant !== null);
}

interface BurstResult {
  requestsSent: number;
  byStatus: Map<number, number>;
  elapsedMs: number;
  /** When the burst was released, so the audit counts only its own rows. */
  startedAt: Date;
}

/** Every request released together: N submits plus N duplicates of them. */
async function fireBurst(api: ApiClient, participants: readonly Participant[]) {
  const send = (participant: Participant) =>
    api.request('/registration/submit', participant.cookie, {
      method: 'POST',
      headers: { [IDEMPOTENCY_KEY_HEADER]: participant.idempotencyKey },
      body: { courseCodes: participant.courseCodes },
    });

  const startedAt = new Date();
  const responses = await Promise.all(
    participants.flatMap((participant) => [send(participant), send(participant)]),
  );
  const byStatus = new Map<number, number>();
  for (const response of responses) {
    byStatus.set(response.status, (byStatus.get(response.status) ?? 0) + 1);
  }
  return {
    requestsSent: responses.length,
    byStatus,
    elapsedMs: Date.now() - startedAt.getTime(),
    startedAt,
  } satisfies BurstResult;
}

interface Audit {
  submissions: number;
  studentsWithSubmission: number;
  duplicates: number;
  partialCarts: number;
  distinctSequences: number;
  minSequence: number;
  maxSequence: number;
  historyRows: number;
  notifications: number;
}

/** What actually landed in the database, for the participants only. */
async function auditDatabase(
  pool: Pool,
  windowId: string,
  participants: readonly Participant[],
  since: Date,
): Promise<Audit> {
  const ids = participants.map((participant) => participant.userId);
  // Each student ranks as many courses as they are eligible for, so "partial"
  // means "fewer items than THIS student sent", not a fixed number.
  const sizes = participants.map((participant) => participant.courseCodes.length);
  const result = await pool.query<Record<keyof Audit, string>>(
    `WITH expected AS (
       SELECT * FROM unnest($2::uuid[], $3::int[]) AS t(student_id, size)
     ), mine AS (
       SELECT ps.id, ps.student_id, ps.submission_sequence
         FROM preference_submissions ps
        WHERE ps.window_id = $1 AND ps.student_id = ANY($2::uuid[]) AND ps.status = 'SUBMITTED'
     )
     SELECT
       (SELECT count(*) FROM mine)::text AS submissions,
       (SELECT count(DISTINCT student_id) FROM mine)::text AS "studentsWithSubmission",
       (SELECT coalesce(sum(extra), 0) FROM (
          SELECT count(*) - 1 AS extra FROM mine GROUP BY student_id HAVING count(*) > 1
        ) d)::text AS duplicates,
       (SELECT count(*) FROM (
          SELECT m.id FROM mine m
            JOIN expected e ON e.student_id = m.student_id
            LEFT JOIN preference_items pi ON pi.submission_id = m.id
           GROUP BY m.id, e.size HAVING count(pi.*) <> e.size
        ) p)::text AS "partialCarts",
       (SELECT count(DISTINCT submission_sequence) FROM mine)::text AS "distinctSequences",
       (SELECT coalesce(min(submission_sequence), 0) FROM mine)::text AS "minSequence",
       (SELECT coalesce(max(submission_sequence), 0) FROM mine)::text AS "maxSequence",
       (SELECT count(*) FROM registration_history
         WHERE window_id = $1 AND event_type = 'SUBMITTED' AND student_id = ANY($2::uuid[])
       )::text AS "historyRows",
       (SELECT count(*) FROM notifications
         WHERE user_id = ANY($2::uuid[]) AND type = 'SYSTEM' AND created_at >= $4
       )::text AS notifications`,
    [windowId, ids, sizes, since],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Audit query returned no row');
  }
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  ) as unknown as Audit;
}

function report(
  windowName: string,
  participants: readonly Participant[],
  burst: BurstResult,
  audit: Audit,
): boolean {
  const accepted = burst.byStatus.get(200) ?? 0;
  const replays = accepted - audit.submissions;
  const gapFree =
    audit.submissions === 0 || audit.maxSequence - audit.minSequence + 1 === audit.submissions;

  const checks: [string, boolean, string][] = [
    ['duplicate submissions', audit.duplicates === 0, `${audit.duplicates} (must be 0)`],
    ['partial carts', audit.partialCarts === 0, `${audit.partialCarts} (must be 0)`],
    [
      'one submission per student',
      audit.submissions === audit.studentsWithSubmission &&
        audit.submissions === participants.length,
      `${audit.submissions} submissions for ${participants.length} students`,
    ],
    [
      'sequence numbers unique',
      audit.distinctSequences === audit.submissions,
      `${audit.distinctSequences} distinct of ${audit.submissions}`,
    ],
    [
      'sequence numbers gap-free',
      gapFree,
      `${audit.minSequence}–${audit.maxSequence} for ${audit.submissions} submissions`,
    ],
    [
      'exactly one history row each',
      audit.historyRows === participants.length,
      `${audit.historyRows}`,
    ],
    [
      'exactly one notification each',
      audit.notifications === participants.length,
      `${audit.notifications}`,
    ],
  ];

  const statuses = [...burst.byStatus.entries()]
    .sort(([a], [b]) => a - b)
    .map(([status, count]) => `${status}×${count}`)
    .join('  ');

  const lines = [
    '',
    `Concurrent submit demo — ${windowName}`,
    '='.repeat(56),
    `  students              ${participants.length}`,
    `  requests sent         ${burst.requestsSent} (each student submits twice with one key)`,
    `  responses             ${statuses}`,
    `  wall time             ${burst.elapsedMs} ms`,
    '',
    `  submissions created   ${audit.submissions}`,
    `  idempotent replays    ${replays}`,
    '',
    ...checks.map(
      ([name, ok, detail]) => `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${detail}`,
    ),
    '='.repeat(56),
  ];
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
  return checks.every(([, ok]) => ok);
}

async function main(): Promise<void> {
  const env = loadEnv(appEnvSchema);
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'demo:concurrent-submit writes demo submissions; it will not run in production',
    );
  }
  const options = readOptions(process.argv.slice(2));
  const api = new ApiClient(options.apiUrl);
  const pool = createPool(env.DATABASE_URL);

  try {
    const window = await findOpenWindow(pool);
    // Over-fetch: a student eligible for nothing cannot take part, and the
    // demo should still show the number that was asked for.
    const candidates = await findCandidates(pool, window.id, options.students * 3);
    if (candidates.length === 0) {
      throw new Error(
        'Every student has already submitted. Run `npm run demo:reset -- --stage=open` first.',
      );
    }

    const prepared = await prepareCarts(api, env.JWT_SECRET, candidates);
    const participants = prepared.slice(0, options.students);
    if (participants.length === 0) {
      throw new Error(
        'No student could save a cart; is the API running at ' + options.apiUrl + '?',
      );
    }

    const burst = await fireBurst(api, participants);
    const audit = await auditDatabase(pool, window.id, participants, burst.startedAt);
    if (!report(window.name, participants, burst, audit)) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error('demo:concurrent-submit failed', { error });
  process.exitCode = 1;
});
