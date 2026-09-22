import { AppShell } from './AppShell';
import { STUDENT_NAV } from './navigation';

export function StudentLayout() {
  return (
    <AppShell
      navLabel="Student"
      areaLabel="Student"
      homePath="/student/dashboard"
      items={STUDENT_NAV}
      helpPath="/student/help"
    />
  );
}
