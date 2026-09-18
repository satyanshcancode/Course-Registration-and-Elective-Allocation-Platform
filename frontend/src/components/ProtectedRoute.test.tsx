import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/authApi';
import { AuthProvider } from '../app/AuthProvider';
import { LoginPage } from '../pages/auth/LoginPage';
import { notSignedIn, ok, adminUser, studentUser } from '../test/authFixtures';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(authApi);

/** Minimal app: guarded student and admin areas, including a nested page. */
const testRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute role="STUDENT" />,
        children: [
          { path: 'student', element: <h1>Student home</h1> },
          { path: 'student/courses', element: <h1>Student courses</h1> },
        ],
      },
      {
        element: <ProtectedRoute role="ADMIN" />,
        children: [{ path: 'admin', element: <h1>Admin home</h1> }],
      },
    ],
  },
];

function renderAt(path: string) {
  const router = createMemoryRouter(testRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  api.getCurrentUser.mockResolvedValue(notSignedIn);
});

describe('ProtectedRoute', () => {
  it('shows a status while the session is being restored', () => {
    api.getCurrentUser.mockReturnValue(new Promise(() => undefined));
    renderAt('/student');

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session…');
  });

  it('sends anonymous users to /login and back to the requested page after sign-in', async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue(ok(studentUser));
    const router = renderAt('/student/courses');

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');

    await user.type(screen.getByLabelText('E-mail address'), studentUser.email);
    await user.type(screen.getByLabelText('Password'), 'Student@123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Student courses' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/student/courses');
  });

  it('sends a student who opens /admin to their own home', async () => {
    api.getCurrentUser.mockResolvedValue(ok(studentUser));
    const router = renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Student home' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/student');
  });

  it('sends an admin who opens a student page to the admin home', async () => {
    api.getCurrentUser.mockResolvedValue(ok(adminUser));
    const router = renderAt('/student/courses');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
    expect(screen.getByRole('heading', { name: 'Admin home' })).toBeInTheDocument();
  });

  it('lets the right role through', async () => {
    api.getCurrentUser.mockResolvedValue(ok(adminUser));
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Admin home' })).toBeInTheDocument();
  });
});
