import { isApiResponse, type ApiFailure, type ApiResponse } from '@course-reg/shared';

/** All API calls go through the same-origin /api prefix (Vite proxy or nginx). */
const API_BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Serialised as JSON when provided. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function failure(message: string): ApiFailure {
  return { success: false, data: null, message };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Typed fetch wrapper. Always resolves to an ApiResponse — network failures and
 * non-envelope responses become ApiFailure — so callers narrow on `success`
 * instead of wrapping every call in try/catch. Only aborts are re-thrown.
 */
export async function request<T>(
  method: HttpMethod,
  path: string,
  { body, headers, signal }: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const requestHeaders = new Headers({ Accept: 'application/json', ...headers });
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failure('Could not reach the server. Check your connection and try again.');
  }

  const payload = await readJson(response);
  if (isApiResponse(payload)) {
    // The envelope is validated at runtime; the shape of `data` is the
    // endpoint's contract, described by T.
    return payload as ApiResponse<T>;
  }
  return failure(
    response.ok
      ? 'The server returned an unexpected response.'
      : `Request failed with status ${response.status}.`,
  );
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
