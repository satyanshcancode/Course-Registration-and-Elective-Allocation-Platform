import { Suspense, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GlobalSearch } from '../components/GlobalSearch';
import { Icon } from '../components/Icon';
import { PageLoading } from '../components/PageLoading';
import { useMediaQuery } from '../hooks/useMediaQuery';
import styles from './AppShell.module.css';
import { MobileNav } from './MobileNav';
import type { NavBadge, NavItem } from './navigation';
import { UserMenu } from './UserMenu';
import { Wordmark } from './Wordmark';

export interface AppShellProps {
  /** Accessible name of the navigation landmark, e.g. "Student". */
  navLabel: string;
  homePath: string;
  items: readonly NavItem[];
  /** Where the header search sends the reader, e.g. "/student/courses". */
  searchPath: string;
  /** Small print in the footer. */
  footerNote?: string;
  /** Optional count beside a nav item, e.g. how many courses are in the cart. */
  itemBadge?: (item: NavItem) => NavBadge | null;
  /** Between the search and the account menu — the student's notification bell. */
  headerAside?: ReactNode;
  /** Pinned under the links — the student's registration window card. */
  navFooter?: ReactNode;
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
  homePath,
  items,
  searchPath,
  footerNote,
  itemBadge,
  headerAside,
  navFooter,
}: AppShellProps) {
  const { pathname } = useLocation();
  // "/student" or "/admin": the policy pages exist under each so they keep this shell.
  const areaRoot = homePath.slice(0, homePath.indexOf('/', 1));
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
        <GlobalSearch to={searchPath} />
        <div className={styles.headerTools}>
          {headerAside}
          <UserMenu />
        </div>
      </header>

      {!isPhone && (
        <nav className={styles.sidebar} aria-label={navLabel}>
          <ul className={styles.navList}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={styles.navLink}>
                  <Icon icon={item.icon} size={20} />
                  <span className={styles.navLabel}>{item.label}</span>
                  <NavCount badge={itemBadge?.(item) ?? null} />
                </NavLink>
              </li>
            ))}
          </ul>
          {navFooter}
        </nav>
      )}

      {isPhone && <MobileNav label={navLabel} items={items} itemBadge={itemBadge} />}

      <main id="main" className={styles.main} tabIndex={-1}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className={styles.footer}>
        <p>{footerNote ?? 'Allocademy · University Registrar'}</p>
        <p className={styles.footerLinks}>
          <Link to={`${areaRoot}/privacy`}>Privacy</Link>
          <Link to={`${areaRoot}/terms`}>Terms</Link>
        </p>
      </footer>
    </div>
  );
}

/**
 * A count beside a nav label. `danger` is for a count that is asking to be
 * read now (unread notifications); everything else is quieter, because a
 * sidebar full of red is a sidebar nobody reads.
 */
function NavCount({ badge }: { badge: NavBadge | null }) {
  if (badge === null || badge.count === 0) {
    return null;
  }
  return (
    <span className={styles.navBadge} data-tone={badge.tone ?? 'neutral'}>
      {badge.count}
      <span className="visually-hidden"> {badge.label}</span>
    </span>
  );
}
