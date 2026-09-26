import { ADMIN_STUDENT_STATUSES, PASSWORD_STRENGTHS } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  describeInvitationExpiry,
  describePasswordStrength,
  describeStudentStatus,
  passwordStrengthSteps,
} from './accountText';

describe('describeStudentStatus', () => {
  it('has words for every status in the shared union', () => {
    for (const status of ADMIN_STUDENT_STATUSES) {
      const wording = describeStudentStatus(status);
      expect(wording.label).not.toBe('');
      expect(wording.explanation).not.toBe('');
    }
  });

  it('explains what each status means for signing in', () => {
    expect(describeStudentStatus('INVITED').explanation).toMatch(/no password has been set/);
    expect(describeStudentStatus('ACTIVE').explanation).toMatch(/Can sign in/);
    expect(describeStudentStatus('INACTIVE').explanation).toMatch(/Cannot sign in/);
  });

  it('says plainly that deactivation keeps everything', () => {
    expect(describeStudentStatus('INACTIVE').explanation).toMatch(/kept unchanged/);
  });
});

describe('describePasswordStrength', () => {
  it('has a word for every strength, and they are all distinct', () => {
    const labels = PASSWORD_STRENGTHS.map(describePasswordStrength);
    expect(new Set(labels).size).toBe(PASSWORD_STRENGTHS.length);
    expect(labels).not.toContain('');
  });
});

describe('passwordStrengthSteps', () => {
  it('fills at least one step for every strength, and never overfills', () => {
    for (const strength of PASSWORD_STRENGTHS) {
      const steps = passwordStrengthSteps(strength);
      expect(steps).toBeGreaterThanOrEqual(1);
      expect(steps).toBeLessThanOrEqual(4);
    }
  });

  it('rises with the strength', () => {
    const steps = PASSWORD_STRENGTHS.map(passwordStrengthSteps);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });
});

describe('describeInvitationExpiry', () => {
  const now = new Date('2026-09-01T10:00:00.000Z').getTime();
  const inHours = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();

  it('rounds to days when more than a day remains', () => {
    expect(describeInvitationExpiry(inHours(47), now)).toBe(
      'The invitation expires in about 2 days.',
    );
  });

  it('counts hours within the day, in the singular where it should', () => {
    expect(describeInvitationExpiry(inHours(5), now)).toBe(
      'The invitation expires in about 5 hours.',
    );
    expect(describeInvitationExpiry(inHours(1), now)).toBe(
      'The invitation expires in about 1 hour.',
    );
  });

  it('says "within the hour" rather than counting minutes', () => {
    expect(describeInvitationExpiry(inHours(0.4), now)).toBe(
      'The invitation expires within the hour.',
    );
  });

  it('says so once it has expired', () => {
    expect(describeInvitationExpiry(inHours(-1), now)).toBe('The invitation has expired.');
    // Exactly now counts as expired, not as "within the hour".
    expect(describeInvitationExpiry(inHours(0), now)).toBe('The invitation has expired.');
  });

  it('treats an unparseable timestamp as expired rather than printing NaN', () => {
    expect(describeInvitationExpiry('not a date', now)).toBe('The invitation has expired.');
  });
});
