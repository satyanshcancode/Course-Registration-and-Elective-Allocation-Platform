/**
 * Automatic waitlist promotion.
 *
 * Every path that frees a seat calls `processFreedSeats` with the courses it
 * freed, inside its OWN transaction: a promotion and the action that caused it
 * either both happen or neither does. The rules are in docs/ALLOCATION.md
 * ("Waitlist promotion"); the locking argument is in docs/CONCURRENCY.md.
 *
 * Releasing a lower-ranked seat to take a higher-ranked one frees that seat in
 * turn, so the work is a queue rather than a loop over the courses given. It
 * terminates because every promotion strictly improves one student's rank, and
 * a rank cannot improve past 1.
 */
import type {
  PromotionMove,
  PromotionSummary,
  WaitlistRemoval,
  WaitlistRemovalReason,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type {
  NotificationRepository,
  PersonalNotification,
} from '../repositories/notificationRepository.js';
import type {
  HistoryEntry,
  RegistrationHistoryRepository,
} from '../repositories/registrationHistoryRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type {
  HeldSeat,
  WaitingCandidate,
  WaitlistRepository,
} from '../repositories/waitlistRepository.js';
import { toEligibilityCourse } from './catalogueRules.js';
import { evaluateEligibility, type EligibilityStudent } from './eligibilityRules.js';
import { injectFault } from '../utils/faultInjection.js';

/** Fault point a test can arm, to prove a promotion rolls back whole. */
export const FAULT_MID_PROMOTION = 'waitlist.afterPromotionWritten';

export const PROMOTION_ACTION = 'WAITLIST_PROMOTION';

export interface ProcessFreedSeatsInput {
  windowId: string;
  /** The courses that just gained a free seat. Duplicates are harmless. */
  courseIds: readonly string[];
  /** The admin whose action freed the seat; null when the student did it. */
  actorUserId: string | null;
}

export interface WaitlistPromotionService {
  /**
   * Offers the freed seats to the people waiting for them, following the
   * cascade. Runs on the CALLER's client, inside the caller's transaction.
   */
  processFreedSeats(client: PoolClient, input: ProcessFreedSeatsInput): Promise<PromotionSummary>;
}

export interface WaitlistPromotionDependencies {
  waitlistsFor: (client: PoolClient) => WaitlistRepository;
  studentsFor: (client: PoolClient) => StudentRepository;
  catalogueFor: (client: PoolClient) => CourseCatalogueRepository;
  historyFor: (client: PoolClient) => RegistrationHistoryRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
}

/** The sentence the promoted student is sent. */
export function promotionMessage(move: PromotionMove): { title: string; body: string } {
  const title = `A seat opened in ${move.course.code} ${move.course.name}`;
  return {
    title,
    body: move.fromCourse
      ? `You've been moved from ${move.fromCourse.code} ${move.fromCourse.name}. Your ${move.fromCourse.code} seat was released.`
      : 'You were next on the waitlist, and the seat is now yours.',
  };
}

