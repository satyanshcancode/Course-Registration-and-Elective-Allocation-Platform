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
  /** Numbers only, no "seats" wording (for dense table cells). */
  compact?: boolean;
}

const LEVEL_WORDS: Record<SeatFillLevel, string | null> = {
  open: null,
  filling: 'Filling',
  full: 'Full',
};

/**
 * What share of the bar is drawn as taken, 0..100.
 *
 * A course with any seat taken keeps a sliver drawn, and one with any seat
 * left keeps a sliver empty — otherwise a nearly-full course and a full one
 * would look identical, which is the one distinction this drawing exists to
 * make.
 */
export function filledPercent(allocated: number, capacity: number): number {
  if (capacity <= 0 || allocated >= capacity) {
    return 100;
  }
  if (allocated <= 0) {
    return 0;
  }
  return Math.min(98, Math.max(2, Math.round((allocated / capacity) * 100)));
}

/**
 * Seat availability as a bar with the exact numbers beside it: "37 of 50
 * seats · 13 left". The bar gives the proportion at a glance and its tone
 * changes as the course fills, but the numbers (and the word "Full") always
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
  const filled = filledPercent(allocated, capacity);
  const valueText = `${allocated} of ${capacity} allocated, ${left} left`;

  return (
    <div className={styles.meter} data-level={level} data-compact={compact ? 'true' : undefined}>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(allocated, capacity)}
        aria-valuetext={valueText}
      >
        <span className={styles.fill} style={{ inlineSize: `${filled}%` }} />
      </div>
      <p className={styles.numbers} aria-hidden="true">
        <span className={styles.dot} />
        {compact ? (
          <>
            <data value={allocated}>{allocated}</data>/<data value={capacity}>{capacity}</data>
          </>
        ) : (
          <>
            <data value={allocated}>{allocated}</data> of <data value={capacity}>{capacity}</data>{' '}
            seats
            <span className={styles.separator}> · </span>
            <strong className={styles.left}>{left === 0 ? 'Full' : `${left} left`}</strong>
          </>
        )}
        {/* "Full" is already the figure beside the numbers when the course has
            no seats left, so the tag would be saying it twice. */}
        {LEVEL_WORDS[level] && (compact || level !== 'full') && (
          <span className={styles.level}>{LEVEL_WORDS[level]}</span>
        )}
        {demand !== undefined && (
          <span className={styles.demand}>Demand {formatDemandRatio(demand, capacity)}</span>
        )}
      </p>
    </div>
  );
}
