import type { RegistrationWindowSummary } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { describeDemand, describeMyStatus, describeWindow, formatUpdatedAgo } from './courseText';

describe('describeMyStatus', () => {
  it('says where the course stands for the student', () => {
    expect(describeMyStatus({ code: 'NOT_SELECTED' })).toBe('Not selected');
    expect(describeMyStatus({ code: 'IN_DRAFT_CART', rank: 2 })).toBe('Choice 2 · draft');
    expect(describeMyStatus({ code: 'SUBMITTED', rank: 1 })).toBe('Choice 1 · submitted');
    expect(describeMyStatus({ code: 'ENROLLED' })).toBe('Enrolled');
    expect(describeMyStatus({ code: 'WAITLISTED', position: 7 })).toBe('Waitlisted · #7');
  });
});

describe('describeDemand', () => {
  it('counts requests and shows the ratio', () => {
    expect(describeDemand(114, 20)).toBe('114 requests · 5.7×');
    expect(describeDemand(1, 40)).toBe('1 request · <0.1×');
    expect(describeDemand(0, 40)).toBe('No requests yet');
    expect(describeDemand(3, 0)).toBe('3 requests');
  });
});

describe('describeWindow', () => {
  const window: RegistrationWindowSummary = {
    name: 'Fall 2026',
    term: '2026-FALL',
    status: 'DRAFT',
    startsAt: '2026-09-21T10:00:00.000Z',
    endsAt: '2026-10-13T17:00:00.000Z',
  };

  it('counts down to opening using the given (server) time', () => {
    const text = describeWindow(window, new Date('2026-09-19T10:00:00.000Z'));
    expect(text).toMatch(/^Opens in 2 days · Mon 21 Sep, \d\d:\d\d$/);
  });

  it('describes the other states', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    expect(describeWindow({ ...window, status: 'OPEN' }, now)).toMatch(/^Open · closes in 3 weeks/);
    expect(describeWindow({ ...window, status: 'CLOSED' }, now)).toMatch(/allocation pending$/);
    expect(describeWindow({ ...window, status: 'ALLOCATED' }, now)).toBe(
      'Allocation complete · results published',
    );
  });
});

describe('formatUpdatedAgo', () => {
  const at = new Date('2026-09-22T10:00:00.000Z');

  it.each([
    [1_000, 'just now'],
    [8_000, '8s ago'],
    [185_000, '3 min ago'],
  ])('%i ms later reads %s', (elapsed, text) => {
    expect(formatUpdatedAgo(at, new Date(at.getTime() + elapsed))).toBe(text);
  });
});
