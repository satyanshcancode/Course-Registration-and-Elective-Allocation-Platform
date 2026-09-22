import { ListOrdered } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function AllocationRunsPage() {
  return (
    <FeaturePlaceholder
      title="Allocation runs"
      kicker="Administration · Allocation"
      description="Run allocation and compare first-come-first-served with preference and priority."
      icon={ListOrdered}
      emptyTitle="No allocation runs yet"
    >
      <p>
        Each run will be stored with its seed, configuration and inputs, so its result can be
        reproduced exactly.
      </p>
    </FeaturePlaceholder>
  );
}
