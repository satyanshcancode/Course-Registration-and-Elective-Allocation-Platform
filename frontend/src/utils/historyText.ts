/**
 * The ONE place a history event becomes English.
 *
 * The server publishes facts — codes, ranks, positions, reasons — and every
 * sentence a student reads on their timeline is built here, from those facts.
 * The `default` branch takes a `never`, so adding an event type to the shared
 * union breaks the build here until it has words.
 */
import type { HistoryEvent, HistoryEventType } from '@course-reg/shared';
import {
  ArrowLeftRight,
  ArrowUpRight,
  CircleCheck,
  CircleMinus,
  FileText,
  Hourglass,
  LogOut,
  MinusCircle,
  Plus,
  Send,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { ordinal } from './allocationText';
import { describeRemoval } from './waitlistText';

function unhandled(value: never): never {
  throw new Error(`Unhandled history event: ${JSON.stringify(value)}`);
}

/** "Artificial Intelligence", or the code alone when the course is gone. */
function courseName(event: HistoryEvent): string {
  return event.course ? `${event.course.code} ${event.course.name}` : 'a course no longer listed';
}

/** "your 2nd choice", or nothing at all for a course that was never ranked. */
function choice(rank: number | null, prefix = ', '): string {
  return rank === null ? '' : `${prefix}your ${ordinal(rank)} choice`;
}

function list(codes: readonly string[]): string {
  return codes.length <= 1
    ? (codes[0] ?? '')
    : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1) ?? ''}`;
}

/**
 * One plain-English sentence for one event, e.g. "You were moved up from
 * CS402 Cloud Security to AI401 Artificial Intelligence when a seat opened."
 */
export function describeHistoryEvent(event: HistoryEvent): string {
  const detail = event.detail;
  const course = courseName(event);
  switch (detail.type) {
    case 'DRAFT_SAVED':
      return detail.courseCodes.length === 0
        ? 'You saved an empty draft.'
        : `You saved a draft ranking ${list(detail.courseCodes)}.`;

    case 'SUBMITTED': {
      const receipt = detail.reference ? ` (${detail.reference})` : '';
      return detail.courseCodes.length === 0
        ? `You submitted your preferences${receipt}.`
        : `You submitted ${detail.courseCodes.length} ${
            detail.courseCodes.length === 1 ? 'preference' : 'preferences'
          } — ${list(detail.courseCodes)}${receipt}.`;
    }

    case 'ALLOCATED': {
      const seat = `Allocation gave you a seat in ${course}${choice(detail.rank)}`;
      const place =
        detail.finalRank === null ? '' : `, ${ordinal(detail.finalRank)} in line for it`;
      return `${seat}${place}.${waitlistTail(detail.waitlisted)}`;
    }

    case 'WAITLISTED':
      return detail.waitlisted.length === 0
        ? 'Allocation could not give you a seat.'
        : `Allocation could not give you a seat, so you were put on ${
            detail.waitlisted.length === 1 ? 'a waitlist' : `${detail.waitlisted.length} waitlists`
          }${placesIn(detail.waitlisted)}.`;

    case 'NOT_ALLOCATED':
      return 'Allocation ran and you were not given a seat in any course you ranked.';

    case 'PROMOTED': {
      const from = detail.releasedCourse ? ` from ${detail.releasedCourse}` : '';
      const place =
        detail.fromPosition === null ? '' : ` You were ${ordinal(detail.fromPosition)} in line.`;
      // The comma closes the "your 2nd choice" aside; without a rank there is
      // no aside to close.
      const aside = detail.rank === null ? '' : `${choice(detail.rank)},`;
      return `You were moved up${from} to ${course}${aside} when a seat opened.${place}`;
    }

    case 'ADDED': {
      const how = detail.seatFreedBeforeJoining
        ? `A seat in ${course} freed up while you were asking to join its waitlist, so you took it instead.`
        : `You added ${course} during add/drop.`;
      return `${how}${endedTail(detail.endedQueues)}`;
    }

    case 'DROPPED': {
      // Bound first: switching on `detail.reason` would narrow `detail`
      // itself to never in the default branch, where it still has to be read.
      const reason = detail.reason;
      switch (reason) {
        case 'UPGRADED':
          return `Your seat in ${course} was released to take ${
            detail.upgradedTo ?? 'a course you ranked higher'
          }.`;
        case 'ADMIN_WITHDRAWAL':
          return `An administrator withdrew you from ${course}.${
            detail.note ? ` Reason: ${detail.note}` : ''
          }`;
        case 'SWAPPED':
          return `You released your seat in ${course} as part of a swap.`;
        case 'STUDENT_DROP':
          return `You dropped ${course}.${
            detail.leftWaitlists.length > 0
              ? ` You also left the waitlist for ${list(detail.leftWaitlists)}.`
              : ''
          }`;
        default:
          return unhandled(reason);
      }
    }

    case 'SWAPPED':
      return `You swapped ${detail.from} for ${course}.${endedTail(detail.endedQueues)}`;

    case 'WAITLIST_JOINED': {
      const why = detail.courseWasFull
        ? `${course} was full, so you joined its waitlist`
        : `You joined the waitlist for ${course}`;
      return detail.position === null ? `${why}.` : `${why}, ${ordinal(detail.position)} in line.`;
    }

    case 'WAITLIST_LEFT':
      return `You left the waitlist for ${course}${
        detail.position === null ? '' : `, where you were ${ordinal(detail.position)} in line`
      }.`;

    case 'WAITLIST_REMOVED':
      return `You were taken off the waitlist for ${course} because ${describeRemoval(
        detail.reason,
      )}.`;

    default:
      return unhandled(detail);
  }
}

/** " (1st in line and 4th in line)", or nothing when no place is known. */
function placesIn(entries: readonly { position: number | null }[]): string {
  const places = entries
    .map((entry) => (entry.position === null ? null : `${ordinal(entry.position)} in line`))
    .filter((place): place is string => place !== null);
  return places.length === 0 ? '' : ` (${list(places)})`;
}

/** " You were also put on 2 waitlists." — only when there were any. */
function waitlistTail(entries: readonly { position: number | null }[]): string {
  return entries.length === 0
    ? ''
    : ` You were also put on ${entries.length} ${
        entries.length === 1 ? 'waitlist' : 'waitlists'
      }${placesIn(entries)}.`;
}

/** " That ended your place in the queue for CS402." */
function endedTail(codes: readonly string[]): string {
  return codes.length === 0
    ? ''
    : ` That ended your place in the ${codes.length === 1 ? 'queue' : 'queues'} for ${list(codes)}.`;
}

/** A short label for the event, for the filter and the timeline's marker. */
export function historyEventLabel(type: HistoryEventType): string {
  switch (type) {
    case 'DRAFT_SAVED':
      return 'Draft saved';
    case 'SUBMITTED':
      return 'Submitted';
    case 'ALLOCATED':
      return 'Allocated';
    case 'WAITLISTED':
      return 'Waitlisted';
    case 'NOT_ALLOCATED':
      return 'No seat';
    case 'PROMOTED':
      return 'Moved up';
    case 'ADDED':
      return 'Added';
    case 'DROPPED':
      return 'Dropped';
    case 'SWAPPED':
      return 'Swapped';
    case 'WAITLIST_JOINED':
      return 'Joined waitlist';
    case 'WAITLIST_LEFT':
      return 'Left waitlist';
    case 'WAITLIST_REMOVED':
      return 'Removed from waitlist';
    default:
      return unhandled(type);
  }
}

/**
 * The glyph beside the event. Decorative: every timeline row prints its label
 * as text too, so the icon is never the only thing carrying the meaning.
 */
export function historyEventIcon(type: HistoryEventType): LucideIcon {
  switch (type) {
    case 'DRAFT_SAVED':
      return FileText;
    case 'SUBMITTED':
      return Send;
    case 'ALLOCATED':
      return CircleCheck;
    case 'WAITLISTED':
      return Hourglass;
    case 'NOT_ALLOCATED':
      return CircleMinus;
    case 'PROMOTED':
      return ArrowUpRight;
    case 'ADDED':
      return Plus;
    case 'DROPPED':
      return MinusCircle;
    case 'SWAPPED':
      return ArrowLeftRight;
    case 'WAITLIST_JOINED':
      return Hourglass;
    case 'WAITLIST_LEFT':
      return LogOut;
    case 'WAITLIST_REMOVED':
      return UserMinus;
    default:
      return unhandled(type);
  }
}

/** Events grouped into days, newest day first, each already in order. */
export function groupByDay(
  events: readonly HistoryEvent[],
): { day: string; events: HistoryEvent[] }[] {
  const days: { day: string; events: HistoryEvent[] }[] = [];
  for (const event of events) {
    // The ISO date in the VIEWER's zone: an event at 00:30 local belongs to
    // that day, not to the UTC one before it.
    const day = localDay(event.at);
    const current = days.at(-1);
    if (current?.day === day) {
      current.events.push(event);
    } else {
      days.push({ day, events: [event] });
    }
  }
  return days;
}

/** `YYYY-MM-DD` in the viewer's time zone, for grouping and for <time>. */
export function localDay(at: string): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
