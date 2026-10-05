import styles from './ProgressRing.module.css';

export interface ProgressRingProps {
  value: number;
  max: number;
  /** What the ring is counting, read out with the numbers. */
  label: string;
  /** Diameter in pixels; the stroke scales with it. */
  size?: number;
}

/**
 * A proportion as a ring with the percentage written in the middle.
 *
 * The percentage is text, not only an arc, so the figure survives a colour
 * nobody can see; the ring carries the same numbers in its accessible name
 * for anyone who meets it as an image.
 */
export function ProgressRing({ value, max, label, size = 104 }: ProgressRingProps) {
  const safeMax = Math.max(1, max);
  const fraction = Math.min(1, Math.max(0, value / safeMax));
  const percent = Math.round(fraction * 100);
  const stroke = size / 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={styles.ring} style={{ inlineSize: `${size}px`, blockSize: `${size}px` }}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${percent}%: ${value} of ${max} ${label}`}
      >
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={styles.value}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          /* Start the arc at twelve o'clock rather than three. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.percent} aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}
