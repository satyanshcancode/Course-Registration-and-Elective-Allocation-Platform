import type {
  AdminCourseList,
  AdminCourseOffering,
  ApiResponse,
  UpdateCapacityRequest,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

export function getAdminCourses(signal?: AbortSignal): Promise<ApiResponse<AdminCourseList>> {
  return apiClient.get<AdminCourseList>('/admin/courses', { signal });
}

export function updateCapacity(
  code: string,
  change: UpdateCapacityRequest,
): Promise<ApiResponse<AdminCourseOffering>> {
  return apiClient.patch<AdminCourseOffering>(
    `/admin/courses/${encodeURIComponent(code)}/capacity`,
    { body: change },
  );
}
