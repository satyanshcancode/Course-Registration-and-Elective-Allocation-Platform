import type {
  AdminWaitlistView,
  ProcessWaitlistsResult,
  StudentWaitlist,
  WithdrawEnrollmentRequest,
  WithdrawEnrollmentResult,
} from '@course-reg/shared';
import { apiClient, type ApiResult } from './apiClient';

/** The signed-in student's own queues; no student id is ever sent. */
export function getMyWaitlist(signal?: AbortSignal): Promise<ApiResult<StudentWaitlist>> {
  return apiClient.get<StudentWaitlist>('/students/me/waitlist', { signal });
}

/** One course's roster and queue. `code` absent means "nothing picked yet". */
export function getAdminWaitlists(
  code: string | null,
  signal?: AbortSignal,
): Promise<ApiResult<AdminWaitlistView>> {
  const query = code ? `?course=${encodeURIComponent(code)}` : '';
  return apiClient.get<AdminWaitlistView>(`/admin/waitlists${query}`, { signal });
}

/** Releases a seat. Whoever is next in line takes it in the same transaction. */
export function withdrawEnrollment(
  enrollmentId: string,
  reason: string,
): Promise<ApiResult<WithdrawEnrollmentResult>> {
  const body: WithdrawEnrollmentRequest = { reason };
  return apiClient.post<WithdrawEnrollmentResult>(
    `/admin/enrollments/${encodeURIComponent(enrollmentId)}/withdraw`,
    { body },
  );
}

/** The safety sweep: offers every free seat in the window to its waitlist. */
export function processWaitlists(): Promise<ApiResult<ProcessWaitlistsResult>> {
  return apiClient.post<ProcessWaitlistsResult>('/admin/waitlists/process');
}
