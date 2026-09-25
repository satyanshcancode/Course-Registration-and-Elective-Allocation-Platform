import type {
  AllocationPreview,
  AllocationRunDetail,
  AllocationRunSummary,
  AllocationVerification,
  RunAllocationRequest,
  StudentAllocationResults,
} from '@course-reg/shared';
import { apiClient, type ApiResult } from './apiClient';

/** Both methods on a fresh snapshot, side by side. Writes nothing. */
export function previewAllocation(signal?: AbortSignal): Promise<ApiResult<AllocationPreview>> {
  return apiClient.post<AllocationPreview>('/admin/allocation/preview', { signal });
}

/** Irreversible, and possible only once per window: the body must confirm it. */
export function runAllocation(reason?: string): Promise<ApiResult<AllocationRunDetail>> {
  const body: RunAllocationRequest = { confirm: true, ...(reason ? { reason } : {}) };
  return apiClient.post<AllocationRunDetail>('/admin/allocation/run', { body });
}

export function getAllocationRuns(
  signal?: AbortSignal,
): Promise<ApiResult<AllocationRunSummary[]>> {
  return apiClient.get<AllocationRunSummary[]>('/admin/allocation-runs', { signal });
}

export function getAllocationRun(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResult<AllocationRunDetail>> {
  return apiClient.get<AllocationRunDetail>(`/admin/allocation-runs/${encodeURIComponent(id)}`, {
    signal,
  });
}

/** Re-runs the stored snapshot through the same strategy and compares hashes. */
export function verifyAllocationRun(id: string): Promise<ApiResult<AllocationVerification>> {
  return apiClient.post<AllocationVerification>(
    `/admin/allocation-runs/${encodeURIComponent(id)}/verify`,
  );
}

/** The signed-in student's own results; no student id is ever sent. */
export function getMyAllocationResults(
  signal?: AbortSignal,
): Promise<ApiResult<StudentAllocationResults>> {
  return apiClient.get<StudentAllocationResults>('/allocation/results', { signal });
}
