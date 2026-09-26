/**
 * The student's own record: where they stand, what has happened, and what they
 * were told.
 *
 * Everything here is read-only except marking a notification read, so there is
 * no transaction: each answer is a handful of independent queries. Identity
 * always arrives as a `studentId` taken from `req.auth` — no method accepts one
 * from a request, and every query is scoped to it IN THE SQL rather than
 * filtered afterwards.
 */
import {
  HISTORY_MAX_PAGE_SIZE,
  HISTORY_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZE,
  type HistoryEvent,
  type HistoryPage,
  type HistoryQuery,
  type NotificationFilter,
  type NotificationPage,
  type NotificationReadResult,
  type SeatOrigin,
  type StatusSeat,
  type StatusSubmission,
  type StudentStatus,
} from '@course-reg/shared';
import {
  notificationCursor,
  type NotificationRepository,
} from '../repositories/notificationRepository.js';
import type { PreferenceRepository } from '../repositories/preferenceRepository.js';
import type {
  HistoryEventRecord,
  RegistrationHistoryRepository,
} from '../repositories/registrationHistoryRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { HeldSeat, WaitlistRepository } from '../repositories/waitlistRepository.js';
import { AppError } from '../utils/appError.js';
import { describeAddDropPeriod, toRuleWindow } from './addDropRules.js';
import { submissionReference } from './cartRules.js';
import { toHistoryDetail } from './historyEvents.js';

export interface ActivityService {
  getStatus(studentId: string): Promise<StudentStatus>;
  getHistory(studentId: string, query: HistoryQuery): Promise<HistoryPage>;
  getNotifications(
    userId: string,
    query: { filter: NotificationFilter; cursor?: string | undefined },
  ): Promise<NotificationPage>;
  markNotificationRead(userId: string, notificationId: string): Promise<NotificationReadResult>;
  markAllNotificationsRead(userId: string): Promise<NotificationReadResult>;
}

export interface ActivityServiceDependencies {
  windows: RegistrationWindowRepository;
  waitlists: WaitlistRepository;
  preferences: PreferenceRepository;
  history: RegistrationHistoryRepository;
  notifications: NotificationRepository;
  now?: () => Date;
}

export function createActivityService({
  windows,
  waitlists,
  preferences,
  history,
  notifications,
  now = () => new Date(),
}: ActivityServiceDependencies): ActivityService {
  /** Which event last gave the student this seat, as the API names it. */
  async function originOf(
    studentId: string,
    windowId: string,
    seat: HeldSeat,
  ): Promise<SeatOrigin> {
    // The enrollment row cannot tell an add from a swap — both are source ADD
    // — so the timeline is asked which one it actually was.
    const event = await history.findSeatOrigin(studentId, windowId, seat.courseId);
    switch (event) {
      case 'SWAPPED':
        return 'SWAP';
      case 'PROMOTED':
        return 'PROMOTION';
      case 'ADDED':
        return 'ADD';
      case 'ALLOCATED':
        return 'ALLOCATION';
      default:
        // No timeline row (a seat written before this phase, or by a seed):
        // the enrollment's own source is still a true answer.
        return seat.source === 'WAITLIST_PROMOTION'
          ? 'PROMOTION'
          : seat.source === 'ALLOCATION'
            ? 'ALLOCATION'
            : 'ADD';
    }
  }

  async function submissionOf(
    studentId: string,
    windowId: string,
  ): Promise<StatusSubmission | null> {
    const submission = await preferences.findSubmission(studentId, windowId);
    if (!submission) {
      return null;
    }
    const items = await preferences.findItems(submission.id);
    return {
      status: submission.status,
      // A draft has no receipt: there is nothing yet to quote.
      reference: submission.status === 'SUBMITTED' ? submissionReference(submission.id) : null,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      courseCodes: [...items].sort((a, b) => a.rank - b.rank).map((item) => item.code),
    };
  }

  return {
    async getStatus(studentId) {
      const serverTime = now().toISOString();
      const window = await windows.findCurrent();
      if (!window) {
        return {
          window: null,
          submission: null,
          held: null,
          waiting: [],
          addDrop: describeAddDropPeriod(null, now()),
          serverTime,
        };
      }

      const [submission, seat, entries] = await Promise.all([
        submissionOf(studentId, window.id),
        waitlists.findHeldSeat(window.id, studentId),
        waitlists.listStudentEntries(window.id, studentId),
      ]);

      const held: StatusSeat | null = seat
        ? {
            course: { code: seat.code, name: seat.name },
            source: seat.source,
            origin: await originOf(studentId, window.id, seat),
            preferenceRank: seat.preferenceRank,
            enrolledAt: seat.enrolledAt.toISOString(),
          }
        : null;

      return {
        window: window.summary,
        submission,
        held,
        // Live positions: `listStudentEntries` ranks the entries still WAITING,
        // which is not the stored position (never renumbered).
        waiting: entries
          .filter((entry) => entry.status === 'WAITING')
          .map((entry) => ({
            course: { code: entry.code, name: entry.name },
            preferenceRank: entry.preferenceRank,
            status: entry.status,
            position: entry.position,
            waiting: entry.waiting,
            capacity: entry.capacity,
            allocated: entry.allocated,
            score: entry.score,
            reason: entry.reason,
            endedAt: entry.endedAt?.toISOString() ?? null,
          })),
        addDrop: describeAddDropPeriod(toRuleWindow(window), now()),
        serverTime,
      };
    },

    async getHistory(studentId, query) {
      const limit = Math.min(Math.max(query.limit ?? HISTORY_PAGE_SIZE, 1), HISTORY_MAX_PAGE_SIZE);
      // One more row than asked for: whether a next page exists is then a fact
      // about the rows rather than a second COUNT query.
      const [rows, options] = await Promise.all([
        history.listForStudent(studentId, {
          type: query.type,
          courseCode: query.course,
          cursor: query.cursor,
          limit: limit + 1,
        }),
        history.listFilterOptions(studentId),
      ]);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        events: page.map(toHistoryEvent),
        nextCursor: rows.length > page.length && last ? last.id : null,
        // Unfiltered, so choosing one filter never removes the others.
        courses: options.courses,
        types: options.types,
        serverTime: now().toISOString(),
      };
    },

    async getNotifications(userId, { filter, cursor }) {
      const [rows, unread] = await Promise.all([
        notifications.listForUser(userId, {
          unreadOnly: filter === 'unread',
          cursor,
          limit: NOTIFICATION_PAGE_SIZE + 1,
        }),
        notifications.countUnread(userId),
      ]);
      const items = rows.slice(0, NOTIFICATION_PAGE_SIZE);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > items.length && last ? notificationCursor(last) : null,
        unread,
        serverTime: now().toISOString(),
      };
    },

    async markNotificationRead(userId, notificationId) {
      const result = await notifications.markRead(userId, notificationId);
      if (!result.found) {
        // Somebody else's notification and one that never existed give the
        // same answer: neither confirms that another student has messages.
        throw AppError.notFound('That notification does not exist.');
      }
      return { marked: result.marked, unread: await notifications.countUnread(userId) };
    },

    async markAllNotificationsRead(userId) {
      const marked = await notifications.markAllRead(userId);
      return { marked, unread: await notifications.countUnread(userId) };
    },
  };
}

function toHistoryEvent(record: HistoryEventRecord): HistoryEvent {
  return {
    id: record.id,
    at: record.createdAt.toISOString(),
    course: record.course,
    detail: toHistoryDetail(record.eventType, record.details),
  };
}
