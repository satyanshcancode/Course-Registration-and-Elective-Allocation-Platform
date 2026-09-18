/**
 * The seed scripts against the test database: counts, determinism,
 * idempotency, demo accounts and the AI oversubscription case.
 */
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { seedDemoSubmissions } from '../../src/database/seeds/demoSubmissions.js';
import { seedDatabase } from '../../src/database/seeds/seedDatabase.js';
import { getTestPool } from './testDatabase.js';

const FAST = { passwordHashRounds: 4 };

/** Stable digest of the seeded content (ignores generated ids and timestamps). */
async function dataFingerprint(pool: Pool): Promise<string> {
  const result = await pool.query<{ digest: string }>(`
    SELECT md5(concat_ws('|',
      (SELECT string_agg(concat_ws(',', s.roll_number, s.name, u.email, p.code, s.semester,
                                   s.credits_completed, s.expected_graduation_term), ';'
                         ORDER BY s.roll_number)
         FROM students s JOIN users u ON u.id = s.user_id JOIN programs p ON p.id = s.program_id),
      (SELECT string_agg(concat_ws(',', s.roll_number, c.code, scc.completed_term), ';'
                         ORDER BY s.roll_number, c.code)
         FROM student_completed_courses scc
         JOIN students s ON s.user_id = scc.student_id JOIN courses c ON c.id = scc.course_id),
      (SELECT string_agg(concat_ws(',', c.code, o.capacity), ';' ORDER BY c.code)
         FROM registration_window_courses o JOIN courses c ON c.id = o.course_id)
    )) AS digest`);
  return result.rows[0]?.digest ?? '';
}

async function submissionsFingerprint(pool: Pool): Promise<string> {
  const result = await pool.query<{ digest: string }>(`
    SELECT md5(string_agg(concat_ws(',', ps.submission_sequence, s.roll_number, ps.idempotency_key,
                                    pi.rank, c.code), ';'
                          ORDER BY ps.submission_sequence, pi.rank)) AS digest
    FROM preference_submissions ps
    JOIN students s ON s.user_id = ps.student_id
    JOIN preference_items pi ON pi.submission_id = ps.id
    JOIN courses c ON c.id = pi.course_id`);
  return result.rows[0]?.digest ?? '';
}

/** Independent SQL formulation of the eligibility rule, for cross-checking. */
async function sqlEligibleCount(pool: Pool, courseCode: string): Promise<number> {
  const result = await pool.query<{ eligible: number }>(
    `SELECT count(*)::int AS eligible
     FROM students s
     JOIN courses c ON c.code = $1
     WHERE s.semester >= c.min_semester
       AND s.credits_completed >= c.min_credits
       AND (NOT EXISTS (SELECT 1 FROM course_eligible_programs e WHERE e.course_id = c.id)
            OR EXISTS (SELECT 1 FROM course_eligible_programs e
                       WHERE e.course_id = c.id AND e.program_id = s.program_id))
       AND NOT EXISTS (SELECT 1 FROM course_prerequisites cp
                       WHERE cp.course_id = c.id
                         AND NOT EXISTS (SELECT 1 FROM student_completed_courses scc
                                         WHERE scc.student_id = s.user_id
                                           AND scc.course_id = cp.prerequisite_course_id))
       AND NOT EXISTS (SELECT 1 FROM student_completed_courses scc
                       WHERE scc.student_id = s.user_id AND scc.course_id = c.id)`,
    [courseCode],
  );
  return result.rows[0]?.eligible ?? -1;
}

async function count(pool: Pool, sql: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<{ n: number }>(sql, values);
  return result.rows[0]?.n ?? -1;
}

