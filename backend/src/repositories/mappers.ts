/**
 * Row -> domain model mappers. Enum-like columns and JSONB are validated here,
 * so a row that somehow violates the contract fails loudly instead of leaking
 * an invalid value into the application.
 */
import {
  ALLOCATION_METHODS,
  ALLOCATION_OUTCOMES,
  ALLOCATION_RUN_STATUSES,
  ENROLLMENT_SOURCES,
  HISTORY_EVENT_TYPES,
  isAcademicTerm,
  isAllocationConfig,
  isOneOf,
  NOTIFICATION_TYPES,
  PREFERENCE_RANKS,
  REGISTRATION_WINDOW_STATUSES,
  USER_ROLES,
  WAITLIST_STATUSES,
  type AcademicTerm,
  type AllocationConfig,
  type AllocationResult,
  type AllocationRun,
  type AuditLogEntry,
  type CompletedCourse,
  type Course,
  type CourseOffering,
  type CurrentUser,
  type Department,
  type Enrollment,
  type Notification,
  type PreferenceItem,
  type PreferenceSubmission,
  type Program,
  type RegistrationHistoryEvent,
  type RegistrationWindow,
  type Student,
  type StudentProfile,
  type User,
  type WaitlistEntry,
} from '@course-reg/shared';
import type {
  CourseStatusRecord,
  IdentifiedRef,
  OfferingRecord,
  WindowRecord,
} from '../types/catalogue.js';
import type {
  AllocationResultRow,
  AllocationRunRow,
  AuditLogRow,
  CatalogueOfferingRow,
  CompletedCourseRow,
  CourseOfferingRow,
  CourseRow,
  CourseStatusRow,
  CurrentUserRow,
  DepartmentRow,
  EnrollmentRow,
  NotificationRow,
  PreferenceItemRow,
  PreferenceSubmissionRow,
  ProgramRow,
  RegistrationHistoryRow,
  RegistrationWindowRow,
  StudentProfileRow,
  StudentRow,
  UserRow,
  WaitlistEntryRow,
  WindowSummaryRow,
} from './rows.js';

/** A row did not match the schema contract (should be impossible given the CHECKs). */
export class RowMappingError extends Error {
  constructor(column: string, value: unknown) {
    super(`Unexpected value for ${column}: ${JSON.stringify(value)}`);
    this.name = 'RowMappingError';
  }
}

function oneOf<const T extends readonly unknown[]>(values: T, value: unknown, column: string) {
  if (!isOneOf(values, value)) {
    throw new RowMappingError(column, value);
  }
  return value;
}

function term(value: string, column: string): AcademicTerm {
  if (!isAcademicTerm(value)) {
    throw new RowMappingError(column, value);
  }
  return value;
}

function allocationConfig(value: unknown, column: string): AllocationConfig {
  if (!isAllocationConfig(value)) {
    throw new RowMappingError(column, value);
  }
  return value;
}

/** BIGINT arrives as a string; every BIGINT we store fits in a safe integer. */
function bigint(value: string, column: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RowMappingError(column, value);
  }
  return parsed;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);

function jsonObject(value: unknown, column: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RowMappingError(column, value);
  }
  return value as Record<string, unknown>;
}

export function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: oneOf(USER_ROLES, row.role, 'users.role'),
    createdAt: iso(row.created_at),
  };
}

/** Session user: admins have no profile; students must have one. */
export function mapCurrentUserRow(row: CurrentUserRow): CurrentUser {
  const role = oneOf(USER_ROLES, row.role, 'users.role');
  if (role === 'ADMIN') {
    return { id: row.id, email: row.email, role };
  }
  if (
    row.name === null ||
    row.roll_number === null ||
    row.program_code === null ||
    row.program_name === null ||
    row.semester === null ||
    row.credits_completed === null
  ) {
    throw new RowMappingError('students (profile missing for STUDENT user)', row.id);
  }
  return {
    id: row.id,
    email: row.email,
    role,
    student: {
      name: row.name,
      rollNumber: row.roll_number,
      program: { code: row.program_code, name: row.program_name },
      semester: row.semester,
      creditsCompleted: row.credits_completed,
    },
  };
}

export function mapStudentProfileRow(row: StudentProfileRow): StudentProfile {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    rollNumber: row.roll_number,
    program: { code: row.program_code, name: row.program_name },
    semester: row.semester,
    creditsCompleted: row.credits_completed,
    expectedGraduationTerm: term(row.expected_graduation_term, 'students.expected_graduation_term'),
  };
}

