import { NavLink, Outlet } from 'react-router';
import { LogoutButton } from '../components/LogoutButton';
import { useAuth } from '../hooks/useAuth';
import { homePathFor } from '../utils/authRedirects';
import styles from './RootLayout.module.css';

function SessionNav() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'anonymous') {
    return (
      <li>
        <NavLink to="/login" className={styles.navLink}>
          Sign in
        </NavLink>
      </li>
    );
  }
  const { user } = state;
  return (
    <>
      <li>
        <NavLink to={homePathFor(user.role)} className={styles.navLink}>
          {user.role === 'ADMIN' ? 'Admin' : 'My registration'}
        </NavLink>
      </li>
      <li className={styles.userName}>
        {user.role === 'STUDENT' ? user.student.name : user.email}
      </li>
      <li>
        <LogoutButton />
      </li>
    </>
  );
}

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
              <li>
                <NavLink to="/" end className={styles.navLink}>
                  Home
                </NavLink>
              </li>
              <SessionNav />
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
