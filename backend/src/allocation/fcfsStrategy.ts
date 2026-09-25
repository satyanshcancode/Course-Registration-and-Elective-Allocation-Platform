/**
 * First come, first served — the baseline the problem statement argues
 * against.
 *
 * Students are processed in the order their submission arrived (the database
 * sequence, not any client clock) and each takes the highest-ranked course
 * that still has a seat. Nothing about the student matters except how fast
 * they pressed Submit, which is exactly the behaviour the metrics are meant
 * to expose: compare its justified-envy count with Preference + Priority's.
 */
import type { AllocationMethod } from '@course-reg/shared';
import { buildOutput, type StrategyDecision } from './results.js';
import {
  indexCourses,
  isAllocatable,
  type AllocationInput,
  type AllocationOutput,
  type AllocationStrategy,
} from './types.js';

export class FcfsStrategy implements AllocationStrategy {
  readonly method: AllocationMethod = 'FCFS';
  readonly algorithmVersion = 'fcfs-1.0.0';

  allocate(input: AllocationInput): AllocationOutput {
    const courses = indexCourses(input.courses);
    const seatsLeft = new Map(
      [...courses.values()].map((course) => [course.courseId, course.capacity]),
    );

    // Arrival order; the id breaks a tie so the order is total even if two
    // submissions somehow share a sequence number.
    const arrivals = [...input.students].sort(
      (a, b) => a.sequence - b.sequence || a.studentId.localeCompare(b.studentId),
    );

    const assigned = new Map<string, string>();
    for (const student of arrivals) {
      const choice = student.preferences.find(
        (courseId) =>
          isAllocatable(student, courseId, courses) && (seatsLeft.get(courseId) ?? 0) > 0,
      );
      if (choice !== undefined) {
        assigned.set(student.studentId, choice);
        seatsLeft.set(choice, (seatsLeft.get(choice) ?? 0) - 1);
      }
    }

    // Every course ranks its applicants the only way this method knows how.
    const ranking = new Map<string, string[]>();
    for (const student of arrivals) {
      for (const courseId of student.preferences) {
        if (isAllocatable(student, courseId, courses)) {
          ranking.set(courseId, [...(ranking.get(courseId) ?? []), student.studentId]);
        }
      }
    }

    const decision: StrategyDecision = { assigned, ranking, scores: null };
    return buildOutput(input, decision);
  }
}
