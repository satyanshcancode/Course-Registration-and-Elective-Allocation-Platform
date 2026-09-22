import { Link } from 'react-router';
import styles from './Wordmark.module.css';

interface WordmarkProps {
  /** Where the wordmark links (the user's home, or the sign-in page). */
  to: string;
  /** Hide the words on the narrowest screens, keeping the mark. */
  compact?: boolean;
}

/** An index card with ruled lines: the catalogue, drawn in two strokes. */
function CatalogueMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.75" y="5.75" width="16.5" height="12.5" rx="1.25" />
      <path d="M7 9.75h10M7 12.5h10M7 15.25h6" />
      <path className={styles.tab} d="M15.5 5.75v-2h3v2" />
    </svg>
  );
}

export function Wordmark({ to, compact = false }: WordmarkProps) {
  return (
    <Link to={to} className={styles.wordmark} data-compact={compact ? 'true' : undefined}>
      <CatalogueMark />
      <span className={styles.words}>
        <span className={styles.name}>Course Registration</span>
        <span className={styles.office}>University Registrar</span>
      </span>
    </Link>
  );
}
