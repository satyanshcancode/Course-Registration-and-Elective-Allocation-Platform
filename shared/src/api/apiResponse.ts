/**
 * Envelope returned by every API endpoint.
 *
 * `success` is the discriminant: narrow on it before reading `data`.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

/** A single field-level validation problem, e.g. from a zod schema. */
export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  data: null;
  message: string;
  errors?: ApiFieldError[];
  /**
   * Endpoint-specific failure detail, typed by that endpoint's contract the
   * way `data` is (e.g. the cart's CartProblem[], read with readCartProblems).
   */
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Runtime check that an unknown JSON payload has the ApiResponse envelope.
 * It validates the envelope only; the shape of `data` is the caller's contract.
 */
export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!isRecord(value) || typeof value.success !== 'boolean' || !('data' in value)) {
    return false;
  }
  if (value.success) {
    return value.message === undefined || typeof value.message === 'string';
  }
  return value.data === null && typeof value.message === 'string';
}
