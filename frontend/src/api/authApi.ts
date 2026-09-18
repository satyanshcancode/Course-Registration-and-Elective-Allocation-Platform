import type { ApiResponse, CurrentUser, LoginRequest } from '@course-reg/shared';
import { apiClient } from './apiClient';

/** Signs in; on success the server sets the httpOnly session cookie. */
export function login(credentials: LoginRequest): Promise<ApiResponse<CurrentUser>> {
  return apiClient.post<CurrentUser>('/auth/login', { body: credentials });
}

export function logout(): Promise<ApiResponse<null>> {
  return apiClient.post<null>('/auth/logout');
}

/** Restores the session from the cookie; 401 simply means "not signed in". */
export function getCurrentUser(signal?: AbortSignal): Promise<ApiResponse<CurrentUser>> {
  return apiClient.get<CurrentUser>('/auth/me', { signal });
}
