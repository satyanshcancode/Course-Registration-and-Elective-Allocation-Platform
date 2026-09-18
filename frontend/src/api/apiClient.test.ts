import { describe, expect, it, vi } from 'vitest';
import { apiClient, setUnauthorizedHandler } from './apiClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthorizedBody = { success: false, data: null, message: 'Please sign in to continue.' };

describe('apiClient', () => {
  it('sends cookies with every request', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, { success: true, data: 1 })));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('reports an expired session when a normal request gets 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(401, unauthorizedBody))),
    );
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);

    const response = await apiClient.get('/students/me');

    expect(response).toEqual(unauthorizedBody);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not treat 401 from the session probe or sign-in as an expiry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(401, unauthorizedBody))),
    );
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);

    await apiClient.get('/auth/me');
    await apiClient.post('/auth/login', { body: { email: 'a@b.co', password: 'x' } });

    expect(onUnauthorized).not.toHaveBeenCalled();
    unregister();
  });
});
