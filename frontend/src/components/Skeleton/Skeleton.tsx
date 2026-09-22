import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** Number of text lines (the last one is shorter). */
  lines?: number;
  /** CSS width of each line, e.g. "12rem" or "60%". */
  width?: string;
  /** Render one block of this CSS height instead of text lines. */
  height?: string;
}

/**
 * Placeholder shapes while content loads. Purely visual (aria-hidden): the
 * surrounding region carries aria-busy and a text status for screen readers.
 */
export function Skeleton({ lines = 1, width, height }: SkeletonProps) {
  if (height) {
    return (
      <span
        className={styles.block}
        style={{ height, width } satisfies CSSProperties}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={styles.line}
          style={{ width: lines > 1 && index === lines - 1 ? '60%' : width }}
        />
      ))}
    </span>
  );
}