describe('seedDatabase', () => {
  it('loads the reference data, ~300 students and a DRAFT Fall 2026 window', async () => {
    const pool = getTestPool();
    const summary = await seedDatabase(pool, FAST);

    expect(summary).toMatchObject({
      departments: 5,
      programs: 5,
      courses: 20,
      students: 300,
      offerings: 20,
    });
    expect(await count(pool, 'SELECT count(*)::int AS n FROM students')).toBe(300);
    expect(await count(pool, "SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).toBe(1);

    const window = await pool.query<{ status: string; config: unknown; random_seed: string }>(
      "SELECT status, config, random_seed FROM registration_windows WHERE name = 'Fall 2026'",
    );
    expect(window.rows[0]).toMatchObject({
      status: 'DRAFT',
      random_seed: '2026091801',
      config: {
        method: 'PREFERENCE_PRIORITY',
        preferenceWeights: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 },
        priorityPoints: { finalYear: 20, programRelevance: 25, graduationUrgency: 40 },
      },
    });
  });

  it('creates the AI oversubscription case, agreeing with an independent SQL check', async () => {
    const pool = getTestPool();
    const summary = await seedDatabase(pool, FAST);

    expect(summary.aiEligibleStudents).toBeGreaterThanOrEqual(100);
    expect(await sqlEligibleCount(pool, 'CS401')).toBe(summary.aiEligibleStudents);
    expect(
      await count(
        pool,
        `SELECT o.capacity AS n FROM registration_window_courses o
         JOIN courses c ON c.id = o.course_id WHERE c.code = 'CS401'`,
      ),
    ).toBe(20);
  });

  it('is deterministic and idempotent: seeding twice yields identical data', async () => {
    const pool = getTestPool();
    await seedDatabase(pool, FAST);
    const first = await dataFingerprint(pool);
    await seedDatabase(pool, FAST);

    expect(await dataFingerprint(pool)).toBe(first);
    expect(await count(pool, 'SELECT count(*)::int AS n FROM users')).toBe(301);
  });

  it('stores bcrypt hashes for the documented demo accounts', async () => {
    const pool = getTestPool();
    await seedDatabase(pool, FAST);
    const users = await pool.query<{ email: string; password_hash: string }>(
      `SELECT email, password_hash FROM users
       WHERE email IN ('admin@university.edu', 'aarav.sharma@university.edu',
                       'meera.iyer@university.edu', 'rohan.verma@university.edu')
       ORDER BY email`,
    );

    expect(users.rows).toHaveLength(4);
    for (const user of users.rows) {
      const password = user.email.startsWith('admin') ? 'Admin@123' : 'Student@123';
      expect(await bcrypt.compare(password, user.password_hash)).toBe(true);
    }
  });
});

describe('seedDemoSubmissions', () => {
  it('opens the window and records ~150 submissions with 100+ AI first choices', async () => {
    const pool = getTestPool();
    await seedDatabase(pool, FAST);
    const summary = await seedDemoSubmissions(pool);

    expect(summary.submissions).toBe(150);
    expect(summary.aiFirstChoices).toBeGreaterThanOrEqual(100);
    expect(summary.aiTotalDemand).toBeGreaterThan(summary.aiCapacity);
    expect(
      await count(
        pool,
        "SELECT count(*)::int AS n FROM registration_windows WHERE status = 'OPEN'",
      ),
    ).toBe(1);
    expect(
      await count(
        pool,
        "SELECT count(*)::int AS n FROM registration_history WHERE event_type = 'SUBMITTED'",
      ),
    ).toBe(150);
    // FCFS order is a gap-free server-side sequence.
    expect(
      await count(
        pool,
        'SELECT (max(submission_sequence) - min(submission_sequence) + 1)::int AS n FROM preference_submissions',
      ),
    ).toBe(150);
  });

  it('only ranks courses the student is eligible for', async () => {
    const pool = getTestPool();
    await seedDatabase(pool, FAST);
    await seedDemoSubmissions(pool);

    const ineligibleItems = await count(
      pool,
      `SELECT count(*)::int AS n
       FROM preference_items pi
       JOIN preference_submissions ps ON ps.id = pi.submission_id
       JOIN students s ON s.user_id = ps.student_id
       JOIN courses c ON c.id = pi.course_id
       WHERE s.semester < c.min_semester
          OR s.credits_completed < c.min_credits
          OR EXISTS (SELECT 1 FROM student_completed_courses scc
                     WHERE scc.student_id = s.user_id AND scc.course_id = c.id)
          OR EXISTS (SELECT 1 FROM course_prerequisites cp
                     WHERE cp.course_id = c.id
                       AND NOT EXISTS (SELECT 1 FROM student_completed_courses scc
                                       WHERE scc.student_id = s.user_id
                                         AND scc.course_id = cp.prerequisite_course_id))`,
    );
    expect(ineligibleItems).toBe(0);
  });

  it('is deterministic and can be re-run safely', async () => {
    const pool = getTestPool();
    await seedDatabase(pool, FAST);
    await seedDemoSubmissions(pool);
    const first = await submissionsFingerprint(pool);
    await seedDemoSubmissions(pool);

    expect(await submissionsFingerprint(pool)).toBe(first);
    expect(await count(pool, 'SELECT count(*)::int AS n FROM preference_submissions')).toBe(150);
  });
});
