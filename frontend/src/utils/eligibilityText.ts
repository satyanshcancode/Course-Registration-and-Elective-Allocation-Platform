/**
 * The ONE place eligibility reasons become English. Every page that shows a
 * reason — the catalogue card, the course detail page and the pre-check —
 * calls `describeReason`, so the wording can never drift between them.
 */
import type { IneligibilityReason, ProgramRef } from '@course-reg/shared';

/**
 * Exhaustiveness guard. `value` is `never` only while every member of the
 * union is handled above, so adding a reason type to the shared union breaks
 * the build here until it has a message.
 */
function unhandledReason(value: never): string {
  throw new Error(`Unhandled eligibility reason: ${JSON.stringify(value)}`);
}

/** "CSE, ECE and Mathematics" */
function listPrograms(programs: readonly ProgramRef[]): string {
  const names = programs.map((program) => program.code);
  if (names.length <= 1) {
    return names[0] ?? 'another programme';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One sentence per reason, naming exactly what is missing. */
export function describeReason(reason: IneligibilityReason): string {
  switch (reason.type) {
    case 'PROGRAM_NOT_ALLOWED':
      return `Open to ${listPrograms(reason.allowedPrograms)} only — you’re in ${reason.program.code}`;
    case 'SEMESTER_TOO_LOW':
      return `Needs semester ${reason.required} — you’re in semester ${reason.actual}`;
    case 'CREDITS_TOO_LOW':
      return `Needs ${reason.required} credits — you have ${reason.actual}`;
    case 'PREREQUISITE_MISSING':
      return `Complete ${reason.course.code} ${reason.course.name} first`;
    case 'ALREADY_COMPLETED':
      return 'You’ve already passed this course';
    default:
      return unhandledReason(reason);
  }
}

/** "You’re eligible for 12 of 20 courses" */
export function describeEligibilityCount(eligibleCount: number, totalCount: number): string {
  if (totalCount === 0) {
    return 'No courses are offered yet';
  }
  return `You’re eligible for ${eligibleCount} of ${totalCount} ${totalCount === 1 ? 'course' : 'courses'}`;
}
