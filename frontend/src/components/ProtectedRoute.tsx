import type { UserRole } from '@course-reg/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import type { LoginLocationState } from '../types/auth';
import { homePathFor } from '../utils/authRedirects';

interface ProtectedRouteProps {
  role: UserRole;
}

/**
 * Route guard (a layout route). Anonymous users go to /login, remembering the
 * page they asked for; signed-in users of another role go to their own home.
 * This only shapes navigation; the API enforces access on every request.
 */
export function ProtectedRoute({ role }: ProtectedRouteProps) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return <p role="status">Checking your session…</p>;
  }
  if (state.status === 'anonymous') {
    // After an explicit sign-out, don't send the next person back to this page.
    const loginState: LoginLocationState =
      state.notice === 'signed-out'
        ? { notice: 'signed-out' }
        : {
            from: location.pathname + location.search,
            ...(state.notice && { notice: state.notice }),
          };
    return <Navigate to="/login" replace state={loginState} />;
  }
  if (state.user.role !== role) {
    return <Navigate to={homePathFor(state.user.role)} replace />;
  }
  return <Outlet />;
}
