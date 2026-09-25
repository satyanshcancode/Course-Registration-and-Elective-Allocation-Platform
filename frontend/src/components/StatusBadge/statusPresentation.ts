import type {
  AllocationOutcome,
  AllocationRunStatus,
  EnrollmentStatus,
  MyCourseStatusCode,
  RegistrationWindowStatus,
  SubmissionStatus,
  WaitlistStatus,
} from '@course-reg/shared';
import {
  Ban,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Circle,
  Clock,
  Hourglass,
  ListChecks,
  Lock,
  LockOpen,
  Send,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from '../Badge';

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE';

/** Every status family the UI shows, keyed by kind. */
export interface StatusKinds {
  allocation: AllocationOutcome;
  /** How an allocation run itself ended. */
  allocationRun: AllocationRunStatus;
  enrollment: EnrollmentStatus;
  waitlist: WaitlistStatus;
  submission: SubmissionStatus;
  window: RegistrationWindowStatus;
  eligibility: EligibilityStatus;
  /** The signed-in student's relationship to one course. */
  courseStatus: MyCourseStatusCode;
}

export type StatusKind = keyof StatusKinds;

export interface StatusPresentation {
  tone: BadgeTone;
  icon: LucideIcon;
  label: string;
}

/**
 * Colour AND icon AND words for every status. The mapped type makes the
 * compiler insist on an entry for each member of each shared status union.
 */
export const STATUS_PRESENTATION: {
  [K in StatusKind]: Record<StatusKinds[K], StatusPresentation>;
} = {
  allocation: {
    ALLOCATED: { tone: 'success', icon: CircleCheck, label: 'Allocated' },
    WAITLISTED: { tone: 'warning', icon: Hourglass, label: 'Waitlisted' },
    NOT_ALLOCATED: { tone: 'danger', icon: CircleX, label: 'Not allocated' },
  },
  allocationRun: {
    RUNNING: { tone: 'info', icon: Clock, label: 'Running' },
    COMPLETED: { tone: 'success', icon: CircleCheck, label: 'Completed' },
    FAILED: { tone: 'danger', icon: CircleX, label: 'Failed' },
  },
  enrollment: {
    ACTIVE: { tone: 'success', icon: CircleCheck, label: 'Enrolled' },
    DROPPED: { tone: 'neutral', icon: CircleMinus, label: 'Dropped' },
  },
  waitlist: {
    WAITING: { tone: 'warning', icon: Hourglass, label: 'On waitlist' },
    PROMOTED: { tone: 'success', icon: CircleCheck, label: 'Promoted' },
    REMOVED: { tone: 'neutral', icon: CircleMinus, label: 'Removed' },
  },
  submission: {
    DRAFT: { tone: 'info', icon: CircleDashed, label: 'Draft' },
    SUBMITTED: { tone: 'info', icon: Clock, label: 'Submitted · pending' },
  },
  window: {
    DRAFT: { tone: 'neutral', icon: CircleDashed, label: 'Not open yet' },
    OPEN: { tone: 'success', icon: LockOpen, label: 'Open' },
    CLOSED: { tone: 'info', icon: Lock, label: 'Closed' },
    ALLOCATED: { tone: 'accent', icon: ListChecks, label: 'Results published' },
  },
  eligibility: {
    ELIGIBLE: { tone: 'success', icon: BadgeCheck, label: 'Eligible' },
    NOT_ELIGIBLE: { tone: 'danger', icon: Ban, label: 'Not eligible' },
  },
  courseStatus: {
    NOT_SELECTED: { tone: 'neutral', icon: Circle, label: 'Not selected' },
    IN_DRAFT_CART: { tone: 'info', icon: ShoppingCart, label: 'In draft cart' },
    SUBMITTED: { tone: 'info', icon: Send, label: 'Submitted' },
    ENROLLED: { tone: 'success', icon: CircleCheck, label: 'Enrolled' },
    WAITLISTED: { tone: 'warning', icon: Hourglass, label: 'Waitlisted' },
  },
};

export function presentStatus<K extends StatusKind>(
  kind: K,
  status: StatusKinds[K],
): StatusPresentation {
  return STATUS_PRESENTATION[kind][status];
}
