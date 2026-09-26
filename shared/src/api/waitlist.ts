/**
 * Waitlist DTOs: what a student is waiting for, what an admin sees on one
 * course, and what a seat-freeing action set off.
 *
 * Positions shown to a student are LIVE — a rank among the entries still
 * WAITING — not the stored position, which is never renumbered. Two students
 * at stored positions 3 and 7 with everyone between them promoted are shown as
 * #1 and #2.
 */
import type {
  EnrollmentDropReason,
  EnrollmentSource,
  PreferenceRank,
  WaitlistRemovalReason,
  WaitlistStatus,
} from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { CourseRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';

/** One entry on the student's own waitlist page. */
export interface StudentWaitlistEntry {
  course: CourseRef;
  /** Null for a queue joined during add/drop: the course was never ranked. */
  preferenceRank: PreferenceRank | null;
  status: WaitlistStatus;
  /** Rank among those still waiting, 1-based; null once the entry has ended. */
  position: number | null;
  /** How many students are waiting on this course right now. */
  waiting: number;
  capacity: number;
  allocated: number;
  /** The student's own score for this course; 0 when the method does not score. */
  score: number;
  reason: WaitlistRemovalReason | null;
  endedAt: IsoDateTime | null;
}

/** GET /api/students/me/waitlist — the caller's own queues, nobody else's. */
export interface StudentWaitlist {
  window: RegistrationWindowSummary | null;
  /**
   * The seat they hold now, so "what happens next" can name it. `rank` is null
   * for a seat taken during add/drop, which was never ranked — and which any
   * course they DID rank still improves on.
   */
  held: { course: CourseRef; rank: PreferenceRank | null } | null;
  waiting: StudentWaitlistEntry[];
  /** Entries that ended: promoted, or removed with a reason. */
  ended: StudentWaitlistEntry[];
  serverTime: IsoDateTime;
}

/** A student named to an admin. Never sent to another student. */
export interface WaitlistStudentRef {
  name: string;
  email: string;
  program: string;
  semester: number;
}

export interface EnrolledStudentRow {
  enrollmentId: string;
  student: WaitlistStudentRef;
  source: EnrollmentSource;
  /** Which of their preferences this course was, if they ranked it. */
  preferenceRank: PreferenceRank | null;
  enrolledAt: IsoDateTime;
}

export interface WaitingStudentRow {
  student: WaitlistStudentRef;
  status: WaitlistStatus;
  position: number | null;
  storedPosition: number;
  score: number;
  /** Null for a queue joined during add/drop: the course was never ranked. */
  preferenceRank: PreferenceRank | null;
  reason: WaitlistRemovalReason | null;
}

/** GET /api/admin/waitlists?course=CODE. */
export interface AdminWaitlistView {
  window: RegistrationWindowSummary | null;
  /** Every offered course, for the picker. */
  courses: CourseRef[];
  /** Null when no course is selected yet, or the window has no courses. */
  course: (CourseRef & { capacity: number; allocated: number; available: number }) | null;
  enrolled: EnrolledStudentRow[];
  waitlist: WaitingStudentRow[];
  serverTime: IsoDateTime;
}

/** One student who moved, as an admin sees it. */
export interface PromotionMove {
  student: WaitlistStudentRef;
  course: CourseRef;
  /** The seat released to take this one, if any. */
  fromCourse: CourseRef | null;
}

export interface WaitlistRemoval {
  student: WaitlistStudentRef;
  course: CourseRef;
  reason: WaitlistRemovalReason;
}

/** What one seat-freeing action set off, including the whole cascade. */
export interface PromotionSummary {
  promoted: PromotionMove[];
  removed: WaitlistRemoval[];
}

export const WITHDRAW_REASON_LENGTH = { min: 5, max: 500 } as const;

/** POST /api/admin/enrollments/:id/withdraw. */
export interface WithdrawEnrollmentRequest {
  reason: string;
}

export interface WithdrawEnrollmentResult {
  student: WaitlistStudentRef;
  course: CourseRef;
  dropReason: EnrollmentDropReason;
  promotions: PromotionSummary;
}

/** POST /api/admin/waitlists/process — the safety sweep for the whole window. */
export interface ProcessWaitlistsResult {
  /** Courses that had a free seat to offer. */
  coursesChecked: number;
  promotions: PromotionSummary;
}
