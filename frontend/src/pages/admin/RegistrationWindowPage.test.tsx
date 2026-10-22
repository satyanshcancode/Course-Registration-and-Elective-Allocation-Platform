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
  updateRegistrationDeadline: vi.fn(),
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
    expect(counts).toHaveTextContent(/Courses offered\s*2/);
    expect(counts).toHaveTextContent(/Students eligible for at least one\s*118 of 300/);
    expect(counts).toHaveTextContent(/Submissions so far\s*0/);
    expect(screen.getByRole('button', { name: 'Open registration' })).toBeInTheDocument();
    // The status line is the window card beside the primary button.
    expect(screen.getAllByText('Fall 2026').length).toBeGreaterThan(0);
    expect(screen.getByText(/Opens in|Closes in|Registration (opens|closed)/)).toBeInTheDocument();
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

  describe('when registration is open', () => {
    const openDetail = () =>
      adminWindow({
        window: {
          ...adminWindow().window!,
          status: 'OPEN',
          startsAt: '2026-09-21T10:00:00.000Z',
          endsAt: '2026-10-05T18:00:00.000Z',
        },
        editable: false,
        serverTime: '2026-09-22T10:00:00.000Z',
      });

    beforeEach(() => {
      api.getRegistrationWindow.mockResolvedValue(ok(openDetail()));
    });

    it('shows the Registration deadline card prefilled with current closing time', async () => {
      renderWindowPage();

      expect(
        await screen.findByRole('heading', { name: 'Registration deadline' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Current closing time:')).toBeInTheDocument();
      expect(screen.getByLabelText('New closing time')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save closing time' })).toBeInTheDocument();
      // Frozen policy remains frozen
      expect(screen.getByRole('heading', { name: 'Allocation policy' })).toBeInTheDocument();
      expect(screen.getByText('Policy frozen')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save window' })).not.toBeInTheDocument();
    });

    it('refuses a new deadline that is not after opening time', async () => {
      const user = userEvent.setup();
      renderWindowPage();

      const input = await screen.findByLabelText('New closing time');
      await user.clear(input);
      await user.type(input, '2026-09-20T09:00');
      await user.click(screen.getByRole('button', { name: 'Save closing time' }));

      expect(
        await screen.findByText('Registration must close after it opens.'),
      ).toBeInTheDocument();
      expect(api.updateRegistrationDeadline).not.toHaveBeenCalled();
    });

    it('refuses a new deadline in the past', async () => {
      const user = userEvent.setup();
      renderWindowPage();

      const input = await screen.findByLabelText('New closing time');
      await user.clear(input);
      await user.type(input, '2026-09-21T23:00');
      await user.click(screen.getByRole('button', { name: 'Save closing time' }));

      expect(
        await screen.findByText(
          'Registration would already be over: move the closing time into the future.',
        ),
      ).toBeInTheDocument();
      expect(api.updateRegistrationDeadline).not.toHaveBeenCalled();
    });

    it('saves an updated deadline with optional reason and updates the UI', async () => {
      const user = userEvent.setup();
      const updatedDetail = adminWindow({
        window: {
          ...adminWindow().window!,
          status: 'OPEN',
          startsAt: '2026-09-21T10:00:00.000Z',
          endsAt: '2026-10-12T18:00:00.000Z',
        },
        editable: false,
        serverTime: '2026-09-22T10:00:00.000Z',
      });
      api.updateRegistrationDeadline.mockResolvedValue(ok(updatedDetail));

      renderWindowPage();

      const input = await screen.findByLabelText('New closing time');
      await user.clear(input);
      await user.type(input, '2026-10-12T18:00');
      await user.type(screen.getByLabelText('Reason'), 'Extended by faculty request');
      await user.click(screen.getByRole('button', { name: 'Save closing time' }));

      await waitFor(() => {
        expect(api.updateRegistrationDeadline).toHaveBeenCalled();
      });
      expect(api.updateRegistrationDeadline.mock.calls[0]?.[0]?.reason).toBe(
        'Extended by faculty request',
      );
      expect(api.updateRegistrationDeadline.mock.calls[0]?.[0]?.endsAt).toContain('2026-10-12');

      expect(
        await screen.findByRole('heading', { name: 'Registration deadline' }),
      ).toBeInTheDocument();
    });

    it('displays server errors when saving the deadline fails', async () => {
      const user = userEvent.setup();
      api.updateRegistrationDeadline.mockResolvedValue({
        success: false,
        data: null,
        message:
          'The registration deadline can only be changed while the window is open; this one is already closed.',
      });

      renderWindowPage();

      const input = await screen.findByLabelText('New closing time');
      await user.clear(input);
      await user.type(input, '2026-10-12T18:00');
      await user.click(screen.getByRole('button', { name: 'Save closing time' }));

      expect(
        await screen.findByText(
          'The registration deadline can only be changed while the window is open; this one is already closed.',
        ),
      ).toBeInTheDocument();
    });

    it('has no accessibility violations when open', async () => {
      const { container } = renderWindowPage();
      await screen.findByRole('heading', { name: 'Registration deadline' });
      await expectNoA11yViolations(container, { isolated: false });
    });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWindowPage();
    await screen.findByLabelText('Window name');
    await expectNoA11yViolations(container, { isolated: false });
  });
});
