import type { ApiResponse, HealthStatus } from '@course-reg/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const healthyBody: ApiResponse<HealthStatus> = {
  success: true,
  data: {
    status: 'ok',
    database: { status: 'ok', latencyMs: 3 },
    uptimeSeconds: 10,
    timestamp: '2026-01-15T09:30:00.000Z',
  },
};

const notSignedInBody = { success: false, data: null, message: 'Please sign in to continue.' };

/** Health succeeds; the session probe says "not signed in". */
function fakeBackend(input: RequestInfo | URL): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.resolve(
    url.endsWith('/api/auth/me') ? jsonResponse(notSignedInBody, 401) : jsonResponse(healthyBody),
  );
}

describe('App', () => {
  it('renders the layout and shows backend and database health', async () => {
    const fetchMock = vi.fn(fakeBackend);
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /course registration and elective/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByText('Checking services…')).toBeInTheDocument();
    // Anonymous visitors are offered the sign-in link once the session probe answers.
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    const databaseRow = (await screen.findByText('Database')).closest('div');
    expect(databaseRow).not.toBeNull();
    expect(within(databaseRow as HTMLElement).getByText('Operational')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('shows an error with a retry button when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
});
