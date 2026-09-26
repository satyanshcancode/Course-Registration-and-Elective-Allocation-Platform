import type { EligibilityResult } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  canAddDropNow,
  decideAdd,
  decideDrop,
  decideJoinWaitlist,
  decideLeaveWaitlist,
  decideSwap,
  describeAddDropPeriod,
  type AddDropWindow,
  type CourseState,
} from './addDropRules.js';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const EARLIER = new Date('2026-10-18T00:00:00.000Z');
const LATER = new Date('2026-10-25T00:00:00.000Z');

const allocated = (overrides: Partial<AddDropWindow> = {}): AddDropWindow => ({
  status: 'ALLOCATED',
  addDropOpensAt: EARLIER,
  addDropClosesAt: LATER,
  ...overrides,
});

const INELIGIBLE: EligibilityResult = {
  eligible: false,
  reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 5 }],
};

function course(overrides: Partial<CourseState> = {}): CourseState {
  return {
    code: 'CS401',
    exists: true,
    seats: { capacity: 20, allocated: 10 },
    eligibility: { eligible: true },
    waiting: false,
    ...overrides,
  };
}

const full = (overrides: Partial<CourseState> = {}) =>
  course({ seats: { capacity: 20, allocated: 20 }, ...overrides });

describe('canAddDropNow', () => {
  it('needs an allocated window: before that there are no results to change', () => {
    for (const status of ['DRAFT', 'OPEN', 'CLOSED'] as const) {
      const gate = canAddDropNow(allocated({ status }), NOW);
      expect(gate).toEqual({
        allowed: false,
        problem: {
          type: 'NOT_ALLOCATED',
          reason: 'Add/drop opens once allocation has run and results are published.',
        },
      });
    }
  });

  it('refuses when no period has been scheduled at all', () => {
    const gate = canAddDropNow(allocated({ addDropOpensAt: null, addDropClosesAt: null }), NOW);
    expect(gate.allowed).toBe(false);
  });

  it('refuses before it opens and after it closes, and allows in between', () => {
    expect(canAddDropNow(allocated(), new Date('2026-10-17T00:00:00Z')).allowed).toBe(false);
    expect(canAddDropNow(allocated(), NOW).allowed).toBe(true);
    expect(canAddDropNow(allocated(), new Date('2026-10-26T00:00:00Z')).allowed).toBe(false);
  });

  it('closes exactly at the closing instant, never a millisecond after', () => {
    expect(canAddDropNow(allocated(), new Date(LATER.getTime() - 1)).allowed).toBe(true);
    expect(canAddDropNow(allocated(), LATER).allowed).toBe(false);
  });

  it('has nothing to offer without a window', () => {
    expect(canAddDropNow(null, NOW).allowed).toBe(false);
  });
});

describe('describeAddDropPeriod', () => {
  it('carries the dates and the reason it is unusable in one object', () => {
    expect(describeAddDropPeriod(allocated({ status: 'CLOSED' }), NOW)).toEqual({
      opensAt: EARLIER.toISOString(),
      closesAt: LATER.toISOString(),
      open: false,
      closedReason: 'Add/drop opens once allocation has run and results are published.',
    });
  });

  it('says it is open with no reason when it is', () => {
    expect(describeAddDropPeriod(allocated(), NOW)).toMatchObject({
      open: true,
      closedReason: null,
    });
  });
});

describe('decideAdd', () => {
  it('takes the seat when the student holds nothing and one is free', () => {
    expect(decideAdd(course(), null, false)).toEqual({ kind: 'take-seat' });
  });

  it('refuses a student who already holds something, and points at swapping', () => {
    expect(decideAdd(course(), { code: 'CS402' }, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'ALREADY_HOLDS_SEAT', code: 'CS401', heldCode: 'CS402' }],
    });
  });

  it('says ALREADY_ENROLLED when the seat they hold is this very course', () => {
    expect(decideAdd(course(), { code: 'CS401' }, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'ALREADY_ENROLLED', code: 'CS401' }],
    });
  });

  it('answers SEAT_TAKEN — not a generic error — when the last seat has gone', () => {
    expect(decideAdd(full(), null, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'SEAT_TAKEN', code: 'CS401', capacity: 20 }],
    });
  });

  it('joins the queue instead when the request asked for that fallback', () => {
    expect(decideAdd(full(), null, true)).toEqual({ kind: 'join-waitlist' });
  });

  it('will not queue somebody twice', () => {
    expect(decideAdd(full({ waiting: true }), null, true)).toEqual({
      kind: 'refused',
      problems: [{ type: 'ALREADY_WAITING', code: 'CS401' }],
    });
  });

  it('refuses an unknown course, one not offered, and one they cannot take', () => {
    expect(decideAdd(course({ exists: false }), null, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'UNKNOWN_COURSE', code: 'CS401' }],
    });
    expect(decideAdd(course({ seats: null }), null, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_OFFERED', code: 'CS401' }],
    });
    expect(decideAdd(course({ eligibility: INELIGIBLE }), null, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_ELIGIBLE', code: 'CS401', eligibility: INELIGIBLE }],
    });
  });

  it('checks the course before the timetable, so "not offered" beats "you hold one"', () => {
    // The student cannot act on a course that isn't there, whatever else is
    // true of them, and that is the message worth showing.
    expect(decideAdd(course({ seats: null }), { code: 'CS402' }, false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_OFFERED', code: 'CS401' }],
    });
  });
});

