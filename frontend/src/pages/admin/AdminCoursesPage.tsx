import { BookOpen } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function AdminCoursesPage() {
  return (
    <FeaturePlaceholder
      title="Courses and offerings"
      kicker="Administration · Catalogue"
      description="Capacities, eligibility rules and prerequisites for each course."
      icon={BookOpen}
      emptyTitle="Course management arrives in a later phase"
    >
      <p>
        You’ll be able to review every offering for Fall 2026, change capacities and see demand
        against seats.
      </p>
    </FeaturePlaceholder>
  );
}
