/**
 * Pure registration-window rules: which status changes are allowed, whether
 * the policy may still change, and whether a student may submit right now.
 * No I/O, so every rule is unit-tested directly.
 */
import {
  isPreferencePriorityConfig,
  PREFERENCE_RANKS,
  RANDOM_SEED_LIMITS,
  WINDOW_TRANSITIONS,
  type AllocationConfig,
  type RegistrationWindowStatus,
} from '@course-reg/shared';

export type WindowAction = keyof typeof WINDOW_TRANSITIONS;

/** A rule's verdict: allowed, or refused with a message a user can act on. */
export type RuleCheck = { ok: true } | { ok: false; message: string };

const ACTION_VERBS: Readonly<Record<WindowAction, string>> = {
  open: 'Opening',
  close: 'Closing',
};

const STATUS_WORDS: Readonly<Record<RegistrationWindowStatus, string>> = {
  DRAFT: 'still a draft',
  OPEN: 'already open',
  CLOSED: 'already closed',
  ALLOCATED: 'already allocated',
};

/** DRAFT -> OPEN -> CLOSED. Anything else is refused with the current status. */
export function checkTransition(
  action: WindowAction,
  current: RegistrationWindowStatus,
): RuleCheck {
  const { from } = WINDOW_TRANSITIONS[action];
  if (current === from) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `${ACTION_VERBS[action]} registration needs a ${from.toLowerCase()} window; this one is ${STATUS_WORDS[current]}.`,
  };
}

export function targetStatus(action: WindowAction): RegistrationWindowStatus {
  return WINDOW_TRANSITIONS[action].to;
}

/**
 * The allocation policy, the seed and the offered courses may only change
 * while the window is a DRAFT. Once it opens, students submit against them.
 */
export function isPolicyFrozen(status: RegistrationWindowStatus): boolean {
  return status !== 'DRAFT';
}

export function frozenPolicyMessage(status: RegistrationWindowStatus): string {
  return `The registration policy was frozen when the window opened, so it can't be changed while it is ${STATUS_WORDS[status]}.`;
}

/** Everything that must hold before a window can accept submissions. */
export function checkReadyToOpen(
  policy: AllocationConfig,
  offeredCourseCount: number,
  endsAt: Date,
  now: Date,
): RuleCheck {
  if (offeredCourseCount === 0) {
    return { ok: false, message: 'Offer at least one course before opening registration.' };
  }
  if (endsAt <= now) {
    return {
      ok: false,
      message: 'Registration would already be over: move the closing time into the future.',
    };
  }
  return checkPolicyComplete(policy);
}

/** A policy is complete when every number the method needs is present and sane. */
export function checkPolicyComplete(policy: AllocationConfig): RuleCheck {
  if (!isPreferencePriorityConfig(policy)) {
    return { ok: true };
  }
  const weights = PREFERENCE_RANKS.map((rank) => policy.preferenceWeights[rank]);
  if (!isNonIncreasing(weights)) {
    return {
      ok: false,
      message:
        'Preference weights must not increase: P1 is worth at least as much as P2, and so on.',
    };
  }
  return { ok: true };
}

/** P1 >= P2 >= ... >= P5: a lower choice can never be worth more than a higher one. */
export function isNonIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value <= (values[index - 1] ?? value));
}

/** Why a submission is refused, in the student's words. */
export type SubmissionGate = { allowed: true } | { allowed: false; message: string };

export interface SubmissionWindow {
  status: RegistrationWindowStatus;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Whether a student may submit their cart right now. Phase 7's submit endpoint
 * calls this; it is here (and tested here) so the rule exists in exactly one
 * place. The clock is passed in, never read from the client.
 */
export function canSubmitNow(window: SubmissionWindow | null, now: Date): SubmissionGate {
  if (!window) {
    return { allowed: false, message: 'There is no registration window yet.' };
  }
  if (window.status !== 'OPEN') {
    return {
      allowed: false,
      message: `Registration is ${STATUS_WORDS[window.status]}, so preferences can't be submitted.`,
    };
  }
  if (now < window.startsAt) {
    return { allowed: false, message: 'Registration has not started yet.' };
  }
  if (now >= window.endsAt) {
    return {
      allowed: false,
      message: 'Registration has closed, so preferences can no longer be submitted.',
    };
  }
  return { allowed: true };
}

/** A tie-break seed in the range the database accepts (unsigned 32-bit). */
export function generateRandomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * (RANDOM_SEED_LIMITS.max + 1));
}
