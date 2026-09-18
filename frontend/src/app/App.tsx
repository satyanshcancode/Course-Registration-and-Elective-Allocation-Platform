import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

export function App() {
  // Created once per mount so tests and the browser each get a fresh router.
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
