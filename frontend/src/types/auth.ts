import type { ApiResponse, CurrentUser, LoginRequest } from '@course-reg/shared';

/**
 * Session state, narrowed on `status`. `notice` records why the user became
 * anonymous, so every redirect to /login (from logout or from a route guard
 * reacting to the same state change) can explain it.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'anonymous'; notice?: LoginNotice };

export interface AuthContextValue {
  state: AuthState;
  /** Resolves with the server response so the form can show its message. */
  login: (credentials: LoginRequest) => Promise<ApiResponse<CurrentUser>>;
  logout: () => Promise<void>;
  /**
   * Adopts a session the server has just established by another route:
   * activation, a password reset, or a password change (each of which answers
   * with the current user and a fresh cookie, exactly as signing in does).
   * Nothing is re-fetched — the response already carries the user.
   */
  adopt: (user: CurrentUser) => void;
}

/** Why the user was sent to the sign-in page. */
export type LoginNotice = 'session-expired' | 'signed-out';

/** Router state passed to /login. */
export interface LoginLocationState {
  /** Internal path the user originally asked for. */
  from?: string;
  notice?: LoginNotice;
}
