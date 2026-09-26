/**
 * Opens the Fall 2026 window and records realistic preference submissions.
 *
 * Every submission is written the way a real submit will be: one transaction
 * per student (draft -> ranked items -> SUBMITTED with idempotency key and
 * server-side sequence -> history event), so all database constraints and
 * triggers apply. Re-running replaces the previous demo submissions.
 */
import type { Pool, PoolClient } from 'pg';
import { submissionReference } from '../../services/cartRules.js';
import { evaluateEligibility, type EligibilityCourse } from '../../services/eligibilityRules.js';
import { createNotificationRepository } from '../../repositories/notificationRepository.js';
import type { Logger } from '../../utils/logger.js';
import { createSeededRandom } from '../../utils/random.js';
import { withTransaction } from '../transaction.js';
import { AI_COURSE_CODE, COURSES, SEED_WINDOW_NAME } from './catalog.js';
import { DEMO_STUDENTS } from './demoAccounts.js';
import {
  DEFAULT_PLAN_OPTIONS,
  planDemoSubmissions,
  type PlannedSubmission,
  type PlanStudent,
} from './demoSubmissionPlan.js';

export const DEMO_SUBMISSIONS_RANDOM_SEED = 20_260_915;

export interface DemoSubmissionsOptions {
  logger?: Logger;
  now?: Date;
}

export interface DemoSubmissionsSummary {
  windowId: string;
  submissions: number;
  aiFirstChoices: number;
  aiTotalDemand: number;
  aiCapacity: number;
}

interface WindowRow {
  id: string;
  status: string;
}

async function findSeedWindow(pool: Pool): Promise<WindowRow> {
  const result = await pool.query<WindowRow>(
    'SELECT id, status FROM registration_windows WHERE name = $1',
    [SEED_WINDOW_NAME],
  );
  const window = result.rows[0];
  if (!window) {
    throw new Error(`Window "${SEED_WINDOW_NAME}" not found. Run \`npm run seed\` first.`);
  }
  if (window.status !== 'DRAFT' && window.status !== 'OPEN') {
    throw new Error(
      `Window "${SEED_WINDOW_NAME}" is ${window.status}; re-run \`npm run seed\` to reset it.`,
    );
  }
  return window;
}

