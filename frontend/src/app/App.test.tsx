import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const notSignedInBody = { success: false, data: null, message: 'Please sign in to continue.' };

/** The session probe says "not signed in"; nothing else is asked for. */
function fakeBackend(input: RequestInfo | URL): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.resolve(
    url.endsWith('/api/auth/me')
      ? jsonResponse(notSignedInBody, 401)
      : jsonResponse({ success: true, data: null }),
  );
}

describe('App', () => {
  it('sends anonymous visitors from / to the sign-in page', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeBackend));

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('is the form and nothing else: no process explainer, status panel or demo accounts', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeBackend));

    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Service status' })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo account/i)).not.toBeInTheDocument();
    // What must still be there.
    expect(screen.getByLabelText(/e-mail address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument();
  });

  it('still renders the sign-in page when the server is unreachable', async () => {
    // The session probe failing must not leave a blank page: the form is the
    // one thing a visitor can still usefully be shown.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
