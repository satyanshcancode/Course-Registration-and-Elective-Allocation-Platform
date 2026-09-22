import { Hourglass } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function WaitlistPage() {
  return (
    <FeaturePlaceholder
      title="Waitlist"
      kicker="Fall 2026 · Waitlist"
      description="Your place in line for courses that were full."
      icon={Hourglass}
      emptyTitle="You’re not on any waitlist"
    >
      <p>
        If a course you ranked is full, your position will show here, and you’ll be moved in
        automatically when a seat frees up.
      </p>
    </FeaturePlaceholder>
  );
}
