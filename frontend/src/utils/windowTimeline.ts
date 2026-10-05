/**
 * The registration window as four steps, for the dashboard's timeline.
 *
 * Pure and tested: which step is current is a rule about the window, not
 * something a component should work out while it renders.
 */
import type { RegistrationWindowSummary } from '@course-reg/shared';

export const WINDOW_STEPS = ['Not started', 'Open', 'Closing soon', 'Closed'] as const;
export type WindowStep = (typeof WINDOW_STEPS)[number];

/** Inside this much of the end time, an open window is "closing soon". */
export const CLOSING_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * The index into WINDOW_STEPS the window has reached.
 *
 * An OPEN window whose end time has already passed counts as closing rather
 * than closed: only an administrator closes a window, and saying "Closed"
 * before that happened would be a lie the student could act on.
 */
export function windowStepIndex(window: RegistrationWindowSummary, now: Date): number {
  switch (window.status) {
    case 'DRAFT':
      return 0;
    case 'OPEN':
      return Date.parse(window.endsAt) - now.getTime() <= CLOSING_SOON_MS ? 2 : 1;
    case 'CLOSED':
    case 'ALLOCATED':
      return 3;
  }
}
