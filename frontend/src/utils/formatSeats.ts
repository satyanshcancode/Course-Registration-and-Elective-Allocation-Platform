/** How full an offering is; drives the seat meter's tone (always with text). */
export type SeatFillLevel = 'open' | 'filling' | 'full';

/** At or above this share of seats taken, a course counts as "filling". */
export const FILLING_THRESHOLD = 0.8;

export function seatsLeft(allocated: number, capacity: number): number {
  return Math.max(0, capacity - allocated);
}

export function seatFillLevel(allocated: number, capacity: number): SeatFillLevel {
  if (capacity <= 0 || allocated >= capacity) {
    return 'full';
  }
  return allocated / capacity >= FILLING_THRESHOLD ? 'filling' : 'open';
}

/** "13 of 50 seats left", "1 of 50 seats left", "No seats left (50 of 50 taken)". */
export function formatSeatsLeft(allocated: number, capacity: number): string {
  const left = seatsLeft(allocated, capacity);
  if (left === 0) {
    return `No seats left (${capacity} of ${capacity} taken)`;
  }
  return `${left} of ${capacity} ${capacity === 1 ? 'seat' : 'seats'} left`;
}

/** "37 of 50 allocated". */
export function formatAllocated(allocated: number, capacity: number): string {
  return `${allocated} of ${capacity} allocated`;
}

/**
 * Demand relative to seats: "3.2×", "0.6×", "12×", and "<0.1×" rather than a
 * misleading "0.0×" for a handful of requests. Returns an em dash when there
 * are no seats to compare against.
 */
export function formatDemandRatio(demand: number, capacity: number): string {
  if (capacity <= 0) {
    return '—';
  }
  const ratio = demand / capacity;
  if (ratio > 0 && ratio < 0.05) {
    return '<0.1×';
  }
  return `${ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1)}×`;
}
