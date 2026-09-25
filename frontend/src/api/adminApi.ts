import type {
  AdminCourseList,
  AdminWindowDetail,
  ApiResponse,
  UpdateCapacityRequest,
  UpdateCapacityResult,
  UpdateWindowRequest,
  WindowActionRequest,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

export function getAdminCourses(signal?: AbortSignal): Promise<ApiResponse<AdminCourseList>> {
  return apiClient.get<AdminCourseList>('/admin/courses', { signal });
}

export function updateCapacity(
  code: string,
  change: UpdateCapacityRequest,
): Promise<ApiResponse<UpdateCapacityResult>> {
  return apiClient.patch<UpdateCapacityResult>(
    `/admin/courses/${encodeURIComponent(code)}/capacity`,
    { body: change },
  );
}

export function getRegistrationWindow(
  signal?: AbortSignal,
): Promise<ApiResponse<AdminWindowDetail>> {
  return apiClient.get<AdminWindowDetail>('/admin/registration-window', { signal });
}

/** DRAFT windows only: the server answers 409 once the policy is frozen. */
export function updateRegistrationWindow(
  change: UpdateWindowRequest,
): Promise<ApiResponse<AdminWindowDetail>> {
  return apiClient.patch<AdminWindowDetail>('/admin/registration-window', { body: change });
}

export function openRegistrationWindow(
  request: WindowActionRequest,
): Promise<ApiResponse<AdminWindowDetail>> {
  return apiClient.post<AdminWindowDetail>('/admin/registration-window/open', { body: request });
}

export function closeRegistrationWindow(
  request: WindowActionRequest,
): Promise<ApiResponse<AdminWindowDetail>> {
  return apiClient.post<AdminWindowDetail>('/admin/registration-window/close', { body: request });
}
