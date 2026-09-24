/**
 * The registration cart and its one-way submit.
 *
 * Submitting does NOT take a seat: allocation is a batch that runs after the
 * window closes. A submit records a ranked, validated, immutable list of
 * preferences, so the guarantees that matter here are no duplicate and no
 * partial submissions, idempotent retries, and a server-side arrival order.
 */
import type { EligibilityResult } from '../domain/eligibility.js';
import type { PreferenceRank, SubmissionStatus } from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { DepartmentRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';

/** One ranked course in the cart, with the live numbers the student sees. */
export interface CartItem {
  rank: PreferenceRank;
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  capacity: number;
  allocated: number;
  available: number;
  demand: number;
  demandRatio: number | null;
  /** Re-checked on every read: a cart can go stale if the record changes. */
  eligibility: EligibilityResult;
}

/** GET /api/preferences. */
export interface PreferenceCart {
  window: RegistrationWindowSummary | null;
  status: SubmissionStatus;
  items: CartItem[];
  /** Set once submitted, from the server's clock. */
  submittedAt: IsoDateTime | null;
  /** The FCFS arrival number, from a database sequence. */
  sequence: number | null;
  /** Short human-readable receipt id, e.g. "REF-3F9A2C71". */
  reference: string | null;
  /** The items can still be changed (a draft, and the window is not closed). */
  editable: boolean;
  /** Submitting would be accepted right now. */
  submittable: boolean;
  /** Why submitting is not possible, in the student's words. */
  submitBlockedReason: string | null;
  totalCredits: number;
  serverTime: IsoDateTime;
}

/** PUT /api/preferences — the whole cart, in rank order. */
export interface SaveCartRequest {
  courseCodes: string[];
}

/**
 * POST /api/registration/submit. The codes are sent so the server can confirm
 * the student is submitting the cart they were looking at.
 */
export interface SubmitRequest {
  courseCodes: string[];
}

/** Everything a student needs to see after submitting. */
export interface SubmissionReceipt {
  window: RegistrationWindowSummary;
  reference: string;
  submittedAt: IsoDateTime;
  sequence: number;
  items: CartItem[];
  totalCredits: number;
  serverTime: IsoDateTime;
}

/**
 * Why a cart was refused. A discriminated union on `type` so the UI can put
 * each message beside the right item instead of showing one generic error.
 */
export type CartProblem =
  | { type: 'NOT_ELIGIBLE'; code: string; eligibility: EligibilityResult }
  | { type: 'NOT_OFFERED'; code: string }
  | { type: 'UNKNOWN_COURSE'; code: string }
  | { type: 'DUPLICATE'; code: string }
  | { type: 'TOO_MANY'; max: number }
  | { type: 'WINDOW_NOT_OPEN'; reason: string }
  | { type: 'ALREADY_SUBMITTED' }
  | { type: 'CART_CHANGED' };

export type CartProblemType = CartProblem['type'];

export const CART_PROBLEM_TYPES = [
  'NOT_ELIGIBLE',
  'NOT_OFFERED',
  'UNKNOWN_COURSE',
  'DUPLICATE',
  'TOO_MANY',
  'WINDOW_NOT_OPEN',
  'ALREADY_SUBMITTED',
  'CART_CHANGED',
] as const satisfies readonly CartProblemType[];

function isCartProblem(value: unknown): value is CartProblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    CART_PROBLEM_TYPES.includes((value as { type: CartProblemType }).type)
  );
}

/**
 * Reads the problems out of a failure's `details`. The envelope types that
 * field as `unknown`, exactly as `data` is typed by each endpoint's contract.
 */
export function readCartProblems(details: unknown): CartProblem[] {
  return Array.isArray(details) ? details.filter(isCartProblem) : [];
}

/** Header carrying the client-generated UUID that makes a retry safe. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
