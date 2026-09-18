import styles from './StatusBadge.module.css';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

/** Symbol + text so status is never conveyed by colour alone. */
const TONE_SYMBOL: Record<StatusTone, string> = {
  success: '✓',
  warning: '!',
  danger: '✕',
  neutral: '•',
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      <span className={styles.symbol} aria-hidden="true">
        {TONE_SYMBOL[tone]}
      </span>
      {label}
    </span>
  );
}
