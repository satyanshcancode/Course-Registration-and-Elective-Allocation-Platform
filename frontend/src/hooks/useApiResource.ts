import type { ApiResponse } from '@course-reg/shared';
import { useCallback, useEffect, useState } from 'react';
import { isAbortError } from '../api/apiClient';
import type { AsyncState } from '../types/asyncState';

export type ResourceLoader<T> = (signal: AbortSignal) => Promise<ApiResponse<T>>;

export interface ApiResource<T> {
  state: AsyncState<T>;
  retry: () => void;
}

/**
 * Loads an API resource on mount and on retry, cancelling stale requests.
 * `load` must be stable (a module-level function or memoised callback).
 */
export function useApiResource<T>(load: ResourceLoader<T>): ApiResource<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal)
      .then((response) => {
        setState(
          response.success
            ? { status: 'success', data: response.data }
            : { status: 'error', message: response.message },
        );
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setState({ status: 'error', message: 'Something went wrong. Please try again.' });
        }
      });

    return () => {
      controller.abort();
    };
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  return { state, retry };
}
