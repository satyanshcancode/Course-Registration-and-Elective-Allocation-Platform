import { CartProvider, useCart } from '../hooks/useCart';
import { RegistrationWindowProvider } from '../hooks/useRegistrationWindow';
import { AppShell } from './AppShell';
import { STUDENT_NAV, type NavItem } from './navigation';

export function StudentLayout() {
  return (
    // One window request and one cart for the whole student area: the status
    // banner, the countdown, the catalogue's add buttons and the cart page all
    // read them from here.
    <RegistrationWindowProvider>
      <CartProvider>
        <StudentShell />
      </CartProvider>
    </RegistrationWindowProvider>
  );
}

/** Inside the providers, so the nav can show how many courses are ranked. */
function StudentShell() {
  const cart = useCart();
  const count = cart?.codes.length ?? 0;

  const badge = (item: NavItem) =>
    item.to === '/student/cart' && count > 0 ? (
      <>
        {count}
        <span className="visually-hidden"> {count === 1 ? 'course' : 'courses'} ranked</span>
      </>
    ) : null;

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
