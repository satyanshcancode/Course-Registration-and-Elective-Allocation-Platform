import type { DepartmentRef, PreferenceRank, RegistrationWindowSummary } from '@course-reg/shared';

/** The current window with its internal id (never sent to clients). */
export interface WindowRecord {
  id: string;
  summary: RegistrationWindowSummary;
}

/** A course or program reference with its internal id, used for rule checks. */
export interface IdentifiedRef {
  id: string;
  code: string;
  name: string;
}

/** Everything the catalogue needs about one offering, from a single query. */
export interface OfferingRecord {
  courseId: string;
  code: string;
  name: string;
  credits: number;
  description: string;
  minSemester: number;
  minCredits: number;
  department: DepartmentRef;
  capacity: number;
  allocated: number;
  demand: number;
  prerequisites: IdentifiedRef[];
  eligiblePrograms: IdentifiedRef[];
}

/** The caller's own relationship rows for one course (see resolveMyStatus). */
export type CourseStatusRecord =
  | { courseId: string; kind: 'DRAFT' | 'SUBMITTED'; rank: PreferenceRank }
  | { courseId: string; kind: 'ENROLLED' }
  | { courseId: string; kind: 'WAITLISTED'; position: number };
