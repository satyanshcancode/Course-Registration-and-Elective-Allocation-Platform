import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountApi from '../api/accountApi';
import * as authApi from '../api/authApi';
import { routes } from '../app/routes';
import { adminUser, ok, studentUser } from '../test/authFixtures';
import { expectNoA11yViolations } from '../test/axe';

vi.mock('../api/accountApi', () => ({
  checkActivationToken: vi.fn(),
  activateAccount: vi.fn(),
  resetPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock('../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const account = vi.mocked(accountApi);
const auth = vi.mocked(authApi);

const CURRENT = 'currentpassword1';
const NEW_PASSWORD = 'correcthorsebatterystaple';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

async function openStudentAccount() {
  auth.getCurrentUser.mockResolvedValue(ok(studentUser));
  const view = renderAt('/student/account');
  await screen.findByRole('heading', { level: 1, name: 'Account' });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  account.changePassword.mockResolvedValue(ok(studentUser));
});

describe('AccountPage', () => {
  it('shows who is signed in, without letting a student edit their record', async () => {
    await openStudentAccount();
    // Scoped to the page: the header's user menu shows the same e-mail and name.
    const page = within(screen.getByRole('main'));

    expect(page.getByText(studentUser.email)).toBeVisible();
    expect(page.getByText('Aarav Sharma')).toBeVisible();
    expect(page.getByText('CSE24901')).toBeVisible();
    // The academic record is read-only: it is what eligibility is judged on.
    expect(screen.getByText(/maintained by the registrar/i)).toBeVisible();
    expect(screen.queryByLabelText('Semester')).not.toBeInTheDocument();
  });

  it('shows an administrator their own account, with no student record', async () => {
    auth.getCurrentUser.mockResolvedValue(ok(adminUser));
    renderAt('/admin/account');
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    const page = within(screen.getByRole('main'));

    expect(page.getByText(adminUser.email)).toBeVisible();
    expect(page.getByText('Administrator')).toBeVisible();
    expect(page.queryByText(/Roll number/)).not.toBeInTheDocument();
    expect(screen.queryByText(/maintained by the registrar/i)).not.toBeInTheDocument();
    // And the password form is there for them too.
    expect(screen.getByLabelText('Current password')).toBeVisible();
  });

  it('changes the password and clears the form', async () => {
    const user = userEvent.setup();
    await openStudentAccount();

    await user.type(screen.getByLabelText('Current password'), CURRENT);
    await user.type(screen.getByLabelText('New password'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(account.changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: NEW_PASSWORD,
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Current password')).toHaveValue('');
    });
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('says this device stays signed in while the others do not', async () => {
    const user = userEvent.setup();
    await openStudentAccount();

    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /signs you out on every other device/i,
    );

    await user.type(screen.getByLabelText('Current password'), CURRENT);
    await user.type(screen.getByLabelText('New password'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Password changed')).toBeVisible();
    expect(screen.getByText(/still signed in here/i)).toBeVisible();
  });

  it('requires the current password before calling the server', async () => {
    const user = userEvent.setup();
    await openStudentAccount();

    await user.type(screen.getByLabelText('New password'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(account.changePassword).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Current password');
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription('Enter your current password.');
  });

  it('refuses a new password that is too short, or the same as the current one', async () => {
    const user = userEvent.setup();
    await openStudentAccount();

    await user.type(screen.getByLabelText('Current password'), CURRENT);
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(account.changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /at least 10 characters/,
    );

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), CURRENT);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(account.changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /must be different from the current one/,
    );
  });

  it('puts a wrong-password answer against the right field', async () => {
    const user = userEvent.setup();
    account.changePassword.mockResolvedValue({
      success: false,
      data: null,
      message: 'That is not your current password.',
      errors: [{ field: 'currentPassword', message: 'That is not your current password.' }],
    });
    await openStudentAccount();

    await user.type(screen.getByLabelText('Current password'), 'wrong-password');
    await user.type(screen.getByLabelText('New password'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription(
        'That is not your current password.',
      );
    });
    expect(screen.getByLabelText('Current password')).toHaveFocus();
    // A field error is not ALSO shouted in the page-level alert.
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('reports a failure with no field in the page alert', async () => {
    const user = userEvent.setup();
    account.changePassword.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server. Check your connection and try again.',
    });
    await openStudentAccount();

    await user.type(screen.getByLabelText('Current password'), CURRENT);
    await user.type(screen.getByLabelText('New password'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    });
  });

  it('is reachable from the user menu', async () => {
    const user = userEvent.setup();
    auth.getCurrentUser.mockResolvedValue(ok(studentUser));
    const router = createMemoryRouter(routes, { initialEntries: ['/student/dashboard'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('button', { name: /Aarav Sharma/ });

    await user.click(screen.getByRole('button', { name: /Aarav Sharma/ }));
    await user.click(screen.getByRole('link', { name: 'Account and password' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/student/account');
    });
  });

  it('has no accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = await openStudentAccount();

    await expectNoA11yViolations(container, { isolated: false });

    // Again with both field errors and the strength meter showing.
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await expectNoA11yViolations(container, { isolated: false });
  });
});
