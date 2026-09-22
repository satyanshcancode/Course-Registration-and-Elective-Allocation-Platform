import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PageLoading } from '../components/PageLoading';
import styles from './PublicLayout.module.css';
import { Wordmark } from './Wordmark';

/** Frame for pages outside the signed-in area: sign-in, not found, dev tools. */
export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Wordmark to="/" />
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className={styles.footer}>
        <p>Course Registration · University Registrar</p>
      </footer>
    </div>
  );
}
