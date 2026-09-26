/**
 * Everything the allocation run reads and writes.
 *
 * The writes are deliberately bulk: one statement per table for the whole run,
 * not one per student. A 300-student run would otherwise be well over a
 * thousand round trips inside a single transaction, holding its locks the
 * whole time.
 */
import {
  ALLOCATION_METHODS,
  ALLOCATION_OUTCOMES,
  ALLOCATION_RUN_STATUSES,
  isAcademicTerm,
  isAllocationConfig,
  type AcademicTerm,
  type AllocationConfig,
  type AllocationMetrics,
  type AllocationMethod,
  type AllocationOutcome,
  type AllocationRunStatus,
  type PreferenceRank,
} from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import type { AllocationResultRow as EngineResultRow } from '../allocation/types.js';
import { oneOf } from './mappers.js';
import type { AllocationRunRow } from './rows.js';

/** One student as the snapshot query returns them. */
export interface AllocationStudentRecord {
  studentId: string;
  sequence: number;
  semester: number;
  programId: string;
  expectedGraduationTerm: AcademicTerm;
  /** Course ids in rank order. */
  preferences: string[];
  /** The ids the student has passed, for the prerequisite check. */
  completedCourseIds: string[];
  creditsCompleted: number;
}

/** One offered course, with the facts eligibility and scoring need. */
export interface AllocationCourseRecord {
  courseId: string;
  code: string;
  name: string;
  capacity: number;
  allocated: number;
  minSemester: number;
  minCredits: number;
  eligibleProgramIds: string[];
  relevantProgramIds: string[];
  prerequisiteCourseIds: string[];
}

export interface AllocationSnapshot {
  windowId: string;
  term: AcademicTerm;
  config: AllocationConfig;
  randomSeed: number;
  students: AllocationStudentRecord[];
  courses: AllocationCourseRecord[];
}

export interface AllocationRunRecord {
  id: string;
  windowId: string;
  method: AllocationMethod;
  algorithmVersion: string;
  status: AllocationRunStatus;
  randomSeed: number;
  config: AllocationConfig;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  metrics: AllocationMetrics | null;
  outputHash: string | null;
  triggeredBy: string | null;
  inputSize: { students: number; courses: number };
}

export interface StoredResult {
  courseCode: string;
  courseName: string;
  outcome: AllocationOutcome;
  preferenceRank: PreferenceRank;
  explanation: string;
  /** The structured explanation, still unknown until the caller validates it. */
  explanationDetail: unknown;
}

export interface CompleteRunInput {
  runId: string;
  metrics: AllocationMetrics;
  outputHash: string;
}

export interface AllocationRepository {
  /** Everything one run needs, in a fixed number of queries. */
  loadSnapshot(windowId: string): Promise<AllocationSnapshot | null>;
  /** Locks the window row FOR UPDATE, so nothing can change it mid-run. */
  lockWindow(windowId: string): Promise<{ status: string; term: string } | null>;
  startRun(input: {
    windowId: string;
    method: AllocationMethod;
    algorithmVersion: string;
    randomSeed: number;
    config: AllocationConfig;
    inputSnapshot: unknown;
    triggeredBy: string | null;
  }): Promise<string>;
  /** Written inside the transaction, once the snapshot has actually been read. */
  saveInputSnapshot(runId: string, snapshot: unknown): Promise<void>;
  completeRun(input: CompleteRunInput): Promise<void>;
  failRun(runId: string, message: string): Promise<void>;
  /** True when this window already has a completed run. */
  hasCompletedRun(windowId: string): Promise<boolean>;
  /** `sentence` renders the human-readable line stored beside the JSON. */
  saveResults(
    runId: string,
    rows: readonly EngineResultRow[],
    sentence: (explanation: EngineResultRow['explanation']) => string,
  ): Promise<void>;
  saveEnrollments(windowId: string, rows: readonly EngineResultRow[]): Promise<void>;
  saveWaitlist(windowId: string, rows: readonly EngineResultRow[]): Promise<void>;
  listRuns(windowId: string | null): Promise<AllocationRunRecord[]>;
  findRun(runId: string): Promise<AllocationRunRecord | null>;
  /** The stored input snapshot, for re-running a completed run. */
  findInputSnapshot(runId: string): Promise<unknown>;
  /** The caller's own rows for a run; never anyone else's. */
  findStudentResults(runId: string, studentId: string): Promise<StoredResult[]>;
  /** The newest completed run for a window. */
  findLatestCompletedRun(windowId: string): Promise<AllocationRunRecord | null>;
  countSubmissions(windowId: string): Promise<number>;
}

