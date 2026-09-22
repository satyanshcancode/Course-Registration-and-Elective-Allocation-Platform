/** Merging polled seat numbers into courses that were loaded earlier. */
import type { CourseSeats, SeatSnapshot } from '@course-reg/shared';

export type SeatsByCode = ReadonlyMap<string, CourseSeats>;

/** A course as the catalogue shows it: seat numbers plus the derived ratio. */
export interface SeatedCourse extends CourseSeats {
  demandRatio: number | null;
}

export function indexSeats(snapshot: SeatSnapshot): SeatsByCode {
  return new Map(snapshot.courses.map((seats) => [seats.code, seats]));
}

function sameNumbers(a: CourseSeats, b: CourseSeats): boolean {
  return (
    a.capacity === b.capacity &&
    a.allocated === b.allocated &&
    a.available === b.available &&
    a.demand === b.demand
  );
}

/** Codes whose numbers differ between two snapshots (new or removed codes too). */
export function changedCodes(previous: SeatsByCode, next: SeatsByCode): Set<string> {
  const codes = new Set([...previous.keys(), ...next.keys()]);
  return new Set(
    [...codes].filter((code) => {
      const before = previous.get(code);
      const after = next.get(code);
      return !before || !after || !sameNumbers(before, after);
    }),
  );
}

/** Same rounding as the server: two decimals, null without seats. */
export function demandRatioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? Math.round((demand / capacity) * 100) / 100 : null;
}

/**
 * The course with the latest seat numbers. Returns the same object when
 * nothing changed, so unchanged cards keep their identity.
 */
export function withLiveSeats<T extends SeatedCourse>(course: T, seats: SeatsByCode | null): T {
  const live = seats?.get(course.code);
  if (!live || sameNumbers(course, live)) {
    return course;
  }
  return {
    ...course,
    capacity: live.capacity,
    allocated: live.allocated,
    available: live.available,
    demand: live.demand,
    demandRatio: demandRatioOf(live.demand, live.capacity),
  };
}

/**
 * The polled seats, but only if they are newer than data loaded at
 * `loadedAt` (server time). A catalogue fetched after the last poll is
 * fresher than that poll, so it must not be overwritten with older numbers.
 */
export function seatsNewerThan(
  snapshot: SeatSnapshot | null,
  seats: SeatsByCode | null,
  loadedAt: string,
): SeatsByCode | null {
  return snapshot && seats && Date.parse(snapshot.serverTime) >= Date.parse(loadedAt)
    ? seats
    : null;
}
