/**
 * CLI: `npm run demo:seat-race [-- --students=100 --seats=10]`
 *
 * The live demonstration of the add/drop seat race: 100 students, 10 seats, one
 * instant. It fires every request at the RUNNING API over real HTTP, then asks
 * the database what it actually holds — because the only honest evidence that a
 * seat cannot be taken twice is that it wasn't.
 *
 * What it prepares first, and why:
 *
 *   1. It picks the offered course with the SHORTEST waitlist, and raises that
 *      course's capacity through the admin capacity endpoint until exactly
 *      `--seats` seats are free. The endpoint is the real one, so everybody
 *      already waiting for the course is promoted into the new seats first —
 *      which is the point: the race must be for seats nobody is owed, not for
 *      seats that belong to a queue.
 *   2. It opens the add/drop period through the admin endpoint.
 *   3. It finds `--students` students who hold no elective and are eligible for
 *      that course, by reading each one's own add/drop page.
 *   4. It releases one "add, or join the waitlist if full" request per student,
 *      all together, each with its own idempotency key.
 *
 * Nothing here is a shortcut UPDATE except the reads. Afterwards,
 * `npm run demo:reset -- --stage=add-drop` puts the database back.
 *
 * Sessions are minted here with the same JWT secret the API verifies, which
 * keeps the burst to the requests being measured instead of 100 sign-ins. It
 * refuses to run with NODE_ENV=production.
 */
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { IDEMPOTENCY_KEY_HEADER, type AddDropResult, type AddDropView } from '@course-reg/shared';
import { appEnvSchema, loadEnv } from '../config/env.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../config/session.js';
import { createPool } from '../database/pool.js';
import { logger } from '../utils/logger.js';

const DEFAULTS = { students: 100, seats: 10, api: 'http://localhost:4000/api' };
/** How many capacity nudges it may take to land on exactly `seats` free. */
const MAX_CAPACITY_ROUNDS = 6;

interface Options {
  students: number;
  seats: number;
  apiUrl: string;
}

function readOptions(argv: readonly string[]): Options {
  const value = (name: string) =>
    argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const students = Number(value('students') ?? DEFAULTS.students);
  const seats = Number(value('seats') ?? DEFAULTS.seats);
  if (!Number.isInteger(students) || students < 1 || students > 500) {
    throw new Error('--students must be a whole number between 1 and 500');
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > students) {
    throw new Error('--seats must be a whole number between 1 and --students');
  }
  return { students, seats, apiUrl: (value('api') ?? DEFAULTS.api).replace(/\/$/, '') };
}

class ApiClient {
  constructor(private readonly baseUrl: string) {}

  request(
    path: string,
    cookie: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: new Headers({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookie,
        ...options.headers,
      }),
      body: options.body === undefined ? null : JSON.stringify(options.body),
    });
  }
}

function sessionFor(userId: string, role: 'STUDENT' | 'ADMIN', secret: string): string {
  const token = jwt.sign({ role }, secret, { subject: userId, expiresIn: SESSION_TTL_SECONDS });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** The `data` of an ApiResponse envelope, or a thrown explanation. */
async function dataOf<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    message?: string;
  } | null;
  if (!response.ok || body?.success !== true || body.data === undefined) {
    throw new Error(`${what} failed (HTTP ${response.status}): ${body?.message ?? 'no message'}`);
  }
  return body.data;
}

async function findAllocatedWindow(pool: Pool): Promise<{ id: string; name: string }> {
  const result = await pool.query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM registration_windows ORDER BY starts_at DESC LIMIT 1`,
  );
  const window = result.rows[0];
  if (!window) {
    throw new Error('No registration window exists. Run `npm run seed` first.');
  }
  if (window.status !== 'ALLOCATED') {
    throw new Error(
      `Window "${window.name}" is ${window.status}; run \`npm run demo:reset -- --stage=allocated\` first.`,
    );
  }
  return { id: window.id, name: window.name };
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

interface Offering {
  courseId: string;
  code: string;
  name: string;
  capacity: number;
  allocated: number;
  waiting: number;
}

