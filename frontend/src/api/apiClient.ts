import {
  isApiResponse,
  type ApiFailure,
  type ApiResponse,
  type ApiSuccess,
} from '@course-reg/shared';

/** All API calls go through the same-origin /api prefix (Vite proxy or nginx). */
const API_BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Serialised as JSON when provided. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Requests whose 401 means "not signed in" rather than "session expired":
 * the session probe on page load and a failed sign-in attempt.
 */
const SESSION_PROBE_PATHS: ReadonlySet<string> = new Set(['/auth/me', '/auth/login']);

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registers what happens when any other request gets 401 (the session expired
 * or was revoked). Returns a function that removes the handler again.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

/**
 * A failed call as the client sees it: the server's envelope plus the HTTP
 * status (null when the server couldn't be reached), so callers can tell
 * "not found" from other failures.
 */
export type ClientFailure = ApiFailure & { httpStatus: number | null };

/** What every request resolves to; assignable to ApiResponse<T>. */
export type ApiResult<T> = ApiSuccess<T> | ClientFailure;

function failure(message: string, httpStatus: number | null = null): ClientFailure {
  return { success: false, data: null, message, httpStatus };
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

interface SendOptions extends RequestOptions {
  /** Passed to fetch; the conditional GET opts out of the browser cache. */
  cache?: RequestCache;
}

/**
 * The shared fetch step: same-origin /api, JSON headers, the session cookie,
 * and the "session expired" hook on 401. Resolves to the Response, or to an
 * ApiFailure when the server can't be reached. Only aborts are re-thrown.
 */
async function send(
  method: HttpMethod,
  path: string,
  { body, headers, signal, cache }: SendOptions = {},
): Promise<Response | ClientFailure> {
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
      credentials: 'include',
      signal: signal ?? null,
      ...(cache ? { cache } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failure('Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && !SESSION_PROBE_PATHS.has(path)) {
    unauthorizedHandler?.();
  }
  return response;
}

/** Reads the ApiResponse envelope, or explains why there isn't one. */
async function toApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  const payload = await readJson(response);
  if (isApiResponse(payload)) {
    // The envelope is validated at runtime; the shape of `data` is the
    // endpoint's contract, described by T.
    const body = payload as ApiResponse<T>;
    return body.success ? body : { ...body, httpStatus: response.status };
  }
  return failure(
    response.ok
      ? 'The server returned an unexpected response.'
      : `Request failed with status ${response.status}.`,
    response.status,
  );
}

/**
 * Typed fetch wrapper. Always resolves to an ApiResponse — network failures and
 * non-envelope responses become ApiFailure — so callers narrow on `success`
 * instead of wrapping every call in try/catch. Only aborts are re-thrown.
 *
 * The session lives in an httpOnly cookie that the browser attaches itself
 * (`credentials: 'include'`); no token is ever handled by JavaScript.
 */
export async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const response = await send(method, path, options);
  return response instanceof Response ? toApiResponse<T>(response) : response;
}

/** Result of a conditional GET, narrowed on `kind`. */
export type ConditionalResult<T> =
  | { kind: 'modified'; data: T; etag: string | null }
  | { kind: 'not-modified' }
  | { kind: 'failed'; message: string };

/**
 * GET with If-None-Match: when the resource still has `etag`, the server
 * answers 304 with no body and nothing needs to change. The browser cache is
 * bypassed (`no-store`) so a 304 reaches this code instead of being turned
 * into a cached 200.
 */
export async function getConditional<T>(
  path: string,
  etag: string | null,
  { signal }: Pick<RequestOptions, 'signal'> = {},
): Promise<ConditionalResult<T>> {
  const response = await send('GET', path, {
    signal,
    cache: 'no-store',
    headers: etag ? { 'If-None-Match': etag } : {},
  });
  if (!(response instanceof Response)) {
    return { kind: 'failed', message: response.message };
  }
  if (response.status === 304) {
    return { kind: 'not-modified' };
  }
  const body = await toApiResponse<T>(response);
  return body.success
    ? { kind: 'modified', data: body.data, etag: response.headers.get('ETag') }
    : { kind: 'failed', message: body.message };
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
