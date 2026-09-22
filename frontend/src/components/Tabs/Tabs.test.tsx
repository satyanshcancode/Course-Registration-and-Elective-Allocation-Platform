import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { Tabs } from './Tabs';

const TABS = [
  { id: 'overview', label: 'Overview', panel: <p>Search and planning.</p> },
  { id: 'rules', label: 'Eligibility', panel: <p>Semester 5 or later.</p> },
  { id: 'seats', label: 'Seats', panel: <p>20 of 20 allocated.</p> },
] as const;

describe('Tabs', () => {
  it('uses a roving tabindex: only the selected tab is in the Tab order', async () => {
    const { container } = render(<Tabs label="Course sections" tabs={TABS} />);
    const tabs = screen.getAllByRole('tab');

    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Search and planning.');
    await expectNoA11yViolations(container);
  });

  it('moves focus and selection with arrow keys, Home and End (wrapping)', async () => {
    const user = userEvent.setup();
    render(<Tabs label="Course sections" tabs={TABS} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    const eligibility = screen.getByRole('tab', { name: 'Eligibility' });
    expect(eligibility).toHaveFocus();
    expect(eligibility).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Semester 5 or later.');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Seats' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
  });

  it('links each panel to its tab', () => {
    render(<Tabs label="Course sections" tabs={TABS} defaultSelectedId="seats" />);
    expect(screen.getByRole('tabpanel', { name: 'Seats' })).toHaveTextContent(
      '20 of 20 allocated.',
    );
  });
});
