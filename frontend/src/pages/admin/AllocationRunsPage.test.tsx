import type { RegistrationWindowStatus } from '@course-reg/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../../api/adminApi';
import * as allocationApi from '../../api/allocationApi';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok } from '../../test/catalogueFixtures';
import { adminWindow, allocationPreview, allocationRun } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { AllocationRunsPage } from './AllocationRunsPage';

vi.mock('../../api/adminApi', () => ({ getRegistrationWindow: vi.fn() }));
vi.mock('../../api/allocationApi', () => ({
  getAllocationRuns: vi.fn(),
  previewAllocation: vi.fn(),
  runAllocation: vi.fn(),
}));

const admin = vi.mocked(adminApi);
const allocation = vi.mocked(allocationApi);

const windowAt = (status: RegistrationWindowStatus) =>
  adminWindow({
    window: { ...fallWindow, status },
    counts: { offeredCourses: 20, eligibleStudents: 118, submissions: 150, totalStudents: 300 },
  });

const renderPage = () =>
  renderRoute(<AllocationRunsPage />, {
    path: '/admin/allocation-runs',
    routes: [
      { path: '/admin/allocation-runs/:id', element: <h1>Run detail</h1> },
      { path: '/admin/registration-window', element: <h1>Window</h1> },
    ],
  });

beforeEach(() => {
  vi.clearAllMocks();
  admin.getRegistrationWindow.mockResolvedValue(ok(windowAt('CLOSED')));
  allocation.getAllocationRuns.mockResolvedValue(ok([]));
  allocation.previewAllocation.mockResolvedValue(ok(allocationPreview));
  allocation.runAllocation.mockResolvedValue(ok(allocationRun()));
});

describe('AllocationRunsPage', () => {
  it('explains that allocation waits for the window to close, while it is open', async () => {
    admin.getRegistrationWindow.mockResolvedValue(ok(windowAt('OPEN')));
    const { container } = renderPage();

    expect(await screen.findByText(/Registration is still open/)).toBeVisible();
    expect(screen.getByRole('link', { name: /close it on the window page/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Run allocation' })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('compares both methods in a table and marks the one that will be used', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByRole('button', { name: 'Preview both methods' });

    await user.click(screen.getByRole('button', { name: 'Preview both methods' }));

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers[1]).toContain('First come, first served');
    expect(headers[2]).toContain('Preference + Priority');
    expect(headers[2]).toContain('Will be used');

    // The row that carries the argument.
    const envyRow = within(table).getByRole('row', { name: /Justified envy/ });
    const cells = within(envyRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[0]).toContain('78');
    expect(cells[1]).toContain('0');
    // Which way is better is said in words, never by colour alone.
    expect(cells[1]).toContain('better (lower)');

    await expectNoA11yViolations(container);
  });

  it('states the trade-offs without claiming one method always wins', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Preview both methods' }));

    expect(await screen.findByText(/What the difference means/)).toBeVisible();
    expect(screen.getByText(/treats a fast connection as merit/)).toBeVisible();
    expect(screen.getByText(/only as good as those rules/)).toBeVisible();
  });

  it('asks for confirmation, says it can only be done once, and then runs', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Run allocation' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/This can only be done once\./)).toBeVisible();
    expect(dialog.getByText(/Preference \+ Priority/)).toBeVisible();

    await user.click(dialog.getByRole('button', { name: 'Run allocation' }));

    await waitFor(() => {
      expect(allocation.runAllocation).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Allocation complete')).toBeVisible();
  });

  it('can be cancelled without running anything', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Run allocation' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(allocation.runAllocation).not.toHaveBeenCalled();
  });

  it('reports a refusal from the server instead of pretending it worked', async () => {
    allocation.runAllocation.mockResolvedValue({
      success: false,
      data: null,
      message: 'Allocation has already been run for this window.',
      httpStatus: 409,
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Run allocation' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Run allocation' }),
    );

    expect(await screen.findByText('Allocation did not run')).toBeVisible();
    expect(screen.getByText('Allocation has already been run for this window.')).toBeVisible();
  });

  it('says allocation is done once the window is allocated', async () => {
    admin.getRegistrationWindow.mockResolvedValue(ok(windowAt('ALLOCATED')));
    allocation.getAllocationRuns.mockResolvedValue(ok([allocationRun()]));
    renderPage();

    expect(await screen.findByText(/Allocation has already run for this window/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Run allocation' })).not.toBeInTheDocument();
  });
});
