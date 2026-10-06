import type { RegistrationWindowSummary } from '@course-reg/shared';
import { ArrowRight } from 'lucide-react';
import { Link, type To } from 'react-router';
import { describeCountdown } from '../../utils/countdown';
import { Icon } from '../Icon';
import { StatusBadge } from '../StatusBadge';
import styles from './WindowCard.module.css';

export interface WindowCardProps {
  window: RegistrationWindowSummary | null;
  /** The server's clock, so the countdown is not the device's guess. */
  clock: Date;
  /** Makes the whole card a link, and draws the arrow the target shows. */
  to?: To;
  /** The window's name instead of its status badge, for a quieter header. */
  variant?: 'status' | 'name';
}

/**
 * The small card at the top right of a page header: which window, and how
 * long is left of it.
 *
 * Two shapes, because the target uses both — the dashboard leads with the
 * status badge and offers the arrow through to where the time is spent, and
 * the other pages lead with the window's name and go nowhere.
 *
 * The countdown sits in no live region: it ticks once a second, and an
 * announcement every second would make the page unusable.
 */
export function WindowCard({ window, clock, to, variant = 'status' }: WindowCardProps) {
  if (!window) {
    return null;
  }
  const countdown = describeCountdown(window, clock);
  const body = (
    <>
      <span className={styles.top}>
        {variant === 'status' ? (
          <StatusBadge kind="window" status={window.status} />
        ) : (
          <span className={styles.name}>{window.name}</span>
        )}
      </span>
      <span className={styles.bottom}>
        {countdown.remaining ? (
          <>
            {countdown.label} <strong className={styles.value}>{countdown.remaining}</strong>
          </>
        ) : (
          countdown.text
        )}
      </span>
      {to && <Icon icon={ArrowRight} className={styles.arrow} />}
    </>
  );

  return to ? (
    <Link to={to} className={styles.card} data-link="true">
      {body}
    </Link>
  ) : (
    <div className={styles.card}>{body}</div>
  );
}
