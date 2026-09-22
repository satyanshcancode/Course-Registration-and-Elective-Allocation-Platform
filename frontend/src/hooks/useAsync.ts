import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { isAbortError } from '../api/apiClient';
import type { AsyncState } from '../types/asyncState';

export type AsyncTask<T> = (signal: AbortSignal) => Promise<T>;

export interface UseAsyncOptions {
  /** Start on mount (default true). Otherwise the state stays 'idle' until run(). */
  immediate?: boolean;
  /** Changing this value re-runs the task (e.g. a search term or page number). */
  key?: string | number | boolean | null;
}

export interface AsyncResource<T> {
  state: AsyncState<T>;
  /** Starts (or restarts) the task, aborting any request still in flight. */
  run: () => void;
  /** Same as run(); named for error states' "Retry" buttons. */
  retry: () => void;
  /** Aborts and returns to 'idle'. */
  reset: () => void;
}

interface Settled<T> {
  token: string;
  state: AsyncState<T>;
}

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

/**
 * Runs an async task and tracks it as a discriminated union
 * ('idle' | 'loading' | 'success' | 'error').
 *
 * Every run gets its own AbortController: a newer run, a changed `key` or
 * unmounting aborts the previous one, and results of aborted runs are ignored,
 * so no state is ever set after unmount. "Loading" is derived (the latest run
 * has not settled yet) rather than set, which keeps the effect free of
 * synchronous state updates.
 */
export function useAsync<T>(task: AsyncTask<T>, options: UseAsyncOptions = {}): AsyncResource<T> {
  const { immediate = true, key = null } = options;
  const [attempt, setAttempt] = useState(immediate ? 1 : 0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const token = `${attempt}|${String(key)}`;

  // Always calls the latest `task` without making it an effect dependency.
  const runTask = useEffectEvent((signal: AbortSignal) => task(signal));

  useEffect(() => {
    if (attempt === 0) {
      return undefined;
    }
    const controller = new AbortController();
    runTask(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSettled({ token, state: { status: 'success', data } });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setSettled({ token, state: { status: 'error', message: messageOf(error) } });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [attempt, token]);

  const run = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const reset = useCallback(() => {
    setAttempt(0);
    setSettled(null);
  }, []);

  let state: AsyncState<T>;
  if (attempt === 0) {
    state = { status: 'idle' };
  } else if (settled?.token === token) {
    state = settled.state;
  } else {
    state = { status: 'loading' };
  }

  return { state, run, retry: run, reset };
}