function asTerm(value: string): AcademicTerm {
  if (!isAcademicTerm(value)) {
    throw new Error(`Invalid academic term in the database: ${JSON.stringify(value)}`);
  }
  return value;
}

function asConfig(value: unknown): AllocationConfig {
  if (!isAllocationConfig(value)) {
    throw new Error('registration_windows.config is not a valid allocation config');
  }
  return value;
}

function asMetrics(value: unknown): AllocationMetrics | null {
  // JSONB written by this service; typed by the contract the way `data` is.
  return value === null || value === undefined ? null : (value as AllocationMetrics);
}

function mapRun(row: AllocationRunRow & { metrics: unknown; output_hash: string | null }) {
  const snapshot = row.input_snapshot as { students?: unknown[]; courses?: unknown[] } | null;
  return {
    id: row.id,
    windowId: row.window_id,
    method: oneOf(ALLOCATION_METHODS, row.method, 'allocation_runs.method'),
    algorithmVersion: row.algorithm_version,
    status: oneOf(ALLOCATION_RUN_STATUSES, row.status, 'allocation_runs.status'),
    randomSeed: Number(row.random_seed),
    config: asConfig(row.config_snapshot),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    metrics: asMetrics(row.metrics),
    outputHash: row.output_hash,
    triggeredBy: row.triggered_by,
    inputSize: {
      students: snapshot?.students?.length ?? 0,
      courses: snapshot?.courses?.length ?? 0,
    },
  } satisfies AllocationRunRecord;
}

const RUN_COLUMNS = `id, window_id, method, algorithm_version, random_seed, config_snapshot,
                     input_snapshot, status, started_at, finished_at, error_message,
                     triggered_by, metrics, output_hash`;

/** Groups (parent, child) id pairs into one list per parent. */
function group<Row>(
  rows: readonly Row[],
  key: (row: Row) => string,
  value: (row: Row) => string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    map.set(key(row), [...(map.get(key(row)) ?? []), value(row)]);
  }
  return map;
}

