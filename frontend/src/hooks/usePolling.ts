import { useEffect, useEffectEvent } from 'react';

export interface UsePollingOptions {
  /** Poll only while true (default true). */
  enabled?: boolean;
  /** Also run once straight away (default false). */
  immediate?: boolean;
}

function isPageVisible(): boolean {
  return document.visibilityState !== 'hidden';
}

/**
 * Calls `callback` every `intervalMs` while the tab is visible. Hidden tabs
 * don't poll at all; when the tab becomes visible again it polls at once, so
 * data (e.g. live seat counts) is fresh the moment the student looks. A slow
 * async callback is never started twice at the same time.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, immediate = false }: UsePollingOptions = {},
): void {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;

    const tick = () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      void Promise.resolve()
        .then(() => onTick())
        .finally(() => {
          inFlight = false;
        });
    };
    const start = () => {
      timer ??= setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const handleVisibilityChange = () => {
      if (isPageVisible()) {
        tick();
        start();
      } else {
        stop();
      }
    };

    if (isPageVisible()) {
      if (immediate) {
        tick();
      }
      start();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, immediate, intervalMs]);
}
