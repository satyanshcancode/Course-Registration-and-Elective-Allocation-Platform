import { ArrowLeftRight } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function AddDropPage() {
  return (
    <FeaturePlaceholder
      title="Add or drop a course"
      kicker="Fall 2026 · Add/drop"
      description="Change your enrolment after results are published."
      icon={ArrowLeftRight}
      emptyTitle="Add/drop isn’t open yet"
    >
      <p>
        Once results are published you’ll be able to drop a course, which offers your seat to the
        next student on the waitlist, or add a course that still has seats.
      </p>
    </FeaturePlaceholder>
  );
}
