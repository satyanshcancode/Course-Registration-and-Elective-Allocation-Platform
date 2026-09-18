import { NavLink, Outlet } from 'react-router';
import styles from './RootLayout.module.css';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/student', label: 'Student', end: false },
  { to: '/admin', label: 'Admin', end: false },
  { to: '/login', label: 'Sign in', end: false },
] as const;

export function RootLayout() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand}>
            Course Registration
          </NavLink>
          <nav aria-label="Main">
            <ul className={styles.navList}>
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.end} className={styles.navLink}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>Course Registration and Elective Allocation Platform</p>
      </footer>
    </div>
  );
}