export function createAllocationRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): AllocationRepository {
  /** The allocated rows, which become enrollments. */
  const allocatedRows = (rows: readonly EngineResultRow[]) =>
    rows.filter((row) => row.outcome === 'ALLOCATED');

  return {
    async lockWindow(windowId) {
      const result = await pool.query<{ status: string; term: string }>(
        'SELECT status, term FROM registration_windows WHERE id = $1 FOR UPDATE',
        [windowId],
      );
      return result.rows[0] ?? null;
    },

    async loadSnapshot(windowId) {
      const windowResult = await pool.query<{ term: string; config: unknown; random_seed: string }>(
        'SELECT term, config, random_seed FROM registration_windows WHERE id = $1',
        [windowId],
      );
      const window = windowResult.rows[0];
      if (!window) {
        return null;
      }

      // Awaited one at a time, not with Promise.all: an allocation run passes
      // its OWN transaction client, and one pg client cannot run two queries at
      // once (deprecated today, an error from pg@9). The snapshot is built once
      // per run, so seven round trips cost nothing.
      const offerings = await pool.query<{
        course_id: string;
        code: string;
        name: string;
        capacity: number;
        allocated_count: number;
        min_semester: number;
        min_credits: number;
      }>(
        `SELECT o.course_id, c.code, c.name, o.capacity, o.allocated_count,
                c.min_semester, c.min_credits
         FROM registration_window_courses o
         JOIN courses c ON c.id = o.course_id
         WHERE o.window_id = $1
         ORDER BY c.code`,
        [windowId],
      );
      const eligible = await pool.query<{ course_id: string; program_id: string }>(
        'SELECT course_id, program_id FROM course_eligible_programs',
      );
      const relevant = await pool.query<{ course_id: string; program_id: string }>(
        'SELECT course_id, program_id FROM course_program_relevance',
      );
      const prerequisites = await pool.query<{ course_id: string; prerequisite_course_id: string }>(
        'SELECT course_id, prerequisite_course_id FROM course_prerequisites',
      );
      const submissions = await pool.query<{
        student_id: string;
        submission_sequence: string;
        semester: number;
        credits_completed: number;
        program_id: string;
        expected_graduation_term: string;
      }>(
        `SELECT ps.student_id, ps.submission_sequence, s.semester, s.credits_completed,
                s.program_id, s.expected_graduation_term
         FROM preference_submissions ps
         JOIN students s ON s.user_id = ps.student_id
         WHERE ps.window_id = $1 AND ps.status = 'SUBMITTED'
         ORDER BY ps.submission_sequence`,
        [windowId],
      );
      const items = await pool.query<{ student_id: string; course_id: string; rank: number }>(
        `SELECT ps.student_id, pi.course_id, pi.rank
         FROM preference_items pi
         JOIN preference_submissions ps ON ps.id = pi.submission_id
         WHERE ps.window_id = $1 AND ps.status = 'SUBMITTED'
         ORDER BY ps.student_id, pi.rank`,
        [windowId],
      );
      const completed = await pool.query<{ student_id: string; course_id: string }>(
        'SELECT student_id, course_id FROM student_completed_courses',
      );

      const eligibleByCourse = group(
        eligible.rows,
        (row) => row.course_id,
        (row) => row.program_id,
      );
      const relevantByCourse = group(
        relevant.rows,
        (row) => row.course_id,
        (row) => row.program_id,
      );
      const prerequisitesByCourse = group(
        prerequisites.rows,
        (row) => row.course_id,
        (row) => row.prerequisite_course_id,
      );
      const preferencesByStudent = group(
        items.rows,
        (row) => row.student_id,
        (row) => row.course_id,
      );
      const completedByStudent = group(
        completed.rows,
        (row) => row.student_id,
        (row) => row.course_id,
      );

      return {
        windowId,
        term: asTerm(window.term),
        config: asConfig(window.config),
        randomSeed: Number(window.random_seed),
        courses: offerings.rows.map((row) => ({
          courseId: row.course_id,
          code: row.code,
          name: row.name,
          capacity: row.capacity,
          allocated: row.allocated_count,
          minSemester: row.min_semester,
          minCredits: row.min_credits,
          eligibleProgramIds: eligibleByCourse.get(row.course_id) ?? [],
          relevantProgramIds: relevantByCourse.get(row.course_id) ?? [],
          prerequisiteCourseIds: prerequisitesByCourse.get(row.course_id) ?? [],
        })),
        students: submissions.rows.map((row) => ({
          studentId: row.student_id,
          sequence: Number(row.submission_sequence),
          semester: row.semester,
          programId: row.program_id,
          expectedGraduationTerm: asTerm(row.expected_graduation_term),
          preferences: preferencesByStudent.get(row.student_id) ?? [],
          completedCourseIds: completedByStudent.get(row.student_id) ?? [],
          creditsCompleted: row.credits_completed,
        })),
      };
    },

    async startRun({
      windowId,
      method,
      algorithmVersion,
      randomSeed,
      config,
      inputSnapshot,
      triggeredBy,
    }) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO allocation_runs
           (window_id, method, algorithm_version, random_seed, config_snapshot,
            input_snapshot, status, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'RUNNING', $7)
         RETURNING id`,
        [windowId, method, algorithmVersion, randomSeed, config, inputSnapshot, triggeredBy],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error('Failed to create the allocation run');
      }
      return id;
    },

    async saveInputSnapshot(runId, snapshot) {
      await pool.query('UPDATE allocation_runs SET input_snapshot = $2 WHERE id = $1', [
        runId,
        snapshot,
      ]);
    },

    // started_at comes from the database's clock, so finished_at must too:
    // this host's clock runs behind the container's, and a JS Date here
    // produced finished_at < started_at and tripped the CHECK.
    async completeRun({ runId, metrics, outputHash }) {
      await pool.query(
        `UPDATE allocation_runs
         SET status = 'COMPLETED', finished_at = now(), metrics = $2, output_hash = $3
         WHERE id = $1`,
        [runId, metrics, outputHash],
      );
    },

    async failRun(runId, message) {
      await pool.query(
        `UPDATE allocation_runs
         SET status = 'FAILED', finished_at = now(), error_message = $2
         WHERE id = $1 AND status = 'RUNNING'`,
        [runId, message.slice(0, 2000)],
      );
    },

    async hasCompletedRun(windowId) {
      const result = await pool.query(
        `SELECT 1 FROM allocation_runs WHERE window_id = $1 AND status = 'COMPLETED' LIMIT 1`,
        [windowId],
      );
      return result.rowCount === 1;
    },

    async saveResults(runId, rows, sentence) {
      if (rows.length === 0) {
        return;
      }
      // One insert for every result row: unnest turns seven arrays into a table.
      await pool.query(
        `INSERT INTO allocation_results
           (run_id, student_id, course_id, outcome, preference_rank, preference_score,
            priority_score, total_score, final_rank, waitlist_position, explanation,
            explanation_detail)
         SELECT $1, student_id, course_id, outcome, preference_rank, preference_score,
                priority_score, total_score, final_rank, waitlist_position, explanation,
                explanation_detail
         FROM unnest(
           $2::uuid[], $3::uuid[], $4::text[], $5::smallint[], $6::integer[], $7::integer[],
           $8::integer[], $9::integer[], $10::integer[], $11::text[], $12::jsonb[]
         ) AS t(student_id, course_id, outcome, preference_rank, preference_score,
                priority_score, total_score, final_rank, waitlist_position, explanation,
                explanation_detail)`,
        [
          runId,
          rows.map((row) => row.studentId),
          rows.map((row) => row.courseId),
          rows.map((row) => row.outcome),
          rows.map((row) => row.rank),
          rows.map((row) => row.score?.preferencePoints ?? null),
          rows.map((row) => row.score?.priorityPoints ?? null),
          rows.map((row) => row.score?.total ?? null),
          rows.map((row) => row.finalRank),
          rows.map((row) => row.waitlistPosition),
          rows.map((row) => sentence(row.explanation)),
          rows.map((row) => JSON.stringify(row.explanation)),
        ],
      );
    },

    async saveEnrollments(windowId, rows) {
      const allocated = allocatedRows(rows);
      if (allocated.length === 0) {
        return;
      }
      // The trigger on this table maintains allocated_count and its CHECK
      // rejects the statement if it would ever overbook.
      await pool.query(
        `INSERT INTO enrollments (student_id, window_id, course_id, source)
         SELECT student_id, $1, course_id, 'ALLOCATION'
         FROM unnest($2::uuid[], $3::uuid[]) AS t(student_id, course_id)`,
        [windowId, allocated.map((row) => row.studentId), allocated.map((row) => row.courseId)],
      );
    },

    async saveWaitlist(windowId, rows) {
      const waiting = rows.filter((row) => row.outcome === 'WAITLISTED');
      if (waiting.length === 0) {
        return;
      }
      await pool.query(
        `INSERT INTO waitlist_entries (student_id, window_id, course_id, score, position)
         SELECT student_id, $1, course_id, score, position
         FROM unnest($2::uuid[], $3::uuid[], $4::integer[], $5::integer[])
           AS t(student_id, course_id, score, position)`,
        [
          windowId,
          waiting.map((row) => row.studentId),
          waiting.map((row) => row.courseId),
          waiting.map((row) => row.score?.total ?? 0),
          waiting.map((row) => row.waitlistPosition ?? 1),
        ],
      );
    },

    async listRuns(windowId) {
      const result = await pool.query<
        AllocationRunRow & { metrics: unknown; output_hash: string | null }
      >(
        `SELECT ${RUN_COLUMNS} FROM allocation_runs
         WHERE $1::uuid IS NULL OR window_id = $1
         ORDER BY started_at DESC`,
        [windowId],
      );
      return result.rows.map(mapRun);
    },

    async findRun(runId) {
      const result = await pool.query<
        AllocationRunRow & { metrics: unknown; output_hash: string | null }
      >(`SELECT ${RUN_COLUMNS} FROM allocation_runs WHERE id = $1`, [runId]);
      const row = result.rows[0];
      return row ? mapRun(row) : null;
    },

    async findInputSnapshot(runId) {
      const result = await pool.query<{ input_snapshot: unknown }>(
        'SELECT input_snapshot FROM allocation_runs WHERE id = $1',
        [runId],
      );
      return result.rows[0]?.input_snapshot ?? null;
    },

    async findLatestCompletedRun(windowId) {
      const result = await pool.query<
        AllocationRunRow & { metrics: unknown; output_hash: string | null }
      >(
        `SELECT ${RUN_COLUMNS} FROM allocation_runs
         WHERE window_id = $1 AND status = 'COMPLETED'
         ORDER BY finished_at DESC
         LIMIT 1`,
        [windowId],
      );
      const row = result.rows[0];
      return row ? mapRun(row) : null;
    },

    async findStudentResults(runId, studentId) {
      // Scoped to one student by the query itself, not by filtering afterwards.
      const result = await pool.query<{
        code: string;
        name: string;
        outcome: string;
        preference_rank: number;
        explanation: string;
        explanation_detail: unknown;
      }>(
        `SELECT c.code, c.name, ar.outcome, ar.preference_rank, ar.explanation,
                ar.explanation_detail
         FROM allocation_results ar
         JOIN courses c ON c.id = ar.course_id
         WHERE ar.run_id = $1 AND ar.student_id = $2
         ORDER BY ar.preference_rank`,
        [runId, studentId],
      );
      return result.rows.map((row) => ({
        courseCode: row.code,
        courseName: row.name,
        outcome: oneOf(ALLOCATION_OUTCOMES, row.outcome, 'allocation_results.outcome'),
        preferenceRank: row.preference_rank as PreferenceRank,
        explanation: row.explanation,
        explanationDetail: row.explanation_detail,
      }));
    },

    async countSubmissions(windowId) {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM preference_submissions
         WHERE window_id = $1 AND status = 'SUBMITTED'`,
        [windowId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}
