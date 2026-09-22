import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeatMeter } from './SeatMeter';

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
