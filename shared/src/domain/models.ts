/**
 * Domain models (camelCase), mirroring the database schema.
 *
 * These are what the backend works with after mapping database rows, and the
 * building blocks of API DTOs. Timestamps are ISO-8601 strings because the
 * models cross the JSON boundary. Secrets such as password hashes are never
 * part of a shared model.
 */
import type { AcademicTerm } from './academicTerm.js';
import type { AllocationConfig } from './allocationConfig.js';
import type {
  AllocationMethod,
  AllocationOutcome,
  AllocationRunStatus,
  EnrollmentSource,
  HistoryEventType,
  NotificationType,
  PreferenceRank,
  RegistrationWindowStatus,
  UserRole,
  WaitlistStatus,
} from './enums.js';

/** ISO-8601 timestamp, e.g. "2026-09-18T09:00:00.000Z". */
export type IsoDateTime = string;

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: IsoDateTime;
}

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  departmentId: string;
}

export interface Student {
  userId: string;
  rollNumber: string;
  name: string;
  programId: string;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: AcademicTerm;
}

export interface CompletedCourse {
  studentId: string;
  courseId: string;
  completedTerm: AcademicTerm;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  credits: number;
  description: string;
  minSemester: number;
  minCredits: number;
}

/** Eligibility and priority rules attached to a course. */
export interface CourseRules {
  courseId: string;
  prerequisiteCourseIds: string[];
  /** Empty means the course is open to every program. */
  eligibleProgramIds: string[];
  relevantProgramIds: string[];
}

export interface RegistrationWindow {
  id: string;
  name: string;
  term: AcademicTerm;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  status: RegistrationWindowStatus;
  allocationMethod: AllocationMethod;
  config: AllocationConfig;
  randomSeed: number;
}

/** A course offered in a registration window, with its seat counts. */
export interface CourseOffering {
  windowId: string;
  courseId: string;
  capacity: number;
  allocatedCount: number;
}

interface PreferenceSubmissionBase {
  id: string;
  studentId: string;
  windowId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** A saved cart that has not been submitted yet. */
export interface DraftPreferenceSubmission extends PreferenceSubmissionBase {
  status: 'DRAFT';
  idempotencyKey: string | null;
  submittedAt: null;
  submissionSequence: null;
}

/** A final submission; the database guarantees these fields are set. */
export interface SubmittedPreferenceSubmission extends PreferenceSubmissionBase {
  status: 'SUBMITTED';
  idempotencyKey: string;
  submittedAt: IsoDateTime;
  submissionSequence: number;
}

export type PreferenceSubmission = DraftPreferenceSubmission | SubmittedPreferenceSubmission;

export interface PreferenceItem {
  submissionId: string;
  windowId: string;
  courseId: string;
  rank: PreferenceRank;
}

interface EnrollmentBase {
  id: string;
  studentId: string;
  windowId: string;
  courseId: string;
  source: EnrollmentSource;
  enrolledAt: IsoDateTime;
}

export interface ActiveEnrollment extends EnrollmentBase {
  status: 'ACTIVE';
  droppedAt: null;
}

export interface DroppedEnrollment extends EnrollmentBase {
  status: 'DROPPED';
  droppedAt: IsoDateTime;
}

export type Enrollment = ActiveEnrollment | DroppedEnrollment;

export interface WaitlistEntry {
  id: string;
  studentId: string;
  windowId: string;
  courseId: string;
  score: number;
  position: number;
  status: WaitlistStatus;
  createdAt: IsoDateTime;
  promotedAt: IsoDateTime | null;
  removedAt: IsoDateTime | null;
}

export interface AllocationRun {
  id: string;
  windowId: string;
  method: AllocationMethod;
  algorithmVersion: string;
  randomSeed: number;
  configSnapshot: AllocationConfig;
  status: AllocationRunStatus;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  errorMessage: string | null;
  triggeredBy: string | null;
}

export interface AllocationResult {
  id: number;
  runId: string;
  studentId: string;
  courseId: string;
  outcome: AllocationOutcome;
  preferenceRank: PreferenceRank;
  /** Null for methods that do not score (FCFS). */
  preferenceScore: number | null;
  priorityScore: number | null;
  totalScore: number | null;
  finalRank: number;
  explanation: string;
}

export interface RegistrationHistoryEvent {
  id: number;
  studentId: string;
  windowId: string | null;
  courseId: string | null;
  eventType: HistoryEventType;
  details: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface AuditLogEntry {
  id: number;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: IsoDateTime;
}
