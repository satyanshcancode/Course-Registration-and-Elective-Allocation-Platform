/**
 * The ONE place waitlist state becomes English, for students and for admins.
 *
 * The promotion rules are in docs/ALLOCATION.md; these sentences are how a
 * student learns them without reading it. The `default` branches take a
 * `never`, so a new status or removal reason fails to compile until it has
 * words.
 */
import type {
  CourseRef,
  PreferenceRank,
  PromotionSummary,
  StudentWaitlistEntry,
  WaitlistRemovalReason,
} from '@course-reg/shared';
import { ordinal } from './allocationText';

function unhandled(value: never): never {
  throw new Error(`Unhandled waitlist value: ${JSON.stringify(value)}`);
}

/** "You are 3rd of 18 waiting. 20 of 20 seats are taken." */
export function describeQueue(entry: StudentWaitlistEntry): string {
  const place =
    entry.position === null
      ? 'You are on this waitlist.'
      : `You are ${ordinal(entry.position)} of ${entry.waiting} waiting.`;
  const free = entry.capacity - entry.allocated;
  return free > 0
    ? `${place} ${free} ${free === 1 ? 'seat is' : 'seats are'} free right now and being offered down the list.`
    : `${place} Every seat is taken, so you move up when one is released.`;
}

/** The upgrade rule, in the words that matter to this particular student. */
export function describeUpgrade(
  held: { course: CourseRef; rank: PreferenceRank | null } | null,
): string {
  if (!held) {
    return 'You have no seat yet, so any of these would be your first. You are moved in automatically as soon as one frees up — there is nothing to accept and nothing to claim.';
  }
  const release = `Your ${held.course.code} seat would be released for the next student waiting for it.`;
  // A seat taken during add/drop was never ranked, so "higher" has nothing to
  // compare against — but every course below IS one they ranked, which is why
  // promotion still offers them one (see docs/ALLOCATION.md).
  return held.rank === null
    ? `You hold a seat in ${held.course.code} ${held.course.name}, which you took during add/drop rather than ranking. Everything below is a course you did rank, so being moved up is still an improvement — and ${release.charAt(0).toLowerCase()}${release.slice(1)}`
    : `You hold a seat in ${held.course.code} ${held.course.name}, your ${ordinal(held.rank)} choice. Everything below is a course you ranked higher, so being moved up is always an improvement — and ${release.charAt(0).toLowerCase()}${release.slice(1)}`;
}

export function describeRemoval(reason: WaitlistRemovalReason): string {
  switch (reason) {
    case 'INELIGIBLE':
      return 'you no longer met the course’s requirements when the seat was offered';
    case 'RANKED_BELOW_SEAT':
      return 'you were given a course you ranked higher, so waiting here could only have been a downgrade';
    case 'STUDENT_LEFT':
      return 'you left this waitlist yourself';
    case 'SEAT_ELSEWHERE':
      return 'you took a seat in another course, and this was a waitlist you joined during add/drop rather than one you ranked — so there was no way to tell whether moving you here would be an improvement';
    default:
      return unhandled(reason);
  }
}

/** "your 2nd choice", or how a queue joined during add/drop got there. */
export function describeChoice(rank: PreferenceRank | null): string {
  return rank === null ? 'Joined in add/drop' : ordinal(rank);
}

/** Why an entry is no longer in the queue. */
export function describeEnded(entry: StudentWaitlistEntry): string {
  switch (entry.status) {
    case 'PROMOTED':
      return 'A seat freed up and you were next in line, so this one is yours.';
    case 'REMOVED':
      return entry.reason
        ? `Removed from this queue because ${describeRemoval(entry.reason)}.`
        : 'You are no longer waiting for this course.';
    case 'WAITING':
      return describeQueue(entry);
    default:
      return unhandled(entry.status);
  }
}

/** "2 students promoted", for the admin's toast. */
export function describePromotions(summary: PromotionSummary): string {
  const { promoted, removed } = summary;
  if (promoted.length === 0) {
    return removed.length === 0
      ? 'Nobody was waiting for that seat.'
      : `Nobody could be promoted. ${removed.length} waitlist ${removed.length === 1 ? 'entry was' : 'entries were'} removed.`;
  }
  const moves = promoted
    .map((move) =>
      move.fromCourse
        ? `${move.student.name} → ${move.course.code} (from ${move.fromCourse.code})`
        : `${move.student.name} → ${move.course.code}`,
    )
    .join(', ');
  return `${promoted.length} ${promoted.length === 1 ? 'student' : 'students'} promoted: ${moves}.`;
}
