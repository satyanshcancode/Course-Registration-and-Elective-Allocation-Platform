import type { NotificationItem } from '@course-reg/shared';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getMyNotifications, markAllNotificationsRead } from '../api/activityApi';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useDisclosure } from '../hooks/useDisclosure';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { formatRelative } from '../utils/formatDate';
import styles from './NotificationBell.module.css';

/** How many the popover shows before sending the reader to the full page. */
export const POPOVER_SIZE = 5;

/**
 * The bell in the app header: an unread count, and a popover with the latest
 * few messages.
 *
 * The count is drawn as a number, not only as a red dot, and the trigger's
 * accessible name carries it, so colour is never the only signal. The panel
 * reuses the notifications endpoint the full page already calls — it asks for
 * the list only once it is opened, so a header does not fetch a page nobody
 * looked at.
 */
export function NotificationBell({ to }: { to: string }) {
  const notifications = useUnreadNotifications();
  const unread = notifications?.unread ?? 0;
  const { open, toggle, close, containerRef, triggerRef, panelId } = useDisclosure();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [marking, setMarking] = useState(false);
  const name = unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const controller = new AbortController();
    void getMyNotifications({}, controller.signal).then((response) => {
      if (response.success) {
        setItems(response.data.items.slice(0, POPOVER_SIZE));
      }
      // A failed load is not worth an error state in a popover: the panel
      // says it has nothing to show and "View all" is one click away.
    });
    return () => {
      controller.abort();
    };
  }, [open]);

  const markAllRead = () => {
    setMarking(true);
    void markAllNotificationsRead()
      .then((response) => {
        if (response.success) {
          notifications?.setUnread(response.data.unread);
          setItems(
            (current) =>
              current?.map((item) => ({
                ...item,
                readAt: item.readAt ?? new Date().toISOString(),
              })) ?? null,
          );
        }
      })
      .finally(() => {
        setMarking(false);
      });
  };

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.bell}
        aria-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <Icon icon={Bell} size={24} />
        {unread > 0 && (
          <span className={styles.count} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Notifications</h2>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={CheckCheck}
              loading={marking}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        {items === null && <p className={styles.empty}>Loading…</p>}
        {items?.length === 0 && <p className={styles.empty}>Nothing to read yet.</p>}
        {items !== null && items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item} data-unread={item.readAt === null}>
                <p className={styles.itemTitle}>
                  {item.readAt === null && (
                    <span className={styles.unreadDot}>
                      <span className="visually-hidden">Unread: </span>
                    </span>
                  )}
                  {item.title}
                </p>
                <p className={styles.itemBody}>{item.body}</p>
                <time className={styles.itemTime} dateTime={item.createdAt}>
                  {formatRelative(item.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}

        <Link to={to} className={styles.viewAll} onClick={close}>
          View all notifications
        </Link>
      </div>
    </div>
  );
}
