import { DEFAULT_PREFERENCE_PRIORITY_CONFIG, FCFS_CONFIG } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  firstIncreasingRank,
  fromDateTimeLocal,
  hasWindowErrors,
  policyForMethod,
  toDateTimeLocal,
  validateWindowForm,
  withPriorityPoint,
  withWeight,
  type WindowFormValues,
} from './windowForm';

function values(overrides: Partial<WindowFormValues> = {}): WindowFormValues {
  return {
    name: 'Fall 2026',
    term: '2026-FALL',
    startsAt: '2026-09-21T10:00',
    endsAt: '2026-10-05T18:00',
    courseCodes: ['CS401'],
    policy: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    randomSeed: 2026091801,
    ...overrides,
  };
}

describe('datetime-local conversion', () => {
  it('round-trips an instant through the input format', () => {
    const local = toDateTimeLocal('2026-09-21T10:00:00.000Z');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocal(local)).toBe('2026-09-21T10:00:00.000Z');
  });

  it('is empty for an unusable value', () => {
    expect(toDateTimeLocal('not a date')).toBe('');
    expect(fromDateTimeLocal('')).toBe('');
  });
});

describe('policyForMethod', () => {
  it('swaps in the defaults of the other method, and keeps the current one', () => {
    expect(policyForMethod('FCFS', DEFAULT_PREFERENCE_PRIORITY_CONFIG)).toEqual(FCFS_CONFIG);
    expect(policyForMethod('PREFERENCE_PRIORITY', FCFS_CONFIG)).toEqual(
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    );
    const edited = withWeight(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 1, 90);
    expect(policyForMethod('PREFERENCE_PRIORITY', edited)).toBe(edited);
  });

  it('leaves FCFS alone when a weight or bonus is set on it', () => {
    expect(withWeight(FCFS_CONFIG, 1, 50)).toEqual(FCFS_CONFIG);
    expect(withPriorityPoint(FCFS_CONFIG, 'finalYear', 50)).toEqual(FCFS_CONFIG);
  });
});

describe('firstIncreasingRank', () => {
  it('finds the first rank worth more than the one above it', () => {
    expect(firstIncreasingRank(DEFAULT_PREFERENCE_PRIORITY_CONFIG)).toBeNull();
    expect(firstIncreasingRank(FCFS_CONFIG)).toBeNull();
    expect(firstIncreasingRank(withWeight(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 1, 50))).toBe(2);
    expect(firstIncreasingRank(withWeight(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 4, 70))).toBe(4);
  });
});

describe('validateWindowForm', () => {
  it('accepts a complete draft', () => {
    expect(validateWindowForm(values())).toEqual({});
    expect(hasWindowErrors({})).toBe(false);
  });

  it('requires a name, a valid term and at least one course', () => {
    const errors = validateWindowForm(values({ name: 'Fa', term: '2026-WINTER', courseCodes: [] }));
    expect(errors.name).toMatch(/at least 3/);
    expect(errors.term).toMatch(/2026-FALL/);
    expect(errors.courseCodes).toMatch(/at least one course/);
    expect(hasWindowErrors(errors)).toBe(true);
  });

  it('requires the closing time to be after the opening one', () => {
    expect(validateWindowForm(values({ endsAt: '2026-09-20T18:00' })).endsAt).toBe(
      'Registration must close after it opens.',
    );
    expect(validateWindowForm(values({ endsAt: values().startsAt })).endsAt).toBeDefined();
    expect(validateWindowForm(values({ startsAt: '' })).startsAt).toBeDefined();
  });

  it('rejects weights outside 0–100 and weights that increase', () => {
    expect(
      validateWindowForm(values({ policy: withWeight(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 1, 150) }))
        .policy,
    ).toMatch(/between 0 and 100/);
    expect(
      validateWindowForm(values({ policy: withWeight(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 1, 50) }))
        .policy,
    ).toMatch(/P2 can’t be worth more than P1/);
  });

  it('rejects a priority bonus outside 0–100', () => {
    const policy = withPriorityPoint(DEFAULT_PREFERENCE_PRIORITY_CONFIG, 'finalYear', 400);
    expect(validateWindowForm(values({ policy })).policy).toMatch(/priority bonus/);
  });

  it('checks no weights at all for FCFS', () => {
    expect(validateWindowForm(values({ policy: FCFS_CONFIG })).policy).toBeUndefined();
  });

  it('rejects a seed outside the range the database accepts', () => {
    expect(validateWindowForm(values({ randomSeed: -1 })).randomSeed).toBeDefined();
    expect(validateWindowForm(values({ randomSeed: 4_294_967_296 })).randomSeed).toBeDefined();
    expect(validateWindowForm(values({ randomSeed: 0 })).randomSeed).toBeUndefined();
  });
});
