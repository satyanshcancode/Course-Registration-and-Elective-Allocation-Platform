import { CalendarClock } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function RegistrationWindowPage() {
  return (
    <FeaturePlaceholder
      title="Registration window"
      kicker="Administration · Fall 2026"
      description="Schedule, open and close registration for the term."
      icon={CalendarClock}
      emptyTitle="Window controls arrive in a later phase"
    >
      <p>
        You’ll move the window through draft, open, closed and allocated, with every change recorded
        in the audit log.
      </p>
    </FeaturePlaceholder>
  );
}
