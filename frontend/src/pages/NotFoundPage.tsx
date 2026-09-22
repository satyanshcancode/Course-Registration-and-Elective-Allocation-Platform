import { ArrowLeft, MapPinOff } from 'lucide-react';
import { useLocation } from 'react-router';
import { LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { homePathFor } from '../utils/authRedirects';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  const { pathname } = useLocation();
  const { state } = useAuth();
  const home = state.status === 'authenticated' ? homePathFor(state.user.role) : '/login';

  return (
    <div className={styles.page}>
      <PageHeader title="Page not found" kicker="Error 404" sticky={false} />
      <div className={styles.body}>
        <EmptyState
          title="There’s no page at this address"
          icon={MapPinOff}
          action={
            <LinkButton to={home} variant="primary" iconStart={ArrowLeft}>
              {state.status === 'authenticated' ? 'Go to your dashboard' : 'Go to sign in'}
            </LinkButton>
          }
        >
          <p>
            <code>{pathname}</code> doesn’t exist. It may have been mistyped, or the link may be out
            of date.
          </p>
        </EmptyState>
      </div>
    </div>
  );
}
