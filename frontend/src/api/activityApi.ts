import type {
  HistoryPage,
  HistoryQuery,
  NotificationFilter,
  NotificationPage,
  NotificationReadResult,
  StudentStatus,
  UnreadNotificationCount,
} from '@course-reg/shared';
import { apiClient, type ApiResult } from './apiClient';

/** Query values that are absent or default are left out of the URL. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Where the signed-in student stands right now. No student id is ever sent. */
export function getMyStatus(signal?: AbortSignal): Promise<ApiResult<StudentStatus>> {
  return apiClient.get<StudentStatus>('/students/me/status', { signal });
}

/** One page of the caller's timeline, newest first. */
export function getMyHistory(
  options: HistoryQuery = {},
  signal?: AbortSignal,
): Promise<ApiResult<HistoryPage>> {
  return apiClient.get<HistoryPage>(`/students/me/history${query({ ...options })}`, { signal });
}

export function getMyNotifications(
  options: { filter?: NotificationFilter; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<ApiResult<NotificationPage>> {
  return apiClient.get<NotificationPage>(`/students/me/notifications${query({ ...options })}`, {
    signal,
  });
}

export function getUnreadCount(signal?: AbortSignal): Promise<ApiResult<UnreadNotificationCount>> {
  return apiClient.get<UnreadNotificationCount>('/students/me/notifications/unread-count', {
    signal,
  });
}

/** Both replies carry the new unread count, so the nav badge needs no refetch. */
export function markNotificationRead(id: string): Promise<ApiResult<NotificationReadResult>> {
  return apiClient.patch<NotificationReadResult>(
    `/students/me/notifications/${encodeURIComponent(id)}/read`,
  );
}

export function markAllNotificationsRead(): Promise<ApiResult<NotificationReadResult>> {
  return apiClient.post<NotificationReadResult>('/students/me/notifications/read-all');
}
