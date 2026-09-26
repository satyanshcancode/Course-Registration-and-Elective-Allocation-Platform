import {
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  type NotificationItem,
  type NotificationType,
} from '@course-reg/shared';
import { Bell, BellOff, Check, Circle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/activityApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { formatDateTime } from '../../utils/formatDate';
import styles from './NotificationsPage.module.css';

/** Where a message is acted on. The inbox is a signpost, not a destination. */
const DESTINATIONS: Readonly<Record<NotificationType, { to: string; label: string }>> = {
  ALLOCATION_RESULT: { to: '/student/results', label: 'See your result' },
  WAITLIST_PROMOTION: { to: '/student/waitlist', label: 'See your waitlist' },
  ENROLLMENT_CHANGE: { to: '/student/add-drop', label: 'Open add/drop' },
  WINDOW_STATUS: { to: '/student/dashboard', label: 'Open your dashboard' },
  SYSTEM: { to: '/student/cart', label: 'Open your cart' },
};

function readFilter(params: URLSearchParams): NotificationFilter {
  const value = params.get('filter');
  return (NOTIFICATION_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as NotificationFilter)
    : 'all';
}

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params);
  const badge = useUnreadNotifications();
  const toast = useToast();

  const { state, retry } = useAsync(
    async (signal) => unwrap(await getMyNotifications({ filter }, signal)),
    { key: filter },
  );
  // Rows whose read state this page changed since the list was loaded, so the
  // list updates at once instead of waiting for a refetch.
  const [readNow, setReadNow] = useState<Record<string, string>>({});
  const [older, setOlder] = useState<{
    key: string;
    items: NotificationItem[];
    /** Null once the list is exhausted, which is not the same as untouched. */
    cursor: string | null;
    loaded: boolean;
  }>({ key: '', items: [], cursor: null, loaded: false });
  const [busy, setBusy] = useState(false);

  const page = state.status === 'success' ? state.data : undefined;
  // Anything loaded under the other filter is not part of this list.
  const appended =
    older.key === filter ? older : { key: filter, items: [], cursor: null, loaded: false };
  const items = [...(page?.items ?? []), ...appended.items].map((item) => ({
    ...item,
    readAt: item.readAt ?? readNow[item.id] ?? null,
  }));
  const unread = items.filter((item) => item.readAt === null).length;
  // Once a page has been appended ITS cursor is the truth, including when it
  // is null: falling back to the first page's would offer "Load more" forever.
  const cursor = appended.loaded ? appended.cursor : (page?.nextCursor ?? null);

  const markOne = useCallback(
    async (id: string) => {
      const response = await markNotificationRead(id);
      if (!response.success) {
        toast.show({ tone: 'danger', title: 'It could not be marked', message: response.message });
        return;
      }
      setReadNow((current) => ({ ...current, [id]: new Date().toISOString() }));
      badge?.setUnread(response.data.unread);
    },
    [badge, toast],
  );

  const markAll = useCallback(async () => {
    setBusy(true);
    try {
      const response = await markAllNotificationsRead();
      if (!response.success) {
        toast.show({ tone: 'danger', title: 'Nothing was marked', message: response.message });
        return;
      }
      badge?.setUnread(response.data.unread);
      toast.show({ tone: 'success', title: response.message ?? 'All marked as read.' });
      // Under "Unread" the list is now empty, so reload rather than leave rows
      // that no longer belong to it.
      retry();
      setReadNow({});
      setOlder({ key: filter, items: [], cursor: null, loaded: false });
    } finally {
      setBusy(false);
    }
  }, [badge, filter, retry, toast]);

  const loadMore = useCallback(async () => {
    if (!cursor) {
      return;
    }
    setBusy(true);
    try {
      const response = await getMyNotifications({ filter, cursor });
      if (response.success) {
        setOlder((current) => ({
          key: filter,
          items: [...(current.key === filter ? current.items : []), ...response.data.items],
          cursor: response.data.nextCursor,
          loaded: true,
        }));
      }
    } finally {
      setBusy(false);
    }
  }, [cursor, filter]);

  return (
    <>
      <PageHeader
        title="Notifications"
        kicker="Your record"
        description="Messages about your registration, newest first."
        actions={
          unread > 0 ? (
            <Button
              variant="secondary"
              iconStart={Check}
              onClick={() => void markAll()}
              disabled={busy}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      <div className={styles.body}>
        <div className={styles.filters} role="group" aria-label="Show">
          {NOTIFICATION_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.filter}
              aria-pressed={filter === option}
              onClick={() => {
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    if (option === 'all') {
                      next.delete('filter');
                    } else {
                      next.set('filter', option);
                    }
                    return next;
                  },
                  { replace: true },
                );
              }}
            >
              {option === 'unread' ? 'Unread' : 'All'}
            </button>
          ))}
        </div>

        {state.status === 'error' && (
          <ErrorMessage
            title="Your notifications couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}

        {(state.status === 'loading' || state.status === 'idle') && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="4.5rem" />
            <Skeleton height="4.5rem" />
            <Skeleton height="4.5rem" />
          </div>
        )}

        {page && items.length === 0 && (
          <EmptyState
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            icon={filter === 'unread' ? BellOff : Bell}
          >
            <p>
              {filter === 'unread'
                ? 'You have read everything. Switch to "All" to look back over older messages.'
                : 'You’ll be told here when results are published or when a waitlisted seat becomes yours.'}
            </p>
          </EmptyState>
        )}

        {items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <Message item={item} onRead={markOne} />
              </li>
            ))}
          </ul>
        )}

        {cursor && (
          <div className={styles.more}>
            <Button variant="secondary" onClick={() => void loadMore()} disabled={busy}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function Message({
  item,
  onRead,
}: {
  item: NotificationItem;
  onRead: (id: string) => Promise<void>;
}) {
  const isUnread = item.readAt === null;
  const destination = DESTINATIONS[item.type];
  return (
    <article className={styles.message} data-unread={isUnread}>
      <p className={styles.state}>
        {/* Icon AND text: unread is never carried by colour alone. */}
        <Icon icon={isUnread ? Circle : Check} size={16} />
        <span className={styles.stateLabel}>{isUnread ? 'Unread' : 'Read'}</span>
      </p>
      <div className={styles.text}>
        <h2 className={styles.title}>{item.title}</h2>
        <p className={styles.bodyText}>{item.body}</p>
        <p className={styles.meta}>
          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
          <Link to={destination.to} className={styles.link}>
            {destination.label}
          </Link>
        </p>
      </div>
      {isUnread && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onRead(item.id)}
          aria-label={`Mark "${item.title}" as read`}
        >
          Mark as read
        </Button>
      )}
    </article>
  );
}
