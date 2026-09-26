/**
 * The student's own record: where they stand now, everything that has happened
 * to their registration, and the messages they were sent.
 *
 * History events are a discriminated union on `type` carrying the FACTS of
 * each event — codes, ranks, positions, reasons — never a pre-written
 * sentence. The server has no business deciding how the timeline reads; one
 * formatter on the client turns these into English, and its `default` branch
 * takes a `never` so a new event type fails to compile until it has words.
 *
 * Both lists are cursor-paginated. A cursor is an opaque string: it encodes a
 * keyset position, not an offset, so rows written while the student reads
 * cannot shift the page under them.
 */
import type {
  EnrollmentDropReason,
  EnrollmentSource,
  HistoryEventType,
  NotificationType,
  PreferenceRank,
  SubmissionStatus,
  WaitlistRemovalReason,
} from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { CourseRef } from '../domain/refs.js';
import type { AddDropPeriod } from './addDrop.js';
import type { RegistrationWindowSummary } from './courses.js';
import type { StudentWaitlistEntry } from './waitlist.js';

// ---------------------------------------------------------------------------
// GET /api/students/me/status
// ---------------------------------------------------------------------------

/** How the seat a student holds came to be theirs. */
export const SEAT_ORIGINS = ['ALLOCATION', 'PROMOTION', 'ADD', 'SWAP'] as const;
export type SeatOrigin = (typeof SEAT_ORIGINS)[number];

/** The submission for this window, or null when nothing was ever saved. */
export interface StatusSubmission {
  status: SubmissionStatus;
  /** The receipt reference; null while the cart is still a draft. */
  reference: string | null;
  submittedAt: IsoDateTime | null;
  courseCodes: string[];
}

/** The elective the student holds right now. */
export interface StatusSeat {
  course: CourseRef;
  /**
   * How they got it. `source` is what the enrollment row records; `origin`
   * separates an add from a swap, which the row cannot — both are `ADD` — by
   * reading the last acquisition event for this course from the timeline.
   */
  source: EnrollmentSource;
  origin: SeatOrigin;
  preferenceRank: PreferenceRank | null;
  enrolledAt: IsoDateTime;
}

/** GET /api/students/me/status — one answer to "where do I stand?". */
export interface StudentStatus {
  window: RegistrationWindowSummary | null;
  submission: StatusSubmission | null;
  held: StatusSeat | null;
  /** Queues still WAITING, with LIVE positions (see StudentWaitlistEntry). */
  waiting: StudentWaitlistEntry[];
  addDrop: AddDropPeriod;
  serverTime: IsoDateTime;
}

// ---------------------------------------------------------------------------
// GET /api/students/me/history
// ---------------------------------------------------------------------------

/**
 * What happened, as facts. One member per HistoryEventType — the `satisfies`
 * below is what keeps the two in step.
 */
export type HistoryEventDetail =
  | { type: 'DRAFT_SAVED'; courseCodes: string[] }
  | { type: 'SUBMITTED'; reference: string | null; courseCodes: string[] }
  | {
      type: 'ALLOCATED';
      /** Which choice the seat was, when the run recorded it. */
      rank: PreferenceRank | null;
      /** Place among everyone who ranked the course (1 = first in line). */
      finalRank: number | null;
      /** Courses the same run put them on a waitlist for. */
      waitlisted: { rank: PreferenceRank | null; position: number | null }[];
    }
  | { type: 'WAITLISTED'; waitlisted: { rank: PreferenceRank | null; position: number | null }[] }
  | { type: 'NOT_ALLOCATED' }
  | {
      type: 'PROMOTED';
      rank: PreferenceRank | null;
      /** Where they were in the queue when the seat was offered. */
      fromPosition: number | null;
      /** The lower-ranked seat released to take this one, if there was one. */
      releasedCourse: string | null;
    }
  | {
      type: 'ADDED';
      source: EnrollmentSource;
      /** The course filled up and then freed again before the request landed. */
      seatFreedBeforeJoining: boolean;
      /** Queues that ended because taking this seat made them unanswerable. */
      endedQueues: string[];
    }
  | {
      type: 'DROPPED';
      reason: EnrollmentDropReason;
      /** The better course taken in exchange, for an UPGRADED drop. */
      upgradedTo: string | null;
      /** The administrator's reason, for an ADMIN_WITHDRAWAL. */
      note: string | null;
      /** Queues left in the same action. */
      leftWaitlists: string[];
    }
  | { type: 'SWAPPED'; from: string; to: string; endedQueues: string[] }
  | { type: 'WAITLIST_JOINED'; position: number | null; courseWasFull: boolean }
  | { type: 'WAITLIST_LEFT'; reason: WaitlistRemovalReason; position: number | null }
  | { type: 'WAITLIST_REMOVED'; reason: WaitlistRemovalReason };

export type HistoryEventDetailType = HistoryEventDetail['type'];

type Covers<A, B> = [A] extends [B] ? true : false;
type AssertTrue<T extends true> = T;

/**
 * Compile-time checks that the union above has exactly one member per
 * HistoryEventType. A new event type in `enums.ts` fails the first until it
 * has facts; a member for an event type that no longer exists fails the second.
 */
export type EveryHistoryEventTypeHasFacts = AssertTrue<
  Covers<HistoryEventType, HistoryEventDetailType>
>;
export type EveryHistoryFactHasAnEventType = AssertTrue<
  Covers<HistoryEventDetailType, HistoryEventType>
>;

export interface HistoryEvent {
  /** Opaque, and the cursor for everything older than this row. */
  id: string;
  at: IsoDateTime;
  /**
   * The course the event is about. Null when the event has none (a submission
   * covers five), or when the course it named has since been removed.
   */
  course: CourseRef | null;
  detail: HistoryEventDetail;
}

/** Query string of GET /api/students/me/history. */
export interface HistoryQuery {
  /** Only this event type. */
  type?: HistoryEventType;
  /** Only events about this course code. */
  course?: string;
  /** Everything older than this row; omit for the newest page. */
  cursor?: string;
  limit?: number;
}

export interface HistoryPage {
  events: HistoryEvent[];
  /** Pass back as `cursor` for the next page; null when the list is exhausted. */
  nextCursor: string | null;
  /** Courses the student has any history for, for the filter. */
  courses: CourseRef[];
  /** Event types the student has any history for, for the filter. */
  types: HistoryEventType[];
  serverTime: IsoDateTime;
}

export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_FILTERS = ['unread', 'all'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
  /** How many are unread in total, not just on this page. */
  unread: number;
  serverTime: IsoDateTime;
}

/**
 * What marking one or all as read left behind. The unread count comes back so
 * the navigation badge updates from the same reply, with no second request.
 */
export interface NotificationReadResult {
  /** How many rows this call actually changed (0 when already read). */
  marked: number;
  unread: number;
}

export const NOTIFICATION_PAGE_SIZE = 20;
