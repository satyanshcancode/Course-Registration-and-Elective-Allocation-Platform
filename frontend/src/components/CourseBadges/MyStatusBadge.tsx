import type { MyCourseStatus } from '@course-reg/shared';
import { describeMyStatus } from '../../utils/courseText';
import { StatusBadge } from '../StatusBadge';

export interface MyStatusBadgeProps {
  status: MyCourseStatus;
}

/** The student's own status on a course: "Choice 1 · submitted", "Waitlisted · #7". */
export function MyStatusBadge({ status }: MyStatusBadgeProps) {
  return <StatusBadge kind="courseStatus" status={status.code} label={describeMyStatus(status)} />;
}
