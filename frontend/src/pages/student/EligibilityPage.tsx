import { BadgeCheck } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function EligibilityPage() {
  return (
    <FeaturePlaceholder
      title="Eligibility check"
      kicker="Fall 2026 · Before registration opens"
      description="See which courses you can take before the window opens."
      icon={BadgeCheck}
      emptyTitle="Your eligibility hasn’t been checked yet"
    >
      <p>
        Each course will show Eligible or Not eligible with the exact reason: programme, semester,
        credits or a missing prerequisite.
      </p>
    </FeaturePlaceholder>
  );
}
