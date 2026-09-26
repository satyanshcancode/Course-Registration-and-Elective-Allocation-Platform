/**
 * The ONE place "where you stand" becomes English. Like the other formatters
 * here, the `default` branches take a `never`: a new seat origin or window
 * status fails to compile until it has words.
 */
import type { RegistrationWindowStatus, StatusSeat, StudentStatus } from '@course-reg/shared';
import { ordinal } from './allocationText';

function unhandled(value: never): never {
  throw new Error(`Unhandled status value: ${JSON.stringify(value)}`);
}

/** "Allocated, your 1st choice" — how the seat became theirs. */
export function describeSeatOrigin(seat: StatusSeat): string {
  const choice =
    seat.preferenceRank === null ? '' : `, your ${ordinal(seat.preferenceRank)} choice`;
  switch (seat.origin) {
    case 'ALLOCATION':
      return `Given by allocation${choice}`;
    case 'PROMOTION':
      return `Moved up from a waitlist${choice}`;
    case 'ADD':
      return 'Added during add/drop';
    case 'SWAP':
      return 'Swapped into during add/drop';
    default:
      return unhandled(seat.origin);
  }
}

/** The one-line summary at the top of the history page. */
export function describeStanding(status: StudentStatus): string {
  if (!status.window) {
    return 'No registration window has been scheduled yet, so there is nothing to report.';
  }
  const waiting =
    status.waiting.length === 0
      ? ''
      : ` You are waiting for ${status.waiting.length} ${
          status.waiting.length === 1 ? 'course' : 'courses'
        }.`;

  if (status.held) {
    return `You hold a seat in ${status.held.course.code} ${status.held.course.name}.${waiting}`;
  }
  return `${describeStage(status.window.status, status.submission !== null && status.submission.status === 'SUBMITTED')}${waiting}`;
}

/** Where the window is, for a student who holds no seat. */
function describeStage(stage: RegistrationWindowStatus, submitted: boolean): string {
  switch (stage) {
    case 'DRAFT':
      return 'Registration has not opened yet, so there is nothing to submit.';
    case 'OPEN':
      return submitted
        ? 'Your preferences are submitted. Allocation runs once registration closes.'
        : 'Registration is open and you have not submitted yet.';
    case 'CLOSED':
      return submitted
        ? 'Registration has closed and allocation has not run yet.'
        : 'Registration closed without a submission from you.';
    case 'ALLOCATED':
      return 'Allocation has run and you do not hold a seat.';
    default:
      return unhandled(stage);
  }
}
