/**
 * The atomic submit.
 *
 * Submitting does not take a seat — allocation runs later, as a batch — so the
 * guarantees here are: exactly one submission per student per window, never a
 * partial one, a retry with the same key is free, and the arrival order comes
 * from a database sequence rather than any clock the client controls.
 *
 * Everything below step 1 happens inside ONE transaction. Any throw rolls the
 * whole thing back, which is what the fault-injection test proves.
 */
import type { SubmissionReceipt } from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { PreferenceRepository } from '../repositories/preferenceRepository.js';
import type { RegistrationHistoryRepository } from '../repositories/registrationHistoryRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import { AppError } from '../utils/appError.js';
import { injectFault } from '../utils/faultInjection.js';
import { toEligibilityCourse } from './catalogueRules.js';
import { cartProblemError } from './cartService.js';
import {
  matchesSavedCart,
  submissionReference,
  toCartItem,
  validateCart,
  type CartCandidate,
} from './cartRules.js';
import { evaluateEligibility } from './eligibilityRules.js';
import { canSubmitNow } from './registrationWindowRules.js';

/** Fault points a test can arm; see utils/faultInjection.ts. */
export const FAULT_AFTER_MARK_SUBMITTED = 'submit.afterMarkSubmitted';

export interface SubmitService {
  submit(
    studentId: string,
    idempotencyKey: string,
    courseCodes: readonly string[],
  ): Promise<SubmissionReceipt>;
  /** The student's submission for the receipt page. */
  getStatus(studentId: string): Promise<SubmissionReceipt | null>;
}

export interface SubmitServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  students: StudentRepository;
  preferences: PreferenceRepository;
  /**
   * Repositories bound to the transaction's own client. Everything read
   * inside the transaction MUST use these: asking the pool for a second
   * client while holding one deadlocks as soon as the pool is saturated.
   */
  preferencesFor: (client: PoolClient) => PreferenceRepository;
  catalogueFor: (client: PoolClient) => CourseCatalogueRepository;
  studentsFor: (client: PoolClient) => StudentRepository;
  historyFor: (client: PoolClient) => RegistrationHistoryRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  now?: () => Date;
}

