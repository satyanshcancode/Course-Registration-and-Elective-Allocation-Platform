/**
 * Preference + Priority, by student-proposing deferred acceptance.
 *
 * Every student proposes to their highest remaining choice. Each course keeps
 * the best applicants it has seen, up to capacity, and rejects the rest —
 * "deferred" because a hold is provisional: a better applicant arriving later
 * displaces one already held. Rejected students propose to their next choice.
 * The loop ends when nobody is holding a rejection, and only then is the
 * result final.
 *
 * Why this and not "sort everyone by score and hand out seats": a global sort
 * can give a student their third choice while their first choice ends up with
 * someone who scored lower for it. Deferred acceptance cannot. See
 * docs/ALLOCATION.md for the fairness argument in full.
 */
import type { AllocationMethod, PreferenceRank, ScoreBreakdown } from '@course-reg/shared';
import { buildOutput, type StrategyDecision } from './results.js';
import { compareApplicants, scoreFor, scoringConfigFor, tieBreaksFor } from './scoring.js';
import {
  indexCourses,
  isAllocatable,
  type AllocationInput,
  type AllocationOutput,
  type AllocationStrategy,
} from './types.js';

/** One student's standing with one course. */
interface Applicant {
  studentId: string;
  total: number;
  tieBreak: number;
}

export class PreferencePriorityStrategy implements AllocationStrategy {
  readonly method: AllocationMethod = 'PREFERENCE_PRIORITY';
  readonly algorithmVersion = 'deferred-acceptance-1.0.0';

  allocate(input: AllocationInput): AllocationOutput {
    const courses = indexCourses(input.courses);
    const config = scoringConfigFor(input.config);
    const tieBreaks = tieBreaksFor(input.students, input.randomSeed);

    // Every (student, course) score, computed once. It is also what each
    // course ranks by, so no scoring happens inside the proposal loop.
    const scores = new Map<string, Map<string, ScoreBreakdown>>();
    for (const course of courses.values()) {
      scores.set(course.courseId, new Map());
    }
    for (const student of input.students) {
      for (const [index, courseId] of student.preferences.entries()) {
        const course = courses.get(courseId);
        if (!course || !isAllocatable(student, courseId, courses)) {
          continue;
        }
        const rank = (index + 1) as PreferenceRank;
        scores
          .get(courseId)
          ?.set(student.studentId, scoreFor(student, course, rank, input.term, config));
      }
    }

    const applicantFor = (studentId: string, courseId: string): Applicant => ({
      studentId,
      total: scores.get(courseId)?.get(studentId)?.total ?? 0,
      tieBreak: tieBreaks.get(studentId) ?? 0,
    });

    // The courses each student may still be given, in their own order.
    const choicesFor = new Map(
      input.students.map((student) => [
        student.studentId,
        student.preferences.filter((courseId) => isAllocatable(student, courseId, courses)),
      ]),
    );

    /** How far down their list each student has already proposed. */
    const nextChoice = new Map(input.students.map((student) => [student.studentId, 0]));
    /** Provisional holds, worst applicant last. */
    const held = new Map<string, Applicant[]>(
      [...courses.values()].map((course) => [course.courseId, []]),
    );

    // A queue rather than recursion: a rejected student re-enters at the back.
    // Sorted by id so the starting order never depends on the database.
    const pending = [...input.students]
      .map((student) => student.studentId)
      .sort((a, b) => a.localeCompare(b));

    while (pending.length > 0) {
      const studentId = pending.shift();
      if (studentId === undefined) {
        break;
      }
      const choices = choicesFor.get(studentId) ?? [];
      const index = nextChoice.get(studentId) ?? 0;
      const courseId = choices[index];
      if (courseId === undefined) {
        continue; // Every choice has rejected them: they get nothing.
      }
      nextChoice.set(studentId, index + 1);

      const course = courses.get(courseId);
      const holders = held.get(courseId);
      if (!course || !holders) {
        pending.push(studentId);
        continue;
      }

      holders.push(applicantFor(studentId, courseId));
      holders.sort(compareApplicants);
      if (holders.length > course.capacity) {
        // Exactly one can be over capacity, because one was just added.
        const rejected = holders.pop();
        if (rejected) {
          pending.push(rejected.studentId);
        }
      }
    }

    const assigned = new Map<string, string>();
    for (const [courseId, holders] of held) {
      for (const holder of holders) {
        assigned.set(holder.studentId, courseId);
      }
    }

    // Each course's full ranking of its applicants, for waitlist order and
    // for the "you came 7th of 113" line in the explanation.
    const ranking = new Map<string, string[]>();
    for (const course of courses.values()) {
      const applicants: Applicant[] = [];
      for (const student of input.students) {
        if (isAllocatable(student, course.courseId, courses)) {
          applicants.push(applicantFor(student.studentId, course.courseId));
        }
      }
      applicants.sort(compareApplicants);
      ranking.set(
        course.courseId,
        applicants.map((applicant) => applicant.studentId),
      );
    }

    const decision: StrategyDecision = { assigned, ranking, scores };
    return buildOutput(input, decision);
  }
}
