/**
 * Allocation DTOs: what a run produced, and why each student got what they got.
 *
 * Explanations are a discriminated union on `type` carrying every number the
 * sentence needs. They describe the course and the student's own standing on
 * it — capacity, how many applied, where they came, what the cut-off was —
 * and never another student's identity or data.
 */
import type { AllocationConfig } from '../domain/allocationConfig.js';
import type {
  AllocationMethod,
  AllocationOutcome,
  AllocationRunStatus,
  PreferenceRank,
} from '../domain/enums.js';
import type { IsoDateTime } from '../domain/models.js';
import type { CourseRef } from '../domain/refs.js';
import type { RegistrationWindowSummary } from './courses.js';

/** One priority bonus that applied, so the total can be shown as a sum. */
export interface ScoreBonus {
  type: 'FINAL_YEAR' | 'PROGRAM_RELEVANCE' | 'GRADUATION_URGENCY';
  points: number;
}

/** How one student's score for one course was reached. */
export interface ScoreBreakdown {
  preferenceRank: PreferenceRank;
  preferencePoints: number;
  /** Only the bonuses that applied; an empty list is a plain preference score. */
  bonuses: ScoreBonus[];
  priorityPoints: number;
  total: number;
}

/** The facts every explanation carries about the course it is about. */
export interface AllocationFacts {
  course: CourseRef;
  preferenceRank: PreferenceRank;
  /** null for FCFS, which allocates by arrival order and does not score. */
  score: ScoreBreakdown | null;
  /** Place among everyone who ranked this course (1 = first in line). */
  finalRank: number;
  capacity: number;
  applicants: number;
  /** Lowest score that still got a seat, or null if the course did not fill. */
  cutoffScore: number | null;
}

export type AllocationExplanation =
  | ({ type: 'ALLOCATED' } & AllocationFacts)
  | ({ type: 'WAITLISTED'; waitlistPosition: number } & AllocationFacts)
  | ({
      type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED';
      grantedCourse: CourseRef;
      grantedRank: PreferenceRank;
    } & AllocationFacts)
  | ({ type: 'NOT_ALLOCATED_FULL' } & AllocationFacts)
  | ({ type: 'NOT_ALLOCATED_INELIGIBLE' } & AllocationFacts)
  | ({
      /** Moved off the waitlist after the run, when a seat freed up. */
      type: 'PROMOTED';
      /** The lower-ranked seat released to take this one, if there was one. */
      fromCourse: CourseRef | null;
      fromRank: PreferenceRank | null;
    } & AllocationFacts)
  | ({
      /** The seat was held and then released by an administrator. */
      type: 'SEAT_WITHDRAWN';
    } & AllocationFacts);

export type AllocationExplanationType = AllocationExplanation['type'];

/** Every explanation type, so a formatter or a test can cover the whole union. */
export const ALLOCATION_EXPLANATION_TYPES = [
  'ALLOCATED',
  'WAITLISTED',
  'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
  'NOT_ALLOCATED_FULL',
  'NOT_ALLOCATED_INELIGIBLE',
  'PROMOTED',
  'SEAT_WITHDRAWN',
] as const satisfies readonly AllocationExplanationType[];

/** How one course fared in a run. */
export interface CourseAllocationMetric {
  course: CourseRef;
  capacity: number;
  /** Students who ranked it anywhere. */
  applicants: number;
  allocated: number;
  waitlisted: number;
  cutoffScore: number | null;
  oversubscribed: boolean;
}

export interface AllocationMetrics {
  /** Students with at least one ranked course that could be allocated. */
  students: number;
  allocated: number;
  unallocated: number;
  /** Share of allocated students who got their first choice, 0..1. */
  firstChoiceRate: number;
  topThreeRate: number;
  /** Mean rank of the course each allocated student received. */
  averageAllocatedRank: number | null;
  seatsOffered: number;
  seatsFilled: number;
  seatUtilisation: number;
  waitlistEntries: number;
  /**
   * Pairs where a student prefers a course that admitted someone with a lower
   * score for it. Preference + Priority is always 0 by construction; FCFS
   * usually is not, and that number is the argument for scoring.
   */
  justifiedEnvy: number;
  runtimeMs: number;
  courses: CourseAllocationMetric[];
}

/** One method's metrics in the side-by-side preview. */
export interface AllocationPreviewMethod {
  method: AllocationMethod;
  algorithmVersion: string;
  /** The method the window froze: this is the one "Run allocation" will use. */
  willBeUsed: boolean;
  metrics: AllocationMetrics;
}

/** POST /api/admin/allocation/preview — writes nothing. */
export interface AllocationPreview {
  window: RegistrationWindowSummary;
  submissions: number;
  randomSeed: number;
  methods: AllocationPreviewMethod[];
  serverTime: IsoDateTime;
}

export interface AllocationRunSummary {
  id: string;
  method: AllocationMethod;
  algorithmVersion: string;
  status: AllocationRunStatus;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  errorMessage: string | null;
  /** Null while the run is still going, or if it failed. */
  metrics: AllocationMetrics | null;
  triggeredBy: string | null;
}

export interface AllocationRunDetail extends AllocationRunSummary {
  window: RegistrationWindowSummary;
  randomSeed: number;
  config: AllocationConfig;
  outputHash: string | null;
  /** How many students and courses the snapshot held. */
  inputSize: { students: number; courses: number };
}

/** POST /api/admin/allocation-runs/:id/verify. */
export interface AllocationVerification {
  runId: string;
  reproducible: boolean;
  storedHash: string | null;
  recomputedHash: string;
  algorithmVersion: string;
  /** Plain-language differences when the outputs do not match. */
  differences: string[];
  checkedAt: IsoDateTime;
}

/** POST /api/admin/allocation/run. */
export interface RunAllocationRequest {
  /** Must be true: allocation can only be done once for a window. */
  confirm: boolean;
  reason?: string;
}

/** One ranked course as the student sees it after allocation. */
export interface StudentAllocationResult {
  outcome: AllocationOutcome;
  explanation: AllocationExplanation;
}

/** GET /api/allocation/results — the caller's own outcome, nobody else's. */
export interface StudentAllocationResults {
  window: RegistrationWindowSummary | null;
  /** Null until allocation has run for this window. */
  ranAt: IsoDateTime | null;
  method: AllocationMethod | null;
  /** The course they hold a seat in, if any. */
  allocated: AllocationExplanation | null;
  /** Every course they ranked, in rank order (includes the allocated one). */
  results: StudentAllocationResult[];
  serverTime: IsoDateTime;
}
