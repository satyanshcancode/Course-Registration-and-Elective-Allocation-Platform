import type {
  AdminCourseList,
  AdminCourseOffering,
  PromotionSummary,
  UpdateCapacityRequest,
  UpdateCapacityResult,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { OfferingRepository } from '../repositories/offeringRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { OfferingRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import { demandRatio } from './catalogueRules.js';
import type { WaitlistPromotionService } from './waitlistPromotionService.js';

export interface AdminCourseService {
  listOfferings(): Promise<AdminCourseList>;
  updateCapacity(
    actorUserId: string,
    courseCode: string,
    change: UpdateCapacityRequest,
  ): Promise<UpdateCapacityResult>;
}

interface AdminCourseServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  /** Repositories bound to the transaction's client. */
  offeringsFor: (client: PoolClient) => OfferingRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  promotions: WaitlistPromotionService;
}

export const CAPACITY_CHANGED_ACTION = 'COURSE_CAPACITY_CHANGED';

/** 409 with a field error, so the form can show it next to the input. */
function belowAllocatedError(allocated?: number): AppError {
  const message =
    allocated === undefined
      ? "Capacity can't be lower than the number of seats already allocated."
      : `Capacity can't be lower than ${allocated}: ${allocated} ${allocated === 1 ? 'seat is' : 'seats are'} already allocated.`;
  return new AppError(409, message, [{ field: 'capacity', message }]);
}

export function toAdminOffering(offering: OfferingRecord): AdminCourseOffering {
  return {
    code: offering.code,
    name: offering.name,
    credits: offering.credits,
    department: offering.department,
    capacity: offering.capacity,
    allocated: offering.allocated,
    available: offering.capacity - offering.allocated,
    demand: offering.demand,
    demandRatio: demandRatio(offering.demand, offering.capacity),
    oversubscribed: offering.demand > offering.capacity,
  };
}

export function createAdminCourseService({
  pool,
  windows,
  catalogue,
  offeringsFor,
  auditLogsFor,
  promotions,
}: AdminCourseServiceDependencies): AdminCourseService {
  return {
    async listOfferings() {
      const window = await windows.findCurrent();
      if (!window) {
        return { window: null, items: [] };
      }
      const offerings = await catalogue.listOfferings(window.id);
      return { window: window.summary, items: offerings.map(toAdminOffering) };
    },

    async updateCapacity(actorUserId, courseCode, { capacity, reason }) {
      const window = await windows.findCurrent();
      if (!window) {
        throw AppError.notFound('There is no registration window yet.');
      }

      let promoted: PromotionSummary | null = null;
      try {
        await withTransaction(pool, async (client) => {
          const offering = await offeringsFor(client).lockByCode(window.id, courseCode);
          if (!offering) {
            throw AppError.notFound(`No course with code ${courseCode} is offered in this window.`);
          }
          if (capacity < offering.allocated) {
            throw belowAllocatedError(offering.allocated);
          }
          if (capacity === offering.capacity) {
            const message = `Capacity is already ${capacity}.`;
            throw AppError.badRequest(message, [{ field: 'capacity', message }]);
          }
          await offeringsFor(client).updateCapacity(window.id, offering.courseId, capacity);

          // Extra seats after allocation are not left empty while people are
          // waiting for them. Same transaction: the seats and whoever takes
          // them commit together.
          if (window.summary.status === 'ALLOCATED' && capacity > offering.capacity) {
            promoted = await promotions.processFreedSeats(client, {
              windowId: window.id,
              courseIds: [offering.courseId],
              actorUserId,
            });
          }

          await auditLogsFor(client).record({
            actorUserId,
            action: CAPACITY_CHANGED_ACTION,
            entityType: 'registration_window_course',
            entityId: `${window.id}:${offering.courseId}`,
            oldValue: { courseCode: offering.code, capacity: offering.capacity },
            newValue: { courseCode: offering.code, capacity },
            reason,
          });
        });
      } catch (error) {
        // The row lock makes this unreachable in practice; the CHECK constraint
        // is still the final guard against a capacity below the seats held.
        if (
          isConstraintViolation(
            error,
            PG_ERROR.CHECK_VIOLATION,
            'registration_window_courses_allocated_count_check',
          )
        ) {
          throw belowAllocatedError();
        }
        throw error;
      }

      const [updated] = await catalogue.listOfferings(window.id, courseCode);
      if (!updated) {
        throw AppError.notFound(`No course with code ${courseCode} is offered in this window.`);
      }
      return { offering: toAdminOffering(updated), promotions: promoted };
    },
  };
}
