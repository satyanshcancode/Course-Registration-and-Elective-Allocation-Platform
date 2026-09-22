import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { ToastProvider } from '../components/Toast';

/**
 * Renders one page at `path` inside a memory router (plus a toast provider),
 * with any extra routes a test needs to navigate to.
 */
export function renderRoute(
  element: ReactNode,
  {
    path,
    url = path,
    state,
    routes = [],
  }: { path: string; url?: string; state?: unknown; routes?: RouteObject[] },
) {
  const [pathname = '', search = ''] = url.split('?');
  const router = createMemoryRouter(
    [{ path, element: <ToastProvider>{element}</ToastProvider> }, ...routes],
    { initialEntries: [{ pathname, search: search ? `?${search}` : '', state }] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}
