/**
 * Administrator-facing student records.
 *
 * A student is addressed by `rollNumber`, never by the internal user id — the
 * same rule the catalogue follows with course codes. `userId` is not in any of
 * these types.
 */
import type { AcademicTerm } from '../domain/academicTerm.js';
import type { CourseRef, DepartmentRef, ProgramRef } from '../domain/refs.js';
import type { HistoryEvent, StudentStatus } from './activity.js';

/**
 * Where the account stands, which is derived rather than stored:
 * INVITED  — created, no password set yet (the invitation is outstanding)
 * ACTIVE   — password set and allowed to sign in
 * INACTIVE — deactivated; all history is kept, but sign-in is refused
 */
export const ADMIN_STUDENT_STATUSES = ['INVITED', 'ACTIVE', 'INACTIVE'] as const;
export type AdminStudentStatus = (typeof ADMIN_STUDENT_STATUSES)[number];

export interface AdminStudentListItem {
  rollNumber: string;
  name: string;
  email: string;
  program: ProgramRef;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: AcademicTerm;
  status: AdminStudentStatus;
  /** Whether an invitation is outstanding and unexpired. */
  invitationPending: boolean;
}

/** GET /api/admin/students. Defaults are left out of the query string. */
export interface AdminStudentQuery {
  search?: string;
  /** Programme code, e.g. "BTECH-CSE". */
  program?: string;
  semester?: number;
  status?: AdminStudentStatus;
  page?: number;
  pageSize?: number;
}

export const ADMIN_STUDENT_PAGE_SIZE = 20;
export const ADMIN_STUDENT_MAX_PAGE_SIZE = 100;

export interface AdminStudentPage {
  items: AdminStudentListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Every programme, for the filter and the forms. */
  programs: ProgramRef[];
}

/**
 * GET /api/admin/students/:rollNumber.
 *
 * `status` and `history` are the SAME shapes the student's own pages use, so
 * the existing `describeStanding` / `describeHistoryEvent` formatters render
 * this page too rather than growing a second set of sentences.
 */
export interface AdminStudentDetail {
  student: AdminStudentListItem;
  completedCourses: CourseRef[];
  status: StudentStatus;
  history: HistoryEvent[];
  /** When the outstanding invitation or reset link stops working. */
  invitationExpiresAt: string | null;
}

/** POST /api/admin/students. */
export interface CreateStudentRequest {
  rollNumber: string;
  name: string;
  email: string;
  /** Programme code. */
  program: string;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: AcademicTerm;
  /** Course codes the student has already passed. */
  completedCourses: string[];
}

/**
 * PATCH /api/admin/students/:rollNumber. Every field is sent, so a partial form
 * submission can never silently blank a column.
 */
export type UpdateStudentRequest = CreateStudentRequest;

export interface CreateStudentResult {
  student: AdminStudentListItem;
  /** False when the account was created but the invitation e-mail failed. */
  invitationSent: boolean;
}

/** POST /api/admin/students/:rollNumber/deactivate and .../reactivate. */
export interface StudentActivationChangeRequest {
  reason?: string;
}

/** Courses and programmes the student forms choose from. */
export interface AdminReferenceData {
  programs: ProgramRef[];
  departments: DepartmentRef[];
  courses: CourseRef[];
}
