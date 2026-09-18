/**
 * Resets the database and loads the deterministic demo data set in ONE
 * transaction: either everything is seeded or nothing changes.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { evaluateEligibility } from '../../services/eligibilityRules.js';
import type { Logger } from '../../utils/logger.js';
import { createSeededRandom } from '../../utils/random.js';
import { withTransaction } from '../transaction.js';
import { truncateApplicationTables } from '../truncate.js';
import {
  AI_COURSE_CODE,
  COURSES,
  DEPARTMENTS,
  PROGRAMS,
  SEED_TERM,
  SEED_WINDOW_NAME,
} from './catalog.js';
import {
  ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_STUDENT_PASSWORD,
  DEMO_STUDENTS,
} from './demoAccounts.js';
import {
  generateStudents,
  toEligibilityCourse,
  toEligibilityStudent,
  type StudentSeed,
} from './students.js';

/** Master seed: change it and every generated student changes. */
export const SEED_RANDOM_SEED = 20_260_901;
/** Stored on the Fall 2026 window for allocation tie-breaks. */
export const FALL_2026_WINDOW_RANDOM_SEED = 2_026_091_801;

const DEFAULT_PASSWORD_HASH_ROUNDS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedOptions {
  /** bcrypt cost; tests lower it for speed. */
  passwordHashRounds?: number;
  logger?: Logger;
  now?: Date;
}

export interface SeedSummary {
  departments: number;
  programs: number;
  courses: number;
  students: number;
  completedCourses: number;
  offerings: number;
  aiEligibleStudents: number;
  windowId: string;
}

type IdByCode = Map<string, string>;

function requireId(ids: IdByCode, code: string): string {
  const id = ids.get(code);
  if (id === undefined) {
    throw new Error(`Seed data references unknown code "${code}"`);
  }
  return id;
}

async function insertIdMap(
  client: PoolClient,
  sql: string,
  values: unknown[],
  keyColumn: string,
): Promise<IdByCode> {
  const result = await client.query<Record<string, string>>(sql, values);
  return new Map(result.rows.map((row) => [row[keyColumn] ?? '', row.id ?? '']));
}

