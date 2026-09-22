import { Navigate } from 'react-router';
import { PageLoading } from '../components/PageLoading';
import { useAuth } from '../hooks/useAuth';
import { homePathFor } from '../utils/authRedirects';

/** "/" has no page of its own: go to the user's dashboard, or to sign in. */
export function RootRedirect() {
  const { state } = useAuth();
  if (state.status === 'loading') {
    return <PageLoading label="Checking your session…" />;
  }
  return (
    <Navigate
      to={state.status === 'authenticated' ? homePathFor(state.user.role) : '/login'}
      replace
    />
  );
}
