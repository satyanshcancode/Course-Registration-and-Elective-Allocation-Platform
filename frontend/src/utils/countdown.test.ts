import type { RegistrationWindowSummary } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { describeCountdown, formatCountdown } from './countdown';

const window: RegistrationWindowSummary = {
  name: 'Fall 2026',
  term: '2026-FALL',
  status: 'DRAFT',
  startsAt: '2026-09-21T10:00:00.000Z',
  endsAt: '2026-10-05T18:00:00.000Z',
};

describe('formatCountdown', () => {
  it('uses the two largest useful units', () => {
    expect(formatCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h');
    expect(formatCountdown(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
    expect(formatCountdown(90_000)).toBe('1m 30s');
    expect(formatCountdown(45_000)).toBe('45s');
  });

  it('never counts below zero', () => {
    expect(formatCountdown(-5000)).toBe('0s');
  });
});

describe('describeCountdown', () => {
  it('counts down to the opening while the window is a draft', () => {
    const now = new Date('2026-09-19T06:00:00.000Z');
    expect(describeCountdown(window, now)).toEqual({
      label: 'Opens in',
      remaining: '2d 4h',
      text: 'Registration opens in 2d 4h',
    });
  });

  it('counts down to the closing while the window is open', () => {
    const now = new Date('2026-10-05T14:48:00.000Z');
    expect(describeCountdown({ ...window, status: 'OPEN' }, now)).toEqual({
      label: 'Closes in',
      remaining: '3h 12m',
      text: 'Registration closes in 3h 12m',
    });
  });

  it('says what happened once there is nothing left to count', () => {
    const after = new Date('2026-10-06T00:00:00.000Z');
    expect(describeCountdown({ ...window, status: 'OPEN' }, after).remaining).toBeNull();
    expect(describeCountdown({ ...window, status: 'CLOSED' }, after).text).toBe(
      'Registration is closed',
    );
    expect(describeCountdown({ ...window, status: 'ALLOCATED' }, after).text).toBe(
      'Allocation complete',
    );
    expect(describeCountdown(window, after).text).toBe('Opening soon');
  });
});