export function mapDepartmentRow(row: DepartmentRow): Department {
  return { id: row.id, code: row.code, name: row.name };
}

export function mapProgramRow(row: ProgramRow): Program {
  return { id: row.id, code: row.code, name: row.name, departmentId: row.department_id };
}

export function mapStudentRow(row: StudentRow): Student {
  return {
    userId: row.user_id,
    rollNumber: row.roll_number,
    name: row.name,
    programId: row.program_id,
    semester: row.semester,
    creditsCompleted: row.credits_completed,
    expectedGraduationTerm: term(row.expected_graduation_term, 'students.expected_graduation_term'),
  };
}

export function mapCompletedCourseRow(row: CompletedCourseRow): CompletedCourse {
  return {
    studentId: row.student_id,
    courseId: row.course_id,
    completedTerm: term(row.completed_term, 'student_completed_courses.completed_term'),
  };
}

export function mapCourseRow(row: CourseRow): Course {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    departmentId: row.department_id,
    credits: row.credits,
    description: row.description,
    minSemester: row.min_semester,
    minCredits: row.min_credits,
  };
}

export function mapRegistrationWindowRow(row: RegistrationWindowRow): RegistrationWindow {
  return {
    id: row.id,
    name: row.name,
    term: term(row.term, 'registration_windows.term'),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: oneOf(REGISTRATION_WINDOW_STATUSES, row.status, 'registration_windows.status'),
    allocationMethod: oneOf(
      ALLOCATION_METHODS,
      row.allocation_method,
      'registration_windows.allocation_method',
    ),
    config: allocationConfig(row.config, 'registration_windows.config'),
    randomSeed: bigint(row.random_seed, 'registration_windows.random_seed'),
  };
}

export function mapCourseOfferingRow(row: CourseOfferingRow): CourseOffering {
  return {
    windowId: row.window_id,
    courseId: row.course_id,
    capacity: row.capacity,
    allocatedCount: row.allocated_count,
  };
}

export function mapPreferenceSubmissionRow(row: PreferenceSubmissionRow): PreferenceSubmission {
  const base = {
    id: row.id,
    studentId: row.student_id,
    windowId: row.window_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };

  if (row.status === 'DRAFT') {
    return {
      ...base,
      status: 'DRAFT',
      idempotencyKey: row.idempotency_key,
      submittedAt: null,
      submissionSequence: null,
    };
  }
  if (
    row.status === 'SUBMITTED' &&
    row.idempotency_key !== null &&
    row.submitted_at !== null &&
    row.submission_sequence !== null
  ) {
    return {
      ...base,
      status: 'SUBMITTED',
      idempotencyKey: row.idempotency_key,
      submittedAt: iso(row.submitted_at),
      submissionSequence: bigint(
        row.submission_sequence,
        'preference_submissions.submission_sequence',
      ),
    };
  }
  throw new RowMappingError('preference_submissions.status', row.status);
}

export function mapPreferenceItemRow(row: PreferenceItemRow): PreferenceItem {
  return {
    submissionId: row.submission_id,
    windowId: row.window_id,
    courseId: row.course_id,
    rank: oneOf(PREFERENCE_RANKS, row.rank, 'preference_items.rank'),
  };
}

export function mapEnrollmentRow(row: EnrollmentRow): Enrollment {
  const base = {
    id: row.id,
    studentId: row.student_id,
    windowId: row.window_id,
    courseId: row.course_id,
    source: oneOf(ENROLLMENT_SOURCES, row.source, 'enrollments.source'),
    enrolledAt: iso(row.enrolled_at),
  };

  if (row.status === 'ACTIVE') {
    return { ...base, status: 'ACTIVE', droppedAt: null };
  }
  if (row.status === 'DROPPED' && row.dropped_at !== null) {
    return { ...base, status: 'DROPPED', droppedAt: iso(row.dropped_at) };
  }
  throw new RowMappingError('enrollments.status', row.status);
}

export function mapWaitlistEntryRow(row: WaitlistEntryRow): WaitlistEntry {
  return {
    id: row.id,
    studentId: row.student_id,
    windowId: row.window_id,
    courseId: row.course_id,
    score: row.score,
    position: row.position,
    status: oneOf(WAITLIST_STATUSES, row.status, 'waitlist_entries.status'),
    createdAt: iso(row.created_at),
    promotedAt: isoOrNull(row.promoted_at),
    removedAt: isoOrNull(row.removed_at),
  };
}

