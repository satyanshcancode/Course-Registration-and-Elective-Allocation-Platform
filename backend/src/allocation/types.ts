/**
 * The allocation engine's own vocabulary.
 *
 * Everything here is plain data. The engine never touches the database, the
 * clock or Math.random: `allocate(input)` is a pure function of its input, so
 * the same input and seed always give the same output. That is what makes a
 * run reproducible, and what lets the property-based tests throw thousands of
 * random universes at it without a server.
 */
import type {
  AcademicTerm,
  AllocationConfig,
  AllocationExplanation,
  AllocationMethod,
  AllocationMetrics,
  AllocationOutcome,
  PreferenceRank,
  ScoreBreakdown,
} from '@course-reg/shared';

/** One student as the engine sees them: facts, preferences and arrival order. */
export interface AllocationStudent {
  studentId: string;
  /** Server-side arrival number from the submit sequence; FCFS orders by it. */
  sequence: number;
  semester: number;
  programId: string;
  expectedGraduationTerm: AcademicTerm;
  /** Course ids in rank order; index 0 is their first choice. */
  preferences: readonly string[];
  /**
   * Courses this student is still eligible for, re-checked from the database
   * at allocation time. A preference outside this set can never be allocated.
   */
  eligibleCourseIds: ReadonlySet<string>;
}

export interface AllocationCourse {
  courseId: string;
  /** Carried so an explanation can name the course without a lookup. */
  code: string;
  name: string;
  /** Seats available to this run (capacity minus anything already held). */
  capacity: number;
  /** Programs for which this course counts as relevant, for the bonus. */
  relevantProgramIds: ReadonlySet<string>;
}

export interface AllocationInput {
  /** The window's term, for the graduation-urgency bonus. */
  term: AcademicTerm;
  config: AllocationConfig;
  randomSeed: number;
  students: readonly AllocationStudent[];
  courses: readonly AllocationCourse[];
}

/** One student's outcome for one course they ranked. */
export interface AllocationResultRow {
  studentId: string;
  courseId: string;
  rank: PreferenceRank;
  outcome: AllocationOutcome;
  /** Place among everyone who ranked this course (1 = first in line). */
  finalRank: number;
  /** Place in the queue for a seat; only set when WAITLISTED. */
  waitlistPosition: number | null;
  /** null under FCFS, which does not score. */
  score: ScoreBreakdown | null;
  explanation: AllocationExplanation;
}

export interface AllocationOutput {
  /** One row per (student, ranked course): the complete record of the run. */
  results: readonly AllocationResultRow[];
  metrics: AllocationMetrics;
}

/**
 * The contract every method implements. Strategies are classes (spec §21):
 * at runtime a class is a constructor function whose `prototype` holds the
 * methods, so every instance shares one `allocate` rather than carrying its
 * own copy — see docs/javascript-concepts.md.
 */
export interface AllocationStrategy {
  readonly method: AllocationMethod;
  /** Bumped whenever the algorithm's output could change; stored with the run. */
  readonly algorithmVersion: string;
  allocate(input: AllocationInput): AllocationOutput;
}

/** Courses that exist in this run, by id. */
export function indexCourses(
  courses: readonly AllocationCourse[],
): ReadonlyMap<string, AllocationCourse> {
  return new Map(courses.map((course) => [course.courseId, course]));
}

/** A preference a student may actually be given: offered, and still eligible. */
export function isAllocatable(
  student: AllocationStudent,
  courseId: string,
  courses: ReadonlyMap<string, AllocationCourse>,
): boolean {
  return courses.has(courseId) && student.eligibleCourseIds.has(courseId);
}

/** 1-based rank of a course in a student's list, or null if they did not rank it. */
export function rankOf(student: AllocationStudent, courseId: string): PreferenceRank | null {
  const index = student.preferences.indexOf(courseId);
  return index < 0 ? null : ((index + 1) as PreferenceRank);
}
