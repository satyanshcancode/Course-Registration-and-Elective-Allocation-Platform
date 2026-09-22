import { ListChecks } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function ResultsPage() {
  return (
    <FeaturePlaceholder
      title="Allocation results"
      kicker="Fall 2026 · Results"
      description="Which courses you were allocated, and why."
      icon={ListChecks}
      emptyTitle="No results yet"
    >
      <p>
        Results appear after the registration window closes and allocation has run, with a
        plain-language explanation for each course you ranked.
      </p>
    </FeaturePlaceholder>
  );
}
