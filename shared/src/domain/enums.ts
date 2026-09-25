/**
 * String-literal unions for every status/role/method column.
 *
 * Each union is derived from a readonly tuple, so the same values are available
 * at runtime (validation, dropdowns) and stay in sync with the database CHECK
 * constraints of the same name.
 */

export const USER_ROLES = ['STUDENT', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TERM_SEASONS = ['SPRING', 'FALL'] as const;
export type TermSeason = (typeof TERM_SEASONS)[number];

export const REGISTRATION_WINDOW_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ALLOCATED'] as const;
export type RegistrationWindowStatus = (typeof REGISTRATION_WINDOW_STATUSES)[number];

export const ALLOCATION_METHODS = ['FCFS', 'PREFERENCE_PRIORITY'] as const;
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Ranks 1 (most wanted) to 5. */
export const PREFERENCE_RANKS = [1, 2, 3, 4, 5] as const;
export type PreferenceRank = (typeof PREFERENCE_RANKS)[number];
export const MAX_PREFERENCES = PREFERENCE_RANKS.length;

export const ENROLLMENT_STATUSES = ['ACTIVE', 'DROPPED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_SOURCES = ['ALLOCATION', 'WAITLIST_PROMOTION', 'ADD'] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];

/** Why an ACTIVE seat was released. Mirrors enrollments_drop_reason_check. */
export const ENROLLMENT_DROP_REASONS = [
  'UPGRADED',
  'ADMIN_WITHDRAWAL',
  'STUDENT_DROP',
  /** Released to take another course in the same add/drop action. */
  'SWAPPED',
] as const;
export type EnrollmentDropReason = (typeof ENROLLMENT_DROP_REASONS)[number];

export const WAITLIST_STATUSES = ['WAITING', 'PROMOTED', 'REMOVED'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/**
 * Why a waiting entry ended without a promotion: the student no longer met the
 * course's requirements, they were promoted somewhere they ranked higher, they
 * left the queue themselves, or they took a seat elsewhere while waiting on a
 * queue they joined during add/drop rather than ranked (so "would this be an
 * upgrade?" has no answer).
 */
export const WAITLIST_REMOVAL_REASONS = [
  'INELIGIBLE',
  'RANKED_BELOW_SEAT',
  'STUDENT_LEFT',
  'SEAT_ELSEWHERE',
] as const;
export type WaitlistRemovalReason = (typeof WAITLIST_REMOVAL_REASONS)[number];

export const ALLOCATION_RUN_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type AllocationRunStatus = (typeof ALLOCATION_RUN_STATUSES)[number];

export const ALLOCATION_OUTCOMES = ['ALLOCATED', 'WAITLISTED', 'NOT_ALLOCATED'] as const;
export type AllocationOutcome = (typeof ALLOCATION_OUTCOMES)[number];

export const HISTORY_EVENT_TYPES = [
  'DRAFT_SAVED',
  'SUBMITTED',
  'ALLOCATED',
  'WAITLISTED',
  'NOT_ALLOCATED',
  'PROMOTED',
  'ADDED',
  'DROPPED',
  'SWAPPED',
  'WAITLIST_JOINED',
  'WAITLIST_LEFT',
  'WAITLIST_REMOVED',
] as const;
export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'ALLOCATION_RESULT',
  'WAITLIST_PROMOTION',
  'ENROLLMENT_CHANGE',
  'WINDOW_STATUS',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Type guard factory: narrows an unknown value to one member of a tuple. */
export function isOneOf<const T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value);
}
