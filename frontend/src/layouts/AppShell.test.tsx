import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/authApi';
import { routes } from '../app/routes';
import { expectNoA11yViolations } from '../test/axe';
import { adminUser, ok, studentUser } from '../test/authFixtures';
import { ADMIN_NAV, STUDENT_NAV } from './navigation';

vi.mock('../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(authApi);

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  // Lazy page chunks can take a moment to load the first time.
  await screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
  return { router, ...view };
}

// Full-page renders with lazy chunks and an axe run are slow in jsdom.
describe('layouts', { timeout: 20_000 }, () => {
  beforeEach(() => {
    api.getCurrentUser.mockResolvedValue(ok(studentUser));
  });

  it('student shell: landmarks, skip link and exactly the student navigation', async () => {
    const { container } = await renderAt('/student/dashboard');

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
    // The first <header> is the app bar. (Testing Library's role lookup also
    // reports the scoped <header>s inside <main>/<article>; browsers and axe
    // correctly treat those as non-landmarks.)
    const appBar = screen.getAllByRole('banner')[0];
    expect(appBar).toContainElement(screen.getByRole('button', { name: /account/i }));
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    const nav = screen.getAllByRole('navigation', { name: 'Student' })[0];
    const labels = within(nav!)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(STUDENT_NAV.map((item) => item.label));
    expect(within(nav!).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: 'Allocation Runs' })).not.toBeInTheDocument();
    await expectNoA11yViolations(container, { isolated: false });
  });

  it('admin shell shows only the admin navigation', async () => {
    api.getCurrentUser.mockResolvedValue(ok(adminUser));
    await renderAt('/admin/allocation-runs');

    const nav = screen.getAllByRole('navigation', { name: 'Administration' })[0];
    const labels = within(nav!)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(ADMIN_NAV.map((item) => item.label));
    expect(within(nav!).getByRole('link', { name: 'Allocation Runs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: 'My Cart' })).not.toBeInTheDocument();
  });

  it('every lazy page renders its heading, sets document.title and takes focus', async () => {
    await renderAt('/student/waitlist');

    const heading = screen.getByRole('heading', { level: 1, name: 'Waitlist' });
    expect(heading).toHaveFocus();
    expect(document.title).toBe('Waitlist · Course Registration');
  });

  it('/student redirects to the dashboard; unknown pages show a 404 inside the shell', async () => {
    const { router } = await renderAt('/student');
    expect(router.state.location.pathname).toBe('/student/dashboard');

    await router.navigate('/student/nowhere');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Student' }).length).toBeGreaterThan(0);
  });
});
