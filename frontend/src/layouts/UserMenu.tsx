import { ChevronDown, LogOut, UserCog } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import styles from './UserMenu.module.css';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Account disclosure in the app header: who is signed in, and Sign out.
 * A simple disclosure (button + panel), not an ARIA menu, because it holds
 * text as well as an action.
 */
export function UserMenu() {
  const { state, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // The panel belongs to the page it was opened on. Remembering that page and
  // comparing it during render closes the panel on navigation WITHOUT a
  // setState in an effect, which would cost a second render every time.
  const [openedOn, setOpenedOn] = useState(pathname);
  const [signingOut, setSigningOut] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (state.status !== 'authenticated') {
    return null;
  }
  const { user } = state;
  const name = user.role === 'STUDENT' ? user.student.name : 'Administrator';
  const detail = user.role === 'STUDENT' ? user.student.rollNumber : 'Registrar staff';
  // The page lives under each role's own area so it keeps that area's layout.
  const accountPath = user.role === 'ADMIN' ? '/admin/account' : '/student/account';

  // Navigating away (to the account page) leaves the panel behind.
  const showing = open && openedOn === pathname;

  const signOut = () => {
    setSigningOut(true);
    void logout().finally(() => {
      setSigningOut(false);
    });
  };

  return (
    <div className={styles.menu} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={showing}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!showing);
          setOpenedOn(pathname);
        }}
      >
        <span className={styles.initials} aria-hidden="true">
          {initialsOf(name)}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{name}</span>
          <span className={styles.detail}>{detail}</span>
        </span>
        <Icon icon={ChevronDown} className={styles.chevron} />
        <span className="visually-hidden">Account</span>
      </button>
      <div id={panelId} className={styles.panel} hidden={!showing}>
        <p className={styles.signedInAs}>Signed in as</p>
        <p className={styles.email}>{user.email}</p>
        <Link className={styles.accountLink} to={accountPath}>
          <Icon icon={UserCog} />
          Account and password
        </Link>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          iconStart={LogOut}
          loading={signingOut}
          onClick={signOut}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
