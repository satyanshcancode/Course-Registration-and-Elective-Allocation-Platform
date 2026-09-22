import type { RegistrationWindowSummary } from '@course-reg/shared';
import { useEffect, useState } from 'react';
import { describeWindow } from '../../utils/courseText';
import { StatusBadge } from '../StatusBadge';
import styles from './WindowStatus.module.css';

export interface WindowStatusProps {
  window: RegistrationWindowSummary;
  /** Server clock minus device clock, so "Opens in 2 days" uses the server's time. */
  clockOffsetMs?: number;
}

const REFRESH_MS = 30_000;

/** The registration window's status badge and a plain-language line about timing. */
export function WindowStatus({ window, clockOffsetMs = 0 }: WindowStatusProps) {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setDeviceNow(Date.now());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <p className={styles.status}>
      <StatusBadge kind="window" status={window.status} />
      <span>{describeWindow(window, new Date(deviceNow + clockOffsetMs))}</span>
    </p>
  );
}
