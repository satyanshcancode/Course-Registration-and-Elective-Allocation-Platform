/**
 * Turning an assignment into the run's record: one row per student per ranked
 * course, each with the explanation that student is owed, plus the metrics
 * that let the two methods be compared.
 *
 * Both strategies end here, so "waitlisted on every course you ranked above
 * the one you got" is written once, not twice.
 */
import type {
  AllocationExplanation,
  AllocationMetrics,
  AllocationOutcome,
  CourseAllocationMetric,
  PreferenceRank,
  ScoreBreakdown,
} from '@course-reg/shared';
import { scoreFor, scoringConfigFor } from './scoring.js';
import {
  indexCourses,
  isAllocatable,
  rankOf,
  type AllocationCourse,
  type AllocationInput,
  type AllocationOutput,
  type AllocationResultRow,
  type AllocationStudent,
} from './types.js';

/**
 * Everything a strategy has to decide. The rest — waitlists, explanations,
 * metrics — follows from it.
 */
export interface StrategyDecision {
  /** studentId -> the course they hold a seat in. */
  assigned: ReadonlyMap<string, string>;
  /**
   * courseId -> the students who ranked it, best first, in this method's own
   * order (score then tie-break, or arrival order). Students who are no longer
   * eligible are NOT in this list; they are appended when rows are numbered.
   */
  ranking: ReadonlyMap<string, readonly string[]>;
  /** courseId -> studentId -> score; null for a method that does not score. */
  scores: ReadonlyMap<string, ReadonlyMap<string, ScoreBreakdown>> | null;
}

const courseRef = (course: AllocationCourse) => ({ code: course.code, name: course.name });

