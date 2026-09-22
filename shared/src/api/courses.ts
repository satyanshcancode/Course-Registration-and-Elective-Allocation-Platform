/**
 * Course catalogue DTOs: the current registration window, catalogue pages,
 * course detail, live seat snapshots and admin capacity editing.
 *
 * Courses are addressed by their public `code` (e.g. "CS401"); database ids
 * never leave the server.
 */
import type { AcademicTerm } from '../domain/academicTerm.js';
import type { IneligibilityReason } from '../domain/eligibility.js';
import type { PreferenceRank, RegistrationWindowStatus } from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';

// ---------------------------------------------------------------------------
// Registration window
// ---------------------------------------------------------------------------

export interface RegistrationWindowSummary {
  name: string;
  term: AcademicTerm;
  status: RegistrationWindowStatus;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
}

/**
 * GET /api/registration-windows/current. `serverTime` lets the UI say "Opens
 * in 2 days" from the server's clock instead of trusting the device clock.
 */
export interface CurrentWindowResponse {
  /** The OPEN window, otherwise the most recent one; null if none exists. */
  window: RegistrationWindowSummary | null;
  serverTime: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Catalogue query
// ---------------------------------------------------------------------------

export const COURSE_SORT_KEYS = ['code', 'name', 'available', 'demand', 'demandRatio'] as const;
export type CourseSortKey = (typeof COURSE_SORT_KEYS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Direction used when a sort key is chosen without an explicit order. */
export const DEFAULT_SORT_ORDER: Readonly<Record<CourseSortKey, SortOrder>> = {
  code: 'asc',
  name: 'asc',
  available: 'desc',
  demand: 'desc',
  demandRatio: 'desc',
};

export const CATALOGUE_PAGE_SIZE = { default: 12, max: 48 } as const;

/** GET /api/courses query parameters, after validation. */
export interface CatalogueQuery {
  /** Matches code or name, case-insensitively. */
  search?: string;
  /** Department code, e.g. "CSE". */
  department?: string;
  credits?: number;
  onlyAvailable?: boolean;
  /** Students only; ignored for admins. */
  onlyEligible?: boolean;
  sort?: CourseSortKey;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Catalogue items
// ---------------------------------------------------------------------------

export interface CourseRef {
  code: string;
  name: string;
}

export interface DepartmentRef {
  code: string;
  name: string;
}

export interface ProgramRef {
  code: string;
  name: string;
}

/** The live numbers of one offering; also the item type of the seats endpoint. */
export interface CourseSeats {
  code: string;
  capacity: number;
  /** Seats already held (ACTIVE enrollments). */
  allocated: number;
  available: number;
  /** SUBMITTED preference items for this course in the window. */
  demand: number;
}

/** Eligibility as sent to the UI: missing prerequisites by code and name. */
export type CourseIneligibilityReason =
  | Exclude<IneligibilityReason, { code: 'MISSING_PREREQUISITES' }>
  | { code: 'MISSING_PREREQUISITES'; missingCourses: CourseRef[] };

export type CourseEligibility =
  { eligible: true } | { eligible: false; reasons: CourseIneligibilityReason[] };

/** The signed-in student's relationship to a course. */
export type MyCourseStatus =
  | { code: 'NOT_SELECTED' }
  | { code: 'IN_DRAFT_CART'; rank: PreferenceRank }
  | { code: 'SUBMITTED'; rank: PreferenceRank }
  | { code: 'ENROLLED' }
  /** Place in line among students still waiting (1 = next). */
  | { code: 'WAITLISTED'; position: number };

export type MyCourseStatusCode = MyCourseStatus['code'];

/** Fields computed for the calling student only. */
export interface StudentCourseContext {
  eligibility: CourseEligibility;
  myStatus: MyCourseStatus;
}

export interface CatalogueCourse extends CourseSeats {
  name: string;
  credits: number;
  department: DepartmentRef;
  /** First sentence of the description. */
  shortDescription: string;
  /** demand ÷ capacity, 2 decimals; null when capacity is 0. */
  demandRatio: number | null;
  prerequisites: CourseRef[];
  /** Empty means open to every program. */
  eligiblePrograms: ProgramRef[];
  /** Null for admins: they have no eligibility or cart of their own. */
  personal: StudentCourseContext | null;
}

/** Values the filter controls can offer, drawn from the whole window. */
export interface CatalogueFilterOptions {
  departments: DepartmentRef[];
  credits: number[];
}

/** GET /api/courses. */
export interface CataloguePage {
  window: RegistrationWindowSummary | null;
  items: CatalogueCourse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  filterOptions: CatalogueFilterOptions;
  serverTime: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Course detail
// ---------------------------------------------------------------------------

export interface PrerequisiteStatus extends CourseRef {
  /** Whether the calling student has passed it; null for admins. */
  met: boolean | null;
}

/** GET /api/courses/:code. */
export interface CourseDetail extends Omit<CatalogueCourse, 'prerequisites'> {
  description: string;
  minSemester: number;
  minCredits: number;
  prerequisites: PrerequisiteStatus[];
  window: RegistrationWindowSummary;
}

// ---------------------------------------------------------------------------
// Live seats
// ---------------------------------------------------------------------------

/**
 * GET /api/courses/seats. `version` is also sent as the ETag; a request with a
 * matching If-None-Match gets 304 Not Modified and no body.
 */
export interface SeatSnapshot {
  version: string;
  serverTime: IsoDateTime;
  courses: CourseSeats[];
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminCourseOffering extends CourseSeats {
  name: string;
  credits: number;
  department: DepartmentRef;
  demandRatio: number | null;
  /** More submitted requests than seats. */
  oversubscribed: boolean;
}

/** GET /api/admin/courses. */
export interface AdminCourseList {
  window: RegistrationWindowSummary | null;
  items: AdminCourseOffering[];
}

export const CAPACITY_LIMITS = { min: 0, max: 1000 } as const;
export const CAPACITY_REASON_LENGTH = { min: 5, max: 500 } as const;

/** PATCH /api/admin/courses/:code/capacity. */
export interface UpdateCapacityRequest {
  capacity: number;
  reason: string;
}
