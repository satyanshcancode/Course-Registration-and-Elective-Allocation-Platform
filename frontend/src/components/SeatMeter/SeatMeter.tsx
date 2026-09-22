import type { CSSWithVariables } from '../../types/css';
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
 * Seat availability as a slim bar with the exact numbers beside it:
 * "37 of 50 allocated · 13 left". The tone changes as it fills, but the
 * numbers (and "Full") always carry the meaning.
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
  const percent = capacity > 0 ? Math.min(100, (allocated / capacity) * 100) : 100;
  const valueText = `${allocated} of ${capacity} allocated, ${left} left`;
  const style: CSSWithVariables = { '--fill': `${percent.toFixed(1)}%` };

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
        <span className={styles.fill} style={style} />
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
