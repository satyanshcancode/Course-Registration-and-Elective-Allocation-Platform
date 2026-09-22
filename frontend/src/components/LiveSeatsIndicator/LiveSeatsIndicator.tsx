import { Activity, CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatUpdatedAgo } from '../../utils/courseText';
import { Icon } from '../Icon';
import styles from './LiveSeatsIndicator.module.css';

export interface LiveSeatsIndicatorProps {
  /** When the numbers were last confirmed current; null before the first poll. */
  updatedAt: Date | null;
  failing?: boolean;
}

/**
 * "Seats updated 8s ago". Deliberately not a live region: announcing every
 * refresh would drown out everything else for screen-reader users.
 */
export function LiveSeatsIndicator({ updatedAt, failing = false }: LiveSeatsIndicatorProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  if (failing) {
    return (
      <p className={styles.indicator} data-state="failing">
        <Icon icon={CloudOff} />
        <span>
          Live seats paused · retrying
          {updatedAt && ` · last updated ${formatUpdatedAgo(updatedAt, now)}`}
        </span>
      </p>
    );
  }
  return (
    <p className={styles.indicator} data-state={updatedAt ? 'live' : 'connecting'}>
      <Icon icon={Activity} />
      <span>
        {updatedAt ? `Seats updated ${formatUpdatedAgo(updatedAt, now)}` : 'Checking seats…'}
      </span>
    </p>
  );
}
