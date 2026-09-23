/**
 * Eligibility pre-check DTOs. The check runs in any window status, including
 * DRAFT, because its whole point is to warn a student before registration
 * opens. Every value is computed server-side from the database.
 */
import type { IneligibilityReason } from '../domain/eligibility.js';
import type { IsoDateTime } from '../domain/models.js';
import type { CourseRef, DepartmentRef, ProgramRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';

/** One offered course, checked against the calling student. */
export interface CourseEligibility {
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  eligible: boolean;
  /** Empty when `eligible`. */
  reasons: IneligibilityReason[];
}

/** The student's own facts the rule used, so they can see what it judged them on. */
export interface StudentEligibilityFacts {
  program: ProgramRef;
  semester: number;
  creditsCompleted: number;
  completedCourses: CourseRef[];
}

export interface EligibilitySummary {
  eligibleCount: number;
  totalCount: number;
}

/** GET /api/eligibility. */
export interface EligibilityOverview {
  window: RegistrationWindowSummary | null;
  student: StudentEligibilityFacts;
  summary: EligibilitySummary;
  courses: CourseEligibility[];
  serverTime: IsoDateTime;
}

/** GET /api/eligibility/:code. */
export interface CourseEligibilityDetail {
  window: RegistrationWindowSummary | null;
  student: StudentEligibilityFacts;
  course: CourseEligibility;
  serverTime: IsoDateTime;
}
