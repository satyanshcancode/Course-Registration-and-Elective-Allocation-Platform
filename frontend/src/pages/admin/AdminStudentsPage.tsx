import { Users } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function AdminStudentsPage() {
  return (
    <FeaturePlaceholder
      title="Students"
      kicker="Administration · Records"
      description="Look up a student’s profile, submissions and enrolments."
      icon={Users}
      emptyTitle="Student records arrive in a later phase"
    >
      <p>
        Search by name or roll number to see a student’s eligibility, ranked choices and results.
      </p>
    </FeaturePlaceholder>
  );
}