async function insertReferenceData(client: PoolClient) {
  const departmentIds = await insertIdMap(
    client,
    `INSERT INTO departments (code, name)
     SELECT * FROM unnest($1::text[], $2::text[])
     RETURNING id, code`,
    [DEPARTMENTS.map((d) => d.code), DEPARTMENTS.map((d) => d.name)],
    'code',
  );

  const programIds = await insertIdMap(
    client,
    `INSERT INTO programs (code, name, department_id)
     SELECT * FROM unnest($1::text[], $2::text[], $3::uuid[])
     RETURNING id, code`,
    [
      PROGRAMS.map((p) => p.code),
      PROGRAMS.map((p) => p.name),
      PROGRAMS.map((p) => requireId(departmentIds, p.departmentCode)),
    ],
    'code',
  );

  const courseIds = await insertIdMap(
    client,
    `INSERT INTO courses (code, name, department_id, credits, description, min_semester, min_credits)
     SELECT * FROM unnest($1::text[], $2::text[], $3::uuid[], $4::int[], $5::text[], $6::int[], $7::int[])
     RETURNING id, code`,
    [
      COURSES.map((c) => c.code),
      COURSES.map((c) => c.name),
      COURSES.map((c) => requireId(departmentIds, c.departmentCode)),
      COURSES.map((c) => c.credits),
      COURSES.map((c) => c.description),
      COURSES.map((c) => c.minSemester),
      COURSES.map((c) => c.minCredits),
    ],
    'code',
  );

  const pairs = (select: (course: (typeof COURSES)[number]) => readonly string[], ids: IdByCode) =>
    COURSES.flatMap((course) =>
      select(course).map((code) => [requireId(courseIds, course.code), requireId(ids, code)]),
    );

  const insertPairs = async (table: string, column: string, rows: string[][]) => {
    // table/column are constants from this file, never user input.
    await client.query(
      `INSERT INTO ${table} (course_id, ${column})
       SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
      [rows.map((row) => row[0]), rows.map((row) => row[1])],
    );
  };

  await insertPairs(
    'course_prerequisites',
    'prerequisite_course_id',
    pairs((c) => c.prerequisites, courseIds),
  );
  await insertPairs(
    'course_eligible_programs',
    'program_id',
    pairs((c) => c.eligiblePrograms, programIds),
  );
  await insertPairs(
    'course_program_relevance',
    'program_id',
    pairs((c) => c.relevantPrograms, programIds),
  );

  return { programIds, courseIds };
}

async function insertAdmin(client: PoolClient, passwordHash: string): Promise<void> {
  await client.query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN')", [
    ADMIN_EMAIL,
    passwordHash,
  ]);
}

async function insertStudents(
  client: PoolClient,
  students: readonly StudentSeed[],
  passwordHash: string,
  programIds: IdByCode,
  courseIds: IdByCode,
): Promise<number> {
  const userIds = await insertIdMap(
    client,
    `INSERT INTO users (email, password_hash, role)
     SELECT email, $2, 'STUDENT' FROM unnest($1::text[]) AS t(email)
     RETURNING id, email`,
    [students.map((s) => s.email), passwordHash],
    'email',
  );
  const userIdOf = (student: StudentSeed) => requireId(userIds, student.email);

  await client.query(
    `INSERT INTO students
       (user_id, roll_number, name, program_id, semester, credits_completed, expected_graduation_term)
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::uuid[], $5::int[], $6::int[], $7::text[])`,
    [
      students.map(userIdOf),
      students.map((s) => s.rollNumber),
      students.map((s) => s.name),
      students.map((s) => requireId(programIds, s.programCode)),
      students.map((s) => s.semester),
      students.map((s) => s.creditsCompleted),
      students.map((s) => s.expectedGraduationTerm),
    ],
  );

  const completions = students.flatMap((student) =>
    student.completedCourses.map((course) => ({ student, course })),
  );
  await client.query(
    `INSERT INTO student_completed_courses (student_id, course_id, completed_term)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[])`,
    [
      completions.map(({ student }) => userIdOf(student)),
      completions.map(({ course }) => requireId(courseIds, course.code)),
      completions.map(({ course }) => course.term),
    ],
  );
  return completions.length;
}

async function insertWindow(client: PoolClient, courseIds: IdByCode, now: Date): Promise<string> {
  // Opens in a week, for two weeks: the pre-check period is "now".
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startsAt = new Date(startOfToday + 7 * DAY_MS + 9 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 14 * DAY_MS + 8 * 60 * 60 * 1000);

  const result = await client.query<{ id: string }>(
    `INSERT INTO registration_windows
       (name, term, starts_at, ends_at, status, allocation_method, config, random_seed)
     VALUES ($1, $2, $3, $4, 'DRAFT', 'PREFERENCE_PRIORITY', $5, $6)
     RETURNING id`,
    [
      SEED_WINDOW_NAME,
      SEED_TERM,
      startsAt,
      endsAt,
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
      FALL_2026_WINDOW_RANDOM_SEED,
    ],
  );
  const windowId = result.rows[0]?.id;
  if (!windowId) {
    throw new Error('Failed to create the registration window');
  }

  await client.query(
    `INSERT INTO registration_window_courses (window_id, course_id, capacity)
     SELECT $1, * FROM unnest($2::uuid[], $3::int[])`,
    [windowId, COURSES.map((c) => requireId(courseIds, c.code)), COURSES.map((c) => c.capacity)],
  );
  return windowId;
}

export function buildSeedStudents(): StudentSeed[] {
  return [...DEMO_STUDENTS, ...generateStudents(createSeededRandom(SEED_RANDOM_SEED))];
}

export function countEligibleStudents(
  students: readonly StudentSeed[],
  courseCode: string,
): number {
  const course = toEligibilityCourse(courseCode);
  return students.filter(
    (student) => evaluateEligibility(toEligibilityStudent(student), course).eligible,
  ).length;
}

export async function seedDatabase(pool: Pool, options: SeedOptions = {}): Promise<SeedSummary> {
  const rounds = options.passwordHashRounds ?? DEFAULT_PASSWORD_HASH_ROUNDS;
  const students = buildSeedStudents();

  // Hash each distinct demo password once; bcrypt salts make each run's hash differ.
  const [adminHash, studentHash] = await Promise.all([
    bcrypt.hash(DEMO_ADMIN_PASSWORD, rounds),
    bcrypt.hash(DEMO_STUDENT_PASSWORD, rounds),
  ]);

  const summary = await withTransaction(pool, async (client) => {
    await truncateApplicationTables(client);
    const { programIds, courseIds } = await insertReferenceData(client);
    await insertAdmin(client, adminHash);
    const completedCourses = await insertStudents(
      client,
      students,
      studentHash,
      programIds,
      courseIds,
    );
    const windowId = await insertWindow(client, courseIds, options.now ?? new Date());

    return {
      departments: DEPARTMENTS.length,
      programs: PROGRAMS.length,
      courses: COURSES.length,
      students: students.length,
      completedCourses,
      offerings: COURSES.length,
      aiEligibleStudents: countEligibleStudents(students, AI_COURSE_CODE),
      windowId,
    };
  });

  options.logger?.info('Seed complete', { ...summary });
  return summary;
}
