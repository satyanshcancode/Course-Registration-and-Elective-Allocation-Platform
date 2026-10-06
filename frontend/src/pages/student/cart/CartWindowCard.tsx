import { useRegistrationWindow } from '../../../hooks/useRegistrationWindow';
import { useServerClock } from '../../../hooks/useServerClock';
import { describeCountdown } from '../../../utils/countdown';
import { formatDateTime } from '../../../utils/formatDate';
import styles from './CartPage.module.css';

/**
 * The deadline, beside the cart: which window, how long is left and the date
 * it runs out. It reads the window the student area already loaded, so it
 * costs no extra request, and the countdown sits in no live region — a
 * screen reader announcing it every second would make the page unusable.
 */
export function CartWindowCard() {
  const registration = useRegistrationWindow();
  const state = registration?.state;
  const data = state?.status === 'success' ? state.data : undefined;
  const clock = useServerClock(data?.clockOffsetMs ?? 0, data !== undefined);

  if (!data?.window) {
    return null;
  }
  const countdown = describeCountdown(data.window, clock);

  return (
    <div className={styles.windowCard}>
      <h2 className={styles.windowHeading}>Registration window</h2>
      <p className={styles.windowName}>{data.window.name}</p>
      {countdown.remaining ? (
        <>
          <p className={styles.windowLabel}>{countdown.label}</p>
          <p className={styles.windowValue}>{countdown.remaining}</p>
        </>
      ) : (
        <p className={styles.windowLabel}>{countdown.text}</p>
      )}
      <p className={styles.windowAt}>{formatDateTime(data.window.endsAt)}</p>
    </div>
  );
}
