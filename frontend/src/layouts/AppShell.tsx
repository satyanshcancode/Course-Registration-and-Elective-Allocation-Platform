import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Icon } from '../components/Icon';
import { PageLoading } from '../components/PageLoading';
import { useMediaQuery } from '../hooks/useMediaQuery';
import styles from './AppShell.module.css';
import { MobileNav } from './MobileNav';
import type { NavItem } from './navigation';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

export interface AppShellProps {
  /** Accessible name of the navigation landmark, e.g. "Student". */
  navLabel: string;
  /** Kicker above the sidebar links, e.g. "Student" or "Administration". */
  areaLabel: string;
  homePath: string;
  items: readonly NavItem[];
  /** Small print in the footer. */
  footerNote?: string;
  helpPath?: string;
}

/**
 * The signed-in frame shared by students and admins:
 *   desktop  sticky sidebar + content in a CSS Grid
 *   tablet   icon rail with tooltip labels
 *   phone    fixed bottom bar with "More"
 * Pages render inside <main>, behind a Suspense boundary (lazy routes) and an
 * error boundary that resets when the URL changes.
 */
export function AppShell({
  navLabel,
  areaLabel,
  homePath,
  items,
  footerNote,
  helpPath,
}: AppShellProps) {
  const { pathname } = useLocation();
  // Only one navigation landmark exists at a time: the sidebar/rail, or the
  // phone bottom bar. (Two <nav>s with the same name would be ambiguous.)
  const isPhone = useMediaQuery('(width < 40rem)');

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <header className={styles.header}>
        <Wordmark to={homePath} compact />
        <UserMenu />
      </header>

      {!isPhone && (
        <nav className={styles.sidebar} aria-label={navLabel}>
          <p className={styles.area}>{areaLabel}</p>
          <ul className={styles.navList}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={styles.navLink}>
                  <Icon icon={item.icon} size={20} />
                  <span className={styles.navLabel}>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {isPhone && <MobileNav label={navLabel} items={items} />}

      <main id="main" className={styles.main} tabIndex={-1}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className={styles.footer}>
        <p>{footerNote ?? 'Course Registration · University Registrar'}</p>
        {helpPath && <Link to={helpPath}>How registration works</Link>}
      </footer>
    </div>
  );
}
