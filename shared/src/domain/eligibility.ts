/**
 * Why a student may or may not take a course.
 *
 * Each reason is a member of a discriminated union on `type` and carries every
 * value its message needs (names and codes, never database ids), so the UI
 * formats one sentence per reason without looking anything up. One missing
 * prerequisite produces one reason, so "Complete CS201 Data Structures first"
 * needs no array handling.
 */
import type { CourseRef, ProgramRef } from './refs.js';

export type IneligibilityReason =
  | { type: 'PROGRAM_NOT_ALLOWED'; program: ProgramRef; allowedPrograms: ProgramRef[] }
  | { type: 'SEMESTER_TOO_LOW'; required: number; actual: number }
  | { type: 'CREDITS_TOO_LOW'; required: number; actual: number }
  | { type: 'PREREQUISITE_MISSING'; course: CourseRef }
  | { type: 'ALREADY_COMPLETED' };

export type IneligibilityReasonType = IneligibilityReason['type'];

/** Every reason type, so a formatter or a test can cover the whole union. */
export const INELIGIBILITY_REASON_TYPES = [
  'PROGRAM_NOT_ALLOWED',
  'SEMESTER_TOO_LOW',
  'CREDITS_TOO_LOW',
  'PREREQUISITE_MISSING',
  'ALREADY_COMPLETED',
] as const satisfies readonly IneligibilityReasonType[];

export type EligibilityResult =
  { eligible: true } | { eligible: false; reasons: IneligibilityReason[] };
