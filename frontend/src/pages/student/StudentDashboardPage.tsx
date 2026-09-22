import { BookOpen, LayoutDashboard } from 'lucide-react';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useCurrentStudent } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from '../DashboardPage.module.css';

export function StudentDashboardPage() {
  useDocumentTitle('Dashboard');
  const user = useCurrentStudent();
  if (!user) {
    return null;
  }
  const { student } = user;

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="Fall 2026 · Registration"
        description={`Signed in as ${student.name} · ${student.rollNumber}`}
        actions={
          <LinkButton to="/student/courses" variant="primary" iconStart={BookOpen}>
            Browse courses
          </LinkButton>
        }
      />
      <div className={styles.grid}>
        <div className={styles.primary}>
          <EmptyState title="Your registration summary will appear here" icon={LayoutDashboard}>
            <p>
              When the catalogue and cart are built, this page will show when the window opens, what
              is in your cart, your results and anything that needs your attention.
            </p>
          </EmptyState>
        </div>
        <Card title="Your record" kicker="Student" headingLevel={2}>
          <dl className={styles.record}>
            <div>
              <dt>Programme</dt>
              <dd>{student.program.name}</dd>
            </div>
            <div>
              <dt>Roll number</dt>
              <dd className={styles.mono}>{student.rollNumber}</dd>
            </div>
            <div>
              <dt>Semester</dt>
              <dd className={styles.mono}>{student.semester}</dd>
            </div>
            <div>
              <dt>Credits completed</dt>
              <dd className={styles.mono}>{student.creditsCompleted}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