export function createSubmitService({
  pool,
  windows,
  catalogue,
  students,
  preferences,
  preferencesFor,
  catalogueFor,
  studentsFor,
  historyFor,
  notificationsFor,
  now = () => new Date(),
}: SubmitServiceDependencies): SubmitService {
  /**
   * Re-derives eligibility from the database; the saved draft is never
   * trusted. `courses` and `profiles` are the caller's repositories, so a
   * transaction passes its own client-bound ones.
   */
  async function loadCandidates(
    studentId: string,
    windowId: string,
    courses: CourseCatalogueRepository,
    profiles: StudentRepository,
  ) {
    // Sequential, not Promise.all: the transaction passes its OWN client-bound
    // repositories, and one pg client cannot run two queries at once (it is
    // deprecated today and an error from pg@9).
    const offerings = await courses.listOfferings(windowId);
    const facts = await profiles.findEligibilityFacts(studentId);
    if (!facts) {
      throw AppError.notFound('Student profile not found.');
    }
    return new Map<string, CartCandidate>(
      offerings.map((offering) => [
        offering.code,
        {
          courseId: offering.courseId,
          code: offering.code,
          eligibility: evaluateEligibility(facts, toEligibilityCourse(offering)),
        },
      ]),
    );
  }

  async function buildReceipt(
    studentId: string,
    windowId: string,
    submissionId: string,
    submittedAt: Date,
    sequence: number,
  ): Promise<SubmissionReceipt> {
    const [window, offerings, items] = await Promise.all([
      windows.findCurrent(),
      catalogue.listOfferings(windowId),
      preferences.findItems(submissionId),
    ]);
    if (!window) {
      throw AppError.notFound('There is no registration window yet.');
    }
    const byCode = new Map(offerings.map((offering) => [offering.code, offering]));
    const facts = await students.findEligibilityFacts(studentId);

    const receiptItems = items.flatMap((item) => {
      const offering = byCode.get(item.code);
      if (!offering || !facts) {
        return [];
      }
      return [
        toCartItem(offering, evaluateEligibility(facts, toEligibilityCourse(offering)), item.rank),
      ];
    });

    return {
      window: window.summary,
      reference: submissionReference(submissionId),
      submittedAt: submittedAt.toISOString(),
      sequence,
      items: receiptItems,
      totalCredits: receiptItems.reduce((total, item) => total + item.credits, 0),
      serverTime: now().toISOString(),
    };
  }

  return {
    async submit(studentId, idempotencyKey, courseCodes) {
      const current = await windows.findCurrent();
      if (!current) {
        throw cartProblemError(
          [{ type: 'WINDOW_NOT_OPEN', reason: 'There is no registration window yet.' }],
          409,
        );
      }

      const result = await withTransaction(pool, async (client) => {
        const repository = preferencesFor(client);

        // 1. The window, locked FOR SHARE so it cannot close underneath us.
        const window = await repository.lockWindowForShare(current.id);
        const gate = canSubmitNow(window, now());
        if (!gate.allowed) {
          throw cartProblemError([{ type: 'WINDOW_NOT_OPEN', reason: gate.message }], 409);
        }

        // 2. The student's own cart row, locked FOR UPDATE (created if new).
        const submission = await repository.lockOrCreateSubmission(studentId, current.id);
        const saved = await repository.findItems(submission.id);
        const savedCodes = saved.map((item) => item.code);

        // 3. Idempotency: the same key and the same cart replays the original.
        if (submission.status === 'SUBMITTED') {
          const sameKey = submission.idempotencyKey === idempotencyKey;
          if (sameKey && matchesSavedCart(courseCodes, savedCodes)) {
            return {
              submissionId: submission.id,
              submittedAt: submission.submittedAt ?? now(),
              sequence: submission.sequence ?? 0,
              replayed: true,
            };
          }
          if (sameKey) {
            throw cartProblemError([{ type: 'CART_CHANGED' }], 409);
          }
          throw cartProblemError([{ type: 'ALREADY_SUBMITTED' }], 409);
        }

        // 4. Re-validate from scratch against freshly read rows, using this
        //    transaction's client throughout.
        const requested = [...courseCodes];
        const transactionCatalogue = catalogueFor(client);
        const candidates = await loadCandidates(
          studentId,
          current.id,
          transactionCatalogue,
          studentsFor(client),
        );
        const existing = await transactionCatalogue.findExistingCodes(requested);
        const validation = validateCart(requested, candidates, existing);
        if (validation.problems.length > 0) {
          throw cartProblemError(validation.problems, 409);
        }
        if (validation.ranked.length === 0) {
          throw new AppError(409, 'Add at least one course to your cart before submitting.');
        }

        // 5. The cart being submitted must be the cart that was saved.
        if (!matchesSavedCart(requested, savedCodes)) {
          throw cartProblemError([{ type: 'CART_CHANGED' }], 409);
        }

        // 6. Mark it submitted: the server's clock and the next sequence value.
        const submittedAt = now();
        const sequence = await repository.markSubmitted(submission.id, idempotencyKey, submittedAt);

        // Test-only: proves the rollback below leaves nothing behind.
        injectFault(FAULT_AFTER_MARK_SUBMITTED);

        // 7. The student's timeline and their confirmation message.
        await historyFor(client).record({
          studentId,
          windowId: current.id,
          eventType: 'SUBMITTED',
          details: { reference: submissionReference(submission.id), courseCodes: savedCodes },
        });
        await notificationsFor(client).broadcast({
          userIds: [studentId],
          type: 'SYSTEM',
          title: `We received your ${savedCodes.length} preference${savedCodes.length === 1 ? '' : 's'} for ${current.summary.name}`,
          body: `Allocation runs after registration closes. Your reference is ${submissionReference(submission.id)}.`,
        });

        return {
          submissionId: submission.id,
          submittedAt,
          sequence,
          replayed: false,
        };
      }).catch(rethrowDuplicateKey);

      return buildReceipt(
        studentId,
        current.id,
        result.submissionId,
        result.submittedAt,
        result.sequence,
      );
    },

    async getStatus(studentId) {
      const window = await windows.findCurrent();
      if (!window) {
        return null;
      }
      const submission = await preferences.findSubmission(studentId, window.id);
      if (submission?.status !== 'SUBMITTED' || !submission.submittedAt) {
        return null;
      }
      return buildReceipt(
        studentId,
        window.id,
        submission.id,
        submission.submittedAt,
        submission.sequence ?? 0,
      );
    },
  };
}

/**
 * The idempotency key is unique across the whole table. Two students picking
 * the same UUID is vanishingly unlikely, but the constraint is the last line
 * of defence, so turn it into a clear 409 rather than a 500.
 */
function rethrowDuplicateKey(error: unknown): never {
  if (
    isConstraintViolation(
      error,
      PG_ERROR.UNIQUE_VIOLATION,
      'preference_submissions_idempotency_key_key',
    )
  ) {
    throw new AppError(409, 'That idempotency key has already been used. Use a new key.');
  }
  throw error;
}
