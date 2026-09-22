import { CalendarClock, LayoutDashboard } from 'lucide-react';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from '../DashboardPage.module.css';

export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard');
  const admin = useCurrentAdmin();
  if (!admin) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="Administration · Fall 2026"
        description="Registration window, demand and allocation at a glance."
        actions={
          <LinkButton to="/admin/registration-window" variant="primary" iconStart={CalendarClock}>
            Registration window
          </LinkButton>
        }
      />
      <div className={styles.grid}>
        <div className={styles.primary}>
          <EmptyState title="The term summary will appear here" icon={LayoutDashboard}>
            <p>
              Window status, demand for oversubscribed courses and the latest allocation runs will
              be summarised on this page.
            </p>
          </EmptyState>
        </div>
        <Card title="Signed in" kicker="Administration" headingLevel={2}>
          <dl className={styles.record}>
            <div>
              <dt>Account</dt>
              <dd>{admin.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>Registrar administrator</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