export function createWaitlistPromotionService({
  waitlistsFor,
  studentsFor,
  catalogueFor,
  historyFor,
  notificationsFor,
  auditLogsFor,
}: WaitlistPromotionDependencies): WaitlistPromotionService {
  return {
    async processFreedSeats(client, { windowId, courseIds, actorUserId }) {
      const promoted: PromotionMove[] = [];
      const removed: WaitlistRemoval[] = [];
      const history: HistoryEntry[] = [];
      const notifications: PersonalNotification[] = [];

      const waitlists = waitlistsFor(client);
      const students = studentsFor(client);
      const catalogue = catalogueFor(client);

      // Two freed seats in the same window must not be worked on at once: they
      // could otherwise promote the same student twice, or take each other's
      // course locks in opposite orders and deadlock.
      await waitlists.lockWindowForPromotion(windowId);

      // Promotion belongs to the period after allocation. Before it, the
      // waitlist has not been built; there is nothing to promote from.
      if ((await waitlists.findWindowStatus(windowId)) !== 'ALLOCATED') {
        return { promoted, removed };
      }

      // Facts do not change inside one transaction, and a cascade asks for the
      // same course several times.
      const studentFacts = new Map<string, EligibilityStudent | null>();
      const courseRules = new Map<string, ReturnType<typeof toEligibilityCourse> | null>();

      async function isEligible(studentId: string, code: string, courseId: string) {
        if (!studentFacts.has(studentId)) {
          studentFacts.set(studentId, await students.findEligibilityFacts(studentId));
        }
        if (!courseRules.has(courseId)) {
          const [offering] = await catalogue.listOfferings(windowId, code);
          courseRules.set(courseId, offering ? toEligibilityCourse(offering) : null);
        }
        const facts = studentFacts.get(studentId);
        const rules = courseRules.get(courseId);
        // Anything unreadable counts as ineligible: a promotion has to be
        // positively justified, never granted because a check was skipped.
        return facts && rules ? evaluateEligibility(facts, rules).eligible : false;
      }

      const queue = [...new Set(courseIds)];
      while (queue.length > 0) {
        const courseId = queue.shift();
        if (courseId === undefined) {
          break;
        }
        const offering = await waitlists.lockOffering(windowId, courseId);
        if (!offering) {
          continue;
        }
        const course = { code: offering.code, name: offering.name };
        let free = offering.capacity - offering.allocated;

        while (free > 0) {
          const candidate = await waitlists.nextWaiting(windowId, courseId);
          if (!candidate) {
            break;
          }

          if (!(await isEligible(candidate.studentId, offering.code, courseId))) {
            await waitlists.markRemoved(candidate.entryId, 'INELIGIBLE');
            removed.push({ student: candidate.student, course, reason: 'INELIGIBLE' });
            history.push(removalHistory(windowId, candidate.studentId, courseId, 'INELIGIBLE'));
            // An ineligible student does not consume the seat: the next one
            // in line gets the same offer.
            continue;
          }

          const held = await waitlists.findHeldSeat(windowId, candidate.studentId);
          // A promotion is only ever an upgrade. An entry the student joined
          // during add/drop carries no rank, so once they hold ANY seat there
          // is nothing to compare and the entry stops being offered.
          const staleReason = staleEntryReason(held, candidate, courseId);
          if (staleReason) {
            await waitlists.markRemoved(candidate.entryId, staleReason);
            removed.push({ student: candidate.student, course, reason: staleReason });
            history.push(removalHistory(windowId, candidate.studentId, courseId, staleReason));
            continue;
          }

          // Release first, then take: `enrollments_one_active_per_student_window_idx`
          // allows exactly one ACTIVE seat per student, so the other order
          // would be rejected by the index mid-promotion.
          if (held) {
            await waitlists.dropEnrollment(held.enrollmentId, 'UPGRADED');
          }
          await waitlists.enroll(windowId, candidate.studentId, courseId, 'WAITLIST_PROMOTION');
          await waitlists.markPromoted(candidate.entryId);

          const move: PromotionMove = {
            student: candidate.student,
            course,
            fromCourse: held ? { code: held.code, name: held.name } : null,
          };

          if (held) {
            history.push({
              studentId: candidate.studentId,
              windowId,
              eventType: 'DROPPED',
              courseId: held.courseId,
              details: { reason: 'UPGRADED', upgradedTo: offering.code },
            });
            // The seat they let go is now free, and somebody may be waiting
            // for it. This is the cascade.
            queue.push(held.courseId);
          }

          // Anything they ranked below their new seat is no longer worth
          // waiting for: being promoted there would be a downgrade. Queues
          // they joined during add/drop go too — they now hold a seat, and an
          // unranked queue cannot be shown to be an improvement on it.
          const stale = [
            ...(candidate.preferenceRank === null
              ? []
              : await waitlists.removeEntriesRankedBelow(
                  windowId,
                  candidate.studentId,
                  candidate.preferenceRank,
                  'RANKED_BELOW_SEAT',
                )
            ).map((entry) => ({ entry, reason: 'RANKED_BELOW_SEAT' as const })),
            ...(
              await waitlists.removeUnrankedEntries(
                windowId,
                candidate.studentId,
                'SEAT_ELSEWHERE',
              )
            ).map((entry) => ({ entry, reason: 'SEAT_ELSEWHERE' as const })),
          ];
          for (const { entry, reason } of stale) {
            removed.push({
              student: candidate.student,
              course: { code: entry.code, name: entry.name },
              reason,
            });
            history.push(removalHistory(windowId, candidate.studentId, entry.courseId, reason));
          }

          history.push({
            studentId: candidate.studentId,
            windowId,
            eventType: 'PROMOTED',
            courseId,
            details: {
              rank: candidate.preferenceRank,
              fromPosition: candidate.position,
              releasedCourse: held?.code ?? null,
            },
          });
          notifications.push({
            userId: candidate.studentId,
            type: 'WAITLIST_PROMOTION',
            ...promotionMessage(move),
          });
          await auditLogsFor(client).record({
            actorUserId,
            action: PROMOTION_ACTION,
            entityType: 'enrollment',
            entityId: `${windowId}:${courseId}`,
            newValue: {
              student: candidate.student.email,
              course: offering.code,
              fromCourse: held?.code ?? null,
              waitlistPosition: candidate.position,
            },
          });

          promoted.push(move);
          free -= 1;
        }
      }

      // Test-only: proves the enrollments, entries, history and notifications
      // of a whole cascade roll back together with the caller's own write.
      injectFault(FAULT_MID_PROMOTION);

      await historyFor(client).recordMany(history);
      await notificationsFor(client).sendMany(notifications);
      return { promoted, removed };
    },
  };
}

/**
 * Why this entry can no longer become a promotion, or null when it can.
 *
 * A student holding a seat is only ever moved UP: to a course they ranked
 * strictly higher. An entry with no rank behind it — joined during add/drop —
 * can never satisfy that, so it ends as soon as they hold anything.
 */
function staleEntryReason(
  held: HeldSeat | null,
  candidate: WaitingCandidate,
  courseId: string,
): WaitlistRemovalReason | null {
  if (!held) {
    return null;
  }
  if (candidate.preferenceRank === null) {
    return 'SEAT_ELSEWHERE';
  }
  return held.courseId === courseId ||
    held.preferenceRank === null ||
    held.preferenceRank <= candidate.preferenceRank
    ? 'RANKED_BELOW_SEAT'
    : null;
}

function removalHistory(
  windowId: string,
  studentId: string,
  courseId: string,
  reason: WaitlistRemovalReason,
): HistoryEntry {
  return {
    studentId,
    windowId,
    eventType: 'WAITLIST_REMOVED',
    courseId,
    details: { reason },
  };
}
