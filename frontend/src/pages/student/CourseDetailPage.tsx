import { ArrowLeft, BookOpen } from 'lucide-react';
import { useParams } from 'react-router';
import { LinkButton } from '../../components/Button';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function CourseDetailPage() {
  const { id = '' } = useParams();
  return (
    <FeaturePlaceholder
      title="Course details"
      kicker="Fall 2026 · Catalogue"
      description={
        <>
          Reference <code>{id}</code>
        </>
      }
      icon={BookOpen}
      emptyTitle="Course details aren’t available yet"
      actions={
        <LinkButton to="/student/courses" variant="ghost" iconStart={ArrowLeft}>
          All courses
        </LinkButton>
      }
    >
      <p>
        This page will show the course description, prerequisites, your eligibility and the live
        seat count.
      </p>
    </FeaturePlaceholder>
  );
}
