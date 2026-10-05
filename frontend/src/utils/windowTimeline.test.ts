import type { RegistrationWindowSummary } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { CLOSING_SOON_MS, WINDOW_STEPS, windowStepIndex } from './windowTimeline';

const ENDS_AT = '2026-10-24T22:30:00.000Z';

function windowAt(status: RegistrationWindowSummary['status']): RegistrationWindowSummary {
  return {
    name: 'Fall 2026',
    term: '2026-FALL',
    status,
    startsAt: '2026-10-03T10:06:00.000Z',
    endsAt: ENDS_AT,
    addDropOpensAt: null,
    addDropClosesAt: null,
  };
}

/** `offsetMs` before the window's end time. */
function before(offsetMs: number): Date {
  return new Date(Date.parse(ENDS_AT) - offsetMs);
}

describe('windowStepIndex', () => {
  it('has a label for every step it can return', () => {
    expect(WINDOW_STEPS).toHaveLength(4);
  });

  it('a draft window has not started', () => {
    expect(windowStepIndex(windowAt('DRAFT'), before(CLOSING_SOON_MS * 10))).toBe(0);
  });

  it('an open window with time left is simply open', () => {
    expect(windowStepIndex(windowAt('OPEN'), before(CLOSING_SOON_MS + 1))).toBe(1);
  });

  it('an open window inside the last day is closing soon', () => {
    expect(windowStepIndex(windowAt('OPEN'), before(CLOSING_SOON_MS))).toBe(2);
    expect(windowStepIndex(windowAt('OPEN'), before(60_000))).toBe(2);
  });

  it('an open window past its end time still reads as closing, not closed', () => {
    // Only an administrator closes a window; saying "Closed" first would be a
    // lie the student could act on.
    expect(windowStepIndex(windowAt('OPEN'), before(-60_000))).toBe(2);
  });

  it('closed and allocated windows are both at the end', () => {
    expect(windowStepIndex(windowAt('CLOSED'), before(-1))).toBe(3);
    expect(windowStepIndex(windowAt('ALLOCATED'), before(-1))).toBe(3);
  });
});
