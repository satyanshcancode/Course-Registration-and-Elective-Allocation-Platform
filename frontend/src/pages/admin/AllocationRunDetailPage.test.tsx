import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as allocationApi from '../../api/allocationApi';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { allocationRun } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { AllocationRunDetailPage } from './AllocationRunDetailPage';

vi.mock('../../api/allocationApi', () => ({
  getAllocationRun: vi.fn(),
  verifyAllocationRun: vi.fn(),
}));

const allocation = vi.mocked(allocationApi);

const renderPage = () =>
  renderRoute(<AllocationRunDetailPage />, {
    path: '/admin/allocation-runs/:id',
    url: '/admin/allocation-runs/11111111-2222-3333-4444-555555555555',
  });

beforeEach(() => {
  vi.clearAllMocks();
  allocation.getAllocationRun.mockResolvedValue(ok(allocationRun()));
});

describe('AllocationRunDetailPage', () => {
  it('reads the run’s metrics as figures, label over value, in one card', async () => {
    const { container } = renderPage();

    const outcome = (await screen.findByRole('heading', { name: 'Outcome' })).closest('article');
    const card = within(outcome!);
    expect(card.getByText('Students placed').nextElementSibling).toHaveTextContent('142 of 150');
    expect(card.getByText('First-choice rate').nextElementSibling).toHaveTextContent('43%');
    expect(card.getByText('Waitlist entries').nextElementSibling).toHaveTextContent('101');
    expect(card.getByText('Justified envy').nextElementSibling).toHaveTextContent('0');
    await expectNoA11yViolations(container, { isolated: false });
  });

  it('says so when the stored result no longer reproduces', async () => {
    const user = userEvent.setup();
    allocation.verifyAllocationRun.mockResolvedValue(
      ok({
        runId: allocationRun().id,
        reproducible: false,
        storedHash: 'a',
        recomputedHash: 'b',
        algorithmVersion: 'deferred-acceptance-1.0.0',
        differences: ['CS401 admitted a different student.'],
        checkedAt: '2026-09-26T09:00:00.000Z',
      }),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Verify reproducibility' }));

    expect(await screen.findByText('Not reproducible')).toBeVisible();
    expect(screen.getByText('CS401 admitted a different student.')).toBeVisible();
  });

  it('shows a failed verification instead of a verdict', async () => {
    const user = userEvent.setup();
    allocation.verifyAllocationRun.mockResolvedValue({
      success: false,
      data: null,
      message: 'The check could not be run.',
      httpStatus: 500,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Verify reproducibility' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The check could not be run.');
    expect(screen.queryByText('Reproducible')).not.toBeInTheDocument();
  });
});
