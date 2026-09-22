import styles from './LoadingSpinner.module.css';

export interface LoadingSpinnerProps {
  /** Announced to screen readers; shown when `showLabel` is set. */
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/** The rotating ring on its own, always decorative (used inside Button). */
export function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={styles.spinner} data-size={size} aria-hidden="true" />;
}

/** A loading indicator that tells assistive technology what is happening. */
export function LoadingSpinner({
  label = 'Loading…',
  showLabel = false,
  size = 'md',
}: LoadingSpinnerProps) {
  return (
    <span className={styles.wrapper} role="status">
      <Spinner size={size} />
      <span className={showLabel ? styles.label : 'visually-hidden'}>{label}</span>
    </span>
  );
}
