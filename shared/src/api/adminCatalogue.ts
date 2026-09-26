/**
 * Administrator-facing course records — the catalogue itself, as opposed to the
 * offerings of one registration window (see `AdminCourseOffering` in
 * ./courses.ts, which carries seats and demand).
 *
 * Courses are addressed by `code`; internal ids never leave the server.
 */
import type { CourseRef, DepartmentRef, ProgramRef } from '../domain/refs.js';
import type { RegistrationWindowStatus } from '../domain/enums.js';

/** Where a course is already offered, which is what decides if it can retire. */
export interface CourseWindowUse {
  windowName: string;
  status: RegistrationWindowStatus;
}

export interface AdminCourseRecord {
  code: string;
  name: string;
  credits: number;
  department: DepartmentRef;
  description: string;
  minSemester: number;
  minCredits: number;
  prerequisites: CourseRef[];
  /** Programmes allowed to take it; empty means every programme. */
  eligiblePrograms: ProgramRef[];
  /** Programmes whose students get the priority bonus. */
  relevantPrograms: ProgramRef[];
  isActive: boolean;
  offeredIn: CourseWindowUse[];
  /**
   * False when a window that is OPEN or later offers it: retiring it then would
   * change what students are registering for. The server re-checks this.
   */
  canDeactivate: boolean;
}

export interface AdminCatalogue {
  courses: AdminCourseRecord[];
  /** Everything the create/edit form chooses from. */
  departments: DepartmentRef[];
  programs: ProgramRef[];
}

/** POST /api/admin/course-catalogue. */
export interface CreateCourseRequest {
  code: string;
  name: string;
  credits: number;
  /** Department code. */
  department: string;
  description: string;
  minSemester: number;
  minCredits: number;
  /** Course codes that must be passed first. */
  prerequisites: string[];
  /** Programme codes; empty means open to every programme. */
  eligiblePrograms: string[];
  /** Programme codes that earn the relevance bonus. */
  relevantPrograms: string[];
}

/** PATCH /api/admin/course-catalogue/:code. The code itself cannot change. */
export type UpdateCourseRequest = Omit<CreateCourseRequest, 'code'>;

export interface CourseActivationChangeRequest {
  reason?: string;
}

export const COURSE_DESCRIPTION_MAX_LENGTH = 2000;
export const COURSE_NAME_MAX_LENGTH = 120;
