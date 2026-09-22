import { ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
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
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
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
      <div id={panelId} className={styles.panel} hidden={!open}>
        <p className={styles.signedInAs}>Signed in as</p>
        <p className={styles.email}>{user.email}</p>
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
