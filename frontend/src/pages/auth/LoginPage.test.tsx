import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/apiClient';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import {
  adminUser,
  invalidCredentials,
  notSignedIn,
  ok,
  studentUser,
} from '../../test/authFixtures';

vi.mock('../../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(authApi);

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

async function openLoginForm() {
  const router = renderAt('/login');
  await screen.findByRole('heading', { level: 1, name: 'Sign in' });
  return router;
}

beforeEach(() => {
  api.getCurrentUser.mockResolvedValue(notSignedIn);
});

describe('LoginPage validation', () => {
  it('shows inline errors and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    await openLoginForm();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('E-mail address');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your e-mail address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('focuses the password when only the password is invalid', async () => {
    const user = userEvent.setup();
    await openLoginForm();

    await user.type(screen.getByLabelText('E-mail address'), 'aarav.sharma@university.edu');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.getByLabelText('E-mail address')).not.toHaveAttribute('aria-invalid');
  });

  it('explains a malformed e-mail address and clears the error once fixed', async () => {
    const user = userEvent.setup();
    await openLoginForm();
    const email = screen.getByLabelText('E-mail address');

    await user.type(email, 'aarav@university');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(email).toHaveAccessibleDescription(
      'Enter a valid e-mail address, like name@university.edu.',
    );

    await user.type(email, '.edu');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('uses semantic, autofill-friendly fields and toggles password visibility', async () => {
    const user = userEvent.setup();
    await openLoginForm();
    const password = screen.getByLabelText('Password');

    expect(screen.getByLabelText('E-mail address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('E-mail address')).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toBeRequired();
    expect(document.title).toBe('Sign in · Course Registration');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('LoginPage submission', () => {
  it('shows the server error in an alert and keeps the user on the page', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(invalidCredentials);
    await openLoginForm();

    await user.type(screen.getByLabelText('E-mail address'), 'aarav.sharma@university.edu');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect e-mail or password.');
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('disables the button while signing in', async () => {
    const user = userEvent.setup();
    let resolveLogin: (value: Awaited<ReturnType<typeof authApi.login>>) => void = () => undefined;
    api.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    await openLoginForm();

    await user.type(screen.getByLabelText('E-mail address'), 'aarav.sharma@university.edu');
    await user.type(screen.getByLabelText('Password'), 'Student@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolveLogin(invalidCredentials);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each([
    { user: studentUser, path: '/student', heading: 'Welcome, Aarav Sharma' },
    { user: adminUser, path: '/admin', heading: 'Welcome, Administrator' },
  ])('sends a signed-in $user.role to $path', async ({ user: account, path, heading }) => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(ok(account));
    const router = await openLoginForm();

    await user.type(screen.getByLabelText('E-mail address'), account.email);
    await user.type(screen.getByLabelText('Password'), 'Password@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
    expect(api.login).toHaveBeenCalledWith({ email: account.email, password: 'Password@123' });
  });

  it('submits with the Enter key', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(ok(adminUser));
    const router = await openLoginForm();

    await user.type(screen.getByLabelText('E-mail address'), adminUser.email);
    await user.type(screen.getByLabelText('Password'), 'Admin@123{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
  });

  it('redirects an already signed-in user away from the login page', async () => {
    api.getCurrentUser.mockResolvedValue(ok(studentUser));
    const router = renderAt('/login');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/student');
    });
  });
});

describe('leaving a session', () => {
  it('signing out returns to /login with a notice', async () => {
    const user = userEvent.setup();
    api.getCurrentUser.mockResolvedValue(ok(studentUser));
    api.logout.mockResolvedValue(ok(null));
    const router = renderAt('/student');

    await screen.findByRole('heading', { level: 1, name: 'Welcome, Aarav Sharma' });
    const [pageSignOut] = screen.getAllByRole('button', { name: 'Sign out' }).slice(-1);
    await user.click(pageSignOut ?? document.body);

    expect(await screen.findByRole('status')).toHaveTextContent('You have been signed out.');
    expect(router.state.location.pathname).toBe('/login');
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('an expired session sends the user to /login and back afterwards', async () => {
    const user = userEvent.setup();
    api.getCurrentUser.mockResolvedValue(ok(studentUser));
    const router = renderAt('/student');
    await screen.findByRole('heading', { level: 1, name: 'Welcome, Aarav Sharma' });

    // Any ordinary API call that gets 401 means the session is gone.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(notSignedIn), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    await act(async () => {
      await apiClient.get('/students/me');
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your session expired. Please sign in again.',
    );
    expect(router.state.location.pathname).toBe('/login');

    api.login.mockResolvedValue(ok(studentUser));
    await user.type(screen.getByLabelText('E-mail address'), studentUser.email);
    await user.type(screen.getByLabelText('Password'), 'Student@123{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/student');
    });
  });
});
