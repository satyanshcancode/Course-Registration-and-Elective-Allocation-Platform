import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filledPercent, SeatMeter } from './SeatMeter';

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

  it('warns that a course is filling in words as well as in tone', () => {
    const { container } = render(<SeatMeter allocated={45} capacity={50} />);

    expect(container.firstElementChild).toHaveAttribute('data-level', 'filling');
    expect(screen.getByText('Filling')).toBeInTheDocument();
  });
});

describe('filledPercent', () => {
  it('draws the share of seats taken', () => {
    expect(filledPercent(0, 20)).toBe(0);
    expect(filledPercent(10, 20)).toBe(50);
    expect(filledPercent(20, 20)).toBe(100);
    // 40 of 80 is the same picture as 10 of 20.
    expect(filledPercent(40, 80)).toBe(50);
  });

  it('keeps nearly-full and full distinguishable', () => {
    // 59 of 60 rounds to 98%, which still leaves a visible sliver empty — the
    // one distinction the bar exists to make.
    expect(filledPercent(59, 60)).toBe(98);
    expect(filledPercent(60, 60)).toBe(100);
    // And one seat taken out of eighty still shows as taken.
    expect(filledPercent(1, 80)).toBe(2);
  });

  it('treats a capacity of zero, and an overfull course, as full', () => {
    expect(filledPercent(0, 0)).toBe(100);
    expect(filledPercent(25, 20)).toBe(100);
  });
});
