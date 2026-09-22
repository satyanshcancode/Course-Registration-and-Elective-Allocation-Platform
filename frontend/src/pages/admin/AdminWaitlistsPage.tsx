import { Hourglass } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function AdminWaitlistsPage() {
  return (
    <FeaturePlaceholder
      title="Waitlists"
      kicker="Administration · Allocation"
      description="Queues for full courses and automatic promotions."
      icon={Hourglass}
      emptyTitle="No waitlists yet"
    >
      <p>
        After allocation, every full course will list its waiting students in order, with promotions
        as seats free up.
      </p>
    </FeaturePlaceholder>
  );
}
