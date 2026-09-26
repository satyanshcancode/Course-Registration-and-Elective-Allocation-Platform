import {
  IDEMPOTENCY_KEY_HEADER,
  type AddDropResult,
  type AddDropView,
  type AddRequest,
  type DropRequest,
  type SwapRequest,
  type UpdateAddDropPeriodRequest,
  type AdminWindowDetail,
  type WaitlistRequest,
} from '@course-reg/shared';
import { apiClient, type ApiResult } from './apiClient';

/** The signed-in student's own add/drop page; no student id is ever sent. */
export function getAddDrop(signal?: AbortSignal): Promise<ApiResult<AddDropView>> {
  return apiClient.get<AddDropView>('/add-drop', { signal });
}

/**
 * Every action carries the caller's idempotency key. The key is generated ONCE
 * per attempt and reused for every retry of it, so a request whose answer never
 * arrived can be sent again without taking a second seat.
 */
function act(
  path: string,
  body: object,
  idempotencyKey: string,
): Promise<ApiResult<AddDropResult>> {
  return apiClient.post<AddDropResult>(`/add-drop${path}`, {
    body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
}

export const dropCourse = (request: DropRequest, key: string) => act('/drop', request, key);

export const addCourse = (request: AddRequest, key: string) => act('/add', request, key);

export const swapCourse = (request: SwapRequest, key: string) => act('/swap', request, key);

export const joinWaitlist = (request: WaitlistRequest, key: string) =>
  act('/waitlist/join', request, key);

export const leaveWaitlist = (request: WaitlistRequest, key: string) =>
  act('/waitlist/leave', request, key);

/** Admin: schedules or clears the add/drop period. Nulls clear it. */
export function setAddDropPeriod(
  request: UpdateAddDropPeriodRequest,
): Promise<ApiResult<AdminWindowDetail>> {
  return apiClient.put<AdminWindowDetail>('/admin/registration-window/add-drop', {
    body: request,
  });
}
