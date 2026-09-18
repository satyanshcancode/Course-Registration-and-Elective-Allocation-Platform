import type { EligibilityResult, IneligibilityReason } from '@course-reg/shared';

/** The student facts eligibility depends on. */
export interface EligibilityStudent {
  programId: string;
  semester: number;
  creditsCompleted: number;
  completedCourseIds: ReadonlySet<string>;
}

/** The course rules eligibility depends on. */
export interface EligibilityCourse {
  id: string;
  minSemester: number;
  minCredits: number;
  /** Empty means the course is open to every program. */
  eligibleProgramIds: readonly string[];
  prerequisiteCourseIds: readonly string[];
}

/**
 * Pure eligibility rule: collects every reason a student cannot take a course,
 * so the student sees all problems at once rather than one at a time.
 */
export function evaluateEligibility(
  student: EligibilityStudent,
  course: EligibilityCourse,
): EligibilityResult {
  const reasons: IneligibilityReason[] = [];

  if (student.completedCourseIds.has(course.id)) {
    reasons.push({ code: 'ALREADY_COMPLETED' });
  }
  if (
    course.eligibleProgramIds.length > 0 &&
    !course.eligibleProgramIds.includes(student.programId)
  ) {
    reasons.push({ code: 'PROGRAM_NOT_ELIGIBLE' });
  }
  if (student.semester < course.minSemester) {
    reasons.push({
      code: 'SEMESTER_TOO_LOW',
      requiredSemester: course.minSemester,
      currentSemester: student.semester,
    });
  }
  if (student.creditsCompleted < course.minCredits) {
    reasons.push({
      code: 'INSUFFICIENT_CREDITS',
      requiredCredits: course.minCredits,
      completedCredits: student.creditsCompleted,
    });
  }
  const missingCourseIds = course.prerequisiteCourseIds.filter(
    (courseId) => !student.completedCourseIds.has(courseId),
  );
  if (missingCourseIds.length > 0) {
    reasons.push({ code: 'MISSING_PREREQUISITES', missingCourseIds });
  }

  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}
