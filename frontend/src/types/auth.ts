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
}

/** Why the user was sent to the sign-in page. */
export type LoginNotice = 'session-expired' | 'signed-out';

/** Router state passed to /login. */
export interface LoginLocationState {
  /** Internal path the user originally asked for. */
  from?: string;
  notice?: LoginNotice;
}