/** Loads students and course rules, and works out who may take what. */
async function loadPlanStudents(
  pool: Pool,
  windowId: string,
): Promise<{ students: PlanStudent[]; courseIdByCode: Map<string, string> }> {
  const [students, completed, courses, prerequisites, eligiblePrograms] = await Promise.all([
    pool.query<{
      user_id: string;
      roll_number: string;
      program_id: string;
      semester: number;
      credits_completed: number;
    }>(
      'SELECT user_id, roll_number, program_id, semester, credits_completed FROM students ORDER BY roll_number',
    ),
    pool.query<{ student_id: string; course_id: string }>(
      'SELECT student_id, course_id FROM student_completed_courses',
    ),
    pool.query<{ id: string; code: string; min_semester: number; min_credits: number }>(
      `SELECT c.id, c.code, c.min_semester, c.min_credits
       FROM courses c
       JOIN registration_window_courses o ON o.course_id = c.id AND o.window_id = $1
       ORDER BY c.code`,
      [windowId],
    ),
    pool.query<{ course_id: string; prerequisite_course_id: string }>(
      'SELECT course_id, prerequisite_course_id FROM course_prerequisites',
    ),
    pool.query<{ course_id: string; program_id: string }>(
      'SELECT course_id, program_id FROM course_eligible_programs',
    ),
  ]);

  const idsFor = <Row>(rows: Row[], key: (row: Row) => string, value: (row: Row) => string) =>
    rows.reduce((map, row) => {
      map.set(key(row), [...(map.get(key(row)) ?? []), value(row)]);
      return map;
    }, new Map<string, string[]>());

  const completedByStudent = idsFor(
    completed.rows,
    (r) => r.student_id,
    (r) => r.course_id,
  );
  const prerequisitesByCourse = idsFor(
    prerequisites.rows,
    (r) => r.course_id,
    (r) => r.prerequisite_course_id,
  );
  const programsByCourse = idsFor(
    eligiblePrograms.rows,
    (r) => r.course_id,
    (r) => r.program_id,
  );

  // Only the ids matter to the rule here; codes and names exist so a reason
  // could be displayed, which the planner never does.
  const ref = (id: string) => ({ id, code: id, name: id });
  const rules: (EligibilityCourse & { code: string })[] = courses.rows.map((row) => ({
    id: row.id,
    code: row.code,
    minSemester: row.min_semester,
    minCredits: row.min_credits,
    eligiblePrograms: (programsByCourse.get(row.id) ?? []).map(ref),
    prerequisites: (prerequisitesByCourse.get(row.id) ?? []).map(ref),
  }));
  const fixedByRoll = new Map(
    DEMO_STUDENTS.filter((s) => s.submitsInDemo).map((s) => [s.rollNumber, s.preferences]),
  );
  // Named accounts that must have NO submission, so the cart and the atomic
  // submit can be demonstrated live rather than described.
  const withoutSubmission = new Set(
    DEMO_STUDENTS.filter((s) => !s.submitsInDemo).map((s) => s.rollNumber),
  );

  const planStudents = students.rows
    .filter((row) => !withoutSubmission.has(row.roll_number))
    .map((row): PlanStudent => {
      const facts = {
        programId: row.program_id,
        program: { code: row.program_id, name: row.program_id },
        semester: row.semester,
        creditsCompleted: row.credits_completed,
        completedCourseIds: new Set(completedByStudent.get(row.user_id) ?? []),
      };
      const eligibleCourseCodes = new Set(
        rules.filter((course) => evaluateEligibility(facts, course).eligible).map((c) => c.code),
      );
      const fixedPreferences = fixedByRoll.get(row.roll_number);
      return {
        id: row.user_id,
        rollNumber: row.roll_number,
        eligibleCourseCodes,
        ...(fixedPreferences ? { fixedPreferences } : {}),
      };
    });

  return {
    students: planStudents,
    courseIdByCode: new Map(rules.map((course) => [course.code, course.id])),
  };
}

/** Removes earlier demo submissions and opens the window, atomically. */
async function resetAndOpenWindow(pool: Pool, windowId: string, openedAt: Date): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query('DELETE FROM preference_submissions WHERE window_id = $1', [windowId]);
    // Opening through the API notifies every student, so the demo does too.
    await client.query("DELETE FROM notifications WHERE type = 'WINDOW_STATUS'");
    await client.query(
      "DELETE FROM registration_history WHERE window_id = $1 AND event_type = 'SUBMITTED'",
      [windowId],
    );
    // Restart FCFS numbering when no submissions exist at all, so re-runs are identical.
    await client.query(
      `SELECT setval('preference_submission_sequence', 1, false)
       WHERE NOT EXISTS (SELECT 1 FROM preference_submissions)`,
    );
    await client.query(
      `UPDATE registration_windows
       SET status = 'OPEN', starts_at = $2::timestamptz,
           ends_at = GREATEST(ends_at, $2::timestamptz + interval '14 days')
       WHERE id = $1`,
      [windowId, openedAt],
    );
    await createNotificationRepository(client).broadcast({
      userIds: (await client.query<{ user_id: string }>('SELECT user_id FROM students')).rows.map(
        (row) => row.user_id,
      ),
      type: 'WINDOW_STATUS',
      title: `Registration for ${SEED_WINDOW_NAME} is open`,
      body: 'Rank up to five courses and submit before the window closes.',
    });
  });
}

