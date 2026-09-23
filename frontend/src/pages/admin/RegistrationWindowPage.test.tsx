import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../../api/adminApi';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { adminWindow } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { RegistrationWindowPage } from './RegistrationWindowPage';

vi.mock('../../api/adminApi', () => ({
  getRegistrationWindow: vi.fn(),
  updateRegistrationWindow: vi.fn(),
  openRegistrationWindow: vi.fn(),
  closeRegistrationWindow: vi.fn(),
}));

const api = vi.mocked(adminApi);

function renderWindowPage() {
  return renderRoute(<RegistrationWindowPage />, { path: '/admin/registration-window' });
}

const weight = (rank: number) => screen.getByLabelText(`P${rank}`);

describe('RegistrationWindowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRegistrationWindow.mockResolvedValue(ok(adminWindow()));
  });

  it('shows the schedule, counts and the draft form', async () => {
    renderWindowPage();

    expect(await screen.findByRole('heading', { name: 'Window and policy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Window name')).toHaveValue('Fall 2026');
    const counts = screen.getByLabelText('This window at a glance');
    expect(counts).toHaveTextContent('2 courses offered');
    expect(counts).toHaveTextContent('118 of 300 students eligible for at least one');
    expect(counts).toHaveTextContent('0 submissions so far');
    expect(screen.getByRole('button', { name: 'Open registration' })).toBeInTheDocument();
  });

  it('shows the preference and priority fields for the scoring method', async () => {
    renderWindowPage();
    await screen.findByLabelText('Window name');

    expect(weight(1)).toHaveValue(100);
    expect(weight(5)).toHaveValue(20);
    expect(screen.getByLabelText('Final year (semester 7 or 8)')).toHaveValue(20);
    expect(screen.getByLabelText('Tie-break seed')).toHaveValue(2026091801);
  });

  it('swaps the settings when the method changes, and swaps them back', async () => {
    const user = userEvent.setup();
    renderWindowPage();
    await screen.findByLabelText('Window name');

    await user.click(screen.getByRole('radio', { name: 'First come, first served' }));

    // FCFS has no weights at all — the union has no such field to render.
    expect(screen.queryByLabelText('P1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tie-break seed')).not.toBeInTheDocument();
    expect(screen.getByText(/rewards a fast connection/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Preference + Priority' }));
    expect(screen.getByLabelText('P1')).toHaveValue(100);
    expect(screen.queryByText(/rewards a fast connection/i)).not.toBeInTheDocument();
  });

  it('refuses weights that increase down the list', async () => {
    const user = userEvent.setup();
    renderWindowPage();
    await screen.findByLabelText('Window name');

    // P1 below P2 means a second choice would score higher than a first.
    await user.clear(weight(1));
    await user.type(weight(1), '50');
    await user.click(screen.getByRole('button', { name: 'Save window' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/P2 can’t be worth more than P1/);
    expect(api.updateRegistrationWindow).not.toHaveBeenCalled();
  });

  it('refuses a closing time that is not after the opening one', async () => {
    const user = userEvent.setup();
    renderWindowPage();
    const closes = await screen.findByLabelText('Registration closes');

    await user.clear(closes);
    await user.type(closes, '2026-09-20T09:00');
    await user.click(screen.getByRole('button', { name: 'Save window' }));

    expect(await screen.findByText('Registration must close after it opens.')).toBeInTheDocument();
    expect(api.updateRegistrationWindow).not.toHaveBeenCalled();
  });

  it('refuses a window with no offered courses', async () => {
    const user = userEvent.setup();
    renderWindowPage();
    await screen.findByLabelText('Window name');

    await user.click(screen.getByRole('checkbox', { name: /CS401/ }));
    await user.click(screen.getByRole('checkbox', { name: /CS402/ }));
    await user.click(screen.getByRole('button', { name: 'Save window' }));

    expect(await screen.findByText('Choose at least one course to offer.')).toBeInTheDocument();
  });

  it('saves the chosen courses and policy', async () => {
    const user = userEvent.setup();
    api.updateRegistrationWindow.mockResolvedValue(ok(adminWindow()));
    renderWindowPage();
    await screen.findByLabelText('Window name');

    await user.click(screen.getByRole('checkbox', { name: /ME302/ }));
    await user.click(screen.getByRole('button', { name: 'Save window' }));

    await waitFor(() => {
      expect(api.updateRegistrationWindow).toHaveBeenCalledOnce();
    });
    expect(api.updateRegistrationWindow.mock.calls[0]?.[0]).toMatchObject({
      name: 'Fall 2026',
      term: '2026-FALL',
      courseCodes: ['CS401', 'CS402', 'ME302'],
      policy: { method: 'PREFERENCE_PRIORITY' },
    });
  });

  it('generates a new tie-break seed', async () => {
    const user = userEvent.setup();
    renderWindowPage();
    const seed = await screen.findByLabelText('Tie-break seed');

    await user.click(screen.getByRole('button', { name: 'Generate new seed' }));
    expect(seed).not.toHaveValue(2026091801);
  });

  it('opens registration after confirming what will be frozen', async () => {
    const user = userEvent.setup();
    api.openRegistrationWindow.mockResolvedValue(
      ok(adminWindow({ window: { ...adminWindow().window!, status: 'OPEN' }, editable: false })),
    );
    renderWindowPage();

    await user.click(await screen.findByRole('button', { name: 'Open registration' }));
    const dialog = screen.getByRole('dialog', { name: 'Open registration?' });
    expect(within(dialog).getByText(/This freezes the policy\./)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Reason'), 'Term starts today');
    await user.click(within(dialog).getByRole('button', { name: 'Open registration' }));

    await waitFor(() => {
      expect(api.openRegistrationWindow).toHaveBeenCalledWith({ reason: 'Term starts today' });
    });
    expect(await screen.findByRole('heading', { name: 'Allocation policy' })).toBeInTheDocument();
  });

  it('shows the server’s refusal inside the dialog', async () => {
    const user = userEvent.setup();
    api.openRegistrationWindow.mockResolvedValue({
      success: false,
      data: null,
      message: 'Offer at least one course before opening registration.',
    });
    renderWindowPage();

    await user.click(await screen.findByRole('button', { name: 'Open registration' }));
    const dialog = screen.getByRole('dialog', { name: 'Open registration?' });
    await user.click(within(dialog).getByRole('button', { name: 'Open registration' }));

    expect(
      await within(dialog).findByText('Offer at least one course before opening registration.'),
    ).toBeInTheDocument();
  });

  it('is read-only once the policy is frozen', async () => {
    api.getRegistrationWindow.mockResolvedValue(
      ok(
        adminWindow({
          window: { ...adminWindow().window!, status: 'OPEN' },
          editable: false,
        }),
      ),
    );

    renderWindowPage();

    expect(await screen.findByRole('heading', { name: 'Allocation policy' })).toBeInTheDocument();
    expect(screen.getByText('Policy frozen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save window' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close registration' })).toBeInTheDocument();
    // The stored policy is still shown, just not editable.
    expect(screen.getByText(/P1 100 · P2 80/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWindowPage();
    await screen.findByLabelText('Window name');
    await expectNoA11yViolations(container, { isolated: false });
  });
});
