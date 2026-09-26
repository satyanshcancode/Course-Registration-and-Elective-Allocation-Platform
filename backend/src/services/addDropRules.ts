/**
 * Pure add/drop rules: whether the period is usable, and what each of the five
 * actions should do given the rows the service just read.
 *
 * No I/O and no clock of its own, so every rule is unit-tested directly. The
 * service's job is to read state under the right locks, ask these functions,
 * and carry out the answer — it never decides anything itself.
 *
 * The one-elective-per-student model still holds throughout:
 *   - ADD needs an empty timetable; SWAP is the action for a change.
 *   - A QUEUE is only ever joined while holding no seat, so every promotion
 *     stays an upgrade and the reasoning in docs/ALLOCATION.md is untouched.
 */
import type {
  AddDropPeriod,
  AddDropProblem,
  EligibilityResult,
  RegistrationWindowStatus,
} from '@course-reg/shared';
import type { WindowRecord } from '../types/catalogue.js';

/** The window fields the period depends on. */
export interface AddDropWindow {
  status: RegistrationWindowStatus;
  addDropOpensAt: Date | null;
  addDropClosesAt: Date | null;
}

/** One offered course as the rules see it, read under the offering's lock. */
export interface CourseState {
  code: string;
  /** False when no course has this code at all. */
  exists: boolean;
  /** Null when the window does not offer it. */
  seats: { capacity: number; allocated: number } | null;
  eligibility: EligibilityResult;
  /** The student is already waiting for it. */
  waiting: boolean;
}

/** The seat the student holds right now. */
export interface HeldState {
  code: string;
}

const NO_PERIOD = 'The add/drop period has not been scheduled yet.';

/**
 * The only two ways the period itself refuses an action. Narrower than
 * `AddDropProblem` so `describeAddDropPeriod` can read `reason` directly
 * instead of re-deriving the sentence.
 */
export type PeriodProblem = Extract<AddDropProblem, { type: 'PERIOD_CLOSED' | 'NOT_ALLOCATED' }>;

/**
 * Whether the student may act right now. Every action calls this first, so the
 * period is checked in exactly one place — including inside the transaction,
 * against the window row it locked.
 */
export function canAddDropNow(
  window: AddDropWindow | null,
  now: Date,
): { allowed: true } | { allowed: false; problem: PeriodProblem } {
  if (!window) {
    return {
      allowed: false,
      problem: { type: 'NOT_ALLOCATED', reason: 'There is no registration window yet.' },
    };
  }
  if (window.status !== 'ALLOCATED') {
    return {
      allowed: false,
      problem: {
        type: 'NOT_ALLOCATED',
        reason: 'Add/drop opens once allocation has run and results are published.',
      },
    };
  }
  const { addDropOpensAt: opensAt, addDropClosesAt: closesAt } = window;
  if (!opensAt || !closesAt) {
    return { allowed: false, problem: { type: 'PERIOD_CLOSED', reason: NO_PERIOD } };
  }
  if (now < opensAt) {
    return {
      allowed: false,
      problem: { type: 'PERIOD_CLOSED', reason: 'The add/drop period has not started yet.' },
    };
  }
  if (now >= closesAt) {
    return {
      allowed: false,
      problem: {
        type: 'PERIOD_CLOSED',
        reason: 'The add/drop period has closed, so enrolments can no longer be changed.',
      },
    };
  }
  return { allowed: true };
}

/** The period as the page shows it, including why it is unusable. */
/** A window as the rules read it: ISO strings become Dates, once, here. */
export function toRuleWindow(window: WindowRecord): AddDropWindow {
  const { status, addDropOpensAt, addDropClosesAt } = window.summary;
  return {
    status,
    addDropOpensAt: addDropOpensAt === null ? null : new Date(addDropOpensAt),
    addDropClosesAt: addDropClosesAt === null ? null : new Date(addDropClosesAt),
  };
}

export function describeAddDropPeriod(window: AddDropWindow | null, now: Date): AddDropPeriod {
  const gate = canAddDropNow(window, now);
  return {
    opensAt: window?.addDropOpensAt?.toISOString() ?? null,
    closesAt: window?.addDropClosesAt?.toISOString() ?? null,
    open: gate.allowed,
    closedReason: gate.allowed ? null : gate.problem.reason,
  };
}

// ---------------------------------------------------------------------------
// The five decisions
// ---------------------------------------------------------------------------

export interface Refused {
  kind: 'refused';
  problems: AddDropProblem[];
}

export type AddDecision = Refused | { kind: 'take-seat' } | { kind: 'join-waitlist' };
export type SwapDecision = Refused | { kind: 'swap' };
export type DropDecision = Refused | { kind: 'drop' };
export type JoinDecision = Refused | { kind: 'join-waitlist' } | { kind: 'take-seat' };
export type LeaveDecision = Refused | { kind: 'leave-waitlist' };

