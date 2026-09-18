import { LogoutButton } from '../../components/LogoutButton';
import { PagePlaceholder } from '../../components/PagePlaceholder';
import { useCurrentStudent } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from '../DashboardPage.module.css';

export function StudentDashboardPage() {
  useDocumentTitle('Student home');
  const user = useCurrentStudent();
  if (!user) {
    return null;
  }
  const { student } = user;

  return (
    <PagePlaceholder title={`Welcome, ${student.name}`}>
      <dl className={styles.details}>
        <div>
          <dt>Roll number</dt>
          <dd>{student.rollNumber}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{student.program.name}</dd>
        </div>
        <div>
          <dt>Semester</dt>
          <dd>{student.semester}</dd>
        </div>
        <div>
          <dt>Credits completed</dt>
          <dd>{student.creditsCompleted}</dd>
        </div>
      </dl>
      <p>
        The course catalogue, eligibility check, registration cart, add/drop and your registration
        history will appear here.
      </p>
      <LogoutButton />
    </PagePlaceholder>
  );
}
