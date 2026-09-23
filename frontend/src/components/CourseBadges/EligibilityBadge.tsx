import type { EligibilityResult } from '@course-reg/shared';
import { StatusBadge } from '../StatusBadge';

export interface EligibilityBadgeProps {
  eligibility: EligibilityResult;
}

/** "Eligible" / "Not eligible", with icon and colour. Reasons are shown next to it. */
export function EligibilityBadge({ eligibility }: EligibilityBadgeProps) {
  return (
    <StatusBadge kind="eligibility" status={eligibility.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'} />
  );
}
