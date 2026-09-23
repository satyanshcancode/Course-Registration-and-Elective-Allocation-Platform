/**
 * Raw row shapes as node-postgres returns them (snake_case).
 *
 * Type notes: UUID/TEXT/CITEXT -> string, SMALLINT/INTEGER -> number,
 * BIGINT -> string (may exceed 2^53, so pg does not convert it),
 * TIMESTAMPTZ -> Date, JSONB -> parsed value (unknown until validated).
 * Enum-like TEXT columns are typed as string and narrowed by the mappers.
 */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

/** users LEFT JOIN students/programs: the student columns are null for admins. */
export interface CurrentUserRow {
  id: string;
  email: string;
  role: string;
  name: string | null;
  roll_number: string | null;
  program_code: string | null;
  program_name: string | null;
  semester: number | null;
  credits_completed: number | null;
}

export interface StudentProfileRow {
  user_id: string;
  email: string;
  name: string;
  roll_number: string;
  program_code: string;
  program_name: string;
  semester: number;
  credits_completed: number;
  expected_graduation_term: string;
}

export interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  created_at: Date;
}

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  department_id: string;
  created_at: Date;
}

export interface StudentRow {
  user_id: string;
  user_role: string;
  roll_number: string;
  name: string;
  program_id: string;
  semester: number;
  credits_completed: number;
  expected_graduation_term: string;
  created_at: Date;
  updated_at: Date;
}

export interface CompletedCourseRow {
  student_id: string;
  course_id: string;
  completed_term: string;
}

export interface CourseRow {
  id: string;
  code: string;
  name: string;
  department_id: string;
  credits: number;
  description: string;
  min_semester: number;
  min_credits: number;
  created_at: Date;
  updated_at: Date;
}

export interface RegistrationWindowRow {
  id: string;
  name: string;
  term: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  allocation_method: string;
  config: unknown;
  random_seed: string;
  created_at: Date;
  updated_at: Date;
}

export interface CourseOfferingRow {
  window_id: string;
  course_id: string;
  capacity: number;
  allocated_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface PreferenceSubmissionRow {
  id: string;
  student_id: string;
  window_id: string;
  status: string;
  idempotency_key: string | null;
  submitted_at: Date | null;
  submission_sequence: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PreferenceItemRow {
  submission_id: string;
  window_id: string;
  course_id: string;
  rank: number;
}

export interface EnrollmentRow {
  id: string;
  student_id: string;
  window_id: string;
  course_id: string;
  status: string;
  source: string;
  enrolled_at: Date;
  dropped_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WaitlistEntryRow {
  id: string;
  student_id: string;
  window_id: string;
  course_id: string;
  score: number;
  position: number;
  status: string;
  created_at: Date;
  promoted_at: Date | null;
  removed_at: Date | null;
  updated_at: Date;
}

export interface AllocationRunRow {
  id: string;
  window_id: string;
  method: string;
  algorithm_version: string;
  random_seed: string;
  config_snapshot: unknown;
  input_snapshot: unknown;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  error_message: string | null;
  triggered_by: string | null;
}

export interface AllocationResultRow {
  id: string;
  run_id: string;
  student_id: string;
  course_id: string;
  outcome: string;
  preference_rank: number;
  preference_score: number | null;
  priority_score: number | null;
  total_score: number | null;
  final_rank: number;
  explanation: string;
  created_at: Date;
}

export interface RegistrationHistoryRow {
  id: string;
  student_id: string;
  window_id: string | null;
  course_id: string | null;
  event_type: string;
  details: unknown;
  created_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Catalogue read models (joined / aggregated queries)
// ---------------------------------------------------------------------------

export interface WindowSummaryRow {
  id: string;
  name: string;
  term: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
}

/** One offering with its course, department, demand and rule lists (JSON arrays). */
export interface CatalogueOfferingRow {
  course_id: string;
  code: string;
  name: string;
  credits: number;
  description: string;
  min_semester: number;
  min_credits: number;
  department_code: string;
  department_name: string;
  capacity: number;
  allocated_count: number;
  demand: number;
  /** [{ id, code, name }] */
  prerequisites: unknown;
  /** [{ id, code, name }] */
  eligible_programs: unknown;
}

export interface SeatRow {
  code: string;
  capacity: number;
  allocated_count: number;
  demand: number;
}

export interface EligibilityFactsRow {
  program_id: string;
  program_code: string;
  program_name: string;
  semester: number;
  credits_completed: number;
  completed_course_ids: string[];
}

/** One of the caller's own cart items, enrollments or waitlist places. */
export interface CourseStatusRow {
  course_id: string;
  kind: string;
  rank: number | null;
  position: number | null;
}

export interface LockedOfferingRow {
  window_id: string;
  course_id: string;
  code: string;
  capacity: number;
  allocated_count: number;
}

/** A course addressed by its public code. */
export interface CourseRefRow {
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Registration window management
// ---------------------------------------------------------------------------

/** The window with its full policy, for the admin page. */
export interface WindowDetailRow extends WindowSummaryRow {
  allocation_method: string;
  config: unknown;
  random_seed: string | number;
}

/** Every course, marked with whether this window offers it. */
export interface WindowCourseOptionRow {
  code: string;
  name: string;
  credits: number;
  department_code: string;
  department_name: string;
  offered: boolean;
  capacity: number | null;
  demand: number;
}

export interface WindowCountsRow {
  offered_courses: number;
  submissions: number;
  total_students: number;
}
