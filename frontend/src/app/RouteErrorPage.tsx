import { useRouteError } from 'react-router';
import { ErrorFallback } from '../components/ErrorBoundary';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './RouteErrorPage.module.css';

/** The router's error element: anything thrown outside a page's own boundary. */
export function RouteErrorPage() {
  useDocumentTitle('Something went wrong');
  const error = useRouteError();
  return (
    <main className={styles.page}>
      <ErrorFallback error={error} />
    </main>
  );
}
