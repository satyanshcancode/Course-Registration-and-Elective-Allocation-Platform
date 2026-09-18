import type { LoginRequest } from '@course-reg/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isAbortError, setUnauthorizedHandler } from '../api/apiClient';
import * as authApi from '../api/authApi';
import type { AuthContextValue, AuthState, LoginLocationState } from '../types/auth';
import { AuthContext } from './AuthContext';

/**
 * Owns the session: restores it from the httpOnly cookie on load (/auth/me),
 * signs in and out, and reacts to any request that finds the session expired.
 * Must be rendered inside the router.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const navigate = useNavigate();
  const location = useLocation();

  // The latest location, read by the 401 handler without re-registering it.
  const currentPath = useRef(location.pathname + location.search);
  useEffect(() => {
    currentPath.current = location.pathname + location.search;
  }, [location]);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .getCurrentUser(controller.signal)
      .then((response) => {
        setState(
          response.success
            ? { status: 'authenticated', user: response.data }
            : { status: 'anonymous' },
        );
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setState({ status: 'anonymous' });
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        setState({ status: 'anonymous', notice: 'session-expired' });
        const loginState: LoginLocationState = {
          from: currentPath.current,
          notice: 'session-expired',
        };
        void navigate('/login', { replace: true, state: loginState });
      }),
    [navigate],
  );

  const login = useCallback(async (credentials: LoginRequest) => {
    const response = await authApi.login(credentials);
    if (response.success) {
      setState({ status: 'authenticated', user: response.data });
    }
    return response;
  }, []);

  const logout = useCallback(async () => {
    // Even if the request fails, forget the session locally.
    await authApi.logout();
    setState({ status: 'anonymous', notice: 'signed-out' });
    const loginState: LoginLocationState = { notice: 'signed-out' };
    await navigate('/login', { replace: true, state: loginState });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
