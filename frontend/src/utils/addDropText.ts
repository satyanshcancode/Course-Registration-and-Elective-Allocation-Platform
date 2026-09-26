/**
 * The ONE place add/drop state becomes English.
 *
 * The rules are in docs/ALLOCATION.md ("Add/drop"); these sentences are how a
 * student learns them without reading it. Every `default` branch takes a
 * `never`, so a new outcome or problem type fails to compile until it has words.
 */
import type {
  AddDropOutcome,
  AddDropPeriod,
  AddDropProblem,
  AddDropSeat,
  PromotionSummary,
} from '@course-reg/shared';
import { ordinal } from './allocationText';
import { formatDateTime } from './formatDate';

function unhandled(value: never): never {
  throw new Error(`Unhandled add/drop value: ${JSON.stringify(value)}`);
}

/** The period, as the banner and the page header say it. */
export function describePeriod(period: AddDropPeriod): string {
  if (!period.opensAt || !period.closesAt) {
    return 'No add/drop period has been scheduled yet.';
  }
  const span = `${formatDateTime(period.opensAt)} to ${formatDateTime(period.closesAt)}`;
  return period.open
    ? `Add/drop is open until ${formatDateTime(period.closesAt)}.`
    : `Add/drop runs ${span}.`;
}

/** How the student came by the seat they hold. */
export function describeHeldSeat(held: AddDropSeat): string {
  const rank = held.preferenceRank === null ? null : ordinal(held.preferenceRank);
  switch (held.source) {
    case 'ALLOCATION':
      return rank
        ? `Allocated to you in the registration round — your ${rank} choice.`
        : 'Allocated to you in the registration round.';
    case 'WAITLIST_PROMOTION':
      return rank
        ? `A seat freed up and you were next in line — your ${rank} choice.`
        : 'A seat freed up and you were next in line.';
    case 'ADD':
      return 'You took this seat during add/drop.';
    default:
      return unhandled(held.source);
  }
}

/** What a finished action did, for the toast and the announcement. */
export function describeOutcome(result: AddDropOutcome): string {
  switch (result.outcome) {
    case 'DROPPED': {
      const left =
        result.leftWaitlists.length > 0
          ? ` You also left ${result.leftWaitlists.length} waitlist${
              result.leftWaitlists.length === 1 ? '' : 's'
            }.`
          : '';
      return `You dropped ${result.course.code}. ${describePassedOn(result.promotions)}${left}`;
    }
    case 'ADDED':
      return `${result.course.code} is yours. You can drop or swap it until add/drop closes.`;
    case 'SWAPPED':
      return `You now hold ${result.to.code} instead of ${result.from.code}. ${describePassedOn(
        result.promotions,
      )}`;
    case 'WAITLISTED':
      return result.courseWasFull
        ? `${result.course.code} was full, so you joined its waitlist at ${ordinal(result.position)} of ${result.waiting}.`
        : `You joined the waitlist for ${result.course.code} at ${ordinal(result.position)} of ${result.waiting}.`;
    case 'WAITLIST_LEFT':
      return `You left the waitlist for ${result.course.code}. You will not be offered a seat there again unless you rejoin.`;
    default:
      return unhandled(result);
  }
}

/** Where the seat the student released actually went. */
export function describePassedOn(promotions: PromotionSummary): string {
  const promoted = promotions.promoted.length;
  if (promoted === 0) {
    return 'Nobody was waiting for the seat, so it is free for anyone eligible.';
  }
  return promoted === 1
    ? 'The seat went straight to the next student waiting for it.'
    : `${promoted} students moved up as a result.`;
}

/**
 * Why an action was refused. `SEAT_TAKEN` is the one that matters: the student
 * lost a race, and the page offers the queue in one click beside this sentence.
 */
export function describeProblem(problem: AddDropProblem): string {
  switch (problem.type) {
    case 'PERIOD_CLOSED':
    case 'NOT_ALLOCATED':
      return problem.reason;
    case 'SEAT_TAKEN':
      return 'That seat was just taken.';
    case 'UNKNOWN_COURSE':
      return `There is no course with the code ${problem.code}.`;
    case 'NOT_OFFERED':
      return `${problem.code} is not offered this term.`;
    case 'NOT_ELIGIBLE':
      return `You are not eligible for ${problem.code}.`;
    case 'ALREADY_ENROLLED':
      return `You already hold a seat in ${problem.code}.`;
    case 'ALREADY_HOLDS_SEAT':
      return `You hold a seat in ${problem.heldCode}, so swap it for ${problem.code} rather than adding.`;
    case 'NO_SEAT_HELD':
      return 'You do not hold a course to change.';
    case 'NOT_THE_HELD_SEAT':
      return `You hold ${problem.heldCode}, not ${problem.code}. This page is out of date — reload it.`;
    case 'SAME_COURSE':
      return `${problem.code} is the course you already hold.`;
    case 'ALREADY_WAITING':
      return `You are already on the waitlist for ${problem.code}.`;
    case 'NOT_WAITING':
      return `You are not on the waitlist for ${problem.code}.`;
    case 'REQUEST_CHANGED':
      return 'This page tried to repeat an earlier change. Reload it and try again.';
    default:
      return unhandled(problem);
  }
}

/** The consequence of dropping, stated plainly in the confirm dialog. */
export function dropConsequence(held: AddDropSeat, waiting: number): string {
  const queue =
    waiting > 0
      ? ` You are on ${waiting} other waitlist${waiting === 1 ? '' : 's'}, and stay on ${waiting === 1 ? 'it' : 'them'} unless you choose to leave.`
      : '';
  return `Your seat in ${held.course.code} ${held.course.name} goes to the next student on the waitlist. You won’t get it back unless another seat opens.${queue}`;
}
