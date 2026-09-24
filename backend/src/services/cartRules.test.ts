import { MAX_PREFERENCES, type EligibilityResult } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  matchesSavedCart,
  normaliseCode,
  submissionReference,
  validateCart,
  type CartCandidate,
} from './cartRules.js';

const ELIGIBLE: EligibilityResult = { eligible: true };
const INELIGIBLE: EligibilityResult = {
  eligible: false,
  reasons: [{ type: 'SEMESTER_TOO_LOW', required: 5, actual: 3 }],
};

function offering(code: string, eligibility = ELIGIBLE): [string, CartCandidate] {
  return [code, { courseId: `id-${code}`, code, eligibility }];
}

const offered = new Map<string, CartCandidate>([
  offering('CS401'),
  offering('CS402'),
  offering('CS403'),
  offering('CS404'),
  offering('CS405'),
  offering('CS406'),
  offering('ME302', INELIGIBLE),
]);
const known = new Set([...offered.keys(), 'EC999']);

describe('validateCart', () => {
  it('ranks the codes in the order they were given', () => {
    const result = validateCart(['CS402', 'CS401'], offered, known);
    expect(result.problems).toEqual([]);
    expect(result.ranked).toEqual([
      { courseId: 'id-CS402', code: 'CS402', rank: 1 },
      { courseId: 'id-CS401', code: 'CS401', rank: 2 },
    ]);
  });

  it('accepts an empty cart, which clears the draft', () => {
    expect(validateCart([], offered, known)).toEqual({ problems: [], ranked: [] });
  });

  it('accepts exactly the maximum', () => {
    const codes = ['CS401', 'CS402', 'CS403', 'CS404', 'CS405'];
    expect(codes).toHaveLength(MAX_PREFERENCES);
    expect(validateCart(codes, offered, known).problems).toEqual([]);
  });

  it('normalises case and surrounding space', () => {
    const result = validateCart([' cs401 '], offered, known);
    expect(result.ranked).toEqual([{ courseId: 'id-CS401', code: 'CS401', rank: 1 }]);
    expect(normaliseCode(' cs401 ')).toBe('CS401');
  });

  it('rejects more than the maximum', () => {
    const codes = ['CS401', 'CS402', 'CS403', 'CS404', 'CS405', 'CS406'];
    expect(validateCart(codes, offered, known).problems).toContainEqual({
      type: 'TOO_MANY',
      max: MAX_PREFERENCES,
    });
  });

  it('rejects a repeated course', () => {
    expect(validateCart(['CS401', 'CS401'], offered, known).problems).toEqual([
      { type: 'DUPLICATE', code: 'CS401' },
    ]);
  });

  it('separates a course this window does not offer from one that does not exist', () => {
    expect(validateCart(['EC999'], offered, known).problems).toEqual([
      { type: 'NOT_OFFERED', code: 'EC999' },
    ]);
    expect(validateCart(['ZZ100'], offered, known).problems).toEqual([
      { type: 'UNKNOWN_COURSE', code: 'ZZ100' },
    ]);
  });

  it('rejects a course the student is not eligible for, and says why', () => {
    expect(validateCart(['ME302'], offered, known).problems).toEqual([
      { type: 'NOT_ELIGIBLE', code: 'ME302', eligibility: INELIGIBLE },
    ]);
  });

  it('reports every problem at once, and ranks nothing', () => {
    const result = validateCart(['ME302', 'ZZ100', 'CS401', 'CS401'], offered, known);
    expect(result.problems.map((problem) => problem.type)).toEqual([
      'NOT_ELIGIBLE',
      'UNKNOWN_COURSE',
      'DUPLICATE',
    ]);
    expect(result.ranked).toEqual([]);
  });
});

describe('matchesSavedCart', () => {
  it('is true only for the same courses in the same order', () => {
    expect(matchesSavedCart(['CS401', 'CS402'], ['CS401', 'CS402'])).toBe(true);
    expect(matchesSavedCart(['cs401', 'cs402'], ['CS401', 'CS402'])).toBe(true);
    expect(matchesSavedCart(['CS402', 'CS401'], ['CS401', 'CS402'])).toBe(false);
    expect(matchesSavedCart(['CS401'], ['CS401', 'CS402'])).toBe(false);
    expect(matchesSavedCart([], [])).toBe(true);
  });
});

describe('submissionReference', () => {
  it('is a short, stable, readable id', () => {
    expect(submissionReference('3f9a2c71-8b4d-4e2a-9f11-0c5d7a1b2e33')).toBe('REF-3F9A2C71');
  });
});
