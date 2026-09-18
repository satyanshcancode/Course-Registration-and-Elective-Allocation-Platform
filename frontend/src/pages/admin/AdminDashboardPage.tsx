import { LogoutButton } from '../../components/LogoutButton';
import { PagePlaceholder } from '../../components/PagePlaceholder';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from '../DashboardPage.module.css';

export function AdminDashboardPage() {
  useDocumentTitle('Admin home');
  const admin = useCurrentAdmin();
  if (!admin) {
    return null;
  }

  return (
    // Administrators have no student profile, so they are greeted by e-mail.
    <PagePlaceholder title="Welcome, Administrator">
      <dl className={styles.details}>
        <div>
          <dt>Signed in as</dt>
          <dd>{admin.email}</dd>
        </div>
      </dl>
      <p>
        Course management, the registration window, allocation runs and waitlists will appear here.
      </p>
      <LogoutButton />
    </PagePlaceholder>
  );
}
