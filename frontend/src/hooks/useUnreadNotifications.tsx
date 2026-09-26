import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import { getUnreadCount } from '../api/activityApi';
import { usePolling } from './usePolling';

export interface UnreadNotificationsValue {
  /** Null until the first count arrives, so the badge shows nothing at all. */
  unread: number | null;
  /**
   * The count the server returned from a mark-as-read call. Marking one read
   * on the notifications page must move the navigation badge at once, not at
   * the next poll — and both replies already carry the number.
   */
  setUnread: (unread: number) => void;
  refresh: () => void;
}

const UnreadNotificationsContext = createContext<UnreadNotificationsValue | null>(null);

/** How often the badge re-checks; the tab must be visible (see usePolling). */
export const UNREAD_POLL_MS = 60_000;

/**
 * One unread count for the whole student area. The navigation badge reads it,
 * and the notifications page writes it from the reply it already has.
 */
export function UnreadNotificationsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void getUnreadCount().then((response) => {
      if (response.success) {
        setUnread(response.data.unread);
      }
      // A failed count is not worth an error state: the badge simply keeps
      // the last number it knew, and the next tick tries again.
    });
  }, []);

  usePolling(refresh, UNREAD_POLL_MS, { immediate: true });

  return (
    <UnreadNotificationsContext value={{ unread, setUnread, refresh }}>
      {children}
    </UnreadNotificationsContext>
  );
}

/** Null outside the provider, e.g. in a test rendering one page alone. */
export function useUnreadNotifications(): UnreadNotificationsValue | null {
  return use(UnreadNotificationsContext);
}
