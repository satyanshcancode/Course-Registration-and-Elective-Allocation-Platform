import type { ApiFieldError, ApiResponse } from '@course-reg/shared';
import type { ClientFailure } from './apiClient';

/** An ApiFailure turned into an exception (for promise-based code like useAsync). */
export class ApiRequestError extends Error {
  readonly fieldErrors: ApiFieldError[];
  /** HTTP status, or null when unknown (e.g. the server was unreachable). */
  readonly status: number | null;

  constructor(message: string, fieldErrors: ApiFieldError[] = [], status: number | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

/** Returns `data` of a successful response, or throws its message. */
export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    const status = 'httpStatus' in response ? (response as ClientFailure).httpStatus : null;
    throw new ApiRequestError(response.message, response.errors, status);
  }
  return response.data;
}

/** True when a thrown error is the API's 404 Not Found. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
