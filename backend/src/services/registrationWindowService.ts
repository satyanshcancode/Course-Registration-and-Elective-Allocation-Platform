import type {
  AdminWindowDetail,
  AllocationConfig,
  UpdateAddDropPeriodRequest,
  UpdateWindowRequest,
  WindowActionRequest,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { OfferingRecord, WindowDetailRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import { toEligibilityCourse } from './catalogueRules.js';
import { evaluateEligibility } from './eligibilityRules.js';
import {
  checkReadyToOpen,
  checkTransition,
  frozenPolicyMessage,
  generateRandomSeed,
  isPolicyFrozen,
  targetStatus,
  type WindowAction,
} from './registrationWindowRules.js';

export interface RegistrationWindowService {
  getDetail(): Promise<AdminWindowDetail>;
  /** DRAFT only: 409 once the policy is frozen. */
  updateWindow(actorUserId: string, change: UpdateWindowRequest): Promise<AdminWindowDetail>;
  /** Opens registration, freezing the policy and notifying every student. */
  open(actorUserId: string, request: WindowActionRequest): Promise<AdminWindowDetail>;
  close(actorUserId: string, request: WindowActionRequest): Promise<AdminWindowDetail>;
  /**
   * Schedules (or clears) the add/drop period. Only meaningful once allocation
   * has run, and deliberately NOT part of the frozen policy: extending the
   * period changes no allocation rule, so an ALLOCATED window allows it.
   */
  setAddDropPeriod(
    actorUserId: string,
    change: UpdateAddDropPeriodRequest,
  ): Promise<AdminWindowDetail>;
}

interface RegistrationWindowServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  /** Repositories bound to the transaction's client. */
  windowsFor: (client: PoolClient) => RegistrationWindowRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  now?: () => Date;
  randomSeed?: () => number;
}

export const WINDOW_AUDIT_ACTIONS = {
  update: 'REGISTRATION_WINDOW_UPDATED',
  open: 'REGISTRATION_WINDOW_OPENED',
  close: 'REGISTRATION_WINDOW_CLOSED',
  addDrop: 'ADD_DROP_PERIOD_UPDATED',
} as const;

const WINDOW_ENTITY_TYPE = 'registration_window';
const NO_WINDOW_MESSAGE = 'There is no registration window yet.';

/** The audited shape of a window's policy: what a reader needs to see what changed. */
function auditValue(window: WindowDetailRecord, courseCodes: readonly string[]) {
  return {
    name: window.summary.name,
    term: window.summary.term,
    status: window.summary.status,
    startsAt: window.summary.startsAt,
    endsAt: window.summary.endsAt,
    policy: window.policy,
    randomSeed: window.randomSeed,
    courseCodes: [...courseCodes],
  };
}

/** Students who can take at least one offered course. */
export function countEligibleStudents(
  students: readonly {
    programId: string;
    program: { code: string; name: string };
    semester: number;
    creditsCompleted: number;
    completedCourseIds: ReadonlySet<string>;
  }[],
  offerings: readonly OfferingRecord[],
): number {
  const courses = offerings.map(toEligibilityCourse);
  return students.filter((student) =>
    courses.some((course) => evaluateEligibility(student, course).eligible),
  ).length;
}

export function createRegistrationWindowService({
  pool,
  windows,
  catalogue,
  windowsFor,
  auditLogsFor,
  notificationsFor,
  now = () => new Date(),
  randomSeed = () => generateRandomSeed(),
}: RegistrationWindowServiceDependencies): RegistrationWindowService {
  async function buildDetail(): Promise<AdminWindowDetail> {
    const window = await windows.findCurrentDetail();
    if (!window) {
      return {
        window: null,
        policy: null,
        randomSeed: null,
        editable: false,
        counts: { offeredCourses: 0, eligibleStudents: 0, submissions: 0, totalStudents: 0 },
        courses: [],
        serverTime: now().toISOString(),
      };
    }

    const [courses, counts, offerings, facts] = await Promise.all([
      windows.findCourseOptions(window.id),
      windows.countWindow(window.id),
      catalogue.listOfferings(window.id),
      windows.findAllEligibilityFacts(),
    ]);

    return {
      window: window.summary,
      policy: window.policy,
      randomSeed: window.randomSeed,
      editable: !isPolicyFrozen(window.summary.status),
      counts: { ...counts, eligibleStudents: countEligibleStudents(facts, offerings) },
      courses,
      serverTime: now().toISOString(),
    };
  }

  async function requireLockedWindow(client: PoolClient): Promise<{
    repository: RegistrationWindowRepository;
    window: WindowDetailRecord;
  }> {
    const repository = windowsFor(client);
    const current = await repository.findCurrentDetail();
    const window = current && (await repository.lockById(current.id));
    if (!window) {
      throw AppError.notFound(NO_WINDOW_MESSAGE);
    }
    return { repository, window };
  }

  /** Runs a status change with its audit row, and returns the fresh detail. */
  async function changeStatus(
    action: WindowAction,
    actorUserId: string,
    { reason }: WindowActionRequest,
    onOpened?: (client: PoolClient, window: WindowDetailRecord) => Promise<void>,
  ): Promise<AdminWindowDetail> {
    await withTransaction(pool, async (client) => {
      const { repository, window } = await requireLockedWindow(client);
      const transition = checkTransition(action, window.summary.status);
      if (!transition.ok) {
        throw new AppError(409, transition.message);
      }

      const courseCodes = (await catalogue.listOfferings(window.id)).map(
        (offering) => offering.code,
      );
      if (action === 'open') {
        const ready = checkReadyToOpen(
          window.policy,
          courseCodes.length,
          new Date(window.summary.endsAt),
          now(),
        );
        if (!ready.ok) {
          throw new AppError(409, ready.message);
        }
      }

      const status = targetStatus(action);
      await repository.setStatus(window.id, status);
      await auditLogsFor(client).record({
        actorUserId,
        action: WINDOW_AUDIT_ACTIONS[action],
        entityType: WINDOW_ENTITY_TYPE,
        entityId: window.id,
        oldValue: auditValue(window, courseCodes),
        newValue: { ...auditValue(window, courseCodes), status },
        reason,
      });
      // Same transaction: if the notifications fail, the window stays closed.
      await onOpened?.(client, window);
    });
    return buildDetail();
  }

  return {
    getDetail: buildDetail,

    async updateWindow(actorUserId, change) {
      await withTransaction(pool, async (client) => {
        const { repository, window } = await requireLockedWindow(client);
        // The service refuses first; the database trigger is the backstop.
        if (isPolicyFrozen(window.summary.status)) {
          throw new AppError(409, frozenPolicyMessage(window.summary.status));
        }
        const before = (await catalogue.listOfferings(window.id)).map((offering) => offering.code);
        const policy: AllocationConfig = change.policy;
        await repository.updatePolicy(window.id, {
          name: change.name,
          term: change.term,
          startsAt: new Date(change.startsAt),
          endsAt: new Date(change.endsAt),
          policy,
          randomSeed: change.randomSeed ?? randomSeed(),
        });
        await repository.replaceOfferings(window.id, change.courseCodes);

        const after = await repository.lockById(window.id);
        await auditLogsFor(client).record({
          actorUserId,
          action: WINDOW_AUDIT_ACTIONS.update,
          entityType: WINDOW_ENTITY_TYPE,
          entityId: window.id,
          oldValue: auditValue(window, before),
          newValue: after ? auditValue(after, change.courseCodes) : null,
          reason: change.reason,
        });
      }).catch(rethrowFrozenPolicy);
      return buildDetail();
    },

    async setAddDropPeriod(actorUserId, change) {
      await withTransaction(pool, async (client) => {
        const { repository, window } = await requireLockedWindow(client);
        if (window.summary.status !== 'ALLOCATED') {
          throw new AppError(
            409,
            `Add/drop follows allocation, so the period can only be set on an allocated window. This one is ${window.summary.status.toLowerCase()}.`,
          );
        }
        const opensAt = change.opensAt === null ? null : new Date(change.opensAt);
        const closesAt = change.closesAt === null ? null : new Date(change.closesAt);
        await repository.setAddDropPeriod(window.id, opensAt, closesAt);
        await auditLogsFor(client).record({
          actorUserId,
          action: WINDOW_AUDIT_ACTIONS.addDrop,
          entityType: WINDOW_ENTITY_TYPE,
          entityId: window.id,
          oldValue: {
            addDropOpensAt: window.summary.addDropOpensAt,
            addDropClosesAt: window.summary.addDropClosesAt,
          },
          newValue: {
            addDropOpensAt: opensAt?.toISOString() ?? null,
            addDropClosesAt: closesAt?.toISOString() ?? null,
          },
          reason: change.reason,
        });
      });
      return buildDetail();
    },

    open(actorUserId, request) {
      return changeStatus('open', actorUserId, request, async (client, window) => {
        const repository = windowsFor(client);
        const studentIds = await repository.findAllStudentUserIds();
        await notificationsFor(client).broadcast({
          userIds: studentIds,
          type: 'WINDOW_STATUS',
          title: `Registration for ${window.summary.name} is open`,
          body: `Rank up to five courses and submit before ${formatDeadline(window.summary.endsAt)}.`,
        });
      });
    },

    close(actorUserId, request) {
      return changeStatus('close', actorUserId, request);
    },
  };
}

/** "Mon 28 Sep, 10:00": the same registrar style the UI uses. */
function formatDeadline(isoDateTime: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(new Date(isoDateTime)).replace(/^(\w{3})\w*/, '$1');
}

/**
 * The database trigger refuses a frozen-policy write even if this service's
 * own check is wrong. Turn that into the same 409 rather than a 500.
 */
function rethrowFrozenPolicy(error: unknown): never {
  if (isConstraintViolation(error, PG_ERROR.OBJECT_NOT_IN_PREREQUISITE_STATE)) {
    throw new AppError(
      409,
      'The registration policy was frozen when the window opened, so it can’t be changed.',
    );
  }
  throw error;
}
