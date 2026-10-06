import { ArrowLeft, MapPinOff } from 'lucide-react';
import { useLocation } from 'react-router';
import { LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { homePathFor } from '../utils/authRedirects';
import styles from './NotFoundPage.module.css';

export interface NotFoundPageProps {
  /**
   * Centre the block, for the public layout, where a 44rem column would
   * otherwise sit in the corner of a 1280px page with nothing beside it — the
   * same reason AuthPanel centres its card. Inside the app shell it stays
   * left-aligned, like every other page there.
   */
  centred?: boolean;
}

export function NotFoundPage({ centred = false }: NotFoundPageProps) {
  useDocumentTitle('Page not found');
  const { pathname } = useLocation();
  const { state } = useAuth();
  const home = state.status === 'authenticated' ? homePathFor(state.user.role) : '/login';

  return (
    <div className={styles.page} data-centred={centred || undefined}>
      <PageHeader
        title="Page not found"
        description="Error 404: that address does not match any page."
        sticky={false}
      />
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
