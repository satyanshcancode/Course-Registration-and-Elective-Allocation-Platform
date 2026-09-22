import { describe, expect, it } from 'vitest';
import {
  formatAllocated,
  formatDemandRatio,
  formatSeatsLeft,
  seatFillLevel,
  seatsLeft,
} from './formatSeats';

describe('formatSeats', () => {
  it('counts seats left, never below zero', () => {
    expect(seatsLeft(37, 50)).toBe(13);
    expect(seatsLeft(52, 50)).toBe(0);
  });

  it('describes remaining seats in plain words', () => {
    expect(formatSeatsLeft(37, 50)).toBe('13 of 50 seats left');
    expect(formatSeatsLeft(49, 50)).toBe('1 of 50 seats left');
    expect(formatSeatsLeft(0, 1)).toBe('1 of 1 seat left');
    expect(formatSeatsLeft(50, 50)).toBe('No seats left (50 of 50 taken)');
    expect(formatAllocated(37, 50)).toBe('37 of 50 allocated');
  });

  it('classifies fill level', () => {
    expect(seatFillLevel(10, 50)).toBe('open');
    expect(seatFillLevel(40, 50)).toBe('filling');
    expect(seatFillLevel(50, 50)).toBe('full');
    expect(seatFillLevel(0, 0)).toBe('full');
  });

  it('formats demand ratios', () => {
    expect(formatDemandRatio(114, 20)).toBe('5.7×');
    expect(formatDemandRatio(64, 20)).toBe('3.2×');
    expect(formatDemandRatio(25, 40)).toBe('0.6×');
    expect(formatDemandRatio(240, 20)).toBe('12×');
    expect(formatDemandRatio(5, 0)).toBe('—');
    expect(formatDemandRatio(2, 50)).toBe('<0.1×');
    expect(formatDemandRatio(0, 50)).toBe('0.0×');
  });
});
