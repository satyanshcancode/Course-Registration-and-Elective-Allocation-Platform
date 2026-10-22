import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  RANDOM_SEED_LIMITS,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  canSubmitNow,
  checkDeadlineUpdate,
  checkPolicyComplete,
  checkReadyToOpen,
  checkTransition,
  generateRandomSeed,
  isNonIncreasing,
  isPolicyFrozen,
  targetStatus,
  type RuleCheck,
  type SubmissionGate,
  type SubmissionWindow,
} from './registrationWindowRules.js';

/** The refusal message, or '' when the rule allowed it. */
function messageOf(check: RuleCheck | SubmissionGate): string {
  if ('ok' in check) {
    return check.ok ? '' : check.message;
  }
  return check.allowed ? '' : check.message;
}

const NOW = new Date('2026-09-21T12:00:00.000Z');
const openWindow: SubmissionWindow = {
  status: 'OPEN',
  startsAt: new Date('2026-09-21T10:00:00.000Z'),
  endsAt: new Date('2026-09-28T10:00:00.000Z'),
};

describe('checkTransition', () => {
  it('allows DRAFT -> OPEN and OPEN -> CLOSED', () => {
    expect(checkTransition('open', 'DRAFT')).toEqual({ ok: true });
    expect(checkTransition('close', 'OPEN')).toEqual({ ok: true });
    expect(targetStatus('open')).toBe('OPEN');
    expect(targetStatus('close')).toBe('CLOSED');
  });

  it('refuses reopening a closed window, and says why', () => {
    const result = checkTransition('open', 'CLOSED');
    expect(result.ok).toBe(false);
    expect(messageOf(result)).toContain('already closed');
  });

  it('refuses closing a draft window and opening an open one', () => {
    expect(checkTransition('close', 'DRAFT').ok).toBe(false);
    expect(checkTransition('open', 'OPEN').ok).toBe(false);
    expect(checkTransition('open', 'ALLOCATED').ok).toBe(false);
  });
});

describe('isPolicyFrozen', () => {
  it('is false only while the window is a draft', () => {
    expect(isPolicyFrozen('DRAFT')).toBe(false);
    expect(isPolicyFrozen('OPEN')).toBe(true);
    expect(isPolicyFrozen('CLOSED')).toBe(true);
    expect(isPolicyFrozen('ALLOCATED')).toBe(true);
  });
});

describe('isNonIncreasing', () => {
  it('accepts equal and falling values, rejects a rise', () => {
    expect(isNonIncreasing([100, 80, 60, 40, 20])).toBe(true);
    expect(isNonIncreasing([50, 50, 50, 50, 50])).toBe(true);
    expect(isNonIncreasing([100, 80, 90, 40, 20])).toBe(false);
  });
});

describe('checkPolicyComplete', () => {
  it('accepts FCFS, which has no weights', () => {
    expect(checkPolicyComplete(FCFS_CONFIG)).toEqual({ ok: true });
  });

  it('accepts the default preference weights', () => {
    expect(checkPolicyComplete(DEFAULT_PREFERENCE_PRIORITY_CONFIG)).toEqual({ ok: true });
  });

  it('rejects weights that increase down the list', () => {
    const result = checkPolicyComplete({
      ...DEFAULT_PREFERENCE_PRIORITY_CONFIG,
      preferenceWeights: { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 },
    });
    expect(result.ok).toBe(false);
  });
});

describe('checkReadyToOpen', () => {
  const future = new Date('2026-09-28T10:00:00.000Z');

  it('accepts a complete policy with at least one course', () => {
    expect(checkReadyToOpen(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 20, future, NOW)).toEqual({
      ok: true,
    });
  });

  it('refuses a window with no offered courses', () => {
    const result = checkReadyToOpen(FCFS_CONFIG, 0, future, NOW);
    expect(result.ok).toBe(false);
    expect(messageOf(result)).toContain('at least one');
  });

  it('refuses a window that has already ended', () => {
    const past = new Date('2026-09-20T10:00:00.000Z');
    expect(checkReadyToOpen(FCFS_CONFIG, 5, past, NOW).ok).toBe(false);
  });
});

