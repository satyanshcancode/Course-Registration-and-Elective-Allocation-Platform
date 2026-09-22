import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatRelative, formatTime } from './formatDate';

const UTC = { timeZone: 'UTC' };
const opens = new Date('2026-09-21T10:00:00Z');

describe('formatDate', () => {
  it('formats dates and times in the registrar style', () => {
    expect(formatDate(opens, UTC)).toBe('Mon 21 Sep');
    expect(formatTime(opens, UTC)).toBe('10:00');
    expect(formatDateTime(opens, UTC)).toBe('Mon 21 Sep, 10:00');
    expect(formatDateTime('2026-12-01T17:05:00Z', UTC)).toBe('Tue 1 Dec, 17:05');
  });

  it('respects the time zone', () => {
    expect(formatTime(opens, { timeZone: 'Asia/Kolkata' })).toBe('15:30');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  const at = (offsetSeconds: number) => new Date(now.getTime() + offsetSeconds * 1000);

  it('uses the largest unit that fits', () => {
    expect(formatRelative(at(2 * 60 * 60), now)).toBe('in 2 hours');
    expect(formatRelative(at(90 * 60), now)).toBe('in 2 hours');
    expect(formatRelative(at(-5 * 60), now)).toBe('5 minutes ago');
    expect(formatRelative(at(-3 * 24 * 60 * 60), now)).toBe('3 days ago');
    expect(formatRelative(at(2 * 7 * 24 * 60 * 60), now)).toBe('in 2 weeks');
  });

  it('uses natural words where Intl provides them', () => {
    expect(formatRelative(at(24 * 60 * 60), now)).toBe('tomorrow');
    expect(formatRelative(at(10), now)).toBe('now');
  });
});
