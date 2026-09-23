/**
 * Pure catalogue logic: derived numbers, personal status, filtering, sorting
 * and paging. No I/O, so every rule is unit-tested directly.
 */
import {
  DEFAULT_SORT_ORDER,
  type CatalogueCourse,
  type CatalogueFilterOptions,
  type CatalogueQuery,
  type CourseSortKey,
  type DepartmentRef,
  type MyCourseStatus,
  type SortOrder,
} from '@course-reg/shared';
import type { CourseStatusRecord, OfferingRecord } from '../types/catalogue.js';
import type { EligibilityCourse } from './eligibilityRules.js';

/** demand ÷ capacity rounded to 2 decimals; null when there are no seats at all. */
export function demandRatio(demand: number, capacity: number): number | null {
  if (capacity <= 0) {
    return null;
  }
  return Math.round((demand / capacity) * 100) / 100;
}

/** The first sentence, for cards; the detail page shows the full text. */
export function shortDescription(description: string): string {
  const trimmed = description.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

/** The shape evaluateEligibility expects, from an offering record. */
export function toEligibilityCourse(offering: OfferingRecord): EligibilityCourse {
  return {
    id: offering.courseId,
    minSemester: offering.minSemester,
    minCredits: offering.minCredits,
    eligiblePrograms: offering.eligiblePrograms,
    prerequisites: offering.prerequisites,
  };
}

/** Most definite first: a held seat beats a waitlist place beats a cart rank. */
const STATUS_PRECEDENCE: readonly CourseStatusRecord['kind'][] = [
  'ENROLLED',
  'WAITLISTED',
  'SUBMITTED',
  'DRAFT',
];

/** Picks the student's single status for a course from their own records. */
export function resolveMyStatus(records: readonly CourseStatusRecord[]): MyCourseStatus {
  const precedence = (record: CourseStatusRecord) => STATUS_PRECEDENCE.indexOf(record.kind);
  const strongest = [...records].sort((a, b) => precedence(a) - precedence(b))[0];
  if (!strongest) {
    return { code: 'NOT_SELECTED' };
  }
  switch (strongest.kind) {
    case 'ENROLLED':
      return { code: 'ENROLLED' };
    case 'WAITLISTED':
      return { code: 'WAITLISTED', position: strongest.position };
    case 'SUBMITTED':
      return { code: 'SUBMITTED', rank: strongest.rank };
    case 'DRAFT':
      return { code: 'IN_DRAFT_CART', rank: strongest.rank };
  }
}

/** Groups status records by course id, so each course looks up its own. */
export function groupStatusesByCourse(
  records: readonly CourseStatusRecord[],
): Map<string, CourseStatusRecord[]> {
  return records.reduce((groups, record) => {
    const group = groups.get(record.courseId) ?? [];
    group.push(record);
    return groups.set(record.courseId, group);
  }, new Map<string, CourseStatusRecord[]>());
}

/** True when the course passes every filter in the query. */
export function matchesFilters(course: CatalogueCourse, query: CatalogueQuery): boolean {
  const search = query.search?.trim().toLowerCase();
  if (
    search &&
    !course.code.toLowerCase().includes(search) &&
    !course.name.toLowerCase().includes(search)
  ) {
    return false;
  }
  if (query.department !== undefined && course.department.code !== query.department) {
    return false;
  }
  if (query.credits !== undefined && course.credits !== query.credits) {
    return false;
  }
  if (query.onlyAvailable === true && course.available <= 0) {
    return false;
  }
  // Admins have no personal context, so the eligibility filter doesn't apply to them.
  if (query.onlyEligible === true && course.personal && !course.personal.eligibility.eligible) {
    return false;
  }
  return true;
}

type Comparator = (a: CatalogueCourse, b: CatalogueCourse) => number;

const compareByKey: Readonly<Record<CourseSortKey, Comparator>> = {
  code: (a, b) => a.code.localeCompare(b.code),
  name: (a, b) => a.name.localeCompare(b.name),
  available: (a, b) => a.available - b.available,
  demand: (a, b) => a.demand - b.demand,
  demandRatio: (a, b) => (a.demandRatio ?? 0) - (b.demandRatio ?? 0),
};

/**
 * Sorts by `sort` in `order` (default per key), then by code so equal values
 * keep a stable, predictable order. Courses without a ratio (no seats) always
 * go last when sorting by ratio.
 */
export function compareCourses(sort: CourseSortKey, order?: SortOrder): Comparator {
  const direction = (order ?? DEFAULT_SORT_ORDER[sort]) === 'asc' ? 1 : -1;
  return (a, b) => {
    if (sort === 'demandRatio' && (a.demandRatio === null) !== (b.demandRatio === null)) {
      return a.demandRatio === null ? 1 : -1;
    }
    return direction * compareByKey[sort](a, b) || a.code.localeCompare(b.code);
  };
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  totalItems: number;
  totalPages: number;
}

/** One page of `items`. A page past the end is empty rather than an error. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

/** Departments and credit values offered in the window, for the filter selects. */
export function filterOptions(offerings: readonly OfferingRecord[]): CatalogueFilterOptions {
  const departments = new Map<string, DepartmentRef>();
  offerings.forEach((offering) => departments.set(offering.department.code, offering.department));
  return {
    departments: [...departments.values()].sort((a, b) => a.name.localeCompare(b.name)),
    credits: [...new Set(offerings.map((offering) => offering.credits))].sort((a, b) => a - b),
  };
}
