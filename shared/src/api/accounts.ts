/**
 * Account lifecycle DTOs: invitation, activation, password reset and password
 * change. No token, hash or password ever travels back to the client — these
 * types only carry what the browser is allowed to know.
 */
import type { CurrentUser } from './auth.js';

/** POST /api/auth/activate and POST /api/auth/reset-password. */
export interface SetPasswordRequest {
  token: string;
  password: string;
}

/**
 * GET /api/auth/activation/:token — what the activation page shows before a
 * password is set. It deliberately carries no name or role: an invitation link
 * may be forwarded, and the e-mail is the only thing the recipient needs to
 * recognise. `valid: false` covers "unknown", "already used" and "expired"
 * alike, so a guessed token learns nothing beyond "that isn't a live link".
 */
export type ActivationCheck =
  | { valid: true; email: string; purpose: AccountTokenPurpose }
  | { valid: false; reason: 'unusable' };

export const ACCOUNT_TOKEN_PURPOSES = ['ACTIVATION', 'PASSWORD_RESET'] as const;
export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];

/** POST /api/auth/forgot-password. */
export interface ForgotPasswordRequest {
  email: string;
}

/** POST /api/account/password, for a signed-in student or administrator. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Activation and reset both sign the user in, so they answer with the same
 * body as login: the user, with the session in the cookie.
 */
export type ActivationResult = CurrentUser;
