import type { ApiResponse, CourseEligibilityDetail, EligibilityOverview } from '@course-reg/shared';
import { apiClient } from './apiClient';

/** Every offered course checked against the signed-in student. */
export function getEligibility(signal?: AbortSignal): Promise<ApiResponse<EligibilityOverview>> {
  return apiClient.get<EligibilityOverview>('/eligibility', { signal });
}

export function getCourseEligibility(
  code: string,
  signal?: AbortSignal,
): Promise<ApiResponse<CourseEligibilityDetail>> {
  return apiClient.get<CourseEligibilityDetail>(`/eligibility/${encodeURIComponent(code)}`, {
    signal,
  });
}
