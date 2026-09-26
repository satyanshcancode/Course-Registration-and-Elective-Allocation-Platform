import type {
  ActivationCheck,
  ApiResponse,
  ChangePasswordRequest,
  CurrentUser,
  ForgotPasswordRequest,
  SetPasswordRequest,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

/**
 * The account lifecycle. Every call that sets a password answers with the
 * current user and sets the session cookie, exactly as signing in does — no
 * token ever reaches JavaScript.
 */

/** Whether an activation or reset link is still usable, and whose it is. */
export function checkActivationToken(
  token: string,
  signal?: AbortSignal,
): Promise<ApiResponse<ActivationCheck>> {
  return apiClient.get<ActivationCheck>(`/auth/activation/${encodeURIComponent(token)}`, {
    signal,
  });
}

/** Sets the first password on an invited account and signs in. */
export function activateAccount(request: SetPasswordRequest): Promise<ApiResponse<CurrentUser>> {
  return apiClient.post<CurrentUser>('/auth/activate', { body: request });
}

/**
 * Asks for a reset link. Always succeeds with the same message, whether or not
 * the address belongs to an account, so nothing here can enumerate accounts.
 */
export function requestPasswordReset(request: ForgotPasswordRequest): Promise<ApiResponse<null>> {
  return apiClient.post<null>('/auth/forgot-password', { body: request });
}

export function resetPassword(request: SetPasswordRequest): Promise<ApiResponse<CurrentUser>> {
  return apiClient.post<CurrentUser>('/auth/reset-password', { body: request });
}

/** Signed in, current password required. Signs every OTHER device out. */
export function changePassword(request: ChangePasswordRequest): Promise<ApiResponse<CurrentUser>> {
  return apiClient.put<CurrentUser>('/account/password', { body: request });
}
