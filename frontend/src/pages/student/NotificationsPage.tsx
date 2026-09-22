import { Bell } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function NotificationsPage() {
  return (
    <FeaturePlaceholder
      title="Notifications"
      kicker="Your record"
      description="Messages about your registration."
      icon={Bell}
      emptyTitle="No notifications"
    >
      <p>You’ll be told here when results are published or when a waitlisted seat becomes yours.</p>
    </FeaturePlaceholder>
  );
}
