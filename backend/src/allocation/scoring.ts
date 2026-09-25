/**
 * What a student is worth to a course, and how ties are settled.
 *
 * Pure and separately tested: the score is the one number the whole method
 * rests on, and a student is owed an explanation of it, so it is returned as
 * a breakdown ("100 + 20 + 25") rather than a bare total.
 */
import {
  compareTerms,
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  isPreferencePriorityConfig,
  type AllocationConfig,
  type PreferencePriorityAllocationConfig,
  type PreferenceRank,
  type ScoreBonus,
  type ScoreBreakdown,
} from '@course-reg/shared';
import { createSeededRandom } from '../utils/random.js';
import type { AllocationCourse, AllocationStudent } from './types.js';

/** A student in semester 7 or 8 is in their final year. */
export const FINAL_YEAR_SEMESTER = 7;

/**
 * The scoring rules to measure with. A window that froze FCFS has no weights
 * of its own, so comparing the two methods (and counting justified envy for
 * FCFS) falls back to the defaults — the same rules for both sides, which is
 * what makes the comparison honest.
 */
export function scoringConfigFor(config: AllocationConfig): PreferencePriorityAllocationConfig {
  return isPreferencePriorityConfig(config) ? config : DEFAULT_PREFERENCE_PRIORITY_CONFIG;
}

/** The priority bonuses this student earns for this course, in a fixed order. */
function bonusesFor(
  student: AllocationStudent,
  course: AllocationCourse,
  term: string,
  config: PreferencePriorityAllocationConfig,
): ScoreBonus[] {
  const { priorityPoints } = config;
  const bonuses: ScoreBonus[] = [];

  if (student.semester >= FINAL_YEAR_SEMESTER && priorityPoints.finalYear > 0) {
    bonuses.push({ type: 'FINAL_YEAR', points: priorityPoints.finalYear });
  }
  if (course.relevantProgramIds.has(student.programId) && priorityPoints.programRelevance > 0) {
    bonuses.push({ type: 'PROGRAM_RELEVANCE', points: priorityPoints.programRelevance });
  }
  // Graduating on or before this term: a missed elective can delay a degree.
  if (
    compareTerms(student.expectedGraduationTerm, term as typeof student.expectedGraduationTerm) <=
      0 &&
    priorityPoints.graduationUrgency > 0
  ) {
    bonuses.push({ type: 'GRADUATION_URGENCY', points: priorityPoints.graduationUrgency });
  }
  return bonuses;
}

/** preference weight for the rank + every priority bonus that applies. */
export function scoreFor(
  student: AllocationStudent,
  course: AllocationCourse,
  rank: PreferenceRank,
  term: string,
  config: PreferencePriorityAllocationConfig,
): ScoreBreakdown {
  const preferencePoints = config.preferenceWeights[rank];
  const bonuses = bonusesFor(student, course, term, config);
  const priorityPoints = bonuses.reduce((total, bonus) => total + bonus.points, 0);
  return {
    preferenceRank: rank,
    preferencePoints,
    bonuses,
    priorityPoints,
    total: preferencePoints + priorityPoints,
  };
}

/**
 * One tie-break number per student, derived from the window's stored seed.
 *
 * It is drawn ONCE per student, not per comparison. A fresh draw each time two
 * students are compared would make the ordering non-transitive — A beats B, B
 * beats C, C beats A — so the result would depend on the order comparisons
 * happen to be made, and re-running the same input could produce a different
 * answer. One number per student gives a single, total, reproducible order
 * that is also consistent across every course the student applies to.
 *
 * Students are sorted by id before drawing, so the numbers do not depend on
 * the order the rows came back from the database.
 */
export function tieBreaksFor(
  students: readonly AllocationStudent[],
  randomSeed: number,
): ReadonlyMap<string, number> {
  const random = createSeededRandom(randomSeed);
  const ordered = [...students].sort((a, b) => a.studentId.localeCompare(b.studentId));
  return new Map(ordered.map((student) => [student.studentId, random.next()]));
}

/** Higher score first, then the seeded tie-break, then the id so it is total. */
export function compareApplicants(
  a: { studentId: string; total: number; tieBreak: number },
  b: { studentId: string; total: number; tieBreak: number },
): number {
  return b.total - a.total || b.tieBreak - a.tieBreak || a.studentId.localeCompare(b.studentId);
}