const refuse = (...problems: AddDropProblem[]): Refused => ({ kind: 'refused', problems });

/** Every reason the course itself rules the action out, collected at once. */
function courseProblems(course: CourseState): AddDropProblem[] {
  if (!course.exists) {
    return [{ type: 'UNKNOWN_COURSE', code: course.code }];
  }
  if (!course.seats) {
    return [{ type: 'NOT_OFFERED', code: course.code }];
  }
  if (!course.eligibility.eligible) {
    return [{ type: 'NOT_ELIGIBLE', code: course.code, eligibility: course.eligibility }];
  }
  return [];
}

const isFull = (course: CourseState): boolean =>
  !course.seats || course.seats.allocated >= course.seats.capacity;

/**
 * Adding needs an empty timetable and a genuinely free seat, counted from the
 * offering row this transaction has already locked — so "full" here is the
 * student losing the race, not a stale number from when the page loaded.
 */
export function decideAdd(
  course: CourseState,
  held: HeldState | null,
  waitlistIfFull: boolean,
): AddDecision {
  const problems = courseProblems(course);
  if (problems.length > 0) {
    return { kind: 'refused', problems };
  }
  if (held) {
    return held.code === course.code
      ? refuse({ type: 'ALREADY_ENROLLED', code: course.code })
      : refuse({ type: 'ALREADY_HOLDS_SEAT', code: course.code, heldCode: held.code });
  }
  if (isFull(course)) {
    if (!waitlistIfFull) {
      return refuse({
        type: 'SEAT_TAKEN',
        code: course.code,
        capacity: course.seats?.capacity ?? 0,
      });
    }
    return course.waiting
      ? refuse({ type: 'ALREADY_WAITING', code: course.code })
      : { kind: 'join-waitlist' };
  }
  return { kind: 'take-seat' };
}

/**
 * Swapping is one atomic move. There is no waitlist fallback: the student
 * keeps the seat they have, which is what "nothing changes" means.
 */
export function decideSwap(
  from: CourseState,
  to: CourseState,
  held: HeldState | null,
): SwapDecision {
  if (!held) {
    return refuse({ type: 'NO_SEAT_HELD' });
  }
  if (held.code !== from.code) {
    return refuse({ type: 'NOT_THE_HELD_SEAT', code: from.code, heldCode: held.code });
  }
  if (from.code === to.code) {
    return refuse({ type: 'SAME_COURSE', code: to.code });
  }
  const problems = courseProblems(to);
  if (problems.length > 0) {
    return { kind: 'refused', problems };
  }
  if (isFull(to)) {
    return refuse({ type: 'SEAT_TAKEN', code: to.code, capacity: to.seats?.capacity ?? 0 });
  }
  return { kind: 'swap' };
}

/**
 * Dropping needs nothing of the course except that it is the seat being held —
 * an ineligible or no-longer-offered course must still be droppable.
 */
export function decideDrop(code: string, held: HeldState | null): DropDecision {
  if (!held) {
    return refuse({ type: 'NO_SEAT_HELD' });
  }
  if (held.code !== code) {
    return refuse({ type: 'NOT_THE_HELD_SEAT', code, heldCode: held.code });
  }
  return { kind: 'drop' };
}

/**
 * A queue place is only offered to a student with no seat. Anything else would
 * mean guessing whether being moved in is an improvement, and a course joined
 * here was never ranked — so there is nothing to compare it against.
 */
export function decideJoinWaitlist(course: CourseState, held: HeldState | null): JoinDecision {
  const problems = courseProblems(course);
  if (problems.length > 0) {
    return { kind: 'refused', problems };
  }
  if (held) {
    return held.code === course.code
      ? refuse({ type: 'ALREADY_ENROLLED', code: course.code })
      : refuse({ type: 'ALREADY_HOLDS_SEAT', code: course.code, heldCode: held.code });
  }
  if (course.waiting) {
    return refuse({ type: 'ALREADY_WAITING', code: course.code });
  }
  // A seat freed between loading the page and pressing the button. Queueing
  // would only have it offered straight back down the queue to them, so give
  // it to them now — it is what they asked for, one step sooner.
  return isFull(course) ? { kind: 'join-waitlist' } : { kind: 'take-seat' };
}

/** Leaving only needs an entry to leave; the course's own state is irrelevant. */
export function decideLeaveWaitlist(code: string, waiting: boolean): LeaveDecision {
  return waiting ? { kind: 'leave-waitlist' } : refuse({ type: 'NOT_WAITING', code });
}
