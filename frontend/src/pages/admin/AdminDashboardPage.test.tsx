import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../../api/adminApi';
import * as allocationApi from '../../api/allocationApi';
import { expectNoA11yViolations } from '../../test/axe';
import { adminOffering, ok } from '../../test/catalogueFixtures';
import { adminWindow } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { AdminDashboardPage } from './AdminDashboardPage';

vi.mock('../../api/adminApi', () => ({
  getRegistrationWindow: vi.fn(),
  getAdminCourses: vi.fn(),
}));
vi.mock('../../api/allocationApi', () => ({ getAllocationRuns: vi.fn() }));

const admin = vi.mocked(adminApi);
const allocation = vi.mocked(allocationApi);

beforeEach(() => {
  vi.clearAllMocks();
  const detail = adminWindow();
  admin.getRegistrationWindow.mockResolvedValue(ok(detail));
  admin.getAdminCourses.mockResolvedValue(
    ok({ window: detail.window, items: [adminOffering({ capacity: 60, allocated: 3 })] }),
  );
  allocation.getAllocationRuns.mockResolvedValue(ok([]));
});

describe('AdminDashboardPage', () => {
  it('shows the window as a card with its name, and figures that never wrap', async () => {
    const { container } = renderRoute(<AdminDashboardPage />, { path: '/admin' });

    const tile = (await screen.findByText('Students eligible for a course')).closest('article')!;
    expect(within(tile).getByText('118/300')).toBeVisible();
    expect(screen.getByText('3/60')).toBeVisible();
    expect(screen.getByText('Fall 2026')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registration window' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('offers a retry when the dashboard cannot be loaded', async () => {
    admin.getRegistrationWindow.mockResolvedValue({
      success: false,
      data: null,
      message: 'The server is unavailable.',
    });
    renderRoute(<AdminDashboardPage />, { path: '/admin' });

    expect(await screen.findByText('The dashboard couldn’t be loaded')).toBeVisible();
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeVisible();
  });
});