export function mapAllocationRunRow(row: AllocationRunRow): AllocationRun {
  return {
    id: row.id,
    windowId: row.window_id,
    method: oneOf(ALLOCATION_METHODS, row.method, 'allocation_runs.method'),
    algorithmVersion: row.algorithm_version,
    randomSeed: bigint(row.random_seed, 'allocation_runs.random_seed'),
    configSnapshot: allocationConfig(row.config_snapshot, 'allocation_runs.config_snapshot'),
    status: oneOf(ALLOCATION_RUN_STATUSES, row.status, 'allocation_runs.status'),
    startedAt: iso(row.started_at),
    finishedAt: isoOrNull(row.finished_at),
    errorMessage: row.error_message,
    triggeredBy: row.triggered_by,
  };
}

export function mapAllocationResultRow(row: AllocationResultRow): AllocationResult {
  return {
    id: bigint(row.id, 'allocation_results.id'),
    runId: row.run_id,
    studentId: row.student_id,
    courseId: row.course_id,
    outcome: oneOf(ALLOCATION_OUTCOMES, row.outcome, 'allocation_results.outcome'),
    preferenceRank: oneOf(
      PREFERENCE_RANKS,
      row.preference_rank,
      'allocation_results.preference_rank',
    ),
    preferenceScore: row.preference_score,
    priorityScore: row.priority_score,
    totalScore: row.total_score,
    finalRank: row.final_rank,
    explanation: row.explanation,
  };
}

export function mapRegistrationHistoryRow(row: RegistrationHistoryRow): RegistrationHistoryEvent {
  return {
    id: bigint(row.id, 'registration_history.id'),
    studentId: row.student_id,
    windowId: row.window_id,
    courseId: row.course_id,
    eventType: oneOf(HISTORY_EVENT_TYPES, row.event_type, 'registration_history.event_type'),
    details: jsonObject(row.details, 'registration_history.details'),
    createdAt: iso(row.created_at),
  };
}

export function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: oneOf(NOTIFICATION_TYPES, row.type, 'notifications.type'),
    title: row.title,
    body: row.body,
    readAt: isoOrNull(row.read_at),
    createdAt: iso(row.created_at),
  };
}

export function mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: bigint(row.id, 'audit_logs.id'),
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: row.reason,
    createdAt: iso(row.created_at),
  };
}

export function mapWindowSummaryRow(row: WindowSummaryRow): WindowRecord {
  return {
    id: row.id,
    summary: {
      name: row.name,
      term: term(row.term, 'registration_windows.term'),
      status: oneOf(REGISTRATION_WINDOW_STATUSES, row.status, 'registration_windows.status'),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
    },
  };
}

function isIdentifiedRef(value: unknown): value is IdentifiedRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'code' in value &&
    typeof value.code === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

/** A json_agg column of { id, code, name } objects. */
function identifiedRefs(value: unknown, column: string): IdentifiedRef[] {
  if (!Array.isArray(value) || !value.every(isIdentifiedRef)) {
    throw new RowMappingError(column, value);
  }
  return value.map(({ id, code, name }) => ({ id, code, name }));
}

export function mapCatalogueOfferingRow(row: CatalogueOfferingRow): OfferingRecord {
  return {
    courseId: row.course_id,
    code: row.code,
    name: row.name,
    credits: row.credits,
    description: row.description,
    minSemester: row.min_semester,
    minCredits: row.min_credits,
    department: { code: row.department_code, name: row.department_name },
    capacity: row.capacity,
    allocated: row.allocated_count,
    demand: row.demand,
    prerequisites: identifiedRefs(row.prerequisites, 'course_prerequisites'),
    eligiblePrograms: identifiedRefs(row.eligible_programs, 'course_eligible_programs'),
  };
}

export function mapCourseStatusRow(row: CourseStatusRow): CourseStatusRecord {
  switch (row.kind) {
    case 'DRAFT':
    case 'SUBMITTED':
      return {
        courseId: row.course_id,
        kind: row.kind,
        rank: oneOf(PREFERENCE_RANKS, row.rank, 'preference_items.rank'),
      };
    case 'ENROLLED':
      return { courseId: row.course_id, kind: 'ENROLLED' };
    case 'WAITLISTED':
      if (row.position === null || row.position < 1) {
        throw new RowMappingError('waitlist position', row.position);
      }
      return { courseId: row.course_id, kind: 'WAITLISTED', position: row.position };
    default:
      throw new RowMappingError('course status kind', row.kind);
  }
}
