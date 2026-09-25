import {
  IDEMPOTENCY_KEY_HEADER,
  type PreferenceCart,
  type SaveCartRequest,
  type SubmissionReceipt,
  type SubmitRequest,
} from '@course-reg/shared';
import { apiClient, type ApiResult } from './apiClient';

/** The caller's own cart: no student id is ever sent. */
export function getCart(signal?: AbortSignal): Promise<ApiResult<PreferenceCart>> {
  return apiClient.get<PreferenceCart>('/preferences', { signal });
}

/** Replaces the whole cart; the order of `courseCodes` becomes the ranks. */
export function saveCart(
  courseCodes: string[],
  signal?: AbortSignal,
): Promise<ApiResult<PreferenceCart>> {
  const body: SaveCartRequest = { courseCodes };
  return apiClient.put<PreferenceCart>('/preferences', { body, signal });
}

/**
 * Submits the cart. `idempotencyKey` is generated once per attempt by the
 * caller and REUSED for every retry: the server replays the first result
 * instead of creating a second submission.
 */
export function submitCart(
  courseCodes: string[],
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResult<SubmissionReceipt>> {
  const body: SubmitRequest = { courseCodes };
  return apiClient.post<SubmissionReceipt>('/registration/submit', {
    body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    signal,
  });
}

/** The receipt for an already-submitted cart, or null before submitting. */
export function getSubmissionStatus(
  signal?: AbortSignal,
): Promise<ApiResult<SubmissionReceipt | null>> {
  return apiClient.get<SubmissionReceipt | null>('/registration/status', { signal });
}
