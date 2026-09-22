import { CircleHelp } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function HelpPage() {
  return (
    <FeaturePlaceholder
      title="How registration works"
      kicker="Help"
      description="The registration window, ranking your courses and how seats are allocated."
      icon={CircleHelp}
      emptyTitle="The guide is being written"
    >
      <p>
        A short written guide and a captioned video walking through the whole process will be added
        here.
      </p>
    </FeaturePlaceholder>
  );
}
