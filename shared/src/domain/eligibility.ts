/**
 * Result of checking whether a student may take a course. Each reason is a
 * discriminated union member so the UI can render a precise message.
 */
export type IneligibilityReason =
  | { code: 'PROGRAM_NOT_ELIGIBLE' }
  | { code: 'SEMESTER_TOO_LOW'; requiredSemester: number; currentSemester: number }
  | { code: 'INSUFFICIENT_CREDITS'; requiredCredits: number; completedCredits: number }
  | { code: 'MISSING_PREREQUISITES'; missingCourseIds: string[] }
  | { code: 'ALREADY_COMPLETED' };

export type IneligibilityReasonCode = IneligibilityReason['code'];

export type EligibilityResult =
  { eligible: true } | { eligible: false; reasons: IneligibilityReason[] };
