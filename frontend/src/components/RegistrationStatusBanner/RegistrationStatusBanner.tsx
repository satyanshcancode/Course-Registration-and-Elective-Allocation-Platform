import { CalendarClock } from 'lucide-react';
import { useRegistrationWindow } from '../../hooks/useRegistrationWindow';
import { useServerClock } from '../../hooks/useServerClock';
import { describeCountdown } from '../../utils/countdown';
import { formatDateTime } from '../../utils/formatDate';
import { Icon } from '../Icon';
import { Skeleton } from '../Skeleton';
import { StatusBadge } from '../StatusBadge';
import styles from './RegistrationStatusBanner.module.css';

/**
 * The registration window's name, status and live countdown, shown in the
 * page header of every student page.
 *
 * The countdown ticks once a second, and deliberately sits in NO live region:
 * a screen reader announcing "3h 11m 59s" every second would make the page
 * unusable. The text is read normally when the user reaches it.
 */
export function RegistrationStatusBanner() {
  const registration = useRegistrationWindow();
  const state = registration?.state;
  const data = state?.status === 'success' ? state.data : undefined;

  const clock = useServerClock(data?.clockOffsetMs ?? 0, data !== undefined);

  if (!registration || state?.status === 'error') {
    return null;
  }
  if (!data) {
    return <Skeleton width="16rem" />;
  }
  if (!data.window) {
    return <p className={styles.banner}>No registration window has been scheduled yet.</p>;
  }

  const { window } = data;
  const countdown = describeCountdown(window, clock);
  const target = window.status === 'DRAFT' ? window.startsAt : window.endsAt;

  return (
    <p className={styles.banner}>
      <Icon icon={CalendarClock} size={16} />
      <span className={styles.name}>{window.name}</span>
      <StatusBadge kind="window" status={window.status} />
      {countdown.remaining ? (
        <span className={styles.countdown}>
          {countdown.label} <strong className={styles.value}>{countdown.remaining}</strong>
          <span className={styles.at}> · {formatDateTime(target)}</span>
        </span>
      ) : (
        <span className={styles.countdown}>{countdown.text}</span>
      )}
    </p>
  );
}
