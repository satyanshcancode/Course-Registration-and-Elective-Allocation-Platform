import { canManageStaff, type CurrentAdmin, type CurrentStudent } from '@course-reg/shared';
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

/** The signed-in member of staff, administrator or co-administrator, or null. */
export function useCurrentAdmin(): CurrentAdmin | null {
  const { state } = useAuth();
  // Narrowed by excluding STUDENT rather than by isAdminRole: a type guard on
  // the role string does not narrow the user it came from, and CurrentUser has
  // exactly two members.
  return state.status === 'authenticated' && state.user.role !== 'STUDENT' ? state.user : null;
}

/**
 * True only for a full administrator. The Team page and its navigation item
 * are the only things that ask; everything else treats the two alike, and the
 * server refuses the endpoints regardless of what the interface shows.
 */
export function useCanManageStaff(): boolean {
  const { state } = useAuth();
  return state.status === 'authenticated' && canManageStaff(state.user.role);
}
