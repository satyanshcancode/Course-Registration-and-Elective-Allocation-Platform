/**
 * The registration countdown. Times are compared against the SERVER's clock
 * (device clock plus a measured offset), so a phone set to the wrong date
 * can't tell a student they still have two days left.
 */
import type { RegistrationWindowSummary } from '@course-reg/shared';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The two largest useful units: "2d 4h", "3h 12m", "45s". One unit under a
 * minute, so the last minute visibly ticks.
 */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, remainingMs);
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export interface RegistrationCountdown {
  /** "Opens in", "Closes in" or "" when nothing is counting down. */
  label: string;
  /** "2d 4h", or null when there is nothing left to count. */
  remaining: string | null;
  /** A complete sentence for assistive technology and narrow screens. */
  text: string;
}

/**
 * What the banner says, given the window and the server's idea of "now".
 * A window whose status still says OPEN after its end time reads "Closing",
 * because the status only changes when an admin closes it.
 */
export function describeCountdown(
  window: RegistrationWindowSummary,
  now: Date,
): RegistrationCountdown {
  const startsAt = Date.parse(window.startsAt);
  const endsAt = Date.parse(window.endsAt);
  const time = now.getTime();

  switch (window.status) {
    case 'DRAFT': {
      if (startsAt <= time) {
        return { label: '', remaining: null, text: 'Opening soon' };
      }
      const remaining = formatCountdown(startsAt - time);
      return { label: 'Opens in', remaining, text: `Registration opens in ${remaining}` };
    }
    case 'OPEN': {
      if (endsAt <= time) {
        return { label: '', remaining: null, text: 'Registration is closing' };
      }
      const remaining = formatCountdown(endsAt - time);
      return { label: 'Closes in', remaining, text: `Registration closes in ${remaining}` };
    }
    case 'CLOSED':
      return { label: '', remaining: null, text: 'Registration is closed' };
    case 'ALLOCATED':
      return { label: '', remaining: null, text: 'Allocation complete' };
  }
}
