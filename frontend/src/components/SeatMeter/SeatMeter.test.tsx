import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filledDots, SEAT_DOTS, SeatMeter } from './SeatMeter';

describe('SeatMeter', () => {
  it('exposes an accessible meter with exact numbers', () => {
    render(<SeatMeter allocated={37} capacity={50} label="Seats in Machine Learning" />);
    const meter = screen.getByRole('meter', { name: 'Seats in Machine Learning' });

    expect(meter).toHaveAttribute('aria-valuenow', '37');
    expect(meter).toHaveAttribute('aria-valuemax', '50');
    expect(meter).toHaveAttribute('aria-valuetext', '37 of 50 allocated, 13 left');
    expect(screen.getByText('13 left')).toBeInTheDocument();
  });

  it('says "Full" in words, not only in colour', () => {
    const { container } = render(<SeatMeter allocated={20} capacity={20} demand={114} />);

    expect(container.firstElementChild).toHaveAttribute('data-level', 'full');
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Demand 5.7×')).toBeInTheDocument();
  });
});

describe('filledDots', () => {
  it('scales any capacity onto the same twenty dots', () => {
    expect(filledDots(0, 20)).toBe(0);
    expect(filledDots(10, 20)).toBe(10);
    expect(filledDots(20, 20)).toBe(SEAT_DOTS);
    // 40 of 80 is the same picture as 10 of 20.
    expect(filledDots(40, 80)).toBe(10);
  });

  it('keeps nearly-full and full distinguishable', () => {
    // 59 of 60 rounds to 20 dots, which would draw it exactly like a full
    // course — the one distinction the matrix exists to make.
    expect(filledDots(59, 60)).toBe(SEAT_DOTS - 1);
    expect(filledDots(60, 60)).toBe(SEAT_DOTS);
    // And one seat taken out of eighty still shows as taken.
    expect(filledDots(1, 80)).toBe(1);
  });

  it('treats a capacity of zero, and an overfull course, as full', () => {
    expect(filledDots(0, 0)).toBe(SEAT_DOTS);
    expect(filledDots(25, 20)).toBe(SEAT_DOTS);
  });
});
