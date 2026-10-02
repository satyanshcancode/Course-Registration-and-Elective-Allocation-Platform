import { Link } from 'react-router';
import styles from './Wordmark.module.css';

interface WordmarkProps {
  /** Where the wordmark links (the user's home, or the sign-in page). */
  to: string;
  /** Hide the office line on the narrowest screens, keeping the name. */
  compact?: boolean;
}

/**
 * Four seats, three taken and one still open — the same dot matrix the
 * catalogue draws beside every course, at its smallest possible size. The mark
 * and the product are about the one seat that is left.
 */
function SeatMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle className={styles.taken} cx="6" cy="6" r="3" />
      <circle className={styles.taken} cx="14" cy="6" r="3" />
      <circle className={styles.taken} cx="6" cy="14" r="3" />
      <circle className={styles.open} cx="14" cy="14" r="2.25" />
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
