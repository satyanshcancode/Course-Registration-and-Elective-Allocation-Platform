import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountApi from '../../api/accountApi';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import { expectNoA11yViolations } from '../../test/axe';
import { notSignedIn, ok, studentUser } from '../../test/authFixtures';

vi.mock('../../api/accountApi', () => ({
  checkActivationToken: vi.fn(),
  activateAccount: vi.fn(),
  resetPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock('../../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const account = vi.mocked(accountApi);
const auth = vi.mocked(authApi);

const LONG_PASSWORD = 'correcthorsebatterystaple';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

beforeEach(() => {
  // The shared setup restores spies but not the call history of a vi.fn() from
  // a module factory, and several tests here assert that a call did NOT happen.
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(notSignedIn);
  account.checkActivationToken.mockResolvedValue(
    ok({ valid: true, email: 'asha@university.edu', purpose: 'ACTIVATION' as const }),
  );
  account.activateAccount.mockResolvedValue(ok(studentUser));
  account.resetPassword.mockResolvedValue(ok(studentUser));
});

describe('ActivatePage', () => {
  it('checks the link before drawing the form, and names the account', async () => {
    renderAt('/activate?token=abc123token456789');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Set your password' }),
    ).toBeVisible();
    expect(account.checkActivationToken).toHaveBeenCalledWith(
      'abc123token456789',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('status')).toHaveTextContent('asha@university.edu');
  });

  it('sets the password and signs the student in', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/activate?token=abc123token456789');
    await screen.findByLabelText('New password');

    await user.type(screen.getByLabelText('New password'), LONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set password and sign in' }));

    expect(account.activateAccount).toHaveBeenCalledWith({
      token: 'abc123token456789',
      password: LONG_PASSWORD,
    });
    // The session came back with the response, so the page redirects home.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/student/dashboard');
    });
  });

  it('will not submit a password below the minimum length', async () => {
    const user = userEvent.setup();
    renderAt('/activate?token=abc123token456789');
    await screen.findByLabelText('New password');

    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set password and sign in' }));

    expect(account.activateAccount).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /at least 10 characters/,
    );
    expect(screen.getByLabelText('New password')).toHaveFocus();
  });

  it('shows the server field error against the password', async () => {
    const user = userEvent.setup();
    account.activateAccount.mockResolvedValue({
      success: false,
      data: null,
      message: 'Please correct the highlighted fields.',
      errors: [{ field: 'password', message: 'Use at least 10 characters.' }],
    });
    renderAt('/activate?token=abc123token456789');
    await screen.findByLabelText('New password');

    await user.type(screen.getByLabelText('New password'), LONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set password and sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please correct the highlighted fields.');
    });
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /Use at least 10 characters/,
    );
  });

  it('explains a dead link instead of offering a form', async () => {
    account.checkActivationToken.mockResolvedValue(
      ok({ valid: false, reason: 'unusable' as const }),
    );
    renderAt('/activate?token=spenttoken1234567');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'That link is no longer usable' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'send me a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('treats a missing token as a dead link without asking the server', async () => {
    renderAt('/activate');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'That link is no longer usable' }),
    ).toBeVisible();
    expect(account.checkActivationToken).not.toHaveBeenCalled();
  });

  it('shows the strength hint as the password is typed', async () => {
    const user = userEvent.setup();
    renderAt('/activate?token=abc123token456789');
    await screen.findByLabelText('New password');

    await user.type(screen.getByLabelText('New password'), 'abcdefghij');
    expect(screen.getByText('Weak')).toBeVisible();

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), LONG_PASSWORD);
    expect(screen.getByText('Strong')).toBeVisible();
  });

  it('toggles the password between hidden and visible', async () => {
    const user = userEvent.setup();
    renderAt('/activate?token=abc123token456789');
    const field = await screen.findByLabelText('New password');

    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
  });

  it('has no accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/activate?token=abc123token456789');
    await screen.findByLabelText('New password');

    await expectNoA11yViolations(container, { isolated: false });

    // Again with the strength meter and an error showing.
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set password and sign in' }));
    await expectNoA11yViolations(container, { isolated: false });
  });

  it('has no accessibility violations in the dead-link state', async () => {
    account.checkActivationToken.mockResolvedValue(
      ok({ valid: false, reason: 'unusable' as const }),
    );
    const { container } = renderAt('/activate?token=spenttoken1234567');
    await screen.findByRole('heading', { level: 1, name: 'That link is no longer usable' });

    await expectNoA11yViolations(container, { isolated: false });
  });
});

describe('ActivatePage in reset mode', () => {
  beforeEach(() => {
    account.checkActivationToken.mockResolvedValue(
      ok({ valid: true, email: 'asha@university.edu', purpose: 'PASSWORD_RESET' as const }),
    );
  });

  it('says a reset signs other devices out, and calls the reset endpoint', async () => {
    const user = userEvent.setup();
    renderAt('/reset-password?token=resettoken1234567');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a new password' }),
    ).toBeVisible();
    expect(screen.getByText(/signs you out on every other device/i)).toBeVisible();

    await user.type(screen.getByLabelText('New password'), LONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));

    expect(account.resetPassword).toHaveBeenCalledWith({
      token: 'resettoken1234567',
      password: LONG_PASSWORD,
    });
    expect(account.activateAccount).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderAt('/reset-password?token=resettoken1234567');
    await screen.findByLabelText('New password');

    await expectNoA11yViolations(container, { isolated: false });
  });
});