describe('canSubmitNow', () => {
  it('allows a submission inside an open window', () => {
    expect(canSubmitNow(openWindow, NOW)).toEqual({ allowed: true });
  });

  it('refuses when there is no window', () => {
    expect(canSubmitNow(null, NOW).allowed).toBe(false);
  });

  it('refuses a DRAFT window', () => {
    const result = canSubmitNow({ ...openWindow, status: 'DRAFT' }, NOW);
    expect(result.allowed).toBe(false);
    expect(messageOf(result)).toContain('draft');
  });

  it('refuses a CLOSED window', () => {
    const result = canSubmitNow({ ...openWindow, status: 'CLOSED' }, NOW);
    expect(result.allowed).toBe(false);
    expect(messageOf(result)).toContain('closed');
  });

  it('refuses after ends_at, even while the status is still OPEN', () => {
    const late = new Date('2026-09-28T10:00:00.001Z');
    const result = canSubmitNow(openWindow, late);
    expect(result.allowed).toBe(false);
    expect(messageOf(result)).toContain('closed');
  });

  it('refuses before starts_at', () => {
    const early = new Date('2026-09-21T09:59:59.000Z');
    expect(canSubmitNow(openWindow, early).allowed).toBe(false);
  });

  it('allows the first instant and refuses the last', () => {
    expect(canSubmitNow(openWindow, openWindow.startsAt).allowed).toBe(true);
    expect(canSubmitNow(openWindow, openWindow.endsAt).allowed).toBe(false);
  });
});

describe('generateRandomSeed', () => {
  it('stays inside the range the database accepts', () => {
    expect(generateRandomSeed(() => 0)).toBe(RANDOM_SEED_LIMITS.min);
    expect(generateRandomSeed(() => 0.9999999)).toBeLessThanOrEqual(RANDOM_SEED_LIMITS.max);
    expect(Number.isInteger(generateRandomSeed())).toBe(true);
  });
});

describe('checkDeadlineUpdate', () => {
  const startsAt = new Date('2026-09-21T10:00:00.000Z');
  const extendedDeadline = new Date('2026-10-05T18:00:00.000Z');
  const shortenedDeadline = new Date('2026-09-25T18:00:00.000Z');

  it('allows extending the deadline of an open window', () => {
    expect(checkDeadlineUpdate('OPEN', startsAt, extendedDeadline, NOW)).toEqual({ ok: true });
  });

  it('allows shortening the deadline to a future time', () => {
    expect(checkDeadlineUpdate('OPEN', startsAt, shortenedDeadline, NOW)).toEqual({ ok: true });
  });

  it('refuses when the window is not OPEN', () => {
    const draft = checkDeadlineUpdate('DRAFT', startsAt, extendedDeadline, NOW);
    expect(draft.ok).toBe(false);
    expect(messageOf(draft)).toContain('still a draft');

    const closed = checkDeadlineUpdate('CLOSED', startsAt, extendedDeadline, NOW);
    expect(closed.ok).toBe(false);
    expect(messageOf(closed)).toContain('already closed');

    const allocated = checkDeadlineUpdate('ALLOCATED', startsAt, extendedDeadline, NOW);
    expect(allocated.ok).toBe(false);
    expect(messageOf(allocated)).toContain('already allocated');
  });

  it('refuses a deadline that is not after the opening time', () => {
    const beforeOpen = new Date('2026-09-20T10:00:00.000Z');
    const atOpen = startsAt;

    const res1 = checkDeadlineUpdate('OPEN', startsAt, beforeOpen, NOW);
    expect(res1.ok).toBe(false);
    expect(messageOf(res1)).toContain('close after it opens');

    const res2 = checkDeadlineUpdate('OPEN', startsAt, atOpen, NOW);
    expect(res2.ok).toBe(false);
    expect(messageOf(res2)).toContain('close after it opens');
  });

  it('refuses a deadline in the past or present', () => {
    const past = new Date('2026-09-21T11:00:00.000Z');
    const present = NOW;

    const res1 = checkDeadlineUpdate('OPEN', startsAt, past, NOW);
    expect(res1.ok).toBe(false);
    expect(messageOf(res1)).toContain('future');

    const res2 = checkDeadlineUpdate('OPEN', startsAt, present, NOW);
    expect(res2.ok).toBe(false);
    expect(messageOf(res2)).toContain('future');
  });
});
