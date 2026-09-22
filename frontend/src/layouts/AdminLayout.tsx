import { AppShell } from './AppShell';
import { ADMIN_NAV } from './navigation';

export function AdminLayout() {
  return (
    <AppShell
      navLabel="Administration"
      areaLabel="Administration"
      homePath="/admin/dashboard"
      items={ADMIN_NAV}
      footerNote="Course Registration · Registrar administration"
    />
  );
}
