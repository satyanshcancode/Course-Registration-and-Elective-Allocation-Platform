import { useCanManageStaff } from '../hooks/useAuth';
import { AppShell } from './AppShell';
import { adminNavFor } from './navigation';

export function AdminLayout() {
  // A co-administrator gets the same shell and the same pages, minus Team.
  const items = adminNavFor(useCanManageStaff());
  return (
    <AppShell
      navLabel="Administration"
      areaLabel="Administration"
      homePath="/admin/dashboard"
      items={items}
      footerNote="Allocademy · Registrar administration"
    />
  );
}
