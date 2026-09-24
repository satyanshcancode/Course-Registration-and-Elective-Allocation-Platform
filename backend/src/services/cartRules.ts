/**
 * Pure cart rules: what a list of course codes must satisfy before it can be
 * saved or submitted. No I/O, so every rule is unit-tested directly.
 *
 * The same function validates a save and a submit. A submit re-runs it from
 * scratch against freshly read rows, because a draft saved yesterday may have
 * become invalid (a course dropped from the window, a record corrected).
 */
import {
  isOneOf,
  MAX_PREFERENCES,
  PREFERENCE_RANKS,
  type CartItem,
  type CartProblem,
  type EligibilityResult,
  type PreferenceRank,
} from '@course-reg/shared';
import type { OfferingRecord } from '../types/catalogue.js';

/** One offered course, already checked against the student. */
export interface CartCandidate {
  courseId: string;
  code: string;
  eligibility: EligibilityResult;
}

export interface CartValidation {
  problems: CartProblem[];
  /** The ranked courses, in the order given. Empty when there are problems. */
  ranked: { courseId: string; code: string; rank: PreferenceRank }[];
}

/** Codes normalise to upper case so "cs401" and "CS401" are the same course. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validates `codes` against the courses the window offers for this student.
 *
 * `offered` holds every course the window offers, keyed by code, each with the
 * student's eligibility already evaluated. A code missing from it is either
 * unknown or simply not offered this term — the caller distinguishes those.
 */
export function validateCart(
  codes: readonly string[],
  offered: ReadonlyMap<string, CartCandidate>,
  knownCourseCodes: ReadonlySet<string>,
): CartValidation {
  const problems: CartProblem[] = [];
  const normalised = codes.map(normaliseCode);

  if (normalised.length > MAX_PREFERENCES) {
    problems.push({ type: 'TOO_MANY', max: MAX_PREFERENCES });
  }

  const seen = new Set<string>();
  for (const code of normalised) {
    if (seen.has(code)) {
      problems.push({ type: 'DUPLICATE', code });
      continue;
    }
    seen.add(code);

    const candidate = offered.get(code);
    if (!candidate) {
      problems.push(
        knownCourseCodes.has(code)
          ? { type: 'NOT_OFFERED', code }
          : { type: 'UNKNOWN_COURSE', code },
      );
      continue;
    }
    if (!candidate.eligibility.eligible) {
      problems.push({ type: 'NOT_ELIGIBLE', code, eligibility: candidate.eligibility });
    }
  }

  if (problems.length > 0) {
    return { problems, ranked: [] };
  }

  return {
    problems,
    ranked: normalised.map((code, index) => {
      const candidate = offered.get(code);
      const rank = PREFERENCE_RANKS[index];
      // validateCart returned early unless every code resolved and the list
      // fits within MAX_PREFERENCES, so both lookups hold here.
      if (!candidate || rank === undefined) {
        throw new Error(`Cart validation passed but ${code} has no rank`);
      }
      return { courseId: candidate.courseId, code, rank };
    }),
  };
}

/**
 * True when the student is submitting exactly the cart that was saved, in the
 * same order. A mismatch means the cart changed in another tab or device.
 */
export function matchesSavedCart(submitted: readonly string[], saved: readonly string[]): boolean {
  const left = submitted.map(normaliseCode);
  return left.length === saved.length && left.every((code, index) => code === saved[index]);
}

/**
 * One ranked cart line, with the offering's live numbers. Used by both the
 * cart and the submission receipt, so they can never drift apart.
 */
export function toCartItem(
  offering: OfferingRecord,
  eligibility: EligibilityResult,
  rank: number,
): CartItem {
  if (!isOneOf(PREFERENCE_RANKS, rank)) {
    throw new Error(`preference_items.rank out of range: ${rank}`);
  }
  return {
    rank,
    code: offering.code,
    name: offering.name,
    credits: offering.credits,
    department: offering.department,
    capacity: offering.capacity,
    allocated: offering.allocated,
    available: offering.capacity - offering.allocated,
    demand: offering.demand,
    demandRatio:
      offering.capacity > 0 ? Math.round((offering.demand / offering.capacity) * 100) / 100 : null,
    eligibility,
  };
}

/** "REF-3F9A2C71": a short, readable receipt id derived from the submission. */
export function submissionReference(submissionId: string): string {
  return `REF-${submissionId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}
