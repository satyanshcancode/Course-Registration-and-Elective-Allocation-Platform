import type { UserRole } from '@course-reg/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { PageLoading } from './PageLoading';
import type { LoginLocationState } from '../types/auth';
import { areaPathFor, homePathFor } from '../utils/authRedirects';

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
    return <PageLoading label="Checking your session…" />;
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
  // Compared by AREA, not by role: a co-administrator belongs in the same
  // /admin area as an administrator, so `role="ADMIN"` admits both. The one
  // page the two must not share guards itself on the role (see TeamPage).
  if (areaPathFor(state.user.role) !== areaPathFor(role)) {
    return <Navigate to={homePathFor(state.user.role)} replace />;
  }
  return <Outlet />;
}
