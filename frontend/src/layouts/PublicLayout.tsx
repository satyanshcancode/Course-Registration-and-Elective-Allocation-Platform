import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PageLoading } from '../components/PageLoading';
import styles from './PublicLayout.module.css';
import { Wordmark } from './Wordmark';

/** Frame for pages outside the signed-in area: sign-in, not found, dev tools. */
export function PublicLayout() {
  const { pathname } = useLocation();
  // The sign-in page is a full-bleed split; every other public page is a column.
  const bleed = pathname === '/login';
  return (
    <div className={styles.shell} data-bleed={bleed || undefined}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>
      <header className={styles.header} data-bleed={bleed || undefined}>
        <div className={styles.headerInner}>
          <Wordmark to="/" />
        </div>
      </header>
      <main id="main" className={styles.main} data-bleed={bleed || undefined} tabIndex={-1}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className={styles.footer}>
        <p>Allocademy · University Registrar</p>
        <p className={styles.footerLinks}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </p>
      </footer>
    </div>
  );
}
