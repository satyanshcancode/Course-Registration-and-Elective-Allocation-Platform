import type { CatalogueCourse } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import type { OfferingRecord } from '../types/catalogue.js';
import {
  compareCourses,
  demandRatio,
  filterOptions,
  groupStatusesByCourse,
  matchesFilters,
  paginate,
  resolveMyStatus,
  shortDescription,
} from './catalogueRules.js';

function course(overrides: Partial<CatalogueCourse> = {}): CatalogueCourse {
  return {
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    shortDescription: '',
    capacity: 20,
    allocated: 5,
    available: 15,
    demand: 114,
    demandRatio: 5.7,
    prerequisites: [],
    eligiblePrograms: [],
    personal: null,
    ...overrides,
  };
}

function offering(overrides: Partial<OfferingRecord> = {}): OfferingRecord {
  return {
    courseId: 'c-ai',
    code: 'CS401',
    name: 'Artificial Intelligence',
    credits: 4,
    description: '',
    minSemester: 5,
    minCredits: 80,
    department: { code: 'CSE', name: 'Computer Science and Engineering' },
    capacity: 20,
    allocated: 0,
    demand: 0,
    prerequisites: [
      { id: 'c-ds', code: 'CS201', name: 'Data Structures' },
      { id: 'c-ps', code: 'MA201', name: 'Probability' },
    ],
    eligiblePrograms: [],
    ...overrides,
  };
}

describe('demandRatio', () => {
  it('divides demand by capacity, rounded to 2 decimals', () => {
    expect(demandRatio(114, 20)).toBe(5.7);
    expect(demandRatio(71, 30)).toBe(2.37);
    expect(demandRatio(0, 40)).toBe(0);
  });

  it('is null when there are no seats, instead of Infinity or NaN', () => {
    expect(demandRatio(5, 0)).toBeNull();
    expect(demandRatio(0, 0)).toBeNull();
  });
});

describe('shortDescription', () => {
  it('keeps the first sentence only', () => {
    expect(shortDescription('Search and planning. Four assignments.')).toBe('Search and planning.');
  });

  it('keeps text without a sentence end, and ignores dots inside words', () => {
    expect(shortDescription('Intro to Node.js tooling')).toBe('Intro to Node.js tooling');
  });
});

describe('resolveMyStatus', () => {
  it('is NOT_SELECTED without records', () => {
    expect(resolveMyStatus([])).toEqual({ code: 'NOT_SELECTED' });
  });

  it('prefers a held seat, then a waitlist place, then a submitted rank, then a draft', () => {
    const draft = { courseId: 'c', kind: 'DRAFT', rank: 2 } as const;
    const submitted = { courseId: 'c', kind: 'SUBMITTED', rank: 1 } as const;
    const waitlisted = { courseId: 'c', kind: 'WAITLISTED', position: 7 } as const;
    const enrolled = { courseId: 'c', kind: 'ENROLLED' } as const;

    expect(resolveMyStatus([draft])).toEqual({ code: 'IN_DRAFT_CART', rank: 2 });
    expect(resolveMyStatus([draft, submitted])).toEqual({ code: 'SUBMITTED', rank: 1 });
    expect(resolveMyStatus([submitted, waitlisted])).toEqual({ code: 'WAITLISTED', position: 7 });
    expect(resolveMyStatus([waitlisted, enrolled, submitted])).toEqual({ code: 'ENROLLED' });
  });

  it('groups records per course', () => {
    const groups = groupStatusesByCourse([
      { courseId: 'a', kind: 'ENROLLED' },
      { courseId: 'b', kind: 'DRAFT', rank: 1 },
      { courseId: 'a', kind: 'SUBMITTED', rank: 3 },
    ]);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
  });
});

describe('matchesFilters', () => {
  const ai = course();

  it('searches code and name case-insensitively', () => {
    expect(matchesFilters(ai, { search: 'cs40' })).toBe(true);
    expect(matchesFilters(ai, { search: 'INTELLIGENCE' })).toBe(true);
    expect(matchesFilters(ai, { search: 'robotics' })).toBe(false);
  });

  it('filters by department, credits and seats left', () => {
    expect(matchesFilters(ai, { department: 'CSE' })).toBe(true);
    expect(matchesFilters(ai, { department: 'ME' })).toBe(false);
    expect(matchesFilters(ai, { credits: 3 })).toBe(false);
    expect(matchesFilters(course({ available: 0 }), { onlyAvailable: true })).toBe(false);
  });

  it('applies the eligibility filter to students only', () => {
    const ineligible = course({
      personal: {
        eligibility: {
          eligible: false,
          reasons: [
            {
              type: 'PROGRAM_NOT_ALLOWED',
              program: { code: 'ME', name: 'Mechanical' },
              allowedPrograms: [{ code: 'CSE', name: 'Computer Science' }],
            },
          ],
        },
        myStatus: { code: 'NOT_SELECTED' },
      },
    });
    expect(matchesFilters(ineligible, { onlyEligible: true })).toBe(false);
    // Admins have no personal fields: the filter is ignored.
    expect(matchesFilters(ai, { onlyEligible: true })).toBe(true);
  });
});

describe('compareCourses', () => {
  const courses = [
    course({ code: 'B', name: 'Beta', demand: 10, available: 3, demandRatio: 0.5 }),
    course({ code: 'A', name: 'Gamma', demand: 10, available: 9, demandRatio: null }),
    course({ code: 'C', name: 'Alpha', demand: 40, available: 0, demandRatio: 2 }),
  ];
  const codes = (sorted: CatalogueCourse[]) => sorted.map((c) => c.code);

  it('uses a sensible default direction per key and breaks ties by code', () => {
    expect(codes([...courses].sort(compareCourses('code')))).toEqual(['A', 'B', 'C']);
    expect(codes([...courses].sort(compareCourses('name')))).toEqual(['C', 'B', 'A']);
    expect(codes([...courses].sort(compareCourses('demand')))).toEqual(['C', 'A', 'B']);
    expect(codes([...courses].sort(compareCourses('available', 'asc')))).toEqual(['C', 'B', 'A']);
  });

  it('puts courses without a ratio last in either direction', () => {
    expect(codes([...courses].sort(compareCourses('demandRatio')))).toEqual(['C', 'B', 'A']);
    expect(codes([...courses].sort(compareCourses('demandRatio', 'asc')))).toEqual(['B', 'C', 'A']);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index);

  it('slices a page and reports totals', () => {
    expect(paginate(items, 3, 10)).toEqual({
      items: [20, 21, 22, 23, 24],
      page: 3,
      totalItems: 25,
      totalPages: 3,
    });
  });

  it('returns an empty page past the end, and one page for no items', () => {
    expect(paginate(items, 9, 10).items).toEqual([]);
    expect(paginate([], 1, 10).totalPages).toBe(1);
  });
});

describe('filterOptions', () => {
  it('lists each department once (by name) and the distinct credit values', () => {
    const options = filterOptions([
      offering({ department: { code: 'ME', name: 'Mechanical' }, credits: 3 }),
      offering({ credits: 4 }),
      offering({ credits: 3 }),
    ]);
    expect(options.departments.map((d) => d.code)).toEqual(['CSE', 'ME']);
    expect(options.credits).toEqual([3, 4]);
  });
});
