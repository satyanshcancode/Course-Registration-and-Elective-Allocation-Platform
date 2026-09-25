/**
 * Add/drop: the five things a student can do to their own enrolment once
 * allocation has run, during the period an admin opens.
 *
 * Unlike a submit, every one of these actually MOVES A SEAT, so each request
 * carries an idempotency key and each reply says what happened rather than just
 * "ok". Why an action was refused is a discriminated union (`AddDropProblem`)
 * so the page can put each message beside the right course, exactly as the
 * cart does with `CartProblem`.
 */
import type { EligibilityResult } from '../domain/eligibility.js';
import type { EnrollmentDropReason, EnrollmentSource, PreferenceRank } from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { CourseRef, DepartmentRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';
import type { PromotionSummary, StudentWaitlistEntry } from './waitlist.js';

/** The five actions, as the URL suffix and the audit/ledger value. */
export const ADD_DROP_ACTIONS = ['DROP', 'ADD', 'SWAP', 'WAITLIST_JOIN', 'WAITLIST_LEAVE'] as const;
export type AddDropAction = (typeof ADD_DROP_ACTIONS)[number];

// ---------------------------------------------------------------------------
// The period
// ---------------------------------------------------------------------------

/** Whether add/drop is usable right now, and why not when it isn't. */
export interface AddDropPeriod {
  opensAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  /** Actions would be accepted right now. */
  open: boolean;
  /** Why not, in the student's words; null while it is open. */
  closedReason: string | null;
}

// ---------------------------------------------------------------------------
// GET /api/add-drop
// ---------------------------------------------------------------------------

/** One course a student could move into, with the numbers the decision needs. */
export interface AddDropCourse {
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  capacity: number;
  allocated: number;
  available: number;
  /** Which of their preferences this course was, if they ranked it. */
  preferenceRank: PreferenceRank | null;
  /** How many students are already waiting for it. */
  waiting: number;
}

/** The seat the student holds right now, if any. */
export interface AddDropSeat {
  course: CourseRef;
  credits: number;
  source: EnrollmentSource;
  preferenceRank: PreferenceRank | null;
  enrolledAt: IsoDateTime;
}

/**
 * GET /api/add-drop — everything the page needs in one request.
 *
 * Only courses the caller is ELIGIBLE for are listed: an ineligible course is
 * not an option they could take, and the catalogue already explains why.
 */
export interface AddDropView {
  window: RegistrationWindowSummary | null;
  period: AddDropPeriod;
  held: AddDropSeat | null;
  /** Eligible, offered courses with at least one free seat. */
  available: AddDropCourse[];
  /** Eligible, offered courses with no free seat — joinable queues. */
  full: AddDropCourse[];
  /** The caller's own waitlist entries that are still WAITING. */
  waiting: StudentWaitlistEntry[];
  serverTime: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** POST /api/add-drop/drop. */
export interface DropRequest {
  /** The course to release; checked against the seat actually held. */
  code: string;
  /** Also leave every queue they are waiting on. */
  leaveWaitlists?: boolean;
}

/** POST /api/add-drop/add. */
export interface AddRequest {
  code: string;
  /** Join the queue instead of failing when the course turns out to be full. */
  waitlistIfFull?: boolean;
}

/** POST /api/add-drop/swap — atomic: either the new seat is taken, or nothing. */
export interface SwapRequest {
  /** The seat to give up; checked against the seat actually held. */
  fromCode: string;
  toCode: string;
  /** Join the new course's queue instead, KEEPING the old seat, when it is full. */
  waitlistIfFull?: boolean;
}

/** POST /api/add-drop/waitlist/join and /waitlist/leave. */
export interface WaitlistRequest {
  code: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * What an action did. A union on `outcome` because "added" and "waitlisted"
 * are genuinely different answers to one "add, or waitlist if full" request,
 * and the page says something different for each.
 */
export type AddDropOutcome =
  | {
      outcome: 'DROPPED';
      course: CourseRef;
      dropReason: EnrollmentDropReason;
      /** Who took the seat: the drop and the promotion commit together. */
      promotions: PromotionSummary;
      /** Queues the student left in the same action. */
      leftWaitlists: CourseRef[];
    }
  | { outcome: 'ADDED'; course: CourseRef }
  | {
      outcome: 'SWAPPED';
      from: CourseRef;
      to: CourseRef;
      promotions: PromotionSummary;
    }
  | {
      outcome: 'WAITLISTED';
      course: CourseRef;
      /** Place among those still waiting, 1 = next in line. */
      position: number;
      waiting: number;
      /** The action asked to add and fell back to the queue. */
      courseWasFull: boolean;
    }
  | { outcome: 'WAITLIST_LEFT'; course: CourseRef };

/** Every reply carries the refreshed page, so nothing needs a second request. */
export interface AddDropResult {
  result: AddDropOutcome;
  view: AddDropView;
  /** The reply is a replay of an earlier request with the same key. */
  replayed: boolean;
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/**
 * Why an action was refused. `SEAT_TAKEN` is the one that matters: the student
 * lost a race for the last seat, and the page offers the queue in one click
 * rather than showing a generic error.
 */
export type AddDropProblem =
  | { type: 'PERIOD_CLOSED'; reason: string }
  | { type: 'NOT_ALLOCATED'; reason: string }
  | { type: 'UNKNOWN_COURSE'; code: string }
  | { type: 'NOT_OFFERED'; code: string }
  | { type: 'NOT_ELIGIBLE'; code: string; eligibility: EligibilityResult }
  /** The last seat went to someone else between loading the page and acting. */
  | { type: 'SEAT_TAKEN'; code: string; capacity: number }
  | { type: 'ALREADY_ENROLLED'; code: string }
  /** Adding needs an empty timetable; swapping is the action for a change. */
  | { type: 'ALREADY_HOLDS_SEAT'; code: string }
  | { type: 'NO_SEAT_HELD' }
  /** The `code`/`fromCode` sent is not the seat they actually hold. */
  | { type: 'NOT_THE_HELD_SEAT'; code: string; heldCode: string }
  | { type: 'SAME_COURSE'; code: string }
  | { type: 'ALREADY_WAITING'; code: string }
  | { type: 'NOT_WAITING'; code: string }
  /** The same idempotency key was used for a different request. */
  | { type: 'REQUEST_CHANGED' };

export type AddDropProblemType = AddDropProblem['type'];

export const ADD_DROP_PROBLEM_TYPES = [
  'PERIOD_CLOSED',
  'NOT_ALLOCATED',
  'UNKNOWN_COURSE',
  'NOT_OFFERED',
  'NOT_ELIGIBLE',
  'SEAT_TAKEN',
  'ALREADY_ENROLLED',
  'ALREADY_HOLDS_SEAT',
  'NO_SEAT_HELD',
  'NOT_THE_HELD_SEAT',
  'SAME_COURSE',
  'ALREADY_WAITING',
  'NOT_WAITING',
  'REQUEST_CHANGED',
] as const satisfies readonly AddDropProblemType[];

function isAddDropProblem(value: unknown): value is AddDropProblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    ADD_DROP_PROBLEM_TYPES.includes((value as { type: AddDropProblemType }).type)
  );
}

/**
 * Reads the problems out of a failure's `details`, which the envelope types as
 * `unknown` — exactly as `readCartProblems` does for the cart.
 */
export function readAddDropProblems(details: unknown): AddDropProblem[] {
  return Array.isArray(details) ? details.filter(isAddDropProblem) : [];
}

/** The first `SEAT_TAKEN`, so the page can offer the queue instead. */
export function findSeatTaken(
  problems: readonly AddDropProblem[],
): Extract<AddDropProblem, { type: 'SEAT_TAKEN' }> | null {
  return problems.find((problem) => problem.type === 'SEAT_TAKEN') ?? null;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** PUT /api/admin/registration-window/add-drop. Clear the period with nulls. */
export interface UpdateAddDropPeriodRequest {
  opensAt: IsoDateTime | null;
  closesAt: IsoDateTime | null;
  reason?: string;
}
