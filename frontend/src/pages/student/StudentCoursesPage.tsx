import { BookOpen } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function StudentCoursesPage() {
  return (
    <FeaturePlaceholder
      title="Course catalogue"
      kicker="Fall 2026 · Catalogue"
      description="Every course offered this term, with live seat counts and demand."
      icon={BookOpen}
      emptyTitle="The catalogue isn’t available yet"
    >
      <p>
        Course listings — codes, credits, prerequisites and live seat counts — arrive in the next
        phase.
      </p>
    </FeaturePlaceholder>
  );
}
