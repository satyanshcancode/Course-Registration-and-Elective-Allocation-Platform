import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Pair colour with an icon whenever the badge conveys a status. */
  icon?: LucideIcon;
  /** Exposed as data-status for styling hooks and tests. */
  status?: string;
  children: ReactNode;
}

/** A small, square-cornered label: text first, colour second. */
export function Badge({ tone = 'neutral', icon, status, children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone} data-status={status}>
      {icon && <Icon icon={icon} />}
      <span>{children}</span>
    </span>
  );
}