async function writeSubmission(
  client: PoolClient,
  windowId: string,
  planned: PlannedSubmission,
  courseIds: string[],
  submittedAt: Date,
): Promise<void> {
  const draft = await client.query<{ id: string }>(
    'INSERT INTO preference_submissions (student_id, window_id) VALUES ($1, $2) RETURNING id',
    [planned.studentId, windowId],
  );
  const submissionId = draft.rows[0]?.id;
  if (!submissionId) {
    throw new Error('Failed to create preference submission');
  }

  await client.query(
    `INSERT INTO preference_items (submission_id, window_id, course_id, rank)
     SELECT $1, $2, course_id, rank FROM unnest($3::uuid[]) WITH ORDINALITY AS t(course_id, rank)`,
    [submissionId, windowId, courseIds],
  );
  await client.query(
    `UPDATE preference_submissions
     SET status = 'SUBMITTED', idempotency_key = $2, submitted_at = $3,
         submission_sequence = nextval('preference_submission_sequence')
     WHERE id = $1`,
    [submissionId, planned.idempotencyKey, submittedAt],
  );
  await client.query(
    `INSERT INTO registration_history (student_id, window_id, event_type, details, created_at)
     VALUES ($1, $2, 'SUBMITTED', $3, $4)`,
    [
      planned.studentId,
      windowId,
      // EXACTLY what submitService writes for a real submission. A seeded
      // timeline that reads differently from a real one is a seed that lies,
      // and the student's history page would show the difference.
      { reference: submissionReference(submissionId), courseCodes: planned.courseCodes },
      submittedAt,
    ],
  );
}

async function summarise(pool: Pool, windowId: string, aiCourseId: string) {
  const result = await pool.query<{
    submissions: number;
    ai_first: number;
    ai_demand: number;
    ai_capacity: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM preference_submissions
         WHERE window_id = $1 AND status = 'SUBMITTED') AS submissions,
       (SELECT count(*)::int FROM preference_items
         WHERE window_id = $1 AND course_id = $2 AND rank = 1) AS ai_first,
       (SELECT count(*)::int FROM preference_items
         WHERE window_id = $1 AND course_id = $2) AS ai_demand,
       (SELECT capacity FROM registration_window_courses
         WHERE window_id = $1 AND course_id = $2) AS ai_capacity`,
    [windowId, aiCourseId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Could not summarise demo submissions');
  }
  return row;
}

export async function seedDemoSubmissions(
  pool: Pool,
  options: DemoSubmissionsOptions = {},
): Promise<DemoSubmissionsSummary> {
  const window = await findSeedWindow(pool);
  const { students, courseIdByCode } = await loadPlanStudents(pool, window.id);

  const plan = planDemoSubmissions(students, createSeededRandom(DEMO_SUBMISSIONS_RANDOM_SEED), {
    ...DEFAULT_PLAN_OPTIONS,
    popularity: new Map(COURSES.map((course) => [course.code, course.popularity])),
  });

  // Submissions arrived over the last hour; the window opened just before.
  const now = options.now ?? new Date();
  const openedAt = new Date(
    now.getTime() - (DEFAULT_PLAN_OPTIONS.arrivalWindowSeconds + 60) * 1000,
  );
  await resetAndOpenWindow(pool, window.id, openedAt);

  for (const planned of plan) {
    const courseIds = planned.courseCodes.map((code) => {
      const id = courseIdByCode.get(code);
      if (!id) {
        throw new Error(`Course ${code} is not offered in ${SEED_WINDOW_NAME}`);
      }
      return id;
    });
    const submittedAt = new Date(openedAt.getTime() + planned.arrivalOffsetSeconds * 1000);
    await withTransaction(pool, (client) =>
      writeSubmission(client, window.id, planned, courseIds, submittedAt),
    );
  }

  const aiCourseId = courseIdByCode.get(AI_COURSE_CODE);
  if (!aiCourseId) {
    throw new Error(`${AI_COURSE_CODE} is not offered in ${SEED_WINDOW_NAME}`);
  }
  const totals = await summarise(pool, window.id, aiCourseId);
  const summary: DemoSubmissionsSummary = {
    windowId: window.id,
    submissions: totals.submissions,
    aiFirstChoices: totals.ai_first,
    aiTotalDemand: totals.ai_demand,
    aiCapacity: totals.ai_capacity,
  };
  options.logger?.info('Demo submissions complete', { ...summary });
  return summary;
}
