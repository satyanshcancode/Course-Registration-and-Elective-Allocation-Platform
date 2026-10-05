import { CartProvider, useCart } from '../hooks/useCart';
import { RegistrationWindowProvider } from '../hooks/useRegistrationWindow';
import {
  UnreadNotificationsProvider,
  useUnreadNotifications,
} from '../hooks/useUnreadNotifications';
import { AppShell } from './AppShell';
import { NotificationBell } from './NotificationBell';
import { SidebarWindowCard } from './SidebarWindowCard';
import { STUDENT_NAV, type NavBadge, type NavItem } from './navigation';

export function StudentLayout() {
  return (
    // One window request and one cart for the whole student area: the status
    // banner, the countdown, the catalogue's add buttons and the cart page all
    // read them from here.
    <RegistrationWindowProvider>
      <CartProvider>
        <UnreadNotificationsProvider>
          <StudentShell />
        </UnreadNotificationsProvider>
      </CartProvider>
    </RegistrationWindowProvider>
  );
}

/** Inside the providers, so the nav can show the counts they hold. */
function StudentShell() {
  const cart = useCart();
  const count = cart?.codes.length ?? 0;
  const unread = useUnreadNotifications()?.unread ?? 0;

  const badge = (item: NavItem): NavBadge | null => {
    if (item.to === '/student/cart') {
      return { count, label: count === 1 ? 'course ranked' : 'courses ranked' };
    }
    if (item.to === '/student/notifications') {
      return { count: unread, label: 'unread', tone: 'danger' };
    }
    return null;
  };

  return (
    <AppShell
      navLabel="Student"
      homePath="/student/dashboard"
      searchPath="/student/courses"
      items={STUDENT_NAV}
      itemBadge={badge}
      headerAside={<NotificationBell to="/student/notifications" />}
      navFooter={<SidebarWindowCard />}
    />
  );
}
