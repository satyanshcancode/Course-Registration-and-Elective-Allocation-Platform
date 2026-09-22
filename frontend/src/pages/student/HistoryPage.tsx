import { History } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function HistoryPage() {
  return (
    <FeaturePlaceholder
      title="Registration history"
      kicker="Your record"
      description="Every submission, allocation and change, in order."
      icon={History}
      emptyTitle="Nothing recorded yet"
    >
      <p>
        Submitting your cart, allocation, waitlist moves, adds and drops will each be listed here
        with the date and time.
      </p>
    </FeaturePlaceholder>
  );
}
