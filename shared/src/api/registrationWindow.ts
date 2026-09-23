/**
 * Admin registration-window management: reading the window with its full
 * policy, editing it while it is a DRAFT, and moving it through
 * DRAFT -> OPEN -> CLOSED. (ALLOCATED is set later by the allocation run.)
 *
 * Opening freezes the policy: method, weights, priority points, seed and the
 * offered courses can no longer change, because students submit against them.
 */
import type { AllocationConfig } from '../domain/allocationConfig.js';
import type { AcademicTerm } from '../domain/academicTerm.js';
import type { RegistrationWindowStatus } from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { DepartmentRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';

/** A course that can be offered in the window, with its seats if it is. */
export interface WindowCourseOption {
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  /** Included in this window's offerings. */
  offered: boolean;
  /** Seats configured for the offering; null when the course isn't offered. */
  capacity: number | null;
  /** SUBMITTED requests for the course in this window. */
  demand: number;
}

/** Counts shown on the admin window page and dashboard. */
export interface WindowCounts {
  offeredCourses: number;
  /** Students eligible for at least one offered course. */
  eligibleStudents: number;
  submissions: number;
  totalStudents: number;
}

/** GET /api/admin/registration-window. */
export interface AdminWindowDetail {
  window: RegistrationWindowSummary | null;
  /** Null when no window exists yet. */
  policy: AllocationConfig | null;
  randomSeed: number | null;
  /** The policy can still be changed (DRAFT only). */
  editable: boolean;
  counts: WindowCounts;
  courses: WindowCourseOption[];
  serverTime: IsoDateTime;
}

/** PATCH /api/admin/registration-window (DRAFT only). */
export interface UpdateWindowRequest {
  name: string;
  term: AcademicTerm;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  /** Course codes offered in the window; at least one to open. */
  courseCodes: string[];
  policy: AllocationConfig;
  /** Tie-break seed; the server generates one when it is left out. */
  randomSeed?: number;
  reason?: string;
}

/** POST /api/admin/registration-window/open and /close. */
export interface WindowActionRequest {
  reason?: string;
}

export const WINDOW_NAME_LENGTH = { min: 3, max: 80 } as const;
export const WINDOW_REASON_LENGTH = { max: 500 } as const;
/** Preference weights and priority points are percentages of a 100-point scale. */
export const POLICY_POINT_LIMITS = { min: 0, max: 100 } as const;
/** Unsigned 32-bit, matching registration_windows_random_seed_check. */
export const RANDOM_SEED_LIMITS = { min: 0, max: 4_294_967_295 } as const;

/** Statuses an admin can move the window to in this scope. */
export const WINDOW_TRANSITIONS: Readonly<
  Record<'open' | 'close', { from: RegistrationWindowStatus; to: RegistrationWindowStatus }>
> = {
  open: { from: 'DRAFT', to: 'OPEN' },
  close: { from: 'OPEN', to: 'CLOSED' },
};
