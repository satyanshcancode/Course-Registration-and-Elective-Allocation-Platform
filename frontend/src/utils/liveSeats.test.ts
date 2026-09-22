import { describe, expect, it } from 'vitest';
import { makeCourse, seatSnapshot } from '../test/catalogueFixtures';
import { changedCodes, indexSeats, seatsNewerThan, withLiveSeats } from './liveSeats';

describe('live seats', () => {
  const course = makeCourse({ capacity: 20, allocated: 0, available: 20, demand: 114 });

  it('merges newer numbers and recomputes the demand ratio', () => {
    const snapshot = seatSnapshot([course], { CS401: { allocated: 5 } });
    const merged = withLiveSeats({ ...course, demand: 100 }, indexSeats(snapshot));
    expect(merged).toMatchObject({ allocated: 5, available: 15, demand: 114, demandRatio: 5.7 });
  });

  it('returns the same object when nothing changed, so cards keep their identity', () => {
    expect(withLiveSeats(course, indexSeats(seatSnapshot([course])))).toBe(course);
    expect(withLiveSeats(course, null)).toBe(course);
  });

  it('lists exactly the codes whose numbers changed', () => {
    const other = makeCourse({ code: 'CS402' });
    const before = indexSeats(seatSnapshot([course, other]));
    const after = indexSeats(seatSnapshot([course, other], { CS402: { allocated: 3 } }));
    expect([...changedCodes(before, after)]).toEqual(['CS402']);
    expect(changedCodes(after, after).size).toBe(0);
  });

  it('ignores a poll that is older than the loaded data', () => {
    const snapshot = seatSnapshot([course], {}, '2026-09-22T09:00:00.000Z');
    const seats = indexSeats(snapshot);
    expect(seatsNewerThan(snapshot, seats, '2026-09-22T08:59:59.000Z')).toBe(seats);
    expect(seatsNewerThan(snapshot, seats, '2026-09-22T09:00:01.000Z')).toBeNull();
    expect(seatsNewerThan(null, null, '2026-09-22T09:00:00.000Z')).toBeNull();
  });
});