describe('decideSwap', () => {
  const from = course({ code: 'CS402' });
  const to = course({ code: 'CS401' });

  it('swaps when the seat matches and the target has room', () => {
    expect(decideSwap(from, to, { code: 'CS402' })).toEqual({ kind: 'swap' });
  });

  it('refuses a swap by somebody with no seat to give up', () => {
    expect(decideSwap(from, to, null)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NO_SEAT_HELD' }],
    });
  });

  it('refuses when the `from` course is not the seat actually held', () => {
    expect(decideSwap(from, to, { code: 'CS999' })).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_THE_HELD_SEAT', code: 'CS402', heldCode: 'CS999' }],
    });
  });

  it('refuses swapping a course for itself', () => {
    expect(decideSwap(from, course({ code: 'CS402' }), { code: 'CS402' })).toEqual({
      kind: 'refused',
      problems: [{ type: 'SAME_COURSE', code: 'CS402' }],
    });
  });

  it('answers SEAT_TAKEN when the target filled up, so the old seat is kept', () => {
    expect(decideSwap(from, full({ code: 'CS401' }), { code: 'CS402' })).toEqual({
      kind: 'refused',
      problems: [{ type: 'SEAT_TAKEN', code: 'CS401', capacity: 20 }],
    });
  });
});

describe('decideDrop', () => {
  it('drops the seat the student holds', () => {
    expect(decideDrop('CS401', { code: 'CS401' })).toEqual({ kind: 'drop' });
  });

  it('refuses with no seat, and when the code is not the one held', () => {
    expect(decideDrop('CS401', null)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NO_SEAT_HELD' }],
    });
    expect(decideDrop('CS401', { code: 'CS402' })).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_THE_HELD_SEAT', code: 'CS401', heldCode: 'CS402' }],
    });
  });

  it('does not care whether the course is still offered or still allowed', () => {
    // A student must always be able to get out of a course, even one whose
    // rules have moved under them since allocation.
    expect(decideDrop('CS401', { code: 'CS401' })).toEqual({ kind: 'drop' });
  });
});

describe('decideJoinWaitlist', () => {
  it('joins the queue for a full course when the student holds nothing', () => {
    expect(decideJoinWaitlist(full(), null)).toEqual({ kind: 'join-waitlist' });
  });

  it('hands over a seat that freed up between loading the page and asking', () => {
    expect(decideJoinWaitlist(course(), null)).toEqual({ kind: 'take-seat' });
  });

  it('refuses a student holding a seat: an unranked queue could never be honoured', () => {
    expect(decideJoinWaitlist(full(), { code: 'CS402' })).toEqual({
      kind: 'refused',
      problems: [{ type: 'ALREADY_HOLDS_SEAT', code: 'CS401', heldCode: 'CS402' }],
    });
  });

  it('refuses joining twice, and joining a course they cannot take', () => {
    expect(decideJoinWaitlist(full({ waiting: true }), null)).toEqual({
      kind: 'refused',
      problems: [{ type: 'ALREADY_WAITING', code: 'CS401' }],
    });
    expect(decideJoinWaitlist(full({ eligibility: INELIGIBLE }), null)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_ELIGIBLE', code: 'CS401', eligibility: INELIGIBLE }],
    });
  });
});

describe('decideLeaveWaitlist', () => {
  it('leaves a queue the student is on', () => {
    expect(decideLeaveWaitlist('CS401', true)).toEqual({ kind: 'leave-waitlist' });
  });

  it('refuses when there is no entry to leave', () => {
    expect(decideLeaveWaitlist('CS401', false)).toEqual({
      kind: 'refused',
      problems: [{ type: 'NOT_WAITING', code: 'CS401' }],
    });
  });
});
