import { RegistrationWindowProvider } from '../hooks/useRegistrationWindow';
import { AppShell } from './AppShell';
import { STUDENT_NAV } from './navigation';

export function StudentLayout() {
  return (
    // One window request for the whole student area: the status banner, the
    // countdown and the dashboard all read it from here.
    <RegistrationWindowProvider>
      <AppShell
        navLabel="Student"
        areaLabel="Student"
        homePath="/student/dashboard"
        items={STUDENT_NAV}
        helpPath="/student/help"
      />
    </RegistrationWindowProvider>
  );
}
