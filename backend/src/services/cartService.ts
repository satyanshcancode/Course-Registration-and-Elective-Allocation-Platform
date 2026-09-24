import {
  canSubmitNow,
  type SubmissionWindow,
} from './registrationWindowRules.js';
import type { CartProblem, PreferenceCart, SubmissionStatus } from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { PreferenceRepository } from '../repositories/preferenceRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { OfferingRecord, WindowRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import { toEligibilityCourse } from './catalogueRules.js';
import {
  normaliseCode,
  submissionReference,
  toCartItem,
  validateCart,
  type CartCandidate,
} from './cartRules.js';
import { evaluateEligibility } from './eligibilityRules.js';

export interface CartService {
  getCart(studentId: string): Promise<PreferenceCart>;
  /** Replaces the draft cart's items; the order given becomes the ranks. */
  saveCart(studentId: string, courseCodes: readonly string[]): Promise<PreferenceCart>;
}

export interface CartServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  students: StudentRepository;
  preferences: PreferenceRepository;
  preferencesFor: (client: PoolClient) => PreferenceRepository;
  now?: () => Date;
}

/** A failure carrying the structured problems, so the UI can place each message. */
export function cartProblemError(problems: CartProblem[], statusCode = 400): AppError {
  const only = problems.length === 1 ? problems[0] : undefined;
  const message = only
    ? describeProblem(only)
    : 'Your cart can’t be saved yet. Please fix the problems listed.';
  return new AppError(statusCode, message, undefined, problems);
}

function describeProblem(problem: CartProblem): string {
  switch (problem.type) {
    case 'NOT_ELIGIBLE':
      return `You are not eligible for ${problem.code}.`;
    case 'NOT_OFFERED':
      return `${problem.code} is not offered in this registration window.`;
    case 'UNKNOWN_COURSE':
      return `There is no course with code ${problem.code}.`;
    case 'DUPLICATE':
      return `${problem.code} is already in your cart.`;
    case 'TOO_MANY':
      return `You can rank at most ${problem.max} courses.`;
    case 'WINDOW_NOT_OPEN':
      return problem.reason;
    case 'ALREADY_SUBMITTED':
      return 'Your preferences are already submitted and can no longer be changed.';
    case 'CART_CHANGED':
      return 'Your cart changed since you opened this page. Please review it and submit again.';
  }
}

/** The window as the submit rules want it, from the summary. */
export function toSubmissionWindow(window: WindowRecord): SubmissionWindow {
  return {
    status: window.summary.status,
    startsAt: new Date(window.summary.startsAt),
    endsAt: new Date(window.summary.endsAt),
  };
}

export function createCartService({
  pool,
  windows,
  catalogue,
  students,
  preferences,
  preferencesFor,
  now = () => new Date(),
}: CartServiceDependencies): CartService {
  /**
   * Every offering with this student's eligibility evaluated. The cart shows
   * live seats and re-checks eligibility on every read, because a draft saved
   * last week can go stale.
   */
  async function loadCandidates(studentId: string, windowId: string) {
    const [offerings, facts] = await Promise.all([
      catalogue.listOfferings(windowId),
      students.findEligibilityFacts(studentId),
    ]);
    if (!facts) {
      throw AppError.notFound('Student profile not found.');
    }
    const byCode = new Map<string, { offering: OfferingRecord; candidate: CartCandidate }>();
    for (const offering of offerings) {
      byCode.set(offering.code, {
        offering,
        candidate: {
          courseId: offering.courseId,
          code: offering.code,
          eligibility: evaluateEligibility(facts, toEligibilityCourse(offering)),
        },
      });
    }
    return byCode;
  }

  async function buildCart(studentId: string): Promise<PreferenceCart> {
    const serverTime = now();
    const window = await windows.findCurrent();
    if (!window) {
      return emptyCart(serverTime);
    }

    const [byCode, submission] = await Promise.all([
      loadCandidates(studentId, window.id),
      preferences.findSubmission(studentId, window.id),
    ]);
    const saved = submission ? await preferences.findItems(submission.id) : [];

    const items = saved.flatMap((item) => {
      const entry = byCode.get(item.code);
      // A course removed from the window leaves the row behind only if the
      // composite FK was cascaded; keep the cart readable either way.
      return entry ? [toCartItem(entry.offering, entry.candidate.eligibility, item.rank)] : [];
    });

    const status: SubmissionStatus = submission?.status ?? 'DRAFT';
    const gate = canSubmitNow(toSubmissionWindow(window), serverTime);
    const closed = window.summary.status === 'CLOSED' || window.summary.status === 'ALLOCATED';

    return {
      window: window.summary,
      status,
      items,
      submittedAt: submission?.submittedAt?.toISOString() ?? null,
      sequence: submission?.sequence ?? null,
      reference: submission?.status === 'SUBMITTED' ? submissionReference(submission.id) : null,
      editable: status === 'DRAFT' && !closed,
      submittable: status === 'DRAFT' && gate.allowed,
      submitBlockedReason:
        status === 'SUBMITTED'
          ? 'You have already submitted your preferences.'
          : gate.allowed
            ? null
            : gate.message,
      totalCredits: items.reduce((total, item) => total + item.credits, 0),
      serverTime: serverTime.toISOString(),
    };
  }

  function emptyCart(serverTime: Date): PreferenceCart {
    return {
      window: null,
      status: 'DRAFT',
      items: [],
      submittedAt: null,
      sequence: null,
      reference: null,
      editable: false,
      submittable: false,
      submitBlockedReason: 'There is no registration window yet.',
      totalCredits: 0,
      serverTime: serverTime.toISOString(),
    };
  }

  return {
    getCart: buildCart,

    async saveCart(studentId, courseCodes) {
      const window = await windows.findCurrent();
      if (!window) {
        throw cartProblemError([
          { type: 'WINDOW_NOT_OPEN', reason: 'There is no registration window yet.' },
        ]);
      }
      // A cart may be prepared before registration opens; it may not be
      // changed once the window has closed.
      if (window.summary.status === 'CLOSED' || window.summary.status === 'ALLOCATED') {
        throw cartProblemError([
          {
            type: 'WINDOW_NOT_OPEN',
            reason: 'Registration has closed, so your cart can no longer be changed.',
          },
        ]);
      }

      const requested = courseCodes.map(normaliseCode);
      const [byCode, existing] = await Promise.all([
        loadCandidates(studentId, window.id),
        catalogue.findExistingCodes(requested),
      ]);
      const candidates = new Map([...byCode].map(([code, entry]) => [code, entry.candidate]));
      const validation = validateCart(courseCodes, candidates, existing);
      if (validation.problems.length > 0) {
        throw cartProblemError(validation.problems);
      }

      await withTransaction(pool, async (client) => {
        const repository = preferencesFor(client);
        const submission = await repository.lockOrCreateSubmission(studentId, window.id);
        if (submission.status === 'SUBMITTED') {
          throw cartProblemError([{ type: 'ALREADY_SUBMITTED' }], 409);
        }
        await repository.replaceItems(submission.id, window.id, validation.ranked);
      });

      return buildCart(studentId);
    },
  };
}
