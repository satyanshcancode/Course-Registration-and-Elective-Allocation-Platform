/**
 * The waitlist feature around the promotion engine: what a student sees of
 * their own queues, what an admin sees of one course, and the two admin
 * actions that free seats (withdrawing a student, and the safety sweep).
 *
 * Every write goes through `waitlistPromotionService.processFreedSeats` in the
 * same transaction, so an action and the promotions it caused commit together.
 */
import type {
  AdminWaitlistView,
  EnrolledStudentRow,
  ProcessWaitlistsResult,
  StudentWaitlist,
  StudentWaitlistEntry,
  WaitingStudentRow,
  WithdrawEnrollmentResult,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { RegistrationHistoryRepository } from '../repositories/registrationHistoryRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type {
  RosterRow,
  StudentWaitlistRow,
  WaitlistRepository,
  WaitlistRow,
} from '../repositories/waitlistRepository.js';
import { AppError } from '../utils/appError.js';
import type { WaitlistPromotionService } from './waitlistPromotionService.js';

export const WITHDRAW_ACTION = 'ENROLLMENT_WITHDRAWN';
export const SWEEP_ACTION = 'WAITLISTS_PROCESSED';

export interface WaitlistService {
  /** The caller's own queues. Never another student's. */
  getStudentWaitlist(studentId: string): Promise<StudentWaitlist>;
  getAdminView(courseCode: string | undefined): Promise<AdminWaitlistView>;
  withdraw(
    adminId: string,
    enrollmentId: string,
    reason: string,
  ): Promise<WithdrawEnrollmentResult>;
  /** Offers every free seat in the window to whoever is waiting for it. */
  processAll(adminId: string): Promise<ProcessWaitlistsResult>;
}

export interface WaitlistServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  waitlists: WaitlistRepository;
  promotions: WaitlistPromotionService;
  waitlistsFor: (client: PoolClient) => WaitlistRepository;
  historyFor: (client: PoolClient) => RegistrationHistoryRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  now?: () => Date;
}

