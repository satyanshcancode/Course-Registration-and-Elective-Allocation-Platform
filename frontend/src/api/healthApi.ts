import type { ApiResponse, HealthStatus } from '@course-reg/shared';
import { apiClient } from './apiClient';

export function getHealth(signal?: AbortSignal): Promise<ApiResponse<HealthStatus>> {
  return apiClient.get<HealthStatus>('/health', { signal });
}
