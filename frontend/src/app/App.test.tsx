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
  it('sends anonymous visitors from / to the sign-in page, which shows service status', async () => {
    const fetchMock = vi.fn(fakeBackend);
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'How registration works' })).toBeVisible();

    const status = screen.getByRole('region', { name: 'Service status' });
    const database = (await within(status).findByText('Database')).closest('div');
    expect(within(database as HTMLElement).getByText('Operational')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('says so (and offers a retry) when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    render(<App />);

    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });
});