/** The students who ranked each course but may no longer take it. */
function ineligibleRankers(
  input: AllocationInput,
  courses: ReadonlyMap<string, AllocationCourse>,
): Map<string, string[]> {
  const byCourse = new Map<string, string[]>();
  for (const student of input.students) {
    for (const courseId of student.preferences) {
      if (courses.has(courseId) && !student.eligibleCourseIds.has(courseId)) {
        byCourse.set(courseId, [...(byCourse.get(courseId) ?? []), student.studentId]);
      }
    }
  }
  // Sorted so the numbering does not depend on the input's row order.
  for (const list of byCourse.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return byCourse;
}

/** Everyone who ranked a course, competing applicants first. */
function placementsFor(
  input: AllocationInput,
  courses: ReadonlyMap<string, AllocationCourse>,
  decision: StrategyDecision,
): Map<string, Map<string, number>> {
  const ineligible = ineligibleRankers(input, courses);
  const placements = new Map<string, Map<string, number>>();
  for (const course of courses.values()) {
    const competing = decision.ranking.get(course.courseId) ?? [];
    const rest = ineligible.get(course.courseId) ?? [];
    placements.set(
      course.courseId,
      new Map([...competing, ...rest].map((studentId, index) => [studentId, index + 1])),
    );
  }
  return placements;
}

interface CourseSummary {
  capacity: number;
  applicants: number;
  allocated: number;
  waitlisted: number;
  cutoffScore: number | null;
}

/** The numbers that appear in every explanation about one course. */
function summariseCourses(
  courses: ReadonlyMap<string, AllocationCourse>,
  decision: StrategyDecision,
): Map<string, CourseSummary> {
  const allocatedPerCourse = new Map<string, string[]>();
  for (const [studentId, courseId] of decision.assigned) {
    allocatedPerCourse.set(courseId, [...(allocatedPerCourse.get(courseId) ?? []), studentId]);
  }

  const summaries = new Map<string, CourseSummary>();
  for (const course of courses.values()) {
    const competing = decision.ranking.get(course.courseId) ?? [];
    const holders = allocatedPerCourse.get(course.courseId) ?? [];
    const courseScores = decision.scores?.get(course.courseId);
    // A course that did not fill has no cut-off: nobody was kept out by score.
    const filled = holders.length >= course.capacity && holders.length > 0;
    const totals = courseScores
      ? holders.map((studentId) => courseScores.get(studentId)?.total ?? 0)
      : [];
    summaries.set(course.courseId, {
      capacity: course.capacity,
      applicants: competing.length,
      allocated: holders.length,
      waitlisted: 0,
      cutoffScore: filled && totals.length > 0 ? Math.min(...totals) : null,
    });
  }
  return summaries;
}

/** The outcome for one ranked course, given what the student ended up with. */
function outcomeFor(
  student: AllocationStudent,
  courseId: string,
  rank: PreferenceRank,
  assignedCourseId: string | undefined,
  allocatable: boolean,
): AllocationOutcome {
  if (!allocatable) {
    return 'NOT_ALLOCATED';
  }
  if (assignedCourseId === courseId) {
    return 'ALLOCATED';
  }
  if (assignedCourseId === undefined) {
    // Nothing at all: still in the queue for everything they asked for.
    return 'WAITLISTED';
  }
  const assignedRank = rankOf(student, assignedCourseId);
  // Ranked above what they got, so a later promotion would be an upgrade.
  return assignedRank !== null && rank < assignedRank ? 'WAITLISTED' : 'NOT_ALLOCATED';
}

function explain(
  outcome: AllocationOutcome,
  facts: Omit<Extract<AllocationExplanation, { type: 'ALLOCATED' }>, 'type'>,
  options: {
    allocatable: boolean;
    waitlistPosition: number | null;
    grantedCourse: AllocationCourse | undefined;
    grantedRank: PreferenceRank | null;
  },
): AllocationExplanation {
  if (outcome === 'ALLOCATED') {
    return { type: 'ALLOCATED', ...facts };
  }
  if (outcome === 'WAITLISTED') {
    return { type: 'WAITLISTED', waitlistPosition: options.waitlistPosition ?? 1, ...facts };
  }
  if (!options.allocatable) {
    return { type: 'NOT_ALLOCATED_INELIGIBLE', ...facts };
  }
  if (options.grantedCourse && options.grantedRank !== null) {
    return {
      type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
      grantedCourse: courseRef(options.grantedCourse),
      grantedRank: options.grantedRank,
      ...facts,
    };
  }
  return { type: 'NOT_ALLOCATED_FULL', ...facts };
}

/**
 * Pairs where a student would rather have a course that admitted someone with
 * a lower score for it — "justified envy".
 *
 * It is always measured with the preference-priority scoring, even for an FCFS
 * run, because the question being asked is whether the outcome can be defended
 * on merit. Preference + Priority produces 0 by construction; FCFS usually
 * does not, and that gap is the argument for scoring.
 */
export function countJustifiedEnvy(
  input: AllocationInput,
  assigned: ReadonlyMap<string, string>,
  courses: ReadonlyMap<string, AllocationCourse>,
): number {
  const config = scoringConfigFor(input.config);
  const byStudent = new Map(input.students.map((student) => [student.studentId, student]));

  // The lowest score each course accepted, under the measuring scale.
  const lowestAccepted = new Map<string, number>();
  for (const [studentId, courseId] of assigned) {
    const student = byStudent.get(studentId);
    const course = courses.get(courseId);
    const rank = student ? rankOf(student, courseId) : null;
    if (!student || !course || rank === null) {
      continue;
    }
    const { total } = scoreFor(student, course, rank, input.term, config);
    const current = lowestAccepted.get(courseId);
    if (current === undefined || total < current) {
      lowestAccepted.set(courseId, total);
    }
  }

  let envy = 0;
  for (const student of input.students) {
    const held = assigned.get(student.studentId);
    const heldRank = held === undefined ? null : rankOf(student, held);
    for (const [index, courseId] of student.preferences.entries()) {
      const rank = (index + 1) as PreferenceRank;
      const course = courses.get(courseId);
      if (!course || !isAllocatable(student, courseId, courses)) {
        continue;
      }
      // Only a course they would rather have than what they hold.
      if (heldRank !== null && rank >= heldRank) {
        continue;
      }
      const lowest = lowestAccepted.get(courseId);
      if (lowest === undefined) {
        continue;
      }
      if (scoreFor(student, course, rank, input.term, config).total > lowest) {
        envy += 1;
      }
    }
  }
  return envy;
}

/** Builds the rows, the explanations and the metrics from one decision. */
export function buildOutput(input: AllocationInput, decision: StrategyDecision): AllocationOutput {
  const courses = indexCourses(input.courses);
  const placements = placementsFor(input, courses, decision);
  const summaries = summariseCourses(courses, decision);

  const rows: AllocationResultRow[] = [];
  const waitlistedByCourse = new Map<string, AllocationResultRow[]>();

  for (const student of input.students) {
    const assignedCourseId = decision.assigned.get(student.studentId);
    const grantedCourse = assignedCourseId ? courses.get(assignedCourseId) : undefined;
    const grantedRank = assignedCourseId ? rankOf(student, assignedCourseId) : null;

    for (const [index, courseId] of student.preferences.entries()) {
      const course = courses.get(courseId);
      if (!course) {
        // Not offered in this window; there is nothing to decide.
        continue;
      }
      const rank = (index + 1) as PreferenceRank;
      const allocatable = isAllocatable(student, courseId, courses);
      const outcome = outcomeFor(student, courseId, rank, assignedCourseId, allocatable);
      const summary = summaries.get(courseId);
      const score = decision.scores?.get(courseId)?.get(student.studentId) ?? null;

      const row: AllocationResultRow = {
        studentId: student.studentId,
        courseId,
        rank,
        outcome,
        finalRank: placements.get(courseId)?.get(student.studentId) ?? 1,
        waitlistPosition: null,
        score,
        explanation: explain(
          outcome,
          {
            course: courseRef(course),
            preferenceRank: rank,
            score,
            finalRank: placements.get(courseId)?.get(student.studentId) ?? 1,
            capacity: summary?.capacity ?? course.capacity,
            applicants: summary?.applicants ?? 0,
            cutoffScore: summary?.cutoffScore ?? null,
          },
          { allocatable, waitlistPosition: null, grantedCourse, grantedRank },
        ),
      };
      rows.push(row);
      if (outcome === 'WAITLISTED') {
        waitlistedByCourse.set(courseId, [...(waitlistedByCourse.get(courseId) ?? []), row]);
      }
    }
  }

  // Waitlist positions: the same order the method used, renumbered from 1 so
  // "you are 7th in line" means seven seats, not seven applicants.
  for (const [courseId, waiting] of waitlistedByCourse) {
    waiting.sort((a, b) => a.finalRank - b.finalRank);
    waiting.forEach((row, index) => {
      row.waitlistPosition = index + 1;
      if (row.explanation.type === 'WAITLISTED') {
        row.explanation.waitlistPosition = index + 1;
      }
    });
    const summary = summaries.get(courseId);
    if (summary) {
      summary.waitlisted = waiting.length;
    }
  }

  return { results: rows, metrics: buildMetrics(input, decision, courses, summaries) };
}

function buildMetrics(
  input: AllocationInput,
  decision: StrategyDecision,
  courses: ReadonlyMap<string, AllocationCourse>,
  summaries: ReadonlyMap<string, CourseSummary>,
): AllocationMetrics {
  // Only students who could have been given something are counted: a student
  // whose every preference is now ineligible is not evidence about a method.
  const participants = input.students.filter((student) =>
    student.preferences.some((courseId) => isAllocatable(student, courseId, courses)),
  );

  const allocatedRanks: number[] = [];
  for (const student of participants) {
    const courseId = decision.assigned.get(student.studentId);
    const rank = courseId === undefined ? null : rankOf(student, courseId);
    if (rank !== null) {
      allocatedRanks.push(rank);
    }
  }

  const students = participants.length;
  const allocated = allocatedRanks.length;
  const share = (count: number) => (students === 0 ? 0 : count / students);
  const seatsOffered = [...courses.values()].reduce((total, course) => total + course.capacity, 0);

  const courseMetrics: CourseAllocationMetric[] = [...courses.values()].map((course) => {
    const summary = summaries.get(course.courseId);
    return {
      course: courseRef(course),
      capacity: course.capacity,
      applicants: summary?.applicants ?? 0,
      allocated: summary?.allocated ?? 0,
      waitlisted: summary?.waitlisted ?? 0,
      cutoffScore: summary?.cutoffScore ?? null,
      oversubscribed: (summary?.applicants ?? 0) > course.capacity,
    };
  });
  courseMetrics.sort((a, b) => a.course.code.localeCompare(b.course.code));

  return {
    students,
    allocated,
    unallocated: students - allocated,
    firstChoiceRate: share(allocatedRanks.filter((rank) => rank === 1).length),
    topThreeRate: share(allocatedRanks.filter((rank) => rank <= 3).length),
    averageAllocatedRank:
      allocated === 0 ? null : allocatedRanks.reduce((total, rank) => total + rank, 0) / allocated,
    seatsOffered,
    seatsFilled: allocated,
    seatUtilisation: seatsOffered === 0 ? 0 : allocated / seatsOffered,
    waitlistEntries: courseMetrics.reduce((total, course) => total + course.waitlisted, 0),
    justifiedEnvy: countJustifiedEnvy(input, decision.assigned, courses),
    // Measured by the caller, which owns the clock; the engine has none.
    runtimeMs: 0,
    courses: courseMetrics,
  };
}
