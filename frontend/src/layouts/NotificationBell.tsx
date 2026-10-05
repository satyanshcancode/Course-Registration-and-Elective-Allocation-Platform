import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import styles from './NotificationBell.module.css';

/**
 * The unread count in the app header. The number is also drawn, not just
 * coloured, and the link's accessible name carries it, so the red dot is
 * never the only thing saying there is something to read.
 */
export function NotificationBell({ to }: { to: string }) {
  const unread = useUnreadNotifications()?.unread ?? 0;
  const name = unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;

  return (
    <Link to={to} className={styles.bell} aria-label={name}>
      <Icon icon={Bell} size={20} />
      {unread > 0 && (
        <span className={styles.count} aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
