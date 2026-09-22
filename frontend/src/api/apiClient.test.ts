import { describe, expect, it, vi } from 'vitest';
import { apiClient, getConditional, setUnauthorizedHandler } from './apiClient';

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

    // The client adds the HTTP status, so callers can tell 404 from other failures.
    expect(response).toEqual({ ...unauthorizedBody, httpStatus: 401 });
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

  describe('getConditional', () => {
    it('sends If-None-Match, bypasses the HTTP cache and reports 304 as not modified', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 304 })));
      vi.stubGlobal('fetch', fetchMock);

      const result = await getConditional('/courses/seats', '"v1"');

      expect(result).toEqual({ kind: 'not-modified' });
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(new Headers(init.headers).get('If-None-Match')).toBe('"v1"');
      expect(init.cache).toBe('no-store');
    });

    it('returns new data with its ETag', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ success: true, data: { version: 'v2' } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ETag: '"v2"' },
            }),
          ),
        ),
      );

      expect(await getConditional('/courses/seats', null)).toEqual({
        kind: 'modified',
        data: { version: 'v2' },
        etag: '"v2"',
      });
    });

    it('reports failures without throwing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
      );
      const result = await getConditional('/courses/seats', '"v1"');
      expect(result.kind).toBe('failed');
    });
  });
});
