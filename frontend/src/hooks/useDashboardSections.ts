/**
 * Loads several independent dashboard sections at once with
 * `Promise.allSettled`, so one failing request doesn't blank the page: the
 * section that failed shows its own error and a Retry button, and the others
 * render normally.
 *
 * `Promise.all` would reject as soon as any one request did, leaving the whole
 * dashboard as a single error page (see docs/javascript-concepts.md).
 */
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { isAbortError } from '../api/apiClient';
import type { AsyncState } from '../types/asyncState';

export type SectionStates<T extends Record<string, unknown>> = {
  [K in keyof T]: AsyncState<T[K]>;
};

export type SectionLoaders<T extends Record<string, unknown>> = {
  [K in keyof T]: (signal: AbortSignal) => Promise<T[K]>;
};

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

export interface DashboardSections<T extends Record<string, unknown>> {
  sections: SectionStates<T>;
  /** Re-runs one section, leaving the others as they are. */
  retry: (key: keyof T) => void;
}

export function useDashboardSections<T extends Record<string, unknown>>(
  loaders: SectionLoaders<T>,
): DashboardSections<T> {
  // The set of sections is fixed for the life of the dashboard.
  const [keys] = useState(() => Object.keys(loaders) as (keyof T)[]);
  const [sections, setSections] = useState<SectionStates<T>>(
    () => Object.fromEntries(keys.map((key) => [key, { status: 'loading' }])) as SectionStates<T>,
  );
  // Which sections to load; a new array identity starts a new run.
  const [request, setRequest] = useState<readonly (keyof T)[]>(keys);

  // Always uses the latest loaders without re-running for each render's copy.
  const runLoaders = useEffectEvent((running: readonly (keyof T)[], signal: AbortSignal) =>
    Promise.allSettled(running.map((key) => loaders[key](signal))),
  );

  useEffect(() => {
    const controller = new AbortController();
    void runLoaders(request, controller.signal).then((settled) => {
      if (controller.signal.aborted) {
        return;
      }
      setSections((current) => {
        const next = { ...current };
        settled.forEach((result, index) => {
          const key = request[index];
          if (key === undefined) {
            return;
          }
          if (result.status === 'fulfilled') {
            next[key] = { status: 'success', data: result.value };
          } else if (!isAbortError(result.reason)) {
            next[key] = { status: 'error', message: messageOf(result.reason) };
          }
        });
        return next;
      });
    });
    return () => {
      controller.abort();
    };
  }, [request]);

  const retry = useCallback((key: keyof T) => {
    setSections((current) => ({ ...current, [key]: { status: 'loading' } }));
    setRequest([key]);
  }, []);

  return { sections, retry };
}
