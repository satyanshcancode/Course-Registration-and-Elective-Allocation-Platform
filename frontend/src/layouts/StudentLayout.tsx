import { CartProvider, useCart } from '../hooks/useCart';
import { RegistrationWindowProvider } from '../hooks/useRegistrationWindow';
import {
  UnreadNotificationsProvider,
  useUnreadNotifications,
} from '../hooks/useUnreadNotifications';
import { AppShell } from './AppShell';
import { STUDENT_NAV, type NavItem } from './navigation';

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

  const badge = (item: NavItem) => {
    if (item.to === '/student/cart' && count > 0) {
      return (
        <>
          {count}
          <span className="visually-hidden"> {count === 1 ? 'course' : 'courses'} ranked</span>
        </>
      );
    }
    if (item.to === '/student/notifications' && unread > 0) {
      return (
        <>
          {unread}
          <span className="visually-hidden"> unread</span>
        </>
      );
    }
    return null;
  };

  return (
    <AppShell
      navLabel="Student"
      areaLabel="Student"
      homePath="/student/dashboard"
      items={STUDENT_NAV}
      helpPath="/student/help"
      itemBadge={badge}
    />
  );
}
