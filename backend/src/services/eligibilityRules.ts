import type { EligibilityResult, IneligibilityReason, ProgramRef } from '@course-reg/shared';
import type { IdentifiedRef } from '../types/catalogue.js';

/** The student facts eligibility depends on. */
export interface EligibilityStudent {
  programId: string;
  /** The student's programme, so a reason can name it. */
  program: ProgramRef;
  semester: number;
  creditsCompleted: number;
  completedCourseIds: ReadonlySet<string>;
}

/**
 * The course rules eligibility depends on. References carry their code and
 * name as well as their id, so each reason is ready to display and nothing
 * has to look an id up afterwards.
 */
export interface EligibilityCourse {
  id: string;
  minSemester: number;
  minCredits: number;
  /** Empty means the course is open to every program. */
  eligiblePrograms: readonly IdentifiedRef[];
  prerequisites: readonly IdentifiedRef[];
}

const toRef = ({ code, name }: IdentifiedRef): { code: string; name: string } => ({ code, name });

/**
 * Pure eligibility rule: collects every reason a student cannot take a course,
 * so the student sees all problems at once rather than one at a time. One
 * missing prerequisite is one reason.
 */
export function evaluateEligibility(
  student: EligibilityStudent,
  course: EligibilityCourse,
): EligibilityResult {
  const reasons: IneligibilityReason[] = [];

  if (student.completedCourseIds.has(course.id)) {
    reasons.push({ type: 'ALREADY_COMPLETED' });
  }
  if (
    course.eligiblePrograms.length > 0 &&
    !course.eligiblePrograms.some((program) => program.id === student.programId)
  ) {
    reasons.push({
      type: 'PROGRAM_NOT_ALLOWED',
      program: student.program,
      allowedPrograms: course.eligiblePrograms.map(toRef),
    });
  }
  if (student.semester < course.minSemester) {
    reasons.push({
      type: 'SEMESTER_TOO_LOW',
      required: course.minSemester,
      actual: student.semester,
    });
  }
  if (student.creditsCompleted < course.minCredits) {
    reasons.push({
      type: 'CREDITS_TOO_LOW',
      required: course.minCredits,
      actual: student.creditsCompleted,
    });
  }
  course.prerequisites
    .filter((prerequisite) => !student.completedCourseIds.has(prerequisite.id))
    .forEach((prerequisite) => {
      reasons.push({ type: 'PREREQUISITE_MISSING', course: toRef(prerequisite) });
    });

  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}
