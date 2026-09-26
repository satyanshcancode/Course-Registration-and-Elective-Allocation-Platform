/**
 * Turns a stored `registration_history` row into the typed facts the API
 * publishes. Pure: no database, no clock, so every event type is covered by a
 * unit test rather than by a fixture.
 *
 * `details` is JSONB written by several services over several phases, so it is
 * read DEFENSIVELY — a field that is missing, null or the wrong shape reads as
 * "not known" instead of throwing. A timeline that refuses to render because
 * one old row lacks a key would be worse than one that says less about it.
 */
import {
  ENROLLMENT_DROP_REASONS,
  ENROLLMENT_SOURCES,
  PREFERENCE_RANKS,
  WAITLIST_REMOVAL_REASONS,
  isOneOf,
  type EnrollmentDropReason,
  type EnrollmentSource,
  type HistoryEventDetail,
  type HistoryEventType,
  type PreferenceRank,
  type WaitlistRemovalReason,
} from '@course-reg/shared';

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function rank(value: unknown): PreferenceRank | null {
  return isOneOf(PREFERENCE_RANKS, value) ? value : null;
}

function codes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function source(value: unknown): EnrollmentSource {
  return isOneOf(ENROLLMENT_SOURCES, value) ? value : 'ADD';
}

/** An unknown or missing reason reads as the one the event itself implies. */
function dropReason(value: unknown, fallback: EnrollmentDropReason): EnrollmentDropReason {
  return isOneOf(ENROLLMENT_DROP_REASONS, value) ? value : fallback;
}

function removalReason(value: unknown, fallback: WaitlistRemovalReason): WaitlistRemovalReason {
  return isOneOf(WAITLIST_REMOVAL_REASONS, value) ? value : fallback;
}

/** The `waitlisted` array an allocation run records on its history row. */
function waitlisted(value: unknown): { rank: PreferenceRank | null; position: number | null }[] {
  return Array.isArray(value)
    ? value.map((entry) => {
        const row = object(entry);
        return { rank: rank(row.rank), position: integer(row.position) };
      })
    : [];
}

/**
 * The facts of one event. The `default` branch takes a `never`, so a new
 * HistoryEventType cannot be added without deciding what it publishes.
 */
export function toHistoryDetail(type: HistoryEventType, details: unknown): HistoryEventDetail {
  const data = object(details);
  switch (type) {
    case 'DRAFT_SAVED':
      return { type, courseCodes: codes(data.courseCodes) };
    case 'SUBMITTED':
      return { type, reference: text(data.reference), courseCodes: codes(data.courseCodes) };
    case 'ALLOCATED': {
      const allocated = object(data.allocated);
      return {
        type,
        rank: rank(allocated.rank),
        finalRank: integer(allocated.finalRank),
        waitlisted: waitlisted(data.waitlisted),
      };
    }
    case 'WAITLISTED':
      return { type, waitlisted: waitlisted(data.waitlisted) };
    case 'NOT_ALLOCATED':
      return { type };
    case 'PROMOTED':
      return {
        type,
        rank: rank(data.rank),
        fromPosition: integer(data.fromPosition),
        releasedCourse: text(data.releasedCourse),
      };
    case 'ADDED':
      return {
        type,
        source: source(data.source),
        seatFreedBeforeJoining: data.seatFreedBeforeJoining === true,
        endedQueues: codes(data.endedQueues),
      };
    case 'DROPPED':
      return {
        type,
        reason: dropReason(data.reason, 'STUDENT_DROP'),
        upgradedTo: text(data.upgradedTo),
        note: text(data.note),
        leftWaitlists: codes(data.leftWaitlists),
      };
    case 'SWAPPED':
      return {
        type,
        from: text(data.from) ?? '',
        to: text(data.to) ?? '',
        endedQueues: codes(data.endedQueues),
      };
    case 'WAITLIST_JOINED':
      return {
        type,
        position: integer(data.position),
        courseWasFull: data.courseWasFull === true,
      };
    case 'WAITLIST_LEFT':
      return {
        type,
        reason: removalReason(data.reason, 'STUDENT_LEFT'),
        position: integer(data.position),
      };
    case 'WAITLIST_REMOVED':
      return { type, reason: removalReason(data.reason, 'SEAT_ELSEWHERE') };
    default:
      return unhandled(type);
  }
}

function unhandled(value: never): never {
  throw new Error(`Unhandled history event type: ${JSON.stringify(value)}`);
}
