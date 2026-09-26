/**
 * The ONE place an account's state becomes English.
 *
 * As with every other formatter here, the `default` branches take a `never`: a
 * new student status or password strength fails to compile until it has words.
 */
import type { AdminStudentStatus, PasswordStrength } from '@course-reg/shared';

function unhandled(value: never): never {
  throw new Error(`Unhandled account value: ${JSON.stringify(value)}`);
}

export interface StatusWording {
  label: string;
  /** Shown beside the badge, or in the detail page's summary. */
  explanation: string;
}

export function describeStudentStatus(status: AdminStudentStatus): StatusWording {
  switch (status) {
    case 'INVITED':
      return {
        label: 'Invited',
        explanation:
          'The account exists and an invitation has been e-mailed, but no password has been set yet.',
      };
    case 'ACTIVE':
      return { label: 'Active', explanation: 'Can sign in and register for courses.' };
    case 'INACTIVE':
      return {
        label: 'Deactivated',
        explanation:
          'Cannot sign in. Every submission, enrolment and history entry is kept unchanged.',
      };
    default:
      return unhandled(status);
  }
}

/** Short label under the password field, paired with the meter. */
export function describePasswordStrength(strength: PasswordStrength): string {
  switch (strength) {
    case 'too-short':
      return 'Too short';
    case 'weak':
      return 'Weak';
    case 'fair':
      return 'Fair';
    case 'strong':
      return 'Strong';
    default:
      return unhandled(strength);
  }
}

/** How full the meter is drawn, 1 to 4, so it is never empty for a real value. */
export function passwordStrengthSteps(strength: PasswordStrength): number {
  switch (strength) {
    case 'too-short':
      return 1;
    case 'weak':
      return 2;
    case 'fair':
      return 3;
    case 'strong':
      return 4;
    default:
      return unhandled(strength);
  }
}

/**
 * "expires in 2 days", for an outstanding invitation. Deliberately coarse: the
 * exact minute an invitation dies is not something a registrar acts on, and a
 * ticking value would need a live region.
 */
export function describeInvitationExpiry(expiresAt: string, now: number): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(remaining) || remaining <= 0) {
    return 'The invitation has expired.';
  }
  const hours = Math.floor(remaining / 3_600_000);
  if (hours < 1) {
    return 'The invitation expires within the hour.';
  }
  if (hours < 24) {
    return `The invitation expires in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
  }
  const days = Math.round(hours / 24);
  return `The invitation expires in about ${days} ${days === 1 ? 'day' : 'days'}.`;
}
