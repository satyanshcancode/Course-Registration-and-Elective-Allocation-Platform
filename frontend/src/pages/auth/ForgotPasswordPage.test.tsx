import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as accountApi from '../../api/accountApi';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import { expectNoA11yViolations } from '../../test/axe';
import { notSignedIn } from '../../test/authFixtures';

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

/** The server's wording, which is the same for a known and an unknown address. */
const SAME_ANSWER =
  'If that e-mail address belongs to an account, a password reset link is on its way. Check your inbox, including the spam folder.';

function renderPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/forgot-password'] });
  return render(<RouterProvider router={router} />);
}

async function openForm() {
  const view = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Forgot your password?' });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(notSignedIn);
  account.requestPasswordReset.mockResolvedValue({
    success: true,
    data: null,
    message: SAME_ANSWER,
  });
});

describe('ForgotPasswordPage', () => {
  it('sends the address and shows the server’s own message', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.type(screen.getByLabelText('E-mail address'), 'asha@university.edu');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    expect(account.requestPasswordReset).toHaveBeenCalledWith({ email: 'asha@university.edu' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check your inbox' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(SAME_ANSWER);
  });

  it('shows the SAME thing whether or not the address exists', async () => {
    // The endpoint cannot tell the two apart, and neither may this page: if the
    // states differed, the page would leak what the server withholds.
    async function submit(email: string): Promise<string> {
      const user = userEvent.setup();
      const { unmount } = await openForm();
      await user.type(screen.getByLabelText('E-mail address'), email);
      await user.click(screen.getByRole('button', { name: 'Send me a link' }));
      await screen.findByRole('heading', { level: 1, name: 'Check your inbox' });
      const rendered = document.body.textContent;
      unmount();
      return rendered;
    }

    // The server answers identically, so the rendered page must too — every
    // word of it, not just the message.
    const known = await submit('known@university.edu');
    const unknown = await submit('nobody@example.edu');

    expect(unknown).toBe(known);
  });

  it('replaces the form rather than inviting a second guess', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.type(screen.getByLabelText('E-mail address'), 'asha@university.edu');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    await screen.findByRole('heading', { level: 1, name: 'Check your inbox' });
    expect(screen.queryByLabelText('E-mail address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send me a link' })).not.toBeInTheDocument();
  });

  it('validates the address before sending anything', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    expect(account.requestPasswordReset).not.toHaveBeenCalled();
    const field = screen.getByLabelText('E-mail address');
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription('Enter your e-mail address.');

    await user.type(field, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));
    expect(account.requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail address')).toHaveAccessibleDescription(
      'Enter a valid e-mail address.',
    );
  });

  it('clears the field error as the address is corrected', async () => {
    const user = userEvent.setup();
    await openForm();
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    await user.type(screen.getByLabelText('E-mail address'), 'asha@university.edu');

    expect(screen.getByLabelText('E-mail address')).not.toHaveAttribute('aria-invalid');
  });

  it('reports a failed request in an alert, keeping the form', async () => {
    const user = userEvent.setup();
    account.requestPasswordReset.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server. Check your connection and try again.',
    });
    await openForm();

    await user.type(screen.getByLabelText('E-mail address'), 'asha@university.edu');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    });
    expect(screen.getByLabelText('E-mail address')).toBeVisible();
  });

  it('links to sign in', async () => {
    await openForm();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('has no accessibility violations, before and after sending', async () => {
    const user = userEvent.setup();
    const { container } = await openForm();

    await expectNoA11yViolations(container, { isolated: false });

    await user.type(screen.getByLabelText('E-mail address'), 'asha@university.edu');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));
    await screen.findByRole('heading', { level: 1, name: 'Check your inbox' });

    await expectNoA11yViolations(container, { isolated: false });
  });
});
