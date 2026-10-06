import { Link } from 'react-router';
import styles from './Wordmark.module.css';

interface WordmarkProps {
  /** Where the wordmark links (the user's home, or the sign-in page). */
  to: string;
  /** Hide the office line on the narrowest screens, keeping the name. */
  compact?: boolean;
}

/**
 * Four seats in a block, three taken and one still open. The mark and the
 * product are both about the one seat that is left.
 */
function SeatMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect className={styles.open} x="2.8" y="2.8" width="7.4" height="7.4" rx="2.4" />
      <circle className={styles.taken} cx="6.5" cy="6.5" r="1.7" />
      <rect className={styles.open} x="13.8" y="2.8" width="7.4" height="7.4" rx="2.4" />
      <circle className={styles.taken} cx="17.5" cy="6.5" r="1.7" />
      <rect className={styles.open} x="2.8" y="13.8" width="7.4" height="7.4" rx="2.4" />
      <circle className={styles.taken} cx="6.5" cy="17.5" r="1.7" />
      <rect className={styles.open} x="13.8" y="13.8" width="7.4" height="7.4" rx="2.4" />
    </svg>
  );
}

export function Wordmark({ to, compact = false }: WordmarkProps) {
  return (
    <Link to={to} className={styles.wordmark} data-compact={compact ? 'true' : undefined}>
      <SeatMark />
      <span className={styles.words}>
        <span className={styles.name}>Allocademy</span>
        <span className={styles.office}>University Registrar</span>
      </span>
    </Link>
  );
}
