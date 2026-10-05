import { CalendarCheck } from 'lucide-react';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import { useRegistrationWindow } from '../hooks/useRegistrationWindow';
import { useServerClock } from '../hooks/useServerClock';
import { describeCountdown } from '../utils/countdown';
import { presentStatus } from '../components/StatusBadge/statusPresentation';
import styles from './SidebarWindowCard.module.css';

/**
 * The registration window, pinned to the foot of the sidebar: which window,
 * what it is doing, and how long is left. It reads the window the student area
 * already loaded once (useRegistrationWindow), so it costs no extra request.
 *
 * Outside that provider — the administration area — the hook returns null and
 * this renders nothing, which is why it is a component rather than markup in
 * AppShell.
 *
 * The countdown ticks once a second and sits in no live region, for the same
 * reason RegistrationStatusBanner's does: an announcement every second would
 * make the page unusable.
 */
export function SidebarWindowCard() {
  const registration = useRegistrationWindow();
  const state = registration?.state;
  const data = state?.status === 'success' ? state.data : undefined;
  const clock = useServerClock(data?.clockOffsetMs ?? 0, data !== undefined);

  if (!registration || state?.status === 'error') {
    return null;
  }
  if (!data) {
    return (
      <div className={styles.card}>
        <Skeleton lines={2} />
      </div>
    );
  }
  if (!data.window) {
    return <p className={styles.card}>No window scheduled yet.</p>;
  }

  const countdown = describeCountdown(data.window, clock);

  return (
    <div className={styles.card}>
      <span className={styles.tile}>
        <Icon icon={CalendarCheck} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{data.window.name}</span>
        <span className={styles.status}>{presentStatus('window', data.window.status).label}</span>
        <span className={styles.countdown}>
          {countdown.remaining ? (
            <>
              {countdown.label} <strong>{countdown.remaining}</strong>
            </>
          ) : (
            countdown.text
          )}
        </span>
      </span>
    </div>
  );
}
