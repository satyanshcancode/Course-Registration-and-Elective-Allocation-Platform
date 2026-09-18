import type { CurrentAdmin, CurrentStudent } from '@course-reg/shared';
import { useContext } from 'react';
import { AuthContext } from '../app/AuthContext';
import type { AuthContextValue } from '../types/auth';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

/** The signed-in student, or null (e.g. while a route guard redirects). */
export function useCurrentStudent(): CurrentStudent | null {
  const { state } = useAuth();
  return state.status === 'authenticated' && state.user.role === 'STUDENT' ? state.user : null;
}

/** The signed-in administrator, or null. */
export function useCurrentAdmin(): CurrentAdmin | null {
  const { state } = useAuth();
  return state.status === 'authenticated' && state.user.role === 'ADMIN' ? state.user : null;
}