async function listOfferings(pool: Pool, windowId: string): Promise<Offering[]> {
  const result = await pool.query<{
    course_id: string;
    code: string;
    name: string;
    capacity: number;
    allocated_count: number;
    waiting: string;
  }>(
    `SELECT o.course_id, c.code, c.name, o.capacity, o.allocated_count,
            (SELECT count(*) FROM waitlist_entries w
              WHERE w.window_id = o.window_id AND w.course_id = o.course_id
                AND w.status = 'WAITING') AS waiting
     FROM registration_window_courses o
     JOIN courses c ON c.id = o.course_id
     WHERE o.window_id = $1
     ORDER BY c.code`,
    [windowId],
  );
  return result.rows.map((row) => ({
    courseId: row.course_id,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    allocated: row.allocated_count,
    waiting: Number(row.waiting),
  }));
}

async function readSeats(pool: Pool, windowId: string, courseId: string): Promise<Offering> {
  const result = await pool.query<{
    code: string;
    name: string;
    capacity: number;
    allocated_count: number;
    waiting: string;
  }>(
    `SELECT c.code, c.name, o.capacity, o.allocated_count,
            (SELECT count(*) FROM waitlist_entries w
              WHERE w.window_id = o.window_id AND w.course_id = o.course_id
                AND w.status = 'WAITING') AS waiting
     FROM registration_window_courses o
     JOIN courses c ON c.id = o.course_id
     WHERE o.window_id = $1 AND o.course_id = $2`,
    [windowId, courseId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('The chosen course vanished from the window.');
  }
  return {
    courseId,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    allocated: row.allocated_count,
    waiting: Number(row.waiting),
  };
}

/**
 * Raises the course's capacity through the admin endpoint until exactly `seats`
 * are free. Each call promotes whoever is waiting, so it can take a couple of
 * rounds to settle — which is exactly the behaviour being relied on.
 */
async function prepareSeats(
  api: ApiClient,
  pool: Pool,
  adminCookie: string,
  windowId: string,
  course: Offering,
  seats: number,
): Promise<Offering> {
  let current = course;
  for (let round = 0; round < MAX_CAPACITY_ROUNDS; round += 1) {
    const free = current.capacity - current.allocated;
    if (free === seats && current.waiting === 0) {
      return current;
    }
    // Room for everybody already waiting, plus the seats the race is for.
    const capacity = current.allocated + current.waiting + seats;
    const response = await api.request(
      `/admin/courses/${encodeURIComponent(current.code)}/capacity`,
      adminCookie,
      {
        method: 'PATCH',
        body: { capacity, reason: 'demo:seat-race preparing a race for the free seats' },
      },
    );
    await dataOf(response, `Setting ${current.code} capacity to ${capacity}`);
    current = await readSeats(pool, windowId, current.courseId);
  }
  throw new Error(
    `Could not settle ${current.code} on exactly ${seats} free seats ` +
      `(capacity ${current.capacity}, taken ${current.allocated}, waiting ${current.waiting}).`,
  );
}

/** Opens an add/drop period that covers now, through the admin endpoint. */
async function openAddDropPeriod(api: ApiClient, adminCookie: string): Promise<void> {
  const hour = 3_600_000;
  const response = await api.request('/admin/registration-window/add-drop', adminCookie, {
    method: 'PUT',
    body: {
      opensAt: new Date(Date.now() - hour).toISOString(),
      closesAt: new Date(Date.now() + 24 * hour).toISOString(),
      reason: 'demo:seat-race',
    },
  });
  await dataOf(response, 'Opening the add/drop period');
}

interface Racer {
  userId: string;
  rollNumber: string;
  cookie: string;
  idempotencyKey: string;
}

/** Students with no ACTIVE enrolment in this window, in roll-number order. */
async function findCandidates(
  pool: Pool,
  windowId: string,
  limit: number,
): Promise<{ userId: string; rollNumber: string }[]> {
  const result = await pool.query<{ user_id: string; roll_number: string }>(
    `SELECT s.user_id, s.roll_number
     FROM students s
     WHERE NOT EXISTS (
       SELECT 1 FROM enrollments e
       WHERE e.student_id = s.user_id AND e.window_id = $1 AND e.status = 'ACTIVE'
     )
     ORDER BY s.roll_number
     LIMIT $2`,
    [windowId, limit],
  );
  return result.rows.map((row) => ({ userId: row.user_id, rollNumber: row.roll_number }));
}

/** One candidate with the courses the server says they could take. */
interface Surveyed {
  userId: string;
  rollNumber: string;
  cookie: string;
  eligibleCodes: Set<string>;
}

/** Pages read at a time, so the survey is not one request per round trip. */
const SURVEY_BATCH = 20;

/**
 * Asks each candidate's OWN add/drop page which courses they could take.
 *
 * The page lists only courses the caller is eligible for, so this is the
 * server's answer to "are you eligible for this, and free to take it?" — not a
 * second copy of the eligibility rules living in this script.
 */
async function survey(
  api: ApiClient,
  secret: string,
  candidates: readonly { userId: string; rollNumber: string }[],
): Promise<Surveyed[]> {
  const surveyed: Surveyed[] = [];
  for (let start = 0; start < candidates.length; start += SURVEY_BATCH) {
    const pages = await Promise.all(
      candidates.slice(start, start + SURVEY_BATCH).map(async (candidate) => {
        const cookie = sessionFor(candidate.userId, 'STUDENT', secret);
        const response = await api.request('/add-drop', cookie);
        if (!response.ok) {
          return null;
        }
        const view = await dataOf<AddDropView>(response, 'Reading a student add/drop page');
        // Somebody holding a seat cannot add; they would have to swap.
        if (view.held !== null) {
          return null;
        }
        return {
          ...candidate,
          cookie,
          eligibleCodes: new Set([...view.available, ...view.full].map((course) => course.code)),
        };
      }),
    );
    for (const page of pages) {
      if (page) {
        surveyed.push(page);
      }
    }
  }
  return surveyed;
}

/**
 * The course the most free students could actually take, with the shortest
 * queue breaking ties.
 *
 * Picking by queue length alone is not enough: the shortest queue in the demo
 * data belongs to a second-year course nearly everybody has already passed, and
 * a race needs a hundred students who are genuinely allowed in.
 */
function pickCourse(
  offerings: readonly Offering[],
  surveyed: readonly Surveyed[],
  wanted: number,
): { course: Offering; eligible: Surveyed[] } {
  const ranked = offerings
    .map((course) => ({
      course,
      eligible: surveyed.filter((student) => student.eligibleCodes.has(course.code)),
    }))
    .sort((a, b) => b.eligible.length - a.eligible.length || a.course.waiting - b.course.waiting);
  const best = ranked[0];
  if (!best || best.eligible.length < wanted) {
    throw new Error(
      `No offered course has ${wanted} free, eligible students ` +
        `(the best is ${best?.course.code ?? 'none'} with ${best?.eligible.length ?? 0}). ` +
        'Run `npm run demo:reset -- --stage=allocated` first.',
    );
  }
  return best;
}

/** Who still holds no seat, after the capacity change promoted people. */
async function stillFree(
  pool: Pool,
  windowId: string,
  eligible: readonly Surveyed[],
  wanted: number,
): Promise<Racer[]> {
  const result = await pool.query<{ student_id: string }>(
    `SELECT student_id FROM enrollments
     WHERE window_id = $1 AND status = 'ACTIVE' AND student_id = ANY($2::uuid[])`,
    [windowId, eligible.map((student) => student.userId)],
  );
  const taken = new Set(result.rows.map((row) => row.student_id));
  return eligible
    .filter((student) => !taken.has(student.userId))
    .slice(0, wanted)
    .map((student) => ({
      userId: student.userId,
      rollNumber: student.rollNumber,
      cookie: student.cookie,
      idempotencyKey: randomUUID(),
    }));
}

interface Burst {
  requestsSent: number;
  byStatus: Map<number, number>;
  byOutcome: Map<string, number>;
  elapsedMs: number;
}

/** Every request released together: one "add, or waitlist if full" each. */
async function fireBurst(api: ApiClient, code: string, racers: readonly Racer[]): Promise<Burst> {
  const startedAt = Date.now();
  const responses = await Promise.all(
    racers.map((racer) =>
      api.request('/add-drop/add', racer.cookie, {
        method: 'POST',
        headers: { [IDEMPOTENCY_KEY_HEADER]: racer.idempotencyKey },
        body: { code, waitlistIfFull: true },
      }),
    ),
  );

  const byStatus = new Map<number, number>();
  const byOutcome = new Map<string, number>();
  for (const response of responses) {
    byStatus.set(response.status, (byStatus.get(response.status) ?? 0) + 1);
    if (response.status !== 200) {
      continue;
    }
    const result = await dataOf<AddDropResult>(response, 'Reading an add reply');
    byOutcome.set(result.result.outcome, (byOutcome.get(result.result.outcome) ?? 0) + 1);
  }
  return {
    requestsSent: responses.length,
    byStatus,
    byOutcome,
    elapsedMs: Date.now() - startedAt,
  };
}

interface Audit {
  capacity: number;
  enrolled: number;
  waitlisted: number;
  overbooked: number;
  duplicateEnrollments: number;
  positionsUnique: boolean;
  positionsConsecutive: boolean;
  firstPosition: number;
  lastPosition: number;
}

/** What the database actually holds, for the racers only. */
async function auditDatabase(
  pool: Pool,
  windowId: string,
  course: Offering,
  racers: readonly Racer[],
): Promise<Audit> {
  const ids = racers.map((racer) => racer.userId);
  const result = await pool.query<Record<string, string>>(
    `WITH positions AS (
       SELECT w.position
       FROM waitlist_entries w
       WHERE w.window_id = $1 AND w.course_id = $2 AND w.status = 'WAITING'
         AND w.student_id = ANY($3::uuid[])
     )
     SELECT
       (SELECT capacity FROM registration_window_courses
         WHERE window_id = $1 AND course_id = $2)::text AS capacity,
       (SELECT count(*) FROM enrollments
         WHERE window_id = $1 AND course_id = $2 AND status = 'ACTIVE'
           AND student_id = ANY($3::uuid[]))::text AS enrolled,
       (SELECT count(*) FROM positions)::text AS waitlisted,
       -- Seats held beyond capacity, across the whole offering.
       (SELECT greatest(0, count(*) - max(o.capacity))
          FROM enrollments e
          JOIN registration_window_courses o
            ON o.window_id = e.window_id AND o.course_id = e.course_id
         WHERE e.window_id = $1 AND e.course_id = $2 AND e.status = 'ACTIVE')::text
         AS overbooked,
       -- Any racer holding two ACTIVE seats anywhere in the window.
       (SELECT coalesce(sum(extra), 0) FROM (
          SELECT count(*) - 1 AS extra FROM enrollments
           WHERE window_id = $1 AND status = 'ACTIVE' AND student_id = ANY($3::uuid[])
           GROUP BY student_id HAVING count(*) > 1
        ) d)::text AS "duplicateEnrollments",
       (SELECT count(DISTINCT position) FROM positions)::text AS "distinctPositions",
       (SELECT coalesce(min(position), 0) FROM positions)::text AS "firstPosition",
       (SELECT coalesce(max(position), 0) FROM positions)::text AS "lastPosition"`,
    [windowId, course.courseId, ids],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Audit query returned no row');
  }
  const number = (key: string) => Number(row[key] ?? '0');
  const waitlisted = number('waitlisted');
  return {
    capacity: number('capacity'),
    enrolled: number('enrolled'),
    waitlisted,
    overbooked: number('overbooked'),
    duplicateEnrollments: number('duplicateEnrollments'),
    positionsUnique: number('distinctPositions') === waitlisted,
    positionsConsecutive:
      waitlisted === 0 || number('lastPosition') - number('firstPosition') + 1 === waitlisted,
    firstPosition: number('firstPosition'),
    lastPosition: number('lastPosition'),
  };
}

function report(
  windowName: string,
  course: Offering,
  seats: number,
  racers: readonly Racer[],
  burst: Burst,
  audit: Audit,
): boolean {
  const checks: [string, boolean, string][] = [
    ['enrolled', audit.enrolled === seats, `${audit.enrolled} (must be ${seats})`],
    [
      'waitlisted',
      audit.waitlisted === racers.length - seats,
      `${audit.waitlisted} (must be ${racers.length - seats})`,
    ],
    ['overbooked', audit.overbooked === 0, `${audit.overbooked} (must be 0)`],
    [
      'duplicate enrollments',
      audit.duplicateEnrollments === 0,
      `${audit.duplicateEnrollments} (must be 0)`,
    ],
    [
      'waitlist positions unique',
      audit.positionsUnique,
      `${audit.waitlisted} entries, all distinct`,
    ],
    [
      'waitlist positions consecutive',
      audit.positionsConsecutive,
      `${audit.firstPosition}–${audit.lastPosition} for ${audit.waitlisted} entries`,
    ],
  ];

  const format = (map: Map<string | number, number>) =>
    [...map.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, count]) => `${String(key)}×${count}`)
      .join('  ');

  const lines = [
    '',
    `Add/drop seat race — ${windowName}`,
    '='.repeat(64),
    `  course                ${course.code} ${course.name}`,
    `  capacity              ${audit.capacity}, with ${seats} free when the burst was released`,
    `  students racing       ${racers.length}, none holding an elective`,
    `  requests sent         ${burst.requestsSent} (one "add, or waitlist if full" each)`,
    `  responses             ${format(burst.byStatus)}`,
    `  outcomes              ${format(burst.byOutcome)}`,
    `  wall time             ${burst.elapsedMs} ms`,
    '',
    ...checks.map(
      ([name, ok, detail]) => `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`,
    ),
    '='.repeat(64),
    '  Restore the demo state with: npm run demo:reset -- --stage=add-drop',
    '',
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
      'demo:seat-race changes capacities and enrolments; it will not run in production',
    );
  }
  const options = readOptions(process.argv.slice(2));
  const api = new ApiClient(options.apiUrl);
  const pool = createPool(env.DATABASE_URL);

  try {
    const window = await findAllocatedWindow(pool);
    const adminCookie = sessionFor(await findAdminId(pool), 'ADMIN', env.JWT_SECRET);

    // Over-fetch: a student may be ineligible for whichever course is chosen.
    const candidates = await findCandidates(pool, window.id, options.students * 4);
    const surveyed = await survey(api, env.JWT_SECRET, candidates);
    const picked = pickCourse(await listOfferings(pool, window.id), surveyed, options.students);

    const course = await prepareSeats(
      api,
      pool,
      adminCookie,
      window.id,
      picked.course,
      options.seats,
    );
    await openAddDropPeriod(api, adminCookie);
    logger.info('demo:seat-race prepared', {
      course: course.code,
      capacity: course.capacity,
      free: course.capacity - course.allocated,
      eligibleAndFree: picked.eligible.length,
    });

    // Raising the capacity promoted whoever was waiting, and some of them were
    // in the surveyed pool — so who is still free is asked again, not assumed.
    const racers = await stillFree(pool, window.id, picked.eligible, options.students);
    if (racers.length < options.students) {
      throw new Error(
        `Only ${racers.length} of ${options.students} surveyed students are still free for ` +
          `${course.code}. Run \`npm run demo:reset -- --stage=allocated\` first.`,
      );
    }

    const burst = await fireBurst(api, course.code, racers);
    const audit = await auditDatabase(pool, window.id, course, racers);
    if (!report(window.name, course, options.seats, racers, burst, audit)) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error('demo:seat-race failed', { error });
  process.exitCode = 1;
});
