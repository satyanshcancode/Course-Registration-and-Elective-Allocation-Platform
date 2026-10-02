import {
  formatDemandRatio,
  seatFillLevel,
  seatsLeft,
  type SeatFillLevel,
} from '../../utils/formatSeats';
import styles from './SeatMeter.module.css';

export interface SeatMeterProps {
  allocated: number;
  capacity: number;
  /** Accessible name of the meter, e.g. "Seats in Artificial Intelligence". */
  label?: string;
  /** Number of students who ranked the course; shows a demand ratio. */
  demand?: number;
  /** Numbers only, no "allocated" wording (for dense table cells). */
  compact?: boolean;
}

const LEVEL_WORDS: Record<SeatFillLevel, string | null> = {
  open: null,
  filling: 'Filling',
  full: 'Full',
};

/**
 * How many of the twenty dots are filled.
 *
 * Twenty whatever the capacity: one dot per seat would make an 80-seat course
 * four times the height of a 20-seat one, and the row has to stay the same
 * height down the page. A course with any seat taken keeps at least one dot
 * filled, and one with any seat left keeps at least one empty — otherwise a
 * nearly-full course and a full one would look identical, which is the one
 * distinction this drawing exists to make.
 */
export const SEAT_DOTS = 20;

export function filledDots(allocated: number, capacity: number): number {
  if (capacity <= 0 || allocated >= capacity) {
    return SEAT_DOTS;
  }
  if (allocated <= 0) {
    return 0;
  }
  const scaled = Math.round((allocated / capacity) * SEAT_DOTS);
  return Math.min(SEAT_DOTS - 1, Math.max(1, scaled));
}

/**
 * Seat availability as a twenty-dot matrix with the exact numbers beside it:
 * "37 of 50 allocated · 13 left". The dots give the proportion at a glance and
 * the tone changes as it fills, but the numbers (and the word "Full") always
 * carry the meaning — the drawing is never the only signal.
 */
export function SeatMeter({
  allocated,
  capacity,
  label = 'Seats allocated',
  demand,
  compact = false,
}: SeatMeterProps) {
  const left = seatsLeft(allocated, capacity);
  const level = seatFillLevel(allocated, capacity);
  const filled = filledDots(allocated, capacity);
  const valueText = `${allocated} of ${capacity} allocated, ${left} left`;

  return (
    <div className={styles.meter} data-level={level} data-compact={compact ? 'true' : undefined}>
      <div
        className={styles.dots}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(allocated, capacity)}
        aria-valuetext={valueText}
      >
        {Array.from({ length: SEAT_DOTS }, (_, index) => (
          <span
            key={index}
            className={styles.dot}
            data-taken={index < filled ? 'true' : undefined}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className={styles.numbers} aria-hidden="true">
        {compact ? (
          <>
            <data value={allocated}>{allocated}</data>/<data value={capacity}>{capacity}</data>
          </>
        ) : (
          <>
            <data value={allocated}>{allocated}</data> of <data value={capacity}>{capacity}</data>{' '}
            allocated
            <span className={styles.separator}> · </span>
            <strong className={styles.left}>{left === 0 ? 'none left' : `${left} left`}</strong>
          </>
        )}
        {LEVEL_WORDS[level] && <span className={styles.level}>{LEVEL_WORDS[level]}</span>}
        {demand !== undefined && (
          <span className={styles.demand}>Demand {formatDemandRatio(demand, capacity)}</span>
        )}
      </p>
    </div>
  );
}
