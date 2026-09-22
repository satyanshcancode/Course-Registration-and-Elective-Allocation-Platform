import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { routes } from './routes';

export function App() {
  // Created once per mount so tests and the browser each get a fresh router.
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    // Last line of defence; pages also have their own boundary inside the shell.
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