function toStudentEntry(row: StudentWaitlistRow): StudentWaitlistEntry {
  return {
    course: { code: row.code, name: row.name },
    preferenceRank: row.preferenceRank,
    status: row.status,
    position: row.position,
    waiting: row.waiting,
    capacity: row.capacity,
    allocated: row.allocated,
    score: row.score,
    reason: row.reason,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

const toRosterRow = (row: RosterRow): EnrolledStudentRow => ({
  enrollmentId: row.enrollmentId,
  student: row.student,
  source: row.source,
  preferenceRank: row.preferenceRank,
  enrolledAt: row.enrolledAt.toISOString(),
});

const toWaitlistRow = (row: WaitlistRow): WaitingStudentRow => ({
  student: row.student,
  status: row.status,
  position: row.position,
  storedPosition: row.storedPosition,
  score: row.score,
  preferenceRank: row.preferenceRank,
  reason: row.reason,
});

export function createWaitlistService({
  pool,
  windows,
  waitlists,
  promotions,
  waitlistsFor,
  historyFor,
  notificationsFor,
  auditLogsFor,
  now = () => new Date(),
}: WaitlistServiceDependencies): WaitlistService {
  return {
    async getStudentWaitlist(studentId) {
      const serverTime = now().toISOString();
      const window = await windows.findCurrent();
      if (!window) {
        return { window: null, held: null, waiting: [], ended: [], serverTime };
      }

      const [rows, held] = await Promise.all([
        waitlists.listStudentEntries(window.id, studentId),
        waitlists.findHeldSeat(window.id, studentId),
      ]);
      const entries = rows.map(toStudentEntry);

      return {
        window: window.summary,
        held:
          held && held.preferenceRank !== null
            ? { course: { code: held.code, name: held.name }, rank: held.preferenceRank }
            : null,
        waiting: entries.filter((entry) => entry.status === 'WAITING'),
        ended: entries.filter((entry) => entry.status !== 'WAITING'),
        serverTime,
      };
    },

    async getAdminView(courseCode) {
      const serverTime = now().toISOString();
      const window = await windows.findCurrent();
      if (!window) {
        return { window: null, courses: [], course: null, enrolled: [], waitlist: [], serverTime };
      }

      const offered = await waitlists.listOfferedCourses(window.id);
      const courses = offered.map((course) => ({ code: course.code, name: course.name }));
      // No course chosen yet: the page shows the picker and nothing else.
      const selected = courseCode
        ? await waitlists.findOfferingByCode(window.id, courseCode)
        : null;
      if (courseCode && !selected) {
        throw AppError.notFound(`No course with code ${courseCode} is offered in this window.`);
      }
      if (!selected) {
        return {
          window: window.summary,
          courses,
          course: null,
          enrolled: [],
          waitlist: [],
          serverTime,
        };
      }

      const [enrolled, waitlist] = await Promise.all([
        waitlists.listRoster(window.id, selected.courseId),
        waitlists.listWaitlist(window.id, selected.courseId),
      ]);

      return {
        window: window.summary,
        courses,
        course: {
          code: selected.code,
          name: selected.name,
          capacity: selected.capacity,
          allocated: selected.allocated,
          available: selected.capacity - selected.allocated,
        },
        enrolled: enrolled.map(toRosterRow),
        waitlist: waitlist.map(toWaitlistRow),
        serverTime,
      };
    },

    async withdraw(adminId, enrollmentId, reason) {
      return withTransaction(pool, async (client) => {
        const repository = waitlistsFor(client);
        const enrollment = await repository.findEnrollment(enrollmentId);
        if (!enrollment) {
          throw AppError.notFound('That enrollment does not exist, or has already been released.');
        }
        if (enrollment.windowStatus !== 'ALLOCATED') {
          throw new AppError(
            409,
            `Seats can only be withdrawn once allocation has run. This window is ${enrollment.windowStatus}.`,
          );
        }

        await repository.dropEnrollment(enrollmentId, 'ADMIN_WITHDRAWAL');
        await historyFor(client).record({
          studentId: enrollment.studentId,
          windowId: enrollment.windowId,
          eventType: 'DROPPED',
          courseId: enrollment.courseId,
          details: { reason: 'ADMIN_WITHDRAWAL', note: reason },
        });
        await notificationsFor(client).sendMany([
          {
            userId: enrollment.studentId,
            type: 'ENROLLMENT_CHANGE',
            title: `Your seat in ${enrollment.code} ${enrollment.name} was released`,
            body: `An administrator withdrew you from this course. Reason: ${reason}`,
          },
        ]);
        await auditLogsFor(client).record({
          actorUserId: adminId,
          action: WITHDRAW_ACTION,
          entityType: 'enrollment',
          entityId: enrollmentId,
          oldValue: { student: enrollment.student.email, course: enrollment.code },
          newValue: { status: 'DROPPED', dropReason: 'ADMIN_WITHDRAWAL' },
          reason,
        });

        // The seat is free now, so it is offered on immediately — in this same
        // transaction, so the withdrawal and the promotion cannot come apart.
        const summary = await promotions.processFreedSeats(client, {
          windowId: enrollment.windowId,
          courseIds: [enrollment.courseId],
          actorUserId: adminId,
        });

        return {
          student: enrollment.student,
          course: { code: enrollment.code, name: enrollment.name },
          dropReason: 'ADMIN_WITHDRAWAL',
          promotions: summary,
        } satisfies WithdrawEnrollmentResult;
      });
    },

    async processAll(adminId) {
      const window = await windows.findCurrent();
      if (!window) {
        throw AppError.notFound('There is no registration window yet.');
      }
      if (window.summary.status !== 'ALLOCATED') {
        throw new AppError(
          409,
          `Waitlists are processed once allocation has run. This window is ${window.summary.status}.`,
        );
      }

      return withTransaction(pool, async (client) => {
        const courseIds = await waitlistsFor(client).coursesWithFreeSeats(window.id);
        const summary = await promotions.processFreedSeats(client, {
          windowId: window.id,
          courseIds,
          actorUserId: adminId,
        });
        await auditLogsFor(client).record({
          actorUserId: adminId,
          action: SWEEP_ACTION,
          entityType: 'registration_window',
          entityId: window.id,
          newValue: {
            coursesChecked: courseIds.length,
            promoted: summary.promoted.length,
            removed: summary.removed.length,
          },
        });
        return { coursesChecked: courseIds.length, promotions: summary };
      });
    },
  };
}
