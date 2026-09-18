import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import styles from './LogoutButton.module.css';

export function LogoutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  const handleClick = () => {
    setPending(true);
    void logout().finally(() => {
      setPending(false);
    });
  };

  return (
    <button type="button" className={styles.button} onClick={handleClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
