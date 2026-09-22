import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { STATUS_PRESENTATION, type StatusKind } from './statusPresentation';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('shows text and an icon, not colour alone', () => {
    const { container } = render(<StatusBadge kind="allocation" status="WAITLISTED" />);
    const badge = container.firstElementChild;

    expect(screen.getByText('Waitlisted')).toBeVisible();
    expect(badge).toHaveAttribute('data-tone', 'warning');
    expect(badge).toHaveAttribute('data-status', 'WAITLISTED');
    // The icon is decorative; the words carry the meaning.
    expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts a more specific label', () => {
    render(<StatusBadge kind="allocation" status="WAITLISTED" label="Waitlisted · #7" />);
    expect(screen.getByText('Waitlisted · #7')).toBeInTheDocument();
  });

  it('has a non-empty label, an icon and a tone for every status of every kind', async () => {
    const kinds = Object.keys(STATUS_PRESENTATION) as StatusKind[];
    const entries = kinds.flatMap((kind) => Object.values(STATUS_PRESENTATION[kind]));

    // 3 allocation + 2 enrollment + 3 waitlist + 2 submission + 4 window + 2 eligibility
    expect(entries).toHaveLength(16);
    for (const entry of entries) {
      expect(entry.label.trim()).not.toBe('');
      expect(entry.icon).toBeDefined();
      expect(entry.tone).toBeTruthy();
    }

    const { container } = render(
      <div>
        <StatusBadge kind="allocation" status="ALLOCATED" />
        <StatusBadge kind="allocation" status="NOT_ALLOCATED" />
        <StatusBadge kind="submission" status="SUBMITTED" />
        <StatusBadge kind="eligibility" status="NOT_ELIGIBLE" />
      </div>,
    );
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getByText('Not allocated')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
