import type { CurrentUser, LoginRequest } from '@course-reg/shared';
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

  // The latest location and status, read by the 401 handler without
  // re-registering it.
  const currentPath = useRef(location.pathname + location.search);
  const currentStatus = useRef(state.status);
  useEffect(() => {
    currentPath.current = location.pathname + location.search;
  }, [location]);
  useEffect(() => {
    currentStatus.current = state.status;
  }, [state.status]);

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
        // Only a signed-in session can expire. Without this, a stray 401 on
        // the sign-in page would redirect again and forget the page the user
        // originally asked for.
        if (currentStatus.current !== 'authenticated') {
          return;
        }
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

  // Activation, a reset and a password change all answer like login does, so
  // the session is adopted from that response rather than probed for again.
  const adopt = useCallback((user: CurrentUser) => {
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    // Even if the request fails, forget the session locally.
    await authApi.logout();
    setState({ status: 'anonymous', notice: 'signed-out' });
    const loginState: LoginLocationState = { notice: 'signed-out' };
    await navigate('/login', { replace: true, state: loginState });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, adopt }),
    [state, login, logout, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
