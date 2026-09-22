import { describe, expect, it } from 'vitest';
import { hasErrors, validateCapacityForm } from './capacityForm';

const offering = { capacity: 20, allocated: 12 };

describe('validateCapacityForm', () => {
  it('accepts a new whole number at or above the allocated seats, with a reason', () => {
    expect(validateCapacityForm({ capacity: '12', reason: 'Room is smaller' }, offering)).toEqual(
      {},
    );
    expect(validateCapacityForm({ capacity: '30', reason: 'Second lab room' }, offering)).toEqual(
      {},
    );
  });

  it.each([
    ['', 'Enter the new capacity.'],
    ['2.5', 'Enter a whole number of seats.'],
    ['-3', 'Enter a whole number of seats.'],
    ['11', 'Capacity can’t be lower than 12: that many seats are already allocated.'],
    ['1001', 'Capacity can be at most 1000.'],
    ['20', 'Capacity is already 20.'],
  ])('capacity %j gives "%s"', (capacity, message) => {
    expect(validateCapacityForm({ capacity, reason: 'Room is smaller' }, offering).capacity).toBe(
      message,
    );
  });

  it('requires a meaningful reason and reports every problem at once', () => {
    const errors = validateCapacityForm({ capacity: '5', reason: '  ok ' }, offering);
    expect(Object.keys(errors).sort()).toEqual(['capacity', 'reason']);
    expect(hasErrors(errors)).toBe(true);
  });
});
