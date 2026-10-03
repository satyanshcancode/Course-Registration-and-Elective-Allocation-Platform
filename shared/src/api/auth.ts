/**
 * Authentication DTOs. The session token itself never appears here: it
 * travels only in an httpOnly cookie that JavaScript cannot read.
 */
import type { AcademicTerm } from '../domain/academicTerm.js';
import type { AdminRole } from '../domain/enums.js';

export interface LoginRequest {
  email: string;
  password: string;
}

/** What a student sees about themselves in the session and profile. */
export interface StudentProfileSummary {
  name: string;
  rollNumber: string;
  program: { code: string; name: string };
  semester: number;
  creditsCompleted: number;
}

export interface StudentProfile extends StudentProfileSummary {
  userId: string;
  email: string;
  expectedGraduationTerm: AcademicTerm;
}

interface CurrentUserBase {
  id: string;
  email: string;
}

/**
 * Staff. The role is kept on the DTO rather than flattened to a boolean,
 * because the one place it matters (the Team page) must distinguish the two,
 * and every other place asks `isAdminRole` instead of comparing it.
 */
export interface CurrentAdmin extends CurrentUserBase {
  role: AdminRole;
  /** The staff member's name, or null on an account created before 0013. */
  name: string | null;
}

export interface CurrentStudent extends CurrentUserBase {
  role: 'STUDENT';
  student: StudentProfileSummary;
}

/** Response of POST /api/auth/login and GET /api/auth/me, narrowed on `role`. */
export type CurrentUser = CurrentAdmin | CurrentStudent;

/** Response of GET /api/admin/ping. */
export interface AdminPing {
  status: 'ok';
  adminId: string;
}

/** GET /api/students/me/notifications/unread-count. */
export interface UnreadNotificationCount {
  unread: number;
}
