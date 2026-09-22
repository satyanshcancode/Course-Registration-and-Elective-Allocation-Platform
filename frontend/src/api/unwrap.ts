import type { ApiFieldError, ApiResponse } from '@course-reg/shared';

/** An ApiFailure turned into an exception (for promise-based code like useAsync). */
export class ApiRequestError extends Error {
  readonly fieldErrors: ApiFieldError[];

  constructor(message: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.fieldErrors = fieldErrors;
  }
}

/** Returns `data` of a successful response, or throws its message. */
export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new ApiRequestError(response.message, response.errors);
  }
  return response.data;
}
